// Citations (docs/redesign-spec.md §7): entries are CSL-JSON in data/references.json, keyed by id,
// with an extra `note` field (one line on why we cite it) for the citation card.
import fs from "node:fs";

export const loadReferences = () => JSON.parse(fs.readFileSync("data/references.json", "utf8"));

const year = (e) => e.issued?.["date-parts"]?.[0]?.[0] ?? "n.d.";
const families = (e) => (e.author ?? e.editor ?? []).map((a) => a.family ?? a.literal);

// "Peixoto (2025)", "Gelman, Meng & Stern (1996)", "Martin et al. (2016)" (four authors or more).
export function authorYear(e) {
  const f = families(e);
  const who = f.length >= 4 ? `${f[0]} et al.` : f.length === 3 ? `${f[0]}, ${f[1]} & ${f[2]}` : f.join(" & ");
  return `${who} (${year(e)})`;
}

const initials = (given = "") => given.split(/([\s-])/).map((p) => (/^[\s-]$/.test(p) ? (p === "-" ? "-" : " ") : p ? `${p[0]}.` : "")).join("").replace(/\s+/g, " ").trim();
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// One reference as HTML: authors, year, title, venue (journal in italics, or the book's publisher),
// and a DOI or URL link.
export function fullReference(e) {
  const people = (e.author ?? []).map((a) => esc(a.literal ? a.literal : `${a.family}, ${initials(a.given)}`));
  const authors = people.length > 1 ? `${people.slice(0, -1).join(", ")} &amp; ${people.at(-1)}` : people[0] ?? "";
  const title = e.type === "book" ? `<em>${esc(e.title)}</em>` : esc(e.title);
  const where = e["container-title"]
    ? `<em>${esc(e["container-title"])}</em>${e.volume ? ` ${esc(e.volume)}` : ""}${e.issue ? `(${esc(e.issue)})` : ""}${e.page || e.number ? `, ${esc(e.page ?? e.number)}` : ""}`
    : esc(e.publisher ?? "");
  const link = e.DOI ? `https://doi.org/${e.DOI}` : e.URL;
  const linkText = e.DOI ? `doi:${esc(e.DOI)}` : link ? esc(link.replace(/^https?:\/\//, "")) : "";
  return `${authors} (${year(e)}). ${title}.${where ? ` ${where}.` : ""}${link ? ` <a href="${esc(link)}">${linkText}</a>` : ""}`;
}
