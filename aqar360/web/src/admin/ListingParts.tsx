// Server-rendered building blocks shared by the project and property editors.
import type { ReactNode } from "react";

import { makeCover, removePhoto } from "@/app/admin/listing-actions";
import type { images } from "@/db/schema";

import type { AdminDict } from "./i18n";
import { PhotoUploader } from "./listing-ui";

type T = AdminDict["listings"];

export function Field({ label, help, children, wide }: { label: string; help?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`a-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}

export function Toggle({ name, label, help, checked }: { name: string; label: string; help?: string; checked: boolean }) {
  return (
    <label className="a-toggle">
      <input type="checkbox" name={name} defaultChecked={checked} />
      <span><strong>{label}</strong>{help && <small>{help}</small>}</span>
    </label>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="a-panel" id={id}>
      <h2>{title}</h2>
      <div className="a-grid-fields">{children}</div>
    </section>
  );
}

export function Photos({ ownerType, ownerId, photos, cover, t, photoError }: {
  ownerType: "project" | "property"; ownerId: number; photos: (typeof images.$inferSelect)[]; cover: string | null; t: T;
  photoError?: string;
}) {
  return (
    <section className="a-panel" id="photos">
      <h2>{t.sections.photos}</h2>
      {photoError && <p className="a-alert">{photoError === "storage" ? t.storageMissing : t.photoError}</p>}
      <PhotoUploader ownerType={ownerType} ownerId={ownerId} t={t} />
      <ul className="a-photos">
        {photos.map((p) => (
          <li key={p.id} className={p.url === cover ? "cover" : ""}>
            <img src={p.url} alt="" loading="lazy" />
            <div className="a-inline">
              {p.url !== cover && (
                <form action={makeCover}><input type="hidden" name="id" value={p.id} /><button className="a-btn small">{t.makeCover}</button></form>
              )}
              <form action={removePhoto}><input type="hidden" name="id" value={p.id} /><button className="a-btn small danger">{t.remove}</button></form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
