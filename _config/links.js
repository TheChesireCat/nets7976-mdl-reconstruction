// The link and citation pass over every built HTML page (docs/redesign-spec.md §5, §7).
//   <a data-pv="concept:<slug>[#section]">, "article:<short>", "wiki:<Title>"
//       gets its href (relative, so it works under the path prefix) and its class.
//   <cite data-ref="<key>"></cite> gets the author–year text (unless it has its own) and a link
//       to the entry in the page's References, which replaces the <!-- references --> marker.
// An unknown target, an uncached Wikipedia title, an unknown citation key or a citation on a page
// with no References marker fails the build. Pages with none of these come out byte for byte.
import { registry } from "./pages.js";
import { loadReferences, authorYear, fullReference } from "./references.js";
import { loadExternal, wikiUrl } from "./external.js";

const rootFrom = (url) => "../".repeat(url.split("/").filter(Boolean).length);

export function linkPass(content, outputPath) {
  if (!outputPath?.endsWith(".html") || !/data-pv=|data-ref=|<!-- references -->/.test(content)) return content;
  const url = this.page.url;
  const root = rootFrom(url);
  const errors = [];
  const refs = loadReferences();
  const external = loadExternal();

  content = content.replace(/<a\b([^>]*?)\sdata-pv="([^"]+)"([^>]*)>/g, (all, pre, key, post) => {
    const attrs = (pre + post).replace(/\s(?:href|class)="[^"]*"/g, "");
    const [kind, rest] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    let href, cls;
    if (kind === "concept") {
      const [slug, frag] = rest.split("#");
      const p = registry.concepts.get(slug);
      if (!p) { errors.push(`unknown concept page "${slug}"`); return all; }
      href = `${root}${p.url.slice(1)}${frag ? `#${frag}` : ""}`; cls = "pv pv-concept-link";
    } else if (kind === "article") {
      const p = registry.byShort.get(rest);
      if (!p || p.data.kind !== "article") { errors.push(`unknown article "${rest}"`); return all; }
      href = `${root}${p.url.slice(1)}`; cls = "pv";
    } else if (kind === "wiki") {
      if (!external[rest]) { errors.push(`Wikipedia title "${rest}" is not in data/external.json (run npm run refresh-wiki)`); return all; }
      href = wikiUrl(external[rest]); cls = "pv ext";
    } else if (kind === "ref") {
      errors.push(`write citations as <cite data-ref="${rest}">, not data-pv="ref:…"`); return all;
    } else { errors.push(`unknown link kind in data-pv="${key}"`); return all; }
    return `<a${attrs} class="${cls}" data-pv="${key}" href="${href}">`;
  });

  const cited = [];
  content = content.replace(/<cite data-ref="([^"]+)">([\s\S]*?)<\/cite>/g, (all, key, text) => {
    const e = refs[key];
    if (!e) { errors.push(`unknown citation key "${key}"`); return all; }
    if (!cited.includes(key)) cited.push(key);
    return `<cite data-ref="${key}"><a class="pv cite" data-pv="ref:${key}" href="#ref-${key}">${text.trim() || authorYear(e).replace(/&/g, "&amp;")}</a></cite>`;
  });

  const page = registry.byUrl.get(url);
  if (content.includes("<!-- references -->")) {
    const readings = page?.data.readings ?? [];
    for (const k of readings) if (!refs[k]) errors.push(`unknown reading "${k}" in front matter`);
    const others = cited.filter((k) => !readings.includes(k));
    const data = others.filter((k) => refs[k]?.type === "dataset");
    const works = others.filter((k) => refs[k]?.type !== "dataset");
    const group = (title, keys) => ((keys = keys.filter((k) => refs[k])), keys.length)
      ? `\n    <h3>${title}</h3>\n    <ol class="refs-list">\n${keys.map((k) => `      <li id="ref-${k}">${fullReference(refs[k])}</li>`).join("\n")}\n    </ol>`
      : "";
    content = content.replace("<!-- references -->", `<section class="references" id="references">\n    <h2>References</h2>${group(readings.length > 1 ? "Readings" : "Reading", readings)}${group("Other works", works)}${group("Data", data)}\n  </section>`);
  } else if (cited.length) errors.push(`cites ${cited.join(", ")} but has no <!-- references --> marker`);

  if (errors.length) throw new Error(`${this.page.inputPath}:\n  ${errors.join("\n  ")}`);
  return content;
}
