import type { Metadata } from "next";

import { MyRequest } from "@/components/MyRequest";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/config";
import { frappeCall } from "@/lib/frappe";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<{ token?: string }> };

// Private page: never indexed, and the token in the URL is not leaked through the Referer header.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const dict = getDictionary(isLocale(lang) ? lang : "ar");
  return { title: dict.pages.myRequest.title, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function MyRequestPage({ params, searchParams }: Props) {
  const { lang: raw } = await params;
  const lang: Locale = isLocale(raw) ? raw : "ar";
  const { token } = await searchParams;
  const dict = getDictionary(lang);
  const t = dict.pages.myRequest;
  const result = token ? await frappeCall<Parameters<typeof MyRequest>[0]["initial"]>("public.get_my_request",
    { params: { token } }) : null;
  return (
    <section className="container section article">
      <h1>{t.title}</h1>
      {result?.ok ? <MyRequest token={token!} initial={result.data} dict={dict} /> : <p className="notice warn">{t.missing}</p>}
    </section>
  );
}
