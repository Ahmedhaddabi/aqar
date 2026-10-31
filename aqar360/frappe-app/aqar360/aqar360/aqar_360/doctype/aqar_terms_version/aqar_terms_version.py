import hashlib

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

LOCKED_FIELDS = ("policy_type", "language", "version", "body", "effective_from")


class AqarTermsVersion(Document):
    def autoname(self):
        slug = frappe.scrub(self.policy_type).replace("_", "-")
        self.name = f"{slug}-{self.language}-v{self.version}"

    def validate(self):
        self.content_hash = hashlib.sha256((self.body or "").encode()).hexdigest()
        before = self.get_doc_before_save()
        if before and before.status in ("Approved", "Retired"):
            if any(self.get(f) != before.get(f) for f in LOCKED_FIELDS):
                frappe.throw(_("Approved terms are locked. Create a new version instead."))
            if self.status not in ("Approved", "Retired") or (before.status == "Retired" and self.status != "Retired"):
                frappe.throw(_("Approved terms can only move to Retired."))
        if self.status == "Approved" and not (before and before.status == "Approved"):
            frappe.only_for(("System Manager", "Aqar Admin"))
            self.effective_from = self.effective_from or now_datetime()
            self.approved_by = frappe.session.user
            self.approved_on = now_datetime()

    def on_trash(self):
        if self.status != "Draft":
            frappe.throw(_("Only draft terms can be deleted."))
