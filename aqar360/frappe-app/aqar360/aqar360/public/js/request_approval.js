// "Request Approval" for governed price fields (Aqar approval engine) on Property, Property Unit and projects.
const AQAR_GOVERNED = {
	Property: ["custom_aqar_sale_price", "custom_aqar_rent_price"],
	"Property Unit": ["sale_price", "rent_amount"],
	"Aqar Development Project": ["price_from", "price_to"],
};

for (const doctype of Object.keys(AQAR_GOVERNED)) {
	frappe.ui.form.on(doctype, {
		refresh(frm) {
			if (frm.is_new()) return;
			frm.add_custom_button(__("Request Price Change Approval"), () => {
				const options = AQAR_GOVERNED[doctype].map((f) => ({ value: f, label: __(frm.fields_dict[f]?.df.label || f) }));
				frappe.prompt(
					[
						{ fieldname: "fieldname", fieldtype: "Select", label: __("Field"), options, reqd: 1 },
						{ fieldname: "proposed_value", fieldtype: "Currency", label: __("New Value"), reqd: 1 },
						{ fieldname: "note", fieldtype: "Small Text", label: __("Reason"), reqd: 1 },
					],
					(values) =>
						frappe
							.call({
								method: "aqar360.operations.approvals.request_change_approval",
								args: { doctype, name: frm.doc.name, ...values },
								freeze: true,
							})
							.then(({ message }) => frappe.set_route("Form", "Aqar Approval Request", message)),
					__("Request Approval")
				);
			}, __("Aqar"));
		},
	});
}
