import type { Metadata } from "next";

import { PropertyMap } from "@/components/map/PropertyMap";
import { home, PageHead } from "@/components/PageHead";
import { getDictionary } from "@/i18n/dictionaries";
import { getMapData } from "@/lib/content";
import { type LangParams, langOf } from "@/lib/params";
import { pageMetadata } from "@/lib/seo";

const PATH = "/map";

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const lang = await langOf(params);
  const t = getDictionary(lang).pages.map;
  return pageMetadata(lang, PATH, t.title, t.description);
}

export default async function MapPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.map;
  // Public, verified, available records only (aqar360.api.content.get_map_data); the list is server-rendered too.
  const data = (await getMapData(lang)) ?? { areas: [], listings: [] };
  return (
    <>
      <PageHead lang={lang} title={t.title} summary={t.summary} compact
        crumbs={[home(lang, dict.nav.home), { name: t.title, path: `/${lang}${PATH}` }]} />
      <PropertyMap lang={lang} dict={dict} data={data} />
    </>
  );
}
