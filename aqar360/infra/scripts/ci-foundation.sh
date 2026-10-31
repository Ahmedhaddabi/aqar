#!/usr/bin/env bash
set -euo pipefail
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${STAGING_ADMIN_PASSWORD:?STAGING_ADMIN_PASSWORD is required}"
site=staging.localhost
bench new-site "$site" --mariadb-user-host-login-scope='%' --db-root-password "$DB_PASSWORD" --admin-password "$STAGING_ADMIN_PASSWORD" --install-app erpnext
for app in hrms crm real_estate aqar360; do bench --site "$site" install-app "$app"; done
bench --site "$site" set-config allow_tests 1
bench --site "$site" run-tests --app aqar360 --skip-before-tests


