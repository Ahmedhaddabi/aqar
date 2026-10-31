"""Deterministic demand-to-supply matching (§4.3, §27.14, §27.15). No AI, no customer contact.

The engine suggests; staff review and approve before anything is shared (match actions in actions.py).
Supply is normalized from three sources: Property Units, Properties without units, and
Development Project unit types (only for projects that have no registered units — unit level is preferred).
"""
import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, today

from aqar360.core.audit import log_event
from aqar360.core.notify import notify_owner_or_team, notify_users
from aqar360.registry.constants import OPEN_AVAILABILITY, PRICE_FIELDS, match_state

MIN_SCORE = 50
URGENT_TIMING = ("Immediately", "Within 1 Month")
INACTIVE_REQUEST = ("Closed", "Paused")
OPEN_MATCH = ("Suggested", "Team Reviewed", "Approved")
SQFT_TO_SQM = 0.092903
# Forward-only request progress driven by matching, viewings and offers (§4.2).
REQUEST_PROGRESS = ("Active Request", "Searching", "Potential Match", "Team Reviewed", "Client Contacted",
    "Viewing", "Interested", "Offer")

UNIT_TYPE_KIND = {"Studio": "Apartment", "1 Bedroom": "Apartment", "2 Bedrooms": "Apartment",
    "3 Bedrooms": "Apartment", "4 Bedrooms": "Apartment", "5+ Bedrooms": "Apartment", "Penthouse": "Apartment",
    "Townhouse": "Villa", "Villa": "Villa", "Office": "Office", "Shop": "Shop", "Showroom": "Showroom",
    "Warehouse": "Warehouse", "Land Plot": "Land"}
UPSTREAM_UNIT_KIND = {"Studio": "Apartment", "1BHK": "Apartment", "2BHK": "Apartment", "3BHK": "Apartment",
    "4BHK+": "Apartment", "Penthouse": "Apartment", "Office": "Office", "Retail": "Shop", "Warehouse": "Warehouse"}
# Requested kind → kinds accepted as a partial fit (scored lower than an exact fit).
COMPATIBLE_KINDS = {"Commercial": {"Shop", "Office", "Showroom", "Warehouse"}, "Shop": {"Showroom", "Commercial"},
    "Showroom": {"Shop", "Commercial"}, "Office": {"Commercial"}, "Building": {"Apartment"}}

PROPERTY_FIELDS = ["name", "property_name", "total_area_sqft", "custom_aqar_project", "custom_aqar_area",
    "custom_aqar_property_kind", "custom_aqar_listing_purpose", "custom_aqar_sale_price", "custom_aqar_rent_price",
    "custom_aqar_bedrooms", "custom_aqar_size_sqm", "custom_aqar_furnished", "custom_aqar_parking",
    "custom_aqar_construction_status", "custom_aqar_sales_availability", "custom_aqar_verification_status",
    "custom_aqar_visibility"]
UNIT_FIELDS = ["name", "property", "unit_number", "unit_type", "area_sqft", "furnishing_status", "rent_amount",
    "sale_price", "status", "parking_slot", "custom_aqar_unit_type", "custom_aqar_listing_purpose",
    "custom_aqar_bedrooms", "custom_aqar_size_sqm", "custom_aqar_sales_availability",
    "custom_aqar_verification_status"]
PROJECT_FIELDS = ["name", "project_name", "area", "construction_status", "sales_availability",
    "verification_status", "visibility", "foreign_ownership"]


def _size(sqm, sqft):
    return flt(sqm) or (flt(sqft) * SQFT_TO_SQM if flt(sqft) else None)


def _unit_verification(unit_status, property_status):
    """A unit counts as verified on its own check, or through its verified property unless flagged stale."""
    if unit_status == "Verified" or (unit_status == "Unverified" and property_status == "Verified"):
        return "Verified"
    return "Needs Reverification" if "Needs Reverification" in (unit_status, property_status) else "Unverified"


def _property_item(p):
    return frappe._dict(doctype="Property", name=p.name, row=None, property=p.name, project=p.custom_aqar_project,
        unit_type=None, area=p.custom_aqar_area, kind=p.custom_aqar_property_kind,
        purpose=p.custom_aqar_listing_purpose, sale_price=flt(p.custom_aqar_sale_price),
        rent_price=flt(p.custom_aqar_rent_price), bedrooms=p.custom_aqar_bedrooms,
        size=_size(p.custom_aqar_size_sqm, p.total_area_sqft), construction=p.custom_aqar_construction_status,
        availability=p.custom_aqar_sales_availability, verification=p.custom_aqar_verification_status,
        visibility=p.custom_aqar_visibility, furnished=p.custom_aqar_furnished, parking=p.custom_aqar_parking,
        foreign_ownership=None, label=p.property_name)


def _unit_item(u, p):
    open_unit = u.custom_aqar_sales_availability in OPEN_AVAILABILITY and u.status not in ("Reserved", "Occupied")
    unit_type_bedrooms = frappe.get_cached_value("Aqar Unit Type", u.custom_aqar_unit_type, "bedrooms") \
        if u.custom_aqar_unit_type else None
    return frappe._dict(doctype="Property Unit", name=u.name, row=None, property=p.name,
        project=p.custom_aqar_project, unit_type=u.custom_aqar_unit_type, area=p.custom_aqar_area,
        kind=UNIT_TYPE_KIND.get(u.custom_aqar_unit_type) or UPSTREAM_UNIT_KIND.get(u.unit_type)
            or p.custom_aqar_property_kind,
        purpose=u.custom_aqar_listing_purpose or p.custom_aqar_listing_purpose,
        sale_price=flt(u.sale_price), rent_price=flt(u.rent_amount),
        bedrooms=u.custom_aqar_bedrooms if u.custom_aqar_bedrooms is not None else unit_type_bedrooms,
        size=_size(u.custom_aqar_size_sqm, u.area_sqft), construction=p.custom_aqar_construction_status,
        availability=p.custom_aqar_sales_availability if open_unit else (
            u.custom_aqar_sales_availability if u.custom_aqar_sales_availability not in OPEN_AVAILABILITY else "Paused"),
        verification=_unit_verification(u.custom_aqar_verification_status, p.custom_aqar_verification_status),
        visibility=p.custom_aqar_visibility,
        furnished={"Fully Furnished": "Furnished", "Unfurnished": "Unfurnished"}.get(u.furnishing_status),
        parking=bool(u.parking_slot), foreign_ownership=None,
        label=f"{p.property_name} / {u.unit_number}")


def _project_item(proj, row):
    open_row = row.sales_availability in OPEN_AVAILABILITY
    return frappe._dict(doctype="Aqar Development Project", name=proj.name, row=row.name, property=None,
        project=proj.name, unit_type=row.unit_type, area=proj.area, kind=UNIT_TYPE_KIND.get(row.unit_type),
        from_project=True, purpose="Sale", sale_price=flt(row.price_from), rent_price=0, bedrooms=row.bedrooms,
        size=flt(row.size_from_sqm) or None, construction=proj.construction_status,
        availability=proj.sales_availability if open_row else row.sales_availability,
        verification=proj.verification_status, visibility=proj.visibility, furnished=None, parking=None,
        foreign_ownership=proj.foreign_ownership, label=f"{proj.project_name} / {row.unit_type}")


def supply_items(doctype=None, name=None):
    """Normalized supply rows, optionally limited to one Property, Property Unit or Development Project."""
    items = []
    if doctype in (None, "Property", "Property Unit"):
        filters = {}
        if doctype == "Property":
            filters = {"name": name}
        elif doctype == "Property Unit":
            filters = {"name": frappe.db.get_value("Property Unit", name, "property")}
        props = {p.name: p for p in frappe.get_all("Property", filters=filters, fields=PROPERTY_FIELDS)}
        units = frappe.get_all("Property Unit", filters={"property": ["in", list(props)]}, fields=UNIT_FIELDS) \
            if props else []
        with_units = {u.property for u in units}
        items += [_unit_item(u, props[u.property]) for u in units if doctype != "Property Unit" or u.name == name]
        if doctype != "Property Unit":
            items += [_property_item(p) for p in props.values() if p.name not in with_units]
    if doctype in (None, "Aqar Development Project"):
        with_units = set(frappe.get_all("Property Unit", filters={"custom_aqar_project": ["is", "set"]},
            pluck="custom_aqar_project"))
        projects = frappe.get_all("Aqar Development Project", fields=PROJECT_FIELDS,
            filters={"name": name} if doctype else {})
        for proj in projects:
            if proj.name in with_units:
                continue
            rows = frappe.get_all("Aqar Project Unit Type", fields=["name", "unit_type", "bedrooms", "size_from_sqm",
                "price_from", "sales_availability"], filters={"parent": proj.name,
                "parenttype": "Aqar Development Project"})
            items += [_project_item(proj, row) for row in rows]
    return items


def _wilayat(area):
    return frappe.get_cached_value("Aqar Area", area, "wilayat") if area else None


def _kind_score(requested, item):
    if requested == "Project":
        # Registered units of a development project count as project supply too.
        return 20 if item.get("from_project") or item.project else None
    if item.kind == requested:
        return 20
    if requested == "Other" or item.kind in COMPATIBLE_KINDS.get(requested, ()):
        return 10
    return None


def _asked_about(req, item):
    """'exact' for the unit or unit-less property the customer chose on the website, 'listing' for the rest of
    that project or property, None otherwise."""
    if not req.get("interested_in"):
        return None
    if req.interested_unit and item.doctype == "Property Unit" and item.name == req.interested_unit:
        return "exact"
    if req.interested_doctype == "Property":
        if item.doctype == "Property" and item.name == req.interested_in:
            return "exact"
        return "listing" if item.property == req.interested_in else None
    if req.interested_doctype == "Aqar Development Project":
        return "listing" if item.project == req.interested_in else None
    return None


def evaluate(req, item):
    """Return the scored result, or None when the supply must not be suggested for this request."""
    result = _score(req, item)
    asked = _asked_about(req, item)
    if result and asked:
        result.reasons.insert(0, _("The customer asked about this listing on the website"))
    elif asked == "exact" and match_state(item.availability, item.verification) != "excluded" \
            and item.purpose != "Content Only":
        # Outside the request's criteria, but the customer chose it: staff should see it, not the engine decide.
        price = (item.rent_price if req.purpose == "Rent" else item.sale_price) or item.sale_price or item.rent_price
        result = frappe._dict(score=0, parts={}, penalty=0, match_type="Customer Interest", price=price,
            reasons=[_("The customer asked about this listing on the website")],
            warnings=[_("Outside the request's budget, area or type: confirm with the customer")])
    return result


def _score(req, item):
    if match_state(item.availability, item.verification) == "excluded" or item.purpose == "Content Only":
        return None
    if req.purpose == "Rent":
        price, purposes = item.rent_price, (None, "", "Rent", "Sale or Rent")
    else:
        price, purposes = item.sale_price, (None, "", "Sale", "Sale or Rent")
    budget = flt(req.budget_max)
    if item.purpose not in purposes or not price or not budget:
        return None
    reasons, warnings, parts, penalty = [], [], {}, 0

    areas = {row.area for row in req.areas}
    if item.area in areas:
        parts["location"] = 25
        reasons.append(_("In a requested area"))
    elif item.area and _wilayat(item.area) in {_wilayat(a) for a in areas}:
        parts["location"] = 10
        reasons.append(_("Nearby: same wilayat as a requested area"))
    else:
        return None

    kind = _kind_score(req.property_type, item)
    if kind is None:
        return None
    parts["type"] = kind
    reasons.append(_("Property type matches") if kind == 20 else _("Related property type"))

    # §27.15: anything at or below budget qualifies on price; above it only within the tolerance.
    tolerance = flt(req.budget_tolerance_pct)
    if price <= budget:
        parts["budget"], match_type = 35, "Within Budget"
        reasons.append(_("Within budget"))
    elif price <= budget * (1 + tolerance / 100):
        parts["budget"], match_type = 15, "Near Match"
        warnings.append(_("{0}% above budget (near match)").format(round((price - budget) / budget * 100, 1)))
    else:
        return None

    need = cint(req.bedrooms_min)
    if not need:
        parts["rooms"] = 10
    elif item.bedrooms is None:
        parts["rooms"] = 5
        warnings.append(_("Bedrooms not confirmed"))
    elif cint(item.bedrooms) >= need:
        parts["rooms"] = 10
        reasons.append(_("{0} bedrooms").format(cint(item.bedrooms)))
    else:
        parts["rooms"] = 4 if cint(item.bedrooms) == need - 1 else 0
        warnings.append(_("Fewer bedrooms than requested ({0} of {1})").format(cint(item.bedrooms), need))

    size_min, size_max = flt(req.size_min_sqm), flt(req.size_max_sqm)
    if not (size_min or size_max):
        parts["size"] = 5
    elif not item.size:
        parts["size"] = 2
        warnings.append(_("Size not confirmed"))
    elif (not size_min or item.size >= size_min) and (not size_max or item.size <= size_max):
        parts["size"] = 5
        reasons.append(_("Size fits ({0} m²)").format(round(item.size)))
    else:
        parts["size"] = 0
        warnings.append(_("Outside the requested size ({0} m²)").format(round(item.size)))

    if req.timing in URGENT_TIMING and item.construction in ("Pre-Launch", "Under Construction"):
        parts["readiness"] = 0
        warnings.append(_("Not ready for the requested timing"))
    else:
        parts["readiness"] = 5

    if req.furnished in ("Furnished", "Unfurnished") and item.furnished and item.furnished != req.furnished:
        penalty += 3
        warnings.append(_("Furnishing differs from the request"))
    if req.parking and not item.parking:
        penalty += 2
        warnings.append(_("Parking not confirmed"))
    if req.foreign_ownership_required:
        if item.foreign_ownership == "Not Eligible (Verified)":
            return None
        if item.foreign_ownership != "Eligible (Verified)":
            penalty += 5
            warnings.append(_("Foreign ownership eligibility not verified"))
    feedback = _viewing_feedback(req)
    if feedback.price_ceiling and price >= feedback.price_ceiling:
        penalty += 5
        warnings.append(_("At a viewing the customer found {0} OMR too expensive").format(feedback.price_ceiling))
    if item.area in feedback.rejected_areas:
        penalty += 5
        warnings.append(_("At a viewing the customer rejected this area"))
    if item.verification != "Verified":
        warnings.append(_("Supply not verified yet: verify before approval"))

    score = max(0, sum(parts.values()) - penalty)
    if score < MIN_SCORE:
        return None
    return frappe._dict(score=score, parts=parts, penalty=penalty, match_type=match_type, price=price,
        reasons=reasons, warnings=warnings)


def _viewing_feedback(req):
    """'Not suitable' viewing outcomes improve later suggestions for the same request (F.3 item 4)."""
    if getattr(req, "_aqar_feedback", None) is None:
        rows = frappe.get_all("Aqar Viewing", fields=["not_suitable_reason", "price", "area"], filters={
            "search_request": req.name, "status": "Completed", "outcome": "Not Suitable"})
        prices = [flt(r.price) for r in rows if r.not_suitable_reason == "Price" and flt(r.price)]
        req._aqar_feedback = frappe._dict(price_ceiling=min(prices) if prices else 0,
            rejected_areas={r.area for r in rows if r.not_suitable_reason == "Location" and r.area})
    return req._aqar_feedback


def _key(req_name, item):
    return f"{req_name}|{item.doctype}|{item.name}|{item.row or ''}"


def _set_status(doc, status):
    doc.flags.aqar_status_change = True
    doc.status = status


def _upsert(req, item, result):
    """Create or refresh a match; staff decisions (Sent, Rejected) are never overwritten."""
    values = {
        "match_type": result.match_type, "score": result.score, "price": result.price,
        "budget_max": req.budget_max, "supply_label": item.label, "property": item.property,
        "project": item.project, "unit_type": item.unit_type, "area": item.area,
        "supply_verified": int(item.verification == "Verified"), "supply_visibility": item.visibility,
        "reasons": "\n".join(result.reasons), "warnings": "\n".join(result.warnings), "penalty": result.penalty,
        **{f"score_{part}": value for part, value in result.parts.items()},
    }
    name = frappe.db.get_value("Aqar Match", {"match_key": _key(req.name, item)})
    if not name:
        frappe.get_doc({"doctype": "Aqar Match", "status": "Suggested", "search_request": req.name,
            "supply_doctype": item.doctype, "supply_name": item.name, "supply_row": item.row,
            "match_key": _key(req.name, item), **values}).insert(ignore_permissions=True)
        return True
    doc = frappe.get_doc("Aqar Match", name)
    if doc.status in ("Sent", "Rejected"):
        return False
    price_changed = flt(doc.price) != flt(result.price)
    doc.update(values)
    if doc.status == "Withdrawn":
        _set_status(doc, "Suggested")
    elif doc.status == "Approved" and price_changed:
        _set_status(doc, "Team Reviewed")
        doc.warnings = "\n".join(filter(None, [doc.warnings, _("Price changed after approval: approve again")]))
    doc.save(ignore_permissions=True)
    return False


def _withdraw(match_names, why):
    for name in match_names:
        doc = frappe.get_doc("Aqar Match", name)
        _set_status(doc, "Withdrawn")
        doc.warnings = "\n".join(filter(None, [doc.warnings, why]))
        doc.save(ignore_permissions=True)


def set_request_status(request_name, target):
    current = frappe.db.get_value("Aqar Search Request", request_name, "status")
    if current != target:
        frappe.db.set_value("Aqar Search Request", request_name, "status", target)
        log_event("Updated", "Aqar Search Request", request_name, before={"status": current}, after={"status": target})


def advance_request(request_name, target):
    """Move forward only; never overrides Closed/Paused or a later stage."""
    current = frappe.db.get_value("Aqar Search Request", request_name, "status")
    if current in REQUEST_PROGRESS and REQUEST_PROGRESS.index(current) < REQUEST_PROGRESS.index(target):
        set_request_status(request_name, target)


def system_reject(match_name, reason, note):
    """Reject a match from an operational outcome (e.g. a 'not suitable' viewing), not a staff click."""
    doc = frappe.get_doc("Aqar Match", match_name)
    if doc.status in ("Rejected", "Withdrawn"):
        return
    _set_status(doc, "Rejected")
    doc.rejection_reason = reason
    doc.staff_notes = "\n".join(filter(None, [doc.staff_notes, note]))
    doc.save(ignore_permissions=True)
    log_event("Match Rejected", "Aqar Match", doc.name, after={"reason": reason, "note": note})


def _active_requests():
    return frappe.get_all("Aqar Search Request", pluck="name", filters={
        "status": ["not in", INACTIVE_REQUEST], "expires_on": [">=", today()]})


def _is_active(req):
    return req.status not in INACTIVE_REQUEST and (not req.expires_on or getdate(req.expires_on) >= getdate(today()))


def match_request(request_name, notify=True):
    """Re-evaluate one request against all supply. Returns the number of new suggestions."""
    req = frappe.get_doc("Aqar Search Request", request_name)
    open_matches = frappe.get_all("Aqar Match", pluck="match_key",
        filters={"search_request": req.name, "status": ["in", OPEN_MATCH]})
    if not _is_active(req):
        _withdraw(frappe.get_all("Aqar Match", pluck="name", filters={"search_request": req.name,
            "status": ["in", OPEN_MATCH]}), _("Request is no longer active"))
        return 0
    created, seen = 0, set()
    for item in supply_items():
        result = evaluate(req, item)
        if result:
            seen.add(_key(req.name, item))
            created += _upsert(req, item, result)
    stale = [key for key in open_matches if key not in seen]
    _withdraw(frappe.get_all("Aqar Match", pluck="name", filters={"match_key": ["in", stale]}) if stale else [],
        _("No longer fits the request or the supply changed"))
    if created:
        advance_request(req.name, "Potential Match")
        if notify:
            notify_owner_or_team(req.assigned_to, "Aqar Search Request", req.name,
                _("{0} new potential matches for request {1}").format(created, req.name))
    return created


def match_supply(doctype, name, price_drop=False, notify=True):
    """Re-evaluate one supply record against every active request (new supply, price drop, reactivation)."""
    items = supply_items(doctype, name)
    created, matched_requests, seen = 0, set(), set()
    for request_name in _active_requests():
        req = frappe.get_doc("Aqar Search Request", request_name)
        for item in items:
            result = evaluate(req, item)
            if result:
                seen.add(_key(req.name, item))
                matched_requests.add(req.name)
                if _upsert(req, item, result):
                    created += 1
                    advance_request(req.name, "Potential Match")
    open_for_supply = frappe.get_all("Aqar Match", fields=["name", "match_key"], filters={
        "status": ["in", OPEN_MATCH], "supply_name": name, "supply_doctype": doctype})
    if doctype == "Property":  # its units' matches follow the property's availability as well
        open_for_supply += frappe.get_all("Aqar Match", fields=["name", "match_key"], filters={
            "status": ["in", OPEN_MATCH], "supply_doctype": "Property Unit", "property": name})
    _withdraw([m.name for m in open_for_supply if m.match_key not in seen],
        _("Supply no longer available or no longer fits"))
    if created and notify:
        subject = _("{0} matches {1} active requests").format(name, len(matched_requests))
        if price_drop:
            subject = _("Price drop: ") + subject
        owners = [frappe.db.get_value("Aqar Search Request", r, "assigned_to") for r in matched_requests]
        # Owners of the matched requests are told; unowned requests fall back to the whole team.
        notify_users([o for o in owners if o] or (), doctype, name, subject)
        if not all(owners):
            notify_owner_or_team(None, doctype, name, subject)
    return created


def _enqueue(method, **kwargs):
    frappe.enqueue(method, queue="short", enqueue_after_commit=True, now=bool(frappe.flags.in_test),
        job_id=f"aqar-match-{'-'.join(str(v) for v in kwargs.values())}", deduplicate=not frappe.flags.in_test,
        **kwargs)


def on_request_update(doc, method=None):
    _enqueue("aqar360.matching.engine.match_request", request_name=doc.name)


def on_supply_update(doc, method=None):
    before = doc.get_doc_before_save()
    price_drop = bool(before) and any(0 < flt(doc.get(f)) < flt(before.get(f)) for f in PRICE_FIELDS[doc.doctype])
    _enqueue("aqar360.matching.engine.match_supply", doctype=doc.doctype, name=doc.name, price_drop=price_drop)
    if doc.doctype == "Property Unit" and doc.get("custom_aqar_project"):
        # Registered units replace the project's unit-type level suggestions (unit level preferred).
        _enqueue("aqar360.matching.engine.match_supply", doctype="Aqar Development Project",
            name=doc.custom_aqar_project, price_drop=False)


@frappe.whitelist()
def rematch_request(request_name):
    frappe.has_permission("Aqar Search Request", "write", request_name, throw=True)
    created = match_request(request_name, notify=False)
    return {"created": created, "open": frappe.db.count("Aqar Match",
        {"search_request": request_name, "status": ["in", OPEN_MATCH]})}


def current_supply_state(match):
    """Live availability/verification of the matched supply, for approval-time checks."""
    items = [i for i in supply_items(match.supply_doctype, match.supply_name) if (i.row or "") == (match.supply_row or "")]
    if not items:
        return frappe._dict(state="excluded", verified=False, visibility=None)
    item = items[0]
    return frappe._dict(state=match_state(item.availability, item.verification),
        verified=item.verification == "Verified", visibility=item.visibility)
