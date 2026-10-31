"""Purpose- and channel-specific consent; the latest row wins and withdrawal is a new row (§12.1, §18.3, F.4)."""
import frappe

from aqar360.core.audit import log_event

ALL_CHANNELS = "All Channels"


def record_consent(contact, purpose, channel, granted, source, terms_version=None, evidence=None):
    doc = frappe.get_doc({
        "doctype": "Aqar Consent Log", "contact": contact, "purpose": purpose, "channel": channel,
        "status": "Granted" if granted else "Withdrawn", "source": source,
        "terms_version": terms_version, "evidence": evidence,
    }).insert(ignore_permissions=True)
    log_event("Consent " + doc.status, "Contact", contact,
        after={"purpose": purpose, "channel": channel, "log": doc.name})
    return doc.name


def has_consent(contact, purpose, channel):
    latest = frappe.get_all("Aqar Consent Log",
        filters={"contact": contact, "purpose": purpose, "channel": ["in", [channel, ALL_CHANNELS]]},
        fields=["status"], order_by="recorded_at desc, creation desc", limit=1)
    return bool(latest) and latest[0].status == "Granted"
