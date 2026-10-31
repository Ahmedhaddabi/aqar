import frappe

from aqar360.api import public
from aqar360.aqar_360.report.aqar_daily_workbench import aqar_daily_workbench as workbench
from aqar360.aqar_360.report.aqar_website_enquiries import aqar_website_enquiries as enquiries
from aqar360.matching.engine import match_request
from aqar360.tests.test_intake import IntakeTestCase, search_payload
from aqar360.tests.test_matching import make_supply
from aqar360.tests.test_registry import area, make_project, make_property

PUBLIC = {"visibility": "Selected Public Page", "verification_status": "Verified"}
ASKED = "The customer asked about this listing on the website"


class TestWebsiteInterest(IntakeTestCase):
    """Register interest / Ask on the website → structured fields on the request and a match staff can act on."""

    def setUp(self):
        super().setUp()
        frappe.set_user("Administrator")
        self.project = make_project(**PUBLIC)
        prop = make_property(property_name="Tower B", custom_aqar_project=self.project.name,
            custom_aqar_area=area("Al Mawaleh"))
        for number, price in (("B-101", 64000), ("B-201", 92000)):
            frappe.get_doc({"doctype": "Property Unit", "property": prop.name, "unit_number": number,
                "custom_aqar_unit_type": "2 Bedrooms", "sale_price": price}).insert()
        self.unit = frappe.db.get_value("Property Unit", {"property": prop.name, "unit_number": "B-201"})
        frappe.set_user("Guest")

    def submit_interest(self, **overrides):
        payload = search_payload(purpose="Buy", property_type="Project", areas=[area("Al Mawaleh")], budget_min=None,
            budget_max=70000, interest_type="project", interest_id=self.project.name,
            source_page=f"/en/projects/{self.project.slug}")
        payload.update(overrides)
        result = self.submit(public.submit_search_request, payload)
        frappe.set_user("Administrator")
        return frappe.get_doc("Aqar Search Request", result["request_number"])

    def matches(self, req):
        return {m.supply_name: m for m in frappe.get_all("Aqar Match", filters={"search_request": req.name},
            fields=["supply_name", "match_type", "status", "reasons", "score"])}

    def test_project_interest_is_recorded_and_fitting_units_are_flagged(self):
        req = self.submit_interest()
        self.assertEqual((req.interested_doctype, req.interested_in, req.interested_unit),
            ("Aqar Development Project", self.project.name, None))
        self.assertEqual(req.source_page, f"/en/projects/{self.project.slug}")
        mine = set(frappe.get_all("Property Unit", filters={"custom_aqar_project": self.project.name}, pluck="name"))
        fitting = [m for name, m in self.matches(req).items() if name in mine]
        self.assertEqual(len(fitting), 1)  # B-101 at 64,000; B-201 is above the budget and its tolerance
        self.assertEqual(fitting[0].match_type, "Within Budget")
        self.assertTrue(fitting[0].reasons.startswith(ASKED))
        others = [m for name, m in self.matches(req).items() if name not in mine]
        self.assertFalse(any(m.reasons.startswith(ASKED) for m in others))  # other supply is not flagged

    def test_unit_outside_the_criteria_still_reaches_staff_and_stays(self):
        req = self.submit_interest(interest_unit="B-201", budget_max=30000)
        self.assertEqual(req.interested_unit, self.unit)
        match = self.matches(req)[self.unit]
        self.assertEqual((match.match_type, match.status, match.score), ("Customer Interest", "Suggested", 0))
        match_request(req.name)  # re-matching must not withdraw what the customer asked about
        self.assertEqual(self.matches(req)[self.unit].status, "Suggested")

    def test_listings_that_are_not_public_are_ignored_without_failing(self):
        frappe.set_user("Administrator")
        internal = make_project(verification_status="Verified")
        frappe.set_user("Guest")
        req = self.submit_interest(interest_id=internal.name, interest_unit="B-201")
        self.assertFalse(req.interested_in)
        self.assertFalse(req.interested_unit)

    def test_property_interest(self):
        frappe.set_user("Administrator")
        prop = make_supply(450, custom_aqar_visibility="Selected Public Page")
        frappe.set_user("Guest")
        req = self.submit_interest(purpose="Rent", property_type="Apartment", areas=[area()], budget_max=300,
            interest_type="property", interest_id=prop.name)
        self.assertEqual((req.interested_doctype, req.interested_in), ("Property", prop.name))
        self.assertEqual(self.matches(req)[prop.name].match_type, "Customer Interest")  # 450 is above 300 + 20%

    def test_workbench_and_report_show_the_interest(self):
        req = self.submit_interest(interest_unit="B-201")
        row = next(r for r in workbench.execute({})[1] if r["record"] == req.name)
        self.assertEqual(row["asked_about"], f"{self.project.project_name} / B-201")
        self.assertIn("B-201", row["next_action"])  # no first response yet: call about the unit
        data = enquiries.execute({})[1]
        mine = next(d for d in data if d["listing"] == self.project.name)
        self.assertEqual((mine["enquiries"], mine["unit_enquiries"], mine["open"]), (1, 1, 1))
        self.assertEqual(mine["top_page"], f"/en/projects/{self.project.slug}")
