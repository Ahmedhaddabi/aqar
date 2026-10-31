import frappe
from frappe import _
from frappe.model.document import Document


class AqarMatch(Document):
    def validate(self):
        before = self.get_doc_before_save()
        if before and before.status != self.status and not self.flags.aqar_status_change:
            frappe.throw(_("Use the match actions (Review, Approve, Reject, Mark Sent) to change the status."))
