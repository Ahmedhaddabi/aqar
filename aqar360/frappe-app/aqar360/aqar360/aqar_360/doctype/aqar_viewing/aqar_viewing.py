import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

from aqar360.core.audit import log_event
from aqar360.matching.engine import advance_request, match_request, set_request_status, system_reject
from aqar360.operations.assignment import refresh_modified

MATCH_REASON = {"Price": "Price", "Location": "Location"}  # other viewing reasons map to "Not Suitable"


def copy_supply_from_match(doc):
    match = frappe.db.get_value("Aqar Match", doc.match, ["search_request", "status", "supply_label", "property",
        "project", "area", "price"], as_dict=True)
    if not match or match.search_request != doc.search_request:
        frappe.throw(_("The match must belong to the same search request."))
    if match.status not in ("Approved", "Sent"):
        frappe.throw(_("Approve and share the match with the customer first."))
    doc.update({k: match[k] for k in ("supply_label", "property", "project", "area", "price")})


class AqarViewing(Document):
    def validate(self):
        if self.is_new():
            copy_supply_from_match(self)
        self.staff = self.staff or frappe.session.user
        if self.status == "Completed" and not self.outcome:
            frappe.throw(_("Record the viewing outcome before completing it."))
        if self.outcome == "Not Suitable" and not self.not_suitable_reason:
            frappe.throw(_("Choose why the property was not suitable; it improves future matches."))

    def after_insert(self):
        advance_request(self.search_request, "Viewing")
        self._todo(_("Viewing {0}: {1}").format(self.name, self.supply_label), getdate(self.scheduled_at))

    def on_update(self):
        if not self.has_value_changed("status") or self.status != "Completed" or self.is_new():
            return
        if self.outcome in ("Interested", "Negotiating"):
            advance_request(self.search_request, "Interested")
        elif self.outcome == "Not Suitable":
            set_request_status(self.search_request, "Not Suitable")
            system_reject(self.match, MATCH_REASON.get(self.not_suitable_reason, "Not Suitable"),
                _("Not suitable at viewing {0}: {1}").format(self.name, _(self.not_suitable_reason)))
            match_request(self.search_request, notify=False)  # re-score with the new feedback
        elif self.outcome == "Wants Alternatives":
            set_request_status(self.search_request, "Searching")
            match_request(self.search_request)
        if self.follow_up_on:
            self._todo(_("Follow up after viewing {0}").format(self.name), getdate(self.follow_up_on))
        log_event("Viewing Completed", "Aqar Viewing", self.name,
            after={"outcome": self.outcome, "reason": self.not_suitable_reason})

    def _todo(self, description, date):
        frappe.get_doc({"doctype": "ToDo", "allocated_to": self.staff, "description": description, "date": date,
            "reference_type": self.doctype, "reference_name": self.name}).insert(ignore_permissions=True)
        refresh_modified(self)
