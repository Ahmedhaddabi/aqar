# Backup and restore

Target RPO <=24h, RTO 4–8h; measured restore timing and external coverage remain pending. The local backup verification proves ciphertext integrity, not a full DR exercise.

Frappe encrypt_backup is enabled on staging. Run in frappe-dev-1:
- bench --site staging.localhost execute aqar360.backup.prepare
- bench --site staging.localhost backup --with-files --compress
- bench --site staging.localhost execute aqar360.backup.verify_latest

The last command actually decrypts the newest encrypted DB/file artifacts to a discarded stream and fails on errors. Native backup may leave site-config JSON unencrypted, and its encryption failure handler is not fail-closed. Treat the entire private/backups folder as highly restricted.

Off-server activation: choose a separate approved account/location, initialise a restic repository, securely provide RESTIC_REPOSITORY / RESTIC_PASSWORD_FILE and scoped provider credentials, then run infra/scripts/backup-offserver.sh daily inside dev/operations. The script requires an off-server repository and encrypts the entire set (including config), then runs restic check. It does not prune without approved retention. A scheduler and failure notification destination must be configured after those credentials exist; neither is active now.

Keep backup_encryption_key AND encryption_key in an independent password-vault escrow. A first backup key is generated before config copy. Do not store the escrow with the backup repository password or commit it. Restrict all backup files and config to operations users.

Restore drill (quarterly, isolated disposable site only):
1. Download a restic snapshot into a private directory; restic check and verify expected DB/files/config.
2. Preserve the encryption keys without printing them; create a fresh isolated site using a disposable database.
3. Run bench --site <restore-site> restore <encrypted-db> --encryption-key <backup-key> --with-public-files <public-archive> --with-private-files <private-archive>, providing DB credentials securely.
4. Restore the original encryption_key in the isolated site config before reading protected password fields; use the same audited app versions and run migrate.
5. Verify app list, row counts, representative synthetic records, file hashes, login/MFA, permissions and failed-outbound-message isolation.
6. Record start/end, snapshot ID, hashes, RPO/RTO and reviewer; securely remove only the verified disposable drill site after approval.

Do not restore over localhost or staging.localhost to test the runbook. A full database restore drill and external 3-2-1/immutable copies are outstanding release gates.

