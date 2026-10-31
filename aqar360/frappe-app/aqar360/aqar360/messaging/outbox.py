"""Central outbox (§26.4, Appendix F): every message is recorded, consent-checked and deduplicated.

Rules (F.4): consent per purpose and channel; one record per idempotency key (no double sends, F.8 tests 2/6);
follow-ups and marketing respect quiet hours and a weekly cap; transactional confirmations are never delayed;
WhatsApp is used only when its Phase 2 flag is on, otherwise email. Delivery failures retry three times and
never block the business action that triggered the message (F.8 test 1).
"""
from datetime import datetime, timedelta

import frappe
from frappe.utils import add_to_date, cint, get_datetime, get_time, now_datetime

from aqar360.core.consent import has_consent
from aqar360.core.flags import is_enabled
from aqar360.messaging.templates import current_template, render

MAX_ATTEMPTS = 3
DELAYABLE = ("Follow-up", "Marketing")


def _settings():
    s = frappe.get_cached_doc("Aqar Platform Settings")
    return frappe._dict(quiet_start=get_time(s.get("quiet_hours_start") or "21:00:00"),
        quiet_end=get_time(s.get("quiet_hours_end") or "08:00:00"),
        weekly_cap=cint(s.get("max_followups_per_week") or 2))


def _after_quiet_hours(moment, settings):
    """The same moment if outside quiet hours, otherwise the next quiet-hours end."""
    t = moment.time()
    start, end = settings.quiet_start, settings.quiet_end
    quiet = (t >= start or t < end) if start > end else (start <= t < end)
    if not quiet:
        return moment
    day = moment.date() if t < end else moment.date() + timedelta(days=1)
    return datetime.combine(day, end)


def _suppression(contact, purpose, channel, category, settings, now):
    if category == "Staff":
        return None
    if not contact:
        return "No customer contact"
    if category in DELAYABLE and frappe.db.get_value("Contact", contact, "unsubscribed"):
        return "Contact unsubscribed"
    if not has_consent(contact, purpose, channel):
        return f"No {purpose} consent for {channel}"
    if category in DELAYABLE:
        sent = frappe.db.count("Aqar Outbox", {"contact": contact, "category": ["in", DELAYABLE],
            "status": ["in", ["Queued", "Sent", "Delivered"]], "creation": [">=", add_to_date(now, days=-7)]})
        if sent >= settings.weekly_cap:
            return f"Weekly follow-up cap reached ({settings.weekly_cap})"
    return None


def queue_message(key, *, recipient, language="ar", context=None, contact=None, reference_doctype=None,
        reference_name=None, idempotency_key=None, preferred_channel="Email", now=None):
    """Record and (when allowed) send one message. Returns the Aqar Outbox document."""
    now = get_datetime(now or now_datetime())
    idempotency_key = idempotency_key or f"{key}:{reference_doctype}:{reference_name}"
    existing = frappe.db.get_value("Aqar Outbox", {"idempotency_key": idempotency_key})
    if existing:
        return frappe.get_doc("Aqar Outbox", existing)
    channel = "WhatsApp" if preferred_channel == "WhatsApp" and is_enabled("whatsapp_messaging") else "Email"
    template = current_template(key, language or "ar", channel)
    if not template and channel == "WhatsApp":
        channel, template = "Email", current_template(key, language or "ar", "Email")
    settings = _settings()
    doc = frappe.get_doc({"doctype": "Aqar Outbox", "template_key": key, "channel": channel, "language": language,
        "recipient": recipient, "contact": contact, "reference_doctype": reference_doctype,
        "reference_name": reference_name, "idempotency_key": idempotency_key, "attempts": 0})
    if not template:
        doc.update({"status": "Skipped", "reason": f"No approved '{key}' template"})
    else:
        purpose = None if template.consent_purpose.startswith("Staff") else template.consent_purpose
        doc.update({"template": template.name, "category": template.category, "consent_purpose": purpose,
            "subject": render(template.subject, context or {}), "message": render(template.body, context or {})})
        reason = None if recipient else "No recipient address"
        reason = reason or _suppression(contact, purpose, channel, template.category, settings, now)
        if reason:
            doc.update({"status": "Suppressed", "reason": reason})
        else:
            scheduled = _after_quiet_hours(now, settings) if template.category in DELAYABLE else now
            doc.update({"status": "Queued", "scheduled_for": scheduled})
    doc.insert(ignore_permissions=True)
    if doc.status == "Queued" and get_datetime(doc.scheduled_for) <= now:
        deliver(doc)
    return doc


def _html(text):
    return (text or "").replace("\n", "<br>")


def deliver(doc):
    """Hand one queued message to the channel; failures are recorded and retried, never raised."""
    frappe.db.savepoint("aqar_outbox_deliver")
    try:
        if doc.channel != "Email":
            raise RuntimeError(f"{doc.channel} delivery is not connected yet")
        queue = frappe.sendmail(recipients=[doc.recipient], subject=doc.subject, message=_html(doc.message),
            reference_doctype=doc.reference_doctype, reference_name=doc.reference_name)
        doc.db_set({"status": "Sent", "sent_at": now_datetime(), "attempts": cint(doc.attempts) + 1,
            "email_queue": getattr(queue, "name", None), "reason": None})
    except Exception as error:
        frappe.db.rollback(save_point="aqar_outbox_deliver")
        attempts = cint(doc.attempts) + 1
        final = attempts >= MAX_ATTEMPTS
        doc.db_set({"status": "Failed" if final else "Queued", "attempts": attempts, "reason": str(error)[:500],
            "scheduled_for": add_to_date(now_datetime(), minutes=15 * attempts)})
        frappe.log_error(title="Aqar message delivery failed", reference_doctype=doc.reference_doctype,
            reference_name=doc.reference_name)
    return doc.status


def process_outbox():
    """Scheduler (every 5 minutes): send due messages, then mirror delivery results from the email queue."""
    now = now_datetime()
    for name in frappe.get_all("Aqar Outbox", pluck="name", limit=200, order_by="scheduled_for asc",
            filters={"status": "Queued", "scheduled_for": ["<=", now]}):
        deliver(frappe.get_doc("Aqar Outbox", name))
    for row in frappe.get_all("Aqar Outbox", fields=["name", "email_queue"], limit=500,
            filters={"status": "Sent", "email_queue": ["is", "set"]}):
        status = frappe.db.get_value("Email Queue", row.email_queue, "status")
        if status == "Sent":
            frappe.db.set_value("Aqar Outbox", row.name, "status", "Delivered")
        elif status == "Error":
            frappe.db.set_value("Aqar Outbox", row.name, {"status": "Failed", "reason": "Mail server rejected the message"})
