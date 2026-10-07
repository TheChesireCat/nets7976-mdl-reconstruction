// Kinetic Ising model (Peixoto 2025, Eq. A4, with θ = 0) and the cached state every fit works on.
//
//   P(x(t+1) | x(t), W) = Π_i exp(x_i(t+1) h_i(t)) / 2cosh h_i(t),   h_i(t) = Σ_j W_ij x_j(t)
//
// A Fit holds the fields h for a chosen set of transitions, plus tanh h and log 2cosh h, so that the
// change in log-likelihood from moving one or a few entries of W costs one pass over the affected rows.

import { makeRng } from "../../../../week-3/code/viz-common/random.js";
export { makeRng };

// Zachary's karate club, 0-indexed (the network of the paper's Fig. 1)
export const KARATE = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 10], [0, 11], [0, 12], [0, 13], [0, 17], [0, 19], [0, 21], [0, 31],
  [1, 2], [1, 3], [1, 7], [1, 13], [1, 17], [1, 19], [1, 21], [1, 30], [2, 3], [2, 7], [2, 8], [2, 9], [2, 13], [2, 27], [2, 28], [2, 32],
  [3, 7], [3, 12], [3, 13], [4, 6], [4, 10], [5, 6], [5, 10], [5, 16], [6, 16], [8, 30], [8, 32], [8, 33], [9, 33], [13, 33], [14, 32],
  [14, 33], [15, 32], [15, 33], [18, 32], [18, 33], [19, 33], [20, 32], [20, 33], [22, 32], [22, 33], [23, 25], [23, 27], [23, 29],
  [23, 32], [23, 33], [24, 25], [24, 27], [24, 31], [25, 31], [26, 29], [26, 33], [27, 33], [28, 31], [28, 33], [29, 32], [29, 33],
  [30, 32], [30, 33], [31, 32], [31, 33], [32, 33],
];

// Pair indexing for i < j
export function pairs(N) {
  const P = (N * (N - 1)) / 2, I = new Int32Array(P), J = new Int32Array(P), idx = new Int32Array(N * N).fill(-1);
  let p = 0;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { I[p] = i; J[p] = j; idx[i * N + j] = idx[j * N + i] = p; p++; }
  return { P, I, J, idx };
}

// True weights on the karate edges. "equal" is the paper's choice: Normal(N/2E, 0.01).
export const WEIGHT_MODES = {
  equal: { label: "≈ equal (paper)", draw: (rng, mu) => mu + 0.01 * rng.normal() },
  two: { label: "two strengths", draw: (rng, mu, k) => (k % 2 ? 1.45 : 0.55) * mu + 0.01 * rng.normal() },
  spread: { label: "spread out", draw: (rng, mu) => Math.max(0.03, mu * (1 + 0.4 * rng.normal())) },
};

export function trueNetwork(mode, seed) {
  const N = 34, E = KARATE.length, mu = N / (2 * E), rng = makeRng(1000 + seed);
  const pp = pairs(N), W = new Float64Array(pp.P);
  // shuffle which edges get which strength in the "two" mode, so it isn't tied to edge order
  const order = KARATE.map((_, k) => k).sort(() => rng.uniform() - 0.5);
  order.forEach((e, k) => { const [i, j] = KARATE[e]; W[pp.idx[i * N + j]] = WEIGHT_MODES[mode].draw(rng, mu, k); });
  return { N, E, mu, W, ...pp };
}

// Simulate M transitions. X[i * (M + 1) + t] ∈ {−1, +1}.
export function simulate(net, M, seed) {
  const { N, W, I, J, P } = net, rng = makeRng(seed), T = M + 1;
  const X = new Int8Array(N * T), h = new Float64Array(N);
  for (let i = 0; i < N; i++) X[i * T] = rng.uniform() < 0.5 ? -1 : 1;
  for (let t = 0; t < M; t++) {
    h.fill(0);
    for (let p = 0; p < P; p++) {
      const w = W[p];
      if (w === 0) continue;
      h[I[p]] += w * X[J[p] * T + t];
      h[J[p]] += w * X[I[p] * T + t];
    }
    for (let i = 0; i < N; i++) X[i * T + t + 1] = rng.uniform() < 0.5 * (1 + Math.tanh(h[i])) ? 1 : -1;
  }
  return { N, M, X };
}

// ---------------------------------------------------------------------------

export class Fit {
  // data: { N, M, X }, tsel: indices of the transitions t -> t+1 to use (default: all)
  constructor(data, tsel = null) {
    const { N, M, X } = data, Tt = M + 1;
    const ts = tsel ?? Int32Array.from({ length: M }, (_, t) => t);
    const T = ts.length;
    this.N = N; this.T = T;
    Object.assign(this, pairs(N));
    this.xin = new Float64Array(N * T);
    this.yout = new Float64Array(N * T);
    for (let i = 0; i < N; i++)
      for (let k = 0; k < T; k++) { this.xin[i * T + k] = X[i * Tt + ts[k]]; this.yout[i * T + k] = X[i * Tt + ts[k] + 1]; }
    this.W = new Float64Array(this.P);          // by pair
    this.H = new Float64Array(N * T);
    this.TH = new Float64Array(N * T);
    this.LC = new Float64Array(N * T);
    this.tmp = new Float64Array(T);
    this.refresh();
  }

  // Recompute every cache from W
  refresh() {
    const { N, T, P, I, J, W, H, xin } = this;
    H.fill(0);
    for (let p = 0; p < P; p++) {
      const w = W[p];
      if (w === 0) continue;
      const i = I[p] * T, j = J[p] * T;
      for (let t = 0; t < T; t++) { H[i + t] += w * xin[j + t]; H[j + t] += w * xin[i + t]; }
    }
    for (let a = 0; a < N; a++) this.recache(a);
  }

  setW(Wnew) { this.W.set(Wnew); this.refresh(); }

  recache(a) {
    const { T, H, TH, LC } = this, o = a * T;
    for (let t = o; t < o + T; t++) {
      const h = H[t], ah = h < 0 ? -h : h, e = Math.exp(-2 * ah), th = (1 - e) / (1 + e);
      TH[t] = h < 0 ? -th : th;
      LC[t] = ah + Math.log1p(e);
    }
  }

  logLik() {
    const { N, T, H, yout, LC } = this;
    let s = 0;
    for (let k = 0; k < N * T; k++) s += yout[k] * H[k] - LC[k];
    return s;
  }

  // W_p += dw, and update the caches of its two nodes
  apply(p, dw) {
    if (dw === 0) return;
    const { T, H, xin } = this, i = this.I[p], j = this.J[p], oi = i * T, oj = j * T;
    this.W[p] += dw;
    if (Math.abs(this.W[p]) < 1e-14) this.W[p] = 0;
    for (let t = 0; t < T; t++) { H[oi + t] += dw * xin[oj + t]; H[oj + t] += dw * xin[oi + t]; }
    this.recache(i); this.recache(j);
  }

  // Gradient and (minus) curvature of log P(X | W) in W_p at the current state, from the cache
  gradCurv(p) {
    const { T, TH, xin, yout } = this, oi = this.I[p] * T, oj = this.J[p] * T;
    let g = 0, c = 0;
    for (let t = 0; t < T; t++) {
      const ti = TH[oi + t], tj = TH[oj + t];
      g += xin[oj + t] * (yout[oi + t] - ti) + xin[oi + t] * (yout[oj + t] - tj);
      c += 2 - ti * ti - tj * tj;
    }
    return [g, c];
  }

  grad(p) {
    const { T, TH, xin, yout } = this, oi = this.I[p] * T, oj = this.J[p] * T;
    let g = 0;
    for (let t = 0; t < T; t++) g += xin[oj + t] * (yout[oi + t] - TH[oi + t]) + xin[oi + t] * (yout[oj + t] - TH[oj + t]);
    return g;
  }

  // Exact change in log-likelihood if W_p += dw (nothing is modified)
  deltaPair(p, dw) {
    const i = this.I[p], j = this.J[p];
    return this.deltaNode(i, j, dw) + this.deltaNode(j, i, dw);
  }

  deltaNode(a, b, dw) {
    const { T, H, LC, xin, yout } = this, oa = a * T, ob = b * T;
    let s = 0;
    for (let t = 0; t < T; t++) {
      const dh = dw * xin[ob + t], h = H[oa + t] + dh, ah = h < 0 ? -h : h;
      s += yout[oa + t] * dh - (ah + Math.log1p(Math.exp(-2 * ah)) - LC[oa + t]);
    }
    return s;
  }

  // Exact change for several simultaneous moves: changes = [[p, dw], ...]
  deltaMulti(changes) {
    if (changes.length === 1) return this.deltaPair(changes[0][0], changes[0][1]);
    const { T, H, LC, xin, yout, tmp } = this, byNode = new Map();
    for (const [p, dw] of changes) {
      if (dw === 0) continue;
      const i = this.I[p], j = this.J[p];
      if (!byNode.has(i)) byNode.set(i, []);
      if (!byNode.has(j)) byNode.set(j, []);
      byNode.get(i).push(j, dw); byNode.get(j).push(i, dw);
    }
    let s = 0;
    for (const [a, lst] of byNode) {
      tmp.fill(0);
      for (let k = 0; k < lst.length; k += 2) { const ob = lst[k] * T, dw = lst[k + 1]; for (let t = 0; t < T; t++) tmp[t] += dw * xin[ob + t]; }
      const oa = a * T;
      for (let t = 0; t < T; t++) {
        const dh = tmp[t], h = H[oa + t] + dh, ah = h < 0 ? -h : h;
        s += yout[oa + t] * dh - (ah + Math.log1p(Math.exp(-2 * ah)) - LC[oa + t]);
      }
    }
    return s;
  }

  applyMulti(changes) {
    const { T, H, xin } = this, touched = new Set();
    for (const [p, dw] of changes) {
      if (dw === 0) continue;
      const i = this.I[p], j = this.J[p], oi = i * T, oj = j * T;
      this.W[p] += dw;
      if (Math.abs(this.W[p]) < 1e-14) this.W[p] = 0;
      for (let t = 0; t < T; t++) { H[oi + t] += dw * xin[oj + t]; H[oj + t] += dw * xin[oi + t]; }
      touched.add(i); touched.add(j);
    }
    for (const a of touched) this.recache(a);
  }
}

// Jaccard similarity, Eq. (11), and its binarized version
export function similarity(Wt, Wh) {
  let num = 0, den = 0, an = 0, ad = 0;
  for (let p = 0; p < Wt.length; p++) {
    const a = Math.abs(Wt[p]), b = Math.abs(Wh[p]);
    num += Math.abs(Wt[p] - Wh[p]); den += a + b;
    const A = a > 0 ? 1 : 0, B = b > 0 ? 1 : 0;
    an += Math.abs(A - B); ad += A + B;
  }
  return { sW: den ? 1 - num / den : 1, sA: ad ? 1 - an / ad : 1 };
}

export function countEdges(W) { let E = 0; for (let p = 0; p < W.length; p++) if (W[p] !== 0) E++; return E; }
