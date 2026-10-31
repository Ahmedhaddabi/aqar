"""Customer-facing status wording; internal states and reasons are never exposed (§2.2)."""

LABELS = {
    "under_review": ("Under review", "قيد المراجعة"),
    "need_more_info": ("We need more information", "نحتاج معلومات إضافية"),
    "adjustment_suggested": ("Adjustment suggested", "يوجد اقتراح تعديل"),
    "accepted": ("Accepted", "تم القبول"),
    "not_selected": ("Not selected at this time", "لم يتم الاختيار حاليًا"),
    "searching": ("Searching for you", "نبحث لك عن عقار"),
    "contacted": ("Our team has contacted you", "تواصل معك فريقنا"),
    "viewing": ("Viewing arranged", "تم ترتيب معاينة"),
    "feedback": ("Reviewing your feedback", "نراجع ملاحظاتك"),
    "offer": ("Offer in progress", "العرض قيد المتابعة"),
    "in_progress": ("In progress", "قيد التنفيذ"),
    "delivered": ("Delivered", "تم التسليم"),
    "closed": ("Closed", "مغلق"),
    "paused": ("Paused", "متوقف مؤقتًا"),
}


def label(key, language):
    english, arabic = LABELS[key]
    return arabic if language == "ar" else english
