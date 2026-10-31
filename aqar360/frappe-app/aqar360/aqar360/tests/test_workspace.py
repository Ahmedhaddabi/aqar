import io
import uuid
import zipfile

import frappe
from frappe.tests import IntegrationTestCase as FrappeTestCase
from frappe.utils import today

from aqar360.api import account
from aqar360.core.consent import has_consent, record_consent
from aqar360.core.seed import seed_reference_data
from aqar360.crm.customer360 import get_customer_360, render_customer_360
from aqar360.matching.engine import match_request
from aqar360.tests.test_matching import make_request, make_supply, staff_user
from aqar360.vault import access
from aqar360.vault.scan import UploadRejected


def real_pdf():
    from pypdf import PdfWriter
    writer, buffer = PdfWriter(), io.BytesIO()
    writer.add_blank_page(72, 72)
    writer.write(buffer)
    return buffer.getvalue()


PDF = real_pdf()


def private_file(name, content):
    return frappe.get_doc({"doctype": "File", "file_name": name, "content": content, "is_private": 1}).insert(
        ignore_permissions=True).file_url


def vault_doc(classification="Confidential", name="deed.pdf", content=PDF, **extra):
    return frappe.get_doc({"doctype": "Aqar Document", "title": "Test " + uuid.uuid4().hex[:6],
        "classification": classification, "document_type": "Ownership / Title Deed",
        "file": private_file(name, content), **extra}).insert()


def docx(with_macro=False):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        if with_macro:
            z.writestr("word/vbaProject.bin", "macro")
    return buffer.getvalue()


class TestVault(FrappeTestCase):
    def test_upload_checks(self):
        doc = vault_doc()
        self.assertEqual(doc.scan_status, "Basic Checks Passed")
        self.assertEqual(len(doc.sha256), 64)
        self.assertEqual(vault_doc(name="contract.docx", content=docx()).scan_status, "Basic Checks Passed")
        # A fake .pdf is already refused by Frappe's own PDF parsing at upload; our signature check covers the rest.
        for name, content in (("fake.png", b"MZ\x90\x00 executable"), ("tool.exe", b"MZ"),
                ("macro.docx", docx(with_macro=True))):
            with self.assertRaises(UploadRejected, msg=name):
                vault_doc(name=name, content=content)
        public = frappe.get_doc({"doctype": "File", "file_name": "public.pdf", "content": PDF,
            "is_private": 0}).insert(ignore_permissions=True).file_url
        with self.assertRaises(frappe.ValidationError):
            frappe.get_doc({"doctype": "Aqar Document", "title": "Public", "classification": "Internal",
                "document_type": "Other", "file": public}).insert()

    def test_highly_restricted_visibility(self):
        secret = vault_doc(classification="Highly Restricted")
        staff, finance = staff_user("Aqar Opportunity Staff"), staff_user("Aqar Finance")
        self.assertFalse(frappe.has_permission("Aqar Document", "read", secret, user=staff))
        self.assertTrue(frappe.has_permission("Aqar Document", "read", secret, user=finance))
        frappe.set_user(staff)
        try:
            self.assertNotIn(secret.name, frappe.get_list("Aqar Document", pluck="name"))
            with self.assertRaises(frappe.PermissionError):
                access.get_download_link(secret.name)
        finally:
            frappe.set_user("Administrator")

    def test_single_use_download_is_audited(self):
        doc = vault_doc()
        token = access.get_download_link(doc.name).split("token=")[1]
        frappe.set_user("Guest")
        try:
            access.download(token=token)
            self.assertEqual(frappe.local.response.filecontent, PDF)
            with self.assertRaises(frappe.PermissionError):
                access.download(token=token)  # single use
        finally:
            frappe.set_user("Administrator")
        actions = frappe.get_all("Aqar Audit Event", filters={"reference_name": doc.name}, pluck="action")
        self.assertIn("Document Download Link Issued", actions)
        self.assertIn("Document Downloaded", actions)


class TestCustomer360AndWorkbench(FrappeTestCase):
    def setUp(self):
        seed_reference_data()

    def test_customer_360_collects_everything(self):
        req = make_request()
        make_supply(280)
        match_request(req.name)
        contact = frappe.get_doc({"doctype": "Contact", "first_name": "C360 Person"}).insert(ignore_permissions=True).name
        frappe.db.set_value("Aqar Search Request", req.name, "contact", contact)
        vault_doc(contact=contact)
        data = get_customer_360(contact)
        self.assertEqual([r.name for r in data["requests"]], [req.name])
        self.assertTrue(data["matches"])
        self.assertEqual(len(data["documents"]), 1)
        self.assertIn("C360 Person", render_customer_360(contact))

    def test_workbench_next_best_action(self):
        from aqar360.aqar_360.report.aqar_daily_workbench.aqar_daily_workbench import execute
        req = make_request()
        rows = {r["record"]: r for r in execute({"mine": 0})[1]}
        self.assertIn("first response", rows[req.name]["next_action"])
        frappe.db.set_value("Aqar Search Request", req.name, "first_response_at", frappe.utils.now_datetime())
        make_supply(280)
        match_request(req.name)
        rows = {r["record"]: r for r in execute({"mine": 0})[1]}
        self.assertIn("suggested match", rows[req.name]["next_action"])
        self.assertEqual(rows[req.name]["best_score"], 100)

    def test_management_summary_separates_media_money(self):
        from aqar360.aqar_360.report.aqar_management_summary.aqar_management_summary import execute
        if not frappe.defaults.get_global_default("company"):
            self.skipTest("No company")
        from aqar360.commerce import orders
        from aqar360.tests.test_commerce import make_order

        def cards():
            return {c["label"]: c["value"] for c in execute({"from_date": today(), "to_date": today()})[4]}
        before = cards()
        order = make_order(media_budget=500)
        frappe.get_doc("Quotation", orders.make_quotation(order.name)).submit()
        orders.make_invoice(order.name, submit=True)
        after = cards()
        self.assertEqual(after["Revenue (OMR)"] - before["Revenue (OMR)"], 220)
        self.assertEqual(after["Client media funds received (not revenue)"]
            - before["Client media funds received (not revenue)"], 500)


class TestCustomerAccount(FrappeTestCase):
    def setUp(self):
        seed_reference_data()
        self.email = f"m11-{uuid.uuid4().hex[:8]}@aqar360.invalid"
        self.contact = frappe.get_doc({"doctype": "Contact", "first_name": "Account Owner",
            "email_ids": [{"email_id": self.email, "is_primary": 1}]}).insert(ignore_permissions=True).name
        frappe.get_doc({"doctype": "User", "email": self.email, "first_name": "Account Owner", "send_welcome_email": 0,
            "user_type": "Website User", "roles": [{"role": "Aqar Customer"}]}).insert(ignore_permissions=True)
        self.request = make_request()
        frappe.db.set_value("Aqar Search Request", self.request.name, "contact", self.contact)
        other = make_request()  # belongs to someone else
        self.other_request = other.name

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_customer_sees_only_own_records(self):
        frappe.set_user(self.email)
        self.assertTrue(account.session_info()["csrf_token"])
        overview = account.get_overview(language="en")
        numbers = [r["request_number"] for r in overview["requests"]]
        self.assertEqual(numbers, [self.request.name])
        self.assertNotIn(self.other_request, numbers)
        self.assertNotIn("contact", overview["requests"][0])

    def test_session_token_only_for_signed_in_users(self):
        frappe.set_user(self.email)
        self.assertTrue(account.session_token())
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            account.session_token()

    def test_staff_and_guests_cannot_use_customer_endpoints(self):
        for user in ("Guest", staff_user("Aqar Opportunity Staff")):
            frappe.set_user(user)
            with self.assertRaises(frappe.PermissionError):
                account.get_overview()

    def test_invoice_ownership_and_consent_withdrawal(self):
        if frappe.defaults.get_global_default("company"):
            from aqar360.commerce import orders
            from aqar360.tests.test_commerce import make_order
            mine, theirs = make_order(contact=self.contact), make_order()
            for order in (mine, theirs):
                frappe.get_doc("Quotation", orders.make_quotation(order.name)).submit()
            my_invoice = orders.make_invoice(mine.name, submit=True)
            their_invoice = orders.make_invoice(theirs.name, submit=True)
            frappe.set_user(self.email)
            self.assertIn("فاتورة ضريبية", account.get_invoice(name=my_invoice))
            with self.assertRaises(frappe.DoesNotExistError):
                account.get_invoice(name=their_invoice)
            frappe.set_user("Administrator")
        record_consent(self.contact, "Match Alerts", "Email", True, "Website Form")
        frappe.set_user(self.email)
        account.withdraw_consent(purpose="Match Alerts", channel="All Channels")
        frappe.set_user("Administrator")
        self.assertFalse(has_consent(self.contact, "Match Alerts", "Email"))
