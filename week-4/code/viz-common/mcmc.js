// Two MCMC samplers and the standard convergence diagnostics, small enough to read in one sitting.
//
// Both samplers work on an unconstrained vector u ∈ R^d. A target is an object
//   { dim, logp(u) -> number, logpGrad(u) -> { lp, grad } }
// where logp already includes the log-Jacobian of the map from u to the model's parameters
// (this is exactly what Stan does behind `<lower=0>`, `ordered` and `simplex`).

// ---------------------------------------------------------------------------
// Random-walk Metropolis
// ---------------------------------------------------------------------------

// Proposal u' = u + scale · N(0, I); accept with probability min(1, p(u') / p(u)).
// With adapt = true the scale is tuned during warmup (Robbins–Monro on log scale)
// towards an acceptance rate of about 0.3, then frozen.
export function metropolis(target, u0, { iters, warmup = 0, scale = 0.1, rng, adapt = false, record = 0 }) {
  const d = target.dim;
  let u = Float64Array.from(u0), lp = target.logp(u), logS = Math.log(scale);
  const draws = [], lps = [], steps = [];
  let accepted = 0, evals = 1;
  for (let t = 0; t < iters; t++) {
    const s = Math.exp(logS);
    const prop = new Float64Array(d);
    for (let k = 0; k < d; k++) prop[k] = u[k] + s * rng.normal();
    const lpProp = target.logp(prop);
    evals++;
    const a = Number.isFinite(lpProp) ? Math.min(1, Math.exp(lpProp - lp)) : 0;
    const ok = rng.uniform() < a;
    if (t < record) steps.push({ from: Array.from(u), to: Array.from(prop), ok });
    if (ok) { u = prop; lp = lpProp; }
    if (t >= warmup) accepted += ok ? 1 : 0;
    if (adapt && t < warmup) logS += (a - 0.3) / Math.pow(t + 1, 0.6);
    draws.push(Array.from(u));
    lps.push(lp);
  }
  return { draws, lps, steps, accept: accepted / Math.max(1, iters - warmup), scale: Math.exp(logS), evals };
}

// ---------------------------------------------------------------------------
// Hamiltonian Monte Carlo (fixed number of leapfrog steps, unit mass matrix)
// ---------------------------------------------------------------------------

// Give the position a random momentum p ~ N(0, I), follow Hamilton's equations for
// H(u, p) = −log p(u) + |p|²/2 with L leapfrog steps of size ε, then accept the end point
// with probability min(1, exp(H_start − H_end)). The gradient lets a trajectory travel far
// along the posterior while keeping H (and so the acceptance probability) nearly constant.
// With adapt = true, ε is tuned in warmup by dual averaging (Hoffman & Gelman 2014) towards
// an average acceptance of targetAccept, as Stan does.
export function hmc(target, u0, { iters, warmup = 0, eps = 0.1, L = 10, rng, adapt = false, targetAccept = 0.8, record = 0 }) {
  const d = target.dim;
  let u = Float64Array.from(u0), cur = target.logpGrad(u);
  const draws = [], lps = [], steps = [];
  let accepted = 0, evals = 1, divergent = 0;
  // dual-averaging state
  let logEps = Math.log(eps), logEpsBar = 0, hBar = 0;
  const mu = Math.log(10 * eps), gamma = 0.05, t0 = 10, kappa = 0.75;
  for (let t = 0; t < iters; t++) {
    const e = Math.exp(logEps) * (0.9 + 0.2 * rng.uniform()); // jitter ε a little
    const p = new Float64Array(d);
    for (let k = 0; k < d; k++) p[k] = rng.normal();
    let H0 = -cur.lp;
    for (let k = 0; k < d; k++) H0 += 0.5 * p[k] * p[k];
    let q = Float64Array.from(u), g = cur.grad, lpNew = cur.lp;
    const path = t < record ? [Array.from(q)] : null;
    for (let k = 0; k < d; k++) p[k] += 0.5 * e * g[k];
    for (let s = 0; s < L; s++) {
      for (let k = 0; k < d; k++) q[k] += e * p[k];
      const r = target.logpGrad(q);
      evals++;
      lpNew = r.lp; g = r.grad;
      if (!Number.isFinite(lpNew)) break;
      const w = s === L - 1 ? 0.5 : 1;
      for (let k = 0; k < d; k++) p[k] += w * e * g[k];
      if (path) path.push(Array.from(q));
    }
    let H1 = -lpNew;
    for (let k = 0; k < d; k++) H1 += 0.5 * p[k] * p[k];
    const dH = H0 - H1;
    const a = Number.isFinite(dH) ? Math.min(1, Math.exp(dH)) : 0;
    if (!(dH > -1000)) divergent += t >= warmup ? 1 : 0;
    const ok = rng.uniform() < a;
    if (path) steps.push({ from: Array.from(u), path, ok });
    if (ok) { u = q; cur = { lp: lpNew, grad: g }; }
    if (t >= warmup) accepted += ok ? 1 : 0;
    if (adapt && t < warmup) {
      const m = t + 1, w = 1 / (m + t0);
      hBar = (1 - w) * hBar + w * (targetAccept - a);
      logEps = mu - (Math.sqrt(m) / gamma) * hBar;
      const eta = Math.pow(m, -kappa);
      logEpsBar = eta * logEps + (1 - eta) * logEpsBar;
      if (t === warmup - 1) logEps = logEpsBar;
    }
    draws.push(Array.from(u));
    lps.push(cur.lp);
  }
  return { draws, lps, steps, accept: accepted / Math.max(1, iters - warmup), eps: Math.exp(logEps), evals, divergent };
}

// Finite-difference check of a target's gradient (used in ?test mode)
export function checkGradient(target, u, h = 1e-6) {
  const { grad } = target.logpGrad(u);
  let worst = 0;
  for (let k = 0; k < target.dim; k++) {
    const a = Float64Array.from(u), b = Float64Array.from(u);
    a[k] += h; b[k] -= h;
    const fd = (target.logp(a) - target.logp(b)) / (2 * h);
    worst = Math.max(worst, Math.abs(fd - grad[k]) / Math.max(1, Math.abs(fd)));
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Diagnostics. `chains` is an array of m chains, each an array of n scalar draws.
// ---------------------------------------------------------------------------

const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
const variance = (x) => { const m = mean(x); return x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1); };

// Split-R̂ (Gelman et al., BDA3 §11.4): cut each chain in half, compare the spread
// between the halves' means with the spread within them. Near 1 when all chains agree.
export function rhat(chains) {
  const halves = [];
  for (const c of chains) {
    const h = Math.floor(c.length / 2);
    halves.push(c.slice(0, h), c.slice(c.length - h));
  }
  const n = halves[0].length, means = halves.map(mean);
  const W = mean(halves.map(variance));
  const B = n * variance(means);
  const varPlus = ((n - 1) / n) * W + B / n;
  return Math.sqrt(varPlus / W);
}

// Autocovariance of one chain at lags 0..maxLag
function autocov(x, maxLag) {
  const n = x.length, m = mean(x), out = new Float64Array(maxLag + 1);
  for (let t = 0; t <= maxLag; t++) {
    let s = 0;
    for (let i = 0; i + t < n; i++) s += (x[i] - m) * (x[i + t] - m);
    out[t] = s / n;
  }
  return out;
}

export function acf(x, maxLag = 40) {
  const a = autocov(x, Math.min(maxLag, x.length - 1));
  return Array.from(a, (v) => v / a[0]);
}

// Effective sample size across chains, Stan style: combine the chains' autocorrelations
// with the between-chain variance, then sum them with Geyer's initial positive sequence.
export function ess(chains) {
  const m = chains.length, n = Math.min(...chains.map((c) => c.length));
  const cs = chains.map((c) => c.slice(0, n));
  const W = mean(cs.map(variance));
  const B = n * variance(cs.map(mean));
  const varPlus = ((n - 1) / n) * W + (m > 1 ? B / n : 0);
  if (!(varPlus > 0)) return m * n;
  const maxLag = n - 1;
  const acovs = cs.map((c) => autocov(c, Math.min(maxLag, 1000)));
  const rho = (t) => 1 - (W - mean(acovs.map((a) => a[t]))) / varPlus;
  let tau = -1, prev = Infinity;
  for (let t = 0; t + 1 < acovs[0].length; t += 2) {
    let P = rho(t) + rho(t + 1);
    if (P <= 0) break;
    P = Math.min(P, prev); // monotone sequence
    tau += 2 * P;
    prev = P;
  }
  return (m * n) / Math.max(tau, 1 / Math.log10(m * n));
}

export function quantile(x, q) {
  const s = Float64Array.from(x).sort();
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (pos - lo) * (s[hi] - s[lo]);
}

export { mean };
