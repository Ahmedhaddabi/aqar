"""Encrypted local backup checks; off-server storage is handled by restic."""
import json
import subprocess
from pathlib import Path

import frappe
from frappe.utils.backups import get_or_generate_backup_encryption_key


def prepare():
    if not frappe.get_system_settings("encrypt_backup"):
        raise RuntimeError("Encrypted backups must be enabled")
    get_or_generate_backup_encryption_key()


def verify_latest():
    folder = Path(frappe.get_site_path("private", "backups"))
    dumps = sorted(folder.glob("*-database-enc.sql.gz"), key=lambda p: p.stat().st_mtime)
    if not dumps:
        raise RuntimeError("No database backup found")
    latest = dumps[-1]
    prefix = latest.name.removesuffix("-database-enc.sql.gz")
    files = [folder / (prefix + suffix) for suffix in
        ("-database-enc.sql.gz", "-files-enc.tgz", "-private-files-enc.tgz")]
    if not all(p.is_file() for p in files):
        raise RuntimeError("No encrypted backup files found")
    key = get_or_generate_backup_encryption_key()
    checked = []
    for path in files:
        result = subprocess.run(
            ["gpg", "--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0",
             "--decrypt", str(path)],
            input=(key + "\n").encode(), stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE, check=False,
        )
        if result.returncode:
            raise RuntimeError("Backup encryption verification failed: " + path.name)
        checked.append(path.name)
    print(json.dumps({"encrypted_files_verified": checked,
        "config_requires_outer_restic_encryption": True}))


