import uuid

import frappe
from frappe.tests import IntegrationTestCase as FrappeTestCase

from aqar360.api import content
from aqar360.core.seed import seed_reference_data
from aqar360.tests.test_matching import area


def make_page(**overrides):
    slug = "test-" + uuid.uuid4().hex[:8]
    values = {"doctype": "Aqar Content Page", "page_type": "Renting Guide", "slug": slug, "published": 1,
        "title_ar": "دليل الاستئجار", "title_en": "Renting guide", "summary_ar": "ملخص الإجابة",
        "summary_en": "Answer summary", "body_ar": "<p>نص</p>", "body_en": "<p>Body</p>",
        "facts_en": "Who: Tenants\nPrice range: 200-300 OMR", "faqs": [{"question_ar": "س", "answer_ar": "ج",
            "question_en": "Q?", "answer_en": "A."}]}
    values.update(overrides)
    return frappe.get_doc(values).insert()


class TestContentApi(FrappeTestCase):
    def setUp(self):
        seed_reference_data()
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_publishing_rules(self):
        with self.assertRaises(frappe.ValidationError):
            make_page(slug="Bad Slug!")
        with self.assertRaises(frappe.ValidationError):
            make_page(body_en="")  # both languages before publishing
        with self.assertRaises(frappe.ValidationError):
            make_page(page_type="Market Insight")  # sources required
        with self.assertRaises(frappe.ValidationError):
            make_page(page_type="Area Guide")  # area required
        page = make_page()
        self.assertEqual(page.reviewed_by, "Administrator")
        self.assertTrue(page.last_reviewed)

    def test_guest_reads_published_content_only(self):
        page = make_page()
        draft = make_page(published=0)
        frappe.set_user("Guest")
        slugs = [p["slug"] for p in content.list_pages(language="en")]
        self.assertIn(page.slug, slugs)
        self.assertNotIn(draft.slug, slugs)
        full = content.get_page(slug=page.slug, language="en")
        self.assertEqual(full["facts"], [{"label": "Who", "value": "Tenants"},
            {"label": "Price range", "value": "200-300 OMR"}])
        self.assertEqual(full["faqs"][0]["question"], "Q?")
        self.assertNotIn("reviewed_by", full)
        self.assertEqual(content.get_page(slug=draft.slug)["error"]["code"], "not_found")
        self.assertEqual(content.get_page(slug=page.slug, language="ar")["title"], "دليل الاستئجار")

    def test_body_html_is_sanitized(self):
        page = make_page()
        frappe.db.set_value("Aqar Content Page", page.name, "body_en", '<p>ok</p><script>alert(1)</script>')
        frappe.set_user("Guest")
        self.assertNotIn("<script", content.get_page(slug=page.slug, language="en")["body"])

    def test_areas_only_link_guides_that_exist(self):
        make_page(page_type="Area Guide", slug="al-khoudh-test-" + uuid.uuid4().hex[:4], area=area())
        frappe.set_user("Guest")
        areas = {a["name"]: a for a in content.list_areas(language="ar")}
        self.assertTrue(areas["الخوض"]["guide_slug"])
        self.assertEqual(areas["الخوض"]["slug"], "al-khoudh")
        self.assertIsNone(areas["القرم"]["guide_slug"])

    def test_services_policy_and_sitemap(self):
        frappe.set_user("Guest")
        if frappe.defaults.get_global_default("company"):
            services = {s["code"]: s for s in content.list_services(language="ar")}
            self.assertEqual(services["AQ-PHOTOS"]["name"], "صور احترافية")
            self.assertNotIn("AQ-MEDIA-BUDGET", services)
        privacy = content.get_policy(slug="privacy", language="ar")
        self.assertEqual(privacy["policy_type"], "Privacy Policy")
        self.assertIn(privacy["available"], (True, False))
        if privacy["available"]:
            self.assertTrue(privacy["body"])
        self.assertEqual(content.get_policy(slug="no-such-policy")["error"]["code"], "not_found")
        self.assertIsInstance(content.sitemap_entries(), list)
        self.assertIsInstance(content.list_jobs(), list)
