"""Idempotent reference data. Geography is a starting list for staff to extend; coordinates are left for verified entry."""
import frappe

GOVERNORATES = (
    ("Muscat", "مسقط"), ("Dhofar", "ظفار"), ("Musandam", "مسندم"), ("Al Buraimi", "البريمي"),
    ("Ad Dakhiliyah", "الداخلية"), ("Al Batinah North", "شمال الباطنة"),
    ("Al Batinah South", "جنوب الباطنة"), ("Ash Sharqiyah North", "شمال الشرقية"),
    ("Ash Sharqiyah South", "جنوب الشرقية"), ("Ad Dhahirah", "الظاهرة"), ("Al Wusta", "الوسطى"),
)
WILAYATS = {"Muscat": (("Muscat", "مسقط"), ("Muttrah", "مطرح"), ("Bawshar", "بوشر"),
    ("As Seeb", "السيب"), ("Al Amarat", "العامرات"), ("Qurayyat", "قريات"))}
AREAS = {
    "As Seeb": (("Al Khoudh", "الخوض"), ("Al Mawaleh", "الموالح"), ("Al Maabilah", "المعبيلة")),
    "Bawshar": (("Al Ghubrah", "الغبرة"), ("Al Qurum", "القرم")),
}
# Approximate area centres (lat, lng) for the map; placeholders the customer corrects or replaces with drawn
# boundaries (customer_inputs.md). Only filled when an area has no location yet.
AREA_CENTRES = {"Al Khoudh": (23.603, 58.163), "Al Mawaleh": (23.592, 58.253), "Al Maabilah": (23.638, 58.108),
    "Al Ghubrah": (23.596, 58.398), "Al Qurum": (23.614, 58.475)}
# (name, category, bedrooms)
UNIT_TYPES = (
    ("Studio", "Residential", 0), ("1 Bedroom", "Residential", 1), ("2 Bedrooms", "Residential", 2),
    ("3 Bedrooms", "Residential", 3), ("4 Bedrooms", "Residential", 4), ("5+ Bedrooms", "Residential", 5),
    ("Townhouse", "Residential", None), ("Villa", "Residential", None), ("Penthouse", "Residential", None),
    ("Office", "Commercial", None), ("Shop", "Commercial", None), ("Showroom", "Commercial", None),
    ("Warehouse", "Commercial", None), ("Land Plot", "Land", None),
)
# §8.3 internal SLA targets: (key, title, applies_to, rule, value, amber %). Ranges use the upper bound
# as the target and the lower bound as the amber point.
SLA_POLICIES = (
    ("search_first_response", "New request: first response", "Aqar Search Request", "Business Minutes", 120, 50),
    ("intake_review", "Opportunity review", "Aqar Opportunity Intake", "Same Business Day", 0, 75),
    ("consultation_first_response", "Consultation: first response", "Aqar Consultation Request", "Business Minutes", 120, 50),
    ("lead_first_response", "New lead: first response", None, "Business Minutes", 30, 50),
    ("content_shoot_confirmation", "Confirm shooting appointment", None, "Business Minutes", 240, 75),
    ("content_photos", "Professional photos after shoot", None, "Calendar Minutes", 1440, 75),
    ("content_floor_plan", "Floor plan", None, "Calendar Minutes", 2880, 50),
    ("content_standard_video", "Standard video", None, "Calendar Minutes", 2880, 75),
    ("content_ai_video", "AI video", None, "Calendar Minutes", 4320, 67),
    ("content_drone_video", "Drone + AI video", None, "Calendar Minutes", 4320, 75),
    ("content_presenter_video", "Presenter video", None, "Business Days", 3, 75),
    ("content_lifestyle_video", "Lifestyle video", None, "Business Days", 5, 75),
    ("content_minor_revision", "Minor revision", None, "Calendar Minutes", 1440, 75),
    ("campaign_launch", "Campaign launch after approval", None, "Business Minutes", 240, 75),
)
# Seeded inactive: an administrator decides thresholds before enabling (§26.3).
APPROVAL_RULES = (  # (name, doctype, field, action, threshold type, value)
    ("Property sale price cut over 10%", "Property", "custom_aqar_sale_price", "Price Change", "Percent Decrease", 10),
    ("Property rent cut over 10%", "Property", "custom_aqar_rent_price", "Price Change", "Percent Decrease", 10),
    ("Unit sale price cut over 10%", "Property Unit", "sale_price", "Price Change", "Percent Decrease", 10),
    ("Unit rent cut over 10%", "Property Unit", "rent_amount", "Price Change", "Percent Decrease", 10),
    ("Quotation discount over 10%", "Quotation", "additional_discount_percentage", "Discount", "Amount Above", 10),
    ("Invoice discount over 10%", "Sales Invoice", "additional_discount_percentage", "Discount", "Amount Above", 10),
)
# (key, gate, description); every flag is seeded disabled.
FEATURE_FLAGS = (
    ("public_request_forms", "None", "Public request and intake forms (M2/M10)."),
    ("customer_match_alerts", "Phase 2", "Automated match alerts to customers (§4.4)."),
    ("whatsapp_messaging", "Phase 2", "WhatsApp Business API channel (§8.2)."),
    ("online_payment_checkout", "Phase 2", "Hosted payment checkout (§17.1)."),
    ("ai_pdf_intake", "Phase 2", "AI brochure/PDF extraction with human review (§27.15)."),
    ("dynamic_brochure_pdf", "Phase 2", "Dynamic property brochure PDF and share links (§27.12)."),
    ("public_chatbot", "Public AI", "Public customer chatbot (Appendix G)."),
)


SETTINGS_DEFAULTS = {"work_days": "Sun,Mon,Tue,Wed,Thu", "work_start": "08:00:00", "work_end": "17:00:00",
    "auto_assign_requests": 1, "quiet_hours_start": "21:00:00", "quiet_hours_end": "08:00:00",
    "max_followups_per_week": 2, "still_searching_days": 14}


def seed_settings_defaults():
    """Singles do not receive defaults for fields added later; fill only values that were never stored."""
    # Single DocTypes have no table of their own, so check the field on the meta instead of table_exists.
    if not frappe.get_meta("Aqar Platform Settings").has_field("work_days"):
        return
    stored = set(frappe.db.sql_list("select field from `tabSingles` where doctype='Aqar Platform Settings'"))
    for field, value in SETTINGS_DEFAULTS.items():
        if field not in stored:
            frappe.db.set_single_value("Aqar Platform Settings", field, value)


def seed_reference_data():
    seed_settings_defaults()
    for en, ar in GOVERNORATES:
        if not frappe.db.exists("Aqar Governorate", en):
            frappe.get_doc({"doctype": "Aqar Governorate", "governorate_name_en": en,
                "governorate_name_ar": ar}).insert(ignore_permissions=True)
    for governorate, wilayats in WILAYATS.items():
        for en, ar in wilayats:
            if not frappe.db.exists("Aqar Wilayat", en):
                frappe.get_doc({"doctype": "Aqar Wilayat", "wilayat_name_en": en,
                    "wilayat_name_ar": ar, "governorate": governorate}).insert(ignore_permissions=True)
    for wilayat, areas in AREAS.items():
        for en, ar in areas:
            if not frappe.db.exists("Aqar Area", {"area_name_en": en, "wilayat": wilayat}):
                frappe.get_doc({"doctype": "Aqar Area", "area_name_en": en, "area_name_ar": ar,
                    "wilayat": wilayat}).insert(ignore_permissions=True)
    for en, (lat, lng) in AREA_CENTRES.items():
        name = frappe.db.get_value("Aqar Area", {"area_name_en": en}, ["name", "latitude", "longitude"], as_dict=True)
        if name and not (name.latitude or name.longitude):
            frappe.db.set_value("Aqar Area", name.name, {"latitude": lat, "longitude": lng}, update_modified=False)
    if frappe.get_meta("Aqar Area").has_field("slug"):  # areas created before URL slugs existed
        for name in frappe.get_all("Aqar Area", filters={"slug": ["is", "not set"]}, pluck="name"):
            frappe.get_doc("Aqar Area", name).save(ignore_permissions=True)
    if frappe.db.table_exists("Aqar Unit Type"):
        for name, category, bedrooms in UNIT_TYPES:
            if not frappe.db.exists("Aqar Unit Type", name):
                frappe.get_doc({"doctype": "Aqar Unit Type", "unit_type_name": name, "category": category,
                    "bedrooms": bedrooms}).insert(ignore_permissions=True)
    if frappe.db.table_exists("Aqar SLA Policy"):
        for key, title, applies_to, rule, value, amber in SLA_POLICIES:
            applies_to = applies_to or ("Aqar Content Order" if key.startswith("content_") and
                frappe.db.table_exists("Aqar Content Order") else None)
            if not frappe.db.exists("Aqar SLA Policy", key):
                frappe.get_doc({"doctype": "Aqar SLA Policy", "policy_key": key, "title": title,
                    "applies_to": applies_to, "target_rule": rule, "target_value": value, "amber_at_pct": amber,
                    "active": 1, "strategy_reference": "§8.3"}).insert(ignore_permissions=True)
            elif applies_to and not frappe.db.get_value("Aqar SLA Policy", key, "applies_to"):
                frappe.db.set_value("Aqar SLA Policy", key, "applies_to", applies_to)
    if frappe.db.table_exists("Aqar Approval Rule"):
        for rule_name, applies_to, field, action, threshold_type, value in APPROVAL_RULES:
            if not frappe.db.exists("Aqar Approval Rule", rule_name) and frappe.db.exists("DocType", applies_to):
                frappe.get_doc({"doctype": "Aqar Approval Rule", "rule_name": rule_name, "active": 0,
                    "action": action, "applies_to": applies_to, "watched_field": field,
                    "threshold_type": threshold_type, "threshold_value": value,
                    "approver_role": "Aqar Manager"}).insert(ignore_permissions=True)
    for key, gate, description in FEATURE_FLAGS:
        if not frappe.db.exists("Aqar Feature Flag", key):
            frappe.get_doc({"doctype": "Aqar Feature Flag", "flag_key": key, "enabled": 0,
                "required_gate": gate, "audience": "Staff Only",
                "description": description}).insert(ignore_permissions=True)
