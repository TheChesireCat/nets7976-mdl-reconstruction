// The "pages" collection: every Article and Concept page, in reading order (articles by week, then
// `order`; concept pages after them, alphabetically). Building it checks the metadata, and a throw
// here fails the build:
//   - two pages with the same short name;
//   - a prerequisite naming a concept page that doesn't exist;
//   - a loop in the prerequisites.
//   - a "wiki:" prerequisite missing from data/external.json (a stale cache entry only warns).
// Prerequisites are concept slugs or "wiki:<Title>", given as a string or as { ref, label, where }.
// It also fills `registry`, which the link pass (_config/links.js) reads after the collection is built.
import { loadExternal, STALE_DAYS } from "./external.js";

export const registry = { concepts: new Map(), byShort: new Map(), byUrl: new Map() };

export const prereqRef = (q) => (typeof q === "string" ? q : q.ref);
export const conceptSlug = (p) => p.data.slug ?? p.url.match(/^\/concepts\/([^/]+)\/$/)?.[1];

export function pagesCollection(api) {
  const pages = api.getAll().filter((p) => p.data.kind === "article" || p.data.kind === "concept");

  const byShort = new Map();
  for (const p of pages) {
    if (!p.data.short) continue;
    const other = byShort.get(p.data.short);
    if (other) throw new Error(`Duplicate short name "${p.data.short}" in ${p.inputPath} and ${other.inputPath}`);
    byShort.set(p.data.short, p);
  }

  const concepts = new Map(pages.filter((p) => p.data.kind === "concept").map((p) => [conceptSlug(p), p]));
  const external = loadExternal();
  const now = Date.now();
  for (const p of pages) {
    for (const q of p.data.prerequisites ?? []) {
      const ref = prereqRef(q);
      if (ref.startsWith("wiki:")) {
        const e = external[ref.slice(5)];
        if (!e) throw new Error(`Prerequisite "${ref}" in ${p.inputPath} is not in data/external.json (run npm run refresh-wiki)`);
        if (now - Date.parse(e.fetched) > STALE_DAYS * 864e5) console.warn(`[11ty] data/external.json: "${ref.slice(5)}" was fetched ${e.fetched}; refresh with npm run refresh-wiki`);
        continue;
      }
      if (!concepts.has(ref)) {
        throw new Error(`Unknown prerequisite "${ref}" in ${p.inputPath}. Known concept pages: ${[...concepts.keys()].join(", ") || "none yet"}`);
      }
    }
  }

  // Depth-first search for a loop among concept pages (articles can't be prerequisites); report it as a path.
  const state = new Map(); // slug -> "active" | "done"
  const visit = (slug, path) => {
    if (state.get(slug) === "done") return;
    if (state.get(slug) === "active") throw new Error(`Prerequisite loop: ${[...path.slice(path.indexOf(slug)), slug].join(" -> ")}`);
    state.set(slug, "active");
    for (const q of concepts.get(slug).data.prerequisites ?? []) {
      const ref = prereqRef(q);
      if (concepts.has(ref)) visit(ref, [...path, slug]);
    }
    state.set(slug, "done");
  };
  for (const slug of concepts.keys()) visit(slug, []);

  registry.concepts = concepts;
  registry.byShort = byShort;
  registry.byUrl = new Map(pages.map((p) => [p.url, p]));

  const rank = (p) => (p.data.kind === "article" ? [0, p.data.week, p.data.order ?? 0, ""] : [1, 0, 0, conceptSlug(p)]);
  return pages.sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3].localeCompare(y[3]);
  });
}
