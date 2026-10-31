import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import type { ReactNode } from "react";

import "../admin/admin.css";

const font = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "600", "700"], display: "swap" });

export const metadata: Metadata = { title: "Aqar 360 · My account", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Customer portal: Arabic first with English alongside, like the invoices. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className={font.className}>
        <header className="p-top"><strong>عقار 360 · Aqar 360</strong><span>حسابي · My account</span></header>
        <main className="a-main p-main">{children}</main>
      </body>
    </html>
  );
}
