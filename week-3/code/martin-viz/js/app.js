import * as M from "./model.js";
import {
  C, el, frame, line, area, dot, label, refLine, crosshair, legend, heatmap, rampLegend,
  tiles, showTip, hideTip, fmt, modelRamp,
} from "../../viz-common/charts.js";

const $ = (id) => document.getElementById(id);
const clear = (id) => { const e = $(id); e.replaceChildren(); return e; };
const sup = (k) => String(k).replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]);
const grid = (lo, hi, k) => Array.from({ length: k }, (_, i) => lo + ((hi - lo) * i) / (k - 1));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const S = {
  seed: 1, tseed: 3,
  data: null, fit: null, rec: null, flip: false, rocQ: null, rocP: null,
  toy: null, em: { x: 0.1, qx: null, history: [] }, mergeMirrors: true,
  thresh: [], threshTotal: 12,
};

function params() {
  return {
    n: +$("c-n").value, win: +$("c-win").value, wout: +$("c-wout").value,
    b1: +$("c-b1").value, a1: +$("c-a1").value,
  };
}

function syncOutputs() {
  const p = params();
  $("o-n").textContent = p.n;
  $("o-win").textContent = p.win.toFixed(2);
  $("o-wout").textContent = p.wout.toFixed(2);
  $("o-b1").textContent = p.b1.toFixed(1);
  $("o-a1").textContent = p.a1.toFixed(1);
  $("o-q").textContent = (+$("c-q").value).toFixed(2);
  $("o-twin").textContent = (+$("c-twin").value).toFixed(2);
  $("o-twout").textContent = (+$("c-twout").value).toFixed(2);
  $("o-tb1").textContent = (+$("c-tb1").value).toFixed(1);
}

// ---------------------------------------------------------------------------
// Main pipeline: generate -> fit -> recover, then render
// ---------------------------------------------------------------------------

// The fit runs in a worker. While it is busy, only the newest request is kept, so
// dragging a slider never queues up stale work; charts hold their last render meanwhile.
const fitWorker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
let fitBusy = false, fitPending = false, fitId = 0;

function recompute() {
  document.body.classList.add("busy");
  if (fitBusy) { fitPending = true; return; }
  fitBusy = true;
  fitWorker.postMessage({ type: "fit", id: ++fitId, params: params(), seed: S.seed });
}

fitWorker.onmessage = ({ data: r }) => {
  fitBusy = false;
  if (fitPending) { fitPending = false; recompute(); return; } // a newer request is waiting
  Object.assign(S, { data: r.data, fit: r.fit, rec: r.rec, flip: r.flip, rocQ: r.rocQ, rocP: r.rocP });
  const d = S.data, st = $("status");
  st.classList.toggle("warn", !d.feasible);
  st.textContent = d.feasible
    ? `ρ = ${d.rho.toFixed(3)} · c = ${d.c.toFixed(3)}`
    : `⚠ calibration infeasible: needs c = ${d.cRaw.toFixed(2)} > 1 (lower b₁ or raise a₁)`;
  renderAllMain();
  document.body.classList.remove("busy");
  startSweep();
};

function renderAllMain() {
  renderModel();
  renderNoise();
  renderCalibration();
  renderSumA();
  renderBP();
  renderEdges();
}

// ---------------------------------------------------------------------------
// 0. The map
// ---------------------------------------------------------------------------

const MAP = {
  top: [
    { d: "P(g | γ)", o: "sample", e: "Eq. 1", sec: "model" },
    { d: "P(A | g, ω)", o: "sample", e: "Eq. 1", sec: "model" },
    { d: "P(Q | A)", o: "sample", e: "Eq. 2", sec: "noise" },
    { d: "β₁ / β₀ fixed", o: "constrain", e: "Eqs. 3–6", sec: "calibration" },
  ],
  bottom: [
    { d: "P(Q, g | γ, ω)", o: "sum over A", e: "Eq. 7", sec: "sumA" },
    { d: "P(Q | γ, ω)", o: "sum over g", e: "Eq. 8", sec: "em" },
    { d: "γ̂, ω̂", o: "maximize · EM", e: "Eqs. 9–19", sec: "em" },
    { d: "P(g | Q, γ̂, ω̂)", o: "condition · BP", e: "Eqs. 14, 27–34", sec: "posterior" },
    { d: "P(Aᵢⱼ = 1 | Q)", o: "sum over g", e: "Eq. 41", sec: "edges" },
  ],
};

function renderMap() {
  const box = clear("p-map");
  const W = Math.max(720, box.clientWidth), H = 300;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, box);
  const defs = el("defs", {}, svg);
  const mk = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", fill: C.axis }, mk);
  const gap = 22, bw = (W - gap * 4) / 5, bh = 66;
  const rows = [{ y: 34, nodes: MAP.top, label: "Generative model · forward" }, { y: 196, nodes: MAP.bottom, label: "Inference · backward" }];
  const centers = [];
  rows.forEach((row, ri) => {
    const t = el("text", { x: 0, y: row.y - 12, class: "map-row-label" }, svg);
    t.textContent = row.label;
    centers[ri] = [];
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
      centers[ri].push({ x, y: row.y });
      if (k > 0 && !(ri === 0 && k === 3))
        el("line", { x1: x - gap + 2, x2: x - 3, y1: row.y + bh / 2, y2: row.y + bh / 2, stroke: C.axis, "stroke-width": 1.5, "marker-end": "url(#arrow)" }, svg);
    });
  });
  // constraint attaches to the noise box
  const n3 = centers[0][2], c4 = centers[0][3];
  el("line", { x1: c4.x - 3, x2: n3.x + bw + 3, y1: n3.y + bh / 2, y2: n3.y + bh / 2, stroke: C.axis, "stroke-width": 1.5, "marker-end": "url(#arrow)" }, svg);
  // the joint feeds inference
  const s1 = centers[1][0], yMid = 34 + bh + 34;
  el("path", {
    d: `M${n3.x + bw / 2},${n3.y + bh} V${yMid} H${s1.x + bw / 2} V${s1.y - 3}`,
    fill: "none", stroke: C.axis, "stroke-width": 1.5, "marker-end": "url(#arrow)",
  }, svg);
  const jl = el("text", { x: (n3.x + bw / 2 + s1.x + bw / 2) / 2, y: yMid - 7, "text-anchor": "middle", class: "direct-label" }, svg);
  jl.textContent = "joint = P(Q | A) · P(A, g | γ, ω), assuming Q ⟂ (g, γ, ω) given A";
  // the EM loop between maximize and condition
  const mx = centers[1][2], po = centers[1][3], yb = 196 + bh;
  el("path", {
    d: `M${po.x + bw / 2},${yb + 3} C${po.x + bw / 2},${yb + 30} ${mx.x + bw / 2},${yb + 30} ${mx.x + bw / 2},${yb + 3}`,
    fill: "none", stroke: C.model, "stroke-width": 1.5, "marker-end": "url(#arrow)",
  }, svg);
  const el2 = el("text", { x: (po.x + mx.x + bw) / 2, y: yb + 33, "text-anchor": "middle", class: "direct-label" }, svg);
  el2.textContent = "EM alternates these two";
}

// ---------------------------------------------------------------------------
// 1. Generative model
// ---------------------------------------------------------------------------

function heatSize(box, frac = 1) {
  return Math.max(160, Math.min(360, Math.floor((box.clientWidth - 16) * frac) - 10));
}

function renderModel() {
  const d = S.data, n = d.n;
  const tBox = clear("t-model");
  let nA = 0; for (const x of d.g) if (x === 0) nA++;
  tiles(tBox, [
    { label: "Nodes", value: n.toLocaleString(), note: `${nA} in A · ${n - nA} in B` },
    { label: "Pairs", value: ((n * (n - 1)) / 2).toLocaleString() },
    { label: "True edges m", value: d.m.toLocaleString() },
    { label: "Density ρ", value: d.rho.toFixed(3), note: "m / (n choose 2)" },
  ]);
  const box = clear("p-A");
  heatmap(box, {
    n, order: d.order, value: (i, j) => d.A[i * n + j], groups: (i) => d.g[i], size: heatSize(box),
    tooltip: (i, j) => [
      { value: d.A[i * n + j] ? "edge" : "no edge", label: "A_ij" },
      { value: d.g[i] === d.g[j] ? "same group" : "different groups", label: "" },
    ],
  });
  rampLegend(box, "no edge", "edge");

  // 2x2 block matrix: true omega vs realised density
  const ob = clear("p-omega");
  const cnt = [[0, 0], [0, 0]], tot = [[0, 0], [0, 0]];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const r = d.g[i], s = d.g[j];
      tot[r][s]++; cnt[r][s] += d.A[i * n + j];
      if (r !== s) { tot[s][r]++; cnt[s][r] += d.A[i * n + j]; }
    }
  const W = Math.max(260, ob.clientWidth), H = 280;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, ob);
  const cs = Math.min(110, (W - 120) / 2), x0 = (W - 2 * cs) / 2 + 20, y0 = 40;
  const names = ["A", "B"];
  for (let r = 0; r < 2; r++) {
    const tl = el("text", { x: x0 - 14, y: y0 + r * cs + cs / 2 + 4, "text-anchor": "end", class: "direct-label" }, svg);
    tl.textContent = `group ${names[r]}`;
    const tt = el("text", { x: x0 + r * cs + cs / 2, y: y0 - 12, "text-anchor": "middle", class: "direct-label" }, svg);
    tt.textContent = `group ${names[r]}`;
    for (let s = 0; s < 2; s++) {
      const w = r === s ? d.win : d.wout;
      const obs = cnt[r][s] / Math.max(1, tot[r][s]);
      const col = modelRamp(Math.min(1, w / 0.45));
      const cx = x0 + s * cs, cy = y0 + r * cs;
      const rect = el("rect", { x: cx + 1, y: cy + 1, width: cs - 2, height: cs - 2, rx: 6, fill: `rgb(${col.join(",")})` }, svg);
      // ink follows the cell's lightness, not the page theme (the light-mode ramp ends dark)
      const light = col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11 > 140;
      const a = el("text", { x: cx + cs / 2, y: cy + cs / 2 - 2, "text-anchor": "middle", fill: light ? "#0d0d0d" : "#fff", "font-size": 18, "font-weight": 600 }, svg);
      a.textContent = `ω = ${w.toFixed(2)}`;
      const b = el("text", { x: cx + cs / 2, y: cy + cs / 2 + 18, "text-anchor": "middle", fill: light ? "#262624" : "#e6e5dc", "font-size": 11.5 }, svg);
      b.textContent = `observed ${obs.toFixed(3)}`;
      rect.addEventListener("pointermove", (ev) => showTip(ev, [
        { value: w.toFixed(3), label: "ω (model)" }, { value: obs.toFixed(3), label: "edge density in sample" },
        { value: tot[r][s].toLocaleString(), label: "pairs" },
      ], `group ${names[r]} × group ${names[s]}`));
      rect.addEventListener("pointerleave", hideTip);
    }
  }
  const cap = el("text", { x: W / 2, y: y0 + 2 * cs + 30, "text-anchor": "middle", class: "axis-label" }, svg);
  cap.textContent = "ω_in on the diagonal, ω_out off it";
}

// ---------------------------------------------------------------------------
// 2. Noise
// ---------------------------------------------------------------------------

function renderNoise() {
  const d = S.data, n = d.n;
  let zeroNon = 0, non = 0, posQ = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const q = d.Q[i * n + j];
      if (q > 0) posQ++;
      if (!d.A[i * n + j]) { non++; if (q === 0) zeroNon++; }
    }
  tiles(clear("t-noise"), [
    { label: "c (non-edges that get Q > 0)", value: d.c.toFixed(3), note: d.feasible ? "set by calibration" : "clamped to 1" },
    { label: "Non-edges reported as Q = 0", value: `${((100 * zeroNon) / non).toFixed(1)}%` },
    { label: "Pairs with Q > 0", value: posQ.toLocaleString(), note: `vs ${d.m.toLocaleString()} true edges` },
  ]);

  const box = clear("p-beta");
  const xs = grid(0.005, 0.995, 199);
  const b1 = xs.map((x) => [x, M.betaPdf(x, d.a1, d.b1)]);
  const b0 = xs.map((x) => [x, M.betaPdf(x, d.a1 - 1, d.b1 + 1)]);
  const ymax = Math.min(6, Math.max(...b1.map((p) => p[1]), ...b0.map((p) => p[1])) * 1.1);
  legend(box, [{ label: "β₁: true edges", color: C.edge }, { label: "β₀: non-edges (Q > 0 part)", color: C.nonedge }]);
  const f = frame(box, { x: { domain: [0, 1], label: "reported Q" }, y: { domain: [0, ymax], label: "density" } });
  const clip = (pts) => pts.map(([x, y]) => [x, Math.min(y, ymax)]);
  area(f, clip(b0), C.nonedge); area(f, clip(b1), C.edge);
  line(f, clip(b0), C.nonedge); line(f, clip(b1), C.edge);
  crosshair(f, [{ name: "β₁ (edge)", color: C.edge, points: b1 }, { name: "β₀ (non-edge, Q > 0)", color: C.nonedge, points: b0 }],
    { xLabel: (x) => `Q = ${x.toFixed(2)}` });

  const aq = clear("p-AQ");
  const size = heatSize(aq, 0.5);
  const col = (title) => { const c = document.createElement("div"); const h = document.createElement("div"); h.className = "hm-title"; h.textContent = title; c.appendChild(h); aq.appendChild(c); return c; };
  const tip = (i, j) => [
    { value: d.Q[i * n + j].toFixed(3), label: "Q_ij (observed)" },
    { value: d.A[i * n + j] ? "edge" : "no edge", label: "A_ij (hidden)" },
  ];
  heatmap(col("Hidden: A"), { n, order: d.order, value: (i, j) => d.A[i * n + j], groups: (i) => d.g[i], size, tooltip: tip });
  heatmap(col("Observed: Q"), { n, order: d.order, value: (i, j) => d.Q[i * n + j], groups: (i) => d.g[i], size, tooltip: tip });
  rampLegend(aq, "0", "1", "same scale for both");
}

// ---------------------------------------------------------------------------
// 3. Calibration
// ---------------------------------------------------------------------------

function renderCalibration() {
  const d = S.data, n = d.n, B = 20;
  const bins = Array.from({ length: B }, () => ({ e: 0, ne: 0, qs: 0 }));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const q = d.Q[i * n + j];
      if (q <= 0) continue;
      const b = Math.min(B - 1, Math.floor(q * B));
      d.A[i * n + j] ? bins[b].e++ : bins[b].ne++;
      bins[b].qs += q;
    }
  // calibration dots
  const cb = clear("p-calib");
  const f2 = frame(cb, { x: { domain: [0, 1], label: "reported Q (bin mean)" }, y: { domain: [0, 1], label: "fraction that are true edges" } });
  refLine(f2, [[0, 0], [1, 1]]);
  label(f2, 0.62, 0.62, "perfect calibration", { dx: 8, dy: 16, cls: "axis-label" });
  bins.forEach((b, k) => {
    const N = b.e + b.ne;
    if (N < 5) return;
    const x = b.qs / N, y = b.e / N;
    const c = dot(f2, x, y, C.edge, 5);
    const hit = el("circle", { cx: f2.xs(x), cy: f2.ys(y), r: 12, fill: "transparent" }, f2.plot);
    hit.addEventListener("pointermove", (ev) => showTip(ev, [
      { value: y.toFixed(3), label: "fraction edges" }, { value: x.toFixed(3), label: "mean Q in bin" },
      { value: `${b.e.toLocaleString()} / ${N.toLocaleString()}`, label: "true edges / pairs in bin" },
    ]));
    hit.addEventListener("pointerleave", hideTip);
  });

  // likelihood ratio implied by calibration (Eq. 4), and measured from the true edges
  const rho = d.rho, M_ = (n * (n - 1)) / 2;
  const lr = (q) => Math.log10((q / (1 - q)) / (rho / (1 - rho)));
  const qs = grid(0.01, 0.99, 197);
  const theory = qs.map((q) => [q, lr(q)]);
  const lo = Math.floor(Math.max(-3, lr(0.01))), hi = Math.ceil(Math.min(4, lr(0.99)));
  const lb = clear("p-lr");
  legend(lb, [{ label: "implied by calibration", color: C.model }, { label: "measured from this sample's true edges", color: C.edge, type: "dot" }]);
  const tickFmt = (v) => { const x = 10 ** v; return x >= 1 ? x.toLocaleString() : x.toString(); };
  const f3 = frame(lb, { x: { domain: [0, 1], label: "reported Q" }, y: { domain: [lo, hi], label: "likelihood ratio β₁ / β₀", ticks: grid(lo, hi, hi - lo + 1) }, yFormat: tickFmt });
  refLine(f3, [[0, 0], [1, 0]], C.muted);
  label(f3, 1, 0, "1 = no evidence either way", { anchor: "end", dx: -2, dy: 14, cls: "axis-label" });
  line(f3, theory, C.model);
  const emp = [];
  bins.forEach((b, k) => {
    if (b.e < 3 || b.ne < 3) return;
    const q = b.qs / (b.e + b.ne);
    emp.push({ x: q, y: Math.log10((b.e / d.m) / (b.ne / (M_ - d.m))), b });
  });
  emp.forEach((p) => dot(f3, p.x, p.y, C.edge, 4.5));
  const ex = 0.5, exLR = 10 ** lr(ex);
  dot(f3, ex, lr(ex), C.model, 5);
  label(f3, ex, lr(ex), `Q = 0.5 is ${exLR.toFixed(0)}× evidence for an edge (ρ = ${rho.toFixed(2)})`, { dx: 10, dy: 16, cls: "direct-label strong" });
  nearestHover(f3, emp, (k) => [
    { value: `${(10 ** emp[k].y).toFixed(2)}×`, label: "measured likelihood ratio" },
    { value: `${(10 ** lr(emp[k].x)).toFixed(2)}×`, label: "implied by calibration" },
    { value: emp[k].x.toFixed(3), label: "mean Q in bin" },
  ], () => "one Q bin");
}

// ---------------------------------------------------------------------------
// 4. Summing out A
// ---------------------------------------------------------------------------

function renderSumA() {
  const d = S.data, rho = S.fit.rho, q0 = +$("c-q").value;
  const qs = grid(0.0, 1.0, 201);
  const Fin = qs.map((q) => [q, M.pairFactor(q, d.win, rho)]);
  const Fout = qs.map((q) => [q, M.pairFactor(q, d.wout, rho)]);
  const box = clear("p-factor");
  legend(box, [{ label: "same group (ω_in)", color: C.model }, { label: "different groups (ω_out)", color: C.nonedge }]);
  const ymax = Math.max(...Fin.map((p) => p[1]), ...Fout.map((p) => p[1])) * 1.08;
  const f = frame(box, { height: 230, x: { domain: [0, 1], label: "Q_ij" }, y: { domain: [0, ymax], label: "pair factor F" } });
  refLine(f, [[0, 1], [1, 1]]);
  label(f, 1, 1, "F = 1: no evidence (what ω = ρ gives)", { anchor: "end", dx: -4, dy: 14, cls: "axis-label" });
  line(f, Fout, C.nonedge); line(f, Fin, C.model);
  label(f, 1, Fin[Fin.length - 1][1], "ω_in / ρ", { anchor: "end", dx: -4, dy: -8, cls: "axis-label" });
  label(f, 1, Fout[Fout.length - 1][1], "ω_out / ρ", { anchor: "end", dx: -4, dy: 14, cls: "axis-label" });
  refLine(f, [[q0, 0], [q0, ymax]], C.ink2);
  const fi = M.pairFactor(q0, d.win, rho), fo = M.pairFactor(q0, d.wout, rho);
  dot(f, q0, fi, C.model); dot(f, q0, fo, C.nonedge);
  crosshair(f, [{ name: "same group", color: C.model, points: Fin }, { name: "different groups", color: C.nonedge, points: Fout }], { xLabel: (x) => `Q = ${x.toFixed(2)}` });

  // the two terms of the sum, for the chosen Q
  const W = f.width, H = 92;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, box);
  const xmax = Math.max(fi, fo) * 1.05, x0 = 118, xw = W - x0 - 60;
  [["same group", d.win, fi], ["different", d.wout, fo]].forEach(([name, w, F], r) => {
    const y = 14 + r * 36;
    const on = (q0 * w) / rho, off = ((1 - q0) * (1 - w)) / (1 - rho);
    const t = el("text", { x: x0 - 10, y: y + 12, "text-anchor": "end", class: "direct-label" }, svg); t.textContent = name;
    const w1 = (on / xmax) * xw, w0 = (off / xmax) * xw;
    el("rect", { x: x0, y, width: Math.max(0, w1 - 1), height: 16, fill: C.edge }, svg);
    el("rect", { x: x0 + w1 + 1, y, width: Math.max(0, w0 - 1), height: 16, rx: 3, fill: C.nonedge }, svg);
    const v = el("text", { x: x0 + w1 + w0 + 8, y: y + 12, class: "direct-label strong" }, svg); v.textContent = F.toFixed(2);
    const hit = el("rect", { x: x0, y: y - 4, width: w1 + w0, height: 24, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", (ev) => showTip(ev, [
      { color: C.edge, value: on.toFixed(3), label: "A = 1 term: Q ω / ρ" },
      { color: C.nonedge, value: off.toFixed(3), label: "A = 0 term: (1−Q)(1−ω)/(1−ρ)" },
      { value: F.toFixed(3), label: "F = sum" },
    ], `${name}, Q = ${q0.toFixed(2)}`));
    hit.addEventListener("pointerleave", hideTip);
  });
  legend(box, [{ label: "A = 1 term", color: C.edge, type: "rect" }, { label: "A = 0 term", color: C.nonedge, type: "rect" }]);

  // t curves
  const tb = clear("p-t");
  legend(tb, [{ label: "same group", color: C.model }, { label: "different groups", color: C.nonedge }, { label: "raw Q", color: C.axis }]);
  const tin = qs.map((q) => [q, M.edgePosterior(q, d.win, rho)]);
  const tout = qs.map((q) => [q, M.edgePosterior(q, d.wout, rho)]);
  const f2 = frame(tb, { height: 322, x: { domain: [0, 1], label: "Q_ij" }, y: { domain: [0, 1], label: "P(A_ij = 1 | Q_ij, groups)" } });
  refLine(f2, [[0, 0], [1, 1]]);
  line(f2, tout, C.nonedge); line(f2, tin, C.model);
  refLine(f2, [[q0, 0], [q0, 1]], C.ink2);
  const ti = M.edgePosterior(q0, d.win, rho), to = M.edgePosterior(q0, d.wout, rho);
  dot(f2, q0, ti, C.model); dot(f2, q0, to, C.nonedge);
  crosshair(f2, [{ name: "same group", color: C.model, points: tin }, { name: "different groups", color: C.nonedge, points: tout }], { xLabel: (x) => `Q = ${x.toFixed(2)}` });

  tiles(clear("t-sumA"), [
    { label: `F, same group (Q = ${q0.toFixed(2)})`, value: fi.toFixed(3) },
    { label: "F, different groups", value: fo.toFixed(3) },
    { label: "Vote for “same group”", value: `×${(fi / fo).toFixed(2)}`, note: "F_same / F_diff; > 1 favours same" },
    { label: "P(edge), same / different", value: `${ti.toFixed(2)} / ${to.toFixed(2)}` },
  ]);
}

// ---------------------------------------------------------------------------
// 5 & 6. Toy network: exact marginal likelihood, EM, exact posterior
// ---------------------------------------------------------------------------

const TOY_N = 12;
const XS = grid(0.02, 0.97, 140);

const TOY_A1 = 2; // the toy keeps its own noise shape, so the top bar never touches it

function recomputeToy() {
  const twin = +$("c-twin").value, twout = +$("c-twout").value;
  const d = M.generate({ n: TOY_N, win: twin, wout: twout, a1: TOY_A1, b1: +$("c-tb1").value, seed: S.tseed });
  const rho = M.rhoHat(d.Q, TOY_N);
  const pairs = M.pairList(d.Q, TOY_N);
  const logL = M.logLikCurve(pairs, TOY_N, twout, rho, XS);
  // Full Bayes: flat prior on omega_in, so P(omega_in | Q) is proportional to the likelihood.
  // Average the exact co-membership over that posterior, on a coarse grid.
  const WG = grid(0.02, 0.97, 48);
  const lw = M.logLikCurve(pairs, TOY_N, twout, rho, WG);
  const mx = Math.max(...lw);
  const w = Array.from(lw, (v) => Math.exp(v - mx));
  const Z = w.reduce((a, b) => a + b);
  const fbSame = new Float64Array(pairs.length);
  WG.forEach((x, k) => {
    if (w[k] / Z < 1e-6) return;
    const ex = M.exactPosterior(pairs, TOY_N, x, twout, rho);
    for (let p = 0; p < pairs.length; p++) fbSame[p] += (w[k] / Z) * ex.same[p];
  });
  S.toy = { d, rho, pairs, logL, twin, twout, fbSame };
  renderEM();
  renderPosterior();
}

function boundAt(qx) {
  const { pairs, rho, twout } = S.toy;
  const ex = M.exactPosterior(pairs, TOY_N, qx, twout, rho);
  const H = M.entropy(ex.post);
  return { ex, H, f: (xs) => M.boundCurve(pairs, TOY_N, twout, rho, xs, ex.same, H) };
}

function logLAt(x) {
  const { pairs, rho, twout } = S.toy;
  return M.logLikCurve(pairs, TOY_N, twout, rho, [x])[0];
}

function mStep() {
  // the bound is concave in omega_in: ternary search for its maximum
  const b = boundAt(S.em.qx);
  let lo = 0.001, hi = 0.999;
  for (let k = 0; k < 80; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const [f1, f2] = b.f([m1, m2]);
    if (f1 < f2) lo = m1; else hi = m2;
  }
  return (lo + hi) / 2;
}

function renderEM() {
  const { logL, twin } = S.toy, em = S.em;
  const box = clear("p-em");
  const finite = Array.from(logL).filter(Number.isFinite);
  const ymax = Math.max(...finite), ymin = Math.min(...finite);
  const pad = (ymax - ymin) * 0.08;
  const dom = [ymin - pad, ymax + pad];
  const clampY = (pts) => pts.map(([x, y]) => [x, Math.max(dom[0], y)]);
  const items = [{ label: "log P(Q | ω_in)", color: C.neutral }];
  if (em.qx !== null) items.push({ label: `EM bound, q from ω_in = ${em.qx.toFixed(3)}`, color: C.model });
  legend(box, items);
  const f = frame(box, { height: 320, x: { domain: [0, 1], label: "ω_in" }, y: { domain: dom, label: "log likelihood" }, yFormat: (v) => v.toFixed(1) });
  refLine(f, [[twin, dom[0]], [twin, dom[1]]]);
  label(f, twin, dom[1], "true ω_in", { dx: 6, dy: 12, cls: "axis-label" });
  const Lpts = XS.map((x, k) => [x, logL[k]]);
  line(f, clampY(Lpts), C.neutral);
  const series = [{ name: "log P(Q | ω_in)", color: C.neutral, points: Lpts }];
  let bNow = null;
  if (em.qx !== null) {
    const b = boundAt(em.qx);
    const Bv = b.f(XS);
    const Bpts = XS.map((x, k) => [x, Bv[k]]);
    area(f, clampY(Bpts), C.model, dom[0]);
    line(f, Bpts.map(([x, y]) => [x, y < dom[0] ? NaN : y]), C.model);
    series.push({ name: "EM bound", color: C.model, points: Bpts });
    bNow = b.f([em.x])[0];
  }
  em.history.forEach((x) => dot(f, x, Math.max(dom[0], logLAt(x)), C.ink2, 3.5));
  const Lx = logLAt(em.x);
  dot(f, em.x, Math.max(dom[0], Lx), C.model, 6);
  label(f, em.x, Math.max(dom[0], Lx), "current ω_in", { dx: 10, dy: -8, cls: "direct-label strong" });
  crosshair(f, series, { xLabel: (x) => `ω_in = ${x.toFixed(3)}`, yFmt: (v) => (Number.isFinite(v) ? v.toFixed(3) : "−∞") });

  tiles(clear("t-em"), [
    { label: "Current ω_in", value: em.x.toFixed(3), note: `true value ${twin.toFixed(2)}` },
    { label: "log P(Q | ω_in)", value: Lx.toFixed(3) },
    { label: "Bound at current ω_in", value: bNow === null ? "—" : bNow.toFixed(3) },
    { label: "Gap = KL(q ‖ posterior)", value: bNow === null ? "—" : Math.max(0, Lx - bNow).toFixed(4), note: bNow === null ? "run an E-step" : Lx - bNow < 1e-6 ? "zero: the E-step just made the bound touch" : "the M-step moved ω_in off the touching point" },
  ]);
  const needE = em.qx === null || Math.abs(em.qx - em.x) > 1e-12;
  $("c-estep").disabled = !needE;
  $("c-mstep").disabled = needE;
  $("em-hint").textContent = needE ? "Next: E-step (build the bound at the current ω_in)" : "Next: M-step (jump to the top of the bound)";
}

function canonical(gm) {
  // merge each assignment with its mirror image: put node 0 in group A
  return gm & 1 ? ~gm & ((1 << TOY_N) - 1) : gm;
}

function renderPosterior() {
  const { d, pairs, rho, twout } = S.toy, x = S.em.x;
  const ex = M.exactPosterior(pairs, TOY_N, x, twout, rho);
  const merged = new Map();
  ex.post.forEach((p, gm) => { const c = canonical(gm); merged.set(c, (merged.get(c) ?? 0) + p); });
  let truthMask = 0; for (let i = 0; i < TOY_N; i++) if (d.g[i]) truthMask |= 1 << i;
  const truthC = canonical(truthMask);
  let top;
  if (S.mergeMirrors) {
    top = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!top.some(([c]) => c === truthC)) top.push([truthC, merged.get(truthC)]);
  } else {
    // unmerged: rows arrive in mirror pairs with identical probabilities
    top = Array.from(ex.post, (p, gm) => [gm, p]).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 10);
  }
  const isTruth = (c) => (S.mergeMirrors ? c === truthC : c === truthMask || c === (~truthMask & ((1 << TOY_N) - 1)));
  const H = M.entropy(ex.post);

  tiles(clear("t-post"), [
    { label: "Posterior probability of the true split", value: (merged.get(truthC) ?? 0).toFixed(3), note: `at ω_in = ${x.toFixed(3)}` },
    { label: "Effective number of splits", value: (Math.exp(H) / 2).toFixed(1), note: "exp(entropy) / 2 mirror images" },
    { label: "Every single-node q_i(B)", value: "0.500", note: "each split ties with its mirror image" },
  ]);

  const box = clear("p-assign");
  const g = document.createElement("div");
  g.className = "assign";
  const pmax = top[0][1];
  for (const [c, p] of top) {
    const cells = document.createElement("div");
    cells.className = "cells" + (isTruth(c) ? " truth" : "");
    for (let i = 0; i < TOY_N; i++) {
      const s = document.createElement("span");
      s.style.background = (c >> i) & 1 ? C.g2 : C.g1;
      cells.appendChild(s);
    }
    const bar = document.createElement("div");
    bar.style.width = `${Math.max(2, (100 * p) / pmax)}%`;
    bar.className = "bar";
    const pv = document.createElement("div");
    pv.className = "pv";
    pv.textContent = p.toFixed(3);
    g.append(cells, bar, pv);
  }
  box.appendChild(g);
  legend(box, [{ label: "group A", color: C.g1, type: "rect" }, { label: "group B", color: C.g2, type: "rect" }]);

  // co-membership, exact and BP
  const order = Array.from({ length: TOY_N }, (_, i) => i).sort((a, b) => d.g[a] - d.g[b] || a - b);
  const sameM = new Float64Array(TOY_N * TOY_N);
  pairs.forEach(([i, j], p) => { sameM[i * TOY_N + j] = sameM[j * TOY_N + i] = ex.same[p]; });
  const eb = clear("p-comem-exact");
  const size = Math.max(150, Math.min(240, eb.clientWidth - 20));
  heatmap(eb, {
    n: TOY_N, order, value: (i, j) => sameM[i * TOY_N + j], groups: (i) => d.g[i], size, colors: modelRamp,
    tooltip: (i, j) => [{ value: sameM[i * TOY_N + j].toFixed(3), label: "P(same group | Q)" }, { value: d.Q[i * TOY_N + j].toFixed(3), label: "Q_ij" }],
  });
  rampLegend(eb, "0", "1", "P(g_i = g_j | Q)", modelRamp);

  const graph = M.buildGraph(d.Q, TOY_N);
  const rng = M.makeRng(5);
  const msg = new Float64Array(graph.edges.length * 4), marg = new Float64Array(TOY_N * 2);
  for (let k = 0; k < msg.length; k += 2) { const p = 0.5 + 0.3 * (rng.uniform() - 0.5); msg[k] = p; msg[k + 1] = 1 - p; }
  for (let k = 0; k < marg.length; k += 2) { const p = 0.5 + 0.3 * (rng.uniform() - 0.5); marg[k] = p; marg[k + 1] = 1 - p; }
  M.runBP(graph, [0.5, 0.5], [[x, twout], [twout, x]], rho, msg, marg);
  const bpSame = (i, j) => marg[2 * i] * marg[2 * j] + marg[2 * i + 1] * marg[2 * j + 1];
  const bb = clear("p-comem-bp");
  heatmap(bb, {
    n: TOY_N, order, value: bpSame, groups: (i) => d.g[i], size, colors: modelRamp,
    tooltip: (i, j) => [{ value: bpSame(i, j).toFixed(3), label: "BP co-membership" }, { value: sameM[i * TOY_N + j].toFixed(3), label: "exact" }],
  });
  rampLegend(bb, "0", "1", "from BP marginals", modelRamp);
  renderEBvsFB(ex.same, order);
}

function renderEBvsFB(ebSame) {
  const { d, pairs, logL, twin, fbSame } = S.toy, x = S.em.x;
  // posterior over omega_in (flat prior), normalised as a density on the grid
  const mx = Math.max(...logL), dx = XS[1] - XS[0];
  const dens = Array.from(logL, (v) => Math.exp(v - mx));
  const Z = dens.reduce((a, b) => a + b) * dx;
  const pts = XS.map((xv, k) => [xv, dens[k] / Z]);
  const ymax = Math.max(...pts.map((p) => p[1])) * 1.15;
  const box = clear("p-omega-post");
  legend(box, [{ label: "P(ω_in | Q): what full Bayes averages over", color: C.neutral }, { label: "the single value EM plugs in", color: C.model }]);
  const f = frame(box, { height: 250, x: { domain: [0, 1], label: "ω_in" }, y: { domain: [0, ymax], label: "posterior density" } });
  area(f, pts, C.neutral); line(f, pts, C.neutral);
  refLine(f, [[twin, 0], [twin, ymax]], C.muted);
  label(f, twin, ymax, "true", { dx: 4, dy: 12, cls: "axis-label" });
  refLine(f, [[x, 0], [x, ymax]], C.model);
  label(f, x, ymax * 0.12, `plug-in ω_in = ${x.toFixed(2)}`, { anchor: x > 0.6 ? "end" : "start", dx: x > 0.6 ? -6 : 6, cls: "direct-label strong" });
  crosshair(f, [{ name: "P(ω_in | Q)", color: C.neutral, points: pts }], { xLabel: (v) => `ω_in = ${v.toFixed(2)}` });

  // co-membership per pair: plug-in vs averaged
  const sb = clear("p-ebfb");
  legend(sb, [{ label: "pairs truly in the same group", color: C.model, type: "dot" }, { label: "truly in different groups", color: C.nonedge, type: "dot" }]);
  const f2 = frame(sb, { height: 250, x: { domain: [0, 1], label: "P(same group | Q, ω_in plugged in)" }, y: { domain: [0, 1], label: "P(same group | Q), averaged" } });
  refLine(f2, [[0, 0], [1, 1]]);
  const P = pairs.map(([i, j], p) => ({ x: ebSame[p], y: fbSame[p], same: d.g[i] === d.g[j], i, j }));
  P.filter((p) => !p.same).forEach((p) => dot(f2, p.x, p.y, C.nonedge, 4));
  P.filter((p) => p.same).forEach((p) => dot(f2, p.x, p.y, C.model, 4));
  const gap = Math.max(...P.map((p) => Math.abs(p.x - p.y)));
  label(f2, 0.02, 0.97, `largest difference: ${gap.toFixed(2)}`, { dx: 0, dy: 4, cls: "direct-label" });
  nearestHover(f2, P, (k) => [
    { value: P[k].x.toFixed(3), label: "plug-in (empirical Bayes)" },
    { value: P[k].y.toFixed(3), label: "averaged (full Bayes)" },
    { value: P[k].same ? "same group" : "different groups", label: "truth" },
  ], (k) => `nodes ${P[k].i} – ${P[k].j}`);
}

// ---------------------------------------------------------------------------
// 7. BP at scale
// ---------------------------------------------------------------------------

function renderBP() {
  const d = S.data, fit = S.fit, n = d.n;
  $("bp-n").textContent = n;
  $("bp-states").textContent = `2${sup(n)} ≈ 10${sup(Math.floor(n * Math.log10(2)))}`;
  const acc = M.accuracy(fit.marg, d.g);
  const [a, b] = S.flip ? [1, 0] : [0, 1];
  tiles(clear("t-bp"), [
    { label: "Nodes in the right group", value: `${(100 * acc).toFixed(1)}%` },
    { label: "EM rounds", value: fit.history.length },
    { label: "ω̂ within A / B", value: `${fit.omega[a][a].toFixed(3)} / ${fit.omega[b][b].toFixed(3)}`, note: `true ${d.win.toFixed(2)}` },
    { label: "ω̂ between", value: fit.omega[0][1].toFixed(3), note: `true ${d.wout.toFixed(2)}` },
    { label: "γ̂ (A, B)", value: `${fit.gamma[a].toFixed(2)}, ${fit.gamma[b].toFixed(2)}` },
  ]);

  // trajectory
  const box = clear("p-traj");
  const H = [{ iter: 0, w00: Math.min(0.95, 1.5 * fit.rho), w11: Math.min(0.95, 1.5 * fit.rho), w01: 0.5 * fit.rho }, ...fit.history];
  const kA = S.flip ? "w11" : "w00", kB = S.flip ? "w00" : "w11";
  const sA = H.map((h) => [h.iter, h[kA]]), sB = H.map((h) => [h.iter, h[kB]]), sX = H.map((h) => [h.iter, h.w01]);
  legend(box, [{ label: "within group A", color: C.g1 }, { label: "within group B", color: C.g2 }, { label: "between groups", color: C.model }]);
  const ymax = Math.max(d.win, ...sA.map((p) => p[1]), ...sB.map((p) => p[1])) * 1.15;
  const f = frame(box, { x: { domain: [0, Math.max(3, H.length - 1)], label: "EM round (0 = initial guess)" }, y: { domain: [0, ymax], label: "ω̂" }, xFormat: (v) => v.toFixed(0), yFormat: (v) => v.toFixed(2) });
  const xm = Math.max(3, H.length - 1);
  refLine(f, [[0, d.win], [xm, d.win]], C.muted);
  refLine(f, [[0, d.wout], [xm, d.wout]], C.muted);
  label(f, xm, d.win, "true ω_in", { anchor: "end", dx: -2, dy: -6, cls: "axis-label" });
  label(f, xm, d.wout, "true ω_out", { anchor: "end", dx: -2, dy: -6, cls: "axis-label" });
  line(f, sX, C.model); line(f, sA, C.g1); line(f, sB, C.g2);
  crosshair(f, [{ name: "within A", color: C.g1, points: sA }, { name: "within B", color: C.g2, points: sB }, { name: "between", color: C.model, points: sX }], { xLabel: (x) => `round ${x}` });

  // strip plot of node marginals
  const sb = clear("p-strip");
  legend(sb, [{ label: "truly in group A", color: C.g1, type: "dot" }, { label: "truly in group B", color: C.g2, type: "dot" }]);
  const f2 = frame(sb, { margin: { t: 14, r: 18, b: 44, l: 70 }, x: { domain: [0, 1], label: "q_i(B): BP's probability that node i is in group B" }, y: { domain: [0, 2], ticks: [] } });
  label(f2, 0, 1.5, "true A", { anchor: "end", dx: -10, cls: "axis-label" });
  label(f2, 0, 0.5, "true B", { anchor: "end", dx: -10, cls: "axis-label" });
  refLine(f2, [[0.5, 0], [0.5, 2]]);
  const rng = M.makeRng(9);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const qB = S.flip ? fit.marg[2 * i] : fit.marg[2 * i + 1];
    const y = (d.g[i] ? 0.5 : 1.5) + (rng.uniform() - 0.5) * 0.7;
    pts.push({ i, x: qB, y });
    dot(f2, qB, y, d.g[i] ? C.g2 : C.g1, 3.5);
  }
  nearestHover(f2, pts, (p) => [
    { value: pts[p].x.toFixed(3), label: "q_i(B)" },
    { value: d.g[pts[p].i] ? "B" : "A", label: "true group" },
  ], (p) => `node ${pts[p].i}`);

  renderThresh();
}

function nearestHover(f, pts, rows, title) {
  const rect = el("rect", { x: f.margin.l, y: f.margin.t, width: f.iw, height: f.ih, fill: "transparent" }, f.svg);
  rect.addEventListener("pointermove", (ev) => {
    const box = f.svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * f.width, py = ((ev.clientY - box.top) / box.height) * f.height;
    let best = -1, bd = 24 * 24;
    pts.forEach((p, k) => { const dx = f.xs(p.x) - px, dy = f.ys(p.y) - py, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = k; } });
    if (best < 0) return hideTip();
    showTip(ev, rows(best), title(best));
  });
  rect.addEventListener("pointerleave", hideTip);
}

// The thresholding baseline is many extra fits, so it gets its own worker, which is
// simply thrown away and restarted whenever the network changes.
let sweepWorker = null;

function startSweep() {
  if (sweepWorker) sweepWorker.terminate();
  S.thresh = [];
  sweepWorker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  sweepWorker.onmessage = ({ data: r }) => {
    S.thresh.push(r.point);
    S.threshTotal = r.total;
    renderThresh();
  };
  sweepWorker.postMessage({ type: "sweep", params: params(), seed: S.seed });
}

function renderThresh() {
  const box = clear("p-thresh");
  const ours = M.accuracy(S.fit.marg, S.data.g);
  legend(box, [{ label: "threshold Q at τ, then fit", color: C.nonedge }, { label: "this paper: use every Q", color: C.model }]);
  const f = frame(box, { height: 240, x: { domain: [0, 0.75], label: "threshold τ" }, y: { domain: [0.45, 1], label: "fraction of nodes correct" }, yFormat: (v) => v.toFixed(2) });
  refLine(f, [[0, 0.5], [0.75, 0.5]]);
  label(f, 0.75, 0.5, "coin toss", { anchor: "end", dx: -2, dy: -6, cls: "axis-label" });
  line(f, [[0, ours], [0.75, ours]], C.model);
  label(f, 0.0, ours, `this paper: ${(100 * ours).toFixed(1)}%`, { dx: 4, dy: -8, cls: "direct-label strong" });
  if (S.thresh.length) {
    line(f, S.thresh, C.nonedge);
    S.thresh.forEach(([t, a]) => dot(f, t, a, C.nonedge, 4));
    const best = S.thresh.reduce((m, p) => (p[1] > m[1] ? p : m));
    label(f, best[0], best[1], `best τ: ${(100 * best[1]).toFixed(1)}%`, { dx: 8, dy: 16, cls: "direct-label" });
    crosshair(f, [{ name: "thresholding", color: C.nonedge, points: S.thresh }, { name: "this paper", color: C.model, points: S.thresh.map(([t]) => [t, ours]) }],
      { xLabel: (x) => `τ = ${x.toFixed(2)}`, yFmt: (v) => `${(100 * v).toFixed(1)}%` });
  }
  if (S.thresh.length < S.threshTotal) {
    const t = el("text", { x: f.margin.l + f.iw, y: f.margin.t + 12, "text-anchor": "end", class: "axis-label" }, f.svg);
    t.textContent = `fitting thresholded networks in the background… ${S.thresh.length}/${S.threshTotal}`;
  }
}

// ---------------------------------------------------------------------------
// 8. Edge recovery
// ---------------------------------------------------------------------------

function renderEdges() {
  const d = S.data, n = d.n;
  const rq = S.rocQ, rp = S.rocP;
  tiles(clear("t-edges"), [
    { label: "AUC, posterior (Eq. 41)", value: rp.auc.toFixed(3) },
    { label: "AUC, raw Q", value: rq.auc.toFixed(3) },
    { label: "Pairs scored", value: ((n * (n - 1)) / 2).toLocaleString(), note: "Q = 0 pairs score 0 under both" },
  ]);

  // scatter: raw Q vs posterior
  const box = clear("p-move");
  legend(box, [{ label: "nodes probably in the same group", color: C.model, type: "dot" }, { label: "probably in different groups", color: C.nonedge, type: "dot" }]);
  const f = frame(box, { height: 300, x: { domain: [0, 1], label: "raw Q_ij" }, y: { domain: [0, 1], label: "posterior P(A_ij = 1 | Q)" } });
  refLine(f, [[0, 0], [1, 1]]);
  label(f, 0.9, 0.9, "unchanged", { anchor: "end", dx: -6, dy: -8, cls: "axis-label" });
  const rng = M.makeRng(4);
  const sample = S.rec.filter(() => rng.uniform() < Math.min(1, 1400 / S.rec.length));
  const pts = sample.map((r) => ({ x: r.q, y: r.post, r }));
  pts.filter((p) => p.r.same <= 0.5).forEach((p) => dot(f, p.x, p.y, C.nonedge, 3));
  pts.filter((p) => p.r.same > 0.5).forEach((p) => dot(f, p.x, p.y, C.model, 3));
  nearestHover(f, pts, (k) => [
    { value: pts[k].y.toFixed(3), label: "posterior" }, { value: pts[k].x.toFixed(3), label: "raw Q" },
    { value: pts[k].r.same.toFixed(2), label: "P(same group)" },
    { value: d.A[pts[k].r.i * n + pts[k].r.j] ? "edge" : "no edge", label: "truth" },
  ], (k) => `pair ${pts[k].r.i} – ${pts[k].r.j}`);

  // ROC
  const rb = clear("p-roc");
  legend(rb, [{ label: `posterior, Eq. 41 (AUC ${rp.auc.toFixed(3)})`, color: C.model }, { label: `raw Q (AUC ${rq.auc.toFixed(3)})`, color: C.nonedge }]);
  const f2 = frame(rb, { height: 300, x: { domain: [0, 1], label: "false-positive rate" }, y: { domain: [0, 1], label: "true-positive rate" } });
  refLine(f2, [[0, 0], [1, 1]]);
  label(f2, 0.62, 0.62, "random guessing", { dx: 8, dy: 16, cls: "axis-label" });
  const Pq = rq.curve, Pp = rp.curve;
  line(f2, Pq, C.nonedge); line(f2, Pp, C.model);
  crosshair(f2, [{ name: "posterior", color: C.model, points: Pp }, { name: "raw Q", color: C.nonedge, points: Pq }], { xLabel: (x) => `FPR = ${x.toFixed(2)}` });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

["c-n", "c-win", "c-wout", "c-b1", "c-a1"].forEach((id) =>
  $(id).addEventListener("input", () => { syncOutputs(); recompute(); }));
$("c-seed").addEventListener("click", () => { S.seed++; recompute(); });
$("c-q").addEventListener("input", () => { syncOutputs(); renderSumA(); });

let toyTimer = null;
const toyChanged = () => {
  syncOutputs();
  clearTimeout(toyTimer);
  toyTimer = setTimeout(() => { S.em = { x: 0.1, qx: null, history: [] }; recomputeToy(); }, 120);
};
$("c-twin").addEventListener("input", toyChanged);
$("c-twout").addEventListener("input", toyChanged);
$("c-tb1").addEventListener("input", toyChanged);
$("c-merge").addEventListener("change", (e) => { S.mergeMirrors = e.target.checked; renderPosterior(); });
$("c-tseed").addEventListener("click", () => { S.tseed++; S.em = { x: 0.1, qx: null, history: [] }; recomputeToy(); });

$("c-estep").addEventListener("click", () => { S.em.qx = S.em.x; renderEM(); renderPosterior(); });
$("c-mstep").addEventListener("click", () => {
  S.em.history.push(S.em.x);
  S.em.x = mStep();
  renderEM(); renderPosterior();
});
$("c-emreset").addEventListener("click", () => { S.em = { x: 0.1, qx: null, history: [] }; renderEM(); renderPosterior(); });
$("c-emrun").addEventListener("click", () => {
  const btn = $("c-emrun");
  btn.disabled = true;
  let k = 0;
  const tick = () => {
    const em = S.em;
    if (em.qx === null || Math.abs(em.qx - em.x) > 1e-12) em.qx = em.x;
    else { em.history.push(em.x); const nx = mStep(); const done = Math.abs(nx - em.x) < 1e-4; em.x = nx; if (done || k > 60) { renderEM(); renderPosterior(); btn.disabled = false; return; } }
    k++;
    renderEM(); renderPosterior();
    setTimeout(tick, 260);
  };
  tick();
});

// highlight the section in view
const links = [...document.querySelectorAll("nav.side a")];
const obs = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${e.target.id}`));
  }
}, { rootMargin: "-40% 0px -55% 0px" });
document.querySelectorAll("section").forEach((s) => obs.observe(s));

let rz = null;
window.addEventListener("resize", () => {
  clearTimeout(rz);
  rz = setTimeout(() => { renderMap(); if (S.data) renderAllMain(); renderEM(); renderPosterior(); }, 200);
});

syncOutputs();
renderMap();
recompute();
recomputeToy();
