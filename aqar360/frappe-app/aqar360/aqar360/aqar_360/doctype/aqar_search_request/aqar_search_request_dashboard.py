from frappe import _


def get_data():
    return {
        "fieldname": "search_request",
        "non_standard_fieldnames": {"Aqar SLA Timer": "reference_name"},
        "transactions": [
            {"label": _("Matching"), "items": ["Aqar Match"]},
            {"label": _("Progress"), "items": ["Aqar Viewing", "Aqar Offer"]},
            {"label": _("Service Level"), "items": ["Aqar SLA Timer"]},
        ],
    }
