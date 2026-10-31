import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import today

SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class AqarContentPage(Document):
    def validate(self):
        self.slug = (self.slug or "").strip().lower()
        if not SLUG.match(self.slug):
            frappe.throw(_("The URL slug may only contain lowercase letters, numbers and single hyphens."))
        if self.page_type == "Area Guide" and not self.area:
            frappe.throw(_("Choose the area this guide describes."))
        if self.published:
            # §3.3: both languages are written, not machine-translated afterwards.
            missing = [label for label, value in ((_("Arabic summary"), self.summary_ar),
                (_("English summary"), self.summary_en), (_("Arabic body"), self.body_ar),
                (_("English body"), self.body_en)) if not (value or "").strip()]
            if missing:
                frappe.throw(_("Complete before publishing: {0}").format(", ".join(missing)))
            if self.page_type == "Market Insight" and not (self.sources or "").strip():
                frappe.throw(_("Market insights must state their sources and method before publishing."))
            before = self.get_doc_before_save()
            if not before or not before.published or self._content_changed(before):
                self.last_reviewed, self.reviewed_by = today(), frappe.session.user

    def _content_changed(self, before):
        fields = ("title_ar", "title_en", "summary_ar", "summary_en", "facts_ar", "facts_en", "body_ar", "body_en")
        return any(before.get(f) != self.get(f) for f in fields)
