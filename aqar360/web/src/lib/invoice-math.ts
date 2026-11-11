// Invoice totals and the amount in words. No server imports: the line editor in the browser uses the same maths.
export type MathLine = { qty: number; unitPrice: number; passThrough?: boolean | null };

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** subtotal − discount + VAT = total. Discount and VAT apply to our fees only; client media money (pass-through) has neither. */
export function invoiceTotals(lines: MathLine[], discount: number, vatRate: number) {
  const subtotal = r3(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));
  const media = r3(lines.filter((l) => l.passThrough).reduce((a, l) => a + l.qty * l.unitPrice, 0));
  const fees = r3(subtotal - media);
  const off = r3(Math.min(Math.max(discount || 0, 0), fees));
  const vatTotal = r3(((fees - off) * Math.max(vatRate || 0, 0)) / 100);
  return { subtotal, media, fees, discount: off, vatTotal, total: r3(subtotal - off + vatTotal) };
}

// ---- Amount in words (Omani rial = 1000 baisa) ----------------------------------------------------------------
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enBelow1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const tens = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
  return [h ? `${ONES[h]} hundred` : "", tens].filter(Boolean).join(" and ");
}

function enNumber(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [size, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"], [1, ""]] as const) {
    const chunk = Math.floor(n / size) % 1000;
    if (chunk) parts.push(`${enBelow1000(chunk)}${name ? ` ${name}` : ""}`);
  }
  return parts.join(" ");
}

const AR_ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر",
  "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function arBelow1000(n: number): string {
  const rest = n % 100;
  const tens = rest < 20 ? AR_ONES[rest] : [AR_ONES[rest % 10], AR_TENS[Math.floor(rest / 10)]].filter(Boolean).join(" و");
  return [AR_HUNDREDS[Math.floor(n / 100)], tens].filter(Boolean).join(" و");
}

// [one, two, 3–10 (plural), 11+ (singular accusative)] for thousand / million / billion.
const AR_SCALES: [number, string, string, string, string][] = [
  [1e9, "مليار", "ملياران", "مليارات", "مليارا"],
  [1e6, "مليون", "مليونان", "ملايين", "مليونا"],
  [1e3, "ألف", "ألفان", "آلاف", "ألفا"],
];

function arNumber(n: number): string {
  if (n === 0) return "صفر";
  const parts: string[] = [];
  for (const [size, one, two, few, many] of AR_SCALES) {
    const chunk = Math.floor(n / size) % 1000;
    if (!chunk) continue;
    // 3–10 take the plural; 11–99 the accusative singular; a round hundred (100, 200…) the plain singular.
    const word = chunk % 100 === 0 ? one : chunk % 100 >= 3 && chunk % 100 <= 10 ? few : many;
    parts.push(chunk === 1 ? one : chunk === 2 ? two : `${arBelow1000(chunk)} ${word}`);
  }
  const last = n % 1000;
  if (last) parts.push(arBelow1000(last));
  return parts.join(" و");
}

/** "One hundred and twenty Omani rials and 500 baisa" / "مائة وعشرون ريالا عمانيا و500 بيسة". */
export function amountInWords(amount: number, lang: "en" | "ar") {
  const total = Math.round(Math.max(amount, 0) * 1000);
  const rials = Math.floor(total / 1000);
  const baisa = total % 1000;
  if (lang === "en") {
    const words = `${enNumber(rials)} Omani ${rials === 1 ? "rial" : "rials"}${baisa ? ` and ${baisa} baisa` : ""} only`;
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  const rest = rials % 100;
  // Counted noun after the number: 3–10 plural, 11–99 accusative singular, otherwise (0, 100, 1000, 101…) plain singular.
  const unit = rials === 1 ? "ريال عماني" : rials === 2 ? "ريالان عمانيان" : rest >= 3 && rest <= 10 ? "ريالات عمانية"
    : rest >= 11 ? "ريالا عمانيا" : "ريال عماني";
  const ar = rials === 1 || rials === 2 ? unit : `${arNumber(rials)} ${unit}`;
  return `فقط ${ar}${baisa ? ` و${baisa} بيسة` : ""} لا غير`;
}
