import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Analytics } from "@/components/Analytics";
import { ChatWidget } from "@/components/ChatWidget";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getDictionary } from "@/i18n/dictionaries";
import { chatAvailable } from "@/lib/chat";
import { companyName, dir, gtmId, isLocale, locales, siteUrl } from "@/lib/config";

import "../globals.css";

const font = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export const revalidate = 300;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return {
    metadataBase: new URL(siteUrl),
    title: { default: companyName[lang], template: `%s | ${companyName[lang]}` },
    description: getDictionary(lang).meta.description,
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#102f4c" };

export default async function LangLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const chat = await chatAvailable().catch(() => false);
  return (
    <html lang={lang} dir={dir(lang)}>
      <body className={font.className}>
        <Header lang={lang} dict={dict} brand={companyName[lang]} />
        <main id="main">{children}</main>
        <Footer lang={lang} dict={dict} brand={companyName[lang]} />
        {chat && <ChatWidget lang={lang} t={dict.chat} />}
        <Analytics gtmId={gtmId} dict={dict.consent} />
      </body>
    </html>
  );
}
