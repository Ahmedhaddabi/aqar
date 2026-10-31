import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import type { ReactNode } from "react";

import "../admin/admin.css";

const font = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "600", "700"], display: "swap" });

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Customer copy of a quote or invoice (bilingual document, left-to-right layout). */
export default function DocLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={font.className}>
        <main className="a-main" style={{ margin: "0 auto" }}>{children}</main>
      </body>
    </html>
  );
}
