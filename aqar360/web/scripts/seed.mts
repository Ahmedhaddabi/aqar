// Reference data (safe to re-run: existing rows are never overwritten). Demo listings: npm run db:seed -- --demo
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as s from "../src/db/schema";

const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const db = drizzle({ client, schema: s });
const demo = process.argv.includes("--demo");

const MUSCAT = ["Muscat", "مسقط"] as const;
const WILAYATS: [string, string][] = [["Muscat", "مسقط"], ["Muttrah", "مطرح"], ["Bawshar", "بوشر"], ["As Seeb", "السيب"],
  ["Al Amarat", "العامرات"], ["Qurayyat", "قريات"]];
// Approximate centres; staff correct them or draw boundaries (customer_inputs.md).
const AREAS: [string, string, string, number, number][] = [
  ["As Seeb", "Al Khoudh", "الخوض", 23.603, 58.163], ["As Seeb", "Al Mawaleh", "الموالح", 23.592, 58.253],
  ["As Seeb", "Al Maabilah", "المعبيلة", 23.638, 58.108], ["Bawshar", "Al Ghubrah", "الغبرة", 23.596, 58.398],
  ["Bawshar", "Al Qurum", "القرم", 23.614, 58.475],
];
// §8.3 delivery times after the shoot (hours).
const SLA: Record<string, number> = { "AQ-PHOTOS": 24, "AQ-FLOOR-PLAN": 48, "AQ-VIDEO-STANDARD": 48, "AQ-VIDEO-AI": 72, "AQ-VIDEO-DRONE-AI": 72,
  "AQ-VIDEO-PRESENTER": 72, "AQ-VIDEO-LIFESTYLE": 120, "AQ-EXTRA-REVISION": 24 };
// §6 draft prices (OMR); editable by the customer.
const SERVICES: [string, string, string, number | null, string, string, boolean][] = [
  ["AQ-PHOTOS", "Professional Photos", "صور احترافية", 120,
    "10 selected, edited photos (interior/exterior), colour and perspective correction, high-res and web versions.",
    "10 صور مختارة ومعدلة داخلية وخارجية، تصحيح ألوان ومنظور، نسخة عالية الدقة ونسخة للويب.", true],
  ["AQ-FLOOR-PLAN", "Floor Plan", "مخطط المساحات", 100, "Clear 2D floor plan of the space layout.",
    "مخطط ثنائي الأبعاد واضح لتوزيع المساحات.", true],
  ["AQ-VIDEO-STANDARD", "Standard Video", "فيديو قياسي", 150, "Filming, editing, voice-over, subtitles and music.",
    "تصوير ومونتاج مع تعليق صوتي وترجمة وموسيقى.", true],
  ["AQ-VIDEO-AI", "AI Video", "فيديو بالذكاء الاصطناعي", 180, "Standalone video with AI-assisted/enhanced production.",
    "فيديو مستقل بإنتاج مدعوم ومحسن بالذكاء الاصطناعي.", true],
  ["AQ-VIDEO-DRONE-AI", "Drone + AI Video", "فيديو درون مع الذكاء الاصطناعي", 250,
    "Aerial filming + AI; subject to permits, location and weather.",
    "تصوير جوي مع الذكاء الاصطناعي، خاضع للتصاريح والموقع والطقس.", true],
  ["AQ-VIDEO-PRESENTER", "Presenter Video", "فيديو بمقدم", 300, "Presenter, script, filming, editing and subtitles.",
    "مقدم أو مقدمة مع نص وتصوير ومونتاج وترجمة.", true],
  ["AQ-VIDEO-LIFESTYLE", "Lifestyle Video", "فيديو لايف ستايل", 600, "Full production: concept, storytelling and actors.",
    "إنتاج كامل: فكرة وسرد قصصي وممثلون.", true],
  ["AQ-EXTRA-REVISION", "Additional Revision Round", "جولة تعديل إضافية", null, "Revision round beyond those included.",
    "جولة تعديل إضافية بعد الجولات المشمولة.", false],
];
const SETTINGS: Record<string, unknown> = {
  companyNameAr: "عقار 360", companyNameEn: "Aqar 360",
  firstResponseHours: 2, followUpDays: 14, requestValidDays: 90,
  workDays: ["Sun", "Mon", "Tue", "Wed", "Thu"], workStart: "08:00", workEnd: "17:00",
};

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function seedReference() {
  const wilayatIds: Record<string, number> = {};
  for (const [en, ar] of WILAYATS) {
    const found = await db.select().from(s.wilayats).where(eq(s.wilayats.nameEn, en));
    wilayatIds[en] = found[0]?.id ?? (await db.insert(s.wilayats).values({ governorateEn: MUSCAT[0], governorateAr: MUSCAT[1],
      nameEn: en, nameAr: ar }).returning())[0].id;
  }
  for (const [wilayat, en, ar, lat, lng] of AREAS) {
    await db.insert(s.areas).values({ slug: slug(en), nameEn: en, nameAr: ar, wilayatId: wilayatIds[wilayat], lat, lng })
      .onConflictDoNothing();
  }
  for (const [i, [code, nameEn, nameAr, price, scopeEn, scopeAr, isPublic]] of SERVICES.entries()) {
    await db.insert(s.services).values({ code, nameEn, nameAr, price, scopeEn, scopeAr, public: isPublic, sort: i, slaHours: SLA[code] ?? 48 })
      .onConflictDoNothing();
  }
  for (const [key, value] of Object.entries(SETTINGS)) {
    await db.insert(s.settings).values({ key, value }).onConflictDoNothing();
  }
  const khoudh = (await db.select().from(s.areas).where(eq(s.areas.slug, "al-khoudh")))[0];
  await db.insert(s.pages).values([
    { slug: "al-khoudh", type: "Area Guide", areaId: khoudh.id, published: true, lastReviewed: "2026-10-30",
      titleEn: "Living in Al Khoudh (sample)", titleAr: "السكن في الخوض (نموذج)",
      summaryEn: "A quiet residential area near Sultan Qaboos University, popular with families and students.",
      summaryAr: "منطقة سكنية هادئة قرب جامعة السلطان قابوس، مفضلة للعائلات والطلاب.",
      factsEn: "Wilayat: As Seeb\nGood for: families, students\nTypical rent (2 bedrooms): 250–320 OMR/month",
      factsAr: "الولاية: السيب\nمناسبة لـ: العائلات والطلاب\nالإيجار المعتاد (غرفتان): 250–320 ر.ع شهريا",
      bodyEn: "<p>Sample guide text. Replace it with the team's reviewed area guide.</p>",
      bodyAr: "<p>نص دليل تجريبي. استبدله بدليل المنطقة بعد مراجعة الفريق.</p>",
      faqs: [{ questionEn: "Is Al Khoudh good for families?", answerEn: "Yes, it is mainly residential with schools nearby (sample answer).",
        questionAr: "هل الخوض مناسبة للعائلات؟", answerAr: "نعم، هي منطقة سكنية في الغالب وقريبة من المدارس (إجابة تجريبية)." }] },
    { slug: "renting-apartment-muscat", type: "Renting Guide", published: true, lastReviewed: "2026-10-30",
      titleEn: "Renting an apartment in Muscat (sample)", titleAr: "استئجار شقة في مسقط (نموذج)",
      summaryEn: "What to check before you sign: budget, contract, deposit and viewing.",
      summaryAr: "ما يجب التحقق منه قبل التوقيع: الميزانية والعقد والتأمين والمعاينة.",
      factsEn: "Usual contract: 12 months\nDeposit: often one month's rent",
      factsAr: "مدة العقد المعتادة: 12 شهرا\nالتأمين: غالبا إيجار شهر واحد",
      bodyEn: "<p>Sample guide text. Replace it with the team's reviewed guide.</p>",
      bodyAr: "<p>نص دليل تجريبي. استبدله بالدليل بعد مراجعة الفريق.</p>" },
  ]).onConflictDoNothing();
}

async function seedDemo() {
  const area = async (slugValue: string) => (await db.select().from(s.areas).where(eq(s.areas.slug, slugValue)))[0].id;
  const existing = await db.select().from(s.projects).where(eq(s.projects.slug, "demo-mawaleh-gardens"));
  if (existing.length) return console.log("demo data already present");
  const [mg] = await db.insert(s.projects).values({
    slug: "demo-mawaleh-gardens", nameEn: "(Demo) Mawaleh Gardens", nameAr: "(تجريبي) حدائق الموالح",
    developer: "Demo Developer LLC", areaId: await area("al-mawaleh"), lat: 23.5935, lng: 58.2555,
    constructionStatus: "Under Construction", handover: "2028-06-30", priceFrom: 62000, priceTo: 98000,
    paymentPlanEn: "10% booking\n40% during construction\n50% on handover",
    paymentPlanAr: "10% عند الحجز\n40% أثناء الإنشاء\n50% عند التسليم",
    descriptionEn: "<p>Demo project: low-rise apartments with a shared garden and parking.</p>",
    descriptionAr: "<p>مشروع تجريبي: شقق منخفضة الارتفاع حول حديقة مشتركة مع مواقف سيارات.</p>",
    foreignOwnership: true, public: true, verified: true, coverImage: "/demo/project-1.svg",
  }).returning();
  const [qh] = await db.insert(s.projects).values({
    slug: "demo-qurum-heights", nameEn: "(Demo) Qurum Heights", nameAr: "(تجريبي) مرتفعات القرم",
    developer: "Demo Developer LLC", areaId: await area("al-qurum"), lat: 23.6152, lng: 58.4771,
    constructionStatus: "Ready", priceFrom: 48000, priceTo: 240000,
    paymentPlanEn: "25% down payment\n75% over 24 months", paymentPlanAr: "25% دفعة أولى\n75% على 24 شهرا",
    descriptionEn: "<p>Demo project: a ready tower near the beach.</p>",
    descriptionAr: "<p>مشروع تجريبي: برج جاهز قريب من الشاطئ.</p>", public: true, verified: true,
    coverImage: "/demo/project-2.svg",
  }).returning();
  await db.insert(s.projectUnitTypes).values([
    { projectId: mg.id, type: "2 Bedrooms", bedrooms: 2, sizeFrom: 110, priceFrom: 62000, priceTo: 70000, sort: 1 },
    { projectId: mg.id, type: "3 Bedrooms", bedrooms: 3, sizeFrom: 150, priceFrom: 85000, priceTo: 98000, sort: 2 },
    { projectId: qh.id, type: "1 Bedroom", bedrooms: 1, sizeFrom: 75, priceFrom: 48000, priceTo: 52000, available: 8, sort: 1 },
    { projectId: qh.id, type: "Penthouse", sizeFrom: 260, priceFrom: 210000, priceTo: 240000, available: 2, sort: 2 },
  ]);
  await db.insert(s.images).values([
    { ownerType: "project", ownerId: mg.id, url: "/demo/project-3.svg", captionEn: "Evening view (demo image)",
      captionAr: "منظر مسائي (صورة تجريبية)", sort: 1 },
  ]);
  const units: [string, number, string, number, number, number, (typeof s.PROPERTY_STATUS)[number]][] = [
    ["A-101", 1, "2 Bedrooms", 2, 112, 62000, "available"], ["A-102", 1, "2 Bedrooms", 2, 115, 63500, "reserved"],
    ["A-201", 2, "2 Bedrooms", 2, 112, 64000, "available"], ["A-202", 2, "3 Bedrooms", 3, 152, 86000, "available"],
    ["A-301", 3, "3 Bedrooms", 3, 155, 89000, "available"], ["A-302", 3, "3 Bedrooms", 3, 158, 92000, "sold"],
  ];
  await db.insert(s.properties).values(units.map(([unitNumber, floor, unitType, bedrooms, sizeSqm, salePrice, status]) => ({
    code: `DEMO-MG-${unitNumber}`, title: `(Demo) Mawaleh Gardens ${unitNumber}`, kind: "Apartment", purpose: "sale" as const,
    salePrice, bedrooms, sizeSqm, areaId: mg.areaId, projectId: mg.id, unitNumber, floor, unitType, status,
    public: true, verified: true,
  })));
  const props: [string, string, string, "sale" | "rent", number, number | null, number, number, number, boolean][] = [
    ["DEMO-MAP-01", "Apartment", "al-khoudh", "rent", 280, 2, 120, 23.6041, 58.1652, false],
    ["DEMO-MAP-02", "Villa", "al-khoudh", "sale", 145000, 5, 400, 23.6012, 58.159, false],
    ["DEMO-MAP-03", "Apartment", "al-ghubrah", "rent", 420, 3, 160, 23.5968, 58.399, true],
    ["DEMO-MAP-04", "Office", "al-qurum", "rent", 650, null, 90, 23.613, 58.4705, true],
    ["DEMO-MAP-05", "Land", "al-maabilah", "sale", 38000, null, 600, 23.639, 58.11, false],
  ];
  for (const [code, kind, areaSlug, purpose, price, bedrooms, sizeSqm, lat, lng, exact] of props) {
    await db.insert(s.properties).values({ code, title: `(Demo) ${kind}`, kind, purpose,
      ...(purpose === "rent" ? { rentPrice: price } : { salePrice: price }), bedrooms, sizeSqm, areaId: await area(areaSlug),
      lat, lng, showExactLocation: exact, public: true, verified: true });
  }
  console.log("demo listings added");
}

await seedReference();
if (demo) await seedDemo();
await client.end();
console.log("seed done");
