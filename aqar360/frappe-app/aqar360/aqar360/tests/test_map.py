import json

import frappe
from frappe.tests import IntegrationTestCase as FrappeTestCase

from aqar360.api import content
from aqar360.core.seed import seed_reference_data
from aqar360.registry.geo import coords_from_link, point_collection, point_of
from aqar360.tests.test_matching import make_supply
from aqar360.tests.test_registry import area, make_project

PUBLIC = {"visibility": "Selected Public Page", "verification_status": "Verified"}


def square(lat, lng, d=0.01):
    ring = [[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]
    return json.dumps({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {},
        "geometry": {"type": "Polygon", "coordinates": [ring]}}]})


def listing(data, listing_id):
    return next((item for item in data["listings"] if item["id"] == listing_id), None)


class TestLocations(FrappeTestCase):
    def setUp(self):
        seed_reference_data()

    def test_map_links_and_geojson(self):
        self.assertEqual(coords_from_link("https://www.google.com/maps/place/Muscat/@23.5880,58.3829,14z"), (23.588, 58.3829))
        self.assertEqual(coords_from_link("https://maps.google.com/?q=23.61,58.47"), (23.61, 58.47))
        self.assertIsNone(coords_from_link("https://maps.app.goo.gl/abc"))
        self.assertEqual(point_of(point_collection(23.6, 58.2)), (23.6, 58.2))
        self.assertEqual(point_of(square(23.6, 58.2)), (23.6, 58.2))

    def test_property_pin_and_coordinates_stay_in_sync(self):
        pinned = make_supply(280, geo_coordinates=point_collection(23.6011, 58.1702))
        self.assertEqual((pinned.latitude, pinned.longitude), (23.6011, 58.1702))
        typed = make_supply(280, latitude=23.59, longitude=58.25)
        self.assertEqual(point_of(typed.geo_coordinates), (23.59, 58.25))
        typed.latitude = 23.5
        typed.save()
        self.assertEqual(point_of(typed.geo_coordinates), (23.5, 58.25))
        with self.assertRaises(frappe.ValidationError):
            make_supply(280, latitude=123, longitude=58)

    def test_project_location_from_a_pasted_map_link(self):
        project = make_project(map_link="https://www.google.com/maps/place/x/@23.592,58.253,15z")
        self.assertEqual((project.latitude, project.longitude), (23.592, 58.253))
        self.assertEqual(point_of(project.location), (23.592, 58.253))

    def test_area_boundary_sets_the_centre_and_is_kept(self):
        doc = frappe.get_doc("Aqar Area", area("Al Qurum"))
        doc.boundary = square(23.62, 58.48)
        doc.save()
        self.assertEqual((doc.latitude, doc.longitude), (23.62, 58.48))
        self.assertEqual(json.loads(doc.boundary)["features"][0]["geometry"]["type"], "Polygon")


class TestPublicMap(FrappeTestCase):
    def setUp(self):
        seed_reference_data()

    def test_only_public_verified_available_projects(self):
        public = make_project(latitude=23.59, longitude=58.25, cover_image="/files/cover.jpg", **PUBLIC)
        internal = make_project(latitude=23.59, longitude=58.25, verification_status="Verified")
        sold = make_project(latitude=23.59, longitude=58.25, sales_availability="Sold Out", **PUBLIC)
        data = content.get_map_data(language="en")
        item = listing(data, public.name)
        self.assertEqual((item["type"], item["point"], item["exact"]), ("project", [58.25, 23.59], True))
        self.assertEqual(item["available_units"], 4)
        self.assertEqual(item["image"], "/files/cover.jpg")
        self.assertEqual([u["type"] for u in item["units"]], ["2 Bedrooms", "3 Bedrooms"])
        self.assertIsNone(listing(data, internal.name))
        self.assertIsNone(listing(data, sold.name))

    def test_owner_properties_are_not_pinned_without_permission(self):
        hidden = make_supply(280, latitude=23.6, longitude=58.17, custom_aqar_visibility="Selected Public Page",
            thumbnail_image="/private/files/owner.jpg")
        exact = make_supply(300, latitude=23.6, longitude=58.17, custom_aqar_visibility="Selected Public Page",
            custom_aqar_show_exact_location=1)
        internal = make_supply(300, latitude=23.6, longitude=58.17)
        data = content.get_map_data(language="ar")
        item = listing(data, hidden.property_code)
        self.assertEqual((item["point"], item["exact"], item["image"], item["title"]), (None, False, None, None))
        self.assertEqual(item["area"], area())
        self.assertEqual(item["rent_price"], 280)
        self.assertEqual(listing(data, exact.property_code)["point"], [58.17, 23.6])
        self.assertIsNone(listing(data, internal.property_code))

    def test_areas_carry_centre_boundary_and_localised_names(self):
        doc = frappe.get_doc("Aqar Area", area("Al Mawaleh"))
        doc.boundary = square(23.59, 58.25)
        doc.save()
        areas = {a["id"]: a for a in content.get_map_data(language="ar")["areas"]}
        self.assertEqual(areas[doc.name]["name"], "الموالح")
        self.assertEqual(areas[doc.name]["boundary"]["type"], "Polygon")
        self.assertTrue(areas[area("Al Khoudh")]["center"])

    def test_guests_can_read_the_map(self):
        frappe.set_user("Guest")
        try:
            self.assertIn("listings", content.get_map_data(language="en"))
        finally:
            frappe.set_user("Administrator")
