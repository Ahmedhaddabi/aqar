app_name = "aqar360"
app_title = "Aqar 360"
app_publisher = "Aqar 360"
app_description = "Private opportunity and company operating platform"
app_email = "engineering@aqar360.invalid"
app_license = "MIT"
required_apps = ["erpnext", "hrms", "crm", "real_estate"]
before_install = "aqar360.install.configure_foundation"
after_install = "aqar360.install.configure_foundation"
after_migrate = "aqar360.install.configure_foundation"
fixtures = [
    {"dt": "Role", "filters": [["name", "like", "Aqar %"]]},
    {"dt": "Custom Field", "filters": [["fieldname", "like", "custom_aqar_%"]]},
    {"dt": "Property Setter", "filters": [["name", "in", ["Contact-main-track_changes", "CRM Lead-main-track_changes", "CRM Deal-main-track_changes", "Property-main-track_changes", "Property Unit-main-track_changes", "Property-owner_link-options", "Property-amenities-fieldtype"]]]},
]

override_whitelisted_methods = {
    "real_estate.www.tenant-portal.index.submit_maintenance_request": "aqar360.security.legacy_portal_disabled",
    "real_estate.www.tenant-portal.index.get_invoice_pdf": "aqar360.security.legacy_portal_disabled",
}

# Append-only audit trail for permissions, terms, flags and finance (§18.1 Audit Logs).
_audited = {"on_update": "aqar360.core.audit.audit_change", "on_trash": "aqar360.core.audit.audit_trash"}
_submitted = {"on_submit": "aqar360.core.audit.audit_submission", "on_cancel": "aqar360.core.audit.audit_submission"}
_decisions = {"on_update": "aqar360.core.audit.audit_decisions", "on_trash": "aqar360.core.audit.audit_trash"}
_approval = "aqar360.operations.approvals.enforce_approval_rules"
_supply_updated = ["aqar360.registry.lifecycle.log_price_changes", "aqar360.core.audit.audit_decisions",
    "aqar360.matching.engine.on_supply_update"]
_supply = {
    "validate": ["aqar360.registry.lifecycle.apply_verification", _approval],
    "on_update": _supply_updated,
    "on_trash": "aqar360.core.audit.audit_trash",
}
# Property also keeps its map pin and latitude/longitude in sync (registry.geo).
_property = {**_supply, "validate": ["aqar360.registry.geo.property_location", *_supply["validate"]]}
# Requests: owner assignment, SLA timers and decision audit.
_owned = ["aqar360.core.audit.audit_decisions", "aqar360.operations.assignment.on_reassign",
    "aqar360.operations.sla.sync_timers"]
_request = {"after_insert": "aqar360.operations.assignment.auto_assign", "on_update": _owned,
    "on_trash": "aqar360.core.audit.audit_trash"}
doc_events = {
    "Property": _property,
    "Property Unit": _supply,
    "Aqar Development Project": {"validate": _approval, "on_update": _supply_updated,
        "on_trash": "aqar360.core.audit.audit_trash"},
    "Aqar Search Request": {**_request, "on_update": [*_owned, "aqar360.matching.engine.on_request_update"]},
    "Aqar Opportunity Intake": _request,
    "Aqar Consultation Request": _request,
    "Aqar Terms Version": _audited,
    "Aqar Feature Flag": _audited,
    "Aqar Platform Settings": _audited,
    "Aqar Content Order": {**_request, "on_update": [*_owned, "aqar360.messaging.lifecycle.content_ready"]},
    "User": {"on_update": "aqar360.core.audit.audit_user_roles"},
    "Quotation": {"validate": _approval},
    "Sales Invoice": {
        "validate": _approval,
        "on_update": "aqar360.commerce.orders.on_invoice_change",
        "on_submit": ["aqar360.core.audit.audit_submission", "aqar360.commerce.orders.on_invoice_change"],
        "on_cancel": ["aqar360.core.audit.audit_submission", "aqar360.commerce.orders.on_invoice_change"],
    },
    "Payment Entry": {
        "on_submit": ["aqar360.core.audit.audit_submission", "aqar360.commerce.orders.on_payment_change"],
        "on_cancel": ["aqar360.core.audit.audit_submission", "aqar360.commerce.orders.on_payment_change"],
    },
    "Journal Entry": _submitted,
    "Aqar Document": {"on_trash": "aqar360.core.audit.audit_trash"},
}

scheduler_events = {
    "cron": {
        "*/5 * * * *": ["aqar360.operations.sla.refresh_timers", "aqar360.messaging.outbox.process_outbox"],
        # Staff digest before the working day starts (Muscat time).
        "30 7 * * *": ["aqar360.messaging.lifecycle.send_staff_digest"],
    },
    "hourly": ["aqar360.messaging.lifecycle.send_viewing_reminders"],
    "daily": ["aqar360.messaging.lifecycle.send_still_searching", "aqar360.messaging.lifecycle.send_expiry_notices",
        "aqar360.messaging.lifecycle.send_payment_reminders",
        "aqar360.core.provenance.mark_stale_observations", "aqar360.registry.lifecycle.mark_stale_registry",
        "aqar360.aqar_360.doctype.aqar_offer.aqar_offer.expire_offers"],
}

override_doctype_dashboards = {
    "Property": "aqar360.registry.lifecycle.property_dashboard",
    "Contact": "aqar360.crm.customer360.contact_dashboard",
}

doctype_js = {
    "Property": "public/js/request_approval.js",
    "Property Unit": "public/js/request_approval.js",
    "Aqar Development Project": "public/js/request_approval.js",
    "Contact": "public/js/contact_360.js",
}

# Document vault: Highly Restricted documents are hidden from roles outside management/finance (§18.2).
permission_query_conditions = {"Aqar Document": "aqar360.vault.access.document_query_conditions"}
has_permission = {"Aqar Document": "aqar360.vault.access.document_has_permission"}




