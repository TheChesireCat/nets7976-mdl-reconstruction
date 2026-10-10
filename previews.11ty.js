// previews.json: everything hover previews read (docs/redesign-spec.md §5), fetched once per page view.
//   pages: our Articles and Concept pages, keyed "concept:<slug>" / "article:<short>"
//   wiki:  cached Wikipedia summaries (data/external.json), keyed by title
//   refs:  citation cards (data/references.json), keyed by id
import { conceptSlug, prereqRef } from "./_config/pages.js";
import { loadExternal } from "./_config/external.js";
import { loadReferences, authorYear, fullReference } from "./_config/references.js";

export const data = { permalink: "/previews.json", eleventyExcludeFromCollections: true };

export function render({ collections }) {
  const pages = {};
  for (const p of collections.pages) {
    const key = p.data.kind === "concept" ? `concept:${conceptSlug(p)}` : `article:${p.data.short}`;
    pages[key] = {
      url: this.url(p.url), // with the path prefix, so it can be followed from any page
      kind: p.data.kind,
      title: p.data.title,
      lede: p.data.lede,
      equation: p.data.equation,
      prerequisites: (p.data.prerequisites ?? []).map(prereqRef),
      week: p.data.week,
      readings: (p.data.readings ?? []).map((k) => loadReferences()[k] && authorYear(loadReferences()[k])),
      stub: p.data.stub,
    };
  }
  const wiki = loadExternal();
  const refs = Object.fromEntries(Object.entries(loadReferences()).map(([k, e]) => [k, { short: authorYear(e), html: fullReference(e), note: e.note }]));
  return JSON.stringify({ pages, wiki, refs }, null, 2) + "\n";
}
