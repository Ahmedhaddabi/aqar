#!/usr/bin/env bash
set -euo pipefail
site="${1:?Usage: backup-offserver.sh SITE}"
[[ "$site" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo "Invalid site" >&2; exit 2; }
: "${RESTIC_REPOSITORY:?Configure a separate-account backup repository}"
: "${RESTIC_PASSWORD_FILE:?Provide an external password file}"
case "$RESTIC_REPOSITORY" in
  s3:https://*|b2:*|sftp:*|rest:https://*) ;;
  *) echo "An off-server encrypted destination is required" >&2; exit 2 ;;
esac
cd /home/frappe/frappe-bench
bench --site "$site" execute aqar360.backup.prepare
bench --site "$site" backup --with-files --compress
bench --site "$site" execute aqar360.backup.verify_latest
# This encrypts the entire backup set, including the sensitive config JSON.
restic backup "sites/$site/private/backups" --tag "aqar360-$site"
restic check
# Retention/pruning is deliberately not automated until legal policy is approved.

