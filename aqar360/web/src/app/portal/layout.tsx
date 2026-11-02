import type { Metadata } from "next";
import { Instrument_Sans, Tajawal } from "next/font/google";
import type { ReactNode } from "react";

import "../globals.css";
import "../design.css";
import "../customer.css";

const latin = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-latin" });
const arabic = Tajawal({ subsets: ["arabic", "latin"], weight: ["400", "500", "700"], display: "swap", variable: "--font-arabic" });

export const metadata: Metadata = { title: "Aqar 360 · My account", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Customer portal: Arabic first with English alongside, like the invoices. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${latin.variable} ${arabic.variable}`}>
        <div className="cust p-frame">
          <header className="p-top"><strong>عقار 360 · Aqar 360</strong><a className="a-btn small" href="/ar/account">حسابي · My account</a></header>
          <main className="p-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
