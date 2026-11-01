import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { db } from "@/db";
import { agreements } from "@/db/schema";
import { declineAgreement, signAgreement, textHash } from "@/lib/agreements";
import { validAgreementLink } from "@/lib/doc-link";
import { sha256 } from "@/lib/intake";

import { PrintButton } from "../../../admin/(app)/invoices/[id]/PrintButton";
import { SignaturePad } from "./SignaturePad";

const back = (id: number, s: string, state: string) => redirect(`/doc/agreement/${id}?s=${encodeURIComponent(s)}&done=${state}`);

async function sign(form: FormData) {
  "use server";
  const id = Number(form.get("id"));
  const s = String(form.get("s") ?? "");
  if (!validAgreementLink(id, s)) notFound();
  if (form.get("agree") !== "on") back(id, s, "agree");
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const result = await signAgreement(id, { name: String(form.get("name") ?? ""), signature: String(form.get("signature") ?? ""),
    ipHash: ip ? sha256(`aqar:${ip}`) : null, agent: h.get("user-agent") ?? "" });
  back(id, s, result.ok ? "signed" : result.reason);
}

async function decline(form: FormData) {
  "use server";
  const id = Number(form.get("id"));
  const s = String(form.get("s") ?? "");
  if (!validAgreementLink(id, s)) notFound();
  await declineAgreement(id, String(form.get("reason") ?? ""));
  back(id, s, "declined");
}

const MSG: Record<string, [string, string]> = {
  signed: ["a-ok", "Signed. Thank you; a copy stays on this page. · تم التوقيع، شكرا لك. تبقى نسخة في هذه الصفحة."],
  declined: ["a-ok", "We have told our team. · تم إبلاغ فريقنا."],
  agree: ["a-alert", "Please tick the box to confirm you agree. · يرجى وضع علامة للتأكيد على موافقتك."],
  name: ["a-alert", "Please type your full name. · يرجى كتابة اسمك الكامل."],
  signature: ["a-alert", "Please draw your signature in the box. · يرجى رسم توقيعك في المربع."],
  state: ["a-alert", "This agreement can no longer be signed. Please contact us. · لم يعد بالإمكان توقيع هذه الاتفاقية، يرجى التواصل معنا."],
};
const when = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Muscat" }).format(d);

/** The customer reads the agreement and signs it (typed name + drawn signature), or declines. Signed copies stay viewable. */
export default async function AgreementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string; done?: string }> }) {
  const id = Number((await params).id);
  const { s, done } = await searchParams;
  if (!Number.isInteger(id) || !validAgreementLink(id, s)) notFound();
  const [a] = await db.select().from(agreements).where(eq(agreements.id, id));
  if (!a || a.status === "draft") notFound();
  const intact = !a.bodyHash || a.bodyHash === textHash(a.title, a.body);
  return (
    <article className="a-doc agreement">
      {done && MSG[done] && <p className={MSG[done][0]}>{MSG[done][1]}</p>}
      <header>
        <h1 dir="auto">{a.title}</h1>
        <p className="a-muted" dir="ltr">{a.number}{a.sentAt ? ` · ${when(a.sentAt)}` : ""}</p>
      </header>
      {/* Each paragraph finds its own direction: the text mixes English and Arabic. */}
      <div className="agreement-body">{a.body.split(/\n{2,}/).map((para, i) => <p key={i} dir="auto">{para}</p>)}</div>
      {a.status === "signed" && (
        <section className="agreement-signed">
          <h2>✓ Signed · تم التوقيع</h2>
          {a.signature && <img src={a.signature} alt="Signature" className="sig-image" />}
          <p><strong dir="auto">{a.signerName}</strong> · <span dir="ltr">{a.signedAt ? when(a.signedAt) : ""}</span></p>
          <p className="a-muted agreement-hash" dir="ltr">SHA-256: {a.bodyHash}{intact ? "" : " (text changed after signing!)"}</p>
          <PrintButton label="Print / save as PDF · طباعة / حفظ PDF" />
        </section>
      )}
      {a.status === "declined" && <p className="a-alert">Declined · مرفوضة{a.declineReason ? `: ${a.declineReason}` : ""}</p>}
      {a.status === "cancelled" && <p className="a-alert">This agreement was withdrawn. · تم سحب هذه الاتفاقية.</p>}
      {a.status === "sent" && (
        <>
          <form action={sign} className="a-panel a-form agreement-sign">
            <h2>Sign · التوقيع</h2>
            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="s" value={s} />
            <label className="a-field"><span>Full name · الاسم الكامل</span><input name="name" required minLength={3} maxLength={120} dir="auto" autoComplete="name" /></label>
            <SignaturePad clearLabel="Clear · مسح" hint="Draw your signature here · ارسم توقيعك هنا" />
            <label className="a-check"><input type="checkbox" name="agree" required /> I have read and agree to this agreement, and accept signing it electronically. · قرأت هذه الاتفاقية وأوافق عليها وأقبل توقيعها إلكترونيا.</label>
            <button className="a-btn primary">Sign the agreement · وقّع الاتفاقية</button>
          </form>
          <details className="a-panel">
            <summary>Decline · رفض</summary>
            <form action={decline} className="a-form">
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="s" value={s} />
              <label className="a-field"><span>Reason (optional) · السبب (اختياري)</span><textarea name="reason" rows={3} maxLength={1000} dir="auto" /></label>
              <button className="a-btn small danger">Decline · رفض</button>
            </form>
          </details>
        </>
      )}
    </article>
  );
}
