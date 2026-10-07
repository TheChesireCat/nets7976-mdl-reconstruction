// The Poisson mixture that both Week 4 pages are built on.
//
//   z_i ~ Categorical(π)            which component (for the dolphins: which edge type A_ij)
//   x_i | z_i ~ Poisson(λ_{z_i})    the count we observe
//
// z is discrete, so, as in Stan, it is summed out: p(x_i | λ, π) = Σ_k π_k Poisson(x_i | λ_k).
// Only the counts' histogram matters, so the data are passed as distinct `values` with
// multiplicities `counts` (the paper's §A.6.2 trick; the authors' fast_poisson.stan does the same).
//
// Priors follow the paper's code: λ_k ~ Normal(1, σ = 100) truncated to λ > 0, and a flat
// Dirichlet(1, …, 1) on π (uniform ρ when K = 2).

import { metropolis, hmc, rhat, ess, mean, quantile } from "./mcmc.js";

// ---------------------------------------------------------------------------
// Special functions
// ---------------------------------------------------------------------------

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export const logPois = (x, lam) => (x === 0 ? -lam : x * Math.log(lam) - lam - lgamma(x + 1));

export function lse(a) {
  let m = -Infinity;
  for (const v of a) if (v > m) m = v;
  if (m === -Infinity) return m;
  let s = 0;
  for (const v of a) s += Math.exp(v - m);
  return m + Math.log(s);
}

// Poisson draw by inversion: exact, and fast enough for the means used here (< 100)
export function poisson(rng, lam) {
  let k = 0, p = Math.exp(-lam), c = p;
  const u = rng.uniform();
  while (u > c && k < 1000) { k++; p *= lam / k; c += p; }
  return k;
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

export function histogram(xs) {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  const values = [...m.keys()].sort((a, b) => a - b);
  return { values, counts: values.map((v) => m.get(v)), N: xs.length };
}

// Simulate N counts from a mixture; returns the counts and the true components
export function simulate(rng, N, lam, pi) {
  const x = new Array(N), z = new Array(N);
  for (let i = 0; i < N; i++) {
    let u = rng.uniform(), k = 0;
    while (k < pi.length - 1 && u > pi[k]) { u -= pi[k]; k++; }
    z[i] = k;
    x[i] = poisson(rng, lam[k]);
  }
  return { x, z };
}

// Posterior probability of each component for a count x: Q(k) ∝ π_k Poisson(x | λ_k).
// For the dolphins this is Q_ij(k) of Eq. (A.14); for Newman it is the E-step.
export function resp(x, lam, pi) {
  const a = lam.map((l, k) => Math.log(pi[k]) + logPois(x, l));
  const z = lse(a);
  return a.map((v) => Math.exp(v - z));
}

// ---------------------------------------------------------------------------
// The target on the unconstrained scale
// ---------------------------------------------------------------------------

// u = [λ part (K entries), π logits (K − 1 entries, the first component pinned at 0)].
//   ordered:   λ_0 = e^{u_0},  λ_k = λ_{k−1} + e^{u_k}   (Stan's positive_ordered)
//   unordered: λ_k = e^{u_k}                                (just <lower=0>)
//   π = softmax(0, v_1, …, v_{K−1})                         (log-Jacobian Σ_k log π_k)
// With fixedPi, π is data and u has only the K λ entries.
export function makeTarget({ values, counts, K = 2, ordered = true, fixedPi = null, mu = 1, sigma = 100 }) {
  const nv = values.length;
  const lf = values.map((x) => lgamma(x + 1));
  const dim = fixedPi ? K : 2 * K - 1;

  function toParams(u) {
    const lam = new Array(K);
    for (let k = 0; k < K; k++) lam[k] = ordered && k > 0 ? lam[k - 1] + Math.exp(u[k]) : Math.exp(u[k]);
    let pi;
    if (fixedPi) pi = fixedPi.slice();
    else {
      const v = [0];
      for (let k = 1; k < K; k++) v.push(u[K + k - 1]);
      const z = lse(v);
      pi = v.map((a) => Math.exp(a - z));
    }
    return { lam, pi };
  }

  function fromParams({ lam, pi }) {
    const u = [];
    for (let k = 0; k < K; k++) u.push(Math.log(ordered && k > 0 ? lam[k] - lam[k - 1] : lam[k]));
    if (!fixedPi) for (let k = 1; k < K; k++) u.push(Math.log(pi[k] / pi[0]));
    return u;
  }

  function logpGrad(u, wantGrad = true) {
    const { lam, pi } = toParams(u);
    const logLam = lam.map(Math.log), logPi = pi.map(Math.log);
    for (const l of lam) if (!(l > 0) || !Number.isFinite(l)) return { lp: -Infinity, grad: new Float64Array(dim) };
    let lp = 0;
    const gLam = new Float64Array(K), gV = new Float64Array(K);
    const a = new Float64Array(K);
    for (let i = 0; i < nv; i++) {
      const x = values[i], c = counts[i];
      let m = -Infinity;
      for (let k = 0; k < K; k++) {
        a[k] = logPi[k] + (x === 0 ? 0 : x * logLam[k]) - lam[k] - lf[i];
        if (a[k] > m) m = a[k];
      }
      let s = 0;
      for (let k = 0; k < K; k++) s += Math.exp(a[k] - m);
      const ll = m + Math.log(s);
      lp += c * ll;
      if (wantGrad)
        for (let k = 0; k < K; k++) {
          const r = Math.exp(a[k] - ll);
          gLam[k] += c * r * (x / lam[k] - 1);
          gV[k] += c * (r - pi[k]);
        }
    }
    // prior: truncated Normal(mu, sigma) on each λ; flat Dirichlet on π
    for (let k = 0; k < K; k++) {
      lp -= (lam[k] - mu) ** 2 / (2 * sigma * sigma);
      gLam[k] -= (lam[k] - mu) / (sigma * sigma);
    }
    // log-Jacobians
    for (let k = 0; k < K; k++) lp += u[k];
    if (!fixedPi) for (let k = 0; k < K; k++) { lp += logPi[k]; gV[k] += 1 - K * pi[k]; }
    const grad = new Float64Array(dim);
    if (wantGrad) {
      if (ordered) {
        let tail = 0;
        for (let k = K - 1; k >= 0; k--) { tail += gLam[k]; grad[k] = Math.exp(u[k]) * tail + 1; }
      } else for (let k = 0; k < K; k++) grad[k] = lam[k] * gLam[k] + 1;
      if (!fixedPi) for (let k = 1; k < K; k++) grad[K + k - 1] = gV[k];
    }
    return { lp, grad };
  }

  // log posterior density of the *constrained* parameters (no Jacobian), for drawing contours
  function logPost(lam, pi) {
    let lp = 0;
    for (let i = 0; i < nv; i++) {
      const x = values[i];
      lp += counts[i] * lse(lam.map((l, k) => Math.log(pi[k]) + logPois(x, l)));
    }
    for (const l of lam) lp -= (l - mu) ** 2 / (2 * sigma * sigma);
    return lp;
  }

  return { dim, K, toParams, fromParams, logpGrad, logp: (u) => logpGrad(u, false).lp, logPost };
}

// ---------------------------------------------------------------------------
// EM for the same mixture (flat priors, so the maximum-likelihood point)
// ---------------------------------------------------------------------------

export function em({ values, counts }, K, { iters = 500, init = null, tol = 1e-10 } = {}) {
  const N = counts.reduce((s, c) => s + c, 0);
  const xmax = values[values.length - 1];
  let lam = init?.lam?.slice() ?? Array.from({ length: K }, (_, k) => 0.5 + (xmax * (k + 0.5)) / K);
  let pi = init?.pi?.slice() ?? new Array(K).fill(1 / K);
  let ll = -Infinity;
  const history = [];
  for (let t = 0; t < iters; t++) {
    const sr = new Array(K).fill(0), sx = new Array(K).fill(0);
    let llNew = 0;
    values.forEach((x, i) => {
      const a = lam.map((l, k) => Math.log(pi[k]) + logPois(x, l));
      const z = lse(a);
      llNew += counts[i] * z;
      a.forEach((v, k) => { const r = Math.exp(v - z) * counts[i]; sr[k] += r; sx[k] += r * x; });
    });
    history.push({ lam: lam.slice(), pi: pi.slice(), ll: llNew });
    lam = sx.map((s, k) => Math.max(1e-6, s / Math.max(sr[k], 1e-12)));
    pi = sr.map((s) => Math.max(1e-12, s / N));
    // keep components in increasing order of λ, as the ordered Bayesian model does
    const ord = lam.map((l, k) => k).sort((a, b) => lam[a] - lam[b]);
    lam = ord.map((k) => lam[k]); pi = ord.map((k) => pi[k]);
    if (Math.abs(llNew - ll) < tol) { ll = llNew; break; }
    ll = llNew;
  }
  return { lam, pi, ll, history };
}

// ---------------------------------------------------------------------------
// Run several chains and summarize
// ---------------------------------------------------------------------------

// starts: array of {lam, pi} in the constrained space (over-dispersed by the caller)
export function sampleMixture(target, { sampler = "hmc", starts, iters = 1000, warmup = 500, rng, opts = {}, record = 0 }) {
  const chains = starts.map((s) => {
    const u0 = target.fromParams(s);
    const run = sampler === "hmc"
      ? hmc(target, u0, { iters, warmup, rng, record, ...opts })
      : metropolis(target, u0, { iters, warmup, rng, record, ...opts });
    const params = run.draws.map((u) => target.toParams(u));
    return { ...run, params, u: run.draws, draws: undefined };
  });
  return { chains, diagnostics: diagnose(chains, warmup, target.K) };
}

export function paramNames(K) {
  const lam = Array.from({ length: K }, (_, k) => `λ${"₀₁₂₃"[k]}`);
  const pi = K === 2 ? ["ρ"] : Array.from({ length: K - 1 }, (_, k) => `ρ${"₀₁₂₃"[k + 1]}`);
  return [...lam, ...(K > 1 ? pi : [])];
}

// Scalar series for each named parameter (post-warmup)
export function scalars(chain, warmup, K) {
  const post = chain.params.slice(warmup);
  const out = [];
  for (let k = 0; k < K; k++) out.push(post.map((p) => p.lam[k]));
  if (K === 2) out.push(post.map((p) => p.pi[1]));
  else for (let k = 1; k < K; k++) out.push(post.map((p) => p.pi[k]));
  return out;
}

export function diagnose(chains, warmup, K) {
  const names = paramNames(K);
  const per = chains.map((c) => scalars(c, warmup, K));
  const rows = names.map((name, j) => {
    const cs = per.map((s) => s[j]);
    const all = cs.flat();
    const fixed = all.every((v) => v === all[0]); // e.g. ρ when it is held at a known value
    return {
      name, mean: mean(all), q05: quantile(all, 0.025), q95: quantile(all, 0.975),
      rhat: fixed ? NaN : rhat(cs), ess: fixed ? NaN : ess(cs), fixed,
    };
  });
  const free = rows.filter((r) => !r.fixed);
  const evals = chains.reduce((s, c) => s + c.evals, 0);
  return {
    rows,
    rhat: Math.max(...free.map((r) => r.rhat)),
    ess: Math.min(...free.map((r) => r.ess)),
    accept: mean(chains.map((c) => c.accept)),
    evals,
    divergent: chains.reduce((s, c) => s + (c.divergent ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// Posterior-predictive checks (the authors' tutorial, cells 66 and 70)
// ---------------------------------------------------------------------------

// Discrepancy D(X; θ) = Σ_{x_i > 0} x_i log(x_i / m_i), with m_i = Σ_k Q_i(k) λ_k the model's
// expected count for item i at θ (paper Eq. 3.4).
export function discrepancy(xs, m) {
  let d = 0;
  for (let i = 0; i < xs.length; i++) if (xs[i] > 0) d += xs[i] * Math.log(xs[i] / m[i]);
  return d;
}

// For each of `draws` posterior draws: draw the latent z from Q, simulate X̃, and compute
// D(X; θ) and D(X̃; θ). The p-value is the share of draws where the replicate is further off.
export function ppc(xs, params, rng) {
  const out = [];
  for (const { lam, pi } of params) {
    const Q = xs.map((x) => resp(x, lam, pi));
    const m = Q.map((q) => q.reduce((s, v, k) => s + v * lam[k], 0));
    const rep = Q.map((q) => {
      let u = rng.uniform(), k = 0;
      while (k < q.length - 1 && u > q[k]) { u -= q[k]; k++; }
      return poisson(rng, lam[k]);
    });
    out.push({ dData: discrepancy(xs, m), dRep: discrepancy(rep, m), rep, m });
  }
  const p = out.filter((o) => o.dRep > o.dData).length / out.length;
  return { draws: out, p };
}
