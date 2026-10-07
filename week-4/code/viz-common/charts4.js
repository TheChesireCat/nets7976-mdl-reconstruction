// Chart pieces shared by the two Week 4 pages, on top of the Week 3 chart kit.

import { C, el, frame, line, label, fmt } from "../../../week-3/code/viz-common/charts.js";

export const CHAIN = [C.g1, C.g2, C.edge, C.neutral];

// A group clipped to the plot area of a frame
export function clipped(f) {
  const id = `clip${Math.random().toString(36).slice(2)}`;
  const cp = el("clipPath", { id }, el("defs", {}, f.svg));
  el("rect", { x: f.margin.l, y: f.margin.t, width: f.iw, height: f.ih }, cp);
  return el("g", { "clip-path": `url(#${id})` }, f.plot);
}

// Filled band between two curves; pts: [x, lo, hi]
export function band(f, pts, color, opacity = 0.14) {
  const up = pts.map(([x, , h]) => `${f.xs(x)},${f.ys(h)}`), dn = pts.map(([x, l]) => `${f.xs(x)},${f.ys(l)}`).reverse();
  return el("path", { d: `M${up.join("L")}L${dn.join("L")}Z`, fill: color, opacity, stroke: "none" }, f.plot);
}

export function bar(f, x0, x1, y0, y1, color, g = f.plot) {
  const X0 = f.xs(x0), X1 = f.xs(x1), Y0 = f.ys(y0), Y1 = f.ys(y1);
  return el("rect", { x: Math.min(X0, X1) + 0.5, y: Math.min(Y0, Y1), width: Math.max(0.5, Math.abs(X1 - X0) - 1), height: Math.abs(Y1 - Y0), fill: color }, g);
}

export function cross(g, x, y, color, r = 3) {
  el("path", { d: `M${x - r},${y - r}L${x + r},${y + r}M${x - r},${y + r}L${x + r},${y - r}`, stroke: color, "stroke-width": 1.2 }, g);
}

// Trace plot of one scalar across chains, with the warmup shaded
// yDomain overrides the range (e.g. to keep far-off warmup values from squashing the rest)
export function traceChart(box, chains, getY, warmup, { yLabel, height = 200, yDomain = null }) {
  const n = chains[0].length;
  let lo = Infinity, hi = -Infinity;
  for (const c of chains) for (const p of c) { const v = getY(p); if (v < lo) lo = v; if (v > hi) hi = v; }
  const pad = (hi - lo) * 0.06 || 1;
  const [y0, y1] = yDomain ?? [lo - pad, hi + pad];
  const f = frame(box, {
    height, x: { domain: [0, n], label: "iteration" }, xFormat: (v) => v.toFixed(0),
    y: { domain: [y0, y1], label: yLabel }, yFormat: (v) => fmt(v, 1),
  });
  el("rect", { x: f.xs(0), y: f.margin.t, width: f.xs(warmup) - f.xs(0), height: f.ih, fill: C.grid, opacity: 0.55 }, f.plot);
  label(f, warmup / 2, y1, "warmup", { anchor: "middle", dx: 0, dy: 14 });
  const g = clipped(f);
  chains.forEach((c, k) => {
    const pts = c.map((p, i) => [i, getY(p)]);
    const ln = line(f, pts, CHAIN[k], { "stroke-width": 1, opacity: 0.85 });
    g.appendChild(ln);
  });
  return f;
}

// Two rows of clickable boxes joined by arrows (the "map" at the top of each page).
// map = { top: [...], bottom: [...], topLabel, bottomLabel, join }, nodes { d, o, e, sec }
export function flowMap(box, map) {
  const W = Math.max(760, box.clientWidth), H = 250, cols = Math.max(map.top.length, map.bottom.length), gap = 20;
  const bw = (W - gap * (cols - 1)) / cols, bh = 66;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, box);
  const mk = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, el("defs", {}, svg));
  el("path", { d: "M0,0 L10,5 L0,10 z", fill: C.axis }, mk);
  const rows = [{ y: 30, nodes: map.top, label: map.topLabel }, { y: 164, nodes: map.bottom, label: map.bottomLabel }];
  rows.forEach((row) => {
    const t = el("text", { x: 0, y: row.y - 12, class: "map-row-label" }, svg);
    t.textContent = row.label;
    row.nodes.forEach((nd, k) => {
      const x = k * (bw + gap);
      const g = el("g", { class: "map-node", tabindex: 0, role: "link" }, svg);
      el("rect", { x, y: row.y, width: bw, height: bh }, g);
      const o = el("text", { x: x + 12, y: row.y + 20, class: "o" }, g); o.textContent = nd.o;
      const dd = el("text", { x: x + 12, y: row.y + 40, class: "d" }, g); dd.textContent = nd.d;
      const e = el("text", { x: x + 12, y: row.y + 57, class: "e" }, g); e.textContent = nd.e;
      const go = () => document.getElementById(nd.sec).scrollIntoView({ behavior: "smooth" });
      g.addEventListener("click", go);
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter") go(); });
      if (k > 0) el("line", { x1: x - gap + 2, x2: x - 3, y1: row.y + bh / 2, y2: row.y + bh / 2, stroke: C.axis, "stroke-width": 1.5, "marker-end": "url(#arrow)" }, svg);
    });
  });
  const x3 = (map.top.length - 1) * (bw + gap) + bw / 2, x0 = bw / 2, yMid = 30 + bh + 30;
  el("path", { d: `M${x3},${30 + bh} V${yMid} H${x0} V${164 - 3}`, fill: "none", stroke: C.axis, "stroke-width": 1.5, "marker-end": "url(#arrow)" }, svg);
  const jl = el("text", { x: (x0 + x3) / 2, y: yMid - 7, "text-anchor": "middle", class: "direct-label" }, svg);
  jl.textContent = map.join;
}

// One request per key to the shared sampler worker; stale replies are dropped.
// busy: key -> section id to dim while waiting.
export function samplerClient(workerUrl, busy = {}) {
  const worker = new Worker(workerUrl, { type: "module" });
  let reqId = 0;
  const pending = new Map();
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.key);
    if (!p || p.id !== data.id) return;
    pending.delete(data.key);
    document.getElementById(busy[data.key])?.classList.remove("busy");
    p.resolve(data);
  };
  return (key, msg) => new Promise((resolve) => {
    const id = ++reqId;
    pending.set(key, { id, resolve });
    document.getElementById(busy[key])?.classList.add("busy");
    worker.postMessage({ ...msg, id, key });
  });
}
