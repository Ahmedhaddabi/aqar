import frappe
from frappe import _
from frappe.model.document import Document


class AqarApprovalRule(Document):
    def validate(self):
        if not frappe.get_meta(self.applies_to).has_field(self.watched_field):
            frappe.throw(_("{0} has no field {1}.").format(self.applies_to, self.watched_field))
