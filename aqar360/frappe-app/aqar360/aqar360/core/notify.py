"""Staff bell notifications (Notification Log). Customer messages go through the outbox (M9), never here."""
import frappe

OPPORTUNITY_ROLES = ("Aqar Opportunity Staff", "Aqar Team Lead", "Aqar Manager")


def users_with_roles(roles):
    users = frappe.get_all("Has Role", filters={"role": ["in", list(roles)], "parenttype": "User"},
        pluck="parent", distinct=True)
    return [u for u in users if u not in ("Administrator", "Guest") and frappe.db.get_value("User", u, "enabled")]


def notify_users(users, doctype, name, subject):
    from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
    users = sorted({u for u in users if u})
    if users:
        enqueue_create_notification(users, {"type": "Alert", "document_type": doctype, "document_name": name,
            "subject": subject, "from_user": "Administrator"})
    return users


def notify_owner_or_team(owner, doctype, name, subject):
    """The record's owner if it has one, otherwise the whole opportunity team."""
    return notify_users([owner] if owner else users_with_roles(OPPORTUNITY_ROLES), doctype, name, subject)
