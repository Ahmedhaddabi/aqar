import hashlib

import frappe
from frappe import _
from frappe.model.document import Document

from aqar360.core.audit import log_event
from aqar360.vault.access import read_bytes
from aqar360.vault.scan import scan


class AqarDocument(Document):
    def validate(self):
        if not (self.file or "").startswith("/private/files/"):
            frappe.throw(_("Vault documents must be uploaded as private files."))
        before = self.get_doc_before_save()
        if before and before.file == self.file and self.scan_status:
            return
        filename, content = read_bytes(self.file)
        self.scan_status = scan(content, filename)  # raises UploadRejected; the save is refused
        self.sha256 = hashlib.sha256(content).hexdigest()
        self.file_size = len(content)

    def on_update(self):
        if self.has_value_changed("classification") or self.has_value_changed("file"):
            log_event("Document Stored", "Aqar Document", self.name, after={"classification": self.classification,
                "document_type": self.document_type, "sha256": self.sha256})
