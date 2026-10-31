from frappe.utils import now_datetime

from aqar360.core.append_only import AppendOnlyDocument


class AqarPriceChange(AppendOnlyDocument):
    def validate(self):
        super().validate()
        self.changed_at = self.changed_at or now_datetime()
