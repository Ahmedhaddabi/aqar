frappe.ui.form.on("Aqar Approval Request", {
	refresh(frm) {
		if (frm.doc.status !== "Pending" || !frappe.user.has_role(frm.doc.approver_role)) return;
		for (const decision of ["Approved", "Rejected"]) {
			frm.add_custom_button(
				__(decision === "Approved" ? "Approve" : "Reject"),
				() =>
					frappe.prompt(
						[{ fieldname: "note", fieldtype: "Small Text", label: __("Decision Note") }],
						({ note }) =>
							frappe
								.call({
									method: "aqar360.operations.approvals.decide_approval",
									args: { request: frm.doc.name, decision, note },
									freeze: true,
								})
								.then(() => frm.reload_doc()),
						__(decision === "Approved" ? "Approve" : "Reject")
					),
				__("Decide")
			);
		}
	},
});
