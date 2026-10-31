import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, flt, now_datetime, today

from aqar360.intake.status import label

CUSTOMER_STATUS = {
    "Active Request": "searching", "Searching": "searching", "Potential Match": "searching",
    "Team Reviewed": "searching", "Client Contacted": "contacted", "Viewing": "viewing",
    "Interested": "feedback", "Not Suitable": "feedback", "Offer": "offer", "Closed": "closed",
    "Paused": "paused",
}


class AqarSearchRequest(Document):
    def validate(self):
        if self.budget_min and self.budget_max and flt(self.budget_min) > flt(self.budget_max):
            frappe.throw(_("Budget From cannot be higher than Budget To."))
        if not 0 <= flt(self.budget_tolerance_pct) <= 100:
            frappe.throw(_("Near-match tolerance must be between 0 and 100%."))
        if self.size_min_sqm and self.size_max_sqm and flt(self.size_min_sqm) > flt(self.size_max_sqm):
            frappe.throw(_("Size From cannot be larger than Size To."))
        self.expires_on = self.expires_on or add_days(today(), 90)
        self.submitted_at = self.submitted_at or now_datetime()

    def customer_view(self):
        language = self.language or "ar"
        name_field = "area_name_ar" if language == "ar" else "area_name_en"
        return {
            "request_number": self.name, "request_type": "search",
            "status": label(CUSTOMER_STATUS[self.status], language),
            "purpose": self.purpose, "property_type": self.property_type,
            "areas": [frappe.db.get_value("Aqar Area", row.area, name_field) for row in self.areas],
            "budget_min": self.budget_min, "budget_max": self.budget_max,
            "strict_budget": not flt(self.budget_tolerance_pct), "timing": self.timing,
            "bedrooms_min": self.bedrooms_min, "notes": self.notes,
            "alerts_paused": bool(self.alerts_paused), "expires_on": str(self.expires_on),
        }
