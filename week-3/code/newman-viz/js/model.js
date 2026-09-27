// Model and inference for Newman (2018), "Network structure from rich but noisy data",
// Nature Physics 14, 542-545. The simplest data model of the paper: every pair of nodes
// is measured N times, a true edge is observed with probability alpha, a non-edge with
// probability beta, and the prior puts an edge on each pair with probability rho.
//
// Everything that matters depends on the data only through how many pairs were observed
// e = 0, 1, ..., N times. So all of the inference below works on those N + 1 counts,
// which makes it fast enough to run on the page itself.

export { makeRng } from "../../viz-common/random.js";
import { makeRng } from "../../viz-common/random.js";

// ---------------------------------------------------------------------------
// Sampling helpers
// ---------------------------------------------------------------------------

// Binomial(n, p). Exact by inversion when the mean is small; a rounded normal otherwise,
// which is plenty for drawing charts and for the Gibbs sampler's class counts.
export function binomial(rng, n, p) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  const flip = p > 0.5, q = flip ? 1 - p : p;
  let x;
  if (n * q < 30) {
    const r = q / (1 - q);
    let pk = Math.pow(1 - q, n), cdf = pk, u = rng.uniform();
    x = 0;
    while (u > cdf && x < n) { pk *= (r * (n - x)) / (x + 1); x++; cdf += pk; }
  } else {
    x = Math.round(n * q + Math.sqrt(n * q * (1 - q)) * rng.normal());
    x = Math.max(0, Math.min(n, x));
  }
  return flip ? n - x : x;
}

function binomPmf(N, p) {
  const out = new Float64Array(N + 1);
  let c = 1;
  for (let e = 0; e <= N; e++) {
    out[e] = c * Math.pow(p, e) * Math.pow(1 - p, N - e);
    c = (c * (N - e)) / (e + 1);
  }
  return out;
}

function multinomial(rng, n, probs) {
  const out = new Int32Array(probs.length);
  let left = n, mass = 1;
  for (let k = 0; k < probs.length - 1 && left > 0; k++) {
    const x = binomial(rng, left, Math.min(1, probs[k] / mass));
    out[k] = x; left -= x; mass -= probs[k];
  }
  out[probs.length - 1] += left;
  return out;
}

// ---------------------------------------------------------------------------
// Generative model: prior on A, then the measurement model (Eq. 7)
// ---------------------------------------------------------------------------

export function generate({ n, rho, alpha, beta, N, seed }) {
  const rng = makeRng(seed);
  const A = new Uint8Array(n * n), E = new Uint8Array(n * n);
  const c = new Int32Array(N + 1), c1 = new Int32Array(N + 1); // all pairs / true edges, by count e
  let m = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const edge = rng.uniform() < rho;
      const p = edge ? alpha : beta;
      let e = 0;
      for (let k = 0; k < N; k++) if (rng.uniform() < p) e++;
      A[i * n + j] = A[j * n + i] = edge ? 1 : 0;
      E[i * n + j] = E[j * n + i] = e;
      c[e]++;
      if (edge) { c1[e]++; m++; }
    }
  return { n, N, A, E, c, c1, m, M: (n * (n - 1)) / 2, rho, alpha, beta };
}

// Only the class counts, for the many repeated networks in the coverage experiment
export function generateCounts({ n, rho, alpha, beta, N }, rng) {
  const M = (n * (n - 1)) / 2;
  const m = binomial(rng, M, rho);
  const c1 = multinomial(rng, m, binomPmf(N, alpha));
  const c0 = multinomial(rng, M - m, binomPmf(N, beta));
  const c = c1.map((x, e) => x + c0[e]);
  return { N, M, m, c };
}

// ---------------------------------------------------------------------------
// Per-pair posterior Q (Eq. 6), as prior log-odds plus evidence
// ---------------------------------------------------------------------------

export function logOdds(e, N, { rho, alpha, beta }) {
  const prior = Math.log(rho / (1 - rho));
  const hits = e * Math.log(alpha / beta);
  const misses = (N - e) * Math.log((1 - alpha) / (1 - beta));
  return { prior, hits, misses, total: prior + hits + misses };
}

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function Qclass(N, th) {
  return Array.from({ length: N + 1 }, (_, e) => sigmoid(logOdds(e, N, th).total));
}

// log P(data | theta), up to binomial coefficients. With uniform priors on rho, alpha
// and beta (Newman's choice), this is log P(theta | data) up to a constant: Eq. (2)'s left side.
export function logLik(c, N, { rho, alpha, beta }) {
  let s = 0;
  for (let e = 0; e <= N; e++) {
    if (!c[e]) continue;
    const a = Math.log(rho) + e * Math.log(alpha) + (N - e) * Math.log(1 - alpha);
    const b = Math.log(1 - rho) + e * Math.log(beta) + (N - e) * Math.log(1 - beta);
    const mx = Math.max(a, b);
    s += c[e] * (mx + Math.log(Math.exp(a - mx) + Math.exp(b - mx)));
  }
  return s;
}

// ---------------------------------------------------------------------------
// EM for theta (Eqs. 3-5)
// ---------------------------------------------------------------------------

export function em(c, N, { init = { rho: 0.2, alpha: 0.9, beta: 0.2 }, maxIter = 500, tol = 1e-9 } = {}) {
  let th = { ...init };
  const M = c.reduce((a, b) => a + b, 0);
  const path = [{ ...th }];
  for (let it = 0; it < maxIter; it++) {
    const Q = Qclass(N, th); // E-step: Eq. (6)
    let sQ = 0, sQE = 0, s1E = 0, sE = 0;
    for (let e = 0; e <= N; e++) { sQ += c[e] * Q[e]; sQE += c[e] * Q[e] * e; sE += c[e] * e; }
    s1E = sE - sQE;
    const next = { // M-step: Eq. (5)
      rho: sQ / M,
      alpha: sQE / (N * sQ),
      beta: s1E / (N * (M - sQ)),
    };
    const d = Math.max(Math.abs(next.rho - th.rho), Math.abs(next.alpha - th.alpha), Math.abs(next.beta - th.beta));
    th = next;
    path.push({ ...th });
    if (d < tol) break;
  }
  return { theta: th, Q: Qclass(N, th), path };
}

// ---------------------------------------------------------------------------
// Full Bayes: blocked Gibbs sampler on the class counts
// ---------------------------------------------------------------------------
//
// A | theta: pairs are independent coins, so the number of true edges among the c_e pairs
// observed e times is Binomial(c_e, Q_e). theta | A: three conjugate Beta draws from counts,
// with alpha > beta imposed to rule out the mirror solution (edges <-> non-edges).

export function gibbs(c, N, rng, { iters = 1500, burn = 300, init = { rho: 0.2, alpha: 0.9, beta: 0.2 } } = {}) {
  const M = c.reduce((a, b) => a + b, 0);
  let th = { ...init };
  const m = [], thetas = [];
  const Qbar = new Float64Array(N + 1);
  const k = new Int32Array(N + 1);
  for (let t = 0; t < burn + iters; t++) {
    const Q = Qclass(N, th);
    let mm = 0, H1 = 0, H0 = 0, T1 = 0, T0 = 0;
    for (let e = 0; e <= N; e++) {
      k[e] = binomial(rng, c[e], Q[e]);
      mm += k[e]; H1 += k[e] * e; T1 += k[e] * N;
      H0 += (c[e] - k[e]) * e; T0 += (c[e] - k[e]) * N;
    }
    const rho = rng.beta(1 + mm, 1 + M - mm);
    let alpha, beta, tries = 0;
    do { alpha = rng.beta(1 + H1, 1 + T1 - H1); beta = rng.beta(1 + H0, 1 + T0 - H0); } while (alpha <= beta && ++tries < 200);
    th = { rho, alpha: Math.max(alpha, beta), beta: Math.min(alpha, beta) };
    if (t >= burn) {
      m.push(mm);
      thetas.push(th);
      const Qt = Qclass(N, th);
      for (let e = 0; e <= N; e++) Qbar[e] += Qt[e] / iters;
    }
  }
  return { m, thetas, Qbar };
}

// Empirical Bayes: edge counts of networks drawn from prod_ij Q_ij at the fixed theta-hat
export function ebEdgeCounts(c, Q, rng, draws = 2000) {
  const out = [];
  for (let d = 0; d < draws; d++) {
    let mm = 0;
    for (let e = 0; e < c.length; e++) mm += binomial(rng, c[e], Q[e]);
    out.push(mm);
  }
  return out;
}

export function quantile(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const sd = (xs) => { const mu = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - mu) ** 2))); };

// Coverage of the true edge count by each method's 90% interval, over many networks
export function coverage(params, reps, seed) {
  const rng = makeRng(seed);
  let eb = 0, fb = 0;
  for (let r = 0; r < reps; r++) {
    const d = generateCounts(params, rng);
    const fit = em(d.c, d.N);
    const e = ebEdgeCounts(d.c, fit.Q, rng, 600);
    const f = gibbs(d.c, d.N, rng, { iters: 600, burn: 200 }).m;
    if (quantile(e, 0.05) <= d.m && d.m <= quantile(e, 0.95)) eb++;
    if (quantile(f, 0.05) <= d.m && d.m <= quantile(f, 0.95)) fb++;
  }
  return { eb: eb / reps, fb: fb / reps, reps };
}
