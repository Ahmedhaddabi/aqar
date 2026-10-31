"""Hash-chained domain audit trail (§18.1, §26.3). Native Version stays as the editable history."""
import hashlib
import json

import frappe
from frappe.model import no_value_fields, table_fields
from frappe.utils import get_datetime, now_datetime

GENESIS = "0" * 64
HASHED_FIELDS = ("sequence", "event_time", "actor", "action", "reference_doctype",
    "reference_name", "before_json", "after_json", "ip_address", "previous_hash")


def _dumps(value):
    return None if value is None else json.dumps(value, sort_keys=True, default=str, ensure_ascii=False)


def compute_hash(row):
    payload = {f: row.get(f) for f in HASHED_FIELDS}
    payload["event_time"] = get_datetime(payload["event_time"]).isoformat()
    payload["sequence"] = int(payload["sequence"])
    return hashlib.sha256(_dumps(payload).encode()).hexdigest()


def log_event(action, reference_doctype=None, reference_name=None, before=None, after=None):
    last = frappe.db.sql("""select sequence, event_hash from `tabAqar Audit Event`
        order by sequence desc limit 1 for update""", as_dict=True)
    doc = frappe.get_doc({
        "doctype": "Aqar Audit Event",
        "sequence": (last[0].sequence + 1) if last else 1,
        "event_time": now_datetime(),
        "actor": frappe.session.user,
        "action": action,
        "reference_doctype": reference_doctype,
        "reference_name": reference_name,
        "before_json": _dumps(before),
        "after_json": _dumps(after),
        "ip_address": getattr(frappe.local, "request_ip", None),
        "previous_hash": last[0].event_hash if last else GENESIS,
    })
    doc.event_hash = compute_hash(doc.as_dict())
    doc.insert(ignore_permissions=True)
    return doc.name


def verify_chain():
    previous = GENESIS
    rows = frappe.get_all("Aqar Audit Event", fields=["name", "event_hash", *HASHED_FIELDS],
        order_by="sequence asc", limit=0)
    for row in rows:
        if row.previous_hash != previous or compute_hash(row) != row.event_hash:
            return {"ok": False, "checked": len(rows), "first_broken": row.name}
        previous = row.event_hash
    return {"ok": True, "checked": len(rows), "first_broken": None}


def _snapshot(doc):
    return {f.fieldname: doc.get(f.fieldname) for f in doc.meta.fields
        if f.fieldtype not in table_fields and f.fieldtype not in no_value_fields}


def audit_change(doc, method=None):
    before = doc.get_doc_before_save()
    after = _snapshot(doc)
    if not before:
        log_event("Created", doc.doctype, doc.name, after=after)
        return
    previous = _snapshot(before)
    changed = [k for k in after if previous.get(k) != after.get(k)]
    if changed:
        log_event("Updated", doc.doctype, doc.name,
            before={k: previous.get(k) for k in changed}, after={k: after[k] for k in changed})


# Customer records log decision fields only, so the permanent trail holds no personal details.
DECISION_FIELDS = {
    "Aqar Search Request": ("status", "budget_min", "budget_max", "budget_tolerance_pct", "timing",
        "alerts_paused", "expires_on", "source_channel", "duplicate_review", "first_response_at"),
    "Aqar Opportunity Intake": ("review_status", "internal_decline_reason", "opportunity_score",
        "asking_price", "source_channel", "duplicate_review"),
    "Aqar Consultation Request": ("status", "source_channel", "duplicate_review", "first_response_at"),
    "Property": ("custom_aqar_sales_availability", "custom_aqar_verification_status", "custom_aqar_visibility",
        "custom_aqar_sale_price", "custom_aqar_rent_price", "custom_aqar_owner_contact", "custom_aqar_project"),
    "Property Unit": ("custom_aqar_sales_availability", "custom_aqar_verification_status", "sale_price",
        "rent_amount", "status"),
    "Aqar Development Project": ("sales_availability", "construction_status", "verification_status",
        "visibility", "price_from", "price_to", "foreign_ownership"),
    "Aqar Content Order": ("status", "services_total", "media_budget", "quotation", "sales_invoice",
        "payment_override", "allow_extra_revisions", "assigned_to"),
}


def audit_decisions(doc, method=None):
    fields = DECISION_FIELDS[doc.doctype]
    before = doc.get_doc_before_save()
    if not before:
        log_event("Created", doc.doctype, doc.name, after={f: doc.get(f) for f in fields})
        return
    changed = [f for f in fields if before.get(f) != doc.get(f)]
    if changed:
        log_event("Updated", doc.doctype, doc.name,
            before={f: before.get(f) for f in changed}, after={f: doc.get(f) for f in changed})


def audit_trash(doc, method=None):
    log_event("Deleted", doc.doctype, doc.name, before=_snapshot(doc))


def audit_submission(doc, method=None):
    action = {"on_submit": "Submitted", "on_cancel": "Cancelled"}.get(method, method)
    log_event(action, doc.doctype, doc.name, after={"docstatus": doc.docstatus,
        "grand_total": doc.get("grand_total") or doc.get("paid_amount") or doc.get("total_debit")})


def audit_user_roles(doc, method=None):
    before = doc.get_doc_before_save()
    old = {r.role for r in before.roles} if before else set()
    new = {r.role for r in doc.roles}
    if old != new:
        log_event("Roles Changed", "User", doc.name,
            before={"roles": sorted(old)}, after={"roles": sorted(new)})
