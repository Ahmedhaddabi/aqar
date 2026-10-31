from datetime import datetime, time, timedelta

import frappe
from frappe.model.workflow import apply_workflow
from frappe.tests import IntegrationTestCase as FrappeTestCase
from frappe.utils import add_days, add_to_date, get_datetime, getdate, now_datetime, today

from aqar360.core.seed import seed_reference_data
from aqar360.matching.actions import update_match
from aqar360.operations import approvals, sla
from aqar360.operations.business_time import add_business_minutes, business_minutes_between, end_of_business_day
from aqar360.tests.test_matching import area, make_request, make_supply, match_for, staff_user


def next_weekday(weekday, start=None):
    day = getdate(start or today())
    while day.weekday() != weekday:
        day += timedelta(days=1)
    return day


def at(day, hour, minute=0):
    return datetime.combine(day, time(hour, minute))


def timer_for(doc):
    name = frappe.db.get_value("Aqar SLA Timer", {"reference_doctype": doc.doctype, "reference_name": doc.name})
    return frappe.get_doc("Aqar SLA Timer", name) if name else None


def notified(user, name):
    return frappe.get_all("Notification Log", filters={"for_user": user, "document_name": name}, pluck="subject")


class TestBusinessTime(FrappeTestCase):
    """Default calendar: Sunday–Thursday, 08:00–17:00 (Oman work week)."""

    def test_add_business_minutes_skips_the_weekend(self):
        thursday = next_weekday(3)
        self.assertEqual(add_business_minutes(at(thursday, 16, 30), 60), at(thursday + timedelta(days=3), 8, 30))
        self.assertEqual(add_business_minutes(at(thursday, 6, 0), 30), at(thursday, 8, 30))

    def test_end_of_business_day_and_minutes_between(self):
        thursday = next_weekday(3)
        sunday = thursday + timedelta(days=3)
        self.assertEqual(end_of_business_day(at(thursday, 7)), at(thursday, 17))
        self.assertEqual(end_of_business_day(at(thursday, 18)), at(sunday, 17))
        self.assertEqual(end_of_business_day(at(thursday + timedelta(days=1), 10)), at(sunday, 17))
        self.assertEqual(business_minutes_between(at(thursday, 16), at(sunday, 9)), 120)

    def test_holiday_list_is_respected(self):
        thursday = next_weekday(3)
        sunday = thursday + timedelta(days=3)
        holiday_list = frappe.get_doc({"doctype": "Holiday List", "holiday_list_name": "Aqar Test " + str(sunday),
            "from_date": add_days(thursday, -7), "to_date": add_days(sunday, 7),
            "holidays": [{"holiday_date": sunday, "description": "Test holiday"}]}).insert()
        settings = frappe.get_doc("Aqar Platform Settings")
        settings.holiday_list = holiday_list.name
        settings.save()
        try:
            self.assertEqual(add_business_minutes(at(thursday, 16, 30), 60), at(sunday + timedelta(days=1), 8, 30))
        finally:
            settings.reload()
            settings.holiday_list = None
            settings.save()


class TestSLATimers(FrappeTestCase):
    def setUp(self):
        seed_reference_data()
        staff_user("Aqar Opportunity Staff")  # gives new requests an owner to warn

    def test_first_response_timer(self):
        req = make_request()
        timer = timer_for(req)
        self.assertEqual(timer.state, "Running")
        policy = frappe.get_doc("Aqar SLA Policy", "search_first_response")
        self.assertEqual(get_datetime(timer.due_at), sla.compute_targets(policy, get_datetime(timer.started_at))[0])
        self.assertEqual(timer.owner_user, req.assigned_to)
        req.reload()
        req.first_response_at = now_datetime()
        req.save()
        timer.reload()
        self.assertEqual((timer.state, timer.outcome), ("Completed", "On Time"))

    def test_intake_review_pauses_while_waiting_on_client(self):
        intake = frappe.get_doc({"doctype": "Aqar Opportunity Intake", "request_type": "Sell", "property_type": "Villa",
            "area": area(), "submitted_name": "SLA Owner", "accuracy_declaration": 1}).insert()
        intake = apply_workflow(apply_workflow(intake, "Start Review"), "Request Info")
        timer = timer_for(intake)
        self.assertEqual(timer.state, "Paused")
        due_before = get_datetime(timer.due_at)
        frappe.db.set_value("Aqar SLA Timer", timer.name, "paused_at", add_days(now_datetime(), -7))
        intake = apply_workflow(intake, "Resume Review")
        timer.reload()
        self.assertEqual(timer.state, "Running")
        self.assertGreaterEqual(timer.total_paused_minutes, 5 * 540 - 1)  # at least five working days paused
        self.assertGreater(get_datetime(timer.due_at), due_before)
        apply_workflow(intake, "Accept")
        timer.reload()
        self.assertEqual(timer.state, "Completed")

    def test_escalation_chain(self):
        lead, manager = staff_user("Aqar Team Lead"), staff_user("Aqar Manager")
        amber_req, late_req = make_request(), make_request()
        past, future = add_to_date(now_datetime(), hours=-1), add_to_date(now_datetime(), days=5)
        frappe.db.set_value("Aqar SLA Timer", timer_for(amber_req).name, {"amber_at": past, "due_at": future,
            "manager_escalation_at": future})
        frappe.db.set_value("Aqar SLA Timer", timer_for(late_req).name, {"amber_at": add_to_date(past, hours=-2),
            "due_at": add_to_date(past, hours=-1), "manager_escalation_at": past})
        sla.refresh_timers()
        amber, late = timer_for(amber_req), timer_for(late_req)
        self.assertEqual((amber.rag, amber.escalation_level), ("Amber", 1))
        self.assertTrue(any("at risk" in s for s in notified(amber_req.assigned_to, amber_req.name)))
        self.assertEqual((late.rag, late.escalation_level), ("Red", 3))
        self.assertTrue(any("breached" in s for s in notified(lead, late_req.name)))
        self.assertTrue(any("seriously overdue" in s for s in notified(manager, late_req.name)))
        self.assertIsNotNone(sla.sla_summary()["overdue_now"])


class TestAssignment(FrappeTestCase):
    def setUp(self):
        seed_reference_data()
        staff_user("Aqar Opportunity Staff")
        if not frappe.db.exists("User", "m5-second-staff@aqar360.invalid"):
            frappe.get_doc({"doctype": "User", "email": "m5-second-staff@aqar360.invalid", "first_name": "Second",
                "send_welcome_email": 0, "roles": [{"role": "Aqar Opportunity Staff"}]}).insert(ignore_permissions=True)

    def test_round_robin_and_reassignment(self):
        a, b = make_request(), make_request()
        self.assertTrue(a.assigned_to and b.assigned_to)
        self.assertNotEqual(a.assigned_to, b.assigned_to)
        self.assertTrue(frappe.db.exists("ToDo", {"reference_name": a.name, "allocated_to": a.assigned_to,
            "status": "Open"}))
        previous = a.assigned_to
        a.reload()
        a.assigned_to = b.assigned_to
        a.save()
        self.assertEqual(frappe.db.get_value("ToDo", {"reference_name": a.name, "allocated_to": previous}, "status"),
            "Cancelled")
        self.assertEqual(timer_for(a).owner_user, b.assigned_to)

    def test_new_match_alert_goes_to_the_owner(self):
        req = make_request(property_type="Warehouse", bedrooms_min=0)
        prop = make_supply(250, custom_aqar_property_kind="Warehouse", custom_aqar_bedrooms=None)
        self.assertTrue(match_for(req.name, prop.name))
        self.assertTrue(notified(req.assigned_to, prop.name))


class TestViewingsAndOffers(FrappeTestCase):
    def setUp(self):
        seed_reference_data()

    def _shared_match(self, req, prop):
        match = match_for(req.name, prop.name).name
        update_match(match, "approve")
        update_match(match, "mark_sent", channel="WhatsApp")
        return match

    def test_viewing_rules_and_not_suitable_feedback(self):
        req = make_request()
        first = make_supply(290)
        with self.assertRaises(frappe.ValidationError):
            frappe.get_doc({"doctype": "Aqar Viewing", "search_request": req.name,
                "match": match_for(req.name, first.name).name, "scheduled_at": now_datetime()}).insert()
        viewing = frappe.get_doc({"doctype": "Aqar Viewing", "search_request": req.name,
            "match": self._shared_match(req, first), "scheduled_at": add_days(now_datetime(), 1)}).insert()
        self.assertEqual(frappe.db.get_value("Aqar Search Request", req.name, "status"), "Viewing")
        self.assertTrue(frappe.db.exists("ToDo", {"reference_name": viewing.name}))
        viewing.status, viewing.outcome = "Completed", "Not Suitable"
        with self.assertRaises(frappe.ValidationError):
            viewing.save()  # reason required
        viewing.reload()  # a failed save leaves a new timestamp in memory, as the form would after an error
        viewing.status, viewing.outcome, viewing.not_suitable_reason = "Completed", "Not Suitable", "Price"
        viewing.save()
        self.assertEqual(match_for(req.name, first.name).status, "Rejected")
        self.assertEqual(frappe.db.get_value("Aqar Search Request", req.name, "status"), "Not Suitable")
        similar = make_supply(295)
        match = match_for(req.name, similar.name)
        self.assertEqual(match.score, 95)
        self.assertIn("too expensive", match.warnings)

    def test_offer_negotiation_lifecycle(self):
        req = make_request()
        prop = make_supply(280)
        offer = frappe.get_doc({"doctype": "Aqar Offer", "search_request": req.name, "offer_type": "Rent",
            "match": self._shared_match(req, prop), "offered_amount": 250, "valid_until": add_days(today(), 7)}).insert()
        self.assertEqual(offer.asking_amount, 280)
        self.assertEqual(frappe.db.get_value("Aqar Search Request", req.name, "status"), "Offer")
        offer.append("rounds", {"party": "Owner", "amount": 270})
        offer.save()
        self.assertEqual(offer.status, "Countered")
        offer.status = "Accepted"
        offer.save()
        self.assertEqual(offer.final_amount, 270)
        offer.offered_amount = 200
        with self.assertRaises(frappe.ValidationError):
            offer.save()
        stale = frappe.get_doc({"doctype": "Aqar Offer", "search_request": req.name, "offer_type": "Rent",
            "match": offer.match, "offered_amount": 240, "status": "Submitted to Owner",
            "offer_date": add_days(today(), -10), "valid_until": add_days(today(), -1)}).insert()
        from aqar360.aqar_360.doctype.aqar_offer.aqar_offer import expire_offers
        expire_offers()
        self.assertEqual(frappe.db.get_value("Aqar Offer", stale.name, "status"), "Expired")


class TestApprovals(FrappeTestCase):
    RULE = "Property sale price cut over 10%"

    def setUp(self):
        seed_reference_data()
        frappe.db.set_value("Aqar Approval Rule", self.RULE, "active", 1)

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.db.set_value("Aqar Approval Rule", self.RULE, "active", 0)

    def test_price_cut_needs_manager_approval(self):
        staff, manager = staff_user("Aqar Opportunity Staff"), staff_user("Aqar Manager")
        prop = make_supply(100000, purpose="Sale")
        frappe.set_user(staff)
        prop.reload()
        prop.custom_aqar_sale_price = 80000
        with self.assertRaises(approvals.ApprovalRequired):
            prop.save()
        prop.reload()
        prop.custom_aqar_sale_price = 95000  # 5% is within staff authority
        prop.save()
        request = approvals.request_change_approval("Property", prop.name, "custom_aqar_sale_price", 80000,
            "Owner instructed a lower price")
        with self.assertRaises(frappe.PermissionError):
            approvals.decide_approval(request, "Approved")
        frappe.set_user(manager)
        self.assertEqual(approvals.decide_approval(request, "Approved", "Agreed with owner"), "Approved")
        self.assertEqual(frappe.db.get_value("Property", prop.name, "custom_aqar_sale_price"), 80000)
        self.assertTrue(frappe.db.exists("Aqar Price Change", {"reference_name": prop.name, "new_value": 80000}))
        own = approvals.request_change_approval("Property", prop.name, "custom_aqar_sale_price", 60000, "test")
        with self.assertRaises(frappe.PermissionError):
            approvals.decide_approval(own, "Approved")  # no self-approval
