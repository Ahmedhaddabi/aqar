import uuid

import frappe
from frappe.tests import IntegrationTestCase as FrappeTestCase
from frappe.utils import add_days, now_datetime

from aqar360.commerce import orders
from aqar360.commerce.setup import MEDIA_BUDGET_ITEM, PASS_THROUGH_ACCOUNT, ensure_commerce_setup
from aqar360.core.consent import record_consent
from aqar360.core.seed import seed_reference_data
from aqar360.operations.approvals import ApprovalRequired
from aqar360.tests.test_matching import staff_user


def company():
    return frappe.defaults.get_global_default("company")


def make_contact():
    return frappe.get_doc({"doctype": "Contact", "first_name": "Content Client " + uuid.uuid4().hex[:6],
        "email_ids": [{"email_id": f"m6-{uuid.uuid4().hex[:8]}@aqar360.invalid", "is_primary": 1}]}).insert(
        ignore_permissions=True).name


def make_order(contact=None, media_budget=500, **overrides):
    values = {"doctype": "Aqar Content Order", "contact": contact or make_contact(), "media_budget": media_budget,
        "services": [{"item": "AQ-PHOTOS"}, {"item": "AQ-FLOOR-PLAN"}]}
    values.update(overrides)
    return frappe.get_doc(values).insert()


def timer(order, policy):
    rows = frappe.get_all("Aqar SLA Timer", fields=["name", "state"], order_by="creation desc", filters={
        "reference_doctype": "Aqar Content Order", "reference_name": order.name, "policy": policy})
    return rows


def move(order, status, **values):
    order.reload()
    order.update({"status": status, **values})
    order.save()
    return order


class CommerceTestCase(FrappeTestCase):
    def setUp(self):
        if not company():
            self.skipTest("No company configured on this site")
        seed_reference_data()
        ensure_commerce_setup()


class TestCommerceSetup(CommerceTestCase):
    def test_services_prices_and_pass_through_account(self):
        self.assertEqual(frappe.db.get_value("Item Price", {"item_code": "AQ-PHOTOS",
            "price_list": "Standard Selling"}, "price_list_rate"), 120)
        self.assertEqual(frappe.db.get_value("Item", "AQ-VIDEO-LIFESTYLE", "custom_aqar_sla_policy"),
            "content_lifestyle_video")
        account = frappe.db.get_value("Item Default", {"parent": MEDIA_BUDGET_ITEM, "company": company()},
            "income_account")
        self.assertTrue(account.startswith(PASS_THROUGH_ACCOUNT))
        self.assertEqual(frappe.db.get_value("Account", account, "root_type"), "Liability")
        self.assertTrue(frappe.db.exists("Print Format", "Aqar Bilingual Invoice"))

    def test_customer_edited_price_is_not_overwritten(self):
        price = frappe.get_doc("Item Price", {"item_code": "AQ-FLOOR-PLAN", "price_list": "Standard Selling"})
        price.price_list_rate = 111
        price.save()
        ensure_commerce_setup()
        self.assertEqual(frappe.db.get_value("Item Price", price.name, "price_list_rate"), 111)


class TestContentOrderFlow(CommerceTestCase):
    def test_full_order_lifecycle_with_sla_and_payments(self):
        order = make_order()
        record_consent(order.contact, "Request Updates", "Email", True, "Staff Recorded", evidence="M9 test")
        self.assertEqual(order.services_total, 220)
        self.assertEqual(order.revisions_included, 1)
        with self.assertRaises(frappe.ValidationError):
            move(order, "Delivered")  # not an allowed transition
        quotation = frappe.get_doc("Quotation", orders.make_quotation(order.name))
        self.assertEqual(quotation.grand_total, 720)
        order.reload()
        self.assertEqual(order.status, "Quoted")
        with self.assertRaises(frappe.ValidationError):
            move(order, "Confirmed")  # quotation not yet accepted
        quotation.submit()
        move(order, "Confirmed")
        self.assertEqual(timer(order, "content_shoot_confirmation")[0].state, "Running")
        with self.assertRaises(frappe.ValidationError):
            move(order, "Scheduled", shoot_at=add_days(now_datetime(), 2))  # unpaid
        invoice = orders.make_invoice(order.name, submit=True)
        self.assertEqual(frappe.db.get_value("Aqar Content Order", order.name, "payment_status"), "Unpaid")
        orders.record_payment(order.name, 300)
        self.assertEqual(frappe.db.get_value("Aqar Content Order", order.name, "payment_status"), "Partly Paid")
        orders.record_payment(order.name, 420, reference_no="TEST-REF")
        self.assertEqual(frappe.db.get_value("Aqar Content Order", order.name, "payment_status"), "Paid")
        self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "outstanding_amount"), 0)
        move(order, "Scheduled", shoot_at=add_days(now_datetime(), 2))
        self.assertEqual(timer(order, "content_shoot_confirmation")[0].state, "Completed")
        move(order, "Shot")
        self.assertEqual(timer(order, "content_photos")[0].state, "Running")
        self.assertEqual(timer(order, "content_floor_plan")[0].state, "Running")
        order.reload()
        order.append("deliverables", {"service_item": "AQ-PHOTOS", "deliverable_type": "Photos", "file": "/files/p.zip"})
        order.save()
        self.assertEqual(timer(order, "content_photos")[0].state, "Completed")
        self.assertEqual(timer(order, "content_floor_plan")[0].state, "Running")
        with self.assertRaises(frappe.ValidationError):
            move(order, "Client Review")  # floor plan missing
        order.reload()
        order.append("deliverables", {"service_item": "AQ-FLOOR-PLAN", "deliverable_type": "Floor Plan",
            "file": "/files/fp.pdf"})
        order.status = "Client Review"
        order.save()
        ready = frappe.get_all("Aqar Outbox", pluck="status", filters={"idempotency_key": f"content_ready:{order.name}:0"})
        self.assertEqual(ready, ["Sent"])  # the client is told the work is ready (M9)
        move(order, "Changes Requested", change_request_note="Brighter living room photo")
        self.assertEqual((order.revisions_used, order.revisions[0].beyond_included), (1, 0))
        self.assertEqual(timer(order, "content_minor_revision")[0].state, "Running")
        order.reload()
        order.append("deliverables", {"service_item": "AQ-PHOTOS", "deliverable_type": "Photos", "file": "/files/p2.zip"})
        order.status = "Client Review"
        order.save()
        self.assertEqual(order.deliverables[-1].version, 2)
        self.assertEqual(timer(order, "content_minor_revision")[0].state, "Completed")
        with self.assertRaises(frappe.ValidationError):
            move(order, "Changes Requested", change_request_note="One more change")  # only 1 round included
        move(order, "Changes Requested", change_request_note="One more change", allow_extra_revisions=1)
        self.assertEqual(len(timer(order, "content_minor_revision")), 2)  # repeatable revision SLA
        self.assertEqual(order.revisions[-1].beyond_included, 1)
        move(order, "Client Review")
        with self.assertRaises(frappe.ValidationError):
            move(order, "Delivered")  # client approval missing
        order.reload()
        for row in order.deliverables:
            row.status = "Client Approved"
        order.status = "Delivered"
        order.save()
        self.assertTrue(order.delivered_at)

    def test_media_budget_is_booked_as_liability_not_revenue(self):
        order = make_order(media_budget=500)
        frappe.get_doc("Quotation", orders.make_quotation(order.name)).submit()
        invoice = orders.make_invoice(order.name, submit=True)
        gl = frappe.get_all("GL Entry", filters={"voucher_no": invoice, "is_cancelled": 0},
            fields=["account", "credit", "debit"])
        credits = {row.account.rsplit(" - ", 1)[0]: row.credit for row in gl if row.credit}
        self.assertEqual(credits.get(PASS_THROUGH_ACCOUNT), 500)
        self.assertEqual(credits.get("Sales"), 220)
        html = frappe.get_print("Sales Invoice", invoice, print_format="Aqar Bilingual Invoice")
        self.assertIn("فاتورة ضريبية", html)
        self.assertIn("not a fee for our services", html)

    def test_same_client_reuses_customer(self):
        contact = make_contact()
        first, second = make_order(contact=contact), make_order(contact=contact)
        orders.make_quotation(first.name)
        orders.make_quotation(second.name)
        self.assertEqual(frappe.db.get_value("Aqar Content Order", first.name, "customer"),
            frappe.db.get_value("Aqar Content Order", second.name, "customer"))

    def test_payments_need_finance_role_and_content_orders_auto_assign(self):
        coordinator = staff_user("Aqar Content Coordinator")
        order = make_order()
        self.assertEqual(order.assigned_to, coordinator)
        frappe.get_doc("Quotation", orders.make_quotation(order.name)).submit()
        orders.make_invoice(order.name, submit=True)
        frappe.set_user(coordinator)
        try:
            with self.assertRaises(frappe.PermissionError):
                orders.record_payment(order.name, 100)
        finally:
            frappe.set_user("Administrator")

    def test_discount_rule_blocks_large_quotation_discount(self):
        rule = "Quotation discount over 10%"
        frappe.db.set_value("Aqar Approval Rule", rule, "active", 1)
        staff = staff_user("Aqar Content Coordinator")
        try:
            order = make_order()
            quotation = frappe.get_doc("Quotation", orders.make_quotation(order.name))
            frappe.set_user(staff)
            quotation.additional_discount_percentage = 15
            with self.assertRaises(ApprovalRequired):
                quotation.save(ignore_permissions=True)
        finally:
            frappe.set_user("Administrator")
            frappe.db.set_value("Aqar Approval Rule", rule, "active", 0)
