import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_time


class AqarPlatformSettings(Document):
    def validate(self):
        if self.real_personal_data_allowed and self.legal_approval_status != "Approved":
            frappe.throw(_("Legal approval is required before real personal data is allowed."))
        if self.phase_2_enabled or self.phase_3_enabled or self.public_ai_enabled:
            frappe.throw(_("Later phases remain disabled until their review checkpoints are approved."))
        from aqar360.operations.business_time import DAY_NAMES
        self.work_days = self.work_days or "Sun,Mon,Tue,Wed,Thu"
        self.work_start = self.work_start or "08:00:00"
        self.work_end = self.work_end or "17:00:00"
        days = [d.strip()[:3].title() for d in self.work_days.split(",") if d.strip()]
        if not days or any(d not in DAY_NAMES for d in days):
            frappe.throw(_("Work days must be a comma-separated list such as Sun,Mon,Tue,Wed,Thu."))
        if self.work_start and self.work_end and get_time(self.work_end) <= get_time(self.work_start):
            frappe.throw(_("Work must end after it starts."))
