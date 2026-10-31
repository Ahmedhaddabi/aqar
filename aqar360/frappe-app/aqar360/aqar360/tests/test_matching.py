import uuid

import frappe
from frappe.tests import IntegrationTestCase as FrappeTestCase

from aqar360.core.seed import seed_reference_data
from aqar360.matching.actions import update_match
from aqar360.matching.engine import match_request, rematch_request


def area(name="Al Khoudh"):
    return frappe.db.get_value("Aqar Area", {"area_name_en": name})


def make_request(**overrides):
    values = {"doctype": "Aqar Search Request", "submitted_name": "Matching Test", "purpose": "Rent",
        "property_type": "Apartment", "areas": [{"area": area()}], "budget_max": 300, "bedrooms_min": 2,
        "timing": "Within 1 Month"}
    values.update(overrides)
    return frappe.get_doc(values).insert()


def make_supply(price=280, purpose="Rent", **overrides):
    values = {"doctype": "Property", "property_code": "MT-" + uuid.uuid4().hex[:8].upper(),
        "property_name": "Matching Flat", "property_type": "Residential", "country": "Oman",
        "custom_aqar_property_kind": "Apartment", "custom_aqar_area": area(), "custom_aqar_listing_purpose": purpose,
        "custom_aqar_bedrooms": 2, "custom_aqar_verification_status": "Verified",
        ("custom_aqar_rent_price" if purpose == "Rent" else "custom_aqar_sale_price"): price}
    values.update(overrides)
    return frappe.get_doc(values).insert()


def match_for(request, supply_name):
    rows = frappe.get_all("Aqar Match", filters={"search_request": request, "supply_name": supply_name},
        fields=["name", "status", "match_type", "score", "reasons", "warnings", "supply_row", "unit_type"])
    return rows[0] if rows else None


def staff_user(role):
    email = f"m4-{frappe.scrub(role)}@aqar360.invalid"
    if not frappe.db.exists("User", email):
        frappe.get_doc({"doctype": "User", "email": email, "first_name": role, "send_welcome_email": 0,
            "roles": [{"role": role}]}).insert(ignore_permissions=True)
    return email


class TestMatchingEngine(FrappeTestCase):
    def setUp(self):
        seed_reference_data()

    def test_within_budget_match_with_reasons(self):
        req = make_request()
        prop = make_supply(280)
        match = match_for(req.name, prop.name)
        self.assertEqual((match.status, match.match_type, match.score), ("Suggested", "Within Budget", 100))
        self.assertIn("Within budget", match.reasons)
        self.assertEqual(frappe.db.get_value("Aqar Search Request", req.name, "status"), "Potential Match")

    def test_budget_rules_near_match_tolerance_and_low_price(self):
        req = make_request(budget_min=200)
        strict = make_request(budget_min=200, budget_tolerance_pct=0)
        near, too_high, cheap = make_supply(330), make_supply(361), make_supply(150)
        match = match_for(req.name, near.name)
        self.assertEqual((match.match_type, match.score), ("Near Match", 80))
        self.assertIn("10.0% above budget", match.warnings)
        self.assertIsNone(match_for(req.name, too_high.name))
        self.assertIsNone(match_for(strict.name, near.name))
        self.assertEqual(match_for(req.name, cheap.name).match_type, "Within Budget")  # below budget_min still fits

    def test_location_purpose_and_type_rules(self):
        req = make_request()
        nearby = make_supply(280, custom_aqar_area=area("Al Mawaleh"))
        elsewhere = make_supply(280, custom_aqar_area=area("Al Qurum"))
        for_sale = make_supply(280, purpose="Sale")
        villa = make_supply(280, custom_aqar_property_kind="Villa")
        self.assertEqual(match_for(req.name, nearby.name).score, 85)
        self.assertIn("same wilayat", match_for(req.name, nearby.name).reasons)
        for supply in (elsewhere, for_sale, villa):
            self.assertIsNone(match_for(req.name, supply.name), supply.property_code)

    def test_price_drop_rematches_and_alerts_staff(self):
        user = staff_user("Aqar Opportunity Staff")
        req = make_request()
        prop = make_supply(400)
        self.assertIsNone(match_for(req.name, prop.name))
        prop.custom_aqar_rent_price = 290
        prop.save()
        self.assertEqual(match_for(req.name, prop.name).status, "Suggested")
        self.assertTrue(frappe.db.exists("Aqar Price Change", {"reference_name": prop.name, "direction": "Decrease"}))
        alert = frappe.get_all("Notification Log", filters={"for_user": user, "document_name": prop.name},
            pluck="subject")
        self.assertTrue(any("Price drop" in subject for subject in alert), alert)

    def test_sold_out_withdraws_and_reactivation_requires_reverification(self):
        req = make_request()
        prop = make_supply(280)
        prop.custom_aqar_sales_availability = "Sold Out"
        prop.save()
        self.assertEqual(match_for(req.name, prop.name).status, "Withdrawn")
        prop.reload()
        prop.custom_aqar_sales_availability = "Active"
        prop.save()
        match = match_for(req.name, prop.name)
        self.assertEqual(match.status, "Suggested")
        self.assertIn("verify before approval", match.warnings)
        with self.assertRaises(frappe.ValidationError):
            update_match(match.name, "approve")

    def test_project_unit_type_matching_and_foreign_ownership(self):
        project = frappe.get_doc({"doctype": "Aqar Development Project",
            "project_name": "Matching Heights " + uuid.uuid4().hex[:6], "developer_name": "Test Developer LLC",
            "area": area("Al Mawaleh"), "construction_status": "Ready", "verification_status": "Verified",
            "unit_types": [{"unit_type": "2 Bedrooms", "price_from": 62000, "price_to": 66000},
                {"unit_type": "3 Bedrooms", "price_from": 85000, "price_to": 90000}]}).insert()
        req = make_request(purpose="Buy", budget_max=65000, areas=[{"area": area("Al Mawaleh")}],
            foreign_ownership_required=1, request_kind="Investment Mandate")
        rows = frappe.get_all("Aqar Match", filters={"search_request": req.name, "project": project.name},
            fields=["unit_type", "warnings", "supply_doctype"])
        self.assertEqual([r.unit_type for r in rows], ["2 Bedrooms"])
        self.assertEqual(rows[0].supply_doctype, "Aqar Development Project")
        self.assertIn("Foreign ownership eligibility not verified", rows[0].warnings)
        project.foreign_ownership = "Not Eligible (Verified)"
        project.save()
        self.assertEqual(frappe.get_all("Aqar Match", filters={"search_request": req.name, "project": project.name},
            pluck="status"), ["Withdrawn"])


class TestMatchDecisions(FrappeTestCase):
    def setUp(self):
        seed_reference_data()

    def test_approval_requires_verified_supply_and_seniority_for_off_market(self):
        req = make_request()
        unverified = make_supply(280, custom_aqar_verification_status="Unverified")
        off_market = make_supply(285, custom_aqar_visibility="Off-Market Confidential")
        normal = make_supply(290)
        staff, lead = staff_user("Aqar Opportunity Staff"), staff_user("Aqar Team Lead")
        try:
            frappe.set_user(staff)
            with self.assertRaises(frappe.ValidationError):
                update_match(match_for(req.name, unverified.name).name, "approve")
            with self.assertRaises(frappe.PermissionError):
                update_match(match_for(req.name, off_market.name).name, "approve")
            self.assertEqual(update_match(match_for(req.name, normal.name).name, "review"), "Team Reviewed")
            self.assertEqual(update_match(match_for(req.name, normal.name).name, "approve"), "Approved")
            frappe.set_user(lead)
            self.assertEqual(update_match(match_for(req.name, off_market.name).name, "approve"), "Approved")
            with self.assertRaises(frappe.ValidationError):
                update_match(match_for(req.name, unverified.name).name, "reject")  # reason required
            self.assertEqual(update_match(match_for(req.name, unverified.name).name, "reject", reason="Price"),
                "Rejected")
            self.assertEqual(update_match(match_for(req.name, normal.name).name, "mark_sent", channel="WhatsApp"),
                "Sent")
        finally:
            frappe.set_user("Administrator")
        self.assertEqual(frappe.db.get_value("Aqar Search Request", req.name, "status"), "Client Contacted")
        doc = frappe.get_doc("Aqar Match", match_for(req.name, off_market.name).name)
        doc.status = "Sent"
        with self.assertRaises(frappe.ValidationError):
            doc.save()

    def test_rematch_is_idempotent_and_keeps_staff_decisions(self):
        req = make_request()
        prop = make_supply(280)
        update_match(match_for(req.name, prop.name).name, "reject", reason="Customer Not Interested")
        before = frappe.db.count("Aqar Match", {"search_request": req.name})
        rematch_request(req.name)
        match_request(req.name)
        self.assertEqual(frappe.db.count("Aqar Match", {"search_request": req.name}), before)
        self.assertEqual(match_for(req.name, prop.name).status, "Rejected")

    def test_closed_request_withdraws_open_matches(self):
        req = make_request()
        prop = make_supply(280)
        self.assertEqual(match_for(req.name, prop.name).status, "Suggested")
        req.reload()
        req.status = "Closed"
        req.save()
        self.assertEqual(match_for(req.name, prop.name).status, "Withdrawn")

    def test_guest_cannot_see_matches(self):
        self.assertFalse(frappe.has_permission("Aqar Match", "read", user="Guest"))
