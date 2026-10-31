frappe.ui.form.on("Aqar Match", {
	refresh(frm) {
		const status = frm.doc.status;
		const add = (label, action, prompt) =>
			frm.add_custom_button(__(label), () => run(frm, action, prompt), __("Actions"));
		if (status === "Suggested") add("Mark Reviewed", "review");
		if (["Suggested", "Team Reviewed"].includes(status)) add("Approve", "approve");
		if (status === "Approved") {
			add("Mark Shared", "mark_sent", {
				fieldname: "channel",
				label: "Shared Via",
				options: ["Email", "WhatsApp", "Phone", "In Person"],
			});
		}
		if (["Suggested", "Team Reviewed", "Approved"].includes(status)) {
			add("Reject", "reject", {
				fieldname: "reason",
				label: "Rejection Reason",
				options: ["Not Suitable", "Customer Not Interested", "Price", "Location", "Already Offered", "Other"],
			});
		}
	},
});

function run(frm, action, prompt) {
	const call = (args) =>
		frappe
			.call({
				method: "aqar360.matching.actions.update_match",
				args: { match: frm.doc.name, action, ...args },
				freeze: true,
			})
			.then(() => frm.reload_doc());
	if (!prompt) return call({});
	frappe.prompt(
		[{ fieldname: prompt.fieldname, fieldtype: "Select", label: __(prompt.label), options: prompt.options, reqd: 1 }],
		(values) => call(values),
		__(prompt.label)
	);
}
