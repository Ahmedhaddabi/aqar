import { NextResponse, type NextRequest } from "next/server";

import { defaultLocale, isLocale } from "@/lib/config";

/** Every page lives under /ar or /en (§3.3). Unprefixed paths go to the visitor's preferred language. */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) return NextResponse.next();
  const preferred = (request.headers.get("accept-language") || "").toLowerCase().startsWith("en") ? "en" : defaultLocale;
  const url = request.nextUrl.clone();
  url.pathname = `/${preferred}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|files|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};
