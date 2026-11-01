/** Install the staff app on a phone's home screen ("Add to home screen"): opens on the Field screen, no browser bars. */
export function GET() {
  return Response.json({
    name: "Aqar 360 Staff", short_name: "Aqar 360", lang: "ar", dir: "rtl",
    start_url: "/admin/field", scope: "/admin/", display: "standalone", orientation: "portrait",
    background_color: "#102f4c", theme_color: "#102f4c",
    icons: [192, 512].map((size) => ({ src: `/admin/app-icon/${size}`, sizes: `${size}x${size}`, type: "image/png", purpose: "any maskable" })),
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=86400" } });
}
