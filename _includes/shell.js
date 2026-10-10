// The site shell (docs/redesign-spec.md §8): the slim header and the footer on every generated page,
// the article header, the route and its strips, and the pager. Plain JS string building.
import fs from "node:fs";
import { esc, pvLink, prereqText } from "./parts.js";
import { registry, prereqRef } from "../_config/pages.js";
import { loadReferences, authorYear } from "../_config/references.js";

export const weeks = () => JSON.parse(fs.readFileSync("data/weeks.json", "utf8"));
const REPO = "https://github.com/TheChesireCat/nets7976-mdl-reconstruction";
const ORIGINAL = "https://github.com/chethan749/nets7976-mdl-reconstruction";

// Not fixed while scrolling: it scrolls away, so it never competes with the section pill.
export const siteHeader = (root) => `<a class="skip-link" href="#main">Skip to the article</a>
<header class="site-header">
  <a class="sh-home" href="${root}">NETS 7976</a>
  <nav class="sh-nav" aria-label="Site"><a href="${root}">Contents</a><a href="${root}concepts/">Concepts</a></nav>
  <span class="sh-tools"></span>
</header>`;

export const siteFooter = () => `<footer class="site-footer">
  <p>Source: <a href="${REPO}">TheChesireCat/nets7976-mdl-reconstruction</a>, after the original by <a href="${ORIGINAL}">chethan749</a>.</p>
</footer>`;

const readingText = (keys) => {
  const refs = loadReferences();
  return keys.filter((k) => refs[k]).map((k) => `<a href="#ref-${k}">${esc(authorYear(refs[k]))}</a>`).join("; ");
};

// Title, lede, the byline (Week, Reading, Before you start) and the one shortcut line.
export function articleHeader(data) {
  const prereqs = data.prerequisites ?? [];
  const before = prereqs.map((q) => {
    const where = typeof q === "object" && q.where ? ` (${esc(q.where)})` : "";
    return `${pvLink(prereqRef(q), prereqText(q, registry.concepts))}${where}`;
  });
  const readings = data.readings ?? [];
  const shortcut = data.shortcut ? `\n  <p class="a-shortcut"><a href="${esc(data.shortcut.to)}">${data.shortcut.text}</a></p>` : "";
  return `<header class="a-title">
  <h1>${esc(data.title)}</h1>
  <p class="a-lede">${data.lede}</p>
  <dl class="a-byline">
    <div><dt>Week ${esc(data.week)}</dt><dd>${esc(weeks()[data.week] ?? "")}</dd></div>
    ${readings.length ? `<div><dt>${readings.length > 1 ? "Readings" : "Reading"}</dt><dd>${readingText(readings)}</dd></div>` : ""}
    ${before.length ? `<div><dt>Before you start</dt><dd>${before.join(", ")}</dd></div>` : ""}
  </dl>${shortcut}
</header>`;
}

const TAG = (t) => (t ? `<span class="tag ${esc(t.kind)}">${t.text}</span>` : "");
export const routeSteps = (data) => (data.route?.groups ?? []).flatMap((g) => g.steps);

// The route: one row per section (number, verb, math, tag), in groups; numbering runs across groups.
export function route(data) {
  if (!data.route) return "";
  let n = 0;
  const groups = data.route.groups.map((g) => {
    const start = n + 1;
    const rows = g.steps.map((s) => {
      n++;
      return `    <li><a href="#${esc(s.id)}"><span class="rt-n">${n}</span><span class="rt-what"><b>${s.verb}</b>${s.math ? ` ${s.math}` : ""}</span>${TAG(s.tag)}</a></li>`;
    });
    return `  <h3 class="rt-group">${g.title}</h3>\n  <ol class="rt-steps"${start > 1 ? ` start="${start}"` : ""}>\n${rows.join("\n")}\n  </ol>`;
  });
  return `<nav class="rtA" id="route" aria-label="The route through this page">
  <h2 class="rt-h">The route through this page</h2>
  ${data.route.intro ? `<p class="rt-intro">${data.route.intro}</p>` : ""}
${groups.join("\n")}
</nav>`;
}

// One line under a section heading: previous step → current step (with its math and tag) → next step.
export function strip(data, id) {
  const steps = routeSteps(data);
  const i = steps.findIndex((s) => s.id === id);
  const s = steps[i], prev = steps[i - 1], next = steps[i + 1];
  const part = (cls, k, st, extra = "") => `<a class="rt-s ${cls}" href="#${esc(st.id)}"><span class="rt-n">§${k + 1}</span> ${st.step}${extra}</a>`;
  return `<div class="rt-strip" aria-label="Where this section sits on the route">${prev ? part("prev", i - 1, prev) : ""}<span class="rt-s now"><span class="rt-n">§${i + 1}</span> ${s.step}${s.math ? ` ${s.math}` : ""}${TAG(s.tag)}</span>${next ? part("next", i + 1, next) : ""}</div>`;
}

// Previous / next article in reading order, previewed on hover.
export function pager(data, pages) {
  const arts = pages.filter((p) => p.data.kind === "article");
  const i = arts.findIndex((p) => p.data.short === data.short);
  const side = (p, cls, label) => {
    if (!p) return "<span></span>";
    const refs = loadReferences();
    const r = (p.data.readings ?? []).filter((k) => refs[k]).map((k) => authorYear(refs[k])).join("; ");
    return `<div class="pg ${cls}"><span class="pg-k">${label}</span>${pvLink(`article:${p.data.short}`, esc(p.data.title))}${r ? `<span class="pg-r">${esc(r)}</span>` : ""}</div>`;
  };
  return `<nav class="pager" aria-label="Previous and next article">
  ${side(arts[i - 1], "pg-prev", "← Previous")}
  ${side(arts[i + 1], "pg-next", "Next →")}
</nav>`;
}
