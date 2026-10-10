// PROTOTYPE (throwaway): charts for prototype-anatomy.html. Copied from app.js, not shared with it.
// Fills whatever the mounted variant has: [data-r] readouts, [data-o] slider outputs, .toy-strip controls.
import * as M from "./model.js";
import { C, el, frame, line, area, label, refLine, legend, fmt } from "../../../../week-3/code/viz-common/charts.js";
import { bar } from "../../viz-common/charts4.js";

const $ = (id) => document.getElementById(id);
const clear = (id) => { const e = $(id); if (e) e.replaceChildren(); return e; };
const put = (key, text) => document.querySelectorAll(`[data-r="${key}"]`).forEach((n) => { n.textContent = text; });
const sci = (x) => (x === 0 ? "0" : x < 1e-3 ? x.toExponential(1).replace("e", " × 10^") : x.toFixed(3));
const digits = (span) => Math.max(1, Math.ceil(-Math.log10(span)) + 1);

// ---------- §1 Bayes on a grid ----------
function renderGrid() {
  const p = { a: +$("c-a").value, b: +$("c-b").value, frac: 10 ** +$("c-frac").value };
  const L = M.laplace(p);
  document.querySelector('[data-o="a"]').textContent = p.a;
  document.querySelector('[data-o="b"]').textContent = p.b;
  document.querySelector('[data-o="frac"]').textContent = p.frac >= 0.01 ? `${Math.round(100 * p.frac)}%` : `${(100 * p.frac).toPrecision(1)}%`;
  const dg = digits(L.hi - L.lo);
  put("births", (L.boys + L.girls).toLocaleString());
  put("boys", L.boys.toLocaleString());
  put("girls", L.girls.toLocaleString());
  put("mean", L.mean.toFixed(dg));
  put("sd", L.sd.toPrecision(2));
  put("ci", `${L.ci[0].toFixed(dg)} to ${L.ci[1].toFixed(dg)}`);
  put("phalf", sci(L.pLeHalf));
  put("griderr", L.gridErr < 1e-6 ? "under 10⁻⁶" : L.gridErr.toExponential(1));

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
  const f = frame(box, { height: 240, x: { domain: [L.lo, L.hi], label: "θ = P(boy)" }, xFormat: xf, y: { domain: [0, ymax], label: "density" }, yFormat: (v) => fmt(v, 0) });
  line(f, prior, C.neutral);
  line(f, lik, C.g1, { opacity: 0.9 });
  line(f, post, C.model);
  pts.forEach(([t, g], i) => { if (i % 16 === 8) el("circle", { cx: f.xs(t), cy: f.ys(g), r: 2.6, fill: C.model }, f.plot); });

  const box2 = clear("p-summary");
  const ymax2 = Math.max(...post.map((q) => q[1])) * 1.3;
  const f2 = frame(box2, { height: 240, x: { domain: [L.lo, L.hi], label: "θ = P(boy)" }, xFormat: xf, y: { domain: [0, ymax2], label: "posterior density" }, yFormat: (v) => fmt(v, 0) });
  area(f2, post.filter(([t]) => t >= L.ci[0] && t <= L.ci[1]), C.model).setAttribute("opacity", 0.22);
  line(f2, post, C.model);
  const peak = Math.max(...post.map((q) => q[1]));
  refLine(f2, [[L.mean, 0], [L.mean, peak * 1.04]], C.ink2);
  label(f2, L.mean, peak * 1.04, "mean ≈ median ≈ mode", { dy: 4 });
  label(f2, L.ci[0], peak * 0.06, "95%", { anchor: "end", dx: -4 });
  if (0.5 >= L.lo && 0.5 <= L.hi) {
    refLine(f2, [[0.5, 0], [0.5, ymax2]], C.g2);
    label(f2, 0.5, ymax2 * 0.97, "θ = ½", { anchor: "end", dx: -5 });
  } else {
    const z = (L.mean - 0.5) / L.sd;
    const t = el("text", { x: f2.margin.l + 6, y: f2.margin.t + 14, class: "direct-label" }, f2.plot);
    t.textContent = `θ = ½ is off the chart, ${z.toFixed(0)} sd to the ${z > 0 ? "left" : "right"}`;
  }
}

// ---------- the toy counts, shared by every .toy-strip (§3–7) ----------
const T = { l0: 1, l1: 10, rho: 0.3, N: 100, seed: 1 };
let toy = null;
const FMT = { l0: (v) => v.toFixed(1), l1: (v) => v.toFixed(1), rho: (v) => v.toFixed(2), N: (v) => String(v) };

function syncStrips() {
  document.querySelectorAll(".toy-strip input[data-k]").forEach((inp) => {
    const k = inp.dataset.k;
    if (+inp.value !== T[k]) inp.value = T[k];
    inp.closest("label").querySelector("output").textContent = FMT[k](T[k]);
  });
}

function makeToy() {
  const rng = M.makeRng(1000 + T.seed);
  const { x, z } = M.simulate(rng, T.N, [T.l0, T.l1], [1 - T.rho, T.rho]);
  toy = { xs: x, z };
  const n1 = z.filter((v) => v === 1).length;
  put("toy-status", T.l1 <= T.l0 ? "λ₁ ≤ λ₀: the friends' rate is not higher, so the ordered model is misspecified"
    : `${T.N} pairs, ${n1} of them friends (hidden), largest count ${Math.max(...x)}`);
  put("toy-first", x.slice(0, 18).join(", "));
}

function renderToy() {
  const xmax = Math.max(...toy.xs), c = new Array(xmax + 1).fill(0);
  toy.xs.forEach((x) => { c[x]++; });
  const f = frame(clear("p-toy"), { height: 210, x: { domain: [-0.5, xmax + 0.5], label: "count x" }, xFormat: (v) => v.toFixed(0), y: { domain: [0, Math.max(...c) * 1.1], label: "number of pairs" }, yFormat: (v) => fmt(v, 0) });
  c.forEach((v, x) => { if (v) bar(f, x - 0.45, x + 0.45, 0, v, C.neutral).setAttribute("opacity", 0.6); });
}

document.addEventListener("input", (e) => {
  const k = e.target.dataset?.k;
  if (k) { T[k] = +e.target.value; syncStrips(); makeToy(); renderToy(); return; }
  if (["c-a", "c-b", "c-frac"].includes(e.target.id)) renderGrid();
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  if (b.dataset.act === "seed") T.seed++;
  if (b.dataset.act === "dolphin") Object.assign(T, { l0: 0.6, l1: 14.5, rho: 0.28, N: 80 });
  syncStrips(); makeToy(); renderToy();
});

let rz = null;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { renderGrid(); renderToy(); }, 200); });

syncStrips();
renderGrid();
makeToy();
renderToy();
