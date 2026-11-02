import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Tajawal } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Analytics } from "@/components/Analytics";
import { ChatWidget } from "@/components/ChatWidget";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { getDictionary } from "@/i18n/dictionaries";
import { chatAvailable } from "@/lib/chat";
import { getContact } from "@/lib/content";
import { companyName, dir, gtmId, isLocale, locales, siteUrl } from "@/lib/config";

import "../globals.css";
import "../design.css";
import "../site.css";

// Design: Instrument Sans for Latin text, Tajawal for Arabic (each falls back to the other).
const latin = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-latin" });
const arabic = Tajawal({ subsets: ["arabic", "latin"], weight: ["400", "500", "700"], display: "swap", variable: "--font-arabic" });

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

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1020F0" };

export default async function LangLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const [chat, contact] = await Promise.all([chatAvailable().catch(() => false), getContact()]);
  return (
    <html lang={lang} dir={dir(lang)}>
      <body className={`${latin.variable} ${arabic.variable}`}>
        <Header lang={lang} dict={dict} brand={companyName} />
        <main id="main">{children}</main>
        <Footer lang={lang} dict={dict} brand={companyName} contact={contact} />
        {contact.whatsapp && (
          <a className={chat ? "wa with-chat" : "wa"} href={`https://wa.me/${contact.whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label={dict.nav.whatsapp}>
            <Icon name="whatsapp" size={22} /><span>{dict.nav.whatsapp}</span>
          </a>
        )}
        {chat && <ChatWidget lang={lang} t={dict.chat} />}
        <Analytics gtmId={gtmId} dict={dict.consent} />
      </body>
    </html>
  );
}
