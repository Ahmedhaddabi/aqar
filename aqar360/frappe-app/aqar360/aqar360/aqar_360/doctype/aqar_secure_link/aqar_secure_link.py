import frappe
from frappe import _
from frappe.model.document import Document


class AqarSecureLink(Document):
    def validate(self):
        before = self.get_doc_before_save()
        if not before:
            return
        changed = [f.fieldname for f in self.meta.fields if self.get(f.fieldname) != before.get(f.fieldname)]
        if (changed and changed != ["revoked"]) or (before.revoked and not self.revoked):
            frappe.throw(_("Secure links can only be revoked, not edited or re-enabled."))
