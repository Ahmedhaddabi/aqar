"""Internal SLA timers (§8.3, §26.1): start, pause on Waiting on Client, complete, Green/Amber/Red and escalation.

Policies (targets) are editable records; which record events start/pause/complete a timer is defined here.
Escalation: Amber → owner warned; breach → team leads; 150% of target → managers.
"""
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_to_date, flt, get_datetime, now_datetime

from aqar360.core.audit import log_event
from aqar360.core.notify import notify_owner_or_team, notify_users, users_with_roles
from aqar360.operations.business_time import (add_business_minutes, business_minutes_between, day_minutes,
    end_of_business_day, get_calendar)

FINAL = ("Completed", "Cancelled")
DECIDED_INTAKE = ("Accepted", "Not Selected")
WAITING_INTAKE = ("Need More Info", "Adjustment Suggested")


def _rule(start=lambda d: True, pause=lambda d: False, complete=lambda d: False, cancel=lambda d: False,
        start_at=None, repeat=False):
    """start_at(doc) gives the clock start (default: when the start condition is first seen).
    repeat=True opens a new timer each time the start condition recurs (e.g. every revision round)."""
    return frappe._dict(start=start, pause=pause, complete=complete, cancel=cancel, start_at=start_at, repeat=repeat)


def _received(doc):
    return doc.get("submitted_at") or doc.creation


CONTENT_POST_SHOOT = ("Shot", "In Production", "Client Review", "Changes Requested", "Waiting on Client",
    "Delivered", "Closed")
CONTENT_SERVICE_POLICIES = ("content_photos", "content_floor_plan", "content_standard_video", "content_ai_video",
    "content_drone_video", "content_presenter_video", "content_lifestyle_video")


def _content_service_rule(policy_key):
    def rows(doc):
        return [r for r in doc.services if r.sla_policy == policy_key]
    return _rule(start=lambda d: d.status in CONTENT_POST_SHOOT and bool(rows(d)),
        pause=lambda d: d.status == "Waiting on Client",
        complete=lambda d: bool(rows(d)) and all(r.ready_for_review for r in rows(d)),
        cancel=lambda d: d.status == "Cancelled")


BINDINGS = {
    "Aqar Search Request": {"search_first_response": _rule(start_at=_received,
        complete=lambda d: bool(d.first_response_at),
        cancel=lambda d: d.status == "Closed" and not d.first_response_at)},
    "Aqar Opportunity Intake": {"intake_review": _rule(start_at=_received,
        pause=lambda d: d.review_status in WAITING_INTAKE,
        complete=lambda d: d.review_status in DECIDED_INTAKE)},
    "Aqar Consultation Request": {"consultation_first_response": _rule(start_at=_received,
        complete=lambda d: bool(d.first_response_at) or d.status != "New")},
    "Aqar Content Order": {
        "content_shoot_confirmation": _rule(
            start=lambda d: d.status not in ("Draft", "Quoted", "Cancelled"),
            pause=lambda d: d.status == "Waiting on Client",
            complete=lambda d: bool(d.shoot_at) and d.status not in ("Confirmed", "Waiting on Client"),
            cancel=lambda d: d.status == "Cancelled"),
        **{key: _content_service_rule(key) for key in CONTENT_SERVICE_POLICIES},
        "content_minor_revision": _rule(repeat=True,
            start=lambda d: d.status == "Changes Requested",
            pause=lambda d: d.status == "Waiting on Client",
            complete=lambda d: d.status in ("Client Review", "Delivered", "Closed"),
            cancel=lambda d: d.status == "Cancelled"),
    },
}


def _policy(key):
    return frappe.db.get_value("Aqar SLA Policy", {"policy_key": key, "active": 1},
        ["name", "target_rule", "target_value", "amber_at_pct"], as_dict=True)


def _business(policy):
    return policy.target_rule != "Calendar Minutes"


def _shift(moment, minutes, business, cal):
    return add_business_minutes(moment, minutes, cal) if business else get_datetime(moment) + timedelta(minutes=minutes)


def _span(start, end, business, cal):
    return business_minutes_between(start, end, cal) if business else (get_datetime(end) - get_datetime(start)).total_seconds() / 60


def compute_targets(policy, started_at, cal=None):
    """(due, amber, manager escalation) for a policy starting at started_at."""
    cal = cal or get_calendar()
    business = _business(policy)
    if policy.target_rule == "Same Business Day":
        due = end_of_business_day(started_at, cal)
    elif policy.target_rule == "Business Days":
        due = add_business_minutes(started_at, flt(policy.target_value) * day_minutes(cal), cal)
    else:
        due = _shift(started_at, flt(policy.target_value), business, cal)
    total = _span(started_at, due, business, cal)
    amber = _shift(started_at, total * flt(policy.amber_at_pct or 75) / 100, business, cal)
    manager = _shift(due, total * 0.5, business, cal)
    return due, amber, manager


def sync_timers(doc, method=None):
    """on_update hook for bound DocTypes."""
    for key, rule in BINDINGS.get(doc.doctype, {}).items():
        policy = _policy(key)
        if not policy:
            continue
        latest = frappe.get_all("Aqar SLA Timer", pluck="name", order_by="creation desc", limit=1, filters={
            "reference_doctype": doc.doctype, "reference_name": doc.name, "policy": policy.name})
        if not latest:
            if rule.start(doc):
                _start(doc, policy, rule)
            continue
        timer = frappe.get_doc("Aqar SLA Timer", latest[0])
        if timer.state in FINAL:
            if rule.repeat and rule.start(doc) and not rule.complete(doc) and not rule.cancel(doc):
                _start(doc, policy, rule)
            continue
        timer.owner_user = doc.get("assigned_to")
        if rule.cancel(doc):
            timer.state = "Cancelled"
        elif rule.complete(doc):
            _complete(timer)
        elif rule.pause(doc) and timer.state == "Running":
            timer.state, timer.paused_at = "Paused", now_datetime()
        elif not rule.pause(doc) and timer.state == "Paused":
            _resume(timer, policy)
        timer.save(ignore_permissions=True)


def _start(doc, policy, rule):
    started = get_datetime(rule.start_at(doc) if rule.start_at else now_datetime())
    due, amber, manager = compute_targets(policy, started)
    frappe.get_doc({"doctype": "Aqar SLA Timer", "reference_doctype": doc.doctype, "reference_name": doc.name,
        "policy": policy.name, "owner_user": doc.get("assigned_to"), "basis": "Business" if _business(policy) else "Calendar",
        "started_at": started, "due_at": due, "amber_at": amber, "manager_escalation_at": manager,
        "state": "Running", "rag": _rag(due, amber)}).insert(ignore_permissions=True)


def _resume(timer, policy):
    cal = get_calendar()
    business = _business(policy)
    paused = _span(timer.paused_at, now_datetime(), business, cal)
    timer.total_paused_minutes = flt(timer.total_paused_minutes) + paused
    timer.due_at = _shift(timer.due_at, paused, business, cal)
    timer.amber_at = _shift(timer.amber_at, paused, business, cal)
    timer.manager_escalation_at = _shift(timer.manager_escalation_at, paused, business, cal)
    timer.state, timer.paused_at = "Running", None


def _complete(timer):
    now = now_datetime()
    timer.state, timer.completed_at = "Completed", now
    timer.outcome = "On Time" if now <= get_datetime(timer.due_at) else "Late"
    timer.rag = "Green" if timer.outcome == "On Time" else "Red"
    basis_business = timer.basis == "Business"
    timer.response_minutes = round(max(0, _span(timer.started_at, now, basis_business, get_calendar())
        - flt(timer.total_paused_minutes)), 1)


def _rag(due, amber, now=None):
    now = now or now_datetime()
    return "Red" if now >= get_datetime(due) else ("Amber" if now >= get_datetime(amber) else "Green")


def refresh_timers():
    """Scheduler (every 5 minutes): update RAG and escalate running timers."""
    now = now_datetime()
    for name in frappe.get_all("Aqar SLA Timer", filters={"state": "Running"}, pluck="name"):
        timer = frappe.get_doc("Aqar SLA Timer", name)
        timer.rag = _rag(timer.due_at, timer.amber_at, now)
        level = timer.escalation_level or 0
        label = f"{_(timer.reference_doctype)} {timer.reference_name}"
        ref = (timer.reference_doctype, timer.reference_name)
        # Cumulative: a timer found far overdue still warns the owner and team leads, not only managers.
        if timer.rag in ("Amber", "Red") and level < 1:
            notify_owner_or_team(timer.owner_user, *ref, _("SLA at risk: {0} is due {1}").format(
                label, frappe.utils.pretty_date(timer.due_at)))
            level = 1
        if timer.rag == "Red" and level < 2:
            notify_users([timer.owner_user, *users_with_roles(("Aqar Team Lead",))], *ref,
                _("SLA breached: {0}").format(label))
            level = 2
        if now >= get_datetime(timer.manager_escalation_at) and level < 3:
            notify_users(users_with_roles(("Aqar Manager",)), *ref, _("SLA seriously overdue: {0}").format(label))
            level = 3
        if level != (timer.escalation_level or 0):
            timer.escalation_level = level
            log_event("SLA Escalated", "Aqar SLA Timer", timer.name, after={"level": level, "rag": timer.rag})
        timer.save(ignore_permissions=True)


@frappe.whitelist()
def sla_summary(from_date=None, to_date=None):
    """KPIs (§8.3): compliance %, average response minutes, currently overdue."""
    frappe.only_for(("System Manager", "Aqar Admin", "Aqar Manager", "Aqar Team Lead"))
    filters = {"started_at": ["between", [from_date or add_to_date(now_datetime(), days=-30), to_date or now_datetime()]]}
    done = frappe.get_all("Aqar SLA Timer", filters={**filters, "state": "Completed"},
        fields=["outcome", "response_minutes"])
    on_time = sum(1 for t in done if t.outcome == "On Time")
    return {
        "completed": len(done),
        "compliance_pct": round(on_time / len(done) * 100, 1) if done else None,
        "avg_response_minutes": round(sum(flt(t.response_minutes) for t in done) / len(done), 1) if done else None,
        "overdue_now": frappe.db.count("Aqar SLA Timer", {"state": "Running", "rag": "Red"}),
        "at_risk_now": frappe.db.count("Aqar SLA Timer", {"state": "Running", "rag": "Amber"}),
    }
