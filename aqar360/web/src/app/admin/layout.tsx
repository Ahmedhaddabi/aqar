import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import type { ReactNode } from "react";

import { adminDict, adminLang } from "@/admin/i18n";
import { currentUser } from "@/lib/auth";

import "./admin.css";

const font = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = { title: "Aqar 360 Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser().catch(() => null);
  const lang = await adminLang(user?.language);
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <body className={font.className}>
        <title>{adminDict(lang).appName}</title>
        {children}
      </body>
    </html>
  );
}
