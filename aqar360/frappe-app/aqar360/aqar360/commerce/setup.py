"""Commerce configuration for §6 content services and §9 billing. Runs only once a Company exists.

Customer-specific values (prices, revision limits, taxes, payment policy) are seeded as editable
placeholders: items and prices are created once and never overwritten, so the customer's edits stick.
"""
from pathlib import Path

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

PASS_THROUGH_ACCOUNT = "Client Media Funds Held"
# (item code, name, SLA policy key, draft price OMR from §6, included revision rounds, scope)
SERVICES = (
    ("AQ-PHOTOS", "Professional Photos", "content_photos", 120, 1,
        "10 selected, edited photos (interior/exterior), colour and perspective correction, high-res and web versions."),
    ("AQ-FLOOR-PLAN", "Floor Plan", "content_floor_plan", 100, 1, "Clear 2D floor plan of the space layout."),
    ("AQ-VIDEO-STANDARD", "Standard Video", "content_standard_video", 150, 1,
        "Filming, editing, voice-over, subtitles and music."),
    ("AQ-VIDEO-AI", "AI Video", "content_ai_video", 180, 1, "Standalone video with AI-assisted/enhanced production."),
    ("AQ-VIDEO-DRONE-AI", "Drone + AI Video", "content_drone_video", 250, 1,
        "Aerial filming + AI; subject to permits, location and weather."),
    ("AQ-VIDEO-PRESENTER", "Presenter Video", "content_presenter_video", 300, 1,
        "Presenter, script, filming, editing and subtitles."),
    ("AQ-VIDEO-LIFESTYLE", "Lifestyle Video", "content_lifestyle_video", 600, 1,
        "Full production: concept, storytelling and actors."),
)
# Arabic display names and scopes for the public website; filled only while empty so customer edits stick.
SERVICES_AR = {
    "AQ-PHOTOS": ("صور احترافية", "10 صور مختارة ومعدلة داخلية وخارجية، تصحيح ألوان ومنظور، نسخة عالية الدقة ونسخة للويب."),
    "AQ-FLOOR-PLAN": ("مخطط المساحات", "مخطط ثنائي الأبعاد واضح لتوزيع المساحات."),
    "AQ-VIDEO-STANDARD": ("فيديو قياسي", "تصوير ومونتاج مع تعليق صوتي وترجمة وموسيقى."),
    "AQ-VIDEO-AI": ("فيديو بالذكاء الاصطناعي", "فيديو مستقل بإنتاج مدعوم ومحسن بالذكاء الاصطناعي."),
    "AQ-VIDEO-DRONE-AI": ("فيديو درون مع الذكاء الاصطناعي", "تصوير جوي مع الذكاء الاصطناعي، خاضع للتصاريح والموقع والطقس."),
    "AQ-VIDEO-PRESENTER": ("فيديو بمقدم", "مقدم أو مقدمة مع نص وتصوير ومونتاج وترجمة."),
    "AQ-VIDEO-LIFESTYLE": ("فيديو لايف ستايل", "إنتاج كامل: فكرة وسرد قصصي وممثلون."),
}
OTHER_ITEMS = (
    ("AQ-CAMPAIGN-MGMT", "Campaign Management Fee", 0, "Paid media management fee (custom quote)."),
    ("AQ-EXTRA-REVISION", "Additional Revision Round", 0, "Revision round beyond those included (price to be set)."),
)
MEDIA_BUDGET_ITEM = "AQ-MEDIA-BUDGET"


def _custom_fields():
    create_custom_fields({
        "Item": [
            {"fieldname": "custom_aqar_section", "fieldtype": "Section Break", "label": "Aqar Content Service",
                "insert_after": "description", "collapsible": 1},
            {"fieldname": "custom_aqar_sla_policy", "fieldtype": "Link", "label": "Delivery SLA Policy",
                "options": "Aqar SLA Policy", "insert_after": "custom_aqar_section"},
            {"fieldname": "custom_aqar_revision_rounds", "fieldtype": "Int", "label": "Included Revision Rounds",
                "insert_after": "custom_aqar_sla_policy"},
            {"fieldname": "custom_aqar_pass_through", "fieldtype": "Check", "label": "Pass-through (Not Revenue)",
                "description": "Client money held for third parties, e.g. media budgets (§9.2).",
                "insert_after": "custom_aqar_revision_rounds"},
            {"fieldname": "custom_aqar_public", "fieldtype": "Check", "label": "Show on Public Website",
                "insert_after": "custom_aqar_pass_through"},
            {"fieldname": "custom_aqar_item_name_ar", "fieldtype": "Data", "label": "Name (Arabic)",
                "insert_after": "custom_aqar_public"},
            {"fieldname": "custom_aqar_scope_ar", "fieldtype": "Small Text", "label": "Scope (Arabic)",
                "insert_after": "custom_aqar_item_name_ar"},
        ],
        "Quotation": [{"fieldname": "custom_aqar_content_order", "fieldtype": "Link", "label": "Aqar Content Order",
            "options": "Aqar Content Order", "read_only": 1, "insert_after": "party_name"}],
        "Sales Invoice": [{"fieldname": "custom_aqar_content_order", "fieldtype": "Link",
            "label": "Aqar Content Order", "options": "Aqar Content Order", "read_only": 1,
            "insert_after": "customer"}],
    }, update=True)


def _pass_through_account(company):
    abbr = frappe.get_cached_value("Company", company, "abbr")
    name = f"{PASS_THROUGH_ACCOUNT} - {abbr}"
    if not frappe.db.exists("Account", name):
        parent = frappe.db.get_value("Account", {"company": company, "account_name": "Current Liabilities",
            "is_group": 1})
        if not parent:
            return None
        frappe.get_doc({"doctype": "Account", "account_name": PASS_THROUGH_ACCOUNT, "parent_account": parent,
            "company": company, "root_type": "Liability", "account_type": ""}).insert(ignore_permissions=True)
    return name


def _item(code, name, description, rate, company, **extra):
    if not frappe.db.exists("Item", code):
        frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name, "description": description,
            "item_group": "Services", "stock_uom": "Nos", "is_stock_item": 0, "is_sales_item": 1,
            "is_purchase_item": 0, "include_item_in_manufacturing": 0, **extra}).insert(ignore_permissions=True)
        if not frappe.db.exists("Item Price", {"item_code": code, "price_list": "Standard Selling"}):
            frappe.get_doc({"doctype": "Item Price", "item_code": code, "price_list": "Standard Selling",
                "price_list_rate": rate, "currency": frappe.get_cached_value("Company", company, "default_currency"),
                "note": "Draft price from strategy §6; confirm with the customer."}).insert(ignore_permissions=True)


def _print_formats():
    html = (Path(__file__).parent / "print" / "bilingual_document.html").read_text(encoding="utf-8")
    for doctype, name in (("Sales Invoice", "Aqar Bilingual Invoice"), ("Quotation", "Aqar Bilingual Quotation")):
        values = {"doc_type": doctype, "module": "Aqar 360", "custom_format": 1, "print_format_type": "Jinja",
            "standard": "No", "html": html, "disabled": 0}
        if frappe.db.exists("Print Format", name):
            frappe.get_doc("Print Format", name).update(values).save(ignore_permissions=True)
        else:
            frappe.get_doc({"doctype": "Print Format", "name": name, "__newname": name, **values}).insert(
                ignore_permissions=True)


# Narrow, per-DocType grants instead of broad ERPNext roles (ADR-006). (read, write, create, submit, cancel)
COMMERCE_PERMS = {
    "Item": {r: (1, 0, 0, 0, 0) for r in ("Aqar Content Coordinator", "Aqar Team Lead", "Aqar Manager",
        "Aqar Finance", "Aqar Marketing")},
    "Item Price": {r: (1, 0, 0, 0, 0) for r in ("Aqar Content Coordinator", "Aqar Team Lead", "Aqar Manager",
        "Aqar Finance")},
    "Price List": {r: (1, 0, 0, 0, 0) for r in ("Aqar Content Coordinator", "Aqar Team Lead", "Aqar Manager",
        "Aqar Finance")},
    "Customer": {r: (1, 0, 0, 0, 0) for r in ("Aqar Content Coordinator", "Aqar Team Lead", "Aqar Manager",
        "Aqar Finance")},
    "Quotation": {"Aqar Content Coordinator": (1, 1, 1, 0, 0), "Aqar Team Lead": (1, 1, 1, 0, 0),
        "Aqar Manager": (1, 1, 1, 1, 1), "Aqar Finance": (1, 0, 0, 0, 0)},
    "Sales Invoice": {"Aqar Content Coordinator": (1, 0, 0, 0, 0), "Aqar Team Lead": (1, 0, 0, 0, 0),
        "Aqar Manager": (1, 0, 0, 0, 0), "Aqar Finance": (1, 1, 1, 1, 1)},
    "Payment Entry": {"Aqar Manager": (1, 0, 0, 0, 0), "Aqar Finance": (1, 1, 1, 1, 1)},
    "Account": {"Aqar Finance": (1, 0, 0, 0, 0)},
}
# Pricing a quotation resolves income/receivable accounts; "select" lets staff use them without reading the books.
SELECT_ONLY = {"Account": ("Aqar Content Coordinator", "Aqar Team Lead", "Aqar Manager")}


def _permissions():
    from frappe.permissions import add_permission, update_permission_property
    for doctype, grants in COMMERCE_PERMS.items():
        for role, values in grants.items():
            add_permission(doctype, role, 0)
            for ptype, value in zip(("read", "write", "create", "submit", "cancel"), values):
                update_permission_property(doctype, role, 0, ptype, value, validate=False)
    for doctype, roles in SELECT_ONLY.items():
        for role in roles:
            add_permission(doctype, role, 0, ptype="select")
            update_permission_property(doctype, role, 0, "select", 1, validate=False)
            update_permission_property(doctype, role, 0, "read", 0, validate=False)


def ensure_commerce_setup():
    company = frappe.defaults.get_global_default("company") or (frappe.get_all("Company", pluck="name") or [None])[0]
    if not company or not frappe.db.exists("Item Group", "Services"):
        return
    _custom_fields()
    _permissions()
    for code, name, policy, rate, revisions, scope in SERVICES:
        _item(code, name, scope, rate, company, custom_aqar_sla_policy=policy, custom_aqar_revision_rounds=revisions,
            custom_aqar_public=1)
        name_ar, scope_ar = SERVICES_AR[code]
        if not frappe.db.get_value("Item", code, "custom_aqar_item_name_ar"):
            frappe.db.set_value("Item", code, {"custom_aqar_item_name_ar": name_ar, "custom_aqar_scope_ar": scope_ar,
                "custom_aqar_public": 1})
    for code, name, rate, scope in OTHER_ITEMS:
        _item(code, name, scope, rate, company)
    account = _pass_through_account(company)
    _item(MEDIA_BUDGET_ITEM, "Client Media Budget (pass-through)",
        "Advertising budget paid to media platforms on the client's behalf; held for the client, not revenue.", 0,
        company, custom_aqar_pass_through=1,
        item_defaults=[{"company": company, "income_account": account}] if account else [])
    _print_formats()
