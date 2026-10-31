"""Website enquiries per project or property: how many customers asked, and how far they got (requests → viewings → offers)."""
from collections import Counter

import frappe
from frappe import _
from frappe.utils import add_days, add_months, getdate, today

CLOSED = ("Closed", "Paused")


def execute(filters=None):
    filters = frappe._dict(filters or {})
    start = getdate(filters.from_date or add_months(today(), -3))
    end = getdate(filters.to_date or today())
    rows = frappe.get_all("Aqar Search Request", filters={"interested_in": ["is", "set"],
        "creation": ["between", [start, add_days(end, 1)]]}, fields=["name", "interested_doctype", "interested_in",
        "interested_unit", "status", "creation", "source_page"])
    groups = {}
    for r in rows:
        groups.setdefault((r.interested_doctype, r.interested_in), []).append(r)
    data = [_row(doctype, name, requests) for (doctype, name), requests in groups.items()]
    data.sort(key=lambda d: (-d["enquiries"], d["listing_name"] or ""))
    chart = {"data": {"labels": [d["listing_name"] for d in data[:15]],
        "datasets": [{"name": _("Enquiries"), "values": [d["enquiries"] for d in data[:15]]},
            {"name": _("Viewings"), "values": [d["viewings"] for d in data[:15]]}]}, "type": "bar"} if data else None
    summary = [{"label": _("Website enquiries"), "value": len(rows), "indicator": "Blue"},
        {"label": _("Listings asked about"), "value": len(data), "indicator": "Green"}]
    return _columns(), data, None, chart, summary


def _row(doctype, name, requests):
    names = [r.name for r in requests]
    label = frappe.db.get_value(doctype, name, "project_name" if doctype == "Aqar Development Project" else "property_name")
    pages = Counter(r.source_page for r in requests if r.source_page)
    return {"listing_type": doctype, "listing": name, "listing_name": label, "enquiries": len(requests),
        "unit_enquiries": sum(1 for r in requests if r.interested_unit),
        "open": sum(1 for r in requests if r.status not in CLOSED),
        "viewings": frappe.db.count("Aqar Viewing", {"search_request": ["in", names]}),
        "offers": frappe.db.count("Aqar Offer", {"search_request": ["in", names]}),
        "latest": max(r.creation for r in requests), "top_page": pages.most_common(1)[0][0] if pages else None}


def _columns():
    return [
        {"fieldname": "listing", "label": _("Listing"), "fieldtype": "Dynamic Link", "options": "listing_type", "width": 130},
        {"fieldname": "listing_name", "label": _("Name"), "fieldtype": "Data", "width": 220},
        {"fieldname": "listing_type", "label": _("Type"), "fieldtype": "Link", "options": "DocType", "width": 170},
        {"fieldname": "enquiries", "label": _("Enquiries"), "fieldtype": "Int", "width": 100},
        {"fieldname": "unit_enquiries", "label": _("About a Unit"), "fieldtype": "Int", "width": 110},
        {"fieldname": "open", "label": _("Still Open"), "fieldtype": "Int", "width": 100},
        {"fieldname": "viewings", "label": _("Viewings"), "fieldtype": "Int", "width": 90},
        {"fieldname": "offers", "label": _("Offers"), "fieldtype": "Int", "width": 80},
        {"fieldname": "latest", "label": _("Latest Enquiry"), "fieldtype": "Datetime", "width": 160},
        {"fieldname": "top_page", "label": _("Top Source Page"), "fieldtype": "Data", "width": 220},
    ]
