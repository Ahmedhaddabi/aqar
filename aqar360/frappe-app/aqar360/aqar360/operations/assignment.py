"""Request ownership (§26.1: every stage has a responsible owner). Round-robin among opportunity staff."""
import frappe
from frappe import _

from aqar360.core.audit import log_event
from aqar360.core.notify import users_with_roles

ASSIGNEE_ROLE = "Aqar Opportunity Staff"
ASSIGNEE_ROLES = {"Aqar Content Order": "Aqar Content Coordinator"}


def _next_user(doctype):
    users = sorted(users_with_roles((ASSIGNEE_ROLES.get(doctype, ASSIGNEE_ROLE),)))
    if not users:
        return None
    key = "aqar_round_robin_" + frappe.scrub(doctype)
    last = frappe.defaults.get_global_default(key)
    chosen = users[(users.index(last) + 1) % len(users)] if last in users else users[0]
    frappe.defaults.set_global_default(key, chosen)
    return chosen


def refresh_modified(doc):
    """Assignments and to-dos write back to the record; keep the in-memory copy (returned to the form) current."""
    doc.modified = frappe.db.get_value(doc.doctype, doc.name, "modified")


def _todo(doc, user):
    from frappe.desk.form.assign_to import _add
    _add({"assign_to": [user], "doctype": doc.doctype, "name": doc.name,
        "description": _("{0} {1}: {2}").format(_(doc.doctype), doc.name, doc.get("submitted_name") or "")},
        ignore_permissions=True)
    refresh_modified(doc)


def auto_assign(doc, method=None):
    """after_insert: keep a staff-chosen owner, otherwise assign round-robin when enabled."""
    if not doc.get("assigned_to"):
        if not frappe.db.get_single_value("Aqar Platform Settings", "auto_assign_requests"):
            return
        doc.assigned_to = _next_user(doc.doctype)
    if doc.assigned_to:
        _todo(doc, doc.assigned_to)


def on_reassign(doc, method=None):
    """on_update: moving a request to another owner closes the previous owner's to-do."""
    before = doc.get_doc_before_save()
    if not before or before.get("assigned_to") == doc.get("assigned_to"):
        return
    for todo in frappe.get_all("ToDo", pluck="name", filters={"reference_type": doc.doctype,
            "reference_name": doc.name, "status": "Open", "allocated_to": ["!=", doc.get("assigned_to") or ""]}):
        frappe.db.set_value("ToDo", todo, "status", "Cancelled")
    if doc.get("assigned_to"):
        _todo(doc, doc.assigned_to)
    log_event("Reassigned", doc.doctype, doc.name, before={"assigned_to": before.get("assigned_to")},
        after={"assigned_to": doc.get("assigned_to")})
