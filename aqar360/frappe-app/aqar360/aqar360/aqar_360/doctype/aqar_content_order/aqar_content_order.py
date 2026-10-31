import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, now_datetime

TRANSITIONS = {
    "Draft": ("Quoted", "Cancelled"),
    "Quoted": ("Draft", "Confirmed", "Cancelled"),
    "Confirmed": ("Scheduled", "Waiting on Client", "Cancelled"),
    "Scheduled": ("Shot", "Waiting on Client", "Cancelled"),
    "Shot": ("In Production", "Client Review", "Waiting on Client"),
    "In Production": ("Client Review", "Waiting on Client"),
    "Client Review": ("Changes Requested", "Delivered", "Waiting on Client"),
    "Changes Requested": ("In Production", "Client Review", "Waiting on Client"),
    "Waiting on Client": ("Confirmed", "Scheduled", "In Production", "Client Review", "Cancelled"),
    "Delivered": ("Closed",),
    "Closed": (),
    "Cancelled": (),
}


class AqarContentOrder(Document):
    def validate(self):
        self.company = self.company or frappe.defaults.get_global_default("company")
        self.title = self.title or " + ".join(filter(None, [r.item_name or r.item for r in self.services]))[:140]
        self._price_services()
        self._track_deliverables()
        self.revisions_included = max([cint(r.revision_rounds) for r in self.services] or [0])
        self._apply_transition()
        self.revisions_used = len(self.revisions)

    def _price_services(self):
        for row in self.services:
            if not flt(row.rate):
                row.rate = flt(frappe.db.get_value("Item Price", {"item_code": row.item,
                    "price_list": "Standard Selling"}, "price_list_rate"))
            row.qty = flt(row.qty) or 1
            row.amount = flt(row.qty) * flt(row.rate)
        self.services_total = sum(flt(r.amount) for r in self.services)

    def _track_deliverables(self):
        for row in self.deliverables:
            if not row.version:
                row.version = sum(1 for d in self.deliverables if d.service_item == row.service_item and d.version) + 1
            row.uploaded_on = row.uploaded_on or now_datetime()
        delivered = {d.service_item for d in self.deliverables}
        for row in self.services:
            row.ready_for_review = int(row.item in delivered)

    def _paid_or_overridden(self):
        return self.payment_status == "Paid" or self.payment_override

    def _apply_transition(self):
        before = self.get_doc_before_save()
        old = before.status if before else "Draft"
        if old == self.status:
            return
        if self.status not in TRANSITIONS[old]:
            frappe.throw(_("A content order cannot move from {0} to {1}.").format(_(old), _(self.status)))
        if self.status == "Quoted" and not self.quotation:
            frappe.throw(_("Create the quotation first."))
        elif self.status == "Confirmed" and frappe.db.get_value("Quotation", self.quotation, "docstatus") != 1:
            frappe.throw(_("The quotation must be submitted (accepted by the client) before confirming."))
        elif self.status == "Scheduled":
            if not self.shoot_at:
                frappe.throw(_("Set the shoot date and time."))
            if not self._paid_or_overridden():
                frappe.throw(_("Scheduling starts after payment. A manager can allow an exception."))
        elif self.status == "Shot":
            self.shot_at = now_datetime()
        elif self.status == "Client Review":
            missing = [r.item_name or r.item for r in self.services if not r.ready_for_review]
            if missing:
                frappe.throw(_("Upload a deliverable for: {0}").format(", ".join(missing)))
        elif self.status == "Changes Requested":
            if not (self.change_request_note or "").strip():
                frappe.throw(_("Describe the client's requested changes."))
            used = len(self.revisions) + 1
            beyond = used > cint(self.revisions_included)
            if beyond and not self.allow_extra_revisions:
                frappe.throw(_("All {0} included revision rounds are used. Add an Additional Revision Round service "
                    "or ask a manager to allow an exception.").format(cint(self.revisions_included)))
            self.append("revisions", {"requested_on": now_datetime(), "request": self.change_request_note,
                "beyond_included": int(beyond)})
            self.change_request_note = None
        elif self.status == "Delivered":
            if not self.deliverables or any(d.status != "Client Approved" for d in self.deliverables):
                frappe.throw(_("Every deliverable must be approved by the client before delivery."))
            if not self._paid_or_overridden():
                frappe.throw(_("Final assets are released after full payment. A manager can allow an exception."))
            self.delivered_at = now_datetime()
