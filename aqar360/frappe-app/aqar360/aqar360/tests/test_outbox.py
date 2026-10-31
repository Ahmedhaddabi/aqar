import uuid
from datetime import datetime, time, timedelta
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase as FrappeTestCase
from frappe.utils import add_days, add_to_date, format_datetime, getdate, now_datetime, today

from aqar360.api import public
from aqar360.core.consent import record_consent
from aqar360.core.seed import seed_reference_data
from aqar360.matching.actions import update_match
from aqar360.messaging import lifecycle, outbox
from aqar360.messaging.seed import seed_message_templates
from aqar360.messaging.templates import current_template
from aqar360.tests.test_intake import IntakeTestCase, queued_text, search_payload
from aqar360.tests.test_matching import make_request, make_supply, match_for, staff_user


def customer(consent=True):
    email = f"m9-{uuid.uuid4().hex[:10]}@aqar360.invalid"
    contact = frappe.get_doc({"doctype": "Contact", "first_name": "Outbox Test",
        "email_ids": [{"email_id": email, "is_primary": 1}]}).insert(ignore_permissions=True).name
    if consent:
        record_consent(contact, "Request Updates", "Email", True, "Staff Recorded", evidence="M9 test")
    return contact, email


def at(hour, minute=0, days=0):
    return datetime.combine(getdate(today()) + timedelta(days=days), time(hour, minute))


def queue(key="received", contact=None, email=None, **kwargs):
    if contact is None:
        contact, email = customer()
    kwargs.setdefault("idempotency_key", uuid.uuid4().hex)
    kwargs.setdefault("context", {"person": "Test", "request_number": "REQ-TEST"})
    return outbox.queue_message(key, recipient=email, language="en", contact=contact, **kwargs)


def template(key, version, status="Approved", body="Hello {{ person }}", language="en"):
    return frappe.get_doc({"doctype": "Aqar Message Template", "template_key": key, "language": language,
        "channel": "Email", "version": version, "status": status, "category": "Transactional",
        "consent_purpose": "Request Updates", "title": key, "subject": "Subject", "body": body}).insert()


class OutboxTestCase(FrappeTestCase):
    def setUp(self):
        seed_reference_data()
        seed_message_templates()


class TestTemplates(OutboxTestCase):
    def test_approved_templates_are_locked_and_versioned(self):
        key = "m9test_" + uuid.uuid4().hex[:8]
        v1 = template(key, 1)
        self.assertEqual(v1.approved_by, "Administrator")
        v1.body = "Changed"
        with self.assertRaises(frappe.ValidationError):
            v1.save()
        template(key, 2, body="Hi {{ person }}")
        self.assertEqual(frappe.db.get_value("Aqar Message Template", v1.name, "status"), "Retired")
        self.assertEqual(current_template(key, "en").version, 2)
        self.assertEqual(current_template(key, "ar").version, 2)  # falls back to the other language
        with self.assertRaises(frappe.ValidationError):
            template(key, 3, body="{{ person ")  # a broken template never reaches a customer

    def test_variables_are_escaped(self):
        doc = queue(context={"person": "<script>x</script>", "request_number": "REQ-1"})
        self.assertNotIn("<script>", doc.message)
        self.assertIn("&lt;script&gt;", doc.message)


class TestOutboxRules(OutboxTestCase):
    def test_one_message_per_idempotency_key(self):
        contact, email = customer()
        first = queue(contact=contact, email=email, idempotency_key="m9-dedupe-" + contact)
        second = queue(contact=contact, email=email, idempotency_key="m9-dedupe-" + contact)
        self.assertEqual(first.name, second.name)
        self.assertEqual(first.status, "Sent")
        self.assertEqual(frappe.db.count("Email Queue Recipient", {"recipient": email}), 1)

    def test_no_consent_or_no_address_is_suppressed(self):
        contact, email = customer(consent=False)
        doc = queue(contact=contact, email=email)
        self.assertEqual(doc.status, "Suppressed")
        self.assertIn("consent", doc.reason)
        self.assertFalse(frappe.db.exists("Email Queue Recipient", {"recipient": email}))
        contact, _email = customer()
        self.assertEqual(queue(contact=contact, email=None).status, "Suppressed")

    def test_quiet_hours_delay_follow_ups_but_not_confirmations(self):
        contact, email = customer()
        follow_up = queue("still_searching", contact=contact, email=email, now=at(22, 30))
        self.assertEqual(follow_up.status, "Queued")
        self.assertEqual(follow_up.scheduled_for, at(8, days=1))
        self.assertEqual(queue("still_searching", contact=contact, email=email, now=at(3)).scheduled_for, at(8))
        self.assertEqual(queue("received", contact=contact, email=email, now=at(22, 30)).status, "Sent")

    def test_weekly_follow_up_cap(self):
        contact, email = customer()
        statuses = [queue("still_searching", contact=contact, email=email, now=at(10)).status for _ in range(3)]
        self.assertEqual(statuses, ["Sent", "Sent", "Suppressed"])
        self.assertEqual(queue("received", contact=contact, email=email, now=at(10)).status, "Sent")

    def test_unsubscribed_contact_gets_confirmations_only(self):
        contact, email = customer()
        frappe.db.set_value("Contact", contact, "unsubscribed", 1)
        self.assertEqual(queue("still_searching", contact=contact, email=email, now=at(10)).status, "Suppressed")
        self.assertEqual(queue("received", contact=contact, email=email).status, "Sent")

    def test_failed_delivery_retries_then_fails_without_raising(self):
        contact, email = customer()
        with patch.object(frappe, "sendmail", side_effect=RuntimeError("SMTP down")):
            doc = queue(contact=contact, email=email, reference_doctype="Contact", reference_name=contact)
            self.assertEqual((doc.status, doc.attempts), ("Queued", 1))
            self.assertGreater(doc.scheduled_for, now_datetime())
            outbox.deliver(doc)
            outbox.deliver(doc)
        doc.reload()
        self.assertEqual((doc.status, doc.attempts), ("Failed", 3))
        self.assertIn("SMTP down", doc.reason)
        self.assertTrue(frappe.db.exists("Error Log", {"reference_name": contact}))

    def test_delivery_status_is_mirrored_from_the_email_queue(self):
        doc = queue()
        frappe.db.set_value("Email Queue", doc.email_queue, "status", "Sent")
        outbox.process_outbox()
        self.assertEqual(frappe.db.get_value("Aqar Outbox", doc.name, "status"), "Delivered")

    def test_queued_messages_are_sent_when_due(self):
        contact, email = customer()
        doc = queue("still_searching", contact=contact, email=email, now=at(22, 30, days=-2))
        self.assertEqual(doc.status, "Queued")
        outbox.process_outbox()
        self.assertEqual(frappe.db.get_value("Aqar Outbox", doc.name, "status"), "Sent")

    def test_whatsapp_falls_back_to_email(self):
        self.assertEqual(queue(preferred_channel="WhatsApp").channel, "Email")  # Phase 2 flag is off
        with patch("aqar360.messaging.outbox.is_enabled", return_value=True):
            self.assertEqual(queue(preferred_channel="WhatsApp").channel, "Email")  # no WhatsApp template yet

    def test_no_platform_footer_in_customer_email(self):
        self.assertEqual(frappe.db.get_single_value("System Settings", "disable_standard_email_footer"), 1)
        contact, email = customer()
        queue(contact=contact, email=email, reference_doctype="Contact", reference_name=contact)
        self.assertNotIn("ERPNext", queued_text(contact))


class TestLifecycleJobs(OutboxTestCase):
    def _request(self, **values):
        contact, email = customer()
        return make_request(contact=contact, submitted_email=email, language="en", **values)

    def test_viewing_reminder_is_sent_once(self):
        req = self._request()
        prop = make_supply(290)
        match = match_for(req.name, prop.name).name
        update_match(match, "approve")
        update_match(match, "mark_sent", channel="Email")
        viewing = frappe.get_doc({"doctype": "Aqar Viewing", "search_request": req.name, "match": match,
            "scheduled_at": add_to_date(now_datetime(), hours=3)}).insert()
        lifecycle.send_viewing_reminders()
        lifecycle.send_viewing_reminders()
        rows = frappe.get_all("Aqar Outbox", fields=["status", "message"],
            filters={"reference_doctype": "Aqar Viewing", "reference_name": viewing.name})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].status, "Sent")
        self.assertIn(format_datetime(viewing.scheduled_at, "dd-MM-yyyy HH:mm"), rows[0].message)

    def test_still_searching_check_in_respects_paused_alerts(self):
        req = self._request()
        paused = self._request(alerts_paused=1)
        for name in (req.name, paused.name):
            frappe.db.set_value("Aqar Search Request", name, "creation", add_days(now_datetime(), -20))
        lifecycle.send_still_searching(now=at(10))
        lifecycle.send_still_searching(now=at(10))
        sent = frappe.get_all("Aqar Outbox", pluck="message",
            filters={"template_key": "still_searching", "reference_name": req.name})
        self.assertEqual(len(sent), 1)
        self.assertIn("my-request?token=", sent[0])
        self.assertFalse(frappe.db.exists("Aqar Outbox",
            {"template_key": "still_searching", "reference_name": paused.name}))

    def test_staff_digest_once_per_day(self):
        user = staff_user("Aqar Opportunity Staff")
        self._request(assigned_to=user)
        lifecycle.send_staff_digest(now=at(7, 30))
        lifecycle.send_staff_digest(now=at(7, 30))
        rows = frappe.get_all("Aqar Outbox", fields=["status", "category", "subject"],
            filters={"idempotency_key": f"digest:{user}:{getdate(today())}"})
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0].status, rows[0].category), ("Sent", "Staff"))
        self.assertTrue(any(text in rows[0].subject for text in ("1 to contact", "1 للتواصل")))


class TestRequestRenewal(IntakeTestCase):
    def test_expiry_notice_and_self_update_renews_the_request(self):
        result = self.submit(public.submit_search_request, search_payload(language="en"))
        name = result["request_number"]
        frappe.set_user("Administrator")
        seed_message_templates()
        frappe.db.set_value("Aqar Search Request", name, "expires_on", add_days(today(), 3))
        lifecycle.send_expiry_notices(now=at(10))
        lifecycle.send_expiry_notices(now=at(10))
        self.assertEqual(frappe.db.count("Aqar Outbox", {"template_key": "request_expiring", "reference_name": name}), 1)
        frappe.set_user("Guest")
        public.update_my_request(token=result["self_service_token"], timing="1-3 Months")
        frappe.set_user("Administrator")
        self.assertEqual(getdate(frappe.db.get_value("Aqar Search Request", name, "expires_on")),
            getdate(add_days(today(), 90)))
