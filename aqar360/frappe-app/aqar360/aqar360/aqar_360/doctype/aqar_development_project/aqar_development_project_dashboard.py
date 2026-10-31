from frappe import _


def get_data():
    return {
        "fieldname": "project",
        "non_standard_fieldnames": {"Property": "custom_aqar_project", "Aqar Price Change": "reference_name",
            "Aqar Source Observation": "reference_name"},
        "transactions": [
            {"label": _("Supply"), "items": ["Property"]},
            {"label": _("Matching"), "items": ["Aqar Match"]},
            {"label": _("History"), "items": ["Aqar Price Change", "Aqar Source Observation"]},
        ],
    }
