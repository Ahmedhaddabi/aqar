"""Strict allowlist validation for public payloads (api.md: schemas, no unknown keys)."""
import re

import frappe
from frappe import _
from frappe.utils import flt, validate_email_address

from aqar360.intake.identity import normalize_phone

CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class SchemaError(frappe.ValidationError):
    def __init__(self, fields):
        self.fields = fields
        super().__init__(_("Please correct the highlighted fields."))


def field(kind, required=False, **options):
    return (kind, required, options)


def _text(value, max_length=140):
    value = CONTROL_CHARS.sub("", str(value)).strip()
    if len(value) > max_length:
        raise ValueError(_("Must be at most {0} characters.").format(max_length))
    return value


def _email(value):
    value = str(value).strip().lower()
    if not validate_email_address(value, throw=False):
        raise ValueError(_("Enter a valid email address."))
    return value


def _choice(value, options):
    if value not in options:
        raise ValueError(_("Choose one of the listed options."))
    return value


def _integer(value, minimum=0, maximum=1000):
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError(_("Enter a whole number.")) from None
    if not minimum <= number <= maximum:
        raise ValueError(_("Must be between {0} and {1}.").format(minimum, maximum))
    return number


def _money(value):
    amount = flt(value, 3)
    if amount < 0 or amount > 1_000_000_000:
        raise ValueError(_("Enter a valid amount in OMR."))
    return amount


def _boolean(value):
    return value in (True, 1, "1", "true", "True", "on", "yes")


def _url(value):
    value = _text(value, 500)
    if not re.match(r"^https://", value):
        raise ValueError(_("Enter a full https:// link."))
    return value


def _areas(value, maximum=10):
    value = frappe.parse_json(value) if isinstance(value, str) else value
    if not isinstance(value, list) or not value or len(value) > maximum:
        raise ValueError(_("Choose between 1 and {0} areas.").format(maximum))
    for area in value:
        if not frappe.db.get_value("Aqar Area", str(area), "is_active"):
            raise ValueError(_("Choose areas from the list."))
    return [str(a) for a in dict.fromkeys(value)]


def _area(value):
    return _areas([value], 1)[0]


CONVERTERS = {"text": _text, "email": _email, "phone": normalize_phone, "choice": _choice,
    "integer": _integer, "money": _money, "boolean": _boolean, "url": _url, "areas": _areas, "area": _area}


def clean(payload, spec):
    errors, cleaned = {}, {}
    for key in payload:
        if key not in spec:
            errors[key] = _("Unknown field.")
    for key, (kind, required, options) in spec.items():
        value = payload.get(key)
        if value is None or value == "" or value == []:
            if required:
                errors[key] = _("This field is required.")
            continue
        try:
            cleaned[key] = CONVERTERS[kind](value, **options)
        except ValueError as error:
            errors[key] = str(error)
    if errors:
        raise SchemaError(errors)
    return cleaned
