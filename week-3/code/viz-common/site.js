// Page chrome shared by every page: the light/dark theme and MathJax.
// A classic script loaded in <head> without defer, so the theme is stamped before first paint.
(() => {
  const root = document.documentElement;
  const KEY = "nets7976-theme";
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const saved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

  // Always stamp the resolved theme, so charts.js can read it off <html>.
  // Charts bake colours in when they draw, so a change is announced as "themechange"
  // (charts.js re-reads the palette) and then "resize" (each page redraws all its charts).
  // Redrawing empties and refills chart containers, so pin the section in view and put it
  // back once the pages' debounced (200 ms) resize handlers have run.
  function apply(theme, announce) {
    root.dataset.theme = theme;
    if (!announce) return;
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    const anchor = hit && hit.closest("section, header");
    const top = anchor && anchor.getBoundingClientRect().top;
    window.dispatchEvent(new Event("themechange"));
    window.dispatchEvent(new Event("resize"));
    if (anchor) for (const ms of [0, 260, 600]) setTimeout(() => scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: "instant" }), ms);
  }
  apply(saved() || (dark.matches ? "dark" : "light"), false);
  dark.addEventListener("change", (e) => { if (!saved()) apply(e.matches ? "dark" : "light", true); });

  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    const label = () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      btn.innerHTML = `${next === "light" ? SUN : MOON}<span>${next === "light" ? "Light" : "Dark"}</span>`;
      btn.title = btn.ariaLabel = `Switch to ${next} mode`;
    };
    label();
    btn.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, next); } catch {}
      apply(next, true);
      label();
    });
    window.addEventListener("themechange", label);
    const bar = document.querySelector(".site-header .sh-tools") ?? document.getElementById("controls");
    if (bar) bar.appendChild(btn);
    else { btn.classList.add("floating"); document.body.appendChild(btn); }
  });

  // TeX in the page: \( ... \) inline, \[ ... \] displayed. No $ delimiters, so prose is safe.
  window.MathJax = {
    tex: {
      inlineMath: [["\\(", "\\)"]],
      displayMath: [["\\[", "\\]"]],
      macros: {
        Poisson: "\\operatorname{Poisson}",
        Beta: "\\operatorname{Beta}",
        Bernoulli: "\\operatorname{Bernoulli}",
        Normal: "\\operatorname{Normal}",
        Uniform: "\\operatorname{Uniform}",
        argmax: "\\operatorname*{argmax}",
      },
    },
    options: { ignoreHtmlClass: "no-math" },
    chtml: { matchFontHeight: true },
  };
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js";
  s.async = true;
  document.head.appendChild(s);

  // Hover previews (previews.js) load only on pages that have preview links (a.pv, set by the build).
  const here = document.currentScript.src;
  document.addEventListener("DOMContentLoaded", () => {
    if (!document.querySelector("a.pv")) return;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = new URL("previews.css", here).href;
    document.head.appendChild(css);
    import(new URL("previews.js", here).href);
  });
})();
