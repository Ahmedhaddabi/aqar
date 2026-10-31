import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/lib/config";
import { frappeCall } from "@/lib/frappe";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ lang: string; name: string }> };

export default async function InvoicePage({ params }: Props) {
  const { lang, name } = await params;
  if (!isLocale(lang)) notFound();
  const session = await getSession();
  if (!session) redirect(`/${lang}/account`);
  const result = await frappeCall<string>("account.get_invoice", { params: { name: decodeURIComponent(name) }, session });
  if (!result.ok) result.error.code === "not_found" ? notFound() : redirect(`/${lang}/account`);
  const dict = getDictionary(lang);
  return (
    <section className="container section">
      <p><Link href={`/${lang}/account`}>← {dict.pages.account.back}</Link></p>
      {/* Sandboxed: the invoice HTML cannot run scripts or reach this page. */}
      <iframe title={name} sandbox="" srcDoc={result.ok ? result.data : ""}
        style={{ width: "100%", minHeight: "80vh", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
    </section>
  );
}
