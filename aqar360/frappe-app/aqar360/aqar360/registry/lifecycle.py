"""Supply lifecycle: verification, reactivation, price history, freshness, intake registration, timeline."""
import json

import frappe
from frappe import _
from frappe.model.naming import make_autoname
from frappe.utils import flt, today

from aqar360.core.audit import log_event
from aqar360.registry.constants import CLOSED_AVAILABILITY, OPEN_AVAILABILITY, PRICE_FIELDS, REGISTRY_DOCTYPES


def _prefix(doctype):
    return dict(REGISTRY_DOCTYPES)[doctype]


def apply_verification(doc, method=None):
    """validate hook: stamp verifier/date, and force reverification when a closed record reopens (§27.21)."""
    p = _prefix(doc.doctype)
    before = doc.get_doc_before_save()
    was = before.get(p + "verification_status") if before else None
    if doc.get(p + "verification_status") == "Verified" and was != "Verified":
        doc.set(p + "last_verified", today())
        doc.set(p + "verified_by", frappe.session.user)
    previous = before.get(p + "sales_availability") if before else None
    if previous in CLOSED_AVAILABILITY and doc.get(p + "sales_availability") in OPEN_AVAILABILITY:
        doc.set(p + "verification_status", "Needs Reverification")
        frappe.msgprint(_("Reactivated: units, prices and documents must be reverified before matching."),
            alert=True)


@frappe.whitelist()
def mark_verified(doctype, name):
    """Refresh verification on an already-verified record after staff rechecked it."""
    if doctype not in dict(REGISTRY_DOCTYPES):
        frappe.throw(_("Not a registry record."))
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("write")
    p = _prefix(doctype)
    doc.set(p + "verification_status", "Verified")
    doc.set(p + "last_verified", today())
    doc.set(p + "verified_by", frappe.session.user)
    doc.save()
    log_event("Verified", doctype, name, after={"last_verified": today()})
    return doc.get(p + "last_verified")


def log_price_changes(doc, method=None):
    """on_update hook: append-only price history; feeds price-drop re-matching (M4, F.3 item 3)."""
    before = doc.get_doc_before_save()
    for fieldname in PRICE_FIELDS[doc.doctype]:
        old, new = flt(before.get(fieldname)) if before else 0, flt(doc.get(fieldname))
        if old == new:
            continue
        frappe.get_doc({
            "doctype": "Aqar Price Change", "reference_doctype": doc.doctype, "reference_name": doc.name,
            "price_field": fieldname, "old_value": old, "new_value": new,
            "direction": "Set" if not old else ("Decrease" if new < old else "Increase"),
            "change_pct": round((new - old) / old * 100, 2) if old else 0,
        }).insert(ignore_permissions=True)


def mark_stale_registry():
    """Daily job: verified records past their window become Needs Reverification (§27.21)."""
    for doctype, p in REGISTRY_DOCTYPES:
        frappe.db.sql(f"""update `tab{doctype}` set `{p}verification_status` = 'Needs Reverification'
            where `{p}verification_status` = 'Verified'
              and date_add(`{p}last_verified`, interval coalesce(`{p}reverify_after_days`, 30) day) < %s""",
            today())


TYPE_MAP = {"Apartment": "Residential", "Villa": "Residential", "Building": "Residential", "Land": "Land",
    "Shop": "Commercial", "Office": "Commercial", "Showroom": "Commercial", "Commercial": "Commercial",
    "Warehouse": "Industrial", "Project": "Mixed-Use", "Other": "Mixed-Use"}
PURPOSE_MAP = {"Sell": "Sale", "Let": "Rent", "Content Only": "Content Only", "Market Project": "Sale"}


def register_property_from_intake(intake):
    """Accepted intake → one Property in the registry; never creates a second one for the same intake."""
    if intake.property:
        return intake.property
    purpose = PURPOSE_MAP[intake.request_type]
    area_name = frappe.db.get_value("Aqar Area", intake.area, "area_name_en") if intake.area else None
    prop = frappe.get_doc({
        "doctype": "Property", "property_code": make_autoname("AQP-.#####"),
        "property_name": " – ".join(filter(None, [intake.property_type, area_name])),
        "property_type": TYPE_MAP[intake.property_type], "country": "Oman",
        "description": intake.description, "custom_aqar_owner_contact": intake.contact,
        "custom_aqar_property_kind": intake.property_type, "custom_aqar_area": intake.area,
        "custom_aqar_listing_purpose": purpose,
        "custom_aqar_sale_price": intake.asking_price if purpose == "Sale" else None,
        "custom_aqar_rent_price": intake.asking_price if purpose == "Rent" else None,
        "custom_aqar_bedrooms": intake.bedrooms, "custom_aqar_bathrooms": intake.bathrooms,
        "custom_aqar_size_sqm": intake.size_sqm, "custom_aqar_intake": intake.name,
        "custom_aqar_sales_availability": "Active", "custom_aqar_verification_status": "Unverified",
    }).insert(ignore_permissions=True)
    intake.db_set("property", prop.name)
    log_event("Property Registered", "Property", prop.name, after={"intake": intake.name})
    return prop.name


def property_dashboard(data):
    """Connections panel on the Property form (Property Digital File, §26.2)."""
    data = frappe._dict(data or {})
    data.fieldname = data.get("fieldname") or "property"
    data.non_standard_fieldnames = {**(data.get("non_standard_fieldnames") or {}),
        "Aqar Price Change": "reference_name", "Aqar Source Observation": "reference_name"}
    data.transactions = [*(data.get("transactions") or []), {"label": _("Aqar 360"),
        "items": ["Aqar Opportunity Intake", "Aqar Match", "Aqar Price Change", "Aqar Source Observation"]}]
    return data


@frappe.whitelist()
def get_property_timeline(property_name):
    """Everything that happened to a property and its units, newest first (§26.2)."""
    frappe.has_permission("Property", "read", property_name, throw=True)
    refs = [("Property", property_name)] + [("Property Unit", u) for u in
        frappe.get_all("Property Unit", filters={"property": property_name}, pluck="name")]
    events = []
    for doctype, name in refs:
        for row in frappe.get_all("Aqar Audit Event", filters={"reference_doctype": doctype, "reference_name": name},
                fields=["event_time", "actor", "action"]):
            events.append({"time": row.event_time, "by": row.actor, "kind": "audit", "doctype": doctype,
                "name": name, "summary": row.action})
        for row in frappe.get_all("Version", filters={"ref_doctype": doctype, "docname": name},
                fields=["creation", "owner", "data"]):
            changed = [c[0] for c in (json.loads(row.data or "{}").get("changed") or [])]
            if changed:
                events.append({"time": row.creation, "by": row.owner, "kind": "change", "doctype": doctype,
                    "name": name, "summary": _("Changed: {0}").format(", ".join(changed))})
        for row in frappe.get_all("Aqar Price Change", filters={"reference_doctype": doctype, "reference_name": name},
                fields=["changed_at", "owner", "price_field", "old_value", "new_value", "direction"]):
            events.append({"time": row.changed_at, "by": row.owner, "kind": "price", "doctype": doctype,
                "name": name, "summary": f"{row.price_field}: {row.old_value:g} → {row.new_value:g} ({row.direction})"})
        for row in frappe.get_all("Aqar Source Observation", filters={"reference_doctype": doctype,
                "reference_name": name}, fields=["creation", "owner", "source_type", "freshness_status"]):
            events.append({"time": row.creation, "by": row.owner, "kind": "source", "doctype": doctype,
                "name": name, "summary": f"{row.source_type} ({row.freshness_status})"})
    for row in frappe.get_all("Aqar Opportunity Intake", filters={"property": property_name},
            fields=["name", "submitted_at", "review_status"]):
        events.append({"time": row.submitted_at, "by": None, "kind": "intake", "doctype": "Aqar Opportunity Intake",
            "name": row.name, "summary": row.review_status})
    return sorted(events, key=lambda e: str(e["time"]), reverse=True)
