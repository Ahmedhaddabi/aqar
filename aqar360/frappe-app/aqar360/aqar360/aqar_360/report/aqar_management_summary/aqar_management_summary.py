"""Management KPIs (§25.1, §20.3): business outcomes, not raw clicks. Revenue excludes pass-through money (§9.2)."""
import frappe
from frappe import _
from frappe.utils import add_days, flt, get_first_day, getdate, today

from aqar360.commerce.setup import PASS_THROUGH_ACCOUNT


def execute(filters=None):
    filters = frappe._dict(filters or {})
    start = getdate(filters.from_date or get_first_day(today()))
    end = getdate(filters.to_date or today())
    period = ["between", [start, add_days(end, 1)]]
    summary = _summary(start, end, period)
    data = _by_source(period)
    chart = {"data": {"labels": [r["source"] for r in data],
        "datasets": [{"name": _("Requests"), "values": [r["requests"] for r in data]},
            {"name": _("Viewings"), "values": [r["viewings"] for r in data]}]}, "type": "bar"}
    return _columns(), data, None, chart, summary


def _count(doctype, filters):
    return frappe.db.count(doctype, filters)


def _ledger(account_filter, start, end):
    """Credit minus debit on matching accounts for the default company in the period."""
    company = frappe.defaults.get_global_default("company")
    if not company:
        return 0
    accounts = frappe.get_all("Account", filters={"company": company, **account_filter}, pluck="name")
    if not accounts:
        return 0
    row = frappe.db.sql("""select coalesce(sum(credit - debit), 0) from `tabGL Entry`
        where account in %(accounts)s and is_cancelled = 0 and posting_date between %(start)s and %(end)s""",
        {"accounts": accounts, "start": start, "end": end})
    return flt(row[0][0])


def _summary(start, end, period):
    requests = _count("Aqar Search Request", {"creation": period})
    reviewed = _count("Aqar Opportunity Intake", {"creation": period, "review_status": ["in", ["Accepted", "Not Selected"]]})
    accepted = _count("Aqar Opportunity Intake", {"creation": period, "review_status": "Accepted"})
    timers = frappe.get_all("Aqar SLA Timer", filters={"state": "Completed", "completed_at": period}, pluck="outcome")
    receivable = frappe.db.sql("""select coalesce(sum(outstanding_amount), 0) from `tabSales Invoice`
        where docstatus = 1 and outstanding_amount > 0""")[0][0] if frappe.db.table_exists("Sales Invoice") else 0
    cards = [
        (_("New search requests"), requests, "Int", "blue"),
        (_("Owner intakes accepted"), f"{accepted} / {reviewed}", "Data", "blue"),
        (_("Matches suggested"), _count("Aqar Match", {"creation": period}), "Int", "blue"),
        (_("Viewings completed"), _count("Aqar Viewing", {"status": "Completed", "scheduled_at": period}), "Int", "green"),
        (_("Offers accepted"), _count("Aqar Offer", {"status": "Accepted", "modified": period}), "Int", "green"),
        (_("Content orders delivered"), _count("Aqar Content Order", {"status": ["in", ["Delivered", "Closed"]],
            "delivered_at": period}), "Int", "green"),
        (_("SLA compliance %"), round(timers.count("On Time") / len(timers) * 100, 1) if timers else 0, "Percent",
            "green" if not timers or timers.count("On Time") / len(timers) >= 0.9 else "red"),
        (_("Overdue now"), _count("Aqar SLA Timer", {"state": "Running", "rag": "Red"}), "Int", "red"),
        (_("Revenue (OMR)"), _ledger({"root_type": "Income", "is_group": 0}, start, end), "Currency", "green"),
        (_("Client media funds received (not revenue)"), _ledger({"account_name": PASS_THROUGH_ACCOUNT}, start, end),
            "Currency", "grey"),
        (_("Receivables outstanding (OMR)"), flt(receivable), "Currency", "orange"),
    ]
    return [{"label": label, "value": value, "datatype": datatype, "indicator": colour}
        for label, value, datatype, colour in cards]


def _columns():
    return [
        {"fieldname": "source", "label": _("Source Channel"), "fieldtype": "Data", "width": 160},
        {"fieldname": "requests", "label": _("Requests"), "fieldtype": "Int", "width": 100},
        {"fieldname": "contacted", "label": _("Contacted"), "fieldtype": "Int", "width": 100},
        {"fieldname": "viewings", "label": _("Viewings"), "fieldtype": "Int", "width": 100},
        {"fieldname": "offers", "label": _("Offers"), "fieldtype": "Int", "width": 100},
        {"fieldname": "accepted", "label": _("Offers Accepted"), "fieldtype": "Int", "width": 120},
        {"fieldname": "viewing_rate", "label": _("Request → Viewing %"), "fieldtype": "Percent", "width": 150},
    ]


def _by_source(period):
    """Qualified outcomes per channel, so marketing is judged on viewings and offers, not lead counts (§20.3)."""
    rows = {}
    for req in frappe.get_all("Aqar Search Request", filters={"creation": period},
            fields=["name", "source_channel", "first_response_at"]):
        row = rows.setdefault(req.source_channel or _("Unknown"), {"source": req.source_channel or _("Unknown"),
            "requests": 0, "contacted": 0, "viewings": 0, "offers": 0, "accepted": 0})
        row["requests"] += 1
        row["contacted"] += int(bool(req.first_response_at))
        row["viewings"] += int(bool(frappe.db.exists("Aqar Viewing", {"search_request": req.name, "status": "Completed"})))
        row["offers"] += int(bool(frappe.db.exists("Aqar Offer", {"search_request": req.name})))
        row["accepted"] += int(bool(frappe.db.exists("Aqar Offer", {"search_request": req.name, "status": "Accepted"})))
    for row in rows.values():
        row["viewing_rate"] = round(row["viewings"] / row["requests"] * 100, 1) if row["requests"] else 0
    return sorted(rows.values(), key=lambda r: -r["requests"])
