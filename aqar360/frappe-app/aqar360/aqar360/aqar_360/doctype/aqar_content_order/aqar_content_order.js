frappe.ui.form.on("Aqar Content Order", {
	refresh(frm) {
		if (frm.is_new()) return;
		const call = (method, args, done) =>
			frappe
				.call({ method: `aqar360.commerce.orders.${method}`, args: { order_name: frm.doc.name, ...args }, freeze: true })
				.then(({ message }) => (done ? done(message) : frm.reload_doc()));
		if (!frm.doc.quotation || frm.doc.status === "Draft") {
			frm.add_custom_button(__("Create Quotation"), () =>
				call("make_quotation", {}, (q) => frappe.set_route("Form", "Quotation", q)), __("Billing"));
		}
		if (frm.doc.quotation && !frm.doc.sales_invoice) {
			frm.add_custom_button(__("Create Invoice"), () =>
				call("make_invoice", {}, (inv) => frappe.set_route("Form", "Sales Invoice", inv)), __("Billing"));
		}
		if (["Unpaid", "Partly Paid"].includes(frm.doc.payment_status)) {
			frm.add_custom_button(__("Record Payment"), () =>
				frappe.prompt(
					[
						{ fieldname: "amount", fieldtype: "Currency", label: __("Amount"), default: frm.doc.outstanding_amount, reqd: 1 },
						{ fieldname: "mode_of_payment", fieldtype: "Link", options: "Mode of Payment", label: __("Mode of Payment"), default: "Cash", reqd: 1 },
						{ fieldname: "reference_no", fieldtype: "Data", label: __("Reference No") },
					],
					(values) => call("record_payment", values),
					__("Record Payment")
				), __("Billing"));
		}
	},
});
