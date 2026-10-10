// previews.json: what Hover previews read. One entry per page in the "pages" collection.
export const data = { permalink: "/previews.json", eleventyExcludeFromCollections: true };

export function render({ collections }) {
  const entries = collections.pages.map((p) => ({
    url: this.url(p.url), // with the path prefix, so it matches location.pathname
    kind: p.data.kind,
    slug: p.data.slug,
    title: p.data.title,
    lede: p.data.lede,
    prerequisites: p.data.prerequisites || [],
  }));
  return JSON.stringify(entries, null, 2) + "\n";
}
