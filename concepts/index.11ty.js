// /concepts/: every concept page, alphabetically, with its lede and how many articles use it
// (docs/redesign-spec.md §8). Generated; stubs are listed like the others.
import { esc, head, rootFrom, pvLink } from "../_includes/parts.js";
import { backlinks } from "../_config/backlinks.js";

export const data = { kind: "index", layout: false, title: "Concepts", permalink: "/concepts/", eleventyExcludeFromCollections: true };

export function render(data) {
  const root = rootFrom(data.page.url);
  const concepts = (data.collections.pages ?? []).filter((p) => p.data.kind === "concept").sort((a, b) => a.data.title.localeCompare(b.data.title));
  const rows = concepts.map((p) => {
    const n = backlinks(p.data.slug, data.collections.pages).filter((u) => u.page.data.kind === "article").length;
    return `        <li>
          <h2>${pvLink(`concept:${p.data.slug}`, esc(p.data.title))}</h2>
          <p>${p.data.lede}</p>
          <p class="muted">${n === 0 ? "Not used by an article yet" : `Used in ${n} article${n === 1 ? "" : "s"}`}</p>
        </li>`;
  });
  return `${head(data, root)}
<body>
  <main class="page concepts-index">
    <header class="c-head">
      <h1>Concepts</h1>
      <p class="lede">The ideas the course leans on, one page per family of methods. Everything else links to Wikipedia.</p>
    </header>
    <ol class="c-list">
${rows.join("\n")}
    </ol>
  </main>
</body>
</html>
`;
}
