"""Staff decisions on suggested matches (§4.3: the system suggests, the team approves before anything is sent)."""
import frappe
from frappe import _
from frappe.utils import now_datetime

from aqar360.core.audit import log_event
from aqar360.matching.engine import advance_request, current_supply_state

REVIEWERS = ("Aqar Opportunity Staff", "Aqar Team Lead", "Aqar Manager", "Aqar Admin", "System Manager")
SENIOR = ("Aqar Team Lead", "Aqar Manager", "Aqar Admin", "System Manager")
REJECTION_REASONS = ("Not Suitable", "Customer Not Interested", "Price", "Location", "Already Offered", "Other")
SEND_CHANNELS = ("Email", "WhatsApp", "Phone", "In Person")


@frappe.whitelist()
def update_match(match, action, reason=None, channel=None, notes=None):
    doc = frappe.get_doc("Aqar Match", match)
    doc.check_permission("write")
    roles = set(frappe.get_roles())
    if not roles & set(REVIEWERS):
        frappe.throw(_("Only the opportunity team can review matches."), frappe.PermissionError)

    if action == "review":
        _require(doc, ("Suggested",))
        doc.status, doc.reviewed_by = "Team Reviewed", frappe.session.user
    elif action == "approve":
        _require(doc, ("Suggested", "Team Reviewed"))
        supply = current_supply_state(doc)
        if supply.state == "excluded":
            frappe.throw(_("The property or project is no longer available."))
        if not supply.verified:
            frappe.throw(_("Verify the property or project (price and availability) before approving this match."))
        if supply.visibility == "Off-Market Confidential" and not roles & set(SENIOR):
            frappe.throw(_("Off-market opportunities need a team lead or manager to approve."), frappe.PermissionError)
        doc.status, doc.approved_by, doc.approved_on = "Approved", frappe.session.user, now_datetime()
        doc.reviewed_by = doc.reviewed_by or frappe.session.user
    elif action == "reject":
        _require(doc, ("Suggested", "Team Reviewed", "Approved"))
        if reason not in REJECTION_REASONS:
            frappe.throw(_("Choose a rejection reason."))
        doc.status, doc.rejection_reason = "Rejected", reason
    elif action == "mark_sent":
        _require(doc, ("Approved",))
        if channel not in SEND_CHANNELS:
            frappe.throw(_("Choose how the opportunity was shared."))
        if current_supply_state(doc).state == "excluded":
            frappe.throw(_("The property or project is no longer available."))
        doc.status, doc.sent_channel, doc.sent_on = "Sent", channel, now_datetime()
    else:
        frappe.throw(_("Unknown action."))

    if notes:
        doc.staff_notes = notes
    doc.flags.aqar_status_change = True
    doc.save()
    log_event("Match " + doc.status, "Aqar Match", doc.name, after={"status": doc.status,
        "reason": doc.rejection_reason, "channel": doc.sent_channel})
    if doc.status == "Team Reviewed":
        advance_request(doc.search_request, "Team Reviewed")
    elif doc.status == "Sent":
        advance_request(doc.search_request, "Client Contacted")
    return doc.status


def _require(doc, statuses):
    if doc.status not in statuses:
        frappe.throw(_("This match is {0}; that action is not available.").format(_(doc.status)))
