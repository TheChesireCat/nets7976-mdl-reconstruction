// npm run refresh-wiki: cache the Wikipedia summaries the site links to, in data/external.json
// (docs/redesign-spec.md §5, §11). Only titles some page references ("wiki:<Title>" in front matter
// or a data-pv link) that are missing or older than STALE_DAYS are fetched; --all refetches every one.
// Summaries carry formulas only as images from the Wikimedia Math API (announced for shutdown), so the
// TeX is taken from the same formulas in the lead section (action=parse, in the same order) and cards
// typeset it with MathJax. A count mismatch fails: write a hand-written `override` (lede HTML) for that
// entry instead. Overrides are kept across refreshes.
import fs from "node:fs";
import path from "node:path";
import { STALE_DAYS } from "../_config/external.js";

const OUT = "data/external.json";
const UA = "nets7976-course-site/1.0 (https://github.com/TheChesireCat/nets7976-mdl-reconstruction)";
const all = process.argv.includes("--all");

function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || ["node_modules", "_site", "docs", "templates", "data", "scripts"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(html|md)$/.test(e.name)) out.push(p);
  }
  return out;
}

const titles = new Set();
for (const f of sources(".")) {
  for (const m of fs.readFileSync(f, "utf8").matchAll(/wiki:([^"'\]\},\n#]+)/g)) titles.add(m[1].trim());
}

// Replace the k-th <span class="mwe-math-element">…</span> with \( tex[k] \).
function mathToTex(html, tex) {
  let out = "", i = 0, k = 0;
  for (;;) {
    const start = html.indexOf('<span class="mwe-math-element', i);
    if (start < 0) return out + html.slice(i);
    let depth = 0, j = start;
    const re = /<\/?span\b[^>]*>/g;
    re.lastIndex = start;
    for (let m; (m = re.exec(html)); ) {
      depth += m[0][1] === "/" ? -1 : 1;
      if (depth === 0) { j = re.lastIndex; break; }
    }
    const t = tex[k++];
    if (t === undefined) throw new Error("more formulas in the summary than in the lead section");
    out += html.slice(i, start) + `\\(${t}\\)`;
    i = j;
  }
}
const stripDisplay = (a) => a.replace(/^\{\\displaystyle\s*/, "").replace(/\}\s*$/, "").trim();
async function leadTex(title) {
  const q = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&section=0&prop=text&format=json&formatversion=2&redirects=1`;
  const r = await fetch(q, { headers: { "User-Agent": UA } });
  const text = (await r.json()).parse?.text ?? "";
  return [...text.matchAll(/alttext="([^"]*)"/g)].map((m) => stripDisplay(m[1]));
}

const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const stale = (e) => !e || all || Date.now() - Date.parse(e.fetched) > STALE_DAYS * 864e5;
const todo = [...titles].filter((t) => stale(cache[t])).sort();
let failed = 0;
for (const t of todo) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replaceAll(" ", "_"))}?redirect=true`;
  const r = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA } });
  if (!r.ok) { console.error(`  ${t}: HTTP ${r.status}`); failed++; continue; }
  const d = await r.json();
  if (d.type === "disambiguation") { console.error(`  ${t}: is a disambiguation page; link a specific article`); failed++; continue; }
  let lede = d.extract_html;
  if (lede.includes("mwe-math-element")) {
    try { lede = mathToTex(lede, await leadTex(d.title)); }
    catch (err) { console.error(`  ${t}: ${err.message}; write an override`); failed++; continue; }
  }
  cache[t] = {
    title: d.title,
    url: d.content_urls.desktop.page,
    description: d.description ?? null,
    lede,
    thumbnail: d.thumbnail ? { source: d.thumbnail.source, width: d.thumbnail.width, height: d.thumbnail.height } : null,
    fetched: new Date().toISOString().slice(0, 10),
    ...(cache[t]?.override ? { override: cache[t].override } : {}),
  };
  console.log(`  ${t} -> ${d.title}`);
  await new Promise((res) => setTimeout(res, 300)); // stay well under the rate limit
}
for (const t of Object.keys(cache)) if (!titles.has(t)) console.warn(`  ${t}: cached but no page links to it`);
const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
console.log(`${titles.size} titles referenced, ${todo.length} fetched, ${failed} failed -> ${OUT}`);
if (failed) process.exit(1);
