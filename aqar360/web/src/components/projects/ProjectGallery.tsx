"use client";

import { useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries";
import { fill } from "@/lib/format";

/** Main photo with previous/next, a counter and thumbnails; arrow keys work once the gallery has focus. */
export function ProjectGallery({ dict, title, images }: {
  dict: Dictionary; title: string; images: { image: string; caption: string | null }[];
}) {
  const t = dict.pages.projects;
  const [index, setIndex] = useState(0);
  if (!images.length) return <div className="gallery gallery-empty" aria-hidden="true" />;
  const go = (step: number) => setIndex((i) => (i + step + images.length) % images.length);
  const current = images[index];
  return (
    <div className="gallery" role="region" aria-roledescription="carousel" aria-label={title} tabIndex={0}
      onKeyDown={(e) => {
        // Arrow keys follow the reading direction (RTL pages swap them).
        const rtl = document.dir === "rtl";
        if (e.key === "ArrowRight") go(rtl ? -1 : 1);
        if (e.key === "ArrowLeft") go(rtl ? 1 : -1);
      }}>
      <figure className="gallery-main">
        <img src={current.image} alt={current.caption || title} />
        {current.caption && <figcaption>{current.caption}</figcaption>}
        {images.length > 1 && (
          <>
            <button type="button" className="gallery-nav prev" aria-label={t.previous} onClick={() => go(-1)} />
            <button type="button" className="gallery-nav next" aria-label={t.next} onClick={() => go(1)} />
            <span className="gallery-count" aria-live="polite">{fill(t.photo, { n: index + 1, total: images.length })}</span>
          </>
        )}
      </figure>
      {images.length > 1 && (
        <div className="gallery-thumbs">
          {images.map((img, i) => (
            <button key={img.image} type="button" aria-current={i === index} aria-label={fill(t.photo, { n: i + 1, total: images.length })}
              onClick={() => setIndex(i)}>
              <img src={img.image} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
