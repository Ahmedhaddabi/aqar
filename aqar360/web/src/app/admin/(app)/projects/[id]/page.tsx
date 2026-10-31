import Link from "next/link";
import { notFound } from "next/navigation";

import { money, siteDict } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { Field, Photos, Section, Toggle } from "@/admin/ListingParts";
import { ListingForm, MapPicker, UnitTypesEditor } from "@/admin/listing-ui";
import { areaChoices, getProjectForEdit } from "@/admin/listings";
import { AVAILABILITY, PROPERTY_STATUS } from "@/db/schema";
import { requireApp } from "@/lib/auth";
import { htmlToText } from "@/lib/text";

import { addUnit, setUnitStatus } from "../../../listing-actions";

const s = (v: number | null | undefined) => (v == null ? "" : String(v));

export default async function ProjectEditor({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; photo?: string }>;
}) {
  const user = await requireApp("crm", ["admin", "manager"]);
  const lang = await adminLang(user.language);
  const T = adminDict(lang);
  const t = T.listings;
  const site = siteDict(lang);
  const { id: rawId } = await params;
  const { saved, photo } = await searchParams;
  const isNew = rawId === "new";
  const data = isNew ? null : await getProjectForEdit(Number(rawId));
  if (!isNew && !data) notFound();
  const p = data?.project;
  const areas = await areaChoices(lang);
  const title = p ? (lang === "ar" ? p.nameAr || p.nameEn : p.nameEn) : t.newProject;
  return (
    <>
      <p><Link href="/admin/listings?tab=projects">← {t.back}</Link></p>
      <header className="a-head a-request-head">
        <h1>{title}</h1>
        {p?.public && p.verified && <a className="a-btn" href={`/${lang}/projects/${p.slug}`} target="_blank" rel="noreferrer">{t.viewOnSite} ↗</a>}
      </header>
      {saved && <p className="a-ok">{t.saved}</p>}
      <ListingForm kind="project" t={t} checkText={T.errors.required}>
        {p && <input type="hidden" name="id" value={p.id} />}
        <Section title={t.sections.basics}>
          <Field label={t.nameEn}><input name="nameEn" defaultValue={p?.nameEn} required dir="ltr" /></Field>
          <Field label={t.nameAr}><input name="nameAr" defaultValue={p?.nameAr} dir="rtl" /></Field>
          <Field label={t.developer}><input name="developer" defaultValue={p?.developer} dir="auto" /></Field>
          <Field label={t.category}>
            <select name="category" defaultValue={p?.category ?? "Residential"}>
              {["Residential", "Commercial", "Mixed-Use", "Land Plots"].map((c) => <option key={c} value={c}>{site.pages.projects.categories[c] ?? c}</option>)}
            </select>
          </Field>
          <Field label={t.area}>
            <select name="areaId" defaultValue={p?.areaId ?? ""}>
              <option value="">—</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label={t.constructionStatus}>
            <select name="constructionStatus" defaultValue={p?.constructionStatus ?? ""}>
              <option value="">—</option>
              {Object.entries(t.constructionValues).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </Field>
          <Field label={t.handover}><input type="date" name="handover" defaultValue={p?.handover ?? ""} /></Field>
        </Section>
        <Section title={t.sections.location}>
          <div className="wide"><MapPicker lat={p?.lat ?? null} lng={p?.lng ?? null} t={t} /></div>
        </Section>
        <Section title={t.sections.unitTypes}>
          <div className="wide">
            <UnitTypesEditor t={t} initial={(data?.types ?? []).map((u) => ({ type: u.type, bedrooms: s(u.bedrooms), sizeFrom: s(u.sizeFrom),
              sizeTo: s(u.sizeTo), priceFrom: s(u.priceFrom), priceTo: s(u.priceTo), available: s(u.available) }))} />
          </div>
        </Section>
        <Section title={t.sections.prices}>
          <Field label={t.priceFrom} help={t.priceHelp}><input type="number" min={0} name="priceFrom" defaultValue={s(p?.priceFrom)} /></Field>
          <Field label={t.priceTo}><input type="number" min={0} name="priceTo" defaultValue={s(p?.priceTo)} /></Field>
          <Field label={t.availability}>
            <select name="availability" defaultValue={p?.availability ?? "active"}>
              {AVAILABILITY.map((a) => <option key={a} value={a}>{t.availabilityValues[a]}</option>)}
            </select>
          </Field>
          <Field label={t.paymentPlanEn} help={t.paymentPlanHelp} wide><textarea name="paymentPlanEn" rows={3} defaultValue={p?.paymentPlanEn} dir="ltr" /></Field>
          <Field label={t.paymentPlanAr} help={t.paymentPlanHelp} wide><textarea name="paymentPlanAr" rows={3} defaultValue={p?.paymentPlanAr} dir="rtl" /></Field>
        </Section>
        <Section title={t.sections.texts}>
          <Field label={t.descriptionAr} wide><textarea name="descriptionAr" rows={5} defaultValue={htmlToText(p?.descriptionAr ?? "")} dir="rtl" /></Field>
          <Field label={t.descriptionEn} wide><textarea name="descriptionEn" rows={5} defaultValue={htmlToText(p?.descriptionEn ?? "")} dir="ltr" /></Field>
        </Section>
        <Section title={t.sections.publish}>
          <Toggle name="public" label={t.showOnWebsite} checked={p?.public ?? false} />
          <Toggle name="verified" label={t.checked} help={t.checkedHelp} checked={p?.verified ?? false} />
          <Toggle name="foreignOwnership" label={t.foreignOwnership} checked={p?.foreignOwnership ?? false} />
        </Section>
      </ListingForm>

      {p && data && (
        <>
          <Photos ownerType="project" ownerId={p.id} photos={data.photos} cover={p.coverImage} t={t} photoError={photo} />
          <section className="a-panel">
            <h2>{t.sections.units}</h2>
            <p className="a-muted">{t.unitHelp}</p>
            {data.units.length > 0 && (
              <table className="a-table">
                <thead><tr><th>{t.unitNumber}</th><th>{t.floor}</th><th>{t.unitType}</th><th>{t.size}</th><th>{t.price}</th><th>{t.status}</th></tr></thead>
                <tbody>
                  {data.units.map((u) => (
                    <tr key={u.id}>
                      <td data-label={t.unitNumber}><strong>{u.unitNumber}</strong></td>
                      <td data-label={t.floor}>{u.floor ?? ""}</td>
                      <td data-label={t.unitType}>{u.unitType ?? ""}</td>
                      <td data-label={t.size}>{u.sizeSqm ?? ""}</td>
                      <td data-label={t.price}>{money(u.salePrice, lang)}</td>
                      <td data-label={t.status}>
                        <form action={setUnitStatus} className="a-inline">
                          <input type="hidden" name="id" value={u.id} />
                          <select name="status" defaultValue={u.status} aria-label={t.status}>
                            {PROPERTY_STATUS.map((st) => <option key={st} value={st}>{t.statuses[st]}</option>)}
                          </select>
                          <button className="a-btn small">✓</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form action={addUnit} className="a-form a-grid a-add-unit">
              <input type="hidden" name="projectId" value={p.id} />
              <label className="a-field"><span>{t.unitNumber}</span><input name="unitNumber" required dir="ltr" /></label>
              <label className="a-field"><span>{t.floor}</span><input name="floor" type="number" min={0} /></label>
              <label className="a-field"><span>{t.unitType}</span>
                <select name="unitType"><option value="">—</option>{data.types.map((u) => <option key={u.id} value={u.type}>{u.type}</option>)}</select></label>
              <label className="a-field"><span>{t.bedrooms}</span><input name="bedrooms" type="number" min={0} /></label>
              <label className="a-field"><span>{t.size}</span><input name="sizeSqm" type="number" min={0} /></label>
              <label className="a-field"><span>{t.salePrice}</span><input name="salePrice" type="number" min={0} /></label>
              <label className="a-field"><span>{t.status}</span>
                <select name="status" defaultValue="available">{PROPERTY_STATUS.map((st) => <option key={st} value={st}>{t.statuses[st]}</option>)}</select></label>
              <div><button className="a-btn primary">+ {t.addUnit}</button></div>
            </form>
          </section>
        </>
      )}
    </>
  );
}
