// The contents page (docs/redesign-spec.md §8): the site's front page, read as the textbook's table of
// contents. Generated from front matter: the articles in reading order, grouped by week and numbered across
// weeks, each with its reading, lede and route (or, before an article has a route, its section titles).
import fs from "node:fs";
import { esc, head, rootFrom, pvLink } from "./_includes/parts.js";
import { siteHeader, siteFooter, weeks, routeSteps } from "./_includes/shell.js";
import { loadReferences, authorYear } from "./_config/references.js";

export const data = { kind: "index", title: "Contents", permalink: "/", eleventyExcludeFromCollections: true };

// Section ids, numbers and titles from an article's source, for articles without a route yet.
function sectionsOf(p) {
  const src = fs.readFileSync(p.inputPath, "utf8");
  return [...src.matchAll(/<section\b[^>]*\bid="([^"]+)"[^>]*>\s*<div class="sec-head"><span class="sec-num">(\d+)<\/span><h2>([\s\S]*?)<\/h2>/g)]
    .map((m) => ({ id: m[1], num: +m[2], title: m[3].replace(/<[^>]+>/g, "") }))
    .filter((s) => s.num > 0);
}

export function render(data) {
  const root = rootFrom(data.page.url);
  const refs = loadReferences();
  const arts = (data.collections.pages ?? []).filter((p) => p.data.kind === "article");
  const nConcepts = (data.collections.pages ?? []).filter((p) => p.data.kind === "concept").length;
  let n = 0;
  const byWeek = Map.groupBy(arts, (p) => p.data.week);
  const weekBlocks = [...byWeek].map(([week, ps]) => {
    const items = ps.map((p) => {
      n++;
      const url = `${root}${p.url.slice(1)}`;
      const reading = (p.data.readings ?? []).filter((k) => refs[k]).map((k) => {
        const e = refs[k];
        return `${esc(authorYear(e))}${e["container-title"] ? `, <em>${esc(e["container-title"])}</em>` : ""}`;
      }).join("; ");
      const steps = routeSteps(p.data);
      const secs = steps.length
        ? steps.map((s, i) => `<li><a href="${url}#${esc(s.id)}"><span class="rt-n">${i + 1}</span> ${s.verb}</a></li>`)
        : sectionsOf(p).map((s) => `<li><a href="${url}#${esc(s.id)}"><span class="rt-n">${s.num}</span> ${esc(s.title)}</a></li>`);
      return `      <li class="toc-art">
        <h3><span class="toc-n">${n}</span>${pvLink(`article:${p.data.short}`, esc(p.data.title))}</h3>
        ${reading ? `<p class="toc-reading">${p.data.readings.length > 1 ? "Readings" : "Reading"}: ${reading}</p>` : ""}
        <p class="toc-lede">${p.data.lede}</p>
        <ol class="toc-secs">${secs.join("")}</ol>
      </li>`;
    });
    return `    <section class="toc-week">
      <h2><span class="toc-wk">Week ${esc(week)}</span> ${esc(weeks()[week] ?? "")}</h2>
      <ol class="toc-arts">
${items.join("\n")}
      </ol>
    </section>`;
  });
  return `${head(data, root, { title: "MDL, network reconstruction and message passing" })}
<body>
${siteHeader(root)}
  <main id="main" class="page toc">
    <header class="c-head">
      <p class="c-kind">NETS 7976, a directed study, Fall 2026</p>
      <h1>MDL, network reconstruction and message passing</h1>
      <p class="lede">Interactive companions to the readings, written to be learned from like a textbook. Each article follows one paper, or a topic the papers assume, one step at a time, and shows which probability distribution you are holding at every point.</p>
      <p class="toc-reader">Written for a first-year graduate student from another field. The articles assume calculus, linear algebra and introductory probability; anything beyond that is explained on the page, on one of our concept pages, or on Wikipedia.</p>
    </header>
${weekBlocks.join("\n")}
    <section class="toc-week">
      <h2>Concepts</h2>
      <p>The ideas the articles lean on have pages of their own. <a href="${root}concepts/">All ${nConcepts} concept pages</a></p>
    </section>
  </main>
${siteFooter()}
</body>
</html>
`;
}
