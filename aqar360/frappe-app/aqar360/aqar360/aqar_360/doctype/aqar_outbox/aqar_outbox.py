from frappe.model.document import Document


class AqarOutbox(Document):
    """System-managed record of every customer and staff message (aqar360.messaging.outbox)."""
