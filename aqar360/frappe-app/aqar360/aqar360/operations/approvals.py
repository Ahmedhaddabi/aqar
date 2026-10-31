"""Approval engine (§26.3): sensitive changes above a threshold need a named approver role.

Flow: a staff save that exceeds an active rule is blocked → request_change_approval() records the proposed
value → a user with the approver role decides → an approval applies the change. Approvers editing directly
are allowed and audited. Rules are records, so later milestones add discounts, refunds and expenses.
"""
import frappe
from frappe import _
from frappe.utils import flt, now_datetime

from aqar360.core.audit import log_event
from aqar360.core.notify import notify_users, users_with_roles


class ApprovalRequired(frappe.ValidationError):
    pass


def _rules(doctype, fieldname=None):
    filters = {"applies_to": doctype, "active": 1}
    if fieldname:
        filters["watched_field"] = fieldname
    return frappe.get_all("Aqar Approval Rule", filters=filters,
        fields=["name", "watched_field", "threshold_type", "threshold_value", "approver_role", "action"])


def exceeds(rule, old, new):
    old, new, limit = flt(old), flt(new), flt(rule.threshold_value)
    if rule.threshold_type == "Amount Above":
        return new > limit
    if not old:
        return False  # setting a first value is not a change to approve
    change = (new - old) / old * 100
    return -change > limit if rule.threshold_type == "Percent Decrease" else abs(change) > limit


def enforce_approval_rules(doc, method=None):
    """validate hook on governed DocTypes."""
    if doc.flags.aqar_approved:
        return
    before = doc.get_doc_before_save()
    roles = set(frappe.get_roles())
    for rule in _rules(doc.doctype):
        # Percent rules compare with the saved value; "Amount Above" also guards brand-new documents.
        if not before and rule.threshold_type != "Amount Above":
            continue
        old, new = (before.get(rule.watched_field) if before else 0), doc.get(rule.watched_field)
        if flt(old) == flt(new) or not exceeds(rule, old, new):
            continue
        label = _(doc.meta.get_label(rule.watched_field))
        if rule.approver_role in roles:
            log_event("Changed Within Own Approval Authority", doc.doctype, doc.name,
                before={rule.watched_field: old}, after={rule.watched_field: new, "rule": rule.name})
            continue
        frappe.throw(_("Changing {0} from {1} to {2} needs approval by {3}. Use Request Approval instead.").format(
            label, flt(old), flt(new), _(rule.approver_role)), ApprovalRequired)


@frappe.whitelist()
def request_change_approval(doctype, name, fieldname, proposed_value, note=None):
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("write")
    rules = [r for r in _rules(doctype, fieldname) if exceeds(r, doc.get(fieldname), proposed_value)]
    if not rules:
        frappe.throw(_("This change does not need approval; edit the record directly."))
    rule = rules[0]
    request = frappe.get_doc({"doctype": "Aqar Approval Request", "rule": rule.name, "action": rule.action,
        "reference_doctype": doctype, "reference_name": name, "fieldname": fieldname,
        "current_value": str(doc.get(fieldname) or ""), "proposed_value": str(proposed_value),
        "approver_role": rule.approver_role, "note": note, "status": "Pending",
        "requested_by": frappe.session.user}).insert(ignore_permissions=True)
    log_event("Approval Requested", doctype, name, after={"request": request.name, fieldname: proposed_value})
    notify_users(users_with_roles((rule.approver_role,)), "Aqar Approval Request", request.name,
        _("Approval needed: {0} {1} → {2}").format(name, _(doc.meta.get_label(fieldname)), proposed_value))
    return request.name


@frappe.whitelist()
def decide_approval(request, decision, note=None):
    req = frappe.get_doc("Aqar Approval Request", request)
    if req.status != "Pending":
        frappe.throw(_("This approval request has already been decided."))
    if req.approver_role not in frappe.get_roles():
        frappe.throw(_("Only {0} can decide this request.").format(_(req.approver_role)), frappe.PermissionError)
    if req.requested_by == frappe.session.user:
        frappe.throw(_("You cannot approve your own request."), frappe.PermissionError)
    if decision not in ("Approved", "Rejected"):
        frappe.throw(_("Choose Approved or Rejected."))
    if decision == "Approved":
        doc = frappe.get_doc(req.reference_doctype, req.reference_name)
        doc.set(req.fieldname, req.proposed_value)
        doc.flags.aqar_approved = True
        doc.save(ignore_permissions=True)
    req.flags.aqar_decision = True
    req.update({"status": decision, "decided_by": frappe.session.user, "decided_at": now_datetime(),
        "decision_note": note})
    req.save(ignore_permissions=True)
    log_event("Approval " + decision, req.reference_doctype, req.reference_name,
        after={"request": req.name, req.fieldname: req.proposed_value})
    notify_users([req.requested_by], "Aqar Approval Request", req.name,
        _("Your approval request {0} was {1}").format(req.name, _(decision).lower()))
    return decision
