import uuid

import frappe
from frappe.model.workflow import apply_workflow
from frappe.tests import IntegrationTestCase as FrappeTestCase
from frappe.utils import add_days, today

from aqar360.core.seed import seed_reference_data
from aqar360.registry.constants import match_state
from aqar360.registry.lifecycle import get_property_timeline, mark_stale_registry, mark_verified, property_dashboard


def area(name="Al Khoudh"):
    return frappe.db.get_value("Aqar Area", {"area_name_en": name})


def make_property(**overrides):
    values = {"doctype": "Property", "property_code": "T-" + uuid.uuid4().hex[:8].upper(),
        "property_name": "Test Villa", "property_type": "Residential", "country": "Oman",
        "custom_aqar_property_kind": "Villa", "custom_aqar_area": area(), "custom_aqar_listing_purpose": "Sale",
        "custom_aqar_sale_price": 150000}
    values.update(overrides)
    return frappe.get_doc(values).insert()


def make_project(**overrides):
    values = {"doctype": "Aqar Development Project", "project_name": "Test Gardens " + uuid.uuid4().hex[:6],
        "developer_name": "Test Developer LLC", "area": area("Al Mawaleh"), "construction_status": "Under Construction",
        "unit_types": [
            {"unit_type": "2 Bedrooms", "size_from_sqm": 110, "price_from": 62000, "price_to": 70000},
            {"unit_type": "3 Bedrooms", "size_from_sqm": 150, "price_from": 85000, "price_to": 98000,
                "available_units": "4"},
        ]}
    values.update(overrides)
    return frappe.get_doc(values).insert()


class TestRegistry(FrappeTestCase):
    def setUp(self):
        seed_reference_data()

    def test_accepted_intake_registers_property_once(self):
        intake = frappe.get_doc({"doctype": "Aqar Opportunity Intake", "request_type": "Let",
            "property_type": "Apartment", "area": area(), "submitted_name": "Owner Test", "asking_price": 280,
            "bedrooms": 2, "bathrooms": 2, "size_sqm": 120, "accuracy_declaration": 1}).insert()
        for action in ("Start Review", "Accept"):
            intake = apply_workflow(intake, action)
        intake.reload()
        self.assertTrue(intake.property)
        prop = frappe.get_doc("Property", intake.property)
        self.assertTrue(prop.property_code.startswith("AQP-"))
        self.assertEqual((prop.custom_aqar_listing_purpose, prop.custom_aqar_rent_price), ("Rent", 280))
        self.assertIsNone(prop.custom_aqar_sale_price or None)
        self.assertEqual(prop.custom_aqar_verification_status, "Unverified")
        self.assertEqual(prop.custom_aqar_intake, intake.name)
        from aqar360.registry.lifecycle import register_property_from_intake
        self.assertEqual(register_property_from_intake(intake), prop.name)
        self.assertTrue(frappe.db.exists("Aqar Audit Event", {"action": "Property Registered", "reference_name": prop.name}))

    def test_price_history_is_append_only(self):
        prop = make_property()
        prop.custom_aqar_sale_price = 135000
        prop.save()
        changes = frappe.get_all("Aqar Price Change", filters={"reference_name": prop.name},
            fields=["name", "direction", "old_value", "new_value", "change_pct"], order_by="changed_at")
        self.assertEqual([c.direction for c in changes], ["Set", "Decrease"])
        self.assertEqual(changes[1].change_pct, -10)
        row = frappe.get_doc("Aqar Price Change", changes[1].name)
        row.new_value = 1
        with self.assertRaises(frappe.PermissionError):
            row.save(ignore_permissions=True)

    def test_verification_and_freshness(self):
        prop = make_property(custom_aqar_verification_status="Verified", custom_aqar_reverify_after_days=30)
        self.assertEqual(str(prop.custom_aqar_last_verified), today())
        self.assertEqual(prop.custom_aqar_verified_by, "Administrator")
        frappe.db.set_value("Property", prop.name, "custom_aqar_last_verified", add_days(today(), -31))
        mark_stale_registry()
        self.assertEqual(frappe.db.get_value("Property", prop.name, "custom_aqar_verification_status"),
            "Needs Reverification")
        mark_verified("Property", prop.name)
        self.assertEqual(frappe.db.get_value("Property", prop.name, "custom_aqar_verification_status"), "Verified")

    def test_reactivation_requires_reverification(self):
        project = make_project(verification_status="Verified", sales_availability="Sold Out")
        self.assertEqual(match_state(project.sales_availability, project.verification_status), "excluded")
        project.sales_availability = "Active"
        project.save()
        self.assertEqual(project.verification_status, "Needs Reverification")
        self.assertEqual(match_state(project.sales_availability, project.verification_status), "stale")
        self.assertEqual(match_state("Limited", "Verified"), "ok")

    def test_project_price_range_unknown_units_and_duplicates(self):
        project = make_project()
        self.assertEqual((project.price_from, project.price_to), (62000, 98000))
        self.assertFalse(project.unit_types[0].available_units)  # unknown stays blank, never zero
        self.assertEqual(project.unit_types[0].bedrooms, 2)
        self.assertEqual(project.foreign_ownership, "Unknown")
        with self.assertRaises(frappe.ValidationError):
            make_project(project_name=project.project_name.upper() + " ")
        with self.assertRaises(frappe.ValidationError):
            make_project(unit_types=[{"unit_type": "Studio", "available_units": "a few"}])

    def test_units_inherit_project_and_area(self):
        project = make_project()
        prop = make_property(property_name="Tower A", custom_aqar_project=project.name, custom_aqar_area=area("Al Mawaleh"))
        unit = frappe.get_doc({"doctype": "Property Unit", "property": prop.name, "unit_number": "A-101",
            "custom_aqar_unit_type": "2 Bedrooms", "sale_price": 64000}).insert()
        self.assertEqual(unit.custom_aqar_project, project.name)
        self.assertEqual(unit.custom_aqar_area, area("Al Mawaleh"))
        self.assertTrue(frappe.db.exists("Aqar Price Change", {"reference_name": unit.name, "price_field": "sale_price"}))

    def test_property_timeline_and_dashboard(self):
        prop = make_property()
        prop.custom_aqar_sale_price = 140000
        prop.custom_aqar_sales_availability = "Paused"
        prop.save()
        kinds = {event["kind"] for event in get_property_timeline(prop.name)}
        self.assertTrue({"audit", "price"} <= kinds)
        frappe.set_user("Guest")
        try:
            with self.assertRaises(frappe.PermissionError):
                get_property_timeline(prop.name)
        finally:
            frappe.set_user("Administrator")
        dashboard = property_dashboard({})
        self.assertIn("Aqar Price Change", dashboard.transactions[-1]["items"])

    def test_staff_roles_can_work_with_supply(self):
        self.assertTrue(frappe.permissions.has_permission("Property", "write", user=self._user("Aqar Opportunity Staff")))
        self.assertFalse(frappe.permissions.has_permission("Property", "write", user=self._user("Aqar Marketing")))
        self.assertTrue(frappe.permissions.has_permission("Property", "read", user=self._user("Aqar Marketing")))
        for doctype in ("Property", "Property Unit", "Aqar Development Project", "Aqar Price Change"):
            self.assertFalse(frappe.permissions.has_permission(doctype, "read", user="Guest"), doctype)

    def _user(self, role):
        email = f"m3-{frappe.scrub(role)}@aqar360.invalid"
        if not frappe.db.exists("User", email):
            frappe.get_doc({"doctype": "User", "email": email, "first_name": role, "send_welcome_email": 0,
                "roles": [{"role": role}]}).insert(ignore_permissions=True)
        return email
