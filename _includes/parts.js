// Pieces shared by the layouts. Plain JS string building: no template language anywhere,
// so nothing in a page body (TeX braces, {{, {%) can be read as template syntax.

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Relative path from a page back to the site root ("/week-4/code/x/" -> "../../../"),
// so the output works under any path prefix, exactly like today's hand-written links.
export const rootFrom = (url) => "../".repeat(url.split("/").filter(Boolean).length);

export function head(data, root) {
  const css = ["week-3/code/viz-common/styles.css", ...(data.stylesheets || [])];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(data.htmlTitle || data.title)}</title>
  <script src="${root}week-3/code/viz-common/site.js"></script>
${css.map((c) => `  <link rel="stylesheet" href="${root}${c}" />`).join("\n")}
</head>`;
}

// The "Before you start" list, from the page's prerequisites (slugs of other pages).
export function beforeYouStart(data, root) {
  const prereqs = data.prerequisites || [];
  if (!prereqs.length) return "";
  const bySlug = new Map((data.collections.pages || []).map((p) => [p.data.slug, p]));
  const items = prereqs.map((slug) => {
    const p = bySlug.get(slug);
    return `<li><a class="inline" href="${root}${p.url.slice(1)}">${esc(p.data.title)}</a></li>`;
  });
  return `
        <aside class="before-you-start" aria-label="Before you start">
          <h2>Before you start</h2>
          <ul>
            ${items.join("\n            ")}
          </ul>
        </aside>`;
}

// Header of an Article or Concept page, from front matter. The lede is author-written HTML (may hold TeX).
export function pageHeader(data, root) {
  const eyebrow = data.kind === "concept" ? "Concept" : `Week ${esc(data.week)} · ${esc(data.reading)}`;
  return `<header class="hero">
        <div class="eyebrow">${eyebrow}</div>
        <h1>${esc(data.title)}</h1>
        <p class="lede">${data.lede}</p>${beforeYouStart(data, root)}
      </header>`;
}
