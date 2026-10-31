frappe.ui.form.on("Aqar Search Request", {
	refresh(frm) {
		if (frm.is_new()) return;
		if (!frm.doc.first_response_at) {
			frm.add_custom_button(__("Log First Contact"), () => {
				frm.set_value("first_response_at", frappe.datetime.now_datetime());
				frm.save();
			});
		}
		frm.add_custom_button(__("Find Matches"), () =>
			frappe
				.call({
					method: "aqar360.matching.engine.rematch_request",
					args: { request_name: frm.doc.name },
					freeze: true,
				})
				.then(({ message }) => {
					frappe.show_alert({
						message: __("{0} new, {1} open matches", [message.created, message.open]),
						indicator: "green",
					});
					frm.reload_doc();
				})
		);
	},
});
