"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Instant feedback on every click: a moving bar at the top and the page dimmed until the next page (or the saved
 * result) arrives. Works for menu links and for save buttons, so the system never looks stuck on a slow connection.
 */
export function Progress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);

  // A new page or new query string means the navigation finished.
  useEffect(() => setBusy(false), [pathname, search]);

  useEffect(() => {
    const main = document.getElementById("main");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = (limitMs: number) => {
      setBusy(true);
      clearTimeout(timer);
      timer = setTimeout(() => setBusy(false), limitMs);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith("/admin") || url.href === location.href) return;
      start(20_000);
    };
    // Saving: the bar stays until the page content changes (the saved result) or 15 s pass.
    const onSubmit = (e: SubmitEvent) => {
      // Attributes, not properties: a field named "method" or "action" would shadow form.method / form.action.
      const form = e.target as HTMLFormElement;
      const method = (form.getAttribute("method") ?? "").toLowerCase();
      const action = form.getAttribute("action") ?? "";
      if (method === "get" && action && !action.startsWith("/admin")) return;
      start(15_000);
    };
    const observer = new MutationObserver(() => setBusy(false));
    if (main) observer.observe(main, { childList: true, subtree: true, characterData: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => { observer.disconnect(); document.removeEventListener("click", onClick, true); document.removeEventListener("submit", onSubmit, true); clearTimeout(timer); };
  }, []);

  useEffect(() => { document.body.classList.toggle("a-busy", busy); }, [busy]);
  return busy ? <div className="a-loading-bar" role="progressbar" aria-label="Loading" /> : null;
}
