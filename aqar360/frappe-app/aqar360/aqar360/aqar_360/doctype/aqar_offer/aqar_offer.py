import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate, today

from aqar360.aqar_360.doctype.aqar_viewing.aqar_viewing import copy_supply_from_match
from aqar360.core.audit import log_event
from aqar360.matching.engine import advance_request

FINAL = ("Accepted", "Rejected", "Withdrawn", "Expired")
LOCKED = ("offered_amount", "final_amount", "rounds", "match", "offer_type")


class AqarOffer(Document):
    def validate(self):
        if self.is_new():
            copy_supply_from_match(self)
            self.asking_amount = self.price
        before = self.get_doc_before_save()
        if before and before.status in FINAL:
            changed = [f for f in LOCKED if f != "rounds" and before.get(f) != self.get(f)]
            if changed or len(before.rounds) != len(self.rounds) or self.status != before.status:
                frappe.throw(_("This offer is {0} and can no longer be changed.").format(_(before.status)))
        if flt(self.offered_amount) <= 0:
            frappe.throw(_("Enter the offered amount."))
        if self.valid_until and getdate(self.valid_until) < getdate(self.offer_date):
            frappe.throw(_("Valid Until cannot be before the offer date."))
        if self.rounds and self.status in ("Draft", "Submitted to Owner"):
            self.status = "Countered"
        if self.status == "Accepted":
            self.final_amount = flt(self.final_amount) or flt(self.rounds[-1].amount if self.rounds else self.offered_amount)

    def after_insert(self):
        advance_request(self.search_request, "Offer")

    def on_update(self):
        if self.has_value_changed("status") and not self.is_new():
            log_event("Offer " + self.status, "Aqar Offer", self.name,
                after={"status": self.status, "final_amount": self.final_amount})


def expire_offers():
    """Daily: open offers past their validity become Expired."""
    for name in frappe.get_all("Aqar Offer", pluck="name", filters={"status": ["in", ["Submitted to Owner", "Countered"]],
            "valid_until": ["<", today()]}):
        doc = frappe.get_doc("Aqar Offer", name)
        doc.status = "Expired"
        doc.save(ignore_permissions=True)
