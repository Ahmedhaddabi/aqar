"""Server-side feature flags (§27.11). Later-phase flags stay locked behind Aqar Platform Settings gates."""
import zlib

import frappe

GATE_FIELDS = {"Phase 2": "phase_2_enabled", "Phase 3": "phase_3_enabled", "Public AI": "public_ai_enabled"}


def gate_is_open(gate):
    field = GATE_FIELDS.get(gate)
    return not field or bool(frappe.db.get_single_value("Aqar Platform Settings", field))


def is_enabled(flag_key, user=None):
    if not frappe.db.exists("Aqar Feature Flag", flag_key):
        return False
    flag = frappe.get_cached_doc("Aqar Feature Flag", flag_key)
    if not flag.enabled or not gate_is_open(flag.required_gate):
        return False
    user = user or frappe.session.user
    if flag.audience == "Everyone":
        return True
    if flag.audience == "Staff Only":
        return frappe.get_cached_value("User", user, "user_type") == "System User"
    # Stable per-user bucket so a customer does not flip between variants.
    return zlib.crc32(f"{flag_key}:{user}".encode()) % 100 < (flag.rollout_percentage or 0)
