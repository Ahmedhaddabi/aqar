import frappe
from frappe.tests import IntegrationTestCase as FrappeTestCase
from frappe.twofactor import two_factor_is_enabled_for_

from aqar360.install import configure_foundation, ROLE_MAP


class TestFoundation(FrappeTestCase):
    def test_idempotent_role_configuration_and_mfa(self):
        configure_foundation()
        configure_foundation()
        self.assertTrue(frappe.get_system_settings("enable_two_factor_auth"))
        self.assertEqual(frappe.get_system_settings("session_expiry"), "02:00")
        self.assertFalse(two_factor_is_enabled_for_(frappe._dict(roles=[frappe._dict(role="Aqar Customer")])))
        for role, mandatory in ROLE_MAP.items():
            self.assertTrue(frappe.db.exists("Role", role))
            if mandatory:
                user = frappe._dict(roles=[frappe._dict(role=role)])
                self.assertTrue(two_factor_is_enabled_for_(user))

    def test_person_master_uses_existing_entities(self):
        field = frappe.get_meta("CRM Lead").get_field("custom_aqar_contact")
        self.assertEqual(field.options, "Contact")
        self.assertEqual(frappe.get_meta("CRM Deal").get_field("contact").options, "Contact")
        self.assertEqual(frappe.get_meta("Property").get_field("custom_aqar_project").options,
            "Aqar Development Project")  # ADR-021

    def test_guest_has_no_internal_inventory_permission(self):
        for doctype in ("Property", "Property Unit", "CRM Lead", "Aqar Platform Settings"):
            self.assertFalse(frappe.has_permission(doctype, "read", user="Guest"))

    def test_legal_and_phase_gates_are_server_enforced(self):
        settings = frappe.get_doc({"doctype": "Aqar Platform Settings",
            "legal_approval_status": "Pending Legal Approval", "real_personal_data_allowed": 1})
        with self.assertRaises(frappe.ValidationError):
            settings.validate()
        settings.real_personal_data_allowed = 0
        for field in ("phase_2_enabled", "phase_3_enabled", "public_ai_enabled"):
            settings.set(field, 1)
            with self.assertRaises(frappe.ValidationError):
                settings.validate()
            settings.set(field, 0)

    def test_entity_change_tracking(self):
        for doctype in ("Contact", "CRM Lead", "CRM Deal", "Property", "Property Unit"):
            self.assertTrue(frappe.get_meta(doctype).track_changes)

    def test_legacy_portal_methods_are_denied(self):
        from aqar360.security import legacy_portal_disabled
        overrides = frappe.get_hooks("override_whitelisted_methods")
        for method in (
            "real_estate.www.tenant-portal.index.submit_maintenance_request",
            "real_estate.www.tenant-portal.index.get_invoice_pdf",
        ):
            self.assertIn("aqar360.security.legacy_portal_disabled", overrides[method])
        with self.assertRaises(frappe.PermissionError):
            legacy_portal_disabled(unit_name="unowned-unit")

    def test_extended_property_schema_is_valid(self):
        from frappe.core.doctype.doctype.doctype import validate_fields_for_doctype
        validate_fields_for_doctype("Property")
        meta = frappe.get_meta("Property")
        self.assertEqual(meta.get_field("owner_link").options, "custom_aqar_owner_type")
        self.assertEqual(meta.get_field("amenities").fieldtype, "Table")

