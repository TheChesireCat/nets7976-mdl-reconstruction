import * as M from "./model.js";
import {
  C, el, frame, line, area, dot, label, refLine, crosshair, legend, heatmap, rampLegend,
  tiles, showTip, hideTip, modelRamp,
} from "../../viz-common/charts.js";

const $ = (id) => document.getElementById(id);
const clear = (id) => { const e = $(id); e.replaceChildren(); return e; };
const grid = (lo, hi, k) => Array.from({ length: k }, (_, i) => lo + ((hi - lo) * i) / (k - 1));
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;

// Everything here is cheap (the inference runs on N + 1 class counts), so it all runs on
// the page. Only the coverage experiment is split into small chunks.

const S = { seed: 1, data: null, fit: null, fb: null, eb: null, cov: null, covToken: 0 };

function params() {
  return {
    n: +$("c-n").value, rho: +$("c-rho").value, alpha: +$("c-alpha").value,
    beta: +$("c-beta").value, N: +$("c-N").value,
  };
}

function syncOutputs() {
  const p = params();
  $("o-n").textContent = p.n;
  $("o-rho").textContent = p.rho.toFixed(3);
  $("o-alpha").textContent = p.alpha.toFixed(2);
  $("o-beta").textContent = p.beta.toFixed(3);
  $("o-N").textContent = p.N;
  $("c-e").max = p.N;
  if (+$("c-e").value > p.N) $("c-e").value = p.N;
  $("o-e").textContent = $("c-e").value;
}

function recompute() {
  const p = params();
  S.data = M.generate({ ...p, seed: S.seed });
  const d = S.data;
  S.fit = M.em(d.c, d.N);
  const rng = M.makeRng(S.seed + 17);
  S.fb = M.gibbs(d.c, d.N, rng);
  S.eb = M.ebEdgeCounts(d.c, S.fit.Q, rng);
  const st = $("status");
  const bad = p.alpha <= p.beta, one = p.N === 1;
  st.classList.toggle("warn", bad || one);
  st.textContent = bad ? "⚠ α ≤ β: an edge is no more likely to be seen than a non-edge; the model can't tell them apart"
    : one ? "⚠ N = 1: the data only fix the overall report rate, so ρ, α and β can't be separated"
    : `${d.m.toLocaleString()} true edges among ${d.M.toLocaleString()} pairs`;
  renderModel();
  renderFDR();
  renderEM();
  renderPosterior();
  renderMany();
  startCoverage();
}

// ---------------------------------------------------------------------------
// 0. Map
// ---------------------------------------------------------------------------

const MAP = {
  top: [
    { d: "P(A | ρ)", o: "sample", e: "prior on the network", sec: "model" },
    { d: "P(E | A, α, β)", o: "sample", e: "Eq. 7", sec: "model" },
    { d: "P(A, θ | E)", o: "Bayes' rule", e: "Eqs. 1, 8", sec: "model" },
  ],
  bottom: [
    { d: "P(θ | E)", o: "sum over A", e: "Eqs. 1–2", sec: "em" },
    { d: "θ̂ = (ρ̂, α̂, β̂)", o: "maximize · EM", e: "Eqs. 3–5", sec: "em" },
    { d: "P(A | E, θ̂) = Π Q_ij", o: "condition", e: "Eqs. 3, 6, 12", sec: "posterior" },
    { d: "P(f(A) | E)", o: "sample · average", e: "Suppl. S5", sec: "many" },
  ],
};

function renderMap() {
  const box = clear("p-map");
  const W = Math.max(720, box.clientWidth), H = 280, cols = 4, gap = 24;
  const bw = (W - gap * (cols - 1)) / cols, bh = 66;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, box);
  const mk = el("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, el("defs", {}, svg));
  el("path", { d: "M0,0 L10,5 L0,10 z", fill: C.axis }, mk);
  const rows = [{ y: 34, nodes: MAP.top, label: "Generative model · forward" }, { y: 186, nodes: MAP.bottom, label: "Inference · backward" }];
  const pos = [];
  rows.forEach((row, ri) => {
    const t = el("text", { x: 0, y: row.y - 12, class: "map-row-label" }, svg);
    t.textContent = row.label;
    pos[ri] = [];
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
      pos[ri].push(x);
      if (k > 0) el("line", { x1: x - gap + 2, x2: x - 3, y1: row.y + bh / 2, y2: row.y + bh / 2, stroke: C.axis, "stroke-width": 1.5, "marker-end": "url(#arrow)" }, svg);
    });
  });
  // the joint (top right) feeds inference (bottom left)
  const x3 = pos[0][2] + bw / 2, x1 = pos[1][0] + bw / 2, yMid = 34 + bh + 32;
  el("path", { d: `M${x3},${34 + bh} V${yMid} H${x1} V${186 - 3}`, fill: "none", stroke: C.axis, "stroke-width": 1.5, "marker-end": "url(#arrow)" }, svg);
  const jl = el("text", { x: (x1 + x3) / 2, y: yMid - 7, "text-anchor": "middle", class: "direct-label" }, svg);
  jl.textContent = "P(A, θ | E) ∝ P(E | A, θ) · P(A | θ) · P(θ)";
  // EM loop between maximize and condition
  const mx = pos[1][1] + bw / 2, po = pos[1][2] + bw / 2, yb = 186 + bh;
  el("path", { d: `M${po},${yb + 3} C${po},${yb + 28} ${mx},${yb + 28} ${mx},${yb + 3}`, fill: "none", stroke: C.model, "stroke-width": 1.5, "marker-end": "url(#arrow)" }, svg);
  const lt = el("text", { x: (mx + po) / 2, y: yb + 22, "text-anchor": "middle", class: "direct-label" }, svg);
  lt.textContent = "EM alternates these two";
}

// ---------------------------------------------------------------------------
// 1. Model and data
// ---------------------------------------------------------------------------

function renderModel() {
  const d = S.data, n = d.n, N = d.N;
  tiles(clear("t-model"), [
    { label: "Pairs", value: d.M.toLocaleString() },
    { label: "True edges", value: d.m.toLocaleString(), note: `density ${(d.m / d.M).toFixed(3)}` },
    { label: "Measurements per pair", value: N },
    { label: "Pairs never seen", value: pct(d.c[0] / d.M), note: `${d.c1[0].toLocaleString()} of them are real edges` },
  ]);

  // grouped bars on a log scale: true edges vs non-edges, for each count e
  const box = clear("p-counts");
  legend(box, [{ label: "true edges", color: C.edge, type: "rect" }, { label: "non-edges", color: C.nonedge, type: "rect" }]);
  const hi = Math.ceil(Math.log10(Math.max(...d.c) + 1) + 0.05);
  const f = frame(box, {
    x: { domain: [-0.5, N + 0.5], label: "E: times an edge was seen, out of N", ticks: grid(0, N, N + 1) }, xFormat: (v) => v.toFixed(0),
    y: { domain: [0, hi], label: "pairs", ticks: grid(0, hi, hi + 1) }, yFormat: (v) => (10 ** v).toLocaleString(),
  });
  const slot = f.iw / (N + 1), bw = Math.min(20, (slot - 8) / 2);
  for (let e = 0; e <= N; e++) {
    const c1 = d.c1[e], c0 = d.c[e] - d.c1[e];
    [[c1, C.edge, -1], [c0, C.nonedge, 1]].forEach(([v, col, side]) => {
      if (v <= 0) return;
      const x = f.xs(e) + (side < 0 ? -bw - 1 : 1), y = f.ys(Math.log10(v + 1));
      el("path", { d: `M${x},${f.ys(0)} V${y + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${f.ys(0)} Z`, fill: col }, f.plot);
    });
    const hit = el("rect", { x: f.xs(e) - slot / 2, y: f.margin.t, width: slot, height: f.ih, fill: "transparent" }, f.plot);
    hit.addEventListener("pointermove", (ev) => showTip(ev, [
      { color: C.edge, value: c1.toLocaleString(), label: "true edges" },
      { color: C.nonedge, value: c0.toLocaleString(), label: "non-edges" },
      { value: pct(c1 / Math.max(1, d.c[e])), label: "are real edges" },
    ], `seen ${e} of ${N} times`));
    hit.addEventListener("pointerleave", hideTip);
  }

  const aq = clear("p-AE");
  const order = Array.from({ length: n }, (_, i) => i);
  const size = Math.max(150, Math.min(300, Math.floor((aq.clientWidth - 30) / 2)));
  const col = (title) => { const c = document.createElement("div"); const h = document.createElement("div"); h.className = "hm-title"; h.textContent = title; c.appendChild(h); aq.appendChild(c); return c; };
  const tip = (i, j) => [
    { value: `${d.E[i * n + j]} of ${N}`, label: "times seen (observed)" },
    { value: d.A[i * n + j] ? "edge" : "no edge", label: "truth (hidden)" },
  ];
  heatmap(col("Hidden: A"), { n, order, value: (i, j) => d.A[i * n + j], size, tooltip: tip });
  heatmap(col("Observed: E / N"), { n, order, value: (i, j) => d.E[i * n + j] / N, size, tooltip: tip });
  rampLegend(aq, "0", "1", "same scale for both");
}

// ---------------------------------------------------------------------------
// 2. False positives vs false discoveries
// ---------------------------------------------------------------------------

function renderFDR() {
  const { rho, alpha, beta } = params();
  const tp = rho * alpha, fp = (1 - rho) * beta;
  const fdr = fp / (tp + fp);
  tiles(clear("t-fdr"), [
    { label: "False-positive rate β", value: pct(beta, 2), note: "share of non-edges reported" },
    { label: "False discovery rate", value: pct(fdr), note: "share of reports that are false" },
    { label: "Non-edges per edge", value: ((1 - rho) / rho).toFixed(0), note: "(1 − ρ) / ρ" },
  ]);
  const box = clear("p-fdr");
  const W = Math.max(400, box.clientWidth), H = 170, x0 = 170, xw = W - x0 - 40;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, box);
  const bar = (y, title, sub, parts) => {
    const t = el("text", { x: x0 - 12, y: y + 12, "text-anchor": "end", class: "direct-label strong" }, svg); t.textContent = title;
    const s = el("text", { x: x0 - 12, y: y + 28, "text-anchor": "end", class: "axis-label" }, svg); s.textContent = sub;
    let x = x0;
    const tot = parts.reduce((a, p) => a + p.v, 0);
    parts.forEach((p, k) => {
      const w = Math.max(0, (p.v / tot) * xw - (k < parts.length - 1 ? 2 : 0));
      const r = el("rect", { x, y, width: w, height: 26, fill: p.color, rx: k === parts.length - 1 ? 4 : 0 }, svg);
      if (w > 70) { const lt = el("text", { x: x + 8, y: y + 17, fill: "#0d0d0d", "font-size": 11.5, "font-weight": 600 }, svg); lt.textContent = `${p.name} ${pct(p.v / tot)}`; }
      r.addEventListener("pointermove", (ev) => showTip(ev, [{ color: p.color, value: pct(p.v / tot, 2), label: p.name }], title));
      r.addEventListener("pointerleave", hideTip);
      x += w + 2;
    });
  };
  bar(20, "Of all non-edges", "false-positive rate", [
    { name: "reported", v: beta, color: C.g2 }, { name: "not reported", v: 1 - beta, color: C.nonedge },
  ]);
  bar(100, "Of all reports", "false discovery rate", [
    { name: "false", v: fp, color: C.g2 }, { name: "real edges", v: tp, color: C.edge },
  ]);
  legend(box, [{ label: "a false report", color: C.g2, type: "rect" }, { label: "a real edge reported", color: C.edge, type: "rect" }, { label: "silent non-edge", color: C.nonedge, type: "rect" }]);
}

// ---------------------------------------------------------------------------
// 3. EM landscape
// ---------------------------------------------------------------------------

function renderEM() {
  const d = S.data, { theta, path } = S.fit;
  tiles(clear("t-em"), [
    { label: "ρ̂", value: theta.rho.toFixed(4), note: `true ${d.rho.toFixed(3)}` },
    { label: "α̂", value: theta.alpha.toFixed(3), note: `true ${d.alpha.toFixed(2)}` },
    { label: "β̂", value: theta.beta.toFixed(4), note: `true ${d.beta.toFixed(3)}` },
    { label: "EM iterations", value: path.length - 1 },
  ]);
  const box = clear("p-landscape");
  legend(box, [{ label: "EM path", color: C.ink2 }, { label: "estimate θ̂", color: C.model, type: "dot" }, { label: "true θ", color: C.edge, type: "dot" }]);
  const lb = [-3, -0.5]; // log10(beta)
  const f = frame(box, {
    height: 340, x: { domain: [0.02, 0.98], label: "α (true-positive rate)" },
    y: { domain: lb, label: "β (false-positive rate, log scale)", ticks: [-3, -2, -1] }, yFormat: (v) => (10 ** v).toString(),
  });
  // likelihood surface, drawn as an image behind the axes
  const GX = 90, GY = 70;
  const L = new Float64Array(GX * GY);
  let lmax = -Infinity, lmin = Infinity;
  for (let gy = 0; gy < GY; gy++)
    for (let gx = 0; gx < GX; gx++) {
      const a = 0.02 + (0.96 * (gx + 0.5)) / GX, b = 10 ** (lb[1] - ((lb[1] - lb[0]) * (gy + 0.5)) / GY);
      const v = M.logLik(d.c, d.N, { rho: theta.rho, alpha: a, beta: b });
      L[gy * GX + gx] = v; lmax = Math.max(lmax, v); lmin = Math.min(lmin, v);
    }
  const cv = document.createElement("canvas");
  cv.width = GX; cv.height = GY;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(GX, GY);
  const span = Math.log10(1 + lmax - lmin);
  for (let k = 0; k < L.length; k++) {
    const t = 1 - Math.log10(1 + lmax - L[k]) / span; // log-compressed drop from the peak
    const c = modelRamp(t);
    img.data.set([c[0], c[1], c[2], 255], 4 * k);
  }
  ctx.putImageData(img, 0, 0);
  el("image", { href: cv.toDataURL(), x: f.margin.l, y: f.margin.t, width: f.iw, height: f.ih, preserveAspectRatio: "none", style: "image-rendering: pixelated" }, f.plot);
  const pts = path.map((t) => [t.alpha, Math.log10(Math.max(1e-3, t.beta))]);
  line(f, pts, C.ink2, { "stroke-width": 1.5 });
  pts.forEach((p, k) => { if (k % 3 === 0) dot(f, p[0], p[1], C.ink2, 2.5); });
  label(f, pts[0][0], pts[0][1], "start", { dx: 8, dy: 4, cls: "direct-label" });
  dot(f, d.alpha, Math.log10(d.beta), C.edge, 6);
  dot(f, theta.alpha, Math.log10(theta.beta), C.model, 6);
  label(f, theta.alpha, Math.log10(theta.beta), "θ̂", { dx: 10, dy: -8, cls: "direct-label strong" });
  // hover: read the surface
  const hit = el("rect", { x: f.margin.l, y: f.margin.t, width: f.iw, height: f.ih, fill: "transparent" }, f.svg);
  hit.addEventListener("pointermove", (ev) => {
    const r = f.svg.getBoundingClientRect();
    const a = f.xs.inv(((ev.clientX - r.left) / r.width) * f.width), lbv = f.ys.inv(((ev.clientY - r.top) / r.height) * f.height);
    const v = M.logLik(d.c, d.N, { rho: theta.rho, alpha: a, beta: 10 ** lbv });
    showTip(ev, [{ value: (v - lmax).toFixed(1), label: "log-likelihood below the peak" }], `α = ${a.toFixed(2)}, β = ${(10 ** lbv).toFixed(4)}`);
  });
  hit.addEventListener("pointerleave", hideTip);
}

// ---------------------------------------------------------------------------
// 4. The posterior over networks
// ---------------------------------------------------------------------------

function renderPosterior() {
  const d = S.data, N = d.N, { Q, theta } = S.fit, e0 = +$("c-e").value;
  const box = clear("p-Q");
  legend(box, [{ label: "Q at θ̂ (Eq. 6)", color: C.model }, { label: "actual share of true edges", color: C.edge, type: "dot" }]);
  const f = frame(box, { height: 300, x: { domain: [-0.3, N + 0.3], label: "E: times seen, out of N", ticks: grid(0, N, N + 1) }, xFormat: (v) => v.toFixed(0), y: { domain: [0, 1], label: "P(edge | E)" } });
  const qpts = Q.map((q, e) => [e, q]);
  line(f, qpts, C.model);
  qpts.forEach(([e, q]) => dot(f, e, q, C.model, 5));
  const emp = [];
  for (let e = 0; e <= N; e++) if (d.c[e] > 0) emp.push({ x: e, y: d.c1[e] / d.c[e], e });
  emp.forEach((p) => dot(f, p.x, p.y, C.edge, 3.5));
  refLine(f, [[e0, 0], [e0, 1]], C.ink2);
  crosshair(f, [{ name: "Q (model)", color: C.model, points: qpts }, { name: "share of true edges", color: C.edge, points: qpts.map(([e]) => [e, d.c[e] ? d.c1[e] / d.c[e] : NaN]) }],
    { xLabel: (x) => `seen ${x} of ${N} times (${d.c[x].toLocaleString()} pairs)` });

  // log-odds waterfall for the chosen count
  const lo = M.logOdds(e0, N, theta);
  const lb = clear("p-logodds");
  const steps = [
    { name: "prior odds: log[ρ/(1 − ρ)]", v: lo.prior },
    { name: `${e0} report${e0 === 1 ? "" : "s"}: E · log(α/β)`, v: lo.hits },
    { name: `${N - e0} miss${N - e0 === 1 ? "" : "es"}: (N − E) · log[(1 − α)/(1 − β)]`, v: lo.misses },
  ];
  let run = 0;
  const bars = steps.map((s) => { const b = { ...s, from: run, to: run + s.v }; run += s.v; return b; });
  const ext = Math.max(4, ...bars.map((b) => Math.abs(b.from)), ...bars.map((b) => Math.abs(b.to))) * 1.1;
  const W = Math.max(320, lb.clientWidth), H = 300, x0 = 16, xw = W - 32, rowH = 54;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, lb);
  const xs = (v) => x0 + ((v + ext) / (2 * ext)) * xw;
  el("line", { x1: xs(0), x2: xs(0), y1: 10, y2: H - 40, stroke: C.axis, "stroke-width": 1 }, svg);
  const zl = el("text", { x: xs(0), y: H - 26, "text-anchor": "middle", class: "axis-label" }, svg); zl.textContent = "0 = even odds";
  const ll = el("text", { x: x0, y: H - 26, class: "axis-label" }, svg); ll.textContent = "← non-edge";
  const rl = el("text", { x: x0 + xw, y: H - 26, "text-anchor": "end", class: "axis-label" }, svg); rl.textContent = "edge →";
  bars.forEach((b, k) => {
    const y = 14 + k * rowH;
    const t = el("text", { x: x0, y, class: "axis-label" }, svg); t.textContent = b.name;
    const a = Math.min(xs(b.from), xs(b.to)), w = Math.max(2, Math.abs(xs(b.to) - xs(b.from)));
    el("rect", { x: a, y: y + 6, width: w, height: 18, rx: 3, fill: b.v >= 0 ? C.edge : C.nonedge }, svg);
    const v = el("text", { x: b.v >= 0 ? a + w + 6 : a - 6, y: y + 19, "text-anchor": b.v >= 0 ? "start" : "end", class: "direct-label" }, svg);
    v.textContent = `${b.v >= 0 ? "+" : ""}${b.v.toFixed(2)}`;
  });
  const yT = 14 + 3 * rowH;
  const tt = el("text", { x: x0, y: yT, class: "axis-label" }, svg); tt.textContent = "total log-odds";
  const a = Math.min(xs(0), xs(lo.total)), w = Math.max(2, Math.abs(xs(lo.total) - xs(0)));
  el("rect", { x: a, y: yT + 6, width: w, height: 18, rx: 3, fill: C.model }, svg);
  const tv = el("text", { x: lo.total >= 0 ? a + w + 6 : a - 6, y: yT + 19, "text-anchor": lo.total >= 0 ? "start" : "end", class: "direct-label strong" }, svg);
  tv.textContent = `${lo.total.toFixed(2)}  →  Q = ${M.sigmoid(lo.total).toFixed(3)}`;
}

// ---------------------------------------------------------------------------
// 5. One network or many
// ---------------------------------------------------------------------------

function renderMany() {
  const d = S.data, { Q } = S.fit, fbm = S.fb.m, ebm = S.eb;
  const mapCount = Q.reduce((s, q, e) => s + (q > 0.5 ? d.c[e] : 0), 0);
  const maxdQ = Math.max(...Q.map((q, e) => Math.abs(q - S.fb.Qbar[e])));
  tiles(clear("t-many"), [
    { label: "True edge count", value: d.m.toLocaleString() },
    { label: "Most probable network", value: mapCount.toLocaleString(), note: `${mapCount >= d.m ? "+" : ""}${(mapCount - d.m).toLocaleString()} vs truth` },
    { label: "Spread: plug-in θ̂ / full Bayes", value: `±${M.sd(ebm).toFixed(0)} / ±${M.sd(fbm).toFixed(0)}` },
    { label: "Largest per-pair difference", value: maxdQ.toFixed(4), note: "|Q plug-in − Q full Bayes|" },
  ]);

  const box = clear("p-mdist");
  legend(box, [
    { label: "plug-in θ̂ (EM)", color: C.model, type: "rect" }, { label: "full Bayes", color: C.neutral, type: "rect" },
    { label: "truth", color: C.edge }, { label: "most probable network", color: C.g2 },
  ]);
  const all = [...ebm, ...fbm, d.m, mapCount];
  let lo = Math.min(...all), hi = Math.max(...all);
  const padv = (hi - lo) * 0.08 + 1; lo -= padv; hi += padv;
  const B = 40, bw = (hi - lo) / B;
  const hist = (xs) => { const h = new Array(B).fill(0); xs.forEach((x) => { h[Math.min(B - 1, Math.max(0, Math.floor((x - lo) / bw)))]++; }); return h.map((v) => v / (xs.length * bw)); };
  const he = hist(ebm), hf = hist(fbm);
  const ymax = Math.max(...he, ...hf) * 1.12;
  const f = frame(box, { height: 280, x: { domain: [lo, hi], label: "number of edges in the network" }, xFormat: (v) => Math.round(v).toLocaleString(), y: { domain: [0, ymax], label: "density" }, yFormat: (v) => v.toFixed(3) });
  const step = (h) => { const p = []; h.forEach((v, k) => { p.push([lo + k * bw, v], [lo + (k + 1) * bw, v]); }); return p; };
  area(f, step(hf), C.neutral); line(f, step(hf), C.neutral);
  area(f, step(he), C.model); line(f, step(he), C.model);
  line(f, [[d.m, 0], [d.m, ymax]], C.edge);
  label(f, d.m, ymax, "truth", { dx: 6, dy: 12, cls: "direct-label" });
  line(f, [[mapCount, 0], [mapCount, ymax]], C.g2);
  const nearRight = (mapCount - lo) / (hi - lo) > 0.7;
  label(f, mapCount, ymax * 0.8, "most probable network", { anchor: nearRight ? "end" : "start", dx: nearRight ? -6 : 6, cls: "direct-label" });
  renderCoverage();
}

function startCoverage() {
  const token = ++S.covToken;
  const p = params(), reps = 150, chunk = 15;
  let eb = 0, fb = 0, done = 0;
  S.cov = null;
  renderCoverage();
  const run = () => {
    if (token !== S.covToken) return;
    const r = M.coverage(p, chunk, S.seed * 1000 + done);
    eb += r.eb * chunk; fb += r.fb * chunk; done += chunk;
    S.cov = { eb: eb / done, fb: fb / done, done, reps };
    renderCoverage();
    if (done < reps) setTimeout(run, 0);
  };
  setTimeout(run, 20);
}

function renderCoverage() {
  const box = clear("p-coverage");
  const W = Math.max(300, box.clientWidth), H = 280, x0 = 130, xw = W - x0 - 70;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, box);
  const xs = (v) => x0 + v * xw;
  [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    el("line", { x1: xs(t), x2: xs(t), y1: 20, y2: 190, stroke: C.grid, "stroke-width": 1 }, svg);
    const lt = el("text", { x: xs(t), y: 208, "text-anchor": "middle", class: "tick" }, svg); lt.textContent = pct(t, 0);
  });
  el("line", { x1: xs(0.9), x2: xs(0.9), y1: 14, y2: 190, stroke: C.ink2, "stroke-width": 1 }, svg);
  const tl = el("text", { x: xs(0.9), y: 12, "text-anchor": "middle", class: "axis-label" }, svg); tl.textContent = "90% target";
  const cov = S.cov;
  [["plug-in θ̂", cov?.eb, C.model], ["full Bayes", cov?.fb, C.neutral]].forEach(([name, v, col], k) => {
    const y = 50 + k * 70;
    const t = el("text", { x: x0 - 12, y: y + 16, "text-anchor": "end", class: "direct-label strong" }, svg); t.textContent = name;
    if (v == null) return;
    el("rect", { x: x0, y, width: Math.max(2, xs(v) - x0), height: 24, rx: 4, fill: col }, svg);
    const vt = el("text", { x: xs(v) + 8, y: y + 17, class: "direct-label strong" }, svg); vt.textContent = pct(v, 0);
  });
  const note = el("text", { x: x0, y: 240, class: "axis-label" }, svg);
  note.textContent = cov ? `${cov.done} of ${cov.reps} networks generated with the top-bar settings${cov.done < cov.reps ? " …" : ""}` : "generating networks…";
  const note2 = el("text", { x: x0, y: 258, class: "axis-label" }, svg);
  note2.textContent = "each: fit, draw 90% interval for the edge count, check the truth";
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

let frameReq = null;
const schedule = () => { if (frameReq) return; frameReq = requestAnimationFrame(() => { frameReq = null; recompute(); }); };
["c-n", "c-rho", "c-alpha", "c-beta", "c-N"].forEach((id) => $(id).addEventListener("input", () => { syncOutputs(); schedule(); }));
$("c-e").addEventListener("input", () => { syncOutputs(); renderPosterior(); });
$("c-seed").addEventListener("click", () => { S.seed++; recompute(); });
$("c-preset").addEventListener("click", () => {
  // Newman's estimates for the reality-mining data: 96 students, 8 Wednesdays
  Object.entries({ "c-n": 96, "c-rho": 0.0335, "c-alpha": 0.42, "c-beta": 0.004, "c-N": 8 }).forEach(([id, v]) => { $(id).value = v; });
  syncOutputs(); recompute();
});

const links = [...document.querySelectorAll("nav.side a[href^='#']")];
const obs = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${e.target.id}`));
}, { rootMargin: "-40% 0px -55% 0px" });
document.querySelectorAll("section").forEach((s) => obs.observe(s));

let rz = null;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { renderMap(); recompute(); }, 200); });

syncOutputs();
renderMap();
recompute();
