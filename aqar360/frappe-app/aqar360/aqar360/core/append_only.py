import frappe
from frappe import _
from frappe.model.document import Document


class AppendOnlyDocument(Document):
    """Evidence records: inserted once, never edited or deleted through the ORM."""

    def validate(self):
        if not self.is_new():
            frappe.throw(_("{0} records are append-only.").format(_(self.doctype)), frappe.PermissionError)

    def on_trash(self):
        frappe.throw(_("{0} records are append-only.").format(_(self.doctype)), frappe.PermissionError)
