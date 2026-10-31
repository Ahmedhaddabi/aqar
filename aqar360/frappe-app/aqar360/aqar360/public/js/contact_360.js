// "Customer 360" on the Contact form (§26.2).
frappe.ui.form.on("Contact", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Customer 360"), () =>
			frappe
				.call({ method: "aqar360.crm.customer360.render_customer_360", args: { contact: frm.doc.name } })
				.then(({ message }) => {
					const dialog = new frappe.ui.Dialog({ title: __("Customer 360"), size: "extra-large" });
					dialog.$body.html(message);
					dialog.show();
				})
		);
	},
});
