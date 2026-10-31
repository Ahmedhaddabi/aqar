"""Source provenance and freshness (§27.21)."""
import frappe
from frappe.utils import add_days, getdate, today

SOURCE_RANK = (
    "First-Party / Developer Confirmed", "Signed Agreement / Official Document",
    "Approved Partner / API", "Official Public Source", "Public Discovery Signal", "Unverified Lead",
)


def freshness_status(last_verified, reverify_after_days):
    if not last_verified:
        return "Unverified"
    expired = add_days(getdate(last_verified), reverify_after_days or 0) < getdate(today())
    return "Needs Reverification" if expired else "Fresh"


def mark_stale_observations():
    """Daily job: flag observations whose verification window has passed."""
    frappe.db.sql("""update `tabAqar Source Observation`
        set freshness_status = 'Needs Reverification'
        where freshness_status = 'Fresh'
          and date_add(last_verified, interval reverify_after_days day) < %s""", today())
