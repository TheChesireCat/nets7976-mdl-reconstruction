// The "pages" collection: every Article and Concept page that has a slug.
// It is also where the prerequisite graph is checked: an unknown slug, a duplicate slug
// or a loop throws, and a throw here fails the build (non-zero exit).
export function pagesCollection(api) {
  const pages = api.getAll().filter((p) => p.data.slug);
  const bySlug = new Map();
  for (const p of pages) {
    const other = bySlug.get(p.data.slug);
    if (other) throw new Error(`Duplicate slug "${p.data.slug}" in ${p.inputPath} and ${other.inputPath}`);
    bySlug.set(p.data.slug, p);
  }
  for (const p of pages) {
    for (const q of p.data.prerequisites || []) {
      if (!bySlug.has(q)) throw new Error(`Unknown prerequisite "${q}" in ${p.inputPath}. Known slugs: ${[...bySlug.keys()].join(", ")}`);
    }
  }
  // Depth-first search for a cycle; report it as a path.
  const state = new Map(); // slug -> "active" | "done"
  const visit = (slug, path) => {
    if (state.get(slug) === "done") return;
    if (state.get(slug) === "active") {
      const loop = [...path.slice(path.indexOf(slug)), slug];
      throw new Error(`Prerequisite loop: ${loop.join(" -> ")}`);
    }
    state.set(slug, "active");
    for (const q of bySlug.get(slug).data.prerequisites || []) visit(q, [...path, slug]);
    state.set(slug, "done");
  };
  for (const slug of bySlug.keys()) visit(slug, []);
  return pages.sort((a, b) => a.url.localeCompare(b.url));
}
