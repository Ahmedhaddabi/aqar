frappe.query_reports["Aqar Daily Workbench"] = {
	filters: [
		{ fieldname: "mine", label: __("Only my records"), fieldtype: "Check", default: 1 },
		{ fieldname: "include_intakes", label: __("Include intakes and consultations"), fieldtype: "Check", default: 1 },
	],
	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (column.fieldname === "sla" && data && data.sla) {
			const colour = { Red: "red", Amber: "orange", Green: "green" }[data.sla];
			value = `<span class="indicator-pill ${colour}">${__(data.sla)}</span>`;
		}
		return value;
	},
};
