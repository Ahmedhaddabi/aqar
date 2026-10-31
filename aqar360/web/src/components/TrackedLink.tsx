"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { type AnalyticsEvent, track } from "@/lib/analytics";

/** A link that records an analytics event (no personal data) when clicked. */
export function TrackedLink({ href, event, params, className, children }: {
  href: string; event: AnalyticsEvent; params?: Record<string, string>; className?: string; children: ReactNode;
}) {
  const external = /^(https?:|tel:|mailto:)/.test(href);
  const onClick = () => track(event, params);
  return external ? (
    <a href={href} className={className} onClick={onClick} rel="noopener">{children}</a>
  ) : (
    <Link href={href} className={className} onClick={onClick}>{children}</Link>
  );
}
