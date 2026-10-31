import { notFound } from "next/navigation";

import { isLocale, type Locale } from "./config";

export type LangParams = { params: Promise<{ lang: string }> };

export async function langOf(params: Promise<{ lang: string }>): Promise<Locale> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return lang;
}
