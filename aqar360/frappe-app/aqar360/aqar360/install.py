"""Idempotent foundation configuration; never changes upstream source files."""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

ROLE_MAP = {
    "Aqar Admin": True, "Aqar Manager": True, "Aqar Team Lead": False,
    "Aqar Opportunity Staff": False, "Aqar Content Coordinator": False,
    "Aqar Marketing": False, "Aqar Finance": True, "Aqar HR": True,
    "Aqar Business Development": False, "Aqar Supplier": False,
    "Aqar Customer": False, "Aqar Viewer": False,
}
PRIVILEGED_NATIVE_ROLES = (
    "System Manager", "Accounts Manager", "Accounts User", "Accountant",
    "HR Manager", "HR User", "Payroll Manager", "Payroll User",
)


def configure_foundation():
    for name, mfa in ROLE_MAP.items():
        if not frappe.db.exists("Role", name):
            frappe.get_doc({"doctype": "Role", "role_name": name,
                "desk_access": int(name not in ("Aqar Supplier", "Aqar Customer")),
                "two_factor_auth": int(mfa), "is_custom": 1}).insert(ignore_permissions=True)
        elif mfa:
            frappe.db.set_value("Role", name, "two_factor_auth", 1)
    for name in PRIVILEGED_NATIVE_ROLES:
        if frappe.db.exists("Role", name):
            frappe.db.set_value("Role", name, "two_factor_auth", 1)
    settings = frappe.get_single("System Settings")
    settings.language = settings.language or "en"
    settings.time_zone = settings.time_zone or "Asia/Muscat"
    settings.update({
        "enable_two_factor_auth": 1, "two_factor_method": "OTP App",
        "bypass_2fa_for_retricted_ip_users": 0, "session_expiry": "02:00",
        "enable_password_policy": 1, "minimum_password_score": "3",
        "allow_guests_to_upload_files": 0,
        "only_allow_system_managers_to_upload_public_files": 1,
        "allow_error_traceback": 0, "encrypt_backup": 1,
    })
    settings.save(ignore_permissions=True)
    # Frappe enables the All role when globally switching on MFA; scope it to staff roles.
    frappe.db.set_value("Role", "All", "two_factor_auth", 0)
    # Repair a missing upstream Dynamic Link discriminator without source edits.
    make_property_setter("Property", "owner_link", "options", "custom_aqar_owner_type",
        "Data", validate_fields_for_doctype=False)
    # Property Feature stores free-text feature/value rows, not Link selections.
    make_property_setter("Property", "amenities", "fieldtype", "Table", "Select",
        validate_fields_for_doctype=False)
    create_custom_fields({
        "CRM Lead": [{"fieldname": "custom_aqar_contact", "label": "Aqar Contact",
            "fieldtype": "Link", "options": "Contact", "insert_after": "lead_name"}],
        "Property": [
            {"fieldname": "custom_aqar_owner_type", "label": "Aqar Owner Type",
                "fieldtype": "Select", "options": "Customer\nSupplier\nCompany",
                "default": "Customer", "insert_after": "owner_link"},
            {"fieldname": "custom_aqar_owner_contact", "label": "Aqar Owner Contact",
                "fieldtype": "Link", "options": "Contact", "insert_after": "owner_link"},
        ],
    }, update=True)
    for doctype in ("Contact", "CRM Lead", "CRM Deal", "Property", "Property Unit"):
        if not frappe.get_meta(doctype).track_changes:
            make_property_setter(doctype, None, "track_changes", 1, "Check", for_doctype=True)
    # before_install runs before Aqar DocTypes are synced; seeding waits for after_install/migrate.
    if frappe.db.table_exists("Aqar Feature Flag"):
        from aqar360.core.seed import seed_reference_data
        seed_reference_data()
    if frappe.db.table_exists("Aqar Opportunity Intake"):
        from aqar360.intake.workflow import ensure_review_workflow
        ensure_review_workflow()
    if frappe.db.table_exists("Aqar Development Project"):
        from aqar360.registry.fields import ensure_registry_fields
        ensure_registry_fields()
        if frappe.get_meta("Aqar Development Project").has_field("slug"):
            from aqar360.aqar_360.doctype.aqar_development_project.aqar_development_project import ensure_slugs
            ensure_slugs()
    if frappe.db.table_exists("Aqar Content Order"):
        from aqar360.commerce.setup import ensure_commerce_setup
        ensure_commerce_setup()
    if frappe.db.table_exists("Aqar Message Template"):
        from aqar360.messaging.seed import seed_message_templates
        seed_message_templates()
    # Customer emails carry the company's own wording, not the "Sent via ERPNext" footer.
    if frappe.get_meta("System Settings").has_field("disable_standard_email_footer"):
        frappe.db.set_single_value("System Settings", "disable_standard_email_footer", 1)
    frappe.clear_cache()






def configure_local_mail():
    if frappe.local.site != "staging.localhost":
        raise RuntimeError("Mail capture is restricted to local staging")
    name = "Aqar Local Mail Capture"
    if not frappe.db.exists("Email Account", name):
        account = frappe.get_doc({
            "doctype": "Email Account", "email_account_name": name,
            "email_id": "no-reply@aqar360.invalid", "service": "",
            "enable_incoming": 0, "enable_outgoing": 1, "default_outgoing": 1,
            "smtp_server": "mailpit", "smtp_port": "1025", "use_tls": 0,
            "use_ssl_for_outgoing": 0, "no_smtp_authentication": 1,
            "always_use_account_email_id_as_sender": 1,
        })
        account.insert(ignore_permissions=True)

