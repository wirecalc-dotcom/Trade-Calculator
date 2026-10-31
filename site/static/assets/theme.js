// Runs before the page paints: the visitor's choice from the header toggle ("dark" or "light"), or with none the system
// preference (pass #81). Same logic as THEME_INLINE in src/site/seo.ts.
var theme = null;
try { theme = localStorage.getItem("theme"); } catch (e) { /* storage blocked: the system preference */ }
if (theme === "dark" || (theme !== "light" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.dataset.theme = "dark";
