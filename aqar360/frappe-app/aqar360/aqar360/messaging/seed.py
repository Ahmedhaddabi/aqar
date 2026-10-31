"""Default message templates (draft wording for the customer's legal/language review; customer_inputs.md).

Seeded once as version 1, approved so the platform can operate; the customer edits by creating new versions.
"""
import frappe

from aqar360.intake.notify import DECLINE_AR, DECLINE_EN

VARIABLES = "person, request_number, link, company, viewing_time, property, amount, due_date, order, summary"

# key: (category, consent purpose, {lang: (subject, body)})
TEMPLATES = {
    "received": ("Transactional", "Request Updates", {
        "en": ("{{ company }}: we received your request {{ request_number }}",
            "Thank you, {{ person }}. Your request {{ request_number }} has been received and our team will review it.\n"
            "View or update it, or stop alerts, here: {{ link }}"),
        "ar": ("{{ company }}: استلمنا طلبك {{ request_number }}",
            "شكرًا {{ person }}. تم استلام طلبك رقم {{ request_number }} وسيقوم فريقنا بمراجعته.\n"
            "يمكنك متابعة الطلب أو تعديله أو إيقاف التنبيهات من هنا: {{ link }}"),
    }),
    "need_more_info": ("Transactional", "Request Updates", {
        "en": ("{{ company }}: more information needed for {{ request_number }}",
            "Thank you for your request {{ request_number }}. Our team needs a few more details before continuing the "
            "review and will contact you shortly."),
        "ar": ("{{ company }}: نحتاج معلومات إضافية للطلب {{ request_number }}",
            "شكرًا لطلبك رقم {{ request_number }}. يحتاج فريقنا بعض التفاصيل الإضافية لاستكمال المراجعة وسيتواصل معك قريبًا."),
    }),
    "adjustment_suggested": ("Transactional", "Request Updates", {
        "en": ("{{ company }}: a suggestion about your request {{ request_number }}",
            "Our team has reviewed your request {{ request_number }} and has a suggested adjustment to discuss with you. "
            "We will contact you shortly."),
        "ar": ("{{ company }}: اقتراح بخصوص طلبك {{ request_number }}",
            "راجع فريقنا طلبك رقم {{ request_number }} ولديه اقتراح تعديل لمناقشته معك. سنتواصل معك قريبًا."),
    }),
    "accepted": ("Transactional", "Request Updates", {
        "en": ("{{ company }}: your request {{ request_number }} has been accepted",
            "Good news: your request {{ request_number }} has been accepted. Our team will contact you about the next steps."),
        "ar": ("{{ company }}: تم قبول طلبك {{ request_number }}",
            "يسعدنا إبلاغك بقبول طلبك رقم {{ request_number }}. سيتواصل معك فريقنا بخصوص الخطوات التالية."),
    }),
    "not_selected": ("Transactional", "Request Updates", {
        "en": ("{{ company }}: update on your request {{ request_number }}", DECLINE_EN),
        "ar": ("{{ company }}: تحديث بخصوص طلبك {{ request_number }}", DECLINE_AR),
    }),
    "viewing_reminder": ("Transactional", "Request Updates", {
        "en": ("{{ company }}: viewing reminder — {{ viewing_time }}",
            "Hello {{ person }}, a reminder that your viewing of {{ property }} is scheduled for {{ viewing_time }}.\n"
            "If you need to change the time, please reply to this email or contact our team."),
        "ar": ("{{ company }}: تذكير بموعد المعاينة {{ viewing_time }}",
            "مرحبًا {{ person }}، نذكّرك بموعد معاينة {{ property }} في {{ viewing_time }}.\n"
            "إذا رغبت في تغيير الموعد يرجى الرد على هذه الرسالة أو التواصل مع فريقنا."),
    }),
    "still_searching": ("Follow-up", "Request Updates", {
        "en": ("{{ company }}: are you still looking? ({{ request_number }})",
            "Hello {{ person }}, we are still working on your request {{ request_number }}. Has anything changed — budget, "
            "areas or timing? You can update your request or stop messages here: {{ link }}"),
        "ar": ("{{ company }}: هل ما زلت تبحث؟ ({{ request_number }})",
            "مرحبًا {{ person }}، ما زلنا نعمل على طلبك رقم {{ request_number }}. هل تغير شيء في الميزانية أو المناطق أو "
            "التوقيت؟ يمكنك تحديث طلبك أو إيقاف الرسائل من هنا: {{ link }}"),
    }),
    "request_expiring": ("Follow-up", "Request Updates", {
        "en": ("{{ company }}: your request {{ request_number }} expires on {{ due_date }}",
            "Hello {{ person }}, your request {{ request_number }} expires on {{ due_date }}. To keep it active, open your "
            "request and confirm or update it: {{ link }}"),
        "ar": ("{{ company }}: طلبك {{ request_number }} ينتهي في {{ due_date }}",
            "مرحبًا {{ person }}، ينتهي طلبك رقم {{ request_number }} في {{ due_date }}. لإبقائه نشطًا افتح طلبك وأكده أو "
            "حدّثه: {{ link }}"),
    }),
    "content_ready": ("Transactional", "Request Updates", {
        "en": ("{{ company }}: your content is ready for review ({{ order }})",
            "Hello {{ person }}, the content for your order {{ order }} is ready for your review. Our team will share the "
            "files with you; reply to this email with any changes you would like."),
        "ar": ("{{ company }}: المحتوى جاهز لمراجعتك ({{ order }})",
            "مرحبًا {{ person }}، المحتوى الخاص بطلبك {{ order }} جاهز لمراجعتك. سيشارك فريقنا الملفات معك، ويمكنك الرد على "
            "هذه الرسالة بأي تعديلات تريدها."),
    }),
    "payment_reminder": ("Follow-up", "Request Updates", {
        "en": ("{{ company }}: payment reminder for invoice {{ request_number }}",
            "Hello {{ person }}, invoice {{ request_number }} for {{ amount }} OMR was due on {{ due_date }}. If you have "
            "already paid, thank you and please ignore this message."),
        "ar": ("{{ company }}: تذكير بسداد الفاتورة {{ request_number }}",
            "مرحبًا {{ person }}، كان موعد سداد الفاتورة {{ request_number }} بمبلغ {{ amount }} ر.ع في {{ due_date }}. "
            "إذا كنت قد سددتها فشكرًا لك ويرجى تجاهل هذه الرسالة."),
    }),
    "staff_daily_digest": ("Staff", "Staff (no consent)", {
        "en": ("{{ company }}: your day — {{ summary }}",
            "Good morning {{ person }}. Open items for you today: {{ summary }}.\nOpen the Daily Workbench to start."),
        "ar": ("{{ company }}: يومك — {{ summary }}",
            "صباح الخير {{ person }}. الأعمال المفتوحة لك اليوم: {{ summary }}.\nافتح منصة العمل اليومية للبدء."),
    }),
}


def seed_message_templates():
    if not frappe.db.table_exists("Aqar Message Template"):
        return
    for key, (category, purpose, languages) in TEMPLATES.items():
        for language, (subject, body) in languages.items():
            if frappe.db.exists("Aqar Message Template", {"template_key": key, "language": language, "channel": "Email"}):
                continue
            frappe.get_doc({"doctype": "Aqar Message Template", "template_key": key, "language": language,
                "channel": "Email", "version": 1, "status": "Approved", "category": category,
                "consent_purpose": purpose, "title": f"{key} ({language})", "subject": subject, "body": body,
                "variables": VARIABLES}).insert(ignore_permissions=True)
