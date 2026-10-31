import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

LOCKED = ("template_key", "language", "channel", "version", "subject", "body", "category", "consent_purpose")


class AqarMessageTemplate(Document):
    def autoname(self):
        self.name = f"{self.template_key}-{self.language}-{self.channel}-v{self.version}".lower()

    def validate(self):
        from aqar360.messaging.templates import SAMPLE_CONTEXT, render
        try:
            render(self.subject, SAMPLE_CONTEXT)
            render(self.body, SAMPLE_CONTEXT)
        except Exception as error:  # a broken template must never reach a customer
            frappe.throw(_("The template has an error: {0}").format(error))
        before = self.get_doc_before_save()
        if before and before.status in ("Approved", "Retired"):
            if any(self.get(f) != before.get(f) for f in LOCKED):
                frappe.throw(_("Approved templates are locked. Create a new version instead."))
            if before.status == "Retired" and self.status != "Retired":
                frappe.throw(_("A retired template cannot be re-approved; create a new version."))
        if self.status == "Approved" and not (before and before.status == "Approved"):
            frappe.only_for(("System Manager", "Aqar Admin", "Aqar Manager"))
            self.approved_by, self.approved_on = frappe.session.user, now_datetime()

    def on_update(self):
        if self.status == "Approved":
            # One live version per key, language and channel.
            for name in frappe.get_all("Aqar Message Template", pluck="name", filters={"template_key": self.template_key,
                    "language": self.language, "channel": self.channel, "status": "Approved", "name": ["!=", self.name]}):
                frappe.db.set_value("Aqar Message Template", name, "status", "Retired")
