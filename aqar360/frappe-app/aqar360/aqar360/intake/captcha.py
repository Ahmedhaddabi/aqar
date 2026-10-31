"""Cloudflare Turnstile check for public forms. Without a configured secret, only Local/Staging accept submissions."""
import frappe
import requests
from frappe import _

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify(token):
    secret = frappe.conf.get("aqar_turnstile_secret")
    if not secret:
        if frappe.db.get_single_value("Aqar Platform Settings", "environment") in ("Local", "Staging"):
            return
        frappe.throw(_("Form protection is not configured."), frappe.PermissionError)
    try:
        result = requests.post(VERIFY_URL, timeout=10, data={"secret": secret, "response": token or "",
            "remoteip": getattr(frappe.local, "request_ip", None)}).json()
    except (requests.RequestException, ValueError):
        result = {}
    if not result.get("success"):
        frappe.throw(_("Please complete the security check and try again."), frappe.PermissionError)
