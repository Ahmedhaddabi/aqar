// The weekly manager report (strategy §25 management reporting): the last 7 days in numbers, sent every Sunday morning
// (Muscat) to admins and managers by email, with a bell notification linking to the same page in the admin.
import { and, count, eq, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { arAging, financeSummary } from "@/admin/money";
import { db } from "@/db";
import { activities, OPEN_STATUSES, offers, requests, settings, users } from "@/db/schema";

import { siteUrl } from "./config";
import { sendStaffEmail } from "./messages";
import { notify } from "./notify";
import { muscatDay } from "./viewings";

const DAY = 86_400_000;

export async function weeklyReport(now = new Date()) {
  const to = new Date(`${muscatDay(now)}T00:00:00+04:00`);
  const from = new Date(to.getTime() - 7 * DAY);
  const fromDay = muscatDay(from);
  const lastDay = muscatDay(new Date(to.getTime() - 1));
  const [hoursRow] = await db.select().from(settings).where(eq(settings.key, "firstResponseHours"));
  const targetHours = Number(hoursRow?.value) || 2;
  const inRange = (col: PgColumn) => and(gte(col, from), lt(col, to));

  const [created, viewings, booked, offerRows, won, staff, openLoad, money, aging] = await Promise.all([
    db.select({ id: requests.id, kind: requests.kind, source: requests.sourceChannel, assignedTo: requests.assignedTo, createdAt: requests.createdAt,
      firstResponseAt: requests.firstResponseAt }).from(requests).where(inRange(requests.createdAt)),
    db.select({ userId: activities.userId, result: activities.result }).from(activities)
      .where(and(eq(activities.type, "viewing"), eq(activities.done, true), isNotNull(activities.result), ne(activities.result, "cancelled"),
        gte(activities.dueAt, from), lt(activities.dueAt, to))),
    db.select({ n: count() }).from(activities).where(and(eq(activities.type, "viewing"), eq(activities.source, "online"), inRange(activities.createdAt))),
    db.select({ n: count() }).from(offers).where(inRange(offers.createdAt)),
    db.select({ n: count() }).from(requests).where(and(eq(requests.status, "won"), inRange(requests.updatedAt))),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)),
    db.select({ id: requests.assignedTo, n: count() }).from(requests).where(inArray(requests.status, [...OPEN_STATUSES])).groupBy(requests.assignedTo),
    financeSummary(fromDay, lastDay),
    arAging(muscatDay(now)),
  ]);

  const replyHours = (r: (typeof created)[number]) => (r.firstResponseAt ? (r.firstResponseAt.getTime() - r.createdAt.getTime()) / 3_600_000 : null);
  const replied = created.map(replyHours).filter((h): h is number => h !== null);
  const isLate = (r: (typeof created)[number]) => {
    const h = replyHours(r);
    return h === null ? now.getTime() - r.createdAt.getTime() > targetHours * 3_600_000 : h > targetHours;
  };
  const sources: Record<string, number> = {};
  for (const r of created) sources[r.source || "Other"] = (sources[r.source || "Other"] ?? 0) + 1;
  const people = staff.map((u) => ({
    name: u.name,
    open: openLoad.find((l) => l.id === u.id)?.n ?? 0,
    newAssigned: created.filter((r) => r.assignedTo === u.id).length,
    late: created.filter((r) => r.assignedTo === u.id && isLate(r)).length,
    viewings: viewings.filter((v) => v.userId === u.id).length,
  })).filter((p) => p.open || p.newAssigned || p.viewings).sort((a, b) => b.late - a.late || b.open - a.open);
  return {
    from: fromDay, to: lastDay, targetHours,
    requests: { total: created.length, search: created.filter((r) => r.kind === "search").length, listing: created.filter((r) => r.kind === "listing").length,
      consulting: created.filter((r) => r.kind === "consulting").length, unassigned: created.filter((r) => !r.assignedTo).length,
      sources: Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 5) },
    reply: { avgHours: replied.length ? replied.reduce((a, b) => a + b, 0) / replied.length : null, late: created.filter(isLate).length },
    viewings: { done: viewings.length, interested: viewings.filter((v) => v.result === "interested").length, bookedOnline: booked[0].n },
    offers: offerRows[0].n, won: won[0].n,
    money: { income: money.income, spent: money.spent, overdue: aging.d30 + aging.d60 + aging.d90 + aging.d90p, receivable: money.receivable },
    people,
  };
}

export type WeeklyReport = Awaited<ReturnType<typeof weeklyReport>>;

const L = {
  en: { subject: "Aqar 360 weekly report", period: "Week", requests: "New requests", search: "searches", listing: "owner listings", consulting: "consulting",
    unassigned: "not assigned", sources: "Where they came from", reply: "First reply", avg: "average", hours: "hours", late: "late (target {h} h)",
    viewings: "Viewings done", interested: "interested", online: "booked online this week", offers: "Offers", won: "Deals won",
    money: "Money", income: "Income (our share)", spent: "Expenses", overdue: "Overdue invoices", receivable: "Customers owe in total",
    people: "By person (open · new · late replies · viewings)", none: "No activity.", open: "Open the report in the admin" },
  ar: { subject: "التقرير الأسبوعي لعقار 360", period: "الأسبوع", requests: "طلبات جديدة", search: "بحث", listing: "عروض ملاك", consulting: "استشارات",
    unassigned: "غير مُسندة", sources: "مصادر الطلبات", reply: "الرد الأول", avg: "المتوسط", hours: "ساعة", late: "متأخرة (الهدف {h} ساعة)",
    viewings: "معاينات تمت", interested: "مهتمون", online: "محجوزة عبر الإنترنت هذا الأسبوع", offers: "عروض شراء/إيجار", won: "صفقات ناجحة",
    money: "المال", income: "الدخل (حصتنا)", spent: "المصروفات", overdue: "فواتير متأخرة", receivable: "إجمالي المستحق على العملاء",
    people: "حسب الموظف (مفتوحة · جديدة · ردود متأخرة · معاينات)", none: "لا يوجد نشاط.", open: "افتح التقرير في النظام" },
};

const omr = (v: number) => `${v.toFixed(3)} OMR`;

/** Plain text (the email turns line breaks into <br>), in the reader's language. */
export function reportText(r: WeeklyReport, lang: "ar" | "en") {
  const t = L[lang];
  const lines = [
    `${t.period}: ${r.from} → ${r.to}`, "",
    `▪ ${t.requests}: ${r.requests.total} (${r.requests.search} ${t.search} · ${r.requests.listing} ${t.listing} · ${r.requests.consulting} ${t.consulting})${r.requests.unassigned ? ` · ${r.requests.unassigned} ${t.unassigned}` : ""}`,
    ...(r.requests.sources.length ? [`  ${t.sources}: ${r.requests.sources.map(([s, n]) => `${s} ${n}`).join(" · ")}`] : []),
    `▪ ${t.reply}: ${r.reply.avgHours === null ? "—" : `${t.avg} ${r.reply.avgHours.toFixed(1)} ${t.hours}`} · ${r.reply.late} ${t.late.replace("{h}", String(r.targetHours))}`,
    `▪ ${t.viewings}: ${r.viewings.done} (${r.viewings.interested} ${t.interested}) · ${r.viewings.bookedOnline} ${t.online}`,
    `▪ ${t.offers}: ${r.offers} · ${t.won}: ${r.won}`,
    `▪ ${t.money}: ${t.income} ${omr(r.money.income)} · ${t.spent} ${omr(r.money.spent)} · ${t.overdue} ${omr(r.money.overdue)} · ${t.receivable} ${omr(r.money.receivable)}`,
    "", t.people,
    ...(r.people.length ? r.people.map((p) => `  ${p.late ? "⚠ " : ""}${p.name}: ${p.open} · ${p.newAssigned} · ${p.late} · ${p.viewings}`) : [`  ${t.none}`]),
    "", `${t.open}: ${siteUrl}/admin/reports/weekly`,
  ];
  return { subject: `${t.subject} (${r.from} → ${r.to})`, body: lines.join("\n") };
}

/** Emails each active admin and manager in their language, once per week; returns how many were sent. */
export async function sendWeeklyReport(now = new Date(), opts: { force?: boolean } = {}) {
  const week = muscatDay(now);
  if (!opts.force) {
    if (new Date(`${week}T00:00:00Z`).getUTCDay() !== 0) return 0; // Sundays (Muscat), the first working day
    const claimed = await db.execute(sql`insert into ${settings} (key, value) values ('weeklyReportSent', to_jsonb(${week}::text))
      on conflict (key) do update set value = excluded.value where ${settings.value} #>> '{}' <> ${week} returning key`);
    if (!claimed.length) return 0;
  }
  const report = await weeklyReport(now);
  const readers = await db.select().from(users).where(and(eq(users.active, true), inArray(users.role, ["admin", "manager"])));
  let sent = 0;
  for (const u of readers) {
    const { subject, body } = reportText(report, u.language);
    const result = await sendStaffEmail(u.email, subject, body);
    if (result.status === "sent") sent++;
  }
  await notify({ roles: ["admin", "manager"] }, { kind: "weekly_report", title: `${report.from} → ${report.to}`, href: "/admin/reports/weekly",
    key: `weekly_report:${week}` });
  return sent;
}
