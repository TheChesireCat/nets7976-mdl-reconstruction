// previews.json: what hover previews read (docs/redesign-spec.md §5). One entry per page in the "pages" collection.
import { conceptSlug, prereqRef } from "./_config/pages.js";

export const data = { permalink: "/previews.json", eleventyExcludeFromCollections: true };

export function render({ collections }) {
  const entries = collections.pages.map((p) => ({
    url: this.url(p.url), // with the path prefix, so it matches location.pathname
    kind: p.data.kind,
    slug: p.data.kind === "concept" ? conceptSlug(p) : undefined,
    short: p.data.short,
    title: p.data.title,
    lede: p.data.lede,
    equation: p.data.equation,
    prerequisites: (p.data.prerequisites ?? []).map(prereqRef),
    week: p.data.week,
    readings: p.data.readings,
    stub: p.data.stub,
  }));
  return JSON.stringify(entries, null, 2) + "\n";
}
