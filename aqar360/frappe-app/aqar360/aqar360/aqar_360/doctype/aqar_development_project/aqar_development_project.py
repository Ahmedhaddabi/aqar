import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from aqar360.registry.geo import sync_location
from aqar360.registry.lifecycle import apply_verification


def _normalized(name):
    return re.sub(r"[\W_]+", " ", (name or "").lower()).strip()


def unique_slug(project_name, name=None):
    """URL slug from the English name; a number is added when another project already uses it."""
    from aqar360.aqar_360.doctype.aqar_area.aqar_area import slugify
    base = slugify(project_name) or slugify(name) or "project"
    slug, n = base, 2
    while frappe.db.exists("Aqar Development Project", {"slug": slug, "name": ["!=", name or ""]}):
        slug, n = f"{base}-{n}", n + 1
    return slug


def ensure_slugs():
    """Projects created before public project pages existed."""
    for p in frappe.get_all("Aqar Development Project", filters={"slug": ["is", "not set"]}, fields=["name", "project_name"]):
        frappe.db.set_value("Aqar Development Project", p.name, "slug", unique_slug(p.project_name, p.name),
            update_modified=False)


class AqarDevelopmentProject(Document):
    def validate(self):
        self._prevent_duplicate()
        self._apply_unit_types()
        if self.map_link and not self.map_link.startswith("https://"):
            frappe.throw(_("The map link must be a full https:// link."))
        sync_location(self, "location", link_field="map_link")
        self.slug = unique_slug(self.slug or self.project_name, self.name)
        apply_verification(self)

    def _prevent_duplicate(self):
        """A returning project is reactivated, never registered twice (§27.19)."""
        others = frappe.get_all("Aqar Development Project", fields=["name", "project_name", "sales_availability"],
            filters={"developer_name": self.developer_name, "name": ["!=", self.name or ""]})
        for other in others:
            if _normalized(other.project_name) == _normalized(self.project_name):
                frappe.throw(_("{0} is already registered as {1} ({2}). Update or reactivate that record instead "
                    "of creating a duplicate.").format(self.project_name, other.name, _(other.sales_availability)))

    def _apply_unit_types(self):
        for row in self.unit_types:
            if row.available_units and not str(row.available_units).strip().isdigit():
                frappe.throw(_("Row {0}: available units must be a whole number, or blank when unknown.").format(row.idx))
            if flt(row.price_from) and flt(row.price_to) and flt(row.price_from) > flt(row.price_to):
                frappe.throw(_("Row {0}: Price From cannot be higher than Price To.").format(row.idx))
        prices = [flt(p) for row in self.unit_types for p in (row.price_from, row.price_to) if flt(p)]
        if prices:
            self.price_from, self.price_to = min(prices), max(prices)
        if flt(self.price_from) and flt(self.price_to) and flt(self.price_from) > flt(self.price_to):
            frappe.throw(_("Price From cannot be higher than Price To."))
