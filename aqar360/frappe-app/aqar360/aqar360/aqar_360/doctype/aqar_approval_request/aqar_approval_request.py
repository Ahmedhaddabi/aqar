import frappe
from frappe import _
from frappe.model.document import Document


class AqarApprovalRequest(Document):
    def validate(self):
        before = self.get_doc_before_save()
        if before and before.status != self.status and not self.flags.aqar_decision:
            frappe.throw(_("Use Approve or Reject to decide this request."))
