// PROTOTYPE (throwaway): three hover-preview designs for prototype-hover.html, chosen with ?variant=A|B|C.
//   A  Card: one Wikipedia-style card under the link. 150 ms dwell, shown at 500 ms, 300 ms grace. No nesting.
//   B  Windows: Gwern-style popups with a title bar and more content. 750 ms. Links inside open a window beside it.
//   C  Margin: the preview appears in the notes margin beside the link, like a sidenote, and stays until replaced.
// Every variant: focus opens (keyboard), Escape closes, and on touch the first tap previews and the card's
// "Open" button goes to the page. Wikipedia summaries are fetched live; our pages come from the index below.

// ---------- the preview index: what a build script would write (Summary-shaped) ----------
const INDEX = {
  "concept:marginalization": {
    kind: "concept", title: "Marginalizing a latent variable", url: "#", stub: true,
    lede: "When a model has an unknown you never observe, like which group a pair belongs to, you can remove it by summing the joint probability over every value it could take. What is left is the likelihood of what you did observe.",
    eq: String.raw`\[ p(x \mid \theta) = \sum_{z} p(x, z \mid \theta) \]`,
    prereqs: [["wiki:Bayes%27_theorem", "Bayes' rule"], ["wiki:Marginal_distribution", "Marginal distribution"]],
    usedIn: [["Martin et al.", "§4, Summing out the network"], ["This primer", "§3 and §5"], ["Young et al.", "§4, Sampling θ"]],
  },
  "concept:markov-chain-monte-carlo": {
    kind: "concept", title: "Markov chain Monte Carlo (MCMC)", url: "#", stub: true,
    lede: "A way to draw from a distribution you can only evaluate up to a constant: build a random walk whose long-run positions are distributed like the target, and average over the walk instead of over independent draws.",
    eq: String.raw`\[ \tfrac{1}{M} \textstyle\sum_{m} f(\theta^{(m)}) \;\to\; \mathbb{E}[f(\theta)] \]`,
    prereqs: [["wiki:Monte_Carlo_method", "Monte Carlo method"], ["wiki:Markov_chain", "Markov chain"]],
    usedIn: [["This primer", "§4, Metropolis vs. HMC"], ["Young et al.", "§4"], ["Newman", "§5"]],
  },
  "concept:label-switching": {
    kind: "concept", title: "Label switching", url: "#", stub: true,
    lede: "In a model that sorts things into unnamed groups, swapping the groups' names gives exactly the same fit. A sampler can wander between those mirror images, so averages taken across them mix the groups together.",
    eq: null,
    prereqs: [["concept:markov-chain-monte-carlo", "Markov chain Monte Carlo"], ["wiki:Mixture_model", "Mixture model"]],
    usedIn: [["This primer", "§6, Symmetry and label switching"]],
  },
  "article:young": {
    kind: "article", title: "Who swims with whom, and how sure are we?", url: "../young-viz/",
    week: "Week 4", reading: "Young, Cantwell and Newman (2020)",
    lede: "Thirteen male bottlenose dolphins, and a count of how often each pair was seen swimming together. Young, Cantwell and Newman turn those counts into a posterior over networks.",
    sections: ["The dolphin data", "Three modelling choices", "Sampling θ with the network summed out", "Networks from θ", "Is it a good fit?", "Weak and strong ties", "Full Bayes vs. EM"],
  },
};

const VARIANT = (() => { const v = (new URLSearchParams(location.search).get("variant") || "A").toUpperCase(); return "ABC".includes(v) ? v : "A"; })();
const NAMES = { A: "Card (Wikipedia-style)", B: "Windows (Gwern-style, nested)", C: "In the margin" };
const TIMING = { A: { dwell: 150, show: 500, grace: 300 }, B: { dwell: 150, show: 750, grace: 300 }, C: { dwell: 150, show: 300, grace: Infinity } }[VARIANT];
const touch = matchMedia("(hover: none)").matches;
const narrow = () => innerWidth < 1061;
document.body.classList.add(`pv-${VARIANT}`);

// ---------- content ----------
const wikiCache = new Map();
function fetchWiki(title) {
  if (!wikiCache.has(title)) {
    wikiCache.set(title, fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, {
      headers: { "Api-User-Agent": "nets7976-course-site/0.1 (prototype; github.com/TheChesireCat/nets7976-mdl-reconstruction)" },
    }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((d) => ({
      kind: "wiki", title: d.title, url: d.content_urls.desktop.page, description: d.description,
      html: d.extract_html, thumb: d.thumbnail, lede: d.extract,
    })).catch(() => ({ kind: "wiki", title: decodeURIComponent(title).replace(/_/g, " "), url: `https://en.wikipedia.org/wiki/${title}`, error: true })));
  }
  return wikiCache.get(title);
}
const load = (key) => (key.startsWith("wiki:") ? fetchWiki(key.slice(5)) : Promise.resolve(INDEX[key]));

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pvLink = ([key, text]) => `<a class="pv${key.startsWith("wiki:") ? " ext" : ""}" data-pv="${key}" href="${key.startsWith("wiki:") ? `https://en.wikipedia.org/wiki/${key.slice(5)}` : INDEX[key]?.url ?? "#"}">${esc(text)}</a>`;

// full: B's windows show more (prerequisites as links, backlinks, an article's contents)
function body(d, full) {
  if (d.kind === "wiki") {
    if (d.error) return `<div class="pv-wiki"><h4>${esc(d.title)}</h4><p class="pv-err">Couldn't reach Wikipedia. The link still works.</p></div>`;
    const thumb = d.thumb ? `<img class="pv-thumb" src="${d.thumb.source}" alt="" width="${d.thumb.width}" height="${d.thumb.height}" />` : "";
    return `<div class="pv-wiki">${thumb}<h4>${esc(d.title)}</h4>${d.description ? `<p class="pv-desc">${esc(d.description)}</p>` : ""}
      <div class="pv-extract">${d.html}</div>
      <p class="pv-src"><span class="pv-w">W</span> From Wikipedia, CC BY-SA 4.0</p></div>`;
  }
  if (d.kind === "concept") {
    const pre = `<p class="pv-pre"><span>Needs</span> ${d.prereqs.map(pvLink).join(", ")}</p>`;
    const used = full ? `<div class="pv-used"><span>Used in the course</span><ul>${d.usedIn.map(([a, s]) => `<li>${esc(a)}, ${esc(s)}</li>`).join("")}</ul></div>` : "";
    return `<div class="pv-concept"><p class="pv-kind">Concept page${d.stub ? ", stub" : ""}</p><h4>${esc(d.title)}</h4>
      <p class="pv-lede">${esc(d.lede)}</p>${d.eq ? `<div class="pv-eq">${d.eq}</div>` : ""}${pre}${used}</div>`;
  }
  const toc = full ? `<ol class="pv-toc">${d.sections.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : "";
  return `<div class="pv-article"><p class="pv-kind">${esc(d.week)} article</p><h4>${esc(d.title)}</h4>
    <p class="pv-lede">${esc(d.lede)}</p><p class="pv-reading">Reading: ${esc(d.reading)}</p>${toc}</div>`;
}

const typeset = (n) => window.MathJax?.typesetPromise?.([n]).catch(() => {});

// ---------- one card / window ----------
let stack = [];                      // open cards, outermost first (only B nests)
function makeCard(d, anchor, parent) {
  const card = document.createElement("div");
  card.className = `pv-card pv-${d.kind}-card`;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", `Preview: ${d.title}`);
  const openLabel = d.kind === "wiki" ? "Read on Wikipedia" : d.kind === "article" ? "Open the article" : "Open the concept page";
  const bar = VARIANT === "B"
    ? `<div class="pv-bar"><span>${d.kind === "wiki" ? "Wikipedia" : d.kind === "concept" ? "Concept page" : "Article"}</span><a class="pv-open" href="${d.url}">Open</a><button type="button" class="pv-x" aria-label="Close preview">×</button></div>`
    : VARIANT === "C" ? `<button type="button" class="pv-x" aria-label="Close preview">×</button>` : "";
  card.innerHTML = `${bar}<div class="pv-body">${body(d, VARIANT === "B")}</div>${touch || VARIANT !== "B" ? `<a class="pv-go" href="${d.url}">${openLabel}</a>` : ""}`;
  card.querySelector(".pv-x")?.addEventListener("click", () => closeFrom(stack.indexOf(card)));
  card._anchor = anchor;
  card._parent = parent;
  card.addEventListener("pointerenter", () => cancelClose());
  card.addEventListener("pointerleave", () => scheduleClose());
  return card;
}

function place(card, anchor) {
  const r = anchor.getClientRects()[0] || anchor.getBoundingClientRect();
  const sx = scrollX, sy = scrollY;
  if (VARIANT === "C" && !narrow()) {
    // in the notes margin, level with the link
    const article = document.querySelector(".a-article").getBoundingClientRect();
    card.style.left = `${article.right - 24 - 220 + sx}px`;
    card.style.top = `${r.top + sy - 6}px`;
    return;
  }
  if (VARIANT === "C") return;       // inline drawer, placed in the flow
  if (touch || innerWidth < 600) return;  // A and B: bottom sheet, fixed by CSS
  const parent = card._parent;
  const w = card.offsetWidth, h = card.offsetHeight;
  if (parent) {                      // B: nested windows go beside their parent
    const pr = parent.getBoundingClientRect();
    const right = pr.right + 12 + w < innerWidth;
    card.style.left = `${(right ? pr.right + 12 : Math.max(8, pr.left - 12 - w)) + sx}px`;
    card.style.top = `${Math.max(8, Math.min(r.top - 20, innerHeight - h - 8)) + sy}px`;
    return;
  }
  const flipX = r.left + r.width / 2 > innerWidth / 2;
  const flipY = r.top > innerHeight / 2;
  let left = flipX ? r.right - w : r.left;
  left = Math.max(8, Math.min(left, innerWidth - w - 8));
  card.style.left = `${left + sx}px`;
  card.style.top = `${(flipY ? r.top - h - 8 : r.bottom + 8) + sy}px`;
  card.classList.toggle("above", flipY);
}

async function open(anchor) {
  const parentCard = anchor.closest(".pv-card");
  // C: a link inside the margin preview replaces it, with a way back
  if (VARIANT === "C" && parentCard) return openAt(anchor.dataset.pv, parentCard._anchor, parentCard._key, null);
  const depth = parentCard ? stack.indexOf(parentCard) + 1 : 0;
  if (stack[depth]?._anchor === anchor) return;
  return openAt(anchor.dataset.pv, anchor, null, parentCard);
}

async function openAt(key, anchor, backKey, parentCard) {
  const d = await load(key);
  if (!d) return;
  closeFrom(VARIANT === "B" && parentCard ? stack.indexOf(parentCard) + 1 : 0);
  const card = makeCard(d, anchor, VARIANT === "B" ? parentCard : null);
  card._key = key;
  if (backKey) {
    const back = document.createElement("button");
    back.type = "button"; back.className = "pv-back"; back.textContent = "← Back";
    back.onclick = () => openAt(backKey, anchor, null, null);
    card.prepend(back);
  }
  if (VARIANT === "C" && narrow()) {
    card.classList.add("pv-inline");
    (anchor.closest("p, figcaption, dd, .sidenote") || anchor).after(card);
  } else {
    document.body.appendChild(card);
  }
  stack.push(card);
  if (VARIANT !== "C" && (touch || innerWidth < 600)) document.body.classList.add("pv-sheet-open");
  place(card, anchor);
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
let dwell = null, closer = null, pending = null;
function cancelClose() { clearTimeout(closer); closer = null; }
function scheduleClose() {
  if (TIMING.grace === Infinity || touch) return;
  cancelClose();
  closer = setTimeout(() => {
    // B: keep a window open while the pointer is over it or any window it spawned
    const hovered = stack.findIndex((c) => c.matches(":hover"));
    closeFrom(hovered === -1 ? 0 : hovered + 1);
  }, TIMING.grace);
}
function intend(anchor) {
  clearTimeout(dwell);
  cancelClose();
  const t0 = performance.now();
  dwell = setTimeout(() => {
    pending = load(anchor.dataset.pv);   // start fetching after the dwell
    pending.then(() => setTimeout(() => open(anchor), Math.max(0, TIMING.show - (performance.now() - t0))));
  }, TIMING.dwell);
}
function abandon() { clearTimeout(dwell); scheduleClose(); }

document.addEventListener("pointerover", (e) => { if (touch) return; const a = e.target.closest("a.pv"); if (a) intend(a); });
document.addEventListener("pointerout", (e) => { if (touch) return; const a = e.target.closest("a.pv"); if (a && !a.contains(e.relatedTarget)) abandon(); });
document.addEventListener("focusin", (e) => { const a = e.target.closest?.("a.pv"); if (a && !touch) intend(a); });
document.addEventListener("focusout", (e) => { const a = e.target.closest?.("a.pv"); if (a && !e.relatedTarget?.closest?.(".pv-card")) abandon(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && stack.length) { const top = stack[stack.length - 1]; const a = top._anchor; closeFrom(stack.length - 1); a?.focus?.(); } });
// touch: first tap previews, the card's "Open" button navigates; tapping elsewhere closes
document.addEventListener("click", (e) => {
  const a = e.target.closest("a.pv");
  if (a && (touch || a.getAttribute("href") === "#")) {
    e.preventDefault();
    if (touch) open(a);
    return;
  }
  if (stack.length && !e.target.closest(".pv-card, .proto-bar")) closeFrom(0);
});
addEventListener("resize", () => closeFrom(0));

// ---------- prototype switcher ----------
const KEYS = ["A", "B", "C"];
const go = (d) => { const q = new URLSearchParams(location.search); q.set("variant", KEYS[(KEYS.indexOf(VARIANT) + d + 3) % 3]); location.search = q.toString(); };
const bar = document.createElement("div");
bar.className = "proto-bar";
bar.innerHTML = `<button type="button" aria-label="Previous variant">←</button><span class="proto-label"><small>Prototype</small>${VARIANT}, ${NAMES[VARIANT]}</span><button type="button" aria-label="Next variant">→</button>`;
const [prev, next] = bar.querySelectorAll("button");
prev.onclick = () => go(-1);
next.onclick = () => go(1);
document.body.appendChild(bar);
addEventListener("keydown", (e) => {
  const t = document.activeElement;
  if (t && (t.matches("input, textarea, select") || t.isContentEditable)) return;
  if (e.key === "ArrowLeft") go(-1);
  if (e.key === "ArrowRight") go(1);
});
window.__pv = { open, closeFrom };   // for screenshots
