"""Upload checks for vault documents (§18.1 File Security, §27.18).

Always: extension allowlist, size limit, file signature must match the extension, no macro-enabled Office
documents. When `aqar_clamav_host` is set in site_config, the file is also scanned by ClamAV (clamd INSTREAM).
The resulting status says which level was applied, so "Basic Checks Passed" is never mistaken for antivirus.
"""
import io
import socket
import struct
import zipfile

import frappe
from frappe import _

MAX_BYTES = 25 * 1024 * 1024
SIGNATURES = {
    "pdf": (b"%PDF",), "png": (b"\x89PNG",), "jpg": (b"\xff\xd8\xff",), "jpeg": (b"\xff\xd8\xff",),
    "webp": (b"RIFF",), "docx": (b"PK\x03\x04",), "xlsx": (b"PK\x03\x04",), "pptx": (b"PK\x03\x04",),
}


class UploadRejected(frappe.ValidationError):
    pass


def _extension(filename):
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _clamav(content):
    host = frappe.conf.get("aqar_clamav_host")
    port = int(frappe.conf.get("aqar_clamav_port") or 3310)
    with socket.create_connection((host, port), timeout=30) as sock:
        sock.sendall(b"zINSTREAM\0")
        for start in range(0, len(content), 64 * 1024):
            chunk = content[start:start + 64 * 1024]
            sock.sendall(struct.pack(">I", len(chunk)) + chunk)
        sock.sendall(struct.pack(">I", 0))
        reply = sock.recv(4096).decode(errors="replace").strip("\0 \n")
    if not reply.endswith("OK"):
        raise UploadRejected(_("The file was rejected by the virus scanner."))


def scan(content, filename):
    """Return the scan status, or raise UploadRejected."""
    ext = _extension(filename)
    if ext not in SIGNATURES:
        raise UploadRejected(_("This file type is not allowed. Use PDF, JPG, PNG, WEBP, DOCX, XLSX or PPTX."))
    if len(content) > MAX_BYTES:
        raise UploadRejected(_("The file is larger than 25 MB."))
    if not content.startswith(SIGNATURES[ext]):
        raise UploadRejected(_("The file content does not match its extension."))
    if ext in ("docx", "xlsx", "pptx"):
        try:
            names = zipfile.ZipFile(io.BytesIO(content)).namelist()
        except zipfile.BadZipFile:
            raise UploadRejected(_("The file content does not match its extension.")) from None
        if any(name.lower().endswith("vbaproject.bin") for name in names):
            raise UploadRejected(_("Documents containing macros are not allowed."))
    if frappe.conf.get("aqar_clamav_host"):
        _clamav(content)
        return "Clean (Antivirus)"
    return "Basic Checks Passed"
