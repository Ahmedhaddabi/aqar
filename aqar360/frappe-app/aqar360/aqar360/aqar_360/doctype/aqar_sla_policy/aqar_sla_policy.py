import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class AqarSLAPolicy(Document):
    def validate(self):
        if self.target_rule != "Same Business Day" and flt(self.target_value) <= 0:
            frappe.throw(_("Enter a target value greater than zero."))
        if not 0 < flt(self.amber_at_pct) < 100:
            frappe.throw(_("Amber must be between 1% and 99% of the target."))
