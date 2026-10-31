"""Working-hours arithmetic for SLAs (§8.3). Calendar comes from Aqar Platform Settings (+ optional Holiday List)."""
from datetime import datetime, time, timedelta

import frappe
from frappe.utils import get_datetime, get_time, getdate

DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")  # index = datetime.weekday()
MAX_DAYS = 400


def get_calendar():
    settings = frappe.get_cached_doc("Aqar Platform Settings")
    days = {d.strip()[:3].title() for d in (settings.work_days or "Sun,Mon,Tue,Wed,Thu").split(",") if d.strip()}
    holidays = set()
    if settings.holiday_list:
        holidays = {getdate(h) for h in frappe.get_all("Holiday", pluck="holiday_date",
            filters={"parent": settings.holiday_list, "parenttype": "Holiday List"})}
    start = get_time(settings.work_start or "08:00:00")
    end = get_time(settings.work_end or "17:00:00")
    return frappe._dict(workdays={DAY_NAMES.index(d) for d in days if d in DAY_NAMES}, holidays=holidays,
        start=time(start.hour, start.minute), end=time(end.hour, end.minute))


def _is_workday(day, cal):
    return day.weekday() in cal.workdays and day not in cal.holidays


def _window(day, cal):
    return datetime.combine(day, cal.start), datetime.combine(day, cal.end)


def day_minutes(cal=None):
    cal = cal or get_calendar()
    return (datetime.combine(datetime.min, cal.end) - datetime.combine(datetime.min, cal.start)).seconds // 60


def add_business_minutes(start, minutes, cal=None):
    cal = cal or get_calendar()
    current, remaining = get_datetime(start), float(minutes)
    for _ in range(MAX_DAYS):
        day = current.date()
        open_at, close_at = _window(day, cal)
        if _is_workday(day, cal) and current < close_at:
            current = max(current, open_at)
            available = (close_at - current).total_seconds() / 60
            if remaining <= available:
                return current + timedelta(minutes=remaining)
            remaining -= available
        current = datetime.combine(day + timedelta(days=1), time.min)
    frappe.throw("Business calendar has no working time; check Aqar Platform Settings.")


def business_minutes_between(start, end, cal=None):
    cal = cal or get_calendar()
    start, end = get_datetime(start), get_datetime(end)
    total, day = 0.0, start.date()
    while day <= end.date():
        if _is_workday(day, cal):
            open_at, close_at = _window(day, cal)
            overlap = (min(close_at, end) - max(open_at, start)).total_seconds() / 60
            total += max(0, overlap)
        day += timedelta(days=1)
    return total


def end_of_business_day(start, cal=None):
    """Same business day if received during or before working hours, otherwise the next working day's close."""
    cal = cal or get_calendar()
    current = get_datetime(start)
    for _ in range(MAX_DAYS):
        day = current.date()
        if _is_workday(day, cal) and current < _window(day, cal)[1]:
            return _window(day, cal)[1]
        current = datetime.combine(day + timedelta(days=1), time.min)
    frappe.throw("Business calendar has no working time; check Aqar Platform Settings.")
