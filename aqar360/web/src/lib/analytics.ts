// Client-side analytics helpers (§20). Events never carry names, phones or emails.
type Params = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

export type AnalyticsEvent =
  | "request_start"
  | "request_submit"
  | "whatsapp_click"
  | "call_click"
  | "content_service_select"
  | "consultation_requested"
  | "map_listing_select";

export function track(event: AnalyticsEvent, params: Params = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

const ATTRIBUTION_KEY = "aqar_attribution";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

/** First-touch attribution for this visit (UTM, landing page, referrer); sent with forms to the CRM (§20.3). */
export function captureAttribution() {
  try {
    if (sessionStorage.getItem(ATTRIBUTION_KEY)) return;
    const url = new URL(window.location.href);
    const data: Record<string, string> = { landing_page: url.pathname.slice(0, 500) };
    for (const key of UTM_KEYS) {
      const value = url.searchParams.get(key);
      if (value) data[key] = value.slice(0, 140);
    }
    if (document.referrer && !document.referrer.startsWith(window.location.origin)) data.referrer = document.referrer.slice(0, 500);
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: forms still work without attribution */
  }
}

export function readAttribution(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || "{}");
  } catch {
    return {};
  }
}

/** Maps a UTM source to the CRM source channel; anything else counts as Website. */
export function sourceChannel(attribution: Record<string, string>) {
  const source = (attribution.utm_source || "").toLowerCase();
  const channels: Record<string, string> = {
    instagram: "Instagram", google: "Google", facebook: "Meta", meta: "Meta", tiktok: "TikTok",
    snapchat: "Snapchat", whatsapp: "WhatsApp", referral: "Referral",
  };
  return channels[source] || "Website";
}
