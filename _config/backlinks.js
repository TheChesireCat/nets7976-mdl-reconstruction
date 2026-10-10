// Backlinks (docs/redesign-spec.md §4): for a concept page, every article section that links to it
// with data-pv="concept:<slug>", plus every page that lists it as a prerequisite. Read from the
// article sources, so it doesn't depend on the order Eleventy renders pages in.
import fs from "node:fs";
import { prereqRef } from "./pages.js";

const sectionsOf = new Map(); // inputPath -> [{ id, num, title, concepts: Set }]
function sections(p) {
  if (!sectionsOf.has(p.inputPath)) {
    const src = fs.readFileSync(p.inputPath, "utf8");
    const out = [];
    for (const m of src.matchAll(/<section\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
      const h2 = m[2].match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "";
      const num = m[2].match(/class="(?:sec-num|kicker)">(\d+)</)?.[1];
      const title = h2.replace(/<span class="(?:sec-num|kicker)">\d+<\/span>/, "").replace(/<[^>]+>/g, "").trim();
      out.push({ id: m[1], num, title, concepts: new Set([...m[2].matchAll(/data-pv="concept:([^"#]+)/g)].map((x) => x[1])) });
    }
    sectionsOf.set(p.inputPath, out);
  }
  return sectionsOf.get(p.inputPath);
}

export function backlinks(slug, pages) {
  const out = [];
  for (const p of pages) {
    if (p.data.kind === "concept" && conceptSlugOf(p) === slug) continue;
    const viaPrereq = (p.data.prerequisites ?? []).some((q) => prereqRef(q) === slug);
    const secs = p.data.kind === "article" ? sections(p).filter((s) => s.concepts.has(slug)) : [];
    if (viaPrereq || secs.length) out.push({ page: p, sections: secs, viaPrereq });
  }
  return out;
}
const conceptSlugOf = (p) => p.data.slug ?? p.url.match(/^\/concepts\/([^/]+)\/$/)?.[1];
