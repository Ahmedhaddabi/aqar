frappe.ui.form.on("Aqar Document", {
	refresh(frm) {
		if (frm.is_new() || !["Basic Checks Passed", "Clean (Antivirus)"].includes(frm.doc.scan_status)) return;
		frm.add_custom_button(__("Secure Download"), () =>
			frappe
				.call({ method: "aqar360.vault.access.get_download_link", args: { document: frm.doc.name } })
				.then(({ message }) => window.open(message, "_blank", "noopener"))
		);
	},
});
