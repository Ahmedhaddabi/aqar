import uuid

import frappe
from frappe.tests import IntegrationTestCase as FrappeTestCase

from aqar360.api import content
from aqar360.core.seed import seed_reference_data
from aqar360.tests.test_registry import area, make_project, make_property

PUBLIC = {"visibility": "Selected Public Page", "verification_status": "Verified"}


def unit(prop, number, unit_type="2 Bedrooms", price=64000, **values):
    return frappe.get_doc({"doctype": "Property Unit", "property": prop, "unit_number": number,
        "custom_aqar_unit_type": unit_type, "sale_price": price, **values}).insert()


class TestProjectPages(FrappeTestCase):
    def setUp(self):
        seed_reference_data()

    def test_slug_is_generated_and_unique(self):
        name = "Slug Gardens " + uuid.uuid4().hex[:6]
        first = make_project(project_name=name)
        second = make_project(project_name=name, developer_name="Another Developer LLC")
        self.assertEqual(first.slug, frappe.scrub(name).replace("_", "-"))
        self.assertEqual(second.slug, first.slug + "-2")
        first.save()
        self.assertEqual(first.reload().slug, frappe.scrub(name).replace("_", "-"))

    def test_public_project_page_with_live_units_and_gallery(self):
        project = make_project(latitude=23.59, longitude=58.25, cover_image="/files/cover.jpg",
            description="<p>English text</p><script>alert(1)</script>", description_ar="<p>نص عربي</p>",
            payment_plan="10% booking\n90% on handover", payment_plan_ar="10% عند الحجز\n90% عند التسليم",
            foreign_ownership="Eligible (Verified)",
            brochure="/private/files/brochure.pdf",
            gallery=[{"image": "/files/g1.jpg", "caption": "Lobby", "caption_ar": "الردهة"},
                {"image": "/private/files/internal.jpg", "caption": "Internal"}], **PUBLIC)
        prop = make_property(property_name="Tower A", custom_aqar_project=project.name, custom_aqar_area=area("Al Mawaleh"))
        unit(prop.name, "A-101")
        unit(prop.name, "A-102", status="Reserved")
        unit(prop.name, "A-103", custom_aqar_sales_availability="Sold Out")
        unit(prop.name, "A-104", custom_aqar_sales_availability="Withdrawn")

        page = content.get_project(slug=project.slug, language="ar")
        self.assertEqual(page["description"], "<p>نص عربي</p>")
        self.assertEqual(page["payment_plan"], "10% عند الحجز\n90% عند التسليم")
        self.assertEqual([g["image"] for g in page["gallery"]], ["/files/cover.jpg", "/files/g1.jpg"])
        self.assertEqual(page["gallery"][1]["caption"], "الردهة")
        self.assertIsNone(page["brochure"])  # private files never reach the website
        self.assertTrue(page["foreign_ownership_eligible"])
        self.assertEqual(page["area"]["name"], "الموالح")
        self.assertEqual([(u["number"], u["state"]) for u in page["unit_list"]],
            [("A-101", "available"), ("A-102", "reserved"), ("A-103", "sold")])
        types = {t["type"]: t["available"] for t in page["units"]}
        self.assertEqual(types, {"2 Bedrooms": "1", "3 Bedrooms": "4"})  # live count, then the typed number
        self.assertEqual(page["available_units"], 5)
        english = content.get_project(slug=project.slug, language="en")
        self.assertNotIn("<script>", english["description"])

    def test_only_public_projects_are_listed_or_reachable(self):
        public = make_project(**PUBLIC)
        internal = make_project(verification_status="Verified")
        slugs = [p["slug"] for p in content.list_projects(language="en")]
        self.assertIn(public.slug, slugs)
        self.assertNotIn(internal.slug, slugs)
        self.assertEqual(content.get_project(slug=internal.slug, language="en")["error"]["code"], "not_found")
        sitemap = [(e["section"], e["slug"]) for e in content.sitemap_entries()]
        self.assertIn(("projects", public.slug), sitemap)
        self.assertNotIn(("projects", internal.slug), sitemap)

    def test_map_projects_link_to_their_page(self):
        project = make_project(latitude=23.59, longitude=58.25, **PUBLIC)
        item = next(i for i in content.get_map_data(language="en")["listings"] if i["id"] == project.name)
        self.assertEqual(item["slug"], project.slug)
