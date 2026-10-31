import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/config";
import { getPolicy } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; policy: string }> };

async function load(params: Props["params"]) {
  const { lang, policy } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const name = dict.legalNames[policy];
  if (!name) notFound();
  return { lang: lang as Locale, policy, name, dict, data: await getPolicy(lang, policy) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, policy, name, data } = await load(params);
  // Unapproved policies are placeholders: keep them out of search results until legal approval.
  return pageMetadata(lang, `/legal/${policy}`, name, name, { noindex: !data?.available });
}

export default async function LegalPage({ params }: Props) {
  const { lang, policy, name, dict, data } = await load(params);
  const t = dict.pages.legal;
  return (
    <>
      <PageHead lang={lang} title={name} crumbs={[home(lang, dict.nav.home), { name, path: `/${lang}/legal/${policy}` }]} />
      <section className="container section article">
        {data?.available ? (
          <>
            <p className="muted">{t.version}: {data.version} · {t.effective}: {data.effective_from?.slice(0, 10)}</p>
            <div className="prose" dangerouslySetInnerHTML={{ __html: data.body || "" }} />
          </>
        ) : (
          <p className="notice warn">{t.notAvailable}</p>
        )}
      </section>
    </>
  );
}
