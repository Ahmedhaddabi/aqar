"""Public intake API (§4.1, §5.1, §11.2; api.md).

Guest endpoints accept allowlisted fields only, are rate limited per IP, idempotent per client key,
protected by Turnstile outside Local/Staging, and gated by the `public_request_forms` flag.
Self-service uses the hashed single-purpose link from M1; no endpoint accepts a raw record ID.
"""
import functools
import uuid

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import add_days, getdate, today

from aqar360.core import consent, flags, links
from aqar360.core.audit import log_event
from aqar360.core.terms import get_current_terms, record_acceptance
from aqar360.intake import captcha, notify
from aqar360.intake.identity import resolve_contact
from aqar360.intake.schema import SchemaError, clean, field

SELF_SERVICE = "Request Self-Update"
LINK_HOURS = 24 * 90
PUBLIC_SOURCES = ("Website", "Instagram", "Google", "Meta", "TikTok", "Snapchat", "Referral", "WhatsApp", "Other")
SOURCE_FIELDS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "landing_page", "referrer")
CONTACT_KEYS = ("full_name", "phone", "email", "language", "privacy_terms_version", "marketing_consent",
    "marketing_terms_version", "source_channel", *SOURCE_FIELDS, "idempotency_key", "captcha_token")
UNAVAILABLE = "Online requests are not available yet. Please contact us directly."


def _options(doctype, fieldname):
    return tuple(o for o in (frappe.get_meta(doctype).get_field(fieldname).options or "").split("\n") if o)


def _contact_spec():
    return {
        "full_name": field("text", True, max_length=140), "phone": field("phone", True),
        "email": field("email"), "language": field("choice", options=("ar", "en")),
        "privacy_terms_version": field("text", max_length=140), "marketing_consent": field("boolean"),
        "marketing_terms_version": field("text", max_length=140),
        "source_channel": field("choice", options=PUBLIC_SOURCES),
        **{key: field("text", max_length=500) for key in SOURCE_FIELDS},
        "idempotency_key": field("text", True, max_length=64), "captcha_token": field("text", max_length=2048),
    }


def _search_requirements_spec():
    dt = "Aqar Search Request"
    return {
        "areas": field("areas"), "budget_min": field("money"), "budget_max": field("money"),
        "strict_budget": field("boolean"), "bedrooms_min": field("integer", maximum=20),
        "timing": field("choice", options=_options(dt, "timing")), "notes": field("text", max_length=1000),
    }


def _search_spec():
    dt = "Aqar Search Request"
    spec = {**_contact_spec(), **_search_requirements_spec(),
        "purpose": field("choice", True, options=_options(dt, "purpose")),
        "property_type": field("choice", True, options=_options(dt, "property_type")),
        "bathrooms_min": field("integer", maximum=20),
        "size_min_sqm": field("integer", maximum=1_000_000), "size_max_sqm": field("integer", maximum=1_000_000),
        "furnished": field("choice", options=_options(dt, "furnished")), "parking": field("boolean"),
        "elevator": field("boolean"), "usage_type": field("text", max_length=140),
        "preferred_channel": field("choice", True, options=_options(dt, "preferred_channel")),
        "match_alerts": field("boolean"),
        "request_kind": field("choice", options=_options(dt, "request_kind")),
        "company_name": field("text", max_length=140), "units_needed": field("integer", minimum=1, maximum=500),
        "investment_goal": field("choice", options=_options(dt, "investment_goal")),
        "foreign_ownership_required": field("boolean"),
        "interest_type": field("choice", options=("project", "property")), "interest_id": field("text", max_length=140),
        "interest_unit": field("text", max_length=140), "source_page": field("text", max_length=500),
    }
    for key in ("areas", "budget_max", "timing"):
        spec[key] = (spec[key][0], True, spec[key][2])
    return spec


def _intake_spec():
    dt = "Aqar Opportunity Intake"
    return {**_contact_spec(),
        "request_type": field("choice", True, options=_options(dt, "request_type")),
        "property_type": field("choice", True, options=_options(dt, "property_type")),
        "area": field("area", True), "location_details": field("text", max_length=500),
        "size_sqm": field("integer", maximum=1_000_000), "bedrooms": field("integer", maximum=50),
        "bathrooms": field("integer", maximum=50), "asking_price": field("money"),
        "property_condition": field("choice", options=_options(dt, "property_condition")),
        "readiness": field("choice", options=_options(dt, "readiness")),
        "description": field("text", max_length=2000), "accuracy_declaration": field("boolean", True),
    }


def _consultation_spec():
    dt = "Aqar Consultation Request"
    return {**_contact_spec(),
        "asset_type": field("choice", True, options=_options(dt, "asset_type")),
        "client_goal": field("choice", True, options=_options(dt, "client_goal")),
        "requested_output": field("choice", True, options=_options(dt, "requested_output")),
        "area": field("area"), "map_link": field("url"), "budget": field("money"),
        "expected_timeline": field("choice", options=_options(dt, "expected_timeline")),
        "current_situation": field("text", max_length=2000),
    }


def _error(status, code, error, request_id, fields=None):
    # Undo only this endpoint's writes; the surrounding transaction belongs to the caller.
    frappe.db.rollback(save_point="aqar_public_endpoint")
    frappe.clear_messages()
    frappe.local.response.http_status_code = status
    return {"error": {"code": code, "message": str(error), "request_id": request_id, "fields": fields}}


def public_endpoint(fn):
    """Uniform error envelope without tracebacks (api.md)."""
    @functools.wraps(fn)
    def wrapper(**kwargs):
        kwargs.pop("cmd", None)
        if kwargs.get("language") in ("ar", "en"):
            frappe.local.lang = kwargs["language"]  # errors come back in the form's language
        request_id = uuid.uuid4().hex[:12]
        frappe.db.savepoint("aqar_public_endpoint")
        try:
            return fn(**kwargs)
        except SchemaError as error:
            return _error(400, "invalid_input", error, request_id, error.fields)
        except frappe.DoesNotExistError as error:
            return _error(404, "not_found", error, request_id)
        except frappe.PermissionError as error:
            return _error(403, "not_permitted", error, request_id)
        except frappe.ValidationError as error:
            return _error(400, "invalid_request", error, request_id)
    return wrapper


def _ensure_open():
    settings = frappe.get_cached_doc("Aqar Platform Settings")
    production_blocked = settings.environment == "Production" and not settings.real_personal_data_allowed
    if production_blocked or not flags.is_enabled("public_request_forms"):
        frappe.throw(_(UNAVAILABLE), frappe.PermissionError)


def _approved_terms(name, policy_type, fieldname):
    if not name:
        return None
    row = frappe.db.get_value("Aqar Terms Version", name, ["policy_type", "status"], as_dict=True)
    if not row or row.policy_type != policy_type or row.status != "Approved":
        raise SchemaError({fieldname: _("This version is no longer current. Please reload the form.")})
    return name


def _website_interest(data):
    """The project, property or unit the customer clicked; only listings that are public on the website count."""
    from aqar360.api.content import PUBLIC, _project_units, _public_projects
    from aqar360.registry.constants import OPEN_AVAILABILITY
    listing, kind = data.get("interest_id"), data.get("interest_type")
    result = {"source_page": data.get("source_page")} if data.get("source_page") else {}
    if kind == "project" and listing and _public_projects(name=listing):
        result.update(interested_doctype="Aqar Development Project", interested_in=listing)
        number = data.get("interest_unit")
        if number and number in {u["number"] for u in _project_units(listing)}:
            result["interested_unit"] = frappe.db.get_value("Property Unit", {"custom_aqar_project": listing,
                "unit_number": number}) or frappe.db.get_value("Property Unit", {"custom_aqar_project": listing,
                "unit_code": number})
    elif kind == "property" and listing and frappe.db.exists("Property", {"name": listing,
            "custom_aqar_visibility": PUBLIC, "custom_aqar_verification_status": "Verified",
            "custom_aqar_sales_availability": ["in", OPEN_AVAILABILITY]}):
        result.update(interested_doctype="Property", interested_in=listing)
    return result


def _submit(doctype, data, values, preferred_channel=None, match_alerts=False):
    existing = frappe.db.get_value(doctype, {"idempotency_key": data["idempotency_key"]}, "name")
    if existing:
        return {"request_number": existing, "duplicate_submission": True,
            "status": frappe.get_doc(doctype, existing).customer_view()["status"]}
    captcha.verify(data.get("captcha_token"))
    privacy = _approved_terms(data.get("privacy_terms_version"), "Privacy Policy", "privacy_terms_version")
    if not privacy and frappe.db.get_single_value("Aqar Platform Settings", "environment") == "Production":
        raise SchemaError({"privacy_terms_version": _("This field is required.")})
    marketing = None
    if data.get("marketing_consent"):
        marketing = _approved_terms(data.get("marketing_terms_version"), "Marketing Consent", "marketing_terms_version")
        if not marketing:
            raise SchemaError({"marketing_terms_version": _("This field is required.")})

    contact, candidate = resolve_contact(data["full_name"], data.get("email"), data["phone"])
    doc = frappe.get_doc({
        "doctype": doctype, **values, "contact": contact, "duplicate_candidate": candidate,
        "duplicate_review": "Needs Review" if candidate else None,
        "submitted_name": data["full_name"], "submitted_phone": data["phone"],
        "submitted_email": data.get("email"), "language": data.get("language", "ar"),
        "source_channel": data.get("source_channel", "Website"), "idempotency_key": data["idempotency_key"],
        **{key: data.get(key) for key in SOURCE_FIELDS},
    }).insert(ignore_permissions=True)

    evidence = f"{doctype} {doc.name} submitted through the website"
    channels = (["Email"] if data.get("email") else []) + ["Phone"]
    if preferred_channel == "WhatsApp":
        channels.append("WhatsApp")
    for channel in channels:
        consent.record_consent(contact, "Request Updates", channel, True, "Website Form", evidence=evidence)
    if match_alerts:
        consent.record_consent(contact, "Match Alerts", preferred_channel, True, "Website Form", evidence=evidence)
    if marketing:
        for channel in (c for c in channels if c != "Phone"):
            consent.record_consent(contact, "Marketing", channel, True, "Website Form",
                terms_version=marketing, evidence=evidence)
    if privacy:
        record_acceptance(privacy, "Website", contact=contact, reference_doctype=doctype, reference_name=doc.name)

    token = links.create_link(SELF_SERVICE, doctype, doc.name, expires_in_hours=LINK_HOURS)
    notify.send_customer_message(doc, "received", token=token)
    return {"request_number": doc.name, "status": doc.customer_view()["status"], "self_service_token": token}


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=120, seconds=60 * 60)
@public_endpoint
def get_form_config(language="ar"):
    _ensure_open()
    language = "en" if language == "en" else "ar"
    areas = frappe.get_all("Aqar Area", filters={"is_active": 1},
        fields=["name", "area_name_en", "area_name_ar", "wilayat"], order_by="area_name_en asc")
    wilayats = dict(frappe.get_all("Aqar Wilayat", fields=["name", "wilayat_name_ar" if language == "ar" else "wilayat_name_en"],
        as_list=True))
    option_fields = {
        "Aqar Search Request": ("purpose", "property_type", "timing", "preferred_channel", "furnished",
            "request_kind", "investment_goal"),
        "Aqar Opportunity Intake": ("request_type", "property_type", "property_condition", "readiness"),
        "Aqar Consultation Request": ("asset_type", "client_goal", "requested_output", "expected_timeline"),
    }
    return {
        "areas": [{"id": a.name, "name": a.area_name_ar if language == "ar" else a.area_name_en,
            "wilayat": wilayats.get(a.wilayat) or a.wilayat} for a in areas],
        "options": {doctype: {f: _options(doctype, f) for f in fields} for doctype, fields in option_fields.items()},
        "terms": {"privacy_policy": get_current_terms("Privacy Policy", language),
            "marketing_consent": get_current_terms("Marketing Consent", language)},
        "captcha_required": bool(frappe.conf.get("aqar_turnstile_secret")),
    }


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60 * 60)
@public_endpoint
def submit_search_request(**payload):
    """«ابحثوا لي عن عقار» (§4.1)."""
    _ensure_open()
    data = clean(payload, _search_spec())
    if data.get("budget_min") and data["budget_min"] > data["budget_max"]:
        raise SchemaError({"budget_min": _("Budget From cannot be higher than Budget To.")})
    if data.get("request_kind") == "Corporate" and not data.get("company_name"):
        raise SchemaError({"company_name": _("This field is required.")})
    values = {key: data.get(key) for key in ("purpose", "property_type", "budget_min", "budget_max",
        "bedrooms_min", "bathrooms_min", "size_min_sqm", "size_max_sqm", "furnished", "parking", "elevator",
        "usage_type", "timing", "notes", "preferred_channel", "request_kind", "company_name", "units_needed",
        "investment_goal", "foreign_ownership_required")}
    values = {k: v for k, v in values.items() if v is not None}
    values["areas"] = [{"area": area} for area in data["areas"]]
    values.update(_website_interest(data))
    if data.get("strict_budget"):
        values["budget_tolerance_pct"] = 0
    return _submit("Aqar Search Request", data, values, data["preferred_channel"], data.get("match_alerts"))


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60 * 60)
@public_endpoint
def submit_property_intake(**payload):
    """«سوّقوا عقاري» / «سوّقوا مشروعي» (§5.1). Submission is for review, not acceptance."""
    _ensure_open()
    data = clean(payload, _intake_spec())
    if not data["accuracy_declaration"]:
        raise SchemaError({"accuracy_declaration": _("Please confirm the information is accurate.")})
    values = {key: data[key] for key in ("request_type", "property_type", "area", "location_details",
        "size_sqm", "bedrooms", "bathrooms", "asking_price", "property_condition", "readiness",
        "description", "accuracy_declaration") if key in data}
    return _submit("Aqar Opportunity Intake", data, values)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60 * 60)
@public_endpoint
def submit_consultation_request(**payload):
    """Site/project assessment request (§11.2)."""
    _ensure_open()
    data = clean(payload, _consultation_spec())
    values = {key: data[key] for key in ("asset_type", "client_goal", "requested_output", "area", "map_link",
        "budget", "expected_timeline", "current_situation") if key in data}
    return _submit("Aqar Consultation Request", data, values)


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
@rate_limit(limit=60, seconds=60 * 60)
@public_endpoint
def get_my_request(token=None):
    doctype, name = links.resolve(token, SELF_SERVICE)
    return frappe.get_doc(doctype, name).customer_view()


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=60 * 60)
@public_endpoint
def update_my_request(token=None, **changes):
    """Customer self-update (F.3 item 6): budget, areas, timing, notes, pause/resume/close."""
    doctype, name = links.resolve(token, SELF_SERVICE)
    if doctype != "Aqar Search Request":
        frappe.throw(_("Please contact our team to change this request."), frappe.PermissionError)
    data = clean(changes, {**_search_requirements_spec(),
        "state": field("choice", options=("pause", "resume", "close"))})
    doc = frappe.get_doc(doctype, name)
    if doc.status == "Closed":
        frappe.throw(_("This request is closed. Please submit a new request."))
    for key in ("budget_min", "budget_max", "bedrooms_min", "timing", "notes"):
        if key in data:
            doc.set(key, data[key])
    if "strict_budget" in data:
        doc.budget_tolerance_pct = 0 if data["strict_budget"] else 20
    if "areas" in data:
        doc.set("areas", [{"area": area} for area in data["areas"]])
    state = data.get("state")
    if state == "pause":
        doc.status = "Paused"
    elif state == "resume" and doc.status == "Paused":
        doc.status = "Active Request"
    elif state == "close":
        doc.status = "Closed"
    if state != "close":
        # Confirming or updating the request renews it (F.3 item 6).
        doc.expires_on = max(getdate(doc.expires_on or today()), getdate(add_days(today(), 90)))
    doc.save(ignore_permissions=True)
    log_event("Customer Self-Update", doctype, name, after={"fields": sorted(data)})
    return doc.customer_view()


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=60 * 60)
@public_endpoint
def stop_alerts(token=None):
    """Immediate opt-out of match alerts and marketing on every channel (F.3 item 7, F.8 test 4)."""
    doctype, name = links.resolve(token, SELF_SERVICE)
    doc = frappe.get_doc(doctype, name)
    for purpose in ("Match Alerts", "Marketing"):
        consent.record_consent(doc.contact, purpose, consent.ALL_CHANNELS, False, "Self-Update Link",
            evidence=f"Stop alerts requested through {name}")
    if doctype == "Aqar Search Request":
        doc.alerts_paused = 1
        doc.save(ignore_permissions=True)
    return {"alerts_stopped": True}
