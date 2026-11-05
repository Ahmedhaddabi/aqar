export const THEME_KEY = "aq-admin-theme";

/** Runs before the first paint: the person's saved light/dark choice (light until they pick dark), so the page never flashes. */
export const THEME_SCRIPT = `try{document.documentElement.dataset.theme=localStorage.getItem("${THEME_KEY}")||"light"}catch(e){}`;
