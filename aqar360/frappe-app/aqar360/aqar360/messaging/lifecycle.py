"""Smart customer lifecycle (Appendix F): reminders and follow-ups, all through the outbox rules.

Idempotency keys make every job safe to run repeatedly; follow-ups also respect consent, the weekly cap,
quiet hours and the customer's "stop alerts" choice.
"""
import frappe
from frappe.utils import add_days, add_to_date, cint, format_datetime, getdate, now_datetime, today

from aqar360.core import links
from aqar360.core.notify import OPPORTUNITY_ROLES, users_with_roles
from aqar360.intake.notify import company_name, self_service_url
from aqar360.messaging.outbox import queue_message

ACTIVE = ("Active Request", "Searching", "Potential Match", "Team Reviewed", "Client Contacted", "Viewing",
    "Interested", "Not Suitable")
REQUEST_FIELDS = ["name", "contact", "submitted_email", "submitted_name", "language", "preferred_channel"]


def _lang(value):
    return value if value in ("ar", "en") else "ar"


def _request_message(key, req, idempotency_key, now=None, link=False, **context):
    language = _lang(req.language)
    if link:
        from aqar360.api.public import LINK_HOURS, SELF_SERVICE
        token = links.create_link(SELF_SERVICE, "Aqar Search Request", req.name, expires_in_hours=LINK_HOURS)
        context["link"] = self_service_url(token, language)
    return queue_message(key, recipient=req.submitted_email, language=language, contact=req.contact,
        reference_doctype="Aqar Search Request", reference_name=req.name, idempotency_key=idempotency_key,
        preferred_channel=req.preferred_channel or "Email", now=now,
        context={"person": req.submitted_name, "request_number": req.name, "company": company_name(language), **context})


def send_viewing_reminders(now=None):
    """Hourly: viewings in the next 24 hours (F.2). A rescheduled viewing gets a new reminder."""
    now = now or now_datetime()
    for viewing in frappe.get_all("Aqar Viewing", fields=["name", "search_request", "scheduled_at", "supply_label"],
            filters={"status": ["in", ["Scheduled", "Confirmed"]], "scheduled_at": ["between", [now, add_to_date(now, hours=24)]]}):
        req = frappe.db.get_value("Aqar Search Request", viewing.search_request, REQUEST_FIELDS, as_dict=True)
        language = _lang(req.language)
        queue_message("viewing_reminder", recipient=req.submitted_email, language=language, contact=req.contact,
            reference_doctype="Aqar Viewing", reference_name=viewing.name, now=now,
            idempotency_key=f"viewing_reminder:{viewing.name}:{viewing.scheduled_at}", preferred_channel=req.preferred_channel,
            context={"person": req.submitted_name, "company": company_name(language), "property": viewing.supply_label,
                "viewing_time": format_datetime(viewing.scheduled_at, "dd-MM-yyyy HH:mm")})


def send_still_searching(now=None):
    """Daily: one gentle check-in after a quiet period without contact (F.2, F.4: every 7–14 days at most)."""
    now = now or now_datetime()
    days = cint(frappe.db.get_single_value("Aqar Platform Settings", "still_searching_days") or 14)
    cutoff = add_days(now, -days)
    for req in frappe.get_all("Aqar Search Request", fields=REQUEST_FIELDS, filters={"status": ["in", ACTIVE],
            "alerts_paused": 0, "creation": ["<=", cutoff], "expires_on": [">=", today()]}):
        recent = frappe.db.exists("Aqar Outbox", {"reference_doctype": "Aqar Search Request", "reference_name": req.name,
            "status": ["in", ["Queued", "Sent", "Delivered"]], "creation": [">", cutoff]})
        if not recent:
            _request_message("still_searching", req, f"still_searching:{req.name}:{getdate(now)}", now=now, link=True)


def send_expiry_notices(now=None):
    """Daily: renew before a request lapses (F.3 item 6); updating the request extends it."""
    now = now or now_datetime()
    for req in frappe.get_all("Aqar Search Request", fields=[*REQUEST_FIELDS, "expires_on"], filters={
            "status": ["in", ACTIVE], "expires_on": ["between", [getdate(now), add_days(getdate(now), 7)]]}):
        _request_message("request_expiring", req, f"request_expiring:{req.name}:{req.expires_on}", now=now, link=True,
            due_date=str(req.expires_on))


def _contact_email(contact):
    return frappe.db.get_value("Contact", contact, "email_id") if contact else None


def send_payment_reminders(now=None):
    """Daily: overdue content invoices, at most once a week each."""
    now = now or now_datetime()
    year, week, _day = getdate(now).isocalendar()
    for inv in frappe.get_all("Sales Invoice", fields=["name", "outstanding_amount", "due_date", "custom_aqar_content_order"],
            filters={"docstatus": 1, "outstanding_amount": [">", 0], "due_date": ["<", getdate(now)],
                "custom_aqar_content_order": ["is", "set"]}):
        order = frappe.db.get_value("Aqar Content Order", inv.custom_aqar_content_order, ["contact", "language"], as_dict=True)
        language = _lang(order.language)
        queue_message("payment_reminder", recipient=_contact_email(order.contact), language=language, contact=order.contact,
            reference_doctype="Sales Invoice", reference_name=inv.name, now=now,
            idempotency_key=f"payment_reminder:{inv.name}:{year}-{week}",
            context={"person": frappe.db.get_value("Contact", order.contact, "full_name"), "request_number": inv.name,
                "amount": f"{inv.outstanding_amount:.3f}", "due_date": str(inv.due_date), "company": company_name(language)})


def content_ready(doc, method=None):
    """on_update of Aqar Content Order: tell the client when work is ready for review (once per revision round)."""
    if not doc.has_value_changed("status") or doc.status != "Client Review":
        return
    language = _lang(doc.language)
    queue_message("content_ready", recipient=_contact_email(doc.contact), language=language, contact=doc.contact,
        reference_doctype=doc.doctype, reference_name=doc.name, idempotency_key=f"content_ready:{doc.name}:{cint(doc.revisions_used)}",
        context={"person": frappe.db.get_value("Contact", doc.contact, "full_name"), "order": doc.name,
            "company": company_name(language)})


SUMMARY = {
    "en": ("{0} to contact", "{0} overdue", "{0} matches to review", "{0} intakes to decide", "{0} content orders"),
    "ar": ("{0} للتواصل", "{0} متأخر", "{0} مطابقات للمراجعة", "{0} طلبات تسويق للقرار", "{0} طلبات محتوى"),
}


def send_staff_digest(now=None):
    """Daily staff digest (F.7 'daily report'): only users with open items receive it."""
    now = now or now_datetime()
    for user in users_with_roles((*OPPORTUNITY_ROLES, "Aqar Content Coordinator")):
        mine = frappe.get_all("Aqar Search Request", pluck="name",
            filters={"assigned_to": user, "status": ["not in", ["Closed", "Paused"]]})
        counts = (
            frappe.db.count("Aqar Search Request", {"assigned_to": user, "first_response_at": ["is", "not set"],
                "status": ["not in", ["Closed", "Paused"]]}),
            frappe.db.count("Aqar SLA Timer", {"owner_user": user, "state": "Running", "rag": "Red"}),
            frappe.db.count("Aqar Match", {"search_request": ["in", mine or [""]], "status": ["in", ["Suggested", "Team Reviewed"]]}),
            frappe.db.count("Aqar Opportunity Intake", {"assigned_to": user, "review_status": ["in", ["Submitted", "Under Review"]]}),
            frappe.db.count("Aqar Content Order", {"assigned_to": user, "status": ["not in", ["Delivered", "Closed", "Cancelled"]]}),
        )
        if not any(counts):
            continue
        language = "ar" if (frappe.db.get_value("User", user, "language") or "").startswith("ar") else "en"
        summary = "، ".join(t.format(c) for t, c in zip(SUMMARY[language], counts) if c) if language == "ar" else \
            ", ".join(t.format(c) for t, c in zip(SUMMARY[language], counts) if c)
        queue_message("staff_daily_digest", recipient=user, language=language, reference_doctype="User",
            reference_name=user, idempotency_key=f"digest:{user}:{getdate(now)}", now=now,
            context={"person": frappe.db.get_value("User", user, "first_name"), "summary": summary,
                "company": company_name(language)})
