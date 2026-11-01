// Security headers (§18.1). Third-party origins are only allowed when the matching feature is configured.
const gtm = process.env.NEXT_PUBLIC_GTM_ID ? " https://www.googletagmanager.com https://www.google-analytics.com" : "";
const turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? " https://challenges.cloudflare.com" : "";
// Map tiles, fonts and icons come from the map provider's origin (customer_inputs.md: map provider).
const mapOrigin = new URL(process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron").origin;

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${gtm}${turnstile}${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  `connect-src 'self' ${mapOrigin}${gtm}`,
  "worker-src 'self' blob:",
  `frame-src 'self' https://www.youtube-nocookie.com${turnstile}${gtm}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // The "Pay online" form is redirected to the gateways' hosted checkout pages.
  "form-action 'self' https://checkout.thawani.om https://uatcheckout.thawani.om https://om.checkout.paymob.com",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Photos are shrunk in the browser and sent one by one; this leaves room for a full-size image (Vercel's cap is 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      {
        // Staff pages may use the phone's location (check-in at viewings); the public website may not.
        source: "/admin/:path*",
        headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" }],
      },
      {
        source: "/((?!admin).*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
