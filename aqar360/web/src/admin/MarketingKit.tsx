"use client";

import QRCode from "qrcode";
import { useRef, useState } from "react";

import { aiSocial } from "@/app/admin/ai-actions";
import type { Social } from "@/lib/ai";
import type { ListingCard } from "@/lib/marketing";

import type { AdminDict } from "./i18n";

type T = AdminDict["kit"];
const KIND_AR: Record<string, string> = { Apartment: "شقة", Villa: "فيلا", Land: "أرض", Building: "مبنى", Shop: "محل", Office: "مكتب", Warehouse: "مستودع",
  Showroom: "معرض", Project: "مشروع", Commercial: "تجاري", Other: "عقار" };
const W = 1080;
const H = 1350;

function Copy({ text, label, done }: { text: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="a-btn small" onClick={() => navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}>
    {ok ? `✓ ${done}` : label}</button>;
}

/** Draws the card in the browser: canvas text handles Arabic shaping and right-to-left correctly. */
async function drawCard(canvas: HTMLCanvasElement, c: ListingCard) {
  const ctx = canvas.getContext("2d")!;
  const font = getComputedStyle(document.body).fontFamily;
  canvas.width = W;
  canvas.height = H;
  ctx.fillStyle = "#102f4c";
  ctx.fillRect(0, 0, W, H);
  const photoH = 760;
  if (c.hasPhoto) {
    const img = new Image();
    img.src = `/admin/properties/${c.id}/photo`;
    await img.decode().then(() => {
      const scale = Math.max(W / img.width, photoH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (W - w) / 2, (photoH - h) / 2, w, h);
    }).catch(() => undefined);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, photoH);
    g.addColorStop(0, "#0e7c7b");
    g.addColorStop(1, "#1c4a73");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, photoH);
  }
  // Sale / rent tag
  ctx.fillStyle = "#e3a33b";
  ctx.beginPath();
  ctx.roundRect(48, 48, 360, 72, 36);
  ctx.fill();
  ctx.fillStyle = "#102f4c";
  ctx.font = `700 36px ${font}`;
  ctx.textAlign = "center";
  ctx.fillText(c.rent ? "FOR RENT · للإيجار" : "FOR SALE · للبيع", 228, 96);
  // Titles
  const br = c.bedrooms ? ` · ${c.bedrooms} BR` : "";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.direction = "ltr";
  ctx.font = `700 52px ${font}`;
  ctx.fillText(`${c.kind}${br}${c.areaEn ? ` · ${c.areaEn}` : ""}`.slice(0, 40), 56, photoH + 90);
  ctx.textAlign = "right";
  ctx.direction = "rtl";
  ctx.font = `700 50px ${font}`;
  ctx.fillText(`${KIND_AR[c.kind] ?? c.kind}${c.bedrooms ? ` · ${c.bedrooms} غرف` : ""}${c.areaAr ? ` · ${c.areaAr}` : ""}`, W - 56, photoH + 165);
  // Price
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = "#e3a33b";
  ctx.font = `700 76px ${font}`;
  const price = c.price ? `${new Intl.NumberFormat("en").format(c.price)} OMR${c.rent ? " / month" : ""}` : "Price on request";
  ctx.fillText(price, 56, photoH + 270);
  ctx.fillStyle = "#cfd8e3";
  ctx.font = `400 34px ${font}`;
  ctx.fillText([c.sizeSqm ? `${c.sizeSqm} m²` : "", c.bathrooms ? `${c.bathrooms} bath` : "", c.code].filter(Boolean).join(" · "), 56, photoH + 330);
  // QR to the listing
  const qr = new Image();
  qr.src = await QRCode.toDataURL(c.link, { margin: 1, width: 220 });
  await qr.decode();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(W - 276, H - 300, 228, 228);
  ctx.drawImage(qr, W - 272, H - 296, 220, 220);
  ctx.fillStyle = "#cfd8e3";
  ctx.font = `400 26px ${font}`;
  ctx.textAlign = "center";
  ctx.fillText("Scan · امسح", W - 162, H - 40);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 44px ${font}`;
  ctx.fillText("Aqar 360 · عقار 360", 56, H - 60);
}

export function MarketingKit({ t, card, ai }: { t: T; card: ListingCard; ai: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [social, setSocial] = useState<Social | null>(null);
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  const [cardState, setCardState] = useState<"none" | "busy" | "ready" | "error">("none");

  const write = async () => {
    setState("busy");
    const r = await aiSocial(card.id);
    if (!r.ok) return setState(r.error === "off" ? t.aiOff : r.error === "limit" ? t.limit : t.failed);
    setSocial(r.data);
    setState("idle");
  };
  const make = async () => {
    setCardState("busy");
    try {
      await drawCard(canvas.current!, card);
      setCardState("ready");
    } catch {
      setCardState("error");
    }
  };
  const blob = () => new Promise<Blob>((resolve) => canvas.current!.toBlob((b) => resolve(b!), "image/png"));
  const download = async () => {
    const url = URL.createObjectURL(await blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${card.code}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const share = async () => {
    const file = new File([await blob()], `${card.code}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: social?.whatsappAr ?? card.link }).catch(() => undefined);
    else await download();
  };
  const block = (label: string, text: string) => (
    <div className="a-kit-text">
      <div className="a-inline"><strong>{label}</strong><Copy text={text} label={t.copy} done={t.copied} /></div>
      <textarea readOnly rows={6} value={text} dir="auto" />
    </div>
  );
  return (
    <section className="a-panel" id="marketing">
      <h2>📣 {t.title}</h2>
      <p className="a-muted">{t.intro}{!card.isPublic && ` ${t.notPublic}`}</p>
      <div className="a-inline">
        {ai && <button type="button" className="a-btn" disabled={state === "busy"} onClick={write}>{state === "busy" ? t.working : `✨ ${t.write}`}</button>}
        <button type="button" className="a-btn" disabled={cardState === "busy"} onClick={make}>🖼 {t.makeCard}</button>
        {!["idle", "busy"].includes(state) && <span className="a-error">{state}</span>}
      </div>
      {social && (
        <div className="a-kit-grid">
          {block("Instagram · العربية", social.instagramAr)}
          {block("Instagram · English", social.instagramEn)}
          {block("WhatsApp · العربية", social.whatsappAr)}
          {block("WhatsApp · English", social.whatsappEn)}
          {block(t.hashtags, social.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "))}
        </div>
      )}
      <canvas ref={canvas} className="a-kit-card" hidden={cardState !== "ready"} aria-label={t.cardAlt} />
      {cardState === "error" && <p className="a-error">{t.cardFailed}</p>}
      {cardState === "ready" && (
        <div className="a-inline">
          <button type="button" className="a-btn primary" onClick={download}>⬇ {t.download}</button>
          <button type="button" className="a-btn" onClick={share}>📤 {t.share}</button>
        </div>
      )}
    </section>
  );
}
