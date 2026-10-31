"""Single-purpose, expiring, revocable links; only the SHA-256 of the token is stored (§26.3, F.4)."""
import hashlib
import secrets

import frappe
from frappe import _
from frappe.utils import add_to_date, get_datetime, now_datetime

from aqar360.core.audit import log_event


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_link(purpose, reference_doctype, reference_name, expires_in_hours=72, max_uses=0):
    token = secrets.token_urlsafe(32)
    doc = frappe.get_doc({
        "doctype": "Aqar Secure Link", "token_hash": _hash(token), "purpose": purpose,
        "reference_doctype": reference_doctype, "reference_name": reference_name,
        "expires_at": add_to_date(now_datetime(), hours=expires_in_hours), "max_uses": max_uses,
    }).insert(ignore_permissions=True)
    log_event("Secure Link Created", reference_doctype, reference_name,
        after={"link": doc.name, "purpose": purpose, "expires_at": doc.expires_at})
    return token


def resolve(token, purpose):
    """Return (reference_doctype, reference_name); every failure looks identical to the caller."""
    invalid = _("This link is invalid or has expired.")
    name = frappe.db.get_value("Aqar Secure Link", {"token_hash": _hash(token)}, "name") if token else None
    if not name:
        frappe.throw(invalid, frappe.PermissionError)
    link = frappe.get_doc("Aqar Secure Link", name)
    exhausted = link.max_uses and link.use_count >= link.max_uses
    if link.purpose != purpose or link.revoked or exhausted or get_datetime(link.expires_at) <= now_datetime():
        frappe.throw(invalid, frappe.PermissionError)
    link.db_set({"use_count": link.use_count + 1, "last_used_at": now_datetime()})
    return link.reference_doctype, link.reference_name


def revoke(name):
    link = frappe.get_doc("Aqar Secure Link", name)
    link.revoked = 1
    link.save(ignore_permissions=True)
