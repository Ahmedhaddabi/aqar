"""Vault access: classification-based visibility and single-use expiring downloads (§18.2, §26.3)."""
import frappe
from frappe import _

from aqar360.core import links
from aqar360.core.audit import log_event

# Highly Restricted documents (IDs, bank details, contracts with financial terms) are limited to these roles.
HIGHLY_RESTRICTED_ROLES = {"System Manager", "Aqar Admin", "Aqar Manager", "Aqar Finance"}
DOWNLOADABLE = ("Basic Checks Passed", "Clean (Antivirus)")
LINK_PURPOSE = "Document Download"


def read_bytes(file_url):
    """Raw stored bytes. File.get_content() may return decoded text, which corrupts PDFs and Office files."""
    file = frappe.get_doc("File", {"file_url": file_url})
    with open(file.get_full_path(), "rb") as handle:
        return file.file_name, handle.read()


def _sees_highly_restricted(user=None):
    return bool(set(frappe.get_roles(user)) & HIGHLY_RESTRICTED_ROLES)


def document_query_conditions(user=None):
    """List/report filter so restricted documents never appear for other roles."""
    if _sees_highly_restricted(user or frappe.session.user):
        return ""
    return "`tabAqar Document`.`classification` != 'Highly Restricted'"


def document_has_permission(doc, ptype=None, user=None, debug=False):
    if doc.classification == "Highly Restricted" and not _sees_highly_restricted(user or frappe.session.user):
        return False
    return True


@frappe.whitelist()
def get_download_link(document):
    """A 15-minute, single-use link for someone allowed to read the document; the request is audited."""
    doc = frappe.get_doc("Aqar Document", document)
    doc.check_permission("read")
    if doc.scan_status not in DOWNLOADABLE:
        frappe.throw(_("This document has not passed its upload checks and cannot be downloaded."))
    token = links.create_link(LINK_PURPOSE, "Aqar Document", doc.name, expires_in_hours=0.25, max_uses=1)
    log_event("Document Download Link Issued", "Aqar Document", doc.name,
        after={"classification": doc.classification, "to": frappe.session.user})
    return f"/api/method/aqar360.vault.access.download?token={token}"


@frappe.whitelist(allow_guest=True, methods=["GET"])
def download(token=None):
    doctype, name = links.resolve(token, LINK_PURPOSE)
    doc = frappe.get_doc(doctype, name)
    if doc.scan_status not in DOWNLOADABLE:
        frappe.throw(_("This document cannot be downloaded."), frappe.PermissionError)
    filename, content = read_bytes(doc.file)
    log_event("Document Downloaded", "Aqar Document", doc.name, after={"classification": doc.classification})
    frappe.local.response.filename = filename
    frappe.local.response.filecontent = content
    frappe.local.response.type = "download"
