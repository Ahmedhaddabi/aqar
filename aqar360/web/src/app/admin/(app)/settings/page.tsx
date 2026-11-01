import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { dateTime } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { Field, Section, Toggle } from "@/admin/ListingParts";
import { db } from "@/db";
import { auditLog, settings, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { contact } from "@/lib/config";
import { viewingRules } from "@/lib/viewings";

import { saveSettings } from "../../settings-actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; error?: string; who?: string }> }) {
  const user = await requireUser(["admin"]);
  const lang = await adminLang(user.language);
  const t = adminDict(lang).settings;
  const q = await searchParams;
  const tab = q.tab === "audit" ? "audit" : "general";
  return (
    <>
      <header className="a-head"><h1>{t.title}</h1><p className="a-muted">{tab === "audit" ? t.auditIntro : t.intro}</p></header>
      <nav className="a-tabs a-toolbar">
        {(["general", "audit"] as const).map((k) => <Link key={k} href={`/admin/settings?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{t.tabs[k]}</Link>)}
      </nav>
      {q.saved && <p className="a-ok">{t.saved}</p>}
      {q.error && <p className="a-alert">{adminDict(lang).site.invalid}</p>}
      {tab === "general" ? <General t={t} p={adminDict(lang).pay} /> : <Audit t={t} lang={lang} who={q.who} />}
    </>
  );
}

type T = ReturnType<typeof adminDict>["settings"];

async function General({ t, p }: { t: T; p: ReturnType<typeof adminDict>["pay"] }) {
  const [rows, rules] = await Promise.all([db.select().from(settings), viewingRules()]);
  const v = (key: string, fallback = "") => String(rows.find((r) => r.key === key)?.value ?? fallback);
  const text = (key: string, label: string, dir: "ltr" | "rtl" | "auto" = "auto", fallback = "", type = "text") => (
    <Field label={label}><input name={key} type={type} defaultValue={v(key, fallback)} dir={dir} maxLength={300} /></Field>
  );
  return (
    <form action={saveSettings} className="a-form a-listing-form">
      <Section title={t.company}>
        <div className="a-grid-fields">
          {text("companyNameAr", t.nameAr, "rtl", "عقار 360")}
          {text("companyNameEn", t.nameEn, "ltr", "Aqar 360")}
          {text("companyAddress", t.address)}
          {text("companyPhone", t.phone, "ltr", "", "tel")}
          {text("companyEmail", t.email, "ltr", "", "email")}
          {text("companyCr", t.cr, "ltr")}
          {text("companyVat", t.vat, "ltr")}
        </div>
      </Section>
      <Section title={t.website}>
        <div className="a-grid-fields">
          {text("contactPhone", t.contactPhone, "ltr", contact.phone, "tel")}
          {text("contactWhatsapp", t.whatsapp, "ltr", contact.whatsapp, "tel")}
          {text("contactEmail", t.contactEmail, "ltr", contact.email, "email")}
        </div>
      </Section>
      <Section title={t.work}>
        <div className="a-grid-fields">
          <Field label={t.firstResponseHours}><input type="number" name="firstResponseHours" min={1} max={72} defaultValue={v("firstResponseHours", "2")} required /></Field>
          <Field label={t.followUpDays}><input type="number" name="followUpDays" min={1} max={90} defaultValue={v("followUpDays", "14")} required /></Field>
          <Field label={t.requestValidDays}><input type="number" name="requestValidDays" min={7} max={365} defaultValue={v("requestValidDays", "90")} required /></Field>
        </div>
      </Section>
      <Section title={`📅 ${t.viewing.title}`}>
        <p className="a-muted wide">{t.viewing.intro}</p>
        <Toggle name="viewingSelfBooking" label={t.viewing.selfBooking} help={t.viewing.selfBookingHelp} checked={rules.selfBooking} />
        <fieldset className="a-field wide a-days">
          <span>{t.viewing.days}</span>
          <div className="a-inline">
            {[6, 0, 1, 2, 3, 4, 5].map((d) => (
              <label key={d} className="a-check"><input type="checkbox" name="viewingDays" value={d} defaultChecked={rules.days.includes(d)} /> {t.viewing.weekdays[d]}</label>
            ))}
          </div>
        </fieldset>
        <div className="a-grid-fields">
          <Field label={t.viewing.start}><input type="number" name="viewingStart" min={0} max={23} defaultValue={rules.start} required /></Field>
          <Field label={t.viewing.end}><input type="number" name="viewingEnd" min={1} max={24} defaultValue={rules.end} required /></Field>
          <Field label={t.viewing.slot}>
            <select name="viewingSlotMinutes" defaultValue={rules.slotMinutes}>{[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </Field>
          <Field label={t.viewing.notice}><input type="number" name="viewingNoticeHours" min={0} max={168} defaultValue={rules.noticeHours} required /></Field>
          <Field label={t.viewing.ahead}><input type="number" name="viewingDaysAhead" min={1} max={60} defaultValue={rules.daysAhead} required /></Field>
        </div>
      </Section>
      <p className="a-muted">💳 <a href="/admin/payment-methods">{p.title}</a></p>
      <div className="a-savebar"><button className="a-btn primary">{t.save}</button></div>
    </form>
  );
}

async function Audit({ t, lang, who }: { t: T; lang: "ar" | "en"; who?: string }) {
  const staff = await db.select({ id: users.id, name: users.name }).from(users);
  const userId = Number(who);
  const rows = await db.select({ entry: auditLog, name: users.name }).from(auditLog).leftJoin(users, eq(auditLog.userId, users.id))
    .where(Number.isInteger(userId) && userId > 0 ? eq(auditLog.userId, userId) : undefined).orderBy(desc(auditLog.at)).limit(300);
  return (
    <section className="a-panel">
      <form className="a-inline" action="/admin/settings" style={{ marginBottom: 12 }}>
        <input type="hidden" name="tab" value="audit" />
        <select name="who" defaultValue={who ?? ""} aria-label={t.who}>
          <option value="">{t.all}</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="a-btn small">{t.filter}</button>
      </form>
      <table className="a-table">
        <thead><tr><th>{t.when}</th><th>{t.who}</th><th>{t.action}</th><th>{t.item}</th></tr></thead>
        <tbody>
          {rows.map(({ entry: e, name }) => (
            <tr key={e.id}>
              <td data-label={t.when}>{dateTime(e.at, lang)}</td>
              <td data-label={t.who}>{name ?? <span className="a-muted">{t.system}</span>}</td>
              <td data-label={t.action} dir="ltr"><code>{e.action}</code></td>
              <td data-label={t.item} dir="ltr">{e.entity}{e.entityId ? ` #${e.entityId}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
