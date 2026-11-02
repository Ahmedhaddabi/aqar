"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type Slide = { image: string; tag: string; title: string; text: string; href: string; cta: string };

/** Featured banners: fade every 6 seconds, arrows and dots; pauses while the pointer or focus is inside. */
export function Carousel({ slides, labels }: { slides: Slide[]; labels: { prev: string; next: string } }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setAt((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(timer);
  }, [paused, slides.length]);
  const go = (step: number) => setAt((i) => (i + step + slides.length) % slides.length);
  return (
    <div className="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {slides.map((s, i) => (
        <div key={s.href + i} className={i === at ? "slide on" : "slide"} aria-hidden={i !== at}>
          <div className="bimg" style={{ backgroundImage: `url(${s.image})` }} />
          <div className="bcap">
            <p className="tagline">{s.tag}</p>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            <Link className="btn light-solid" href={s.href} tabIndex={i === at ? undefined : -1}>{s.cta}</Link>
          </div>
        </div>
      ))}
      {slides.length > 1 && (
        <div className="cnav">
          <button type="button" className="cbtn" onClick={() => go(-1)} aria-label={labels.prev}>←</button>
          <div className="dots">
            {slides.map((s, i) => <button key={i} type="button" aria-current={i === at} aria-label={s.title} onClick={() => setAt(i)} />)}
          </div>
          <button type="button" className="cbtn" onClick={() => go(1)} aria-label={labels.next}>→</button>
        </div>
      )}
    </div>
  );
}

/** A row of cards that scrolls sideways (snap), with arrow buttons around a link in the middle. */
export function Swipe({ children, labels, cta }: { children: React.ReactNode; labels: { prev: string; next: string }; cta?: React.ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const move = (step: number) => {
    const el = row.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: step * (rtl ? -1 : 1) * el.clientWidth * 0.8, behavior: "smooth" });
  };
  return (
    <>
      <div className="swipe" ref={row}>{children}</div>
      <div className="swnav">
        <button type="button" className="cbtn2" onClick={() => move(-1)} aria-label={labels.prev}>←</button>
        {cta}
        <button type="button" className="cbtn2" onClick={() => move(1)} aria-label={labels.next}>→</button>
      </div>
    </>
  );
}

export function CopyNumber({ value, label, done }: { value: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="tcopy" onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => undefined)}>
      {copied ? done : label}
    </button>
  );
}
