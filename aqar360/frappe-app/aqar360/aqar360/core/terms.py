import frappe
from frappe.utils import now_datetime

from aqar360.core.audit import log_event


def get_current_terms(policy_type, language):
    current = frappe.get_all("Aqar Terms Version",
        filters={"policy_type": policy_type, "language": language, "status": "Approved",
            "effective_from": ["<=", now_datetime()]},
        order_by="effective_from desc", limit=1, pluck="name")
    return current[0] if current else None


def record_acceptance(terms_version, channel, contact=None, user=None,
        reference_doctype=None, reference_name=None, evidence=None):
    request = getattr(frappe.local, "request", None)
    doc = frappe.get_doc({
        "doctype": "Aqar Terms Acceptance", "terms_version": terms_version, "channel": channel,
        "contact": contact, "user": user or (None if frappe.session.user == "Guest" else frappe.session.user),
        "reference_doctype": reference_doctype, "reference_name": reference_name, "evidence": evidence,
        "ip_address": getattr(frappe.local, "request_ip", None),
        "user_agent": request.headers.get("User-Agent") if request else None,
    }).insert(ignore_permissions=True)
    log_event("Terms Accepted", reference_doctype or "Aqar Terms Version",
        reference_name or terms_version, after={"acceptance": doc.name, "terms_version": terms_version})
    return doc.name
