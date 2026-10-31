"""Approved, versioned message templates (§26.4). Variables are HTML-escaped before rendering."""
import frappe
from frappe.utils import escape_html

SAMPLE_CONTEXT = {"person": "Customer", "request_number": "REQ-0000-00000", "link": "https://example.invalid",
    "company": "Aqar 360", "viewing_time": "2026-01-01 10:00", "property": "Property", "amount": "100.000",
    "due_date": "2026-01-01", "order": "CNT-0000-00000", "summary": "…"}


def render(template, context):
    safe = {key: escape_html(str(value)) if value is not None else "" for key, value in context.items()}
    return frappe.render_template(template, safe)


def current_template(key, language, channel="Email"):
    """Latest approved version; falls back to the other language rather than sending nothing."""
    for lang in (language, "en" if language == "ar" else "ar"):
        name = frappe.get_all("Aqar Message Template", pluck="name", order_by="version desc", limit=1,
            filters={"template_key": key, "language": lang, "channel": channel, "status": "Approved"})
        if name:
            return frappe.get_doc("Aqar Message Template", name[0])
    return None
