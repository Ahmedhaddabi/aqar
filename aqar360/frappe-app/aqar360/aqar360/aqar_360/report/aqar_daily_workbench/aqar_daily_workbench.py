"""Daily Opportunity Workbench (§27.23): who to contact today, why, and the next best action (§26.9).

Rows come from frappe.get_list, so each user sees only records their role allows; Excel export uses the same rows.
"""
import frappe
from frappe import _
from frappe.utils import cint, date_diff, getdate, today

PRIORITY = {"Red": 0, "Amber": 1, "Green": 2, "": 3}


def execute(filters=None):
    filters = frappe._dict(filters or {})
    rows = _requests(filters) + _intakes(filters) + _consultations(filters)
    rows.sort(key=lambda r: (PRIORITY.get(r["sla"], 3), -cint(r["priority_points"]), str(r["received"] or "")))
    return _columns(), rows


def _columns():
    return [
        {"fieldname": "next_action", "label": _("Next Best Action"), "fieldtype": "Data", "width": 260},
        {"fieldname": "record", "label": _("Record"), "fieldtype": "Dynamic Link", "options": "record_type", "width": 150},
        {"fieldname": "record_type", "label": _("Type"), "fieldtype": "Link", "options": "DocType", "width": 150},
        {"fieldname": "customer", "label": _("Customer"), "fieldtype": "Data", "width": 160},
        {"fieldname": "phone", "label": _("Phone"), "fieldtype": "Data", "width": 120},
        {"fieldname": "need", "label": _("Need"), "fieldtype": "Data", "width": 200},
        {"fieldname": "asked_about", "label": _("Asked About"), "fieldtype": "Data", "width": 200},
        {"fieldname": "budget", "label": _("Budget (OMR)"), "fieldtype": "Currency", "width": 110},
        {"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 130},
        {"fieldname": "sla", "label": _("SLA"), "fieldtype": "Data", "width": 70},
        {"fieldname": "best_match", "label": _("Best Match"), "fieldtype": "Data", "width": 200},
        {"fieldname": "best_score", "label": _("Score"), "fieldtype": "Percent", "width": 80},
        {"fieldname": "open_matches", "label": _("Open Matches"), "fieldtype": "Int", "width": 90},
        {"fieldname": "source", "label": _("Source"), "fieldtype": "Data", "width": 100},
        {"fieldname": "owner_user", "label": _("Owner"), "fieldtype": "Link", "options": "User", "width": 150},
        {"fieldname": "received", "label": _("Received"), "fieldtype": "Datetime", "width": 150},
    ]


def _owner_filter(filters):
    return {"assigned_to": frappe.session.user} if filters.get("mine") else {}


def _sla(doctype, name):
    row = frappe.get_all("Aqar SLA Timer", filters={"reference_doctype": doctype, "reference_name": name,
        "state": ["in", ["Running", "Paused"]]}, fields=["rag", "due_at"], order_by="due_at asc", limit=1)
    return (row[0].rag, row[0].due_at) if row else ("", None)


def _row(doc, doctype, need, budget, status, action, points, **extra):
    rag, _due = _sla(doctype, doc.name)
    return {"record": doc.name, "record_type": doctype, "customer": doc.submitted_name, "phone": doc.submitted_phone,
        "need": need, "budget": budget, "status": _(status), "sla": rag, "next_action": action,
        "priority_points": points + (5 if rag == "Red" else 0), "source": doc.source_channel,
        "owner_user": doc.assigned_to, "received": doc.submitted_at, "best_match": None, "best_score": None,
        "open_matches": 0, "asked_about": None, **extra}


def _requests(filters):
    docs = frappe.get_list("Aqar Search Request", fields=["name", "submitted_name", "submitted_phone", "purpose",
        "property_type", "budget_max", "status", "source_channel", "assigned_to", "submitted_at", "first_response_at",
        "timing", "expires_on", "interested_doctype", "interested_in", "interested_unit"], filters={"status": ["not in", ["Closed", "Paused"]], **_owner_filter(filters)},
        limit_page_length=500)
    rows = []
    for doc in docs:
        matches = frappe.get_all("Aqar Match", filters={"search_request": doc.name,
            "status": ["in", ["Suggested", "Team Reviewed", "Approved"]]}, fields=["status", "score", "supply_label"],
            order_by="score desc")
        asked = interest_label(doc)
        action, points = _request_action(doc, matches)
        if asked and not doc.first_response_at:
            action = _("Call now: asked about {0}").format(asked)
        rows.append(_row(doc, "Aqar Search Request", f"{_(doc.purpose)} · {_(doc.property_type)}", doc.budget_max,
            doc.status, action, points, best_match=matches[0].supply_label if matches else None,
            best_score=matches[0].score if matches else None, open_matches=len(matches), asked_about=asked))
    return rows


def interest_label(doc):
    """"Mawaleh Gardens / A-201" for the project, property or unit the customer chose on the website."""
    if not doc.get("interested_in"):
        return None
    field = "project_name" if doc.interested_doctype == "Aqar Development Project" else "property_name"
    label = frappe.db.get_value(doc.interested_doctype, doc.interested_in, field) or doc.interested_in
    unit = frappe.db.get_value("Property Unit", doc.interested_unit, "unit_number") if doc.get("interested_unit") else None
    return f"{label} / {unit}" if unit else label


def _request_action(doc, matches):
    """Rule-based next best action; the order reflects what loses the customer fastest."""
    if not doc.first_response_at:
        return _("Call now: first response not logged"), 10
    if frappe.db.exists("Aqar Offer", {"search_request": doc.name, "status": ["in", ["Submitted to Owner", "Countered"]]}):
        return _("Follow up the open offer"), 9
    viewing = frappe.get_all("Aqar Viewing", filters={"search_request": doc.name, "status": ["in", ["Scheduled", "Confirmed"]]},
        fields=["scheduled_at"], order_by="scheduled_at asc", limit=1)
    if viewing and getdate(viewing[0].scheduled_at) <= getdate(today()):
        return _("Viewing today or overdue: confirm and record the outcome"), 8
    approved = [m for m in matches if m.status == "Approved"]
    if approved:
        return _("Share {0} approved match(es) with the customer").format(len(approved)), 7
    suggested = [m for m in matches if m.status in ("Suggested", "Team Reviewed")]
    if suggested:
        return _("Review {0} suggested match(es)").format(len(suggested)), 6
    if doc.expires_on and date_diff(doc.expires_on, today()) <= 7:
        return _("Request expires soon: confirm the customer is still searching"), 4
    if doc.submitted_at and date_diff(today(), getdate(doc.submitted_at)) >= 7:
        return _("No match for 7+ days: review budget, areas or type with the customer"), 3
    return _("Waiting for new supply (smart waiting list)"), 1


def _intakes(filters):
    if not filters.get("include_intakes", 1):
        return []
    docs = frappe.get_list("Aqar Opportunity Intake", fields=["name", "submitted_name", "submitted_phone", "request_type",
        "property_type", "asking_price", "review_status", "source_channel", "assigned_to", "submitted_at"],
        filters={"review_status": ["in", ["Submitted", "Under Review", "Need More Info", "Adjustment Suggested"]],
            **_owner_filter(filters)}, limit_page_length=500)
    actions = {"Submitted": (_("Start the review"), 8), "Under Review": (_("Decide: accept, ask for info or decline"), 7),
        "Need More Info": (_("Chase the owner for missing information"), 4),
        "Adjustment Suggested": (_("Follow up the suggested adjustment"), 4)}
    return [_row(doc, "Aqar Opportunity Intake", f"{_(doc.request_type)} · {_(doc.property_type)}", doc.asking_price,
        doc.review_status, *actions[doc.review_status]) for doc in docs]


def _consultations(filters):
    if not filters.get("include_intakes", 1):
        return []
    docs = frappe.get_list("Aqar Consultation Request", fields=["name", "submitted_name", "submitted_phone", "asset_type",
        "client_goal", "budget", "status", "source_channel", "assigned_to", "submitted_at"],
        filters={"status": ["in", ["New", "Scoping"]], **_owner_filter(filters)}, limit_page_length=500)
    return [_row(doc, "Aqar Consultation Request", f"{_(doc.client_goal)} · {_(doc.asset_type)}", doc.budget, doc.status,
        _("Call to scope the consultation") if doc.status == "New" else _("Send the scope and quotation"), 6)
        for doc in docs]
