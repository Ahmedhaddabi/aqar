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
  "/about", "/contact", "/legal/privacy", "/map", "/projects"];

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

const areas = await (await fetch(base + "/ar/areas")).text();
const areaId = (areas.match(/areas=(AREA-\d+)/) || [])[1];
check("area ids exposed for requests", Boolean(areaId));

const submit = (body, headers = {}) => fetch(base + "/api/forms/search", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
const valid = {
  full_name: "Smoke Test", phone: "9" + String(Date.now()).slice(-7), email: `smoke-${Date.now()}@aqar360.invalid`,
  language: "en", purpose: "Rent", property_type: "Apartment", areas: [areaId], budget_max: 300,
  timing: "Within 1 Month", preferred_channel: "Email", source_channel: "Website", idempotency_key: `smoke-${Date.now()}`,
};
const bad = await (await submit({ ...valid, phone: "12", idempotency_key: `smoke-bad-${Date.now()}` })).json();
check("invalid phone returns field error", bad.ok === false && bad.error?.fields?.phone, JSON.stringify(bad));
const cross = await submit(valid, { Origin: "https://evil.example" });
check("cross-site post rejected", cross.status === 403);
const ok = await (await submit(valid)).json();
check("valid request accepted", ok.ok === true && /^REQ-/.test(ok.data?.request_number || ""), JSON.stringify(ok));

if (ok.ok) {
  const mine = await page(`/en/my-request?token=${encodeURIComponent(ok.data.self_service_token)}`);
  check("my-request shows the request", mine.status === 200 && mine.html.includes(ok.data.request_number));
  check("my-request is noindex + no-referrer", mine.html.includes("noindex") && mine.html.includes('content="no-referrer"'));
  const forged = await page("/en/my-request?token=forged");
  check("forged token rejected", !forged.html.includes("REQ-"));
  const stop = await (await fetch(base + "/api/my-request", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stop_alerts", token: ok.data.self_service_token }) })).json();
  check("stop alerts works", stop.ok === true && stop.data?.alerts_stopped === true, JSON.stringify(stop));
}

// Customer account: needs a staging customer login, passed via environment (never stored in the repo).
const customerEmail = process.env.AQAR_SMOKE_CUSTOMER_EMAIL;
const customerPassword = process.env.AQAR_SMOKE_CUSTOMER_PASSWORD;
if (customerEmail && customerPassword) {
  const account = (body, cookie = "") => fetch(base + "/api/account", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body),
  });
  const wrong = await account({ action: "login", email: customerEmail, password: "wrong-password" });
  check("wrong password refused", wrong.status === 401);
  const login = await account({ action: "login", email: customerEmail, password: customerPassword });
  const setCookies = login.headers.getSetCookie();
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  check("customer login sets httpOnly session cookies", login.status === 200
    && setCookies.some((c) => c.startsWith("aqar_sid=") && /httponly/i.test(c)));
  const res = await fetch(base + "/en/account", { headers: { Cookie: cookie } });
  const html = await res.text();
  check("account shows own requests", html.includes("My requests") && /REQ-\d{4}-\d{5}/.test(html));
  check("account page is noindex", html.includes("noindex"));
  await account({ action: "logout" }, cookie);
  const after = await (await fetch(base + "/en/account", { headers: { Cookie: cookie } })).text();
  // Interface text ships in the page payload, so check for customer data (request numbers), not labels.
  check("logout ends the session", after.includes("Sign in") && !/REQ-\d{4}-\d{5}/.test(after));
  const anonymous = await (await fetch(base + "/en/account")).text();
  check("anonymous visitor sees sign-in only", anonymous.includes("Create an account") && !/REQ-\d{4}/.test(anonymous));
} else {
  console.log("SKIP  customer account checks (set AQAR_SMOKE_CUSTOMER_EMAIL / AQAR_SMOKE_CUSTOMER_PASSWORD)");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
