import frappe
from frappe.tests import IntegrationTestCase as FrappeTestCase
from frappe.utils import add_days, add_to_date, now_datetime, today

from aqar360.core import audit, consent, flags, links, terms
from aqar360.core.seed import seed_reference_data


def make_contact(email="m1-consent@aqar360.invalid"):
    existing = frappe.db.get_value("Contact Email", {"email_id": email}, "parent")
    if existing:
        return existing
    return frappe.get_doc({"doctype": "Contact", "first_name": "M1 Test",
        "email_ids": [{"email_id": email, "is_primary": 1}]}).insert(ignore_permissions=True).name


def make_terms(policy_type="Marketing Consent", version="m1-test", status="Approved"):
    name = f"{frappe.scrub(policy_type).replace('_', '-')}-en-v{version}"
    if frappe.db.exists("Aqar Terms Version", name):
        return name
    doc = frappe.get_doc({"doctype": "Aqar Terms Version", "policy_type": policy_type,
        "language": "en", "version": version, "body": "<p>Test wording.</p>", "status": "Draft"}).insert()
    if status == "Approved":
        doc.status = "Approved"
        doc.save()
    return doc.name


class TestAuditTrail(FrappeTestCase):
    def test_chain_is_append_only_and_detects_tampering(self):
        name = audit.log_event("Test Event", "Aqar Platform Settings", "Aqar Platform Settings", after={"x": 1})
        self.assertTrue(audit.verify_chain()["ok"])
        doc = frappe.get_doc("Aqar Audit Event", name)
        doc.action = "Edited"
        with self.assertRaises(frappe.PermissionError):
            doc.save(ignore_permissions=True)
        with self.assertRaises(frappe.PermissionError):
            frappe.delete_doc("Aqar Audit Event", name, ignore_permissions=True)
        # A direct database edit bypasses the ORM but must break the hash chain.
        frappe.db.set_value("Aqar Audit Event", name, "action", "Tampered", update_modified=False)
        result = audit.verify_chain()
        self.assertFalse(result["ok"])
        self.assertEqual(result["first_broken"], name)
        frappe.db.set_value("Aqar Audit Event", name, "action", "Test Event", update_modified=False)
        self.assertTrue(audit.verify_chain()["ok"])

    def test_feature_flag_changes_are_audited(self):
        seed_reference_data()
        before = frappe.db.count("Aqar Audit Event", {"reference_doctype": "Aqar Feature Flag"})
        flag = frappe.get_doc("Aqar Feature Flag", "public_request_forms")
        flag.description = "Changed by test " + now_datetime().isoformat()
        flag.save()
        self.assertEqual(frappe.db.count("Aqar Audit Event", {"reference_doctype": "Aqar Feature Flag"}), before + 1)


class TestSecureLinks(FrappeTestCase):
    def test_token_hashed_single_purpose_and_revocable(self):
        token = links.create_link("Request Self-Update", "Aqar Platform Settings", "Aqar Platform Settings", max_uses=2)
        self.assertFalse(frappe.db.exists("Aqar Secure Link", {"token_hash": token}))
        self.assertEqual(links.resolve(token, "Request Self-Update")[0], "Aqar Platform Settings")
        with self.assertRaises(frappe.PermissionError):
            links.resolve(token, "Document Download")
        with self.assertRaises(frappe.PermissionError):
            links.resolve(token + "x", "Request Self-Update")
        links.resolve(token, "Request Self-Update")
        with self.assertRaises(frappe.PermissionError):
            links.resolve(token, "Request Self-Update")  # max_uses reached

    def test_expired_and_revoked_links_fail(self):
        token = links.create_link("Stop Alerts", "Aqar Platform Settings", "Aqar Platform Settings")
        name = frappe.db.get_value("Aqar Secure Link", {"purpose": "Stop Alerts"}, "name", order_by="creation desc")
        links.revoke(name)
        with self.assertRaises(frappe.PermissionError):
            links.resolve(token, "Stop Alerts")
        link = frappe.get_doc("Aqar Secure Link", name)
        link.revoked = 0
        with self.assertRaises(frappe.ValidationError):
            link.save(ignore_permissions=True)
        expired = links.create_link("Stop Alerts", "Aqar Platform Settings", "Aqar Platform Settings")
        frappe.db.set_value("Aqar Secure Link", {"purpose": "Stop Alerts", "revoked": 0}, "expires_at",
            add_to_date(now_datetime(), hours=-1))
        with self.assertRaises(frappe.PermissionError):
            links.resolve(expired, "Stop Alerts")


class TestTermsAndConsent(FrappeTestCase):
    def test_approved_terms_are_locked_and_current(self):
        name = make_terms(version="m1-lock")
        doc = frappe.get_doc("Aqar Terms Version", name)
        self.assertEqual(doc.approved_by, "Administrator")
        doc.body = "<p>Silently changed.</p>"
        with self.assertRaises(frappe.ValidationError):
            doc.save()
        self.assertIsNotNone(terms.get_current_terms("Marketing Consent", "en"))

    def test_acceptance_requires_approved_terms(self):
        contact = make_contact()
        draft = make_terms(policy_type="Service Terms", version="m1-draft", status="Draft")
        with self.assertRaises(frappe.ValidationError):
            terms.record_acceptance(draft, "Website", contact=contact)
        approved = make_terms(policy_type="Service Terms", version="m1-approved")
        acceptance = terms.record_acceptance(approved, "Website", contact=contact,
            reference_doctype="Contact", reference_name=contact)
        self.assertEqual(frappe.db.get_value("Aqar Terms Acceptance", acceptance, "policy_type"), "Service Terms")

    def test_latest_consent_wins_and_withdrawal_is_respected(self):
        contact = make_contact()
        wording = make_terms(version="m1-consent")
        with self.assertRaises(frappe.ValidationError):
            consent.record_consent(contact, "Marketing", "WhatsApp", True, "Website Form")
        consent.record_consent(contact, "Marketing", "WhatsApp", True, "Website Form", terms_version=wording)
        self.assertTrue(consent.has_consent(contact, "Marketing", "WhatsApp"))
        self.assertFalse(consent.has_consent(contact, "Marketing", "Email"))
        consent.record_consent(contact, "Marketing", "All Channels", False, "Self-Update Link")
        self.assertFalse(consent.has_consent(contact, "Marketing", "WhatsApp"))

    def test_staff_recorded_consent_needs_evidence(self):
        with self.assertRaises(frappe.ValidationError):
            consent.record_consent(make_contact(), "Request Updates", "Phone", True, "Staff Recorded")


class TestFlagsGeographyProvenance(FrappeTestCase):
    def test_later_phase_flags_stay_locked(self):
        seed_reference_data()
        flag = frappe.get_doc("Aqar Feature Flag", "public_chatbot")
        flag.enabled = 1
        with self.assertRaises(frappe.ValidationError):
            flag.save()
        self.assertFalse(flags.is_enabled("public_chatbot"))
        self.assertFalse(flags.is_enabled("does_not_exist"))

    def test_staff_only_flag(self):
        seed_reference_data()
        flag = frappe.get_doc("Aqar Feature Flag", "public_request_forms")
        flag.enabled, flag.audience = 1, "Staff Only"
        flag.save()
        self.assertTrue(flags.is_enabled("public_request_forms", user="Administrator"))
        self.assertFalse(flags.is_enabled("public_request_forms", user="Guest"))
        flag.enabled = 0
        flag.save()

    def test_geography_seed_is_idempotent(self):
        seed_reference_data()
        seed_reference_data()
        self.assertEqual(frappe.db.count("Aqar Governorate"), 11)
        khoudh = frappe.get_all("Aqar Area", filters={"area_name_en": "Al Khoudh"}, fields=["governorate"])
        self.assertEqual(len(khoudh), 1)
        self.assertEqual(khoudh[0].governorate, "Muscat")

    def test_freshness_status(self):
        doc = frappe.get_doc({"doctype": "Aqar Source Observation", "reference_doctype": "Aqar Governorate",
            "reference_name": "Muscat", "source_type": "Official Public Source",
            "last_verified": add_days(today(), -40), "reverify_after_days": 30}).insert()
        self.assertEqual(doc.freshness_status, "Needs Reverification")
        doc.last_verified = today()
        doc.save()
        self.assertEqual(doc.freshness_status, "Fresh")
        self.assertEqual(doc.verified_by, "Administrator")
