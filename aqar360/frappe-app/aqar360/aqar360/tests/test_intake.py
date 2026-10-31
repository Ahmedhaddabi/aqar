import email
import random
import uuid
from unittest.mock import patch

import frappe
from frappe.model.workflow import apply_workflow
from frappe.tests import IntegrationTestCase as FrappeTestCase

from aqar360.api import public
from aqar360.core.consent import has_consent
from aqar360.core.seed import seed_reference_data


def queued_text(reference_name):
    """Decoded text of the latest queued email for a record (Email Queue stores raw MIME)."""
    raw = frappe.get_all("Email Queue", filters={"reference_name": reference_name},
        fields=["message"], order_by="creation desc", limit=1)[0].message
    parts = email.message_from_string(raw).walk()
    return "".join(p.get_payload(decode=True).decode() for p in parts if p.get_content_type() == "text/plain")


def area(name="Al Khoudh"):
    return frappe.db.get_value("Aqar Area", {"area_name_en": name})


def unique_phone():
    return "9" + "".join(random.choices("0123456789", k=7))


def search_payload(**overrides):
    payload = {
        "full_name": "مريم الحارثي", "phone": unique_phone(),
        "email": f"m2-{uuid.uuid4().hex[:10]}@aqar360.invalid", "language": "ar",
        "purpose": "Rent", "property_type": "Apartment", "areas": [area()], "budget_min": 200,
        "budget_max": 300, "timing": "Within 1 Month", "preferred_channel": "Email",
        "match_alerts": True, "source_channel": "Website", "utm_source": "google",
        "idempotency_key": uuid.uuid4().hex,
    }
    payload.update(overrides)
    return payload


def intake_payload(**overrides):
    payload = {
        "full_name": "Salim Al Balushi", "phone": unique_phone(),
        "email": f"m2-owner-{uuid.uuid4().hex[:10]}@aqar360.invalid", "language": "ar",
        "request_type": "Sell", "property_type": "Villa", "area": area("Al Mawaleh"),
        "asking_price": 145000, "bedrooms": 5, "accuracy_declaration": True,
        "idempotency_key": uuid.uuid4().hex,
    }
    payload.update(overrides)
    return payload


class IntakeTestCase(FrappeTestCase):
    def setUp(self):
        seed_reference_data()
        flag = frappe.get_doc("Aqar Feature Flag", "public_request_forms")
        flag.enabled, flag.audience = 1, "Everyone"
        flag.save()
        frappe.set_user("Guest")

    def tearDown(self):
        frappe.set_user("Administrator")
        flag = frappe.get_doc("Aqar Feature Flag", "public_request_forms")
        flag.enabled, flag.audience = 0, "Staff Only"
        flag.save()

    def submit(self, fn, payload):
        result = fn(**payload)
        self.assertNotIn("error", result, result.get("error"))
        return result


class TestSearchRequestIntake(IntakeTestCase):
    def test_arabic_search_request_end_to_end(self):
        result = self.submit(public.submit_search_request, search_payload())
        self.assertTrue(result["request_number"].startswith("REQ-"))
        self.assertEqual(result["status"], "نبحث لك عن عقار")
        self.assertTrue(result["self_service_token"])
        frappe.set_user("Administrator")
        doc = frappe.get_doc("Aqar Search Request", result["request_number"])
        self.assertTrue(doc.contact)
        self.assertEqual(doc.source_channel, "Website")
        self.assertEqual(doc.utm_source, "google")
        self.assertEqual(doc.areas[0].area, area())
        self.assertEqual(doc.budget_tolerance_pct, 20)
        self.assertTrue(has_consent(doc.contact, "Request Updates", "Email"))
        self.assertTrue(has_consent(doc.contact, "Match Alerts", "Email"))
        self.assertFalse(has_consent(doc.contact, "Marketing", "Email"))
        self.assertTrue(frappe.db.exists("Aqar Audit Event",
            {"reference_doctype": "Aqar Search Request", "reference_name": doc.name, "action": "Created"}))
        self.assertTrue(frappe.db.exists("Email Queue",
            {"reference_doctype": "Aqar Search Request", "reference_name": doc.name}))
        self.assertTrue(frappe.has_permission("Aqar Search Request", "read", doc, user="Administrator"))

    def test_same_person_reuses_contact_and_keeps_both_sources(self):
        first = search_payload()
        second = search_payload(email=first["email"], phone=first["phone"], source_channel="Instagram",
            utm_source="instagram")
        a = self.submit(public.submit_search_request, first)
        b = self.submit(public.submit_search_request, second)
        frappe.set_user("Administrator")
        doc_a = frappe.get_doc("Aqar Search Request", a["request_number"])
        doc_b = frappe.get_doc("Aqar Search Request", b["request_number"])
        self.assertEqual(doc_a.contact, doc_b.contact)
        self.assertEqual({doc_a.source_channel, doc_b.source_channel}, {"Website", "Instagram"})
        self.assertFalse(doc_b.duplicate_candidate)

    def test_partial_match_is_flagged_not_merged(self):
        first = search_payload()
        a = self.submit(public.submit_search_request, first)
        b = self.submit(public.submit_search_request, search_payload(email=first["email"]))
        frappe.set_user("Administrator")
        doc_a = frappe.get_doc("Aqar Search Request", a["request_number"])
        doc_b = frappe.get_doc("Aqar Search Request", b["request_number"])
        self.assertNotEqual(doc_a.contact, doc_b.contact)
        self.assertEqual(doc_b.duplicate_candidate, doc_a.contact)
        self.assertEqual(doc_b.duplicate_review, "Needs Review")

    def test_idempotent_replay(self):
        payload = search_payload()
        first = self.submit(public.submit_search_request, payload)
        again = self.submit(public.submit_search_request, payload)
        self.assertEqual(first["request_number"], again["request_number"])
        self.assertTrue(again["duplicate_submission"])
        self.assertNotIn("self_service_token", again)
        self.assertEqual(frappe.db.count("Aqar Search Request", {"idempotency_key": payload["idempotency_key"]}), 1)

    def test_strict_validation(self):
        cases = {
            "is_admin": search_payload(is_admin=1),
            "phone": search_payload(phone="12"),
            "budget_min": search_payload(budget_min=500, budget_max=300),
            "areas": search_payload(areas=["NOT-AN-AREA"]),
            "email": search_payload(email="not-an-email"),
        }
        for field, payload in cases.items():
            result = public.submit_search_request(**payload)
            self.assertEqual(result["error"]["code"], "invalid_input", field)
            self.assertIn(field, result["error"]["fields"])
        self.assertEqual(public.submit_search_request(**search_payload(purpose="Steal"))["error"]["code"],
            "invalid_input")

    def test_phone_is_normalized_to_e164(self):
        result = self.submit(public.submit_search_request, search_payload(phone="9123 4567"))
        frappe.set_user("Administrator")
        self.assertEqual(frappe.db.get_value("Aqar Search Request", result["request_number"], "submitted_phone"),
            "+96891234567")

    def test_forms_closed_when_flag_off(self):
        frappe.set_user("Administrator")
        flag = frappe.get_doc("Aqar Feature Flag", "public_request_forms")
        flag.enabled = 0
        flag.save()
        frappe.set_user("Guest")
        self.assertEqual(public.submit_search_request(**search_payload())["error"]["code"], "not_permitted")
        self.assertEqual(public.get_form_config()["error"]["code"], "not_permitted")

    def test_email_failure_does_not_block_submission(self):
        """F.8 test 1: the request is saved even when the message provider fails."""
        with patch("frappe.sendmail", side_effect=Exception("SMTP unavailable")):
            result = self.submit(public.submit_search_request, search_payload())
        frappe.set_user("Administrator")
        self.assertTrue(frappe.db.exists("Aqar Search Request", result["request_number"]))
        self.assertTrue(frappe.db.exists("Error Log", {"reference_name": result["request_number"]}))

    def test_self_service_update_and_stop_alerts(self):
        result = self.submit(public.submit_search_request, search_payload())
        token = result["self_service_token"]
        view = public.get_my_request(token=token)
        self.assertEqual(view["budget_max"], 300)
        self.assertNotIn("contact", view)
        updated = public.update_my_request(token=token, budget_max=350, areas=[area(), area("Al Mawaleh")],
            strict_budget=True, state="pause")
        self.assertEqual(updated["budget_max"], 350)
        self.assertEqual(len(updated["areas"]), 2)
        self.assertTrue(updated["strict_budget"])
        self.assertEqual(updated["status"], "متوقف مؤقتًا")
        self.assertEqual(public.update_my_request(token=token, is_admin=1)["error"]["code"], "invalid_input")
        self.assertTrue(public.stop_alerts(token=token)["alerts_stopped"])
        frappe.set_user("Administrator")
        doc = frappe.get_doc("Aqar Search Request", result["request_number"])
        self.assertTrue(doc.alerts_paused)
        self.assertFalse(has_consent(doc.contact, "Match Alerts", "Email"))
        self.assertTrue(has_consent(doc.contact, "Request Updates", "Email"))
        frappe.set_user("Guest")
        self.assertEqual(public.get_my_request(token="forged")["error"]["code"], "not_permitted")

    def test_form_config(self):
        config = public.get_form_config(language="ar")
        self.assertIn("الخوض", [a["name"] for a in config["areas"]])
        self.assertIn("السيب", [a["wilayat"] for a in config["areas"]])  # wilayat names follow the language too
        self.assertIn("Villa", config["options"]["Aqar Search Request"]["property_type"])


class TestOpportunityReview(IntakeTestCase):
    def test_accuracy_declaration_required(self):
        result = public.submit_property_intake(**intake_payload(accuracy_declaration=False))
        self.assertIn("accuracy_declaration", result["error"]["fields"])

    def test_review_workflow_hides_internal_reason(self):
        result = self.submit(public.submit_property_intake, intake_payload())
        token = result["self_service_token"]
        self.assertEqual(result["status"], "قيد المراجعة")
        frappe.set_user("Administrator")
        doc = frappe.get_doc("Aqar Opportunity Intake", result["request_number"])
        self.assertEqual(doc.review_status, "Submitted")
        doc = apply_workflow(doc, "Start Review")
        self.assertEqual(doc.review_status, "Under Review")
        with self.assertRaises(frappe.ValidationError):
            apply_workflow(doc, "Decline")  # no internal reason yet
        doc.reload()
        doc.internal_decline_reason = "Price Far From Market"
        doc.score_price_realism = 0.2
        doc.score_current_demand = 0.6
        doc.save()
        self.assertEqual(doc.opportunity_score, 40)
        doc = apply_workflow(doc, "Decline")
        self.assertEqual(doc.review_status, "Not Selected")
        decline = queued_text(doc.name)
        self.assertIn("ظروف السوق", decline)
        self.assertNotIn("Price Far From Market", decline)
        frappe.set_user("Guest")
        view = public.get_my_request(token=token)
        self.assertEqual(view["status"], "لم يتم الاختيار حاليًا")
        self.assertNotIn("Price Far From Market", frappe.as_json(view))
        self.assertEqual(public.update_my_request(token=token, budget_max=1)["error"]["code"], "not_permitted")

    def test_consultation_request(self):
        payload = {key: value for key, value in intake_payload(language="en").items() if key not in
            ("request_type", "property_type", "asking_price", "bedrooms", "accuracy_declaration")}
        result = self.submit(public.submit_consultation_request, {**payload, "asset_type": "Land",
            "client_goal": "Develop", "requested_output": "Site Visit",
            "map_link": "https://maps.google.com/?q=23.6,58.4"})
        self.assertTrue(result["request_number"].startswith("CON-"))
        self.assertEqual(result["status"], "Under review")

    def test_guest_cannot_read_intake_records(self):
        for doctype in ("Aqar Search Request", "Aqar Opportunity Intake", "Aqar Consultation Request",
                "Aqar Consent Log", "Aqar Secure Link"):
            self.assertFalse(frappe.has_permission(doctype, "read", user="Guest"), doctype)
