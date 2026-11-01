// End-to-end smoke test against a running site: `npm run smoke [-- http://localhost:3000]`.
// Submits one synthetic request; run against staging only.
const base = process.argv[2] || "http://localhost:3000";
let failures = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function page(path) {
  const res = await fetch(base + path, { redirect: "manual" });
  return { status: res.status, headers: res.headers, html: await res.text() };
}

const PAGES = ["", "/find-me-a-property", "/market-my-property", "/market-my-project", "/content-services", "/consulting",
  "/areas", "/areas/al-khoudh", "/insights", "/insights/renting-apartment-muscat", "/careers", "/partners-suppliers",
  "/about", "/contact", "/legal/privacy", "/map", "/projects", "/calculators"];

for (const lang of ["ar", "en"]) {
  for (const path of PAGES) {
    const { status, html } = await page(`/${lang}${path}`);
    check(`${lang}${path || "/"} renders`, status === 200, `status ${status}`);
    if (path === "") {
      check(`${lang} html lang/dir`, html.includes(`lang="${lang}"`) && html.includes(`dir="${lang === "ar" ? "rtl" : "ltr"}"`));
      check(`${lang} hreflang alternates`, html.includes('hrefLang="ar"') && html.includes('hrefLang="en"') && html.includes("x-default"));
      check(`${lang} organization JSON-LD`, html.includes('"ProfessionalService"'));
    }
  }
}

const root = await page("/");
check("/ redirects to a language", [307, 308].includes(root.status) && /\/(ar|en)$/.test(root.headers.get("location") || ""));
const guide = await page("/ar/areas/al-khoudh");
check("area guide has FAQ + Article structured data", guide.html.includes('"FAQPage"') && guide.html.includes('"Article"'));
check("security headers", (guide.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'")
  && guide.headers.get("x-content-type-options") === "nosniff");
check("unknown guide is 404", (await page("/ar/insights/does-not-exist")).status === 404);
const sitemap = await page("/sitemap.xml");
const map = await page("/en/map");
check("map page lists public results", /map-count">\d+ results?</.test(map.html) && map.html.includes('class="map-canvas"'));
const csp = map.headers.get("content-security-policy") || "";
check("map CSP allows the tile provider and same-origin worker", /connect-src 'self' https:\/\/\S+/.test(csp) && csp.includes("worker-src 'self'"));
const worker = await fetch(`${base}/vendor/maplibre-gl-worker-6.14.0.mjs`, { method: "HEAD" });
check("map worker served as JavaScript", worker.ok && (worker.headers.get("content-type") || "").includes("javascript"));
const projectsIndex = await page("/en/projects");
const projectLink = /href="(\/en\/projects\/[a-z0-9-]+)"/.exec(projectsIndex.html)?.[1];
if (projectLink) {
  const project = await page(projectLink);
  check("project page renders with Place data and register interest", project.status === 200
    && project.html.includes('"Place"') && project.html.includes("find-me-a-property?purpose=Buy&amp;property_type=Project"));
  check("sitemap lists project pages", sitemap.html.includes(projectLink.replace("/en/", "/ar/")));
}
check("unknown project is 404", (await page("/en/projects/does-not-exist")).status === 404);
check("sitemap lists guides with alternates", sitemap.html.includes("/areas/al-khoudh") && sitemap.html.includes('hreflang="en"'));
check("sitemap lists the map", sitemap.html.includes("/ar/map"));
const robots = await page("/robots.txt");
check("robots excludes private pages", robots.html.includes("Disallow: /ar/my-request") && robots.html.includes("Sitemap:"));

const form = await page("/en/find-me-a-property");
const areaId = (form.html.match(/name="areas" value="(\d+)"/) || [])[1];
check("request form is open and lists areas", Boolean(areaId));

const submit = (body, headers = {}) => fetch(base + "/api/forms/search", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
const valid = {
  full_name: "Smoke Test", phone: "9" + String(Date.now()).slice(-7), email: `smoke-${Date.now()}@aqar360.invalid`,
  language: "en", purpose: "Rent", property_type: "Apartment", areas: [areaId], budget_max: 300,
  timing: "Within 1 Month", preferred_channel: "Email", source_channel: "Website", idempotency_key: `smoke-${Date.now()}`,
};
// Validation checks never store anything; a real submission is opt-in (it creates a request in the database).
const bad = await (await submit({ ...valid, phone: "12", idempotency_key: `smoke-bad-${Date.now()}` })).json();
check("invalid phone returns field error", bad.ok === false && bad.error?.fields?.phone, JSON.stringify(bad));
const cross = await submit(valid, { Origin: "https://evil.example" });
check("cross-site post rejected", cross.status === 403);
const forged = await page("/en/my-request?token=forged");
check("forged private link rejected", !forged.html.includes("REQ-") && forged.html.includes("noindex"));

if (process.env.SMOKE_SUBMIT === "1") {
  const ok = await (await submit(valid)).json();
  check("valid request accepted", ok.ok === true && /^REQ-/.test(ok.data?.request_number || ""), JSON.stringify(ok));
  if (ok.ok) {
    const mine = await page(`/en/my-request?token=${encodeURIComponent(ok.data.self_service_token)}`);
    check("my-request shows the request", mine.status === 200 && mine.html.includes(ok.data.request_number));
    check("my-request is noindex + no-referrer", mine.html.includes("noindex") && mine.html.includes('content="no-referrer"'));
    const stop = await (await fetch(base + "/api/my-request", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop_alerts", token: ok.data.self_service_token }) })).json();
    check("stop alerts works", stop.ok === true && stop.data?.alerts_paused === true, JSON.stringify(stop));
  }
} else {
  console.log("SKIP  real submission (set SMOKE_SUBMIT=1; it creates a request named 'Smoke Test')");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
