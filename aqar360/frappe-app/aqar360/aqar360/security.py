import frappe
from frappe import _


@frappe.whitelist()
def legacy_portal_disabled(**kwargs):
    frappe.throw(
        _("This legacy portal action is disabled. Please contact the Aqar team for assistance."),
        frappe.PermissionError,
    )

