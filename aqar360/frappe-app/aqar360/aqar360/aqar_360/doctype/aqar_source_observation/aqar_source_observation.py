import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

from aqar360.core.provenance import freshness_status


class AqarSourceObservation(Document):
    def validate(self):
        if self.first_seen and self.last_seen and getdate(self.last_seen) < getdate(self.first_seen):
            frappe.throw(_("Last seen cannot be before first seen."))
        if self.last_verified and not self.verified_by:
            self.verified_by = frappe.session.user
        self.freshness_status = freshness_status(self.last_verified, self.reverify_after_days)
