import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from aqar360.intake.status import label

CUSTOMER_STATUS = {
    "New": "under_review", "Scoping": "under_review", "Quoted": "in_progress",
    "In Progress": "in_progress", "Delivered": "delivered", "Closed": "closed", "Declined": "not_selected",
}


class AqarConsultationRequest(Document):
    def validate(self):
        if self.map_link and not self.map_link.startswith("https://"):
            frappe.throw(_("The map link must be a full https:// link."))
        self.submitted_at = self.submitted_at or now_datetime()

    def customer_view(self):
        language = self.language or "ar"
        return {
            "request_number": self.name, "request_type": "consultation",
            "status": label(CUSTOMER_STATUS[self.status], language),
            "asset_type": self.asset_type, "client_goal": self.client_goal,
            "requested_output": self.requested_output,
        }
