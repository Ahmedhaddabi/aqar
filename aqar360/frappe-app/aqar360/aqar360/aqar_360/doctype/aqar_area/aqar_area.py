import re

from frappe.model.document import Document


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")


class AqarArea(Document):
    def validate(self):
        from aqar360.registry.geo import sync_location
        self.slug = self.slug or slugify(self.area_name_en)
        # The boundary is a polygon; it sets the centre but is never replaced by a point.
        sync_location(self, "boundary", write_point=False)
