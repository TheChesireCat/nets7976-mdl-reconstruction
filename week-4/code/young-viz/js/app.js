import * as M from "./model.js";
import {
  C, el, frame, line, dot, label, refLine, legend, tiles, showTip, hideTip, heatmap, rampLegend, edgeRamp, themedRamp, fmt,
} from "../../../../week-3/code/viz-common/charts.js";
import { CHAIN, clipped, bar, traceChart, flowMap, samplerClient } from "../../viz-common/charts4.js";

const $ = (id) => document.getElementById(id);
const clear = (id) => { const e = $(id); e.replaceChildren(); return e; };
const range = (lo, hi, k) => Array.from({ length: k }, (_, i) => lo + ((hi - lo) * i) / (k - 1));
const pctile = (arr, q) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;

const sample = samplerClient(new URL("../../viz-common/worker.js", import.meta.url), { main: "sampling", k2: "types", k3: "types" });

// Posterior summaries reported in the paper (§3.1.1, Fig. 5 caption)
const PAPER = {
  2: { "λ₀": "0.62 [0.06, 0.98]", "λ₁": "14.3 [10.8, 16.8]", "ρ": "0.28 [0.18, 0.43]", p: 0.136 },
  3: { "λ₀": "≈ 0.02", "λ₁": "5.13", "λ₂": "21.97", "ρ₁": "0.28", "ρ₂": "0.14", p: 0.722 },
};

const S = { K: 2, sampler: "hmc", seed: 1, netSeed: 1, D: null, main: null, k2: null, k3: null };

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

// Over-dispersed starting points: rates anywhere between 0.1 and 30, equal weights
function starts(K, seed) {
  const rng = M.makeRng(seed);
  return Array.from({ length: 4 }, () => {
    const lam = Array.from({ length: K }, () => 0.1 + 30 * rng.uniform()).sort((a, b) => a - b);
    for (let k = 1; k < K; k++) if (lam[k] - lam[k - 1] < 0.5) lam[k] = lam[k - 1] + 0.5;
    return { lam, pi: new Array(K).fill(1 / K) };
  });
}

function request({ K, sampler, iters, seed }) {
  const D = S.D;
  return {
    target: { values: D.h.values, counts: D.h.counts, K, ordered: true },
    sampler, starts: starts(K, 100 + seed), iters, warmup: Math.floor(iters / 2), seed: 200 + seed,
    opts: sampler === "hmc" ? { eps: 0.1, L: 10, adapt: true } : { scale: 0.1, adapt: true },
    ppc: { xs: D.xs, n: 500 },
  };
}

// Everything the charts need from one set of chains
function derive(res, K, warmup, sampler) {
  const D = S.D;
  const post = res.chains.flatMap((c) => c.params.slice(warmup));
  const thin = Math.max(1, Math.floor(post.length / 1000));
  const draws = post.filter((_, i) => i % thin === 0);
  const Qs = draws.map((p) => M.qByValue(D.h.values, p));
  // per distinct count: mean Q(k) and the spread of P(any edge) over θ
  const perValue = new Map();
  for (const v of D.h.values) {
    const qs = Qs.map((Q) => Q.get(v));
    const mean = qs[0].map((_, k) => avg(qs.map((q) => q[k])));
    const any = qs.map((q) => 1 - q[0]);
    perValue.set(v, { mean, any: avg(any), lo: pctile(any, 0.05), hi: pctile(any, 0.95) });
  }
  // networks: one per thinned draw
  const rng = M.makeRng(7);
  const stats = Qs.map((Q) => M.netStats(D.n, D.pairs, M.drawNetwork(D.pairs, Q, rng)));
  return { ...res, K, warmup, sampler, draws, Qs, perValue, m: stats.map((s) => s.m), tri: stats.map((s) => s.tri) };
}

async function runMain() {
  const K = S.K, sampler = S.sampler, iters = +$("c-it").value;
  const t0 = performance.now();
  const msg = request({ K, sampler, iters, seed: S.seed });
  const res = await sample("main", msg);
  S.main = derive(res, K, msg.warmup, sampler);
  const d = res.diagnostics, st = $("status");
  st.classList.toggle("warn", d.rhat > 1.01);
  st.textContent = `${sampler === "hmc" ? "HMC" : "Metropolis"} · 4 × ${iters} iterations · ${Math.round(performance.now() - t0)} ms · R̂ ${d.rhat.toFixed(3)}${d.rhat > 1.01 ? " (not converged)" : ""}`;
  renderSampling();
  renderNetworks();
  renderFit();
}

async function runReference() {
  const [r2, r3] = await Promise.all([2, 3].map((K) => sample(`k${K}`, request({ K, sampler: "hmc", iters: 2000, seed: S.seed }))));
  S.k2 = derive(r2, 2, 1000, "hmc");
  S.k3 = derive(r3, 3, 1000, "hmc");
  renderTypes();
  renderEM();
}

// ---------------------------------------------------------------------------
// 0. Map
// ---------------------------------------------------------------------------

const MAP = {
  top: [
    { d: "P(A | ρ)", o: "network model", e: "Eqs. 2.3, 3.2", sec: "model" },
    { d: "P(X | A, λ)", o: "data model", e: "Eqs. 2.1–2.2, 3.1", sec: "model" },
    { d: "P(θ)", o: "prior", e: "Eq. 3.3", sec: "model" },
    { d: "P(A, θ | X)", o: "Bayes' rule", e: "Eq. A.4", sec: "model" },
  ],
  bottom: [
    { d: "P(θ | X)", o: "sum over A", e: "Eq. A.12", sec: "sampling" },
    { d: "θ⁽¹⁾, …, θ⁽ᵐ⁾", o: "HMC (Stan)", e: "§A.4.1", sec: "sampling" },
    { d: "A⁽ʳ⁾ ~ Π Q_ij", o: "condition · draw", e: "Eqs. A.13–A.14", sec: "networks" },
    { d: "⟨f(A, θ)⟩", o: "average", e: "Eq. 2.4", sec: "networks" },
    { d: "X̃ vs. X", o: "check", e: "Eq. 3.4 · p-value", sec: "fit" },
  ],
};

function renderMap() {
  flowMap(clear("p-map"), { ...MAP, topLabel: "Three modelling choices · the only input", bottomLabel: "Inference · automatic", join: "P(A, θ | X) = P(A | θ, X) · P(θ | X)     (Eq. A.9)" });
}

// ---------------------------------------------------------------------------
// 1. Data
// ---------------------------------------------------------------------------

// Counts in grey: surface (never seen together) to strong ink, in each theme
const greyRamp = themedRamp(
  ["#1a1a19", "#3a3a37", "#6b6a64", "#a3a29a", "#e6e5dc"],
  ["#fcfcfb", "#dddcd5", "#aeada6", "#6b6a64", "#2c2c2a"],
);
const ORDER = Array.from({ length: 13 }, (_, i) => i + 1); // dolphins numbered 1..13 as in the paper

function renderData() {
  const D = S.D, zero = D.xs.filter((x) => x === 0).length;
  tiles(clear("t-data"), [
    { label: "Dolphins", value: D.n },
    { label: "Pairs", value: D.pairs.length },
    { label: "Never seen together", value: zero, note: `${Math.round((100 * zero) / D.pairs.length)}% of pairs` },
    { label: "Distinct counts", value: D.h.values.length, note: "the likelihood has one factor per distinct count" },
    { label: "Most often together", value: Math.max(...D.xs), note: "dolphins 11 and 12" },
  ]);
  const box = clear("p-X");
  const mx = Math.max(...D.xs);
  heatmap(box, {
    n: D.n, order: ORDER, size: Math.min(320, box.clientWidth - 10), colors: greyRamp,
    value: (a, b) => D.X[a - 1][b - 1] / mx,
    tooltip: (a, b) => [{ value: D.X[a - 1][b - 1], label: "times seen together" }],
  });
  rampLegend(box, "0", String(mx), "interactions", greyRamp);

  const box2 = clear("p-Xhist");
  const vals = D.h.values, cnt = D.h.counts;
  const f = frame(box2, {
    x: { domain: [-0.5, mx + 0.5], label: "number of interactions" }, xFormat: (v) => v.toFixed(0),
    y: { domain: [-0.35, 2], label: "pairs", ticks: [0, 1, Math.log10(46)] }, yFormat: (v) => Math.round(10 ** v).toString(),
  });
  vals.forEach((v, k) => {
    const r = bar(f, v - 0.42, v + 0.42, -0.35, Math.log10(cnt[k]), C.neutral);
    r.addEventListener("pointermove", (e) => showTip(e, [{ value: cnt[k], label: `pair${cnt[k] > 1 ? "s" : ""}` }], `seen together ${v} times`));
    r.addEventListener("pointerleave", hideTip);
  });
}

// ---------------------------------------------------------------------------
// 3. Sampling
// ---------------------------------------------------------------------------

function paramTiles(boxId, R) {
  const d = R.diagnostics, paper = PAPER[R.K];
  const row = tiles(clear(boxId), [
    ...d.rows.map((r) => ({
      label: r.name, value: r.mean.toFixed(r.mean < 1 ? 3 : 2),
      note: `95% ${r.q05.toFixed(2)}–${r.q95.toFixed(2)} · R̂ ${r.rhat.toFixed(2)} · paper ${paper[r.name]}`,
    })),
    { label: R.sampler === "hmc" ? "HMC" : "Metropolis", value: `${Math.round((1000 * d.ess) / d.evals * 10) / 10}`, note: `ESS per 1000 evaluations · worst ESS ${Math.round(d.ess)}` },
  ]);
  d.rows.forEach((r, k) => row.children[k].classList.add(r.rhat > 1.01 ? "bad" : "good"));
}

function renderSampling() {
  const R = S.main;
  if (!R) return;
  paramTiles("t-sampling", R);
  const lps = R.chains.map((c) => c.lps);
  const postLp = lps.flatMap((c) => c.slice(R.warmup));
  const lo = pctile(postLp, 0.002), hi = Math.max(...postLp);
  traceChart(clear("p-lp"), lps, (v) => v, R.warmup, { yLabel: "log density (sampler scale)", height: 240, yDomain: [lo - 0.6 * (hi - lo), hi + 0.15 * (hi - lo)] });
  renderPairs(clear("p-pairs"), R);
}

function renderPairs(box, R) {
  const K = R.K;
  const names = K === 2 ? ["ρ", "λ₀", "λ₁"] : ["λ₀", "λ₁", "λ₂"];
  const get = K === 2 ? [(p) => p.pi[1], (p) => p.lam[0], (p) => p.lam[1]] : [(p) => p.lam[0], (p) => p.lam[1], (p) => p.lam[2]];
  const chains = R.chains.map((c) => c.params.slice(R.warmup).filter((_, i) => i % 4 === 0));
  const all = chains.flat();
  const doms = get.map((g) => { const v = all.map(g); const a = Math.min(...v), b = Math.max(...v), p = (b - a) * 0.06 || 0.1; return [Math.max(0, a - p), b + p]; });
  const W = Math.max(280, box.clientWidth), n = 3, L = 44, B = 34, cs = (W - L) / n, H = cs * n + B;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, box);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x0 = L + j * cs + 4, y0 = i * cs + 4, w = cs - 8;
      const sx = (v) => x0 + ((v - doms[j][0]) / (doms[j][1] - doms[j][0])) * w;
      const sy = (v) => y0 + w - ((v - doms[i][0]) / (doms[i][1] - doms[i][0])) * w;
      if (i < j) {
        // correlation in the upper triangle
        const a = all.map(get[j]), b = all.map(get[i]), ma = avg(a), mb = avg(b);
        const r = a.reduce((s, v, k) => s + (v - ma) * (b[k] - mb), 0) / Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0) * b.reduce((s, v) => s + (v - mb) ** 2, 0));
        const t = el("text", { x: x0 + w / 2, y: y0 + w / 2 + 5, "text-anchor": "middle", class: "direct-label strong" }, svg);
        t.textContent = `r = ${r.toFixed(2)}`;
        continue;
      }
      el("rect", { x: x0, y: y0, width: w, height: w, fill: "none", stroke: C.grid }, svg);
      if (i === j) {
        const v = all.map(get[j]), bins = 22, bw = (doms[j][1] - doms[j][0]) / bins, c = new Array(bins).fill(0);
        v.forEach((q) => { c[Math.min(bins - 1, Math.floor((q - doms[j][0]) / bw))]++; });
        const top = Math.max(...c);
        c.forEach((q, k) => el("rect", { x: x0 + (k / bins) * w + 0.5, y: y0 + w - (q / top) * (w - 6), width: w / bins - 1, height: (q / top) * (w - 6), fill: C.model, opacity: 0.8 }, svg));
      } else {
        chains.forEach((ch, k) => ch.forEach((p) => el("circle", { cx: sx(get[j](p)), cy: sy(get[i](p)), r: 1.5, fill: CHAIN[k], opacity: 0.5 }, svg)));
      }
      if (i === n - 1) {
        const t = el("text", { x: x0 + w / 2, y: H - 6, "text-anchor": "middle", class: "axis-label" }, svg); t.textContent = names[j];
        [doms[j][0], doms[j][1]].forEach((v, e) => { const tt = el("text", { x: e ? x0 + w : x0, y: y0 + w + 13, "text-anchor": e ? "end" : "start", class: "tick" }, svg); tt.textContent = fmt(v, v < 2 ? 2 : 1); });
      }
      if (j === 0 && i > 0) {
        const t = el("text", { x: 12, y: y0 + w / 2, "text-anchor": "middle", class: "axis-label", transform: `rotate(-90 12 ${y0 + w / 2})` }, svg); t.textContent = names[i];
      }
    }
}

// ---------------------------------------------------------------------------
// 4. Networks
// ---------------------------------------------------------------------------

function circle(n, cx, cy, r) {
  return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
}

function drawNodes(svg, pos) {
  pos.forEach(([x, y], i) => {
    el("circle", { cx: x, cy: y, r: 10, class: "net-node" }, svg);
    const t = el("text", { x, y: y + 3.5, "text-anchor": "middle", class: "net-label" }, svg); t.textContent = i + 1;
  });
}

function renderNetworks() {
  const R = S.main, D = S.D;
  if (!R) return;
  const rng = M.makeRng(900 + S.netSeed);
  const picks = [0, 1].map(() => R.Qs[Math.floor(rng.uniform() * R.Qs.length)]);
  const nets = picks.map((Q) => M.drawNetwork(D.pairs, Q, rng));
  const box = clear("p-nets");
  legend(box, [{ label: "in both draws", color: C.edge }, { label: "in only one", color: C.g2 }, ...(R.K === 3 ? [{ label: "thick = strong tie", color: C.neutral }] : [])]);
  const W = Math.max(300, box.clientWidth), H = W / 2 + 10;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, box);
  nets.forEach((A, s) => {
    const cx = W / 4 + (s * W) / 2, pos = circle(D.n, cx, H / 2, W / 4 - 22);
    D.pairs.forEach((p, e) => {
      if (!A[e]) return;
      const both = nets[1 - s][e] > 0;
      el("line", { x1: pos[p.i][0], y1: pos[p.i][1], x2: pos[p.j][0], y2: pos[p.j][1], stroke: both ? C.edge : C.g2, "stroke-width": A[e] === 2 ? 3.2 : 1.4, opacity: 0.9 }, svg);
    });
    drawNodes(svg, pos);
  });

  // posterior edge probability matrix, log colour scale
  const box2 = clear("p-Q");
  const P = new Map(D.pairs.map((p) => [`${p.i + 1}-${p.j + 1}`, R.perValue.get(p.x)]));
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  heatmap(box2, {
    n: D.n, order: ORDER, size: Math.min(320, box2.clientWidth - 10), colors: edgeRamp,
    value: (a, b) => Math.max(0, (Math.log10(Math.max(P.get(key(a, b)).any, 1e-3)) + 3) / 3),
    tooltip: (a, b) => {
      const q = P.get(key(a, b)), x = D.X[a - 1][b - 1];
      const rows = [{ value: x, label: "times seen together" }, { value: q.any.toFixed(3), label: "P(edge | X)" }, { value: `${q.lo.toFixed(3)} – ${q.hi.toFixed(3)}`, label: "90% range of Q over θ" }];
      if (R.K === 3) rows.push({ value: q.mean[1].toFixed(2), label: "P(weak)" }, { value: q.mean[2].toFixed(2), label: "P(strong)" });
      return rows;
    },
  });
  rampLegend(box2, "≤ 10⁻³", "1", "posterior edge probability (log)", edgeRamp);

  const unsure = D.pairs.filter((p) => { const a = R.perValue.get(p.x).any; return a > 0.1 && a < 0.9; }).length;
  tiles(clear("t-networks"), [
    { label: "Edges", value: avg(R.m).toFixed(1), note: `90%: ${pctile(R.m, 0.05)} – ${pctile(R.m, 0.95)}` },
    { label: "Triangles", value: avg(R.tri).toFixed(1), note: `90%: ${pctile(R.tri, 0.05)} – ${pctile(R.tri, 0.95)}` },
    { label: "Uncertain pairs", value: unsure, note: "0.1 < P(edge) < 0.9" },
  ]);
}

// ---------------------------------------------------------------------------
// 5. Goodness of fit
// ---------------------------------------------------------------------------

function r2(R) {
  const xs = S.D.xs, draws = R.ppc.draws;
  const mbar = xs.map((_, i) => avg(draws.map((d) => d.m[i])));
  const xbar = avg(xs);
  return 1 - xs.reduce((s, x, i) => s + (x - mbar[i]) ** 2, 0) / xs.reduce((s, x) => s + (x - xbar) ** 2, 0);
}

function discChart(box, sets) {
  const all = sets.flatMap((s) => s.draws.flatMap((d) => [d.dData, d.dRep]));
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.05 || 1;
  const f = frame(box, { height: 280, x: { domain: [lo - pad, hi + pad], label: "D(X; θ), real data" }, xFormat: (v) => fmt(v, 0), y: { domain: [lo - pad, hi + pad], label: "D(X̃; θ), fake data" }, yFormat: (v) => fmt(v, 0) });
  refLine(f, [[lo - pad, lo - pad], [hi + pad, hi + pad]], C.ink2);
  sets.forEach((s) => s.draws.forEach((d) => el("circle", { cx: f.xs(d.dData), cy: f.ys(d.dRep), r: 2.2, fill: s.color(d), opacity: 0.65 }, f.plot)));
  return f;
}

function renderFit() {
  const R = S.main, D = S.D;
  if (!R) return;
  const { p, draws } = R.ppc;
  const row = tiles(clear("t-fit"), [
    { label: "Posterior-predictive p", value: p.toFixed(3), note: `paper: ${PAPER[R.K].p}` },
    { label: "R²", value: r2(R).toFixed(2), note: "observed vs. expected counts" },
    { label: "Model", value: `${R.K} edge types` },
  ]);
  row.children[0].classList.add(p < 0.25 || p > 0.95 ? "bad" : "good");

  // observed vs predicted, with the fitted tie types shaded along x
  const box = clear("p-obspred");
  const top = 38;
  const f = frame(box, { height: 280, x: { domain: [-1, top], label: "observed interactions" }, xFormat: (v) => v.toFixed(0), y: { domain: [-1, top], label: "predicted interactions" }, yFormat: (v) => v.toFixed(0) });
  const lamBar = R.diagnostics.rows.filter((r) => r.name.startsWith("λ")).map((r) => r.mean);
  const piBar = R.K === 2 ? [1 - R.diagnostics.rows[2].mean, R.diagnostics.rows[2].mean] : (() => { const r1 = R.diagnostics.rows[3].mean, r2v = R.diagnostics.rows[4].mean; return [1 - r1 - r2v, r1, r2v]; })();
  const typeAt = (x) => { const q = M.resp(x, lamBar, piBar); return q.indexOf(Math.max(...q)); };
  const names = R.K === 2 ? ["no tie", "tie"] : ["no tie", "weak", "strong"];
  let start = -1, cur = typeAt(0);
  for (let x = 1; x <= top + 1; x++) {
    const t = x <= top ? typeAt(x) : -1;
    if (t !== cur) {
      const x0 = start, x1 = Math.min(top, x - 0.5);
      el("rect", { x: f.xs(x0), y: f.margin.t, width: f.xs(x1) - f.xs(x0), height: f.ih, fill: cur % 2 ? C.grid : "transparent", opacity: 0.8 }, f.plot);
      label(f, (x0 + x1) / 2, top, names[cur], { anchor: "middle", dx: 0, dy: 14 });
      start = x - 0.5; cur = t;
    }
  }
  refLine(f, [[-1, -1], [top, top]], C.ink2);
  const jr = M.makeRng(5);
  draws.slice(0, 5).forEach((d) => d.rep.forEach((r, i) => el("circle", { cx: f.xs(D.xs[i] + 0.4 * (jr.uniform() - 0.5)), cy: f.ys(r), r: 2.3, fill: C.model, opacity: 0.4 }, f.plot)));

  const box2 = clear("p-disc");
  legend(box2, [{ label: "fake data further off (counts towards p)", color: C.model, type: "dot" }, { label: "real data further off", color: C.neutral, type: "dot" }]);
  const f2 = discChart(box2, [{ draws, color: (d) => (d.dRep > d.dData ? C.model : C.neutral) }]);
  const t = el("text", { x: f2.margin.l + 8, y: f2.margin.t + 14, class: "direct-label strong" }, f2.plot);
  t.textContent = `p = ${p.toFixed(3)}`;
}

// ---------------------------------------------------------------------------
// 6. Three edge types
// ---------------------------------------------------------------------------

function renderTypes() {
  const R2 = S.k2, R3 = S.k3, D = S.D;
  if (!R2 || !R3) return;
  const rows = R3.diagnostics.rows;
  const g = (name) => rows.find((r) => r.name === name);
  const rho1 = g("ρ₁").mean, rho2 = g("ρ₂").mean;
  tiles(clear("t-types"), [
    { label: "p, two edge types", value: R2.ppc.p.toFixed(3), note: "paper 0.136" },
    { label: "p, three edge types", value: R3.ppc.p.toFixed(3), note: "paper 0.722" },
    { label: "λ₀ · λ₁ · λ₂", value: `${g("λ₀").mean.toFixed(2)} · ${g("λ₁").mean.toFixed(1)} · ${g("λ₂").mean.toFixed(1)}`, note: "paper 0.02 · 5.13 · 21.97" },
    { label: "ρ₀ · ρ₁ · ρ₂", value: `${(1 - rho1 - rho2).toFixed(2)} · ${rho1.toFixed(2)} · ${rho2.toFixed(2)}`, note: "paper 0.58 · 0.28 · 0.14" },
  ]);

  const box = clear("p-net3");
  legend(box, [{ label: "strong", color: C.edge }, { label: "weak", color: C.neutral }, { label: "ambiguous", color: C.model }]);
  const W = Math.max(280, box.clientWidth), H = Math.min(W, 340);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" }, box);
  const pos = circle(D.n, W / 2, H / 2, H / 2 - 22);
  D.pairs.forEach((p) => {
    const q = R3.perValue.get(p.x).mean, any = 1 - q[0];
    if (any < 0.05) return;
    const amb = Math.min(q[1], q[2]) > 0.25;
    const col = amb ? C.model : q[2] > q[1] ? C.edge : C.neutral;
    const ln = el("line", { x1: pos[p.i][0], y1: pos[p.i][1], x2: pos[p.j][0], y2: pos[p.j][1], stroke: col, "stroke-width": amb ? 2.2 : q[2] > q[1] ? 3.6 : 1.3, opacity: any }, svg);
    ln.addEventListener("pointermove", (e) => showTip(e, [{ value: p.x, label: "times seen together" }, { value: q[1].toFixed(2), label: "P(weak)" }, { value: q[2].toFixed(2), label: "P(strong)" }], `dolphins ${p.i + 1} – ${p.j + 1}`));
    ln.addEventListener("pointerleave", hideTip);
  });
  drawNodes(svg, pos);

  const box2 = clear("p-disc23");
  legend(box2, [{ label: `two types, p = ${R2.ppc.p.toFixed(2)}`, color: C.g2, type: "dot" }, { label: `three types, p = ${R3.ppc.p.toFixed(2)}`, color: C.model, type: "dot" }]);
  discChart(box2, [{ draws: R2.ppc.draws, color: () => C.g2 }, { draws: R3.ppc.draws, color: () => C.model }]);
}

// ---------------------------------------------------------------------------
// 7. Full Bayes vs EM
// ---------------------------------------------------------------------------

function renderEM() {
  const R = S.k2, D = S.D;
  if (!R) return;
  const fit = M.em(D.h, 2);
  const rows = R.diagnostics.rows;
  const qEM = new Map(D.h.values.map((v) => [v, M.resp(v, fit.lam, fit.pi)[1]]));
  // edge counts with θ fixed at θ̂
  const rng = M.makeRng(11);
  const mEM = Array.from({ length: 2000 }, () => D.pairs.reduce((s, p) => s + (rng.uniform() < qEM.get(p.x) ? 1 : 0), 0));
  tiles(clear("t-em"), [
    { label: "θ̂ (EM)", value: `${fit.lam[0].toFixed(2)} · ${fit.lam[1].toFixed(1)} · ${fit.pi[1].toFixed(2)}`, note: "λ₀ · λ₁ · ρ, one point" },
    { label: "Posterior means", value: `${rows[0].mean.toFixed(2)} · ${rows[1].mean.toFixed(1)} · ${rows[2].mean.toFixed(2)}`, note: `ρ 95%: ${rows[2].q05.toFixed(2)}–${rows[2].q95.toFixed(2)}` },
    { label: "Edges, EM", value: avg(mEM).toFixed(1), note: `90%: ${pctile(mEM, 0.05)} – ${pctile(mEM, 0.95)}` },
    { label: "Edges, full Bayes", value: avg(R.m).toFixed(1), note: `90%: ${pctile(R.m, 0.05)} – ${pctile(R.m, 0.95)}` },
  ]);

  const box = clear("p-emq");
  const f = frame(box, { height: 280, x: { domain: [0, 1], label: "Q at θ̂ (EM)" }, xFormat: (v) => v.toFixed(1), y: { domain: [0, 1], label: "posterior mean of Q (full Bayes)" }, yFormat: (v) => v.toFixed(1) });
  refLine(f, [[0, 0], [1, 1]], C.ink2);
  D.h.values.forEach((v, k) => {
    const q = R.perValue.get(v), x = qEM.get(v);
    el("line", { x1: f.xs(x), x2: f.xs(x), y1: f.ys(q.lo), y2: f.ys(q.hi), stroke: C.model, "stroke-width": 1.5, opacity: 0.7 }, f.plot);
    const d = dot(f, x, q.any, C.model, 3 + Math.sqrt(D.h.counts[k]));
    d.addEventListener("pointermove", (e) => showTip(e, [
      { value: x.toFixed(3), label: "EM" }, { value: q.any.toFixed(3), label: "full Bayes" }, { value: `${q.lo.toFixed(3)} – ${q.hi.toFixed(3)}`, label: "90% over θ" },
      { value: D.h.counts[k], label: "pairs with this count" },
    ], `count ${v}`));
    d.addEventListener("pointerleave", hideTip);
    const unsure = q.hi - q.lo > 0.1;
    if (unsure) label(f, x, q.any, `x = ${v}`, { dx: 9, dy: 4 });
  });

  const box2 = clear("p-emm");
  legend(box2, [{ label: "EM (θ fixed at θ̂)", color: C.g2, type: "rect" }, { label: "full Bayes", color: C.model, type: "rect" }]);
  const lo = Math.min(...mEM, ...R.m), hi = Math.max(...mEM, ...R.m);
  const frac = (arr) => { const c = new Map(); arr.forEach((v) => c.set(v, (c.get(v) ?? 0) + 1)); return (v) => (c.get(v) ?? 0) / arr.length; };
  const fe = frac(mEM), fb = frac(R.m);
  const ymax = Math.max(...range(lo, hi, hi - lo + 1).map((v) => Math.max(fe(v), fb(v)))) * 1.1;
  const f2 = frame(box2, { height: 280, x: { domain: [lo - 1, hi + 1], label: "number of edges" }, xFormat: (v) => v.toFixed(0), y: { domain: [0, ymax], label: "share of networks" }, yFormat: (v) => v.toFixed(2) });
  for (let v = lo; v <= hi; v++) {
    bar(f2, v - 0.42, v, 0, fe(v), C.g2);
    bar(f2, v, v + 0.42, 0, fb(v), C.model);
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function seg(id, attr, onPick) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    [...$(id).children].forEach((x) => x.classList.toggle("on", x === b));
    onPick(b.dataset[attr]);
  });
}
seg("c-K", "k", (k) => { S.K = +k; runMain(); });
seg("c-sampler", "s", (s) => { S.sampler = s; runMain(); });
let itTimer = null;
$("c-it").addEventListener("input", () => { $("o-it").textContent = $("c-it").value; clearTimeout(itTimer); itTimer = setTimeout(runMain, 200); });
$("c-seed").addEventListener("click", () => { S.seed++; runMain(); runReference(); });
$("c-nets").addEventListener("click", () => { S.netSeed++; renderNetworks(); });

const links = [...document.querySelectorAll("nav.side a[href^='#']")];
const obs = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${e.target.id}`));
}, { rootMargin: "-40% 0px -55% 0px" });
document.querySelectorAll("section").forEach((s) => obs.observe(s));

let rz = null;
window.addEventListener("resize", () => {
  clearTimeout(rz);
  rz = setTimeout(() => { renderMap(); renderData(); renderSampling(); renderNetworks(); renderFit(); renderTypes(); renderEM(); }, 200);
});

$("o-it").textContent = $("c-it").value;
S.D = await M.loadDolphins(new URL("../data/dolphins.json", import.meta.url));
renderMap();
renderData();
runMain();
runReference();
