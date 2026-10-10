// Pieces shared by the layouts. Plain JS string building, so nothing in a page body (TeX braces,
// {{, {%) can be read as template syntax.
import { prereqRef } from "../_config/pages.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Relative path from a page back to the site root ("/concepts/x/" -> "../../"), so the output works
// under any path prefix, like the hand-written links in the articles.
export const rootFrom = (url) => "../".repeat(url.split("/").filter(Boolean).length);

export function head(data, root, { title = data.title, styles = [] } = {}) {
  const css = ["week-3/code/viz-common/styles.css", "week-3/code/viz-common/pages.css", ...styles];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} · NETS 7976</title>
  <script src="${root}week-3/code/viz-common/site.js"></script>
${css.map((c) => `  <link rel="stylesheet" href="${root}${c}" />`).join("\n")}
</head>`;
}

// A preview link, written the way an author would; the link pass fills in href and class.
export const pvLink = (ref, text) => `<a data-pv="${esc(ref.startsWith("wiki:") || ref.includes(":") ? ref : `concept:${ref}`)}">${text}</a>`;

// Display text for a prerequisite: its label, else the concept page's title, else the Wikipedia title.
export function prereqText(q, concepts) {
  if (typeof q === "object" && q.label) return esc(q.label);
  const ref = prereqRef(q);
  if (ref.startsWith("wiki:")) return esc(ref.slice(5));
  return esc(concepts.get(ref)?.data.title ?? ref);
}
