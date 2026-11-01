import { ImageResponse } from "next/og";

/** Home-screen icon for the staff app, drawn on the server (PNG, as iOS and Android require). */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = [180, 192, 512].includes(Number((await params).size)) ? Number((await params).size) : 192;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #102f4c, #0e7c7b)", color: "#fff", fontSize: size * 0.34, fontWeight: 800 }}>
        A360
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
