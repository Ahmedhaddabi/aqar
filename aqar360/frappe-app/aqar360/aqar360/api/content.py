"""Public read-only content for the website (§3, §13–§15). Published records only; no internal fields."""
import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cstr, flt, getdate, today
from frappe.utils.html_utils import sanitize_html

from aqar360.api.public import public_endpoint
from aqar360.core.terms import get_current_terms

GUIDE_TYPES = ("Buying Guide", "Renting Guide", "Owner Guide", "Investor Guide", "Project Guide", "Marketing Guide",
    "Market Insight", "FAQ")
POLICIES = {  # website slug → Aqar Terms Version policy type (§12.2)
    "terms": "Website Terms of Use", "privacy": "Privacy Policy", "marketing-consent": "Marketing Consent",
    "service-terms": "Service Terms", "paid-media-terms": "Paid Media Terms",
    "payment-refunds": "Payment Refund Cancellation", "content-terms": "Content IP Terms",
    "supplier-terms": "Supplier Terms", "careers-privacy": "Careers Privacy Notice",
    "consulting-terms": "Consulting Terms",
}


def _lang(language):
    return "en" if language == "en" else "ar"


def _facts(text):
    rows = []
    for line in cstr(text).splitlines():
        if ":" in line:
            label, value = line.split(":", 1)
            if label.strip() and value.strip():
                rows.append({"label": label.strip(), "value": value.strip()})
    return rows


def _area_names(lang):
    field = "area_name_ar" if lang == "ar" else "area_name_en"
    return {a.name: a for a in frappe.get_all("Aqar Area", fields=["name", "slug", field + " as label", "wilayat"])}


def _card(page, lang, areas):
    area = areas.get(page.area)
    return {"slug": page.slug, "page_type": page.page_type, "title": page.get("title_" + lang),
        "summary": page.get("summary_" + lang), "area": area.label if area else None,
        "last_reviewed": cstr(page.last_reviewed) or None}


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=600, seconds=60 * 60)
@public_endpoint
def list_pages(language="ar", page_type=None):
    lang = _lang(language)
    filters = {"published": 1, "page_type": page_type if page_type else ["in", GUIDE_TYPES]}
    pages = frappe.get_all("Aqar Content Page", filters=filters, order_by="last_reviewed desc, modified desc",
        fields=["slug", "page_type", "area", "last_reviewed", "title_" + lang, "summary_" + lang])
    areas = _area_names(lang)
    return [_card(p, lang, areas) for p in pages]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=600, seconds=60 * 60)
@public_endpoint
def get_page(slug=None, language="ar"):
    lang = _lang(language)
    name = frappe.db.get_value("Aqar Content Page", {"slug": cstr(slug), "published": 1})
    if not name:
        raise frappe.DoesNotExistError(_("Page not found."))
    page = frappe.get_doc("Aqar Content Page", name)
    area = _area_names(lang).get(page.area)
    return {
        "slug": page.slug, "page_type": page.page_type, "title": page.get("title_" + lang),
        "summary": page.get("summary_" + lang), "facts": _facts(page.get("facts_" + lang)),
        "body": sanitize_html(page.get("body_" + lang) or ""),
        "faqs": [{"question": f.get("question_" + lang), "answer": f.get("answer_" + lang)} for f in page.faqs],
        "sources": page.sources if page.page_type == "Market Insight" else None,
        "area": {"name": area.label, "slug": area.slug} if area else None,
        "seo_title": page.get("seo_title_" + lang) or page.get("title_" + lang),
        "meta_description": page.get("meta_description_" + lang) or page.get("summary_" + lang),
        "last_reviewed": cstr(page.last_reviewed) or None, "modified": cstr(page.modified),
    }


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=600, seconds=60 * 60)
@public_endpoint
def list_areas(language="ar"):
    """Active areas; guide_slug is set only when a published guide exists (no thin auto-generated pages, §13.1)."""
    lang = _lang(language)
    guides = {p.area: p.slug for p in frappe.get_all("Aqar Content Page", fields=["area", "slug"],
        filters={"published": 1, "page_type": "Area Guide"})}
    wilayat_field = "wilayat_name_ar" if lang == "ar" else "wilayat_name_en"
    wilayats = {w.name: w.label for w in frappe.get_all("Aqar Wilayat", fields=["name", wilayat_field + " as label"])}
    return [{"id": a.name, "name": a.label, "slug": a.slug, "wilayat": wilayats.get(a.wilayat),
        "guide_slug": guides.get(a.name)} for a in _area_names(lang).values()
        if frappe.db.get_value("Aqar Area", a.name, "is_active")]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=600, seconds=60 * 60)
@public_endpoint
def list_services(language="ar"):
    """§6 content services with their current list prices."""
    lang = _lang(language)
    items = frappe.get_all("Item", filters={"custom_aqar_public": 1, "disabled": 0}, order_by="item_code asc",
        fields=["item_code", "item_name", "description", "custom_aqar_item_name_ar", "custom_aqar_scope_ar"])
    prices = {p.item_code: p.price_list_rate for p in frappe.get_all("Item Price", fields=["item_code",
        "price_list_rate"], filters={"price_list": "Standard Selling", "item_code": ["in", [i.item_code for i in items]]})}
    return [{"code": i.item_code,
        "name": (i.custom_aqar_item_name_ar if lang == "ar" else None) or i.item_name,
        "scope": (i.custom_aqar_scope_ar if lang == "ar" else None) or frappe.utils.strip_html(i.description or ""),
        "price": flt(prices.get(i.item_code)) or None, "currency": "OMR"} for i in items]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=600, seconds=60 * 60)
@public_endpoint
def list_jobs(language="ar"):
    """Open, published vacancies only, with a closing date for JobPosting structured data (§10.1)."""
    if not frappe.db.exists("DocType", "Job Opening"):
        return []
    meta = frappe.get_meta("Job Opening")
    fields = [f for f in ("name", "job_title", "designation", "description", "closes_on", "posted_on", "location",
        "employment_type", "route") if f == "name" or meta.has_field(f)]
    filters = {"status": "Open"}
    if meta.has_field("publish"):
        filters["publish"] = 1
    jobs = frappe.get_all("Job Opening", filters=filters, fields=fields, order_by="posted_on desc")
    return [{**job, "description": sanitize_html(job.get("description") or ""),
        "closes_on": cstr(job.get("closes_on")) or None, "posted_on": cstr(job.get("posted_on")) or None}
        for job in jobs if not job.get("closes_on") or getdate(job.closes_on) >= getdate(today())]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=600, seconds=60 * 60)
@public_endpoint
def get_policy(slug=None, language="ar"):
    policy_type = POLICIES.get(cstr(slug))
    if not policy_type:
        raise frappe.DoesNotExistError(_("Page not found."))
    lang = _lang(language)
    name = get_current_terms(policy_type, lang)
    if not name:
        return {"policy_type": policy_type, "available": False}
    terms = frappe.db.get_value("Aqar Terms Version", name, ["version", "effective_from", "body"], as_dict=True)
    return {"policy_type": policy_type, "available": True, "version_id": name, "version": terms.version,
        "effective_from": cstr(terms.effective_from), "body": sanitize_html(terms.body or "")}


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=120, seconds=60 * 60)
@public_endpoint
def sitemap_entries():
    pages = frappe.get_all("Aqar Content Page", filters={"published": 1}, fields=["slug", "page_type", "modified"])
    projects = [{"slug": p.slug, "section": "projects", "modified": cstr(p.modified)} for p in _public_projects() if p.slug]
    return [{"slug": p.slug, "section": "areas" if p.page_type == "Area Guide" else "insights",
        "modified": cstr(p.modified)} for p in pages] + projects


PUBLIC = "Selected Public Page"


def _public_image(url):
    # Only files in the public folder; private files (/private/files/...) never reach the website.
    return url if url and url.startswith("/files/") else None


def _point(lat, lng):
    return [flt(lng, 6), flt(lat, 6)] if flt(lat) or flt(lng) else None


def _excerpt(html, limit=400):
    text = " ".join(frappe.utils.strip_html(cstr(html)).split())
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


PROJECT_FIELDS = ["name", "slug", "project_name", "project_name_ar", "area", "project_category", "construction_status",
    "price_from", "price_to", "handover_date", "payment_plan", "payment_plan_ar", "latitude", "longitude", "cover_image", "description",
    "description_ar", "developer_name", "foreign_ownership", "brochure", "modified"]


def _public_projects(**filters):
    from aqar360.registry.constants import OPEN_AVAILABILITY
    return frappe.get_all("Aqar Development Project", fields=PROJECT_FIELDS, order_by="modified desc", filters={
        "visibility": PUBLIC, "verification_status": "Verified", "sales_availability": ["in", OPEN_AVAILABILITY], **filters})


def _unit_state(availability, status):
    """Public state of a registry unit; withdrawn, paused or archived units are not shown at all."""
    if availability in ("Withdrawn", "Archived", "Paused") or status == "Under Renovation":
        return None
    if availability in ("Sold Out", "Closed") or status in ("Occupied", "Sold"):
        return "sold"
    return "reserved" if status == "Reserved" else "available"


def _project_units(project):
    """Individual units from the registry (Property Unit linked to the project): live availability."""
    rows = frappe.get_all("Property Unit", filters={"custom_aqar_project": project}, order_by="unit_number asc",
        fields=["unit_number", "unit_code", "floor", "custom_aqar_unit_type", "custom_aqar_bedrooms", "custom_aqar_size_sqm",
            "sale_price", "rent_amount", "custom_aqar_listing_purpose", "custom_aqar_sales_availability", "status"])
    units = []
    for u in rows:
        state = _unit_state(u.custom_aqar_sales_availability, u.status)
        if state:
            rent = u.custom_aqar_listing_purpose == "Rent"
            units.append({"number": u.unit_number or u.unit_code, "floor": u.floor, "type": u.custom_aqar_unit_type,
                "bedrooms": u.custom_aqar_bedrooms or None, "size": flt(u.custom_aqar_size_sqm) or None,
                "price": (flt(u.rent_amount) if rent else flt(u.sale_price)) or None, "purpose": "Rent" if rent else "Sale",
                "state": state})
    return units


def _unit_types(project, units):
    """Unit type rows; availability is counted from registry units when the type has any, else the typed number."""
    from aqar360.registry.constants import OPEN_AVAILABILITY
    rows = frappe.get_all("Aqar Project Unit Type", filters={"parent": project, "parenttype": "Aqar Development Project"},
        fields=["unit_type", "bedrooms", "size_from_sqm", "size_to_sqm", "price_from", "price_to", "available_units",
            "sales_availability"], order_by="idx asc")
    result = []
    for u in rows:
        if u.sales_availability and u.sales_availability not in OPEN_AVAILABILITY:
            continue
        live = [x for x in units if x["type"] == u.unit_type]
        typed = cstr(u.available_units).strip()
        available = sum(x["state"] == "available" for x in live) if live else (int(typed) if typed.isdigit() else None)
        result.append({"type": u.unit_type, "bedrooms": u.bedrooms, "size_from": flt(u.size_from_sqm) or None,
            "size_to": flt(u.size_to_sqm) or None, "price_from": flt(u.price_from) or None,
            "price_to": flt(u.price_to) or None, "available": None if available is None else str(available)})
    return result


def _project_card(p, lang, units=None):
    units = _project_units(p.name) if units is None else units
    types = _unit_types(p.name, units)
    counts = [int(t["available"]) for t in types if t["available"] is not None]
    if units and not types:
        counts = [sum(u["state"] == "available" for u in units)]
    return {"id": p.name, "slug": p.slug, "type": "project", "kind": "Project", "category": p.project_category,
        "title": (p.project_name_ar if lang == "ar" else None) or p.project_name, "developer": p.developer_name,
        "area": p.area, "purpose": "Sale", "price_from": flt(p.price_from) or None, "price_to": flt(p.price_to) or None,
        "construction_status": p.construction_status, "handover": cstr(p.handover_date) or None,
        "payment_plan": cstr((p.payment_plan_ar if lang == "ar" else None) or p.payment_plan).strip() or None,
        "summary": _excerpt((p.description_ar if lang == "ar" else None) or p.description) or None,
        "available_units": sum(counts) if counts else None, "image": _public_image(p.cover_image),
        "point": _point(p.latitude, p.longitude), "exact": True, "units": types}


def _map_projects(lang):
    return [_project_card(p, lang) for p in _public_projects()]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=600, seconds=60 * 60)
@public_endpoint
def list_projects(language="ar"):
    """Public, verified, available developer projects for the website's projects page."""
    lang = _lang(language)
    areas = _area_names(lang)
    cards = [_project_card(p, lang) for p in _public_projects()]
    for card in cards:
        area = areas.get(card["area"])
        card["area_name"] = area.label if area else None
    return cards


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=600, seconds=60 * 60)
@public_endpoint
def get_project(slug=None, language="ar"):
    """One public project page: gallery, description, unit types, live units, payment plan, location."""
    lang = _lang(language)
    rows = _public_projects(slug=cstr(slug))
    if not rows:
        raise frappe.DoesNotExistError(_("Project not found."))
    p = rows[0]
    units = _project_units(p.name)
    page = _project_card(p, lang, units)
    area = None
    if p.area:
        area = frappe.db.get_value("Aqar Area", p.area, ["slug", "area_name_ar", "area_name_en", "wilayat"], as_dict=True)
    wilayat = frappe.db.get_value("Aqar Wilayat", area.wilayat, "wilayat_name_" + lang) if area and area.wilayat else None
    guide = None
    if p.area:
        guide = frappe.db.get_value("Aqar Content Page", {"area": p.area, "published": 1, "page_type": "Area Guide"}, "slug")
    gallery = [{"image": _public_image(g.image), "caption": (g.caption_ar if lang == "ar" else None) or g.caption}
        for g in frappe.get_all("Aqar Project Image", filters={"parent": p.name, "parenttype": "Aqar Development Project"},
            fields=["image", "caption", "caption_ar"], order_by="idx asc")]
    cover = [{"image": page["image"], "caption": None}] if page["image"] else []
    page.update({
        "description": sanitize_html((p.description_ar if lang == "ar" else None) or p.description or ""),
        "gallery": cover + [g for g in gallery if g["image"] and g["image"] != page["image"]],
        "unit_list": units, "brochure": _public_image(p.brochure),
        "foreign_ownership_eligible": cstr(p.foreign_ownership).startswith("Eligible"),
        "area": {"id": p.area, "name": area.get("area_name_" + lang), "slug": area.slug, "wilayat": wilayat,
            "guide_slug": guide} if area else None,
        "modified": cstr(p.modified),
    })
    return page


def _map_properties():
    from aqar360.registry.constants import OPEN_AVAILABILITY
    rows = frappe.get_all("Property", filters={"custom_aqar_visibility": PUBLIC, "custom_aqar_verification_status": "Verified",
        "custom_aqar_sales_availability": ["in", OPEN_AVAILABILITY],
        "custom_aqar_listing_purpose": ["in", ["Sale", "Rent", "Sale or Rent"]]},
        fields=["property_code", "custom_aqar_property_kind", "custom_aqar_area", "custom_aqar_listing_purpose",
            "custom_aqar_sale_price", "custom_aqar_rent_price", "custom_aqar_bedrooms", "custom_aqar_bathrooms",
            "custom_aqar_size_sqm", "custom_aqar_furnished", "custom_aqar_construction_status", "thumbnail_image",
            "latitude", "longitude", "custom_aqar_show_exact_location"])
    # No owner names, addresses or internal titles: the website composes "type in area" itself.
    return [{"id": p.property_code, "type": "property", "kind": p.custom_aqar_property_kind or "Other", "title": None,
        "area": p.custom_aqar_area, "purpose": p.custom_aqar_listing_purpose,
        "sale_price": flt(p.custom_aqar_sale_price) or None, "rent_price": flt(p.custom_aqar_rent_price) or None,
        "bedrooms": p.custom_aqar_bedrooms or None, "bathrooms": p.custom_aqar_bathrooms or None,
        "size_sqm": flt(p.custom_aqar_size_sqm) or None, "furnished": p.custom_aqar_furnished or None,
        "construction_status": p.custom_aqar_construction_status or None, "image": _public_image(p.thumbnail_image),
        "exact": bool(p.custom_aqar_show_exact_location and _point(p.latitude, p.longitude)),
        "point": _point(p.latitude, p.longitude) if p.custom_aqar_show_exact_location else None} for p in rows]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=600, seconds=60 * 60)
@public_endpoint
def get_map_data(language="ar"):
    """Public map: areas (centre and drawn boundary) and public, verified, available projects and properties."""
    from aqar360.registry.geo import geometries
    lang = _lang(language)
    guides = {p.area: p.slug for p in frappe.get_all("Aqar Content Page", fields=["area", "slug"],
        filters={"published": 1, "page_type": "Area Guide"})}
    wilayat_field = "wilayat_name_ar" if lang == "ar" else "wilayat_name_en"
    wilayats = {w.name: w.label for w in frappe.get_all("Aqar Wilayat", fields=["name", wilayat_field + " as label"])}
    name_field = "area_name_ar" if lang == "ar" else "area_name_en"
    areas = [{"id": a.name, "name": a.label, "slug": a.slug, "wilayat": wilayats.get(a.wilayat),
        "guide_slug": guides.get(a.name), "center": _point(a.latitude, a.longitude),
        "boundary": next(iter(geometries(a.boundary, ("Polygon", "MultiPolygon"))), None)}
        for a in frappe.get_all("Aqar Area", filters={"is_active": 1}, order_by=name_field + " asc",
            fields=["name", "slug", name_field + " as label", "wilayat", "latitude", "longitude", "boundary"])]
    return {"areas": areas, "listings": _map_projects(lang) + _map_properties()}
