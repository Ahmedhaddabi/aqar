"""Shared supply statuses (§27.15, §27.21, §27.27 data dictionary)."""

AVAILABILITY = ("Active", "Limited", "Paused", "Sold Out", "Withdrawn", "Closed", "Archived")
OPEN_AVAILABILITY = ("Active", "Limited")
CLOSED_AVAILABILITY = ("Sold Out", "Withdrawn", "Closed", "Archived")
CONSTRUCTION = ("Pre-Launch", "Under Construction", "Ready")
VERIFICATION = ("Unverified", "Verified", "Needs Reverification")
VISIBILITY = ("Internal Only", "Off-Market Confidential", "Selected Public Page")
PROPERTY_KINDS = ("Apartment", "Villa", "Land", "Building", "Shop", "Office", "Warehouse", "Showroom",
    "Project", "Commercial", "Other")
LISTING_PURPOSES = ("Sale", "Rent", "Sale or Rent", "Content Only")

# (DocType, field prefix) for every record that carries availability + verification.
REGISTRY_DOCTYPES = (("Property", "custom_aqar_"), ("Property Unit", "custom_aqar_"),
    ("Aqar Development Project", ""))
# Price fields whose changes are kept as history and later drive price-drop re-matching.
PRICE_FIELDS = {
    "Property": ("custom_aqar_sale_price", "custom_aqar_rent_price"),
    "Property Unit": ("sale_price", "rent_amount"),
    "Aqar Development Project": ("price_from", "price_to"),
}


def options(values, blank=False):
    return ("\n" if blank else "") + "\n".join(values)


def match_state(availability, verification_status):
    """'excluded' never enters new matches; 'stale' may match but must be reverified before sending."""
    if availability not in OPEN_AVAILABILITY:
        return "excluded"
    return "stale" if verification_status == "Needs Reverification" else "ok"
