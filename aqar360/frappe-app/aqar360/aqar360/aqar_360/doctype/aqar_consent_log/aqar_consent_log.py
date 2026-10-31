import frappe
from frappe import _
from frappe.utils import now_datetime

from aqar360.core.append_only import AppendOnlyDocument

WORDING_REQUIRED = ("Marketing", "Ads Personalization")


class AqarConsentLog(AppendOnlyDocument):
    def validate(self):
        super().validate()
        self.recorded_at = self.recorded_at or now_datetime()
        self.ip_address = self.ip_address or getattr(frappe.local, "request_ip", None)
        if self.status == "Granted" and self.purpose in WORDING_REQUIRED and not self.terms_version:
            frappe.throw(_("{0} consent must reference the approved consent wording version.").format(_(self.purpose)))
        if self.terms_version and frappe.db.get_value("Aqar Terms Version", self.terms_version, "status") != "Approved":
            frappe.throw(_("Consent can only reference an approved wording version."))
        if self.source == "Staff Recorded" and not self.evidence:
            frappe.throw(_("Staff-recorded consent needs evidence (call note, message or form reference)."))
