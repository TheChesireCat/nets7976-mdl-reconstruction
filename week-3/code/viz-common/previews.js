// Hover previews (docs/redesign-spec.md §5), loaded by site.js on pages that have preview links.
// A link is a.pv with data-pv="concept:<slug>[#section]", "article:<short>", "wiki:<Title>" or "ref:<key>";
// the build sets those (see _config/links.js). Everything comes from one prebuilt previews.json, so the
// Reader's browser never calls Wikipedia.
//   Timing (Wikipedia's): start loading after 150 ms over a link, show at 500 ms, close 300 ms after leaving.
//   A preview link inside a card opens a second card beside it; leaving closes the cards beyond the hovered one.
//   Keyboard: focus opens, Escape closes the top card and returns focus to its link.
//   Touch or under 600px: the first tap opens a bottom sheet with an "Open" button; a nested card replaces it.
const TIMING = { dwell: 150, show: 500, grace: 300 };
const INDEX_URL = new URL("../../../previews.json", import.meta.url);
const touch = matchMedia("(hover: none)").matches;
const sheetMode = () => touch || innerWidth < 600;

let index = null;
const loadIndex = () => (index ??= fetch(INDEX_URL).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).catch(() => ({ pages: {}, wiki: {}, refs: {} })));

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function lookup(key) {
  const ix = await loadIndex();
  const kind = key.slice(0, key.indexOf(":"));
  const rest = key.slice(key.indexOf(":") + 1);
  if (kind === "wiki") { const w = ix.wiki[rest]; return w && { kind, ...w }; }
  if (kind === "ref") { const r = ix.refs[rest]; return r && { kind, key: rest, ...r }; }
  const page = ix.pages[`${kind}:${rest.split("#")[0]}`];
  return page && { ...page, url: page.url + (rest.includes("#") ? `#${rest.split("#")[1]}` : "") };
}

// A preview link inside a card (a prerequisite on the "Needs" line).
function innerLink(ref, ix) {
  if (ref.startsWith("wiki:")) {
    const w = ix.wiki[ref.slice(5)];
    return `<a class="pv ext" data-pv="${esc(ref)}" href="${esc(w?.url ?? "#")}">${esc(w?.title ?? ref.slice(5))}</a>`;
  }
  const p = ix.pages[`concept:${ref}`];
  return `<a class="pv pv-concept-link" data-pv="concept:${esc(ref)}" href="${esc(p?.url ?? "#")}">${esc(p?.title ?? ref)}</a>`;
}

function body(d, ix) {
  if (d.kind === "wiki") {
    const thumb = d.thumbnail ? `<img class="pv-thumb" src="${esc(d.thumbnail.source)}" alt="" width="${d.thumbnail.width}" height="${d.thumbnail.height}" />` : "";
    return `<div class="pv-wiki">${thumb}<h4>${esc(d.title)}</h4>${d.description ? `<p class="pv-desc">${esc(d.description)}</p>` : ""}
      <div class="pv-extract">${d.override ?? d.lede}</div>
      <p class="pv-src"><span class="pv-w" aria-hidden="true">W</span> From Wikipedia${d.override ? ", adapted" : ""}, CC BY-SA 4.0</p></div>`;
  }
  if (d.kind === "ref") {
    return `<div class="pv-ref"><p class="pv-kind">Citation</p><p class="pv-full">${d.html}</p>${d.note ? `<p class="pv-note">${d.note}</p>` : ""}</div>`;
  }
  if (d.kind === "concept") {
    const needs = d.prerequisites?.length ? `<p class="pv-pre"><span>Needs</span> ${d.prerequisites.map((r) => innerLink(r, ix)).join(", ")}</p>` : "";
    return `<div class="pv-concept"><p class="pv-kind">Concept page${d.stub ? ", stub" : ""}</p><h4>${esc(d.title)}</h4>
      <p class="pv-lede">${d.lede}</p>${d.equation ? `<div class="pv-eq">\\[ ${d.equation} \\]</div>` : ""}${needs}</div>`;
  }
  const readings = (d.readings ?? []).filter(Boolean);
  return `<div class="pv-article"><p class="pv-kind">Week ${esc(d.week)} article</p><h4>${esc(d.title)}</h4>
    <p class="pv-lede">${d.lede}</p>${readings.length ? `<p class="pv-reading">Reading: ${readings.map(esc).join("; ")}</p>` : ""}</div>`;
}

const OPEN_LABEL = { wiki: "Read on Wikipedia", article: "Open the article", concept: "Open the concept page", ref: "Go to the reference" };
const typeset = (n) => window.MathJax?.typesetPromise?.([n]).catch(() => {});

// ---------- cards ----------
const stack = []; // open cards, outermost first
function makeCard(d, anchor, parent, ix) {
  const card = document.createElement("div");
  card.className = `pv-card pv-${d.kind}-card`;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", `Preview: ${d.title ?? d.short ?? "citation"}`);
  const href = d.kind === "ref" ? `#ref-${d.key}` : d.url;
  card.innerHTML = `<div class="pv-body">${body(d, ix)}</div><a class="pv-go" href="${esc(href)}">${OPEN_LABEL[d.kind]}</a>`;
  card._anchor = anchor;
  card._parent = parent;
  card.addEventListener("pointerenter", cancelClose);
  card.addEventListener("pointerleave", scheduleClose);
  card.addEventListener("click", (e) => { if (e.target.closest(".pv-go")) closeFrom(0); });
  return card;
}

function place(card, anchor) {
  if (sheetMode()) return; // bottom sheet, fixed by CSS
  const rects = [...anchor.getClientRects()];
  const r = rects.find((x) => x.top <= lastPointer.y && lastPointer.y <= x.bottom) ?? rects[0] ?? anchor.getBoundingClientRect();
  const w = card.offsetWidth, h = card.offsetHeight;
  const sx = scrollX, sy = scrollY;
  if (card._parent) { // nested: beside the parent card, right if there's room
    const pr = card._parent.getBoundingClientRect();
    const right = pr.right + 12 + w < innerWidth;
    card.style.left = `${(right ? pr.right + 12 : Math.max(8, pr.left - 12 - w)) + sx}px`;
    card.style.top = `${Math.max(8, Math.min(r.top - 20, innerHeight - h - 8)) + sy}px`;
    return;
  }
  const flipX = r.left + r.width / 2 > innerWidth / 2;
  const flipY = r.top > innerHeight / 2;
  const left = Math.max(8, Math.min(flipX ? r.right - w : r.left, innerWidth - w - 8));
  card.style.left = `${left + sx}px`;
  card.style.top = `${(flipY ? r.top - h - 8 : r.bottom + 8) + sy}px`;
  card.classList.toggle("above", flipY);
}

async function open(anchor) {
  const parentCard = anchor.closest(".pv-card");
  const depth = parentCard && !sheetMode() ? stack.indexOf(parentCard) + 1 : 0;
  if (stack[depth]?._anchor === anchor) return;
  const [d, ix] = await Promise.all([lookup(anchor.dataset.pv), loadIndex()]);
  if (!d) return;
  closeFrom(depth);
  const card = makeCard(d, anchor, depth ? parentCard : null, ix);
  document.body.appendChild(card);
  stack.push(card);
  if (sheetMode()) document.body.classList.add("pv-sheet-open");
  place(card, anchor);
  for (const img of card.querySelectorAll("img")) img.addEventListener("load", () => place(card, anchor), { once: true });
  await typeset(card);
  place(card, anchor);
  requestAnimationFrame(() => card.classList.add("in"));
}

function closeFrom(i) {
  if (i < 0) return;
  for (const c of stack.splice(i)) c.remove();
  if (!stack.length) document.body.classList.remove("pv-sheet-open");
}

// ---------- timing ----------
let dwell = null, closer = null;
const lastPointer = { x: 0, y: 0 };
function cancelClose() { clearTimeout(closer); closer = null; }
function scheduleClose() {
  if (sheetMode()) return;
  cancelClose();
  closer = setTimeout(() => {
    const hovered = stack.findIndex((c) => c.matches(":hover") || c.contains(document.activeElement));
    closeFrom(hovered + 1);
  }, TIMING.grace);
}
function intend(anchor) {
  clearTimeout(dwell);
  cancelClose();
  const t0 = performance.now();
  dwell = setTimeout(() => {
    lookup(anchor.dataset.pv).then(() => setTimeout(() => open(anchor), Math.max(0, TIMING.show - (performance.now() - t0))));
  }, TIMING.dwell);
}
function abandon() { clearTimeout(dwell); scheduleClose(); }

document.addEventListener("pointermove", (e) => { lastPointer.x = e.clientX; lastPointer.y = e.clientY; }, { passive: true });
document.addEventListener("pointerover", (e) => { if (sheetMode() || e.pointerType === "touch") return; const a = e.target.closest("a.pv"); if (a) intend(a); });
document.addEventListener("pointerout", (e) => { if (sheetMode()) return; const a = e.target.closest("a.pv"); if (a && !a.contains(e.relatedTarget)) abandon(); });
document.addEventListener("focusin", (e) => { const a = e.target.closest?.("a.pv"); if (a && !sheetMode()) { const r = a.getBoundingClientRect(); lastPointer.y = r.top + 1; intend(a); } });
document.addEventListener("focusout", (e) => { const a = e.target.closest?.("a.pv"); if (a && !e.relatedTarget?.closest?.(".pv-card")) abandon(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !stack.length) return;
  const top = stack[stack.length - 1];
  closeFrom(stack.length - 1);
  top._anchor?.focus?.();
});
// Touch and narrow screens: the first tap previews, the card's button navigates, tapping outside closes.
document.addEventListener("click", (e) => {
  const a = e.target.closest("a.pv");
  if (a && sheetMode() && !e.target.closest(".pv-go")) { e.preventDefault(); open(a); return; }
  if (stack.length && !e.target.closest(".pv-card")) closeFrom(0);
});
addEventListener("resize", () => { if (!sheetMode()) closeFrom(0); });
