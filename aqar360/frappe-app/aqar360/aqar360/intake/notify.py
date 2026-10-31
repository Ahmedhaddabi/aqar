"""Request messages go through the central outbox (aqar360.messaging.outbox) using approved templates.

The §2.3 decline wording below is the source for the seeded "not_selected" template.
"""
import frappe
from frappe.utils import get_url

DECLINE_AR = ("شكرًا لمشاركتنا تفاصيل طلبك. قام فريقنا بمراجعة المعلومات بعناية، وفي الوقت الحالي لن نتمكن من "
    "استلام الطلب ضمن الفرص التي نعمل عليها. يعتمد الاختيار على مجموعة من العوامل مثل ظروف السوق، مستوى الطلب، "
    "الموقع، التسعير، ومدى توافق الفرصة مع نطاق عملنا الحالي. نقدر ثقتك بنا، ويسعدنا إعادة مراجعة الطلب مستقبلًا "
    "إذا تغيرت بعض التفاصيل أو ظروف السوق.")
DECLINE_EN = ("Thank you for sharing the details of your request. Our team has reviewed the information carefully, "
    "and at this time we are unable to take the request on among the opportunities we are working on. Selection "
    "depends on factors such as market conditions, demand, location, pricing and how well the opportunity fits our "
    "current scope. We appreciate your trust, and we would be glad to review the request again in future if some "
    "details or market conditions change.")

def self_service_url(token, language):
    base = frappe.conf.get("aqar_public_site_url") or get_url()
    return f"{base.rstrip('/')}/{language}/my-request?token={token}"


def company_name(language):
    return frappe.conf.get(f"aqar_company_name_{language}") or ("عقار 360" if language == "ar" else "Aqar 360")


def send_customer_message(doc, key, token=None):
    """Queue a request-related message through the outbox (consent, dedupe, templates, retries)."""
    from aqar360.messaging.outbox import queue_message
    language = doc.language if doc.language in ("ar", "en") else "ar"
    # "received" is sent once per request; status messages once per status change.
    suffix = "" if key == "received" else f":{doc.modified}"
    outbox = queue_message(key, recipient=doc.submitted_email, language=language, contact=doc.contact,
        reference_doctype=doc.doctype, reference_name=doc.name, idempotency_key=f"{key}:{doc.doctype}:{doc.name}{suffix}",
        preferred_channel=doc.get("preferred_channel") or "Email",
        context={"person": doc.submitted_name, "request_number": doc.name, "company": company_name(language),
            "link": self_service_url(token, language) if token else ""})
    return outbox.status in ("Sent", "Queued")
