import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime

from aqar360.intake.notify import send_customer_message
from aqar360.intake.status import label
from aqar360.registry.lifecycle import register_property_from_intake

SCORE_FIELDS = ("score_current_demand", "score_price_realism", "score_asset_quality",
    "score_production_ease", "score_expected_value", "score_conversion", "score_documents")
# review_status → (customer status key, customer message key)
CUSTOMER_STATUS = {
    "Submitted": ("under_review", None), "Under Review": ("under_review", None),
    "Need More Info": ("need_more_info", "need_more_info"),
    "Adjustment Suggested": ("adjustment_suggested", "adjustment_suggested"),
    "Accepted": ("accepted", "accepted"), "Not Selected": ("not_selected", "not_selected"),
}


class AqarOpportunityIntake(Document):
    def validate(self):
        if self.is_new() and not self.accuracy_declaration:
            frappe.throw(_("The owner must confirm the information is accurate before submitting."))
        rated = [flt(self.get(f)) for f in SCORE_FIELDS if flt(self.get(f))]
        self.opportunity_score = round(sum(rated) / len(rated) * 100, 1) if rated else 0
        self.submitted_at = self.submitted_at or now_datetime()

    def on_update(self):
        if self.has_value_changed("review_status"):
            if self.review_status == "Accepted":
                register_property_from_intake(self)
            message = CUSTOMER_STATUS[self.review_status][1]
            if message:
                send_customer_message(self, message)

    def customer_view(self):
        language = self.language or "ar"
        return {
            "request_number": self.name, "request_type": "property",
            "status": label(CUSTOMER_STATUS[self.review_status][0], language),
            "intake_type": self.request_type, "property_type": self.property_type,
            "area": frappe.db.get_value("Aqar Area", self.area,
                "area_name_ar" if language == "ar" else "area_name_en") if self.area else None,
            "asking_price": self.asking_price,
        }
