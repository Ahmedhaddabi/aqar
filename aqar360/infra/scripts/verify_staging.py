"""Capture non-sensitive post-foundation staging evidence."""
import json
import os
import frappe
os.chdir('/home/frappe/frappe-bench/sites')
frappe.init(site='staging.localhost')
frappe.connect()
try:
    settings = frappe.get_single('System Settings')
    platform = frappe.get_single('Aqar Platform Settings')
    result = {
        'site': frappe.local.site,
        'installed_apps': frappe.get_installed_apps(),
        'security': {field: settings.get(field) for field in (
            'enable_two_factor_auth', 'two_factor_method', 'session_expiry',
            'allow_guests_to_upload_files', 'allow_error_traceback', 'encrypt_backup')},
        'mfa_roles': frappe.get_all('Role', filters={'two_factor_auth': 1}, pluck='name'),
        'policy': {field: platform.get(field) for field in (
            'environment', 'legal_approval_status', 'real_personal_data_allowed',
            'selected_campaigns_only', 'phase_2_enabled', 'phase_3_enabled', 'public_ai_enabled')},
        'legacy_portal_overrides': frappe.get_hooks('override_whitelisted_methods', app_name='aqar360'),
        'direct_provider_key_present': bool(frappe.conf.get('real_estate_claude_api_key')),
        'local_monitor_enabled': bool(frappe.conf.get('monitor')),
    }
    print(json.dumps(result, indent=2))
finally:
    frappe.destroy()
