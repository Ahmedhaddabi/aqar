import frappe
from frappe import _
from frappe.utils import now_datetime

from aqar360.core.append_only import AppendOnlyDocument


class AqarTermsAcceptance(AppendOnlyDocument):
    def validate(self):
        super().validate()
        if not (self.contact or self.user):
            frappe.throw(_("A terms acceptance must identify the contact or user."))
        if frappe.db.get_value("Aqar Terms Version", self.terms_version, "status") != "Approved":
            frappe.throw(_("Only approved terms can be accepted."))
        self.accepted_at = self.accepted_at or now_datetime()
