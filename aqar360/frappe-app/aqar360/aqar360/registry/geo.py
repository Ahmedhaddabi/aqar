"""Map locations: one source of truth per record, kept in sync between the map pin (Geolocation field),
latitude/longitude (used by the desk Map view and the website map) and a pasted map link."""
import json
import re

import frappe
from frappe import _
from frappe.utils import flt

LINK_PATTERNS = (
    r"@(-?\d+\.\d+),(-?\d+\.\d+)",  # .../@23.59,58.17,15z
    r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)",  # Google place data
    r"[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)",
    r"/place/(-?\d+\.\d+),(-?\d+\.\d+)",
)


def _features(value):
    try:
        data = json.loads(value) if isinstance(value, str) else value
    except ValueError:
        return []
    if not isinstance(data, dict):
        return []
    if data.get("type") == "FeatureCollection":
        return [f for f in data.get("features") or [] if isinstance(f, dict) and f.get("geometry")]
    if data.get("type") == "Feature" and data.get("geometry"):
        return [data]
    return []


def geometries(value, kinds):
    return [f["geometry"] for f in _features(value) if f["geometry"].get("type") in kinds]


def _centroid(ring):
    points = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    return (sum(p[1] for p in points) / len(points), sum(p[0] for p in points) / len(points)) if points else None


def point_of(value):
    """(lat, lng) of the first point, or the centre of the first polygon, in a Geolocation value."""
    for geometry in geometries(value, ("Point", "Polygon", "MultiPolygon")):
        coords = geometry.get("coordinates") or []
        if geometry["type"] == "Point" and len(coords) >= 2:
            return flt(coords[1], 6), flt(coords[0], 6)
        ring = coords[0] if geometry["type"] == "Polygon" else (coords[0][0] if coords and coords[0] else [])
        centre = _centroid(ring or [])
        if centre:
            return flt(centre[0], 6), flt(centre[1], 6)
    return None


def point_collection(lat, lng):
    return json.dumps({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {},
        "geometry": {"type": "Point", "coordinates": [flt(lng, 6), flt(lat, 6)]}}]})


def coords_from_link(url):
    for pattern in LINK_PATTERNS:
        found = re.search(pattern, url or "")
        if found:
            return flt(found.group(1), 6), flt(found.group(2), 6)
    return None


def has_point(doc, lat="latitude", lng="longitude"):
    return bool(flt(doc.get(lat)) or flt(doc.get(lng)))


def sync_location(doc, geo_field, lat="latitude", lng="longitude", link_field=None, write_point=True):
    """The field the user just changed wins: map pin, then coordinates, then a pasted map link."""
    def changed(field):
        return doc.is_new() or doc.has_value_changed(field)

    pinned = point_of(doc.get(geo_field)) if doc.get(geo_field) and changed(geo_field) else None
    linked = coords_from_link(doc.get(link_field)) if link_field and changed(link_field) else None
    typed = has_point(doc, lat, lng) and (changed(lat) or changed(lng))
    if pinned:
        doc.set(lat, pinned[0])
        doc.set(lng, pinned[1])
    elif linked and not typed:
        doc.set(lat, linked[0])
        doc.set(lng, linked[1])
    if has_point(doc, lat, lng):
        if not (-90 <= flt(doc.get(lat)) <= 90 and -180 <= flt(doc.get(lng)) <= 180):
            frappe.throw(_("Latitude must be between -90 and 90 and longitude between -180 and 180."))
        if write_point and not pinned and (typed or linked or not doc.get(geo_field)):
            doc.set(geo_field, point_collection(doc.get(lat), doc.get(lng)))


def property_location(doc, method=None):
    """Property validate hook: the real_estate pin field is geo_coordinates."""
    if doc.meta.has_field("latitude"):
        sync_location(doc, "geo_coordinates")
