import * as M from "./model.js";
import { acf, checkGradient } from "../../viz-common/mcmc.js";
import {
  C, el, frame, line, area, dot, label, refLine, legend, tiles, showTip, hideTip, modelRamp, fmt,
} from "../../../../week-3/code/viz-common/charts.js";
import { CHAIN, clipped, band, bar, cross, traceChart, flowMap, samplerClient } from "../../viz-common/charts4.js";

const $ = (id) => document.getElementById(id);
const clear = (id) => { const e = $(id); e.replaceChildren(); return e; };
const range = (lo, hi, k) => Array.from({ length: k }, (_, i) => lo + ((hi - lo) * i) / (k - 1));
const sci = (x) => (x === 0 ? "0" : x < 1e-3 ? x.toExponential(1).replace("e", " × 10^") : x.toFixed(3));
const digits = (span) => Math.max(1, Math.ceil(-Math.log10(span)) + 1);

// ---------------------------------------------------------------------------
// Worker plumbing: one request per section key; stale replies are dropped.
// ---------------------------------------------------------------------------

const SECTION_OF = { mh: "mcmc", hmc: "mcmc", marg: "marg", sym: "symmetry", ppc: "ppc" };
const sample = samplerClient(new URL("../../viz-common/worker.js", import.meta.url), SECTION_OF);

const S = { seed: 1, mcSeed: 1, symSeed: 1, K: 2, toy: null, toy6: null, lap: null, mc: null, mh: null, hmc: null, marg: null, sym: null, ppc: null };

// ---------------------------------------------------------------------------
// Small drawing helpers
// ---------------------------------------------------------------------------

// Posterior surface as a raster behind the axes: brightness is linear in log density over 10 nats
function densityImage(f, logp, xd, yd, res = 84) {
  const cv = document.createElement("canvas");
  cv.width = res; cv.height = res;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(res, res);
  const vals = new Float64Array(res * res);
  let mx = -Infinity;
  for (let r = 0; r < res; r++)
    for (let c = 0; c < res; c++) {
      const x = xd[0] + ((c + 0.5) / res) * (xd[1] - xd[0]);
      const y = yd[1] - ((r + 0.5) / res) * (yd[1] - yd[0]);
      const v = logp(x, y);
      vals[r * res + c] = v;
      if (v > mx) mx = v;
    }
  for (let k = 0; k < vals.length; k++) {
    const t = Number.isFinite(vals[k]) ? Math.max(0, 1 + (vals[k] - mx) / 10) : 0;
    const col = modelRamp(0.85 * t);
    img.data.set([col[0], col[1], col[2], 255], 4 * k);
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}

function placeImage(f, href) {
  el("image", { href, x: f.margin.l, y: f.margin.t, width: f.iw, height: f.ih, preserveAspectRatio: "none", style: "image-rendering:pixelated" }, f.plot);
}

// ---------------------------------------------------------------------------
// Toy data
// ---------------------------------------------------------------------------

function toyParams() {
  return { l0: +$("c-l0").value, l1: +$("c-l1").value, rho: +$("c-rho").value, N: +$("c-N").value };
}

function makeToy() {
  const p = toyParams();
  const rng = M.makeRng(1000 + S.seed);
  const { x, z } = M.simulate(rng, p.N, [p.l0, p.l1], [1 - p.rho, p.rho]);
  S.toy = { ...p, xs: x, z, h: M.histogram(x) };
  // section 7: the same two components, optionally with a third
  const third = $("c-third").checked, l2 = +$("c-l2").value, w = +$("c-w2").value;
  const rng6 = M.makeRng(5000 + S.seed);
  const lam = third ? [p.l0, p.l1, l2] : [p.l0, p.l1];
  const pi = third ? [(1 - p.rho) * (1 - w), p.rho * (1 - w), w] : [1 - p.rho, p.rho];
  const d6 = M.simulate(rng6, p.N, lam, pi);
  S.toy6 = { xs: d6.x, z: d6.z, h: M.histogram(d6.x), lam, pi };
  const st = $("status");
  const bad = p.l1 <= p.l0;
  st.classList.toggle("warn", bad);
  const n1 = z.filter((v) => v === 1).length;
  st.textContent = bad ? "⚠ λ₁ ≤ λ₀: the \"high\" component is not higher, so the ordered model below is misspecified"
    : `${p.N} pairs · ${n1} of them friends (hidden) · max count ${Math.max(...x)}`;
}

// §3: the counts as you'd see them, with no labels
function renderToy() {
  const t = S.toy;
  $("t-toy").textContent = `First counts: ${t.xs.slice(0, 24).join(", ")}, …`;
  const xmax = Math.max(...t.xs), c = new Array(xmax + 1).fill(0);
  t.xs.forEach((x) => { c[x]++; });
  const f = frame(clear("p-toy"), { height: 200, x: { domain: [-0.5, xmax + 0.5], label: "count x" }, xFormat: (v) => v.toFixed(0), y: { domain: [0, Math.max(...c) * 1.1], label: "number of pairs" }, yFormat: (v) => fmt(v, 0) });
  c.forEach((v, x) => { if (v) bar(f, x - 0.45, x + 0.45, 0, v, C.neutral).setAttribute("opacity", 0.6); });
}

// over-dispersed starting points around a rough fit
function starts(rng, fit, K, spread = 4, N = 4) {
  return Array.from({ length: N }, () => {
    const lam = fit.lam.map((l, k) => Math.max(0.05, l * Math.exp(0.6 * (2 * rng.uniform() - 1)) + (k === 0 ? 0 : 0)));
    lam.sort((a, b) => a - b);
    for (let k = 1; k < K; k++) if (lam[k] <= lam[k - 1]) lam[k] = lam[k - 1] + 0.1;
    return { lam, pi: fit.pi.map(() => 1 / K) };
  });
}

// ---------------------------------------------------------------------------
// 0. Map
// ---------------------------------------------------------------------------

const MAP = {
  top: [
    { d: "p(θ)", o: "prior", e: "what you believe first", sec: "grid" },
    { d: "p(x | z, θ)", o: "data model", e: "how data arise", sec: "grid" },
    { d: "p(θ | x)", o: "Bayes' rule", e: "§1 · grid or formula", sec: "grid" },
    { d: "θ⁽¹⁾, …, θ⁽ᴹ⁾", o: "draw", e: "§2 · Monte Carlo", sec: "mc" },
  ],
  bottom: [
    { d: "Σ_z p(x, z | θ)", o: "sum out z", e: "§5 · exact per item", sec: "marg" },
    { d: "chains", o: "MCMC", e: "§4 · Metropolis / HMC", sec: "mcmc" },
    { d: "R̂, ESS", o: "check sampler", e: "§4, §6", sec: "mcmc" },
    { d: "λ₁ > λ₀", o: "break symmetry", e: "§6 · identify labels", sec: "symmetry" },
    { d: "X̃ vs. X", o: "check model", e: "§7 · p-value", sec: "ppc" },
  ],
};

function renderMap() {
  flowMap(clear("p-map"), { ...MAP, topLabel: "The model and its posterior", bottomLabel: "Computing and checking it", join: "when you can't draw from p(θ | x) directly" });
}

// ---------------------------------------------------------------------------
// 1. Bayes on a grid
// ---------------------------------------------------------------------------

function gridParams() {
  return { a: +$("c-a").value, b: +$("c-b").value, frac: 10 ** +$("c-frac").value };
}

function renderGrid() {
  const p = gridParams(), L = M.laplace(p);
  S.lap = L;
  $("o-a").textContent = p.a;
  $("o-b").textContent = p.b;
  $("o-frac").textContent = p.frac >= 0.01 ? `${Math.round(100 * p.frac)}%` : `${(100 * p.frac).toPrecision(1)}%`;
  const dg = digits(L.hi - L.lo);
  tiles(clear("t-grid"), [
    { label: "Births used", value: (L.boys + L.girls).toLocaleString(), note: `${L.boys.toLocaleString()} boys · ${L.girls.toLocaleString()} girls` },
    { label: "Posterior mean of θ", value: L.mean.toFixed(dg), note: `sd ${L.sd.toPrecision(2)}` },
    { label: "95% interval", value: `${L.ci[0].toFixed(dg)} – ${L.ci[1].toFixed(dg)}` },
    { label: "P(θ ≤ ½ | data)", value: sci(L.pLeHalf), note: "Laplace's question" },
    { label: "Grid vs. exact", value: L.gridErr < 1e-6 ? "< 10⁻⁶" : L.gridErr.toExponential(1), note: "max gap / peak" },
  ]);

  const pts = L.grid;
  const prior = pts.map(([t]) => [t, Math.exp(M.betaLogPdf(t, p.a, p.b))]);
  const lik = pts.map(([t]) => [t, Math.exp(M.betaLogPdf(t, L.boys + 1, L.girls + 1))]);
  const post = pts.map(([t, , ex]) => [t, ex]);
  const ymax = Math.max(...post.map((q) => q[1]), ...lik.map((q) => q[1]), ...prior.map((q) => q[1])) * 1.08;
  const xf = (v) => v.toFixed(dg);

  const box = clear("p-grid");
  legend(box, [
    { label: "prior", color: C.neutral }, { label: "likelihood", color: C.g1 },
    { label: "posterior (exact)", color: C.model }, { label: "grid", color: C.model, type: "dot" },
  ]);
  const f = frame(box, { x: { domain: [L.lo, L.hi], label: "θ = P(boy)" }, xFormat: xf, y: { domain: [0, ymax], label: "density" }, yFormat: (v) => fmt(v, 0) });
  line(f, prior, C.neutral);
  line(f, lik, C.g1, { opacity: 0.9 });
  line(f, post, C.model);
  pts.forEach(([t, g], i) => { if (i % 16 === 8) el("circle", { cx: f.xs(t), cy: f.ys(g), r: 2.6, fill: C.model }, f.plot); });

  const box2 = clear("p-summary");
  const ymax2 = Math.max(...post.map((q) => q[1])) * 1.3;
  const f2 = frame(box2, { x: { domain: [L.lo, L.hi], label: "θ = P(boy)" }, xFormat: xf, y: { domain: [0, ymax2], label: "posterior density" }, yFormat: (v) => fmt(v, 0) });
  area(f2, post.filter(([t]) => t >= L.ci[0] && t <= L.ci[1]), C.model).setAttribute("opacity", 0.22);
  line(f2, post, C.model);
  const peak = Math.max(...post.map((q) => q[1]));
  const marks = [["mean", L.mean], ["median", L.median], ["mode", L.mode]].filter(([, v]) => Number.isFinite(v));
  const spread = Math.max(...marks.map((m) => m[1])) - Math.min(...marks.map((m) => m[1]));
  const groups = spread < 0.02 * (L.hi - L.lo) ? [[marks.map((m) => m[0]).join(" ≈ "), L.mean]] : marks;
  groups.forEach(([name, v], k) => {
    const h = peak * (1.02 + 0.09 * k);
    refLine(f2, [[v, 0], [v, h]], C.ink2);
    label(f2, v, h, name, { dy: 4 });
  });
  label(f2, L.ci[0], peak * 0.06, "95%", { anchor: "end", dx: -4 });
  if (0.5 >= L.lo && 0.5 <= L.hi) {
    refLine(f2, [[0.5, 0], [0.5, ymax2]], C.g2);
    label(f2, 0.5, ymax2 * 0.97, "θ = ½", { anchor: "end", dx: -5 });
  } else {
    const z = (L.mean - 0.5) / L.sd;
    const t = el("text", { x: f2.margin.l + 6, y: f2.margin.t + 14, class: "direct-label" }, f2.plot);
    t.textContent = `θ = ½ is off the chart, ${z.toFixed(0)} sd to the ${z > 0 ? "left" : "right"}`;
  }
  renderMC();
}

// ---------------------------------------------------------------------------
// 2. Monte Carlo
// ---------------------------------------------------------------------------

function renderMC() {
  const L = S.lap, Mn = Math.round(10 ** +$("c-M").value);
  $("o-M").textContent = Mn.toLocaleString();
  const rng = M.makeRng(77 + S.mcSeed);
  const draws = Array.from({ length: Mn }, () => rng.beta(L.A, L.B));
  const mean = draws.reduce((s, v) => s + v, 0) / Mn;
  const sdHat = Math.sqrt(draws.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, Mn - 1));
  const pHat = draws.filter((v) => v <= 0.5).length / Mn;
  const dg = digits(L.hi - L.lo);
  tiles(clear("t-mc"), [
    { label: "MC estimate of the mean", value: mean.toFixed(dg + 1), note: `exact ${L.mean.toFixed(dg + 1)}` },
    { label: "MC standard error", value: (sdHat / Math.sqrt(Mn)).toPrecision(2), note: "sd / √M" },
    { label: "Estimate of P(θ ≤ ½)", value: sci(pHat), note: `exact ${sci(L.pLeHalf)}` },
  ]);

  // histogram vs exact
  const box = clear("p-mchist");
  const B = 36, w = (L.hi - L.lo) / B, cnt = new Array(B).fill(0);
  for (const v of draws) { const k = Math.floor((v - L.lo) / w); if (k >= 0 && k < B) cnt[k]++; }
  const dens = cnt.map((c) => c / (Mn * w));
  const exact = L.grid.map(([t, , ex]) => [t, ex]);
  const ymax = Math.max(...dens, ...exact.map((q) => q[1])) * 1.08;
  legend(box, [{ label: "draws", color: C.neutral, type: "rect" }, { label: "exact posterior", color: C.model }]);
  const f = frame(box, { x: { domain: [L.lo, L.hi], label: "θ" }, xFormat: (v) => v.toFixed(dg), y: { domain: [0, ymax], label: "density" }, yFormat: (v) => fmt(v, 0) });
  dens.forEach((d, k) => { if (d > 0) bar(f, L.lo + k * w, L.lo + (k + 1) * w, 0, d, C.neutral).setAttribute("opacity", 0.55); });
  line(f, exact, C.model);

  // running mean on a log axis
  const box2 = clear("p-mcrun");
  const lm = Math.log10(Mn);
  const run = [];
  let s = 0;
  for (let m = 1; m <= Mn; m++) {
    s += draws[m - 1];
    if (m < 50 || m % Math.max(1, Math.floor(Mn / 400)) === 0 || m === Mn) run.push([Math.log10(m), s / m]);
  }
  const bandPts = range(0, Math.max(lm, 0.01), 80).map((x) => { const e = (2 * L.sd) / Math.sqrt(10 ** x); return [x, L.mean - e, L.mean + e]; });
  const lo = Math.min(...run.map((q) => q[1]), L.mean - 2 * L.sd), hi = Math.max(...run.map((q) => q[1]), L.mean + 2 * L.sd);
  const f2 = frame(box2, {
    x: { domain: [0, Math.max(lm, 0.5)], label: "number of draws m (log scale)", ticks: range(0, Math.floor(lm), Math.floor(lm) + 1) },
    xFormat: (v) => (10 ** v).toLocaleString(), y: { domain: [lo, hi], label: "running mean" }, yFormat: (v) => v.toFixed(dg),
  });
  band(f2, bandPts, C.model);
  refLine(f2, [[0, L.mean], [Math.max(lm, 0.5), L.mean]], C.ink2);
  line(f2, run, C.neutral, { "stroke-width": 1.5 });
}

// ---------------------------------------------------------------------------
// 3. Metropolis vs HMC
// ---------------------------------------------------------------------------

function mcmcSettings() {
  return {
    mh: 10 ** +$("c-mh").value, eps: 10 ** +$("c-eps").value, L: +$("c-L").value, iters: +$("c-it").value, show: +$("c-show").value,
  };
}

function syncMCMC() {
  const s = mcmcSettings();
  $("o-mh").textContent = s.mh.toPrecision(2);
  $("o-eps").textContent = s.eps.toPrecision(2);
  $("o-L").textContent = s.L;
  $("o-it").textContent = s.iters;
  $("o-show").textContent = s.show;
}

async function runMCMC() {
  const t = S.toy, s = mcmcSettings();
  const fixedPi = [1 - t.rho, t.rho];
  const fit = M.em(t.h, 2);
  const rng = M.makeRng(31 + S.seed);
  const st = starts(rng, fit, 2);
  // domain: a generous box around the fit that contains the starting points
  const sd0 = Math.sqrt(Math.max(fit.lam[0], 0.3) / (t.N * (1 - t.rho))), sd1 = Math.sqrt(fit.lam[1] / (t.N * t.rho));
  const xd = [Math.max(0, Math.min(fit.lam[0] - 6 * sd0, ...st.map((q) => q.lam[0]))), Math.max(fit.lam[0] + 6 * sd0, ...st.map((q) => q.lam[0]))];
  const yd = [Math.min(fit.lam[1] - 6 * sd1, ...st.map((q) => q.lam[1])), Math.max(fit.lam[1] + 6 * sd1, ...st.map((q) => q.lam[1]))];
  const target = { values: t.h.values, counts: t.h.counts, K: 2, ordered: true, fixedPi };
  const common = { target, starts: st, iters: s.iters, warmup: Math.floor(s.iters / 4), seed: 99 + S.seed, record: 60 };
  const key = `${S.seed}|${t.l0}|${t.l1}|${t.rho}|${t.N}`;
  if (S.surfaceKey !== key) {
    const tg = M.makeTarget(target);
    S.surface = { key, xd, yd, logp: (x, y) => (y > x && x > 0 ? tg.logPost([x, y], fixedPi) : -Infinity) };
    S.surfaceImg = null;
    S.surfaceKey = key;
  }
  const [mh, hm] = await Promise.all([
    sample("mh", { ...common, sampler: "mh", opts: { scale: s.mh } }),
    sample("hmc", { ...common, sampler: "hmc", opts: { eps: s.eps, L: s.L } }),
  ]);
  S.mh = mh; S.hmc = hm; S.mcmcWarmup = common.warmup;
  renderMCMC();
}

function renderPath(boxId, res, kind) {
  const box = clear(boxId);
  if (!res) return;
  const { xd, yd } = S.surface;
  const f = frame(box, { height: 280, x: { domain: xd, label: "λ₀" }, y: { domain: yd, label: "λ₁" }, xFormat: (v) => fmt(v, 1), yFormat: (v) => fmt(v, 1) });
  if (f.iw > 0 && (!S.surfaceImg || S.surfaceImg.w !== f.iw)) S.surfaceImg = { w: f.iw, href: densityImage(f, S.surface.logp, xd, yd) };
  placeImage(f, S.surfaceImg.href);
  const g = clipped(f);
  const show = mcmcSettings().show;
  const steps = res.chains[0].steps.slice(0, show);
  const P = ([a, b]) => [f.xs(a), f.ys(b)];
  for (const s of steps) {
    const [x0, y0] = P(s.from);
    if (kind === "mh") {
      const [x1, y1] = P(s.to);
      if (s.ok) el("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: C.ink, "stroke-width": 1.4 }, g);
      else cross(g, x1, y1, C.ink2, 2.6);
    } else {
      const d = s.path.map((q) => P(q).map((v) => v.toFixed(1)).join(",")).join("L");
      el("path", { d: `M${d}`, fill: "none", stroke: C.ink2, "stroke-width": 1, opacity: 0.55 }, g);
      const [x1, y1] = P(s.path[s.path.length - 1]);
      if (s.ok) el("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: C.ink, "stroke-width": 1.4 }, g);
      else cross(g, x1, y1, C.g2, 3);
    }
  }
  const visited = [steps[0]?.from, ...steps.map((s) => (s.ok ? (kind === "mh" ? s.to : s.path[s.path.length - 1]) : null))].filter(Boolean);
  for (const q of visited) { const [x, y] = P(q); el("circle", { cx: x, cy: y, r: 2.2, fill: C.ink }, g); }
  if (steps[0]) { const [x, y] = P(steps[0].from); el("circle", { cx: x, cy: y, r: 5, fill: "none", stroke: C.g1, "stroke-width": 2 }, g); }
  const acc = steps.filter((s) => s.ok).length;
  const t = el("text", { x: f.margin.l + 8, y: f.margin.t + 16, class: "direct-label strong" }, f.plot);
  t.textContent = `${acc} of ${steps.length} accepted`;
}

function samplerTiles(boxId, res) {
  const d = res.diagnostics;
  const box = clear(boxId);
  const row = tiles(box, [
    { label: "accepted", value: `${Math.round(100 * d.accept)}%` },
    { label: "R̂", value: d.rhat.toFixed(3) },
    { label: "ESS (worst)", value: Math.round(d.ess).toLocaleString() },
    { label: "ESS / 1000 evals", value: fmt((1000 * d.ess) / d.evals, 1) },
  ]);
  row.children[1].classList.add(d.rhat > 1.01 ? "bad" : "good");
}

function renderMCMC() {
  if (!S.mh || !S.hmc) return;
  renderPath("p-path-mh", S.mh, "mh");
  renderPath("p-path-hmc", S.hmc, "hmc");
  const W = S.mcmcWarmup;
  [["mh", S.mh], ["hmc", S.hmc]].forEach(([k, res]) => {
    samplerTiles(`t-${k}`, res);
    traceChart(clear(`p-trace-${k}`), res.chains.map((c) => c.params), (p) => p.lam[1], W, { yLabel: "λ₁" });
  });
  const box = clear("p-acf");
  const a1 = acf(S.mh.chains[0].params.slice(W).map((p) => p.lam[1]), 40);
  const a2 = acf(S.hmc.chains[0].params.slice(W).map((p) => p.lam[1]), 40);
  legend(box, [{ label: "Metropolis", color: C.g2 }, { label: "HMC", color: C.model }]);
  const f = frame(box, { height: 200, x: { domain: [0, 40], label: "lag k" }, xFormat: (v) => v.toFixed(0), y: { domain: [Math.min(0, ...a1, ...a2), 1], label: "autocorrelation" }, yFormat: (v) => fmt(v, 1) });
  refLine(f, [[0, 0], [40, 0]], C.axis);
  line(f, a1.map((v, i) => [i, v]), C.g2);
  line(f, a2.map((v, i) => [i, v]), C.model);
}

let playTimer = null;
function togglePlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; $("c-play").textContent = "▶ Play"; return; }
  $("c-show").value = 1;
  $("c-play").textContent = "■ Stop";
  playTimer = setInterval(() => {
    const v = +$("c-show").value + 1;
    $("c-show").value = v;
    syncMCMC();
    renderPath("p-path-mh", S.mh, "mh");
    renderPath("p-path-hmc", S.hmc, "hmc");
    if (v >= 60) togglePlay();
  }, 160);
}

// ---------------------------------------------------------------------------
// 4b. What correlated draws mean: an AR(1) chain with stationary law N(0, 1)
// ---------------------------------------------------------------------------

function ar1(rng, n, phi) {
  const s = Math.sqrt(1 - phi * phi), x = new Float64Array(n);
  x[0] = rng.normal();
  for (let t = 1; t < n; t++) x[t] = phi * x[t - 1] + s * rng.normal();
  return x;
}

function renderCorr() {
  const phi = +$("c-phi").value;
  $("o-phi").textContent = phi.toFixed(2);
  [...$("c-phipreset").children].forEach((b) => b.classList.toggle("on", Math.abs(+b.dataset.phi - phi) < 1e-9));
  const rng = M.makeRng(2024);
  const long = ar1(rng, 2000, phi);
  const N = 100, reps = 500;
  const means = Array.from({ length: reps }, () => { const x = ar1(rng, N, phi); return x.reduce((s, v) => s + v, 0) / N; });
  const sdMean = Math.sqrt(means.reduce((s, v) => s + v * v, 0) / reps);
  const tau = (1 + phi) / (1 - phi);
  const r1 = acf(Array.from(long), 1)[1];
  tiles(clear("t-corr"), [
    { label: "lag-1 correlation", value: r1.toFixed(2), note: `set to ${phi.toFixed(2)}` },
    { label: "τ = (1 + φ)/(1 − φ)", value: tau.toFixed(2), note: "draws per independent draw" },
    { label: "ESS of 100 draws", value: Math.round(N / tau).toLocaleString() },
    { label: "sd of the average", value: sdMean.toFixed(3), note: `independent: ${(1 / Math.sqrt(N)).toFixed(3)}` },
  ]);

  const T = 60;
  const f = frame(clear("p-ar-trace"), { height: 220, x: { domain: [0, T - 1], label: "iteration" }, xFormat: (v) => v.toFixed(0), y: { domain: [-3.2, 3.2], label: "x" }, yFormat: (v) => v.toFixed(0) });
  refLine(f, [[0, 0], [T - 1, 0]], C.axis);
  const pts = Array.from(long.slice(0, T), (v, i) => [i, v]);
  line(f, pts, C.model, { "stroke-width": 1.4 });
  pts.forEach(([i, v]) => el("circle", { cx: f.xs(i), cy: f.ys(v), r: 2.4, fill: C.model }, f.plot));

  const f2 = frame(clear("p-ar-lag"), { height: 220, x: { domain: [-3.2, 3.2], label: "draw t" }, xFormat: (v) => v.toFixed(0), y: { domain: [-3.2, 3.2], label: "draw t + 1" }, yFormat: (v) => v.toFixed(0) });
  refLine(f2, [[-3.2, 0], [3.2, 0]], C.axis); refLine(f2, [[0, -3.2], [0, 3.2]], C.axis);
  for (let t = 0; t < 600; t++) el("circle", { cx: f2.xs(long[t]), cy: f2.ys(long[t + 1]), r: 1.8, fill: C.model, opacity: 0.45 }, f2.plot);
  label(f2, -3.1, 2.9, `r = ${r1.toFixed(2)}`, { cls: "direct-label strong" });

  const lo = -0.9, hi = 0.9, B = 36, w = (hi - lo) / B, cnt = new Array(B).fill(0);
  means.forEach((m) => { const k = Math.floor((m - lo) / w); if (k >= 0 && k < B) cnt[k]++; });
  const dens = cnt.map((c) => c / (reps * w));
  const ref = range(lo, hi, 120).map((x) => [x, Math.exp(-0.5 * x * x * N) * Math.sqrt(N / (2 * Math.PI))]);
  const f3 = frame(clear("p-ar-mean"), { height: 220, x: { domain: [lo, hi], label: "average of 100 draws (truth = 0)" }, xFormat: (v) => v.toFixed(1), y: { domain: [0, Math.max(...dens, ...ref.map((p) => p[1])) * 1.1], label: "density" }, yFormat: (v) => v.toFixed(0) });
  dens.forEach((d, k) => { if (d > 0) bar(f3, lo + k * w, lo + (k + 1) * w, 0, d, C.model).setAttribute("opacity", 0.6); });
  line(f3, ref, C.neutral);
}

// ---------------------------------------------------------------------------
// 4. Marginalization
// ---------------------------------------------------------------------------

async function runMarg() {
  const t = S.toy, fit = M.em(t.h, 2), rng = M.makeRng(41 + S.seed);
  S.marg = await sample("marg", {
    target: { values: t.h.values, counts: t.h.counts, K: 2, ordered: true },
    sampler: "hmc", starts: starts(rng, fit, 2), iters: 1500, warmup: 500, seed: 43 + S.seed,
    opts: { eps: 0.1, L: 10, adapt: true },
  });
  renderMarg();
}

function postDraws(res, warmup, thin = 1) {
  return res.chains.flatMap((c) => c.params.slice(warmup).filter((_, i) => i % thin === 0));
}

function renderMarg() {
  const t = S.toy, res = S.marg;
  if (!res) return;
  const rows = res.diagnostics.rows;
  const truth = { "λ₀": t.l0, "λ₁": t.l1, "ρ": t.rho };
  const lg2 = t.N * Math.log10(2);
  tiles(clear("t-marg"), [
    ...rows.map((r) => ({ label: `${r.name}  (true ${truth[r.name]})`, value: r.mean.toFixed(2), note: `95%: ${r.q05.toFixed(2)} – ${r.q95.toFixed(2)}` })),
    { label: "Labellings summed out", value: `2^${t.N}`, note: `≈ 10^${Math.floor(lg2)}, as ${t.N} two-term sums` },
    { label: "R̂ · ESS", value: `${res.diagnostics.rhat.toFixed(3)} · ${Math.round(res.diagnostics.ess)}` },
  ]);
  const draws = postDraws(res, 500, 5);
  const lam = [0, 1].map((k) => draws.reduce((s, p) => s + p.lam[k], 0) / draws.length);
  const pi1 = draws.reduce((s, p) => s + p.pi[1], 0) / draws.length;
  const xmax = Math.max(...t.xs, Math.ceil(lam[1] + 3 * Math.sqrt(lam[1])));

  // histogram by true label + expected histogram
  const c0 = new Array(xmax + 1).fill(0), c1 = new Array(xmax + 1).fill(0);
  t.xs.forEach((x, i) => { (t.z[i] ? c1 : c0)[x]++; });
  const expct = range(0, xmax, xmax + 1).map((x) => [x, t.N * ((1 - pi1) * Math.exp(M.logPois(x, lam[0])) + pi1 * Math.exp(M.logPois(x, lam[1])))]);
  const ymax = Math.max(...c0.map((v, x) => v + c1[x]), ...expct.map((q) => q[1])) * 1.1;
  const box = clear("p-hist");
  legend(box, [{ label: "from λ₀ (hidden label)", color: C.nonedge, type: "rect" }, { label: "from λ₁", color: C.edge, type: "rect" }, { label: "fitted mixture", color: C.model }]);
  const f = frame(box, { x: { domain: [-0.5, xmax + 0.5], label: "count x" }, xFormat: (v) => v.toFixed(0), y: { domain: [0, ymax], label: "number of counts" }, yFormat: (v) => fmt(v, 0) });
  for (let x = 0; x <= xmax; x++) {
    if (c0[x]) bar(f, x - 0.45, x + 0.45, 0, c0[x], C.nonedge);
    if (c1[x]) bar(f, x - 0.45, x + 0.45, c0[x], c0[x] + c1[x], C.edge);
  }
  line(f, expct, C.model);

  // Q(x) with a band over draws
  const xsQ = range(0, xmax, xmax + 1);
  const Qs = xsQ.map((x) => draws.map((p) => M.resp(x, p.lam, p.pi)[1]).sort((a, b) => a - b));
  const q = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(u * arr.length))];
  const box2 = clear("p-Q");
  legend(box2, [{ label: "posterior Q(x), 90% band", color: C.model }, { label: "true share from λ₁ in these data", color: C.edge, type: "dot" }]);
  const f2 = frame(box2, { x: { domain: [-0.5, xmax + 0.5], label: "count x" }, xFormat: (v) => v.toFixed(0), y: { domain: [0, 1], label: "P(from λ₁ | x)" }, yFormat: (v) => v.toFixed(1) });
  band(f2, xsQ.map((x, i) => [x, q(Qs[i], 0.05), q(Qs[i], 0.95)]), C.model, 0.2);
  line(f2, xsQ.map((x, i) => [x, Qs[i].reduce((s, v) => s + v, 0) / Qs[i].length]), C.model);
  for (let x = 0; x <= xmax; x++) {
    const n = c0[x] + c1[x];
    if (!n) continue;
    const d = dot(f2, x, c1[x] / n, C.edge, 2.5 + Math.min(4, Math.sqrt(n)));
    d.addEventListener("pointermove", (e) => showTip(e, [{ value: `${c1[x]} of ${n}`, label: "from λ₁" }, { value: (Qs[x].reduce((s, v) => s + v, 0) / Qs[x].length).toFixed(3), label: "posterior Q(x)" }], `count ${x}`));
    d.addEventListener("pointerleave", hideTip);
  }
}

// ---------------------------------------------------------------------------
// 5. Symmetry
// ---------------------------------------------------------------------------

async function runSym() {
  const t = S.toy, ordered = $("c-order").checked;
  const rng = M.makeRng(500 + S.symSeed * 7 + S.seed);
  const top = Math.max(...t.xs) * 1.1 + 1;
  const st = Array.from({ length: 4 }, () => {
    const lam = [0.3 + rng.uniform() * top, 0.3 + rng.uniform() * top];
    if (ordered) lam.sort((a, b) => a - b);
    if (ordered && lam[1] - lam[0] < 0.1) lam[1] += 0.1;
    return { lam, pi: [0.5, 0.5] };
  });
  S.sym = await sample("sym", {
    target: { values: t.h.values, counts: t.h.counts, K: 2, ordered },
    sampler: "hmc", starts: st, iters: 1500, warmup: 500, seed: 61 + S.symSeed,
    opts: { eps: 0.1, L: 10, adapt: true },
  });
  S.sym.ordered = ordered;
  renderSym();
}

function renderSym() {
  const t = S.toy, res = S.sym;
  if (!res) return;
  const W = 500;
  const post = res.chains.map((c) => c.params.slice(W));
  const inMode = post.map((c) => c.filter((p) => p.lam[1] > p.lam[0]).length / c.length > 0.5);
  const pooled = post.flat();
  const mean = (f) => pooled.reduce((s, p) => s + f(p), 0) / pooled.length;
  const xStar = Math.round(t.l1);
  const d = res.diagnostics;
  const row = tiles(clear("t-sym"), [
    { label: "Chains with λ₁ > λ₀", value: `${inMode.filter(Boolean).length} of 4`, note: "the rest found the mirror mode" },
    { label: "R̂ (worst)", value: d.rhat.toFixed(2) },
    { label: "Pooled mean λ₀", value: mean((p) => p.lam[0]).toFixed(2), note: `true ${t.l0}` },
    { label: "Pooled mean λ₁", value: mean((p) => p.lam[1]).toFixed(2), note: `true ${t.l1}` },
    { label: `Pooled Q(x = ${xStar})`, value: mean((p) => M.resp(xStar, p.lam, p.pi)[1]).toFixed(2), note: "P(count came from λ₁)" },
  ]);
  row.children[1].classList.add(d.rhat > 1.01 ? "bad" : "good");

  const top = Math.max(...pooled.map((p) => Math.max(p.lam[0], p.lam[1])), ...res.chains.map((c) => Math.max(...c.params[0].lam))) * 1.08;
  const box = clear("p-modes");
  legend(box, CHAIN.map((c, k) => ({ label: `chain ${k + 1}`, color: c, type: "dot" })));
  const f = frame(box, { height: 300, x: { domain: [0, top], label: "λ₀" }, y: { domain: [0, top], label: "λ₁" }, xFormat: (v) => fmt(v, 0), yFormat: (v) => fmt(v, 0) });
  refLine(f, [[0, 0], [top, top]], C.ink2);
  label(f, top * 0.78, top * 0.78, "λ₀ = λ₁", { dx: 6, dy: 14 });
  post.forEach((c, k) => c.forEach((p, i) => { if (i % 4 === 0) el("circle", { cx: f.xs(p.lam[0]), cy: f.ys(p.lam[1]), r: 2, fill: CHAIN[k], opacity: 0.6 }, f.plot); }));
  // mark the starting points
  res.chains.forEach((c, k) => { const p = c.params[0]; el("circle", { cx: f.xs(p.lam[0]), cy: f.ys(p.lam[1]), r: 5, fill: "none", stroke: CHAIN[k], "stroke-width": 2 }, f.plot); });

  traceChart(clear("p-symtrace"), res.chains.map((c) => c.params), (p) => p.lam[1], W, { yLabel: "λ₁" });
}

// ---------------------------------------------------------------------------
// 6. Posterior-predictive checks
// ---------------------------------------------------------------------------

async function runPPC() {
  const t = S.toy6, K = S.K;
  const fit = M.em(t.h, K), rng = M.makeRng(71 + S.seed);
  S.ppc = await sample("ppc", {
    target: { values: t.h.values, counts: t.h.counts, K, ordered: true },
    sampler: "hmc", starts: starts(rng, fit, K), iters: 1500, warmup: 500, seed: 73 + S.seed,
    opts: { eps: 0.1, L: 10, adapt: true }, ppc: { xs: t.xs, n: 300 },
  });
  S.ppc.K = K;
  renderPPC();
}

function renderPPC() {
  const t = S.toy6, res = S.ppc;
  $("o-l2").textContent = $("c-l2").value;
  $("o-w2").textContent = (+$("c-w2").value).toFixed(2);
  if (!res) return;
  const { draws, p } = res.ppc;
  // R² of the posterior-mean expected count against the data
  const mbar = t.xs.map((_, i) => draws.reduce((s, d) => s + d.m[i], 0) / draws.length);
  const xbar = t.xs.reduce((s, v) => s + v, 0) / t.xs.length;
  const r2 = 1 - t.xs.reduce((s, x, i) => s + (x - mbar[i]) ** 2, 0) / t.xs.reduce((s, x) => s + (x - xbar) ** 2, 0);
  const row = tiles(clear("t-ppc"), [
    { label: "Truth", value: `${t.lam.length} components`, note: `λ = ${t.lam.map((v) => fmt(v, 1)).join(", ")}` },
    { label: "Fitted", value: `K = ${res.K}`, note: res.diagnostics.rows.filter((r) => r.name.startsWith("λ")).map((r) => r.mean.toFixed(1)).join(", ") },
    { label: "Posterior-predictive p", value: p.toFixed(3), note: p < 0.05 ? "model misses the data" : p < 0.25 ? "not ruled out, not a good fit" : p > 0.95 ? "suspiciously good" : "no evidence of misfit" },
    { label: "R² (observed vs. expected)", value: r2.toFixed(2) },
  ]);
  if (p < 0.25 || p > 0.95) row.children[2].classList.add("bad");
  else row.children[2].classList.add("good");

  // replicated histograms
  const xmax = Math.max(...t.xs, ...draws.slice(0, 20).flatMap((d) => d.rep));
  const hist = (xs) => { const h = new Array(xmax + 1).fill(0); xs.forEach((x) => { h[x]++; }); return h; };
  const obs = hist(t.xs);
  const reps = draws.slice(0, 20).map((d) => hist(d.rep));
  const ymax = Math.max(...obs, ...reps.flat()) * 1.1;
  const box = clear("p-rep");
  legend(box, [{ label: "observed", color: C.neutral, type: "rect" }, { label: "replicates", color: C.model }]);
  const f = frame(box, { x: { domain: [-0.5, xmax + 0.5], label: "count x" }, xFormat: (v) => v.toFixed(0), y: { domain: [0, ymax], label: "number of counts" }, yFormat: (v) => fmt(v, 0) });
  obs.forEach((v, x) => { if (v) bar(f, x - 0.45, x + 0.45, 0, v, C.neutral).setAttribute("opacity", 0.5); });
  reps.forEach((h) => line(f, h.map((v, x) => [x, v]), C.model, { "stroke-width": 1, opacity: 0.35 }));

  // observed vs predicted
  const box2 = clear("p-obspred");
  const top = Math.max(xmax, 1) * 1.05;
  const f2 = frame(box2, { x: { domain: [0, top], label: "observed count" }, xFormat: (v) => v.toFixed(0), y: { domain: [0, top], label: "replicated count" }, yFormat: (v) => v.toFixed(0) });
  refLine(f2, [[0, 0], [top, top]], C.ink2);
  const jr = M.makeRng(3);
  draws.slice(0, 5).forEach((d) => d.rep.forEach((r, i) => {
    el("circle", { cx: f2.xs(t.xs[i] + 0.3 * (jr.uniform() - 0.5)), cy: f2.ys(r), r: 2.2, fill: C.model, opacity: 0.35 }, f2.plot);
  }));

  // discrepancy scatter
  const box3 = clear("p-disc");
  const all = draws.flatMap((d) => [d.dData, d.dRep]);
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.05 || 1;
  legend(box3, [{ label: "replicate further off (counts towards p)", color: C.model, type: "dot" }, { label: "real data further off", color: C.neutral, type: "dot" }]);
  const f3 = frame(box3, { x: { domain: [lo - pad, hi + pad], label: "D(X; θ), real data" }, xFormat: (v) => fmt(v, 0), y: { domain: [lo - pad, hi + pad], label: "D(X̃; θ), replicate" }, yFormat: (v) => fmt(v, 0) });
  refLine(f3, [[lo - pad, lo - pad], [hi + pad, hi + pad]], C.ink2);
  draws.forEach((d) => el("circle", { cx: f3.xs(d.dData), cy: f3.ys(d.dRep), r: 2.4, fill: d.dRep > d.dData ? C.model : C.neutral, opacity: 0.7 }, f3.plot));
  const tt = el("text", { x: f3.margin.l + 8, y: f3.margin.t + 14, class: "direct-label strong" }, f3.plot);
  tt.textContent = `p = ${p.toFixed(3)}`;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function syncToy() {
  const p = toyParams();
  $("o-l0").textContent = p.l0.toFixed(1);
  $("o-l1").textContent = p.l1.toFixed(1);
  $("o-rho").textContent = p.rho.toFixed(2);
  $("o-N").textContent = p.N;
}

function recomputeToy() {
  makeToy();
  renderToy();
  runMCMC();
  runMarg();
  runSym();
  runPPC();
}

function debounce(fn, ms = 180) { let h = null; return () => { clearTimeout(h); h = setTimeout(fn, ms); }; }
const toyChanged = debounce(recomputeToy);
const mcmcChanged = debounce(runMCMC, 150);
const ppcChanged = debounce(() => { makeToy(); runPPC(); });

["c-l0", "c-l1", "c-rho", "c-N"].forEach((id) => $(id).addEventListener("input", () => { syncToy(); toyChanged(); }));
$("c-seed").addEventListener("click", () => { S.seed++; recomputeToy(); });
$("c-dolphin").addEventListener("click", () => {
  Object.entries({ "c-l0": 0.6, "c-l1": 14.5, "c-rho": 0.28, "c-N": 80 }).forEach(([id, v]) => { $(id).value = v; });
  syncToy(); recomputeToy();
});
["c-a", "c-b", "c-frac"].forEach((id) => $(id).addEventListener("input", renderGrid));
$("c-M").addEventListener("input", renderMC);
$("c-mc").addEventListener("click", () => { S.mcSeed++; renderMC(); });
["c-mh", "c-eps", "c-L", "c-it"].forEach((id) => $(id).addEventListener("input", () => { syncMCMC(); mcmcChanged(); }));
$("c-show").addEventListener("input", () => { syncMCMC(); renderPath("p-path-mh", S.mh, "mh"); renderPath("p-path-hmc", S.hmc, "hmc"); });
$("c-play").addEventListener("click", togglePlay);
$("c-phi").addEventListener("input", renderCorr);
$("c-phipreset").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; $("c-phi").value = b.dataset.phi; renderCorr(); });
$("c-order").addEventListener("change", runSym);
$("c-restart").addEventListener("click", () => { S.symSeed++; runSym(); });
["c-third", "c-l2", "c-w2"].forEach((id) => $(id).addEventListener("input", () => { renderPPC(); ppcChanged(); }));
$("c-K").addEventListener("click", (e) => {
  const k = e.target.closest("button")?.dataset.k;
  if (!k) return;
  S.K = +k;
  [...$("c-K").children].forEach((b) => b.classList.toggle("on", b.dataset.k === k));
  runPPC();
});

const links = [...document.querySelectorAll("nav.side a[href^='#']")];
const obs = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${e.target.id}`));
}, { rootMargin: "-40% 0px -55% 0px" });
document.querySelectorAll("section").forEach((s) => obs.observe(s));

let rz = null;
window.addEventListener("resize", () => {
  clearTimeout(rz);
  rz = setTimeout(() => { S.surfaceImg = null; renderMap(); renderGrid(); renderToy(); renderMCMC(); renderCorr(); renderMarg(); renderSym(); renderPPC(); }, 200);
});

// ?test: check every target's gradient against finite differences
if (new URLSearchParams(location.search).has("test")) {
  const h = M.histogram([0, 0, 1, 2, 3, 7, 9, 12, 15, 30]);
  for (const [K, ordered] of [[1, true], [2, true], [2, false], [3, true]]) {
    const tg = M.makeTarget({ values: h.values, counts: h.counts, K, ordered });
    console.log(`gradient check K=${K} ordered=${ordered}:`, checkGradient(tg, Array.from({ length: tg.dim }, (_, k) => 0.4 * k - 0.3)).toExponential(2));
  }
}

syncToy();
syncMCMC();
renderMap();
renderGrid();
renderCorr();
recomputeToy();
