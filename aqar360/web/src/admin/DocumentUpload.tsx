"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { uploadDocument } from "@/app/admin/doc-actions";

import type { AdminDict } from "./i18n";

export function DocumentUpload({ ownerType, ownerId, t, canShare }: { ownerType: string; ownerId: number; t: AdminDict["docs"]; canShare: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form ref={form} className="a-inline a-doc-upload" onSubmit={async (e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const file = data.get("file");
      if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024) return setState("error");
      setState("busy");
      const result = await uploadDocument(data).catch(() => ({ ok: false }));
      setState(result.ok ? "idle" : "error");
      if (result.ok) { form.current?.reset(); router.refresh(); }
    }}>
      <input type="hidden" name="ownerType" value={ownerType} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <input name="title" placeholder={t.name} aria-label={t.name} required dir="auto" />
      <select name="category" aria-label={t.category} defaultValue="other">
        {Object.entries(t.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" required aria-label={t.upload} />
      {canShare && <label className="a-check"><input type="checkbox" name="shared" /> {t.shared}</label>}
      <button className="a-btn small primary" disabled={state === "busy"}>{state === "busy" ? t.uploading : `+ ${t.upload}`}</button>
      {state === "error" && <span className="a-error">{t.failed}</span>}
    </form>
  );
}
