"""Content order commerce: Contact → Customer, Quotation, Sales Invoice, Payment Entry (§6, §9.1, §26.3 Quote Builder).

ERPNext stays the ledger; the order only links its documents and mirrors payment status.
"""
import frappe
from frappe import _
from frappe.utils import add_days, flt, today

from aqar360.commerce.setup import MEDIA_BUDGET_ITEM
from aqar360.core.audit import log_event

FINANCE_ROLES = ("System Manager", "Aqar Admin", "Aqar Finance", "Aqar Manager", "Accounts User", "Accounts Manager")


def ensure_customer(contact_name):
    """The commercial party for a person; reuses an existing Customer link on the Contact (ADR-003)."""
    contact = frappe.get_doc("Contact", contact_name)
    for link in contact.links:
        if link.link_doctype == "Customer":
            return link.link_name
    customer = frappe.get_doc({"doctype": "Customer", "customer_name": contact.full_name or contact.name,
        "customer_type": "Individual",
        "customer_group": "Individual" if frappe.db.exists("Customer Group", "Individual") else "All Customer Groups",
        "territory": "Oman" if frappe.db.exists("Territory", "Oman") else "All Territories"}).insert(ignore_permissions=True)
    contact.append("links", {"link_doctype": "Customer", "link_name": customer.name})
    contact.save(ignore_permissions=True)
    frappe.db.set_value("Customer", customer.name, "customer_primary_contact", contact.name)
    return customer.name


def _lines(order):
    lines = [{"item_code": row.item, "qty": row.qty or 1, "rate": row.rate, "description": row.description}
        for row in order.services]
    if flt(order.media_budget):
        lines.append({"item_code": MEDIA_BUDGET_ITEM, "qty": 1, "rate": flt(order.media_budget)})
    return lines


@frappe.whitelist()
def make_quotation(order_name):
    order = frappe.get_doc("Aqar Content Order", order_name)
    order.check_permission("write")
    if order.quotation and frappe.db.get_value("Quotation", order.quotation, "docstatus") != 2:
        return order.quotation
    if not order.services:
        frappe.throw(_("Add at least one service before quoting."))
    order.customer = order.customer or ensure_customer(order.contact)
    quotation = frappe.get_doc({"doctype": "Quotation", "quotation_to": "Customer", "party_name": order.customer,
        "company": order.company, "transaction_date": today(), "valid_till": add_days(today(), 14),
        "custom_aqar_content_order": order.name, "items": _lines(order)}).insert(ignore_permissions=True)
    order.quotation = quotation.name
    order.flags.aqar_status_change = True
    order.status = "Quoted"
    order.save(ignore_permissions=True)
    log_event("Quotation Created", "Aqar Content Order", order.name, after={"quotation": quotation.name,
        "grand_total": quotation.grand_total})
    return quotation.name


@frappe.whitelist()
def make_invoice(order_name, submit=False):
    order = frappe.get_doc("Aqar Content Order", order_name)
    order.check_permission("write")
    if order.sales_invoice and frappe.db.get_value("Sales Invoice", order.sales_invoice, "docstatus") != 2:
        return order.sales_invoice
    order.customer = order.customer or ensure_customer(order.contact)
    invoice = frappe.get_doc({"doctype": "Sales Invoice", "customer": order.customer, "company": order.company,
        "posting_date": today(), "due_date": add_days(today(), 7), "custom_aqar_content_order": order.name,
        "items": _lines(order)}).insert(ignore_permissions=True)
    if frappe.parse_json(submit):
        frappe.only_for(FINANCE_ROLES)
        invoice.submit()
    order.db_set({"sales_invoice": invoice.name, "customer": order.customer})
    refresh_payment_status(order.name)
    log_event("Invoice Created", "Aqar Content Order", order.name, after={"invoice": invoice.name,
        "grand_total": invoice.grand_total, "submitted": invoice.docstatus == 1})
    return invoice.name


@frappe.whitelist()
def record_payment(order_name, amount, mode_of_payment="Cash", reference_no=None):
    """Manual/bank payment against the order's submitted invoice (online checkout is Phase 2)."""
    frappe.only_for(FINANCE_ROLES)
    from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
    invoice = frappe.db.get_value("Aqar Content Order", order_name, "sales_invoice")
    if not invoice or frappe.db.get_value("Sales Invoice", invoice, "docstatus") != 1:
        frappe.throw(_("Submit the order's invoice before recording a payment."))
    amount = flt(amount)
    if amount <= 0:
        frappe.throw(_("Enter a payment amount."))
    payment = get_payment_entry("Sales Invoice", invoice, party_amount=amount)
    payment.mode_of_payment = mode_of_payment
    payment.reference_no = reference_no or order_name
    payment.reference_date = today()
    payment.insert(ignore_permissions=True)
    payment.submit()
    return payment.name


def refresh_payment_status(order_name):
    invoice = frappe.db.get_value("Aqar Content Order", order_name, "sales_invoice")
    status, outstanding, total = "Not Invoiced", 0, 0
    if invoice:
        row = frappe.db.get_value("Sales Invoice", invoice, ["docstatus", "grand_total", "outstanding_amount"], as_dict=True)
        if row and row.docstatus == 1:
            total, outstanding = flt(row.grand_total), flt(row.outstanding_amount)
            status = "Paid" if outstanding <= 0 else ("Partly Paid" if outstanding < total else "Unpaid")
        elif row and row.docstatus == 0:
            status, total = "Invoice Draft", flt(row.grand_total)
    frappe.db.set_value("Aqar Content Order", order_name, {"payment_status": status, "invoiced_amount": total,
        "outstanding_amount": outstanding})


def on_invoice_change(doc, method=None):
    if doc.get("custom_aqar_content_order"):
        refresh_payment_status(doc.custom_aqar_content_order)


def on_payment_change(doc, method=None):
    for ref in doc.references:
        if ref.reference_doctype == "Sales Invoice":
            order = frappe.db.get_value("Sales Invoice", ref.reference_name, "custom_aqar_content_order")
            if order:
                refresh_payment_status(order)
                log_event("Payment " + ("Recorded" if doc.docstatus == 1 else "Cancelled"), "Aqar Content Order",
                    order, after={"payment_entry": doc.name, "amount": ref.allocated_amount})
