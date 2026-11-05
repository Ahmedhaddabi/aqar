import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Tajawal } from "next/font/google";
import type { ReactNode } from "react";

import { adminDict, adminLang } from "@/admin/i18n";
import { THEME_SCRIPT } from "@/admin/theme";
import { currentUser } from "@/lib/auth";

import "./admin.css";

// Customer admin design: Tajawal for Arabic, Instrument Sans for Latin text and numbers.
const latin = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-latin" });
const arabic = Tajawal({ subsets: ["arabic", "latin"], weight: ["400", "500", "700"], display: "swap", variable: "--font-arabic" });

export const metadata: Metadata = {
  title: "Aqar 360 Admin", robots: { index: false, follow: false }, manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Aqar 360", statusBarStyle: "black-translucent" },
  icons: { apple: "/admin/app-icon/180", icon: "/admin/app-icon/192" },
};
export const viewport: Viewport = { themeColor: "#1020F0", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser().catch(() => null);
  const lang = await adminLang(user?.language);
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className={`${latin.variable} ${arabic.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>
        <title>{adminDict(lang).appName}</title>
        {children}
      </body>
    </html>
  );
}
