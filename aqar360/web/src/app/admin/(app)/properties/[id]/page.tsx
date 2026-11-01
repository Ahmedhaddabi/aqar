import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DescribeButton } from "@/admin/AiParts";
import { Documents } from "@/admin/Documents";
import { siteDict } from "@/admin/format";
import { adminDict, adminLang } from "@/admin/i18n";
import { Field, Photos, Section, Toggle } from "@/admin/ListingParts";
import { ListingForm, MapPicker } from "@/admin/listing-ui";
import { areaChoices, getPropertyForEdit } from "@/admin/listings";
import { MarketingKit } from "@/admin/MarketingKit";
import { PlotEditor } from "@/admin/PlotEditor";
import { db } from "@/db";
import { plots, PROPERTY_STATUS } from "@/db/schema";
import { optionLabel } from "@/i18n/dictionaries";
import { aiReady } from "@/lib/ai";
import { requireApp } from "@/lib/auth";
import { listingCard } from "@/lib/marketing";
import { htmlToText } from "@/lib/text";

const KINDS = ["Apartment", "Villa", "Land", "Building", "Shop", "Office", "Warehouse", "Showroom", "Commercial", "Other"];
const s = (v: number | null | undefined) => (v == null ? "" : String(v));

export default async function PropertyEditor({ params, searchParams }: {
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
  const data = isNew ? null : await getPropertyForEdit(Number(rawId));
  if (!isNew && !data) notFound();
  const p = data?.property;
  const [ai, card, [plot]] = await Promise.all([aiReady(), p ? listingCard(p.id) : Promise.resolve(null),
    p ? db.select().from(plots).where(eq(plots.propertyId, p.id)) : Promise.resolve([])]);
  const areas = await areaChoices(lang);
  return (
    <>
      <p><Link href="/admin/listings?tab=properties">← {t.back}</Link></p>
      <header className="a-head a-request-head">
        <h1>{p ? `${optionLabel(site, p.kind)} · ${p.code}` : t.newProperty}</h1>
        {p?.public && p.verified && <a className="a-btn" href={`/${lang}/map?listing=${encodeURIComponent(p.code)}`} target="_blank" rel="noreferrer">{t.viewOnSite} ↗</a>}
      </header>
      {saved && <p className="a-ok">{t.saved}</p>}
      <ListingForm kind="property" t={t} checkText={T.errors.required}>
        {p && <input type="hidden" name="id" value={p.id} />}
        <Section title={t.sections.basics}>
          <Field label={t.kind}>
            <select name="kind" defaultValue={p?.kind ?? "Apartment"}>{KINDS.map((k) => <option key={k} value={k}>{optionLabel(site, k)}</option>)}</select>
          </Field>
          <Field label={t.purpose}>
            <select name="purpose" defaultValue={p?.purpose ?? "rent"}>
              {Object.entries(t.purposes).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </Field>
          <Field label={t.area}>
            <select name="areaId" defaultValue={p?.areaId ?? ""}><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
          <Field label={t.internalTitle}><input name="title" defaultValue={p?.title} dir="auto" /></Field>
          <Field label={t.bedrooms}><input type="number" min={0} name="bedrooms" defaultValue={s(p?.bedrooms)} /></Field>
          <Field label={t.bathrooms}><input type="number" min={0} name="bathrooms" defaultValue={s(p?.bathrooms)} /></Field>
          <Field label={t.size}><input type="number" min={0} name="sizeSqm" defaultValue={s(p?.sizeSqm)} /></Field>
          <Field label={t.furnished}>
            <select name="furnished" defaultValue={p?.furnished ?? ""}>
              <option value="">—</option>
              {["Furnished", "Unfurnished"].map((f) => <option key={f} value={f}>{optionLabel(site, f)}</option>)}
            </select>
          </Field>
        </Section>
        <Section title={t.sections.prices}>
          <Field label={t.salePrice}><input type="number" min={0} name="salePrice" defaultValue={s(p?.salePrice)} /></Field>
          <Field label={t.rentPrice}><input type="number" min={0} name="rentPrice" defaultValue={s(p?.rentPrice)} /></Field>
          <Field label={t.status}>
            <select name="status" defaultValue={p?.status ?? "available"}>{PROPERTY_STATUS.map((st) => <option key={st} value={st}>{t.statuses[st]}</option>)}</select>
          </Field>
        </Section>
        <Section title={t.sections.location}>
          <div className="wide"><MapPicker lat={p?.lat ?? null} lng={p?.lng ?? null} t={t} /></div>
          <Toggle name="showExactLocation" label={t.showExact} help={t.showExactHelp} checked={p?.showExactLocation ?? false} />
        </Section>
        <Section title={t.sections.texts}>
          {ai && <div className="a-grid-fields wide"><DescribeButton t={T.ai} /></div>}
          <Field label={t.descriptionAr} wide><textarea name="descriptionAr" rows={4} defaultValue={htmlToText(p?.descriptionAr ?? "")} dir="rtl" /></Field>
          <Field label={t.descriptionEn} wide><textarea name="descriptionEn" rows={4} defaultValue={htmlToText(p?.descriptionEn ?? "")} dir="ltr" /></Field>
        </Section>
        <Section title={t.sections.owner}>
          <Field label={t.ownerName}><input name="ownerName" defaultValue={p?.ownerName ?? ""} dir="auto" /></Field>
          <Field label={t.ownerPhone}><input name="ownerPhone" defaultValue={p?.ownerPhone ?? ""} dir="ltr" /></Field>
        </Section>
        <Section title={t.sections.publish}>
          <Toggle name="public" label={t.showOnWebsite} checked={p?.public ?? false} />
          <Toggle name="verified" label={t.checked} help={t.checkedHelp} checked={p?.verified ?? false} />
        </Section>
      </ListingForm>
      {p && data && <Photos ownerType="property" ownerId={p.id} photos={data.photos} cover={p.coverImage} t={t} photoError={photo} />}
      {p && <Documents ownerType="property" ownerId={p.id} lang={lang} canShare />}
      {p && <PlotEditor t={T.plot} propertyId={p.id} initial={plot ?? null} ai={ai} />}
      {p && card && <MarketingKit t={T.kit} card={card} ai={ai} />}
    </>
  );
}
