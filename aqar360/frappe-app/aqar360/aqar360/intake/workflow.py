"""Native Frappe Workflow for opportunity qualification (§2.2): Submitted → Under Review → decision."""
import frappe

WORKFLOW = "Aqar Opportunity Review"
STATES = (("Submitted", "Info"), ("Under Review", "Primary"), ("Need More Info", "Warning"),
    ("Adjustment Suggested", "Warning"), ("Accepted", "Success"), ("Not Selected", "Danger"))
EDITORS = ("Aqar Opportunity Staff", "Aqar Team Lead", "Aqar Manager")
TRANSITIONS = (
    ("Submitted", "Start Review", "Under Review"),
    ("Under Review", "Request Info", "Need More Info"),
    ("Under Review", "Suggest Adjustment", "Adjustment Suggested"),
    ("Under Review", "Accept", "Accepted"),
    ("Under Review", "Decline", "Not Selected"),
    ("Need More Info", "Resume Review", "Under Review"),
    ("Adjustment Suggested", "Resume Review", "Under Review"),
)
# A decline must carry an internal reason; the customer never sees it.
CONDITIONS = {"Decline": "doc.internal_decline_reason"}


def ensure_review_workflow():
    for state, style in STATES:
        if not frappe.db.exists("Workflow State", state):
            frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": state,
                "style": style}).insert(ignore_permissions=True)
    for action in dict.fromkeys(t[1] for t in TRANSITIONS):
        if not frappe.db.exists("Workflow Action Master", action):
            frappe.get_doc({"doctype": "Workflow Action Master",
                "workflow_action_name": action}).insert(ignore_permissions=True)
    workflow = (frappe.get_doc("Workflow", WORKFLOW) if frappe.db.exists("Workflow", WORKFLOW)
        else frappe.get_doc({"doctype": "Workflow", "workflow_name": WORKFLOW}))
    workflow.update({"document_type": "Aqar Opportunity Intake", "workflow_state_field": "review_status",
        "is_active": 1, "send_email_alert": 0, "override_status": 0})
    workflow.set("states", [{"state": state, "doc_status": "0", "allow_edit": role}
        for state, _style in STATES for role in EDITORS])
    workflow.set("transitions", [{"state": state, "action": action, "next_state": next_state,
        "allowed": role, "allow_self_approval": 1, "condition": CONDITIONS.get(action)}
        for state, action, next_state in TRANSITIONS for role in EDITORS])
    workflow.save(ignore_permissions=True)
