"""Customer account for the public website (§3.1 "حسابي", §22 customer dashboard).

A logged-in website user sees only records of Contacts that carry the user's own (verified) email address.
Requests, invoices and preferences are returned in customer-safe form; internal fields never leave Frappe.
"""
import frappe
from frappe import _
from frappe.utils import cstr, flt

from aqar360.core import consent

CUSTOMER_ROLE = "Aqar Customer"
SELF_MANAGED = ("Match Alerts", "Marketing", "Ads Personalization")
CHANNELS = ("Email", "WhatsApp", "Phone")


def _require_customer():
    user = frappe.session.user
    if user == "Guest" or CUSTOMER_ROLE not in frappe.get_roles(user):
        frappe.throw(_("Please sign in with a customer account."), frappe.PermissionError)
    return user


def contacts_for(user):
    """Contacts linked to the user or sharing the user's login email (proven by Frappe's email verification)."""
    email = frappe.db.get_value("User", user, "email")
    names = set(frappe.get_all("Contact", filters={"user": user}, pluck="name"))
    names |= set(frappe.get_all("Contact Email", filters={"email_id": email, "parenttype": "Contact"}, pluck="parent"))
    return sorted(names)


def _customers(contacts):
    return sorted({l.link_name for l in frappe.get_all("Dynamic Link", fields=["link_name"], filters={
        "parenttype": "Contact", "parent": ["in", contacts or [""]], "link_doctype": "Customer"})})


@frappe.whitelist(methods=["GET"])
def session_info():
    user = _require_customer()
    from frappe.sessions import get_csrf_token
    return {"user": user, "full_name": frappe.db.get_value("User", user, "full_name"), "csrf_token": get_csrf_token()}


@frappe.whitelist(methods=["GET"])
def session_token():
    """CSRF token for the caller's own session, so the website server can end any session it opened
    (Frappe's logout is POST-only and CSRF-protected). Holding the session id already implies this access."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Not signed in."), frappe.PermissionError)
    from frappe.sessions import get_csrf_token
    return get_csrf_token()


@frappe.whitelist(methods=["GET"])
def get_overview(language="ar"):
    user = _require_customer()
    contacts = contacts_for(user)
    frappe.local.lang = "en" if language == "en" else "ar"
    requests = []
    for doctype in ("Aqar Search Request", "Aqar Opportunity Intake", "Aqar Consultation Request"):
        for name in frappe.get_all(doctype, filters={"contact": ["in", contacts or [""]]}, pluck="name",
                order_by="creation desc", limit=50):
            requests.append(frappe.get_doc(doctype, name).customer_view())
    orders = [{"name": o.name, "title": o.title, "status": _(o.status), "payment_status": _(o.payment_status),
        "total": flt(o.services_total) + flt(o.media_budget)} for o in frappe.get_all("Aqar Content Order",
        filters={"contact": ["in", contacts or [""]], "status": ["!=", "Draft"]},
        fields=["name", "title", "status", "payment_status", "services_total", "media_budget"], order_by="creation desc")]
    invoices = [{"name": i.name, "date": cstr(i.posting_date), "total": flt(i.grand_total),
        "outstanding": flt(i.outstanding_amount), "status": _(i.status)} for i in frappe.get_all("Sales Invoice",
        filters={"customer": ["in", _customers(contacts) or [""]], "docstatus": 1},
        fields=["name", "posting_date", "grand_total", "outstanding_amount", "status"], order_by="posting_date desc")]
    preferences = [{"purpose": p, "channel": c, "granted": any(consent.has_consent(ct, p, c) for ct in contacts)}
        for p in SELF_MANAGED for c in CHANNELS]
    return {"full_name": frappe.db.get_value("User", user, "full_name"), "requests": requests, "orders": orders,
        "invoices": invoices, "preferences": preferences}


@frappe.whitelist(methods=["GET"])
def get_invoice(name=None):
    """Bilingual invoice HTML, only for the customer who owns it."""
    user = _require_customer()
    customer = frappe.db.get_value("Sales Invoice", {"name": cstr(name), "docstatus": 1}, "customer")
    if not customer or customer not in _customers(contacts_for(user)):
        frappe.throw(_("Invoice not found."), frappe.DoesNotExistError)
    # Ownership is verified above; render the print template directly instead of granting the role invoice access.
    template = frappe.db.get_value("Print Format", "Aqar Bilingual Invoice", "html")
    return frappe.render_template(template, {"doc": frappe.get_doc("Sales Invoice", name)})


@frappe.whitelist(methods=["POST"])
def withdraw_consent(purpose=None, channel=None):
    """Customers can withdraw optional consents at any time (§12.1, F.4). Granting needs approved wording (forms)."""
    user = _require_customer()
    if purpose not in SELF_MANAGED or channel not in (*CHANNELS, consent.ALL_CHANNELS):
        frappe.throw(_("Unknown preference."))
    for contact in contacts_for(user):
        consent.record_consent(contact, purpose, channel, False, "Customer Account",
            evidence=f"Withdrawn by {user} in the customer account")
    return {"withdrawn": True}
