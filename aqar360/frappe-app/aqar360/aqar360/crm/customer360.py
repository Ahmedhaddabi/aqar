"""Customer 360 (§26.2): one view of a person across requests, supply, work, money, consent and documents.

Every list uses frappe.get_list, so a staff member only sees records (and document classifications) their
role allows.
"""
from pathlib import Path

import frappe
from frappe import _
from frappe.utils import cstr, flt

from aqar360.core.consent import has_consent

CONSENT_PURPOSES = ("Request Updates", "Match Alerts", "Marketing", "Ads Personalization")
CONSENT_CHANNELS = ("Email", "WhatsApp", "Phone")


def _list(doctype, filters, fields, order_by="creation desc", limit=50):
    if not frappe.has_permission(doctype, "read"):
        return []
    return frappe.get_list(doctype, filters=filters, fields=fields, order_by=order_by, limit_page_length=limit)


def _customers(contact):
    return [l.link_name for l in frappe.get_doc("Contact", contact).links if l.link_doctype == "Customer"]


@frappe.whitelist()
def get_customer_360(contact):
    frappe.has_permission("Contact", "read", contact, throw=True)
    person = frappe.get_doc("Contact", contact)
    requests = _list("Aqar Search Request", {"contact": contact}, ["name", "status", "purpose", "property_type",
        "budget_max", "assigned_to", "source_channel", "submitted_at", "first_response_at", "interested_doctype",
        "interested_in", "interested_unit"])
    from aqar360.aqar_360.report.aqar_daily_workbench.aqar_daily_workbench import interest_label
    for r in requests:
        r.asked_about = interest_label(r)
    request_names = [r.name for r in requests]
    customers = _customers(contact)
    invoices = _list("Sales Invoice", {"customer": ["in", customers or [""]], "docstatus": 1},
        ["name", "posting_date", "grand_total", "outstanding_amount", "status"])
    data = {
        "profile": {
            "name": person.full_name or person.name, "emails": [e.email_id for e in person.email_ids],
            "phones": [p.phone for p in person.phone_nos], "customers": customers, "user": person.user,
            "possible_duplicates": sorted({r.duplicate_candidate for dt in ("Aqar Search Request", "Aqar Opportunity Intake",
                "Aqar Consultation Request") for r in frappe.get_all(dt, filters={"contact": contact,
                "duplicate_review": "Needs Review"}, fields=["duplicate_candidate"]) if r.duplicate_candidate}),
        },
        "requests": requests,
        "matches": _list("Aqar Match", {"search_request": ["in", request_names or [""]]}, ["name", "search_request",
            "status", "score", "match_type", "supply_label", "price"], order_by="score desc", limit=30),
        "viewings": _list("Aqar Viewing", {"search_request": ["in", request_names or [""]]}, ["name", "status",
            "scheduled_at", "supply_label", "outcome", "not_suitable_reason"], order_by="scheduled_at desc"),
        "offers": _list("Aqar Offer", {"search_request": ["in", request_names or [""]]}, ["name", "status",
            "offered_amount", "final_amount", "supply_label"]),
        "intakes": _list("Aqar Opportunity Intake", {"contact": contact}, ["name", "review_status", "request_type",
            "property_type", "asking_price", "property", "submitted_at"]),
        "consultations": _list("Aqar Consultation Request", {"contact": contact}, ["name", "status", "asset_type",
            "client_goal", "submitted_at"]),
        "properties": _list("Property", {"custom_aqar_owner_contact": contact}, ["name", "property_name",
            "custom_aqar_sales_availability", "custom_aqar_verification_status"]),
        "content_orders": _list("Aqar Content Order", {"contact": contact}, ["name", "title", "status",
            "payment_status", "services_total", "media_budget"]),
        "invoices": invoices,
        "documents": _list("Aqar Document", {"contact": contact}, ["name", "title", "document_type",
            "classification", "scan_status"]),
        "consents": [{"purpose": p, "channel": c, "granted": has_consent(contact, p, c)}
            for p in CONSENT_PURPOSES for c in CONSENT_CHANNELS],
        "totals": {"invoiced": sum(flt(i.grand_total) for i in invoices),
            "outstanding": sum(flt(i.outstanding_amount) for i in invoices)},
    }
    data["timeline"] = _timeline(contact, data)
    return data


def _timeline(contact, data):
    events = []
    for key, doctype, time_field, label in (
            ("requests", "Aqar Search Request", "submitted_at", "status"), ("intakes", "Aqar Opportunity Intake",
            "submitted_at", "review_status"), ("consultations", "Aqar Consultation Request", "submitted_at", "status"),
            ("viewings", "Aqar Viewing", "scheduled_at", "status")):
        for row in data[key]:
            events.append({"time": cstr(row.get(time_field)), "doctype": doctype, "name": row.name,
                "summary": _(row.get(label) or "")})
    if frappe.has_permission("Aqar Audit Event", "read"):
        refs = [("Contact", contact)] + [(dt, r.name) for key, dt in (("requests", "Aqar Search Request"),
            ("intakes", "Aqar Opportunity Intake"), ("content_orders", "Aqar Content Order")) for r in data[key]]
        for doctype, name in refs:
            for row in frappe.get_all("Aqar Audit Event", filters={"reference_doctype": doctype, "reference_name": name},
                    fields=["event_time", "action", "actor"], limit=50):
                events.append({"time": cstr(row.event_time), "doctype": doctype, "name": name,
                    "summary": f"{_(row.action)} · {row.actor}"})
    return sorted(events, key=lambda e: e["time"], reverse=True)[:100]


@frappe.whitelist()
def render_customer_360(contact):
    """HTML for the Contact form's Customer 360 dialog."""
    template = (Path(__file__).parent / "customer360.html").read_text(encoding="utf-8")
    return frappe.render_template(template, {"d": get_customer_360(contact)})


def contact_dashboard(data):
    """Connections panel on the Contact form."""
    data = frappe._dict(data or {})
    data.fieldname = data.get("fieldname") or "contact"
    data.non_standard_fieldnames = {**(data.get("non_standard_fieldnames") or {}),
        "Property": "custom_aqar_owner_contact", "CRM Lead": "custom_aqar_contact"}
    data.transactions = [*(data.get("transactions") or []),
        {"label": _("Requests"), "items": ["Aqar Search Request", "Aqar Opportunity Intake", "Aqar Consultation Request"]},
        {"label": _("Work"), "items": ["Aqar Content Order", "Property", "Aqar Document"]},
        {"label": _("Consent"), "items": ["Aqar Consent Log", "Aqar Terms Acceptance"]}]
    return data
