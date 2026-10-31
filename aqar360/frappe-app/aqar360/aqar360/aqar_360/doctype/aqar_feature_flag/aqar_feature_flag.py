import frappe
from frappe import _
from frappe.model.document import Document

from aqar360.core.flags import gate_is_open


class AqarFeatureFlag(Document):
    def validate(self):
        if self.enabled and not gate_is_open(self.required_gate):
            frappe.throw(_("{0} cannot be enabled until the {1} gate is approved.").format(self.flag_key, _(self.required_gate)))
        if self.audience == "Percentage of Users" and not 0 <= (self.rollout_percentage or 0) <= 100:
            frappe.throw(_("Rollout percentage must be between 0 and 100."))
