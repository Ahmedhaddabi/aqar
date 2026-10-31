"""Person resolution for public submissions (ADR-003, §26.2, §27.23).

A submission reuses an existing Contact only when every identifier it supplies (email and phone)
points to that same single Contact. Any partial overlap creates a new Contact and flags the
existing one as a duplicate candidate for a human merge decision; shared details never merge people.
"""
import re

import frappe
from frappe import _


def normalize_phone(value):
    digits = re.sub(r"[^\d+]", "", str(value))
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if not digits.startswith("+"):
        if len(digits) == 8:
            digits = "+968" + digits
        elif digits.startswith("968") and len(digits) == 11:
            digits = "+" + digits
    if not re.fullmatch(r"\+\d{8,15}", digits) or (digits.startswith("+968") and len(digits) != 12):
        raise ValueError(_("Enter a valid phone number, e.g. 9XXXXXXX or +9689XXXXXXX."))
    return digits


def _contacts_with(child_doctype, field, value):
    if not value:
        return set()
    return set(frappe.get_all(child_doctype, filters={field: value, "parenttype": "Contact"}, pluck="parent"))


def resolve_contact(full_name, email=None, phone=None):
    """Return (contact, duplicate_candidate)."""
    by_email = _contacts_with("Contact Email", "email_id", email)
    by_phone = _contacts_with("Contact Phone", "phone", phone)
    if email and phone:
        strong = by_email & by_phone
    else:
        strong = set()
    if len(strong) == 1:
        return strong.pop(), None
    candidates = sorted(strong or (by_email | by_phone))
    contact = frappe.get_doc({
        "doctype": "Contact",
        "first_name": full_name,
        "email_ids": [{"email_id": email, "is_primary": 1}] if email else [],
        "phone_nos": [{"phone": phone, "is_primary_mobile_no": 1}] if phone else [],
    }).insert(ignore_permissions=True)
    return contact.name, (candidates[0] if candidates else None)
