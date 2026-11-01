// Staff guide: short how-to articles for every part of the system, added to the knowledge base (Admin → Knowledge base)
// when an article with the same title is not there yet. Never changes existing articles. Usage: npm run db:seed-guide
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { kbArticles } from "../src/db/schema";

const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const db = drizzle(client);
type Role = "admin" | "manager" | "agent";

const ARTICLES: { title: string; category: string; roles: Role[]; body: string }[] = [
  { title: "دليل: البدء للمدير · Getting started (admin)", category: "procedure", roles: ["admin"], body: `1. «حسابي»: غيّر كلمة المرور وفعّل التحقق بخطوتين.
2. «الموظفون»: أضف كل موظف بحسابه، واختر التطبيقات (CRM / ERP / HR). ضع علامة «يستلم الطلبات الجديدة» واختر «المناطق التي يغطيها».
3. «الربط بالخدمات» 🔌: البريد (Resend) أولا ثم الذكاء الاصطناعي، ثم واتساب وبوابات الدفع. اضغط «حفظ واختبار» لكل خدمة.
4. «الإعدادات»: بيانات الشركة، أوقات المعاينات، الإسناد التلقائي، مساعد المحادثة في الموقع، رابط تقييم Google.
5. «طرق الدفع»: الحساب البنكي وخيارات الدفع.

Admin first steps: My account (password, two-step) → Staff (accounts, apps, rotation and areas) → Integrations (email, AI, WhatsApp, payments: Save and test) → Settings → Payment methods.` },
  { title: "دليل: يومك في النظام · Your day", category: "procedure", roles: ["admin", "manager", "agent"], body: `• «اليوم»: ما يحتاج ردك الآن.
• 🔔 الإشعارات: طلبات جديدة، حجوزات، دفعات، تقييمات.
• 📥 «الطلبات»: افتح الطلب، اتصل أو راسل عبر واتساب، سجّل ما حدث وغيّر الحالة.
• 📅 «التقويم»: معايناتك ومتابعاتك وأعمالك هذا الأسبوع. «إضافة إلى تقويم هاتفي» يضعها في تقويم Google أو Apple.
• 📱 «الميدان»: شاشة الهاتف للمعاينات (تسجيل الوصول، النتيجة، الصور، الملاحظات) وتعمل بدون إنترنت.
• 🏆 «الأداء»: صفقاتك ومعايناتك ودخلك وعمولتك مقابل الأهداف.

Daily: Today → Notifications → Requests (call, WhatsApp, log, status) → Calendar (subscribe on your phone) → Field (works offline) → Performance.` },
  { title: "دليل: العملاء والطلبات والمعاينات · Customers, requests, viewings", category: "procedure", roles: ["admin", "manager", "agent"], body: `• «عميل / طلب جديد» للمكالمات والزيارات: رقم الهاتف يمنع التكرار. زر 🪪 «قراءة البطاقة / الجواز» يملأ الاسم والرقم من صورة (راجعها قبل الحفظ).
• في الطلب: «العقارات المقترحة» — اعتمد وأرسل للعميل. القلب ❤ يعني أن العميل حفظ العقار.
• العميل يحجز المعاينة بنفسه من حسابه (الأوقات حسب الإعدادات) ويصلك إشعار. تظهر بعلامة 🌐.
• بعد المعاينة سجّل النتيجة: مهتم، غير مناسب، يريد بدائل، لم يحضر.
• الاتفاقيات ✍️: من صفحة العميل أو الطلب «اتفاقية جديدة» ← راجع النص والفراغات ← أرسل. يوقّع العميل من هاتفه.

New customer: phone first (no duplicates), ID photo button fills the form. Approve and send suggestions; customers book viewings online (🌐) and save properties (❤). Record every viewing result. Agreements: create, check blanks, send; the customer signs on their phone.` },
  { title: "دليل: واتساب والذكاء الاصطناعي · WhatsApp and AI", category: "procedure", roles: ["admin", "manager", "agent"], body: `• 💬 «واتساب»: كل المحادثات. الرد الحر مسموح خلال 24 ساعة من آخر رسالة للعميل.
• ✨ «اقترح ردا»: يكتب ردا بلغة العميل من بيانات الطلب. راجعه وعدّله ثم اضغط إرسال.
• ✨ «ملخص»: سطران عن العميل وطلبه وما الخطوة التالية.
• «تعبئة من رسالة» في الطلب الجديد: الصق رسالة العميل فتُعبأ الحقول.
• «المساعد الذكي»: اسأل عن الطلبات والعقارات والفواتير المتأخرة. لا يغيّر أي شيء.
الذكاء الاصطناعي يقترح ولا يقرر: راجع كل شيء قبل الإرسال أو الحفظ.

WhatsApp inbox (free replies within 24 h). AI: Draft reply, Summary, Fill from a message, Assistant. AI suggests; you check before sending or saving.` },
  { title: "دليل: العقارات والكروكي والتسويق · Properties, croquis, marketing", category: "procedure", roles: ["admin", "manager"], body: `• في صفحة العقار: «إظهار في الموقع» و«تم التحقق» لظهوره في الموقع والخريطة.
• 🗺 «قطعة الأرض (الكروكي)»: ارفع الكروكي (PDF أو صورة) فتُقرأ الإحداثيات. اختر النظام (WGS 84 أو PSD93). تحقق أن الحدود على القطعة الصحيحة في الخريطة؛ إذا ظهر خط متقطع فهو النظام الآخر. «إظهار حدود القطعة في الخريطة العامة» يكشف الموقع الدقيق.
• «خريطة القطع»: كل القطع؛ الأحمر عام والرمادي للموظفين فقط.
• 📣 «حزمة التسويق»: نصوص جاهزة لإنستغرام وواتساب، وبطاقة صورة بالسعر ورمز QR للتنزيل والمشاركة.

Property page: show on website + checked. Plot (croquis): upload, choose WGS 84 or PSD93, check the outline on the map (dashed = the other system), publish only if the exact location may be shown. Plots map. Marketing kit: posts and a shareable card.` },
  { title: "دليل: الفواتير والدفع والعمولة · Invoices, payments, commission", category: "procedure", roles: ["admin", "manager"], body: `• «الفواتير»: عرض سعر ← فاتورة ← إرسال الرابط. العميل يدفع إلكترونيا (ثواني / Paymob) أو بالتحويل.
• الدفعة تُسجل تلقائيا وتتغير حالة الفاتورة.
• 🏆 «الأداء»: الدخل من صفقات كل موظف (حصتنا فقط) والعمولة = الدخل × النسبة. «تسجيل دفعة» عند دفع العمولة؛ يظهر المتبقي.
• 📨 «التقارير ← التقرير الأسبوعي»: يصل للمديرين كل أحد صباحا.

Invoices: quote → invoice → send link; online or bank payment updates the invoice. Performance: commission per person; record payouts to see what is still due. Weekly report every Sunday morning.` },
  { title: "دليل: التقييمات والإحالات · Reviews and referrals", category: "procedure", roles: ["admin", "manager"], body: `• يُطلب التقييم تلقائيا عند تغيير الطلب إلى «ناجح» أو إكمال العمل.
• ⭐ «التقييمات والإحالات»: اختر التقييمات التي تظهر في الموقع (فقط ما سمح العميل بنشره، بالاسم الأول).
• لكل عميل رابط دعوة في حسابه؛ الطلب القادم عبره يظهر فيه «أحاله».

Reviews are requested automatically after Won / completed jobs; choose which appear on the website. Customers' invite links show "Referred by" on new requests.` },
  { title: "دليل: تطبيق الميدان بدون إنترنت · Field app offline", category: "faq", roles: ["admin", "manager", "agent"], body: `• افتح «الميدان» مرة واحدة مع وجود تغطية كل صباح: تُحفظ قائمة اليوم في الهاتف.
• بدون تغطية: «وصلت»، نتيجة المعاينة، الملاحظات و📷 الصور تُحفظ في الهاتف ويظهر «بانتظار الإرسال».
• عند عودة التغطية تُرسل تلقائيا مع الوقت الأصلي. لا تسجّل الخروج قبل إرسالها.
• أضفه للشاشة الرئيسية: Chrome ⋮ ← إضافة إلى الشاشة الرئيسية (آيفون: Safari ← مشاركة).

Open Field once with signal each morning. Offline, arrivals, results, notes and photos wait on the phone and are sent with their original time when signal returns. Don't sign out before they are sent.` },
  { title: "دليل: الخريطة في الموقع · The website map", category: "faq", roles: ["admin", "manager", "agent"], body: `ما يراه الزوار: العروض المنشورة، مقارنة السعر بالمشابه، أسعار المنطقة المعتادة واهتمام المشترين (عند وجود 3 عروض على الأقل)، «ميزانيتي» لعرض ما يناسب الدفع الشهري، المقارنة بين 3 عقارات، ما حول العقار (مدارس، مستشفيات، مساجد…)، وحدود القطع المنشورة.
عقار المالك يظهر بالمنطقة فقط إلا إذا سُمح بالموقع الدقيق أو نُشرت حدود القطعة.

Visitors see published listings, price vs similar, typical area prices and interest (3+ listings), a monthly budget filter, compare up to 3, nearby places, and published plot outlines. Owner properties show by area only unless the exact location is allowed.` },
];

const existing = new Set((await db.select({ title: kbArticles.title }).from(kbArticles)).map((r) => r.title));
const add = ARTICLES.filter((a) => !existing.has(a.title));
if (add.length) await db.insert(kbArticles).values(add);
console.log(`staff guide: ${add.length} added, ${ARTICLES.length - add.length} already there`);
await client.end();
