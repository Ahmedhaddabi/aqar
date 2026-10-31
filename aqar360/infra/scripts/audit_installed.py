"""Run inside the installed Bench. Export metadata only, never business records."""
import json
import os
from pathlib import Path

import frappe

os.chdir("/home/frappe/frappe-bench/sites")
frappe.init(site="localhost", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
try:
    apps = frappe.get_installed_apps()
    inventory = []
    for app in apps:
        root = Path(frappe.get_app_path(app))
        for path in sorted(root.glob("**/doctype/*/*.json")):
            doc = json.loads(path.read_text())
            if not isinstance(doc, dict) or doc.get("doctype") != "DocType":
                continue
            name = doc["name"]
            meta = frappe.get_meta(name)
            inventory.append({
                "app": app, "name": name, "module": meta.module,
                "path": str(path.relative_to(root.parent.parent)),
                "istable": meta.istable, "issingle": meta.issingle,
                "track_changes": meta.track_changes,
                "is_published_field": meta.get("is_published_field"),
                "fields": [{k: f.get(k) for k in
                    ("fieldname", "fieldtype", "label", "options", "reqd", "permlevel", "default")}
                    for f in meta.fields],
                "permissions": [{k: p.get(k) for k in
                    ("role", "permlevel", "read", "write", "create", "delete", "export", "share", "if_owner")}
                    for p in meta.permissions],
            })
    settings = frappe.get_single("System Settings")
    result = {
        "site": "localhost", "apps": apps, "doctypes": inventory,
        "workflows": frappe.get_all("Workflow", fields=["name", "document_type", "is_active"]),
        "web_forms": frappe.get_all("Web Form", fields=["name", "doc_type", "route", "published", "login_required"]),
        "print_formats": frappe.get_all("Print Format", fields=["name", "doc_type", "standard", "disabled"]),
        "system_settings": {k: settings.get(k) for k in
            ("enable_two_factor_auth", "two_factor_method", "session_expiry", "allow_login_using_mobile_number", "enable_password_policy")},
        "portal_pages": {app: [str(p.relative_to(Path(frappe.get_app_path(app))))
            for p in Path(frappe.get_app_path(app)).glob("www/**/*.html")] for app in apps},
        "privileged_role_2fa": frappe.get_all("Role", filters={"two_factor_auth": 1}, pluck="name"),
    }
    print(json.dumps(result, indent=2, default=str))
finally:
    frappe.destroy()
