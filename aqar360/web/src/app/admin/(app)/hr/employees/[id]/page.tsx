import Link from "next/link";
import { notFound } from "next/navigation";

import { Documents } from "@/admin/Documents";
import { getEmployee } from "@/admin/hr";
import { adminDict, adminLang } from "@/admin/i18n";
import { Field, Section, Toggle } from "@/admin/ListingParts";
import { requireApp } from "@/lib/auth";

import { saveEmployee } from "../../../../hr-actions";

export default async function EmployeePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireApp("hr", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.hr;
  const raw = (await params).id;
  const e = raw === "new" ? null : await getEmployee(Number(raw));
  if (raw !== "new" && !e) notFound();
  const q = await searchParams;
  return (
    <>
      <p><Link href="/admin/hr">← {t.title}</Link></p>
      <header className="a-head"><h1>{e?.name ?? t.addEmployee}</h1></header>
      {q.saved && <p className="a-ok">{t.saved}</p>}
      {q.error && <p className="a-alert">{T.site.invalid}</p>}
      <form action={saveEmployee} className="a-form a-listing-form">
        <input type="hidden" name="id" value={e?.id ?? "new"} />
        <Section title={t.tabs.people}>
          <div className="a-grid-fields">
            <Field label={t.name}><input name="name" defaultValue={e?.name} required minLength={2} dir="auto" /></Field>
            <Field label={t.jobTitle}><input name="jobTitle" defaultValue={e?.jobTitle} dir="auto" /></Field>
            <Field label={t.phone}><input name="phone" type="tel" defaultValue={e?.phone ?? ""} dir="ltr" /></Field>
            <Field label={t.email}><input name="email" type="email" defaultValue={e?.email ?? ""} dir="ltr" /></Field>
            <Field label={t.nationality}><input name="nationality" defaultValue={e?.nationality} dir="auto" /></Field>
            <Field label={t.joinDate}><input name="joinDate" type="date" defaultValue={e?.joinDate ?? ""} /></Field>
          </div>
        </Section>
        <Section title={t.docs}>
          <div className="a-grid-fields">
            <Field label={t.idNumber}><input name="idNumber" defaultValue={e?.idNumber} dir="ltr" /></Field>
            <Field label={t.idExpiry}><input name="idExpiry" type="date" defaultValue={e?.idExpiry ?? ""} /></Field>
            <Field label={t.passportExpiry}><input name="passportExpiry" type="date" defaultValue={e?.passportExpiry ?? ""} /></Field>
            <Field label={t.visaExpiry}><input name="visaExpiry" type="date" defaultValue={e?.visaExpiry ?? ""} /></Field>
          </div>
        </Section>
        <Section title={t.salary}>
          <div className="a-grid-fields">
            <Field label={t.basicSalary}><input name="basicSalary" type="number" min={0} step="0.001" defaultValue={e?.basicSalary ?? 0} required /></Field>
            <Field label={t.allowances}><input name="allowances" type="number" min={0} step="0.001" defaultValue={e?.allowances ?? 0} /></Field>
            <Field label={t.annualLeaveDays}><input name="annualLeaveDays" type="number" min={0} max={90} defaultValue={e?.annualLeaveDays ?? 30} /></Field>
            <Field label={t.notes} wide><textarea name="notes" rows={3} defaultValue={e?.notes} dir="auto" /></Field>
            <Toggle name="active" label={t.active} checked={e?.active ?? true} />
          </div>
        </Section>
        <div className="a-savebar"><button className="a-btn primary">{t.save}</button></div>
      </form>
      {e && <Documents ownerType="employee" ownerId={e.id} lang={lang} />}
    </>
  );
}
