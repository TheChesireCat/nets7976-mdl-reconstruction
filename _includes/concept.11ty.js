// Layout for a Concept page (docs/redesign-spec.md §4): the notation line, title, lede and
// Prerequisites from front matter; the Markdown body (Intuition, Formal statement, Worked example);
// then the generated "Used in the course" backlinks and "Going further" external references.
// A stub has only the lede, prerequisites, backlinks and a "to be written" note.
import { siteHeader, siteFooter } from "./shell.js";
import { esc, head, rootFrom, pvLink, prereqText } from "./parts.js";
import { backlinks } from "../_config/backlinks.js";
import { registry, prereqRef } from "../_config/pages.js";

export default function (data) {
  const root = rootFrom(data.page.url);
  const prereqs = data.prerequisites ?? [];
  const needs = prereqs.length
    ? `<p class="c-needs"><span>Prerequisites</span> ${prereqs.map((q) => pvLink(prereqRef(q), prereqText(q, registry.concepts))).join(", ")}</p>`
    : "";
  const uses = backlinks(data.slug, data.collections.pages ?? []);
  const used = uses.length
    ? `<ul>\n${uses.map(({ page: p, sections }) => {
        const where = sections.length
          ? `: ${sections.map((s) => `<a href="${root}${p.url.slice(1)}#${s.id}">${s.num ? `§${s.num} ` : ""}${esc(s.title)}</a>`).join(", ")}`
          : "";
        const label = p.data.kind === "article" ? `Week ${esc(p.data.week)}, ${pvLink(`article:${p.data.short}`, esc(p.data.title))}` : pvLink(`concept:${p.data.slug}`, esc(p.data.title));
        return `          <li>${label}${where}</li>`;
      }).join("\n")}\n        </ul>`
    : `<p class="muted">No article links here yet.</p>`;
  const further = (data.further ?? []).length
    ? `
      <section class="c-sec" id="going-further">
        <h2>Going further</h2>
        <ul>
${data.further.map((r) => `          <li>${pvLink(r, esc(r.replace(/^wiki:/, "")))}${r.startsWith("wiki:") ? " on Wikipedia" : ""}</li>`).join("\n")}
        </ul>
      </section>`
    : "";
  return `${head(data, root)}
<body>
${siteHeader(root)}
  <main id="main" class="page concept-page">
    <article class="c-article">
      <header class="c-head">
        <p class="c-kind">Concept page${data.stub ? ", stub" : ""}</p>
        <h1>${esc(data.title)}</h1>
        ${data.notation ? `<p class="c-notation"><span>Notation</span> ${data.notation}</p>` : ""}
        <p class="lede">${data.lede}</p>
        ${needs}
      </header>
${data.stub ? `      <p class="c-stub">This page is a stub: its intuition, formal statement and worked example are still to be written.</p>\n` : ""}${data.content}
      <section class="c-sec" id="used-in-the-course">
        <h2>Used in the course</h2>
        ${used}
      </section>${further}
    </article>
  </main>
${siteFooter()}
</body>
</html>
`;
}
