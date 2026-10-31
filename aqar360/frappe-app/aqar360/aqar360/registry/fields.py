"""Aqar registry extensions to upstream Property / Property Unit, via Custom Fields and Custom DocPerms only."""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.permissions import add_permission, update_permission_property

from aqar360.registry.constants import (AVAILABILITY, CONSTRUCTION, LISTING_PURPOSES, PROPERTY_KINDS,
    VERIFICATION, VISIBILITY, options)

OMR = {"precision": "3"}


def _status_fields(after):
    return [
        {"fieldname": "custom_aqar_status_section", "fieldtype": "Section Break",
            "label": "Aqar Availability & Verification", "insert_after": after},
        {"fieldname": "custom_aqar_sales_availability", "fieldtype": "Select", "label": "Sales Availability",
            "options": options(AVAILABILITY), "default": "Active", "in_standard_filter": 1,
            "insert_after": "custom_aqar_status_section"},
        {"fieldname": "custom_aqar_verification_status", "fieldtype": "Select", "label": "Verification Status",
            "options": options(VERIFICATION), "default": "Unverified", "in_standard_filter": 1,
            "insert_after": "custom_aqar_sales_availability"},
        {"fieldname": "custom_aqar_status_col", "fieldtype": "Column Break",
            "insert_after": "custom_aqar_verification_status"},
        {"fieldname": "custom_aqar_last_verified", "fieldtype": "Date", "label": "Last Verified",
            "read_only": 1, "insert_after": "custom_aqar_status_col"},
        {"fieldname": "custom_aqar_verified_by", "fieldtype": "Link", "label": "Verified By", "options": "User",
            "read_only": 1, "insert_after": "custom_aqar_last_verified"},
        {"fieldname": "custom_aqar_reverify_after_days", "fieldtype": "Int", "label": "Reverify After (Days)",
            "default": "30", "insert_after": "custom_aqar_verified_by"},
    ]


def _facts(after):
    return [
        {"fieldname": "custom_aqar_bedrooms", "fieldtype": "Int", "label": "Bedrooms", "insert_after": after},
        {"fieldname": "custom_aqar_bathrooms", "fieldtype": "Int", "label": "Bathrooms",
            "insert_after": "custom_aqar_bedrooms"},
        {"fieldname": "custom_aqar_size_sqm", "fieldtype": "Float", "label": "Size (m²)",
            "insert_after": "custom_aqar_bathrooms"},
    ]


PROPERTY_FIELDS = [
    {"fieldname": "custom_aqar_registry_section", "fieldtype": "Section Break", "label": "Aqar Registry",
        "insert_after": "description"},
    {"fieldname": "custom_aqar_property_kind", "fieldtype": "Select", "label": "Aqar Property Type",
        "options": options(PROPERTY_KINDS, blank=True), "in_standard_filter": 1,
        "insert_after": "custom_aqar_registry_section"},
    {"fieldname": "custom_aqar_area", "fieldtype": "Link", "label": "Aqar Area", "options": "Aqar Area",
        "in_standard_filter": 1, "insert_after": "custom_aqar_property_kind"},
    {"fieldname": "custom_aqar_listing_purpose", "fieldtype": "Select", "label": "Listing Purpose",
        "options": options(LISTING_PURPOSES, blank=True), "insert_after": "custom_aqar_area"},
    {"fieldname": "custom_aqar_sale_price", "fieldtype": "Currency", "label": "Asking Sale Price (OMR)",
        "insert_after": "custom_aqar_listing_purpose", **OMR},
    {"fieldname": "custom_aqar_rent_price", "fieldtype": "Currency", "label": "Asking Rent per Month (OMR)",
        "insert_after": "custom_aqar_sale_price", **OMR},
    {"fieldname": "custom_aqar_registry_col", "fieldtype": "Column Break", "insert_after": "custom_aqar_rent_price"},
    *_facts("custom_aqar_registry_col"),
    {"fieldname": "custom_aqar_furnished", "fieldtype": "Select", "label": "Furnished",
        "options": "\nFurnished\nUnfurnished", "insert_after": "custom_aqar_size_sqm"},
    {"fieldname": "custom_aqar_parking", "fieldtype": "Check", "label": "Parking", "insert_after": "custom_aqar_furnished"},
    {"fieldname": "custom_aqar_construction_status", "fieldtype": "Select", "label": "Construction Status",
        "options": options(CONSTRUCTION, blank=True), "insert_after": "custom_aqar_parking"},
    {"fieldname": "custom_aqar_visibility", "fieldtype": "Select", "label": "Visibility",
        "options": options(VISIBILITY), "default": "Internal Only", "insert_after": "custom_aqar_construction_status"},
    {"fieldname": "custom_aqar_intake", "fieldtype": "Link", "label": "Source Intake",
        "options": "Aqar Opportunity Intake", "read_only": 1, "insert_after": "custom_aqar_visibility"},
    *_status_fields("custom_aqar_intake"),
    # Plain names so the desk Map view works; kept in sync with the geo_coordinates pin (registry.geo).
    {"fieldname": "latitude", "fieldtype": "Float", "label": "Latitude", "precision": "6",
        "insert_after": "geo_coordinates"},
    {"fieldname": "longitude", "fieldtype": "Float", "label": "Longitude", "precision": "6", "insert_after": "latitude"},
    {"fieldname": "custom_aqar_show_exact_location", "fieldtype": "Check", "label": "Show Exact Location on Website",
        "description": "Off: the public map shows this property only inside its area, never as an exact pin.",
        "insert_after": "longitude"},
    # Re-point the Phase 0 link from ERPNext Project to the developer project registry (ADR-021).
    {"fieldname": "custom_aqar_project", "fieldtype": "Link", "label": "Aqar Project",
        "options": "Aqar Development Project", "insert_after": "property_name"},
]

UNIT_FIELDS = [
    {"fieldname": "custom_aqar_registry_section", "fieldtype": "Section Break", "label": "Aqar Registry",
        "insert_after": "documents"},
    {"fieldname": "custom_aqar_unit_type", "fieldtype": "Link", "label": "Aqar Unit Type",
        "options": "Aqar Unit Type", "in_standard_filter": 1, "insert_after": "custom_aqar_registry_section"},
    {"fieldname": "custom_aqar_listing_purpose", "fieldtype": "Select", "label": "Listing Purpose",
        "options": options(LISTING_PURPOSES, blank=True), "insert_after": "custom_aqar_unit_type"},
    {"fieldname": "custom_aqar_project", "fieldtype": "Link", "label": "Aqar Project",
        "options": "Aqar Development Project", "fetch_from": "property.custom_aqar_project", "read_only": 1,
        "in_standard_filter": 1, "insert_after": "custom_aqar_listing_purpose"},
    {"fieldname": "custom_aqar_area", "fieldtype": "Link", "label": "Aqar Area", "options": "Aqar Area",
        "fetch_from": "property.custom_aqar_area", "read_only": 1, "insert_after": "custom_aqar_project"},
    {"fieldname": "custom_aqar_registry_col", "fieldtype": "Column Break", "insert_after": "custom_aqar_area"},
    *_facts("custom_aqar_registry_col"),
    *_status_fields("custom_aqar_size_sqm"),
]

# role: (read, write, create, delete); customer/supplier roles get nothing.
REGISTRY_PERMS = {
    "Aqar Admin": (1, 1, 1, 1), "Aqar Manager": (1, 1, 1, 0), "Aqar Team Lead": (1, 1, 1, 0),
    "Aqar Opportunity Staff": (1, 1, 1, 0), "Aqar Business Development": (1, 1, 1, 0),
    "Aqar Content Coordinator": (1, 0, 0, 0), "Aqar Marketing": (1, 0, 0, 0),
}


def ensure_registry_fields():
    create_custom_fields({"Property": PROPERTY_FIELDS, "Property Unit": UNIT_FIELDS}, update=True)
    for doctype in ("Property", "Property Unit"):
        for role, values in REGISTRY_PERMS.items():
            add_permission(doctype, role, 0)
            for ptype, value in zip(("read", "write", "create", "delete"), values):
                update_permission_property(doctype, role, 0, ptype, value, validate=False)
    frappe.clear_cache(doctype="Property")
    frappe.clear_cache(doctype="Property Unit")
