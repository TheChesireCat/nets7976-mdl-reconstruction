// Model and inference for Martin, Ball & Newman (2016), "Structural inference for
// uncertain networks", Phys. Rev. E 93, 012306. Two groups (k = 2) throughout.
//
// Everything here is plain numerics; nothing touches the DOM.

// ---------------------------------------------------------------------------
// Random numbers (seeded, so every chart is reproducible)
// ---------------------------------------------------------------------------

export { makeRng } from "../../viz-common/random.js";
import { makeRng } from "../../viz-common/random.js";

// ---------------------------------------------------------------------------
// Special functions
// ---------------------------------------------------------------------------

export function logGamma(z) {
  // Lanczos approximation, g = 7
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function betaPdf(x, a, b) {
  if (x <= 0 || x >= 1) return 0;
  const lb = logGamma(a) + logGamma(b) - logGamma(a + b);
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lb);
}

const logSumExp = (arr) => {
  let m = -Infinity;
  for (const v of arr) if (v > m) m = v;
  if (m === -Infinity) return m;
  let s = 0;
  for (const v of arr) s += Math.exp(v - m);
  return m + Math.log(s);
};

// ---------------------------------------------------------------------------
// Generative model: SBM (Eq. 1) + noise (Eqs. 2, 38-40)
// ---------------------------------------------------------------------------

// Sparsity c of the non-edge noise, from the calibration constraint (Eq. 4).
// Solving beta1/beta0 = (Q/rho)/((1-Q)/(1-rho)) with a0 = a1-1, b0 = b1+1 gives
//     c = rho/(1-rho) * B(a0,b0)/B(a1,b1) = rho/(1-rho) * b1/(a1-1).
export function noiseSparsity(rho, a1, b1) {
  return (rho / (1 - rho)) * (b1 / (a1 - 1));
}

export function generate({ n, win, wout, a1, b1, seed }) {
  const rng = makeRng(seed);
  const g = new Int8Array(n);
  for (let i = 0; i < n; i++) g[i] = rng.uniform() < 0.5 ? 0 : 1;
  const A = new Uint8Array(n * n);
  let m = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const w = g[i] === g[j] ? win : wout;
      if (rng.uniform() < w) { A[i * n + j] = A[j * n + i] = 1; m++; }
    }
  const pairs = (n * (n - 1)) / 2;
  const rho = m / pairs;
  const cRaw = noiseSparsity(rho, a1, b1);
  const c = Math.min(1, cRaw);
  const Q = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      let q = 0;
      if (A[i * n + j]) q = rng.beta(a1, b1);
      else if (rng.uniform() < c) q = rng.beta(a1 - 1, b1 + 1);
      Q[i * n + j] = Q[j * n + i] = q;
    }
  // display order: sorted by true group, stable
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => g[x] - g[y] || x - y);
  return { n, g, A, Q, m, rho, c, cRaw, feasible: cRaw <= 1, order, win, wout, a1, b1 };
}

// Eq. (5): the density estimated from the data alone
export function rhoHat(Q, n) {
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += Q[i * n + j];
  return s / ((n * (n - 1)) / 2);
}

// ---------------------------------------------------------------------------
// The per-pair pieces left after summing A out (Eqs. 7 and 18)
// ---------------------------------------------------------------------------

// Bracket in Eq. (7): sum over A_ij in {0,1} of P(Q_ij | A_ij) P(A_ij | omega)
export const pairFactor = (q, w, rho) => (q * w) / rho + ((1 - q) * (1 - w)) / (1 - rho);

// Eq. (18): posterior probability of an edge given Q_ij and the two groups
export const edgePosterior = (q, w, rho) => {
  const on = (q * w) / rho;
  return on / (on + ((1 - q) * (1 - w)) / (1 - rho));
};

// ---------------------------------------------------------------------------
// Exact posterior over group assignments, by enumerating all 2^n of them.
// Only for tiny networks (n <= 14). This is what Eq. (14) asks for literally.
// ---------------------------------------------------------------------------

export function pairList(Q, n) {
  const P = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) P.push([i, j, Q[i * n + j]]);
  return P;
}

// log P(Q, g | gamma = 1/2, omega) for every g, with omega = [[win, wout],[wout, win]]
export function logJointAll(pairs, n, win, wout, rho) {
  const G = 1 << n;
  const out = new Float64Array(G);
  const lin = pairs.map(([, , q]) => Math.log(pairFactor(q, win, rho)));
  const lout = pairs.map(([, , q]) => Math.log(pairFactor(q, wout, rho)));
  const base = n * Math.log(0.5);
  for (let gm = 0; gm < G; gm++) {
    let s = base;
    for (let p = 0; p < pairs.length; p++) {
      const [i, j] = pairs[p];
      s += ((gm >> i) & 1) === ((gm >> j) & 1) ? lin[p] : lout[p];
    }
    out[gm] = s;
  }
  return out;
}

export function exactPosterior(pairs, n, win, wout, rho) {
  const lj = logJointAll(pairs, n, win, wout, rho);
  const logZ = logSumExp(lj); // log P(Q | gamma, omega), Eq. (8)
  const post = new Float64Array(lj.length);
  for (let k = 0; k < lj.length; k++) post[k] = Math.exp(lj[k] - logZ);
  const marg = new Float64Array(n); // q_i(group 1), Eq. (12)
  for (let gm = 0; gm < post.length; gm++)
    for (let i = 0; i < n; i++) if ((gm >> i) & 1) marg[i] += post[gm];
  // same-group probability for each pair: the pairwise marginal the M-step needs
  const same = pairs.map(([i, j]) => {
    let s = 0;
    for (let gm = 0; gm < post.length; gm++) if (((gm >> i) & 1) === ((gm >> j) & 1)) s += post[gm];
    return s;
  });
  return { logZ, post, marg, same };
}

// The 1-D EM picture on the tiny network: only omega_in is free.
//   logL(x)      = log sum_g P(Q, g | x)                      (Eq. 8)
//   bound(x; q)  = sum_g q(g) log[P(Q, g | x) / q(g)]         (Eq. 11, first line)
// The bound depends on q only through the same-group probabilities s_ij, so it
// is cheap:  bound(x) = sum_ij [s_ij log F(Q_ij, x) + (1 - s_ij) log F(Q_ij, wout)] + n log(1/2) + H(q)
export function logLikCurve(pairs, n, wout, rho, xs) {
  const G = 1 << n;
  const lout = pairs.map(([, , q]) => Math.log(pairFactor(q, wout, rho)));
  const L = xs.map((x) => pairs.map(([, , q]) => Math.log(pairFactor(q, x, rho))));
  // For each g: constant from between-group pairs, and the list of same-group pairs
  const base = n * Math.log(0.5);
  const res = new Float64Array(xs.length).fill(0);
  const acc = xs.map(() => []);
  for (let gm = 0; gm < G; gm++) {
    let c = base;
    const sameIdx = [];
    for (let p = 0; p < pairs.length; p++) {
      const [i, j] = pairs[p];
      if (((gm >> i) & 1) === ((gm >> j) & 1)) sameIdx.push(p);
      else c += lout[p];
    }
    for (let k = 0; k < xs.length; k++) {
      let s = c;
      const Lk = L[k];
      for (const p of sameIdx) s += Lk[p];
      acc[k].push(s);
    }
  }
  for (let k = 0; k < xs.length; k++) res[k] = logSumExp(acc[k]);
  return res;
}

export function entropy(post) {
  let h = 0;
  for (const p of post) if (p > 0) h -= p * Math.log(p);
  return h;
}

export function boundCurve(pairs, n, wout, rho, xs, same, H) {
  const base = n * Math.log(0.5) + H;
  return xs.map((x) => {
    let s = base;
    for (let p = 0; p < pairs.length; p++) {
      const q = pairs[p][2];
      s += same[p] * Math.log(pairFactor(q, x, rho)) + (1 - same[p]) * Math.log(pairFactor(q, wout, rho));
    }
    return s;
  });
}

// ---------------------------------------------------------------------------
// Belief propagation (Eqs. 27-34) and the EM loop (Eqs. 16, 18, 19)
// ---------------------------------------------------------------------------
//
// Messages eta^{i->j}_r live only on pairs with Q_ij > 0. Pairs with Q_ij = 0
// enter every node through a mean field. The paper uses the leading-order form
// exp(-sum q^k_s omega_rs); this demo network is denser than the paper's, so we
// keep log(1 - omega_rs) instead of -omega_rs. Same idea, one fewer approximation.

const K = 2;

export function buildGraph(Q, n) {
  const edges = []; // unordered pairs with Q > 0
  const deg = new Int32Array(n);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const q = Q[i * n + j];
      if (q > 0) { edges.push([i, j, q]); deg[i]++; deg[j]++; }
    }
  // neighbour lists in flat (CSR) arrays: for node i, slots start[i] .. start[i+1]-1
  // hold the neighbour, the edge id, and the ids of the messages i->j (out) and j->i (inc)
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + deg[i];
  const fill = start.slice(0, n);
  const nj = new Int32Array(start[n]), ne = new Int32Array(start[n]);
  const nout = new Int32Array(start[n]), ninc = new Int32Array(start[n]);
  edges.forEach(([i, j], e) => {
    let k = fill[i]++;
    nj[k] = j; ne[k] = e; nout[k] = 2 * e; ninc[k] = 2 * e + 1; // message ids: 2e is i->j, 2e+1 is j->i
    k = fill[j]++;
    nj[k] = i; ne[k] = e; nout[k] = 2 * e + 1; ninc[k] = 2 * e;
  });
  return { n, edges, start, nj, ne, nout, ninc };
}

// Run BP for fixed parameters. `msg` and `marg` are updated in place (warm start).
// Nodes are updated one at a time (asynchronously), and the mean field is kept
// current as each marginal changes. Updating all nodes at once lets the whole
// network flip between groups on alternate sweeps, because the mean field pushes
// every node the same way at the same time.
export function runBP(graph, gamma, omega, rho, msg, marg, { maxIter = 50, tol = 1e-4, seed = 11 } = {}) {
  const { n, edges, start, nj, ne, nout, ninc } = graph;
  const rng = makeRng(seed);
  const lg0 = Math.log(gamma[0]), lg1 = Math.log(gamma[1]);
  const l00 = Math.log(1 - omega[0][0]), l01 = Math.log(1 - omega[0][1]), l11 = Math.log(1 - omega[1][1]);
  // the pair factor F for every edge and group combination, fixed while BP runs (omega is symmetric)
  const E = edges.length;
  const F00 = new Float64Array(E), F01 = new Float64Array(E), F11 = new Float64Array(E);
  for (let e = 0; e < E; e++) {
    const q = edges[e][2];
    F00[e] = pairFactor(q, omega[0][0], rho);
    F01[e] = pairFactor(q, omega[0][1], rho);
    F11[e] = pairFactor(q, omega[1][1], rho);
  }
  let maxDeg = 0;
  for (let i = 0; i < n; i++) maxDeg = Math.max(maxDeg, start[i + 1] - start[i]);
  const inc0 = new Float64Array(maxDeg), inc1 = new Float64Array(maxDeg);
  const order = Array.from({ length: n }, (_, i) => i);
  // mean field from Q = 0 pairs: all nodes, minus self and Q > 0 neighbours (below)
  let H0 = 0, H1 = 0;
  for (let k = 0; k < n; k++) {
    const m0 = marg[2 * k], m1 = marg[2 * k + 1];
    H0 += m0 * l00 + m1 * l01;
    H1 += m0 * l01 + m1 * l11;
  }
  let iter = 0, delta = Infinity;
  for (; iter < maxIter && delta > tol; iter++) {
    delta = 0;
    for (let k = n - 1; k > 0; k--) {
      const j = Math.floor(rng.uniform() * (k + 1));
      const t = order[k]; order[k] = order[j]; order[j] = t;
    }
    for (const i of order) {
      let t0 = H0 - (marg[2 * i] * l00 + marg[2 * i + 1] * l01);
      let t1 = H1 - (marg[2 * i] * l01 + marg[2 * i + 1] * l11);
      for (let k = start[i], t = 0; k < start[i + 1]; k++, t++) {
        const j = nj[k], e = ne[k], m = 2 * ninc[k];
        const mj0 = marg[2 * j], mj1 = marg[2 * j + 1];
        t0 -= mj0 * l00 + mj1 * l01; // this neighbour enters through its message, not the mean field
        t1 -= mj0 * l01 + mj1 * l11;
        const a = Math.log(msg[m] * F00[e] + msg[m + 1] * F01[e]);
        const b = Math.log(msg[m] * F01[e] + msg[m + 1] * F11[e]);
        inc0[t] = a; inc1[t] = b;
        t0 += a; t1 += b;
      }
      t0 += lg0; t1 += lg1;
      // marginal, and keep the mean field in step with it
      const p = 1 / (1 + Math.exp(t1 - t0));
      const dp = p - marg[2 * i];
      H0 += dp * (l00 - l01);
      H1 += dp * (l01 - l11);
      marg[2 * i] = p;
      marg[2 * i + 1] = 1 - p;
      // outgoing messages: leave out the recipient's own contribution
      for (let k = start[i], t = 0; k < start[i + 1]; k++, t++) {
        const p0 = 1 / (1 + Math.exp((t1 - inc1[t]) - (t0 - inc0[t])));
        const o = 2 * nout[k];
        const d = Math.abs(p0 - msg[o]);
        if (d > delta) delta = d;
        msg[o] = p0;
        msg[o + 1] = 1 - p0;
      }
    }
  }
  return { iter, delta };
}

// Two-node marginals q_rs^ij for pairs with Q > 0 (Eq. 34)
export function pairMarginals(graph, omega, rho, msg) {
  return graph.edges.map(([i, j, q], e) => {
    const out = 2 * e, inc = 2 * e + 1; // i->j and j->i
    const J = [[0, 0], [0, 0]];
    let Z = 0;
    for (let r = 0; r < K; r++)
      for (let s = 0; s < K; s++) {
        J[r][s] = msg[out * K + r] * msg[inc * K + s] * pairFactor(q, omega[r][s], rho);
        Z += J[r][s];
      }
    for (let r = 0; r < K; r++) for (let s = 0; s < K; s++) J[r][s] /= Z;
    return J;
  });
}

// M-step: Eq. (16) for gamma, Eqs. (18)-(19) iterated for omega
export function mStep(graph, marg, J, omega, rho, inner = 25) {
  const { n, edges } = graph;
  const gamma = [0, 0];
  for (let i = 0; i < n; i++) { gamma[0] += marg[i * K]; gamma[1] += marg[i * K + 1]; }
  gamma[0] /= n; gamma[1] /= n;
  // denominator: sum over ordered pairs i != j of q_rs^ij
  const S = [gamma[0] * n, gamma[1] * n];
  const D = [[0, 0], [0, 0]];
  for (let r = 0; r < K; r++)
    for (let s = 0; s < K; s++) {
      let self = 0;
      for (let i = 0; i < n; i++) self += marg[i * K + r] * marg[i * K + s];
      D[r][s] = S[r] * S[s] - self;
    }
  edges.forEach(([i, j], e) => {
    for (let r = 0; r < K; r++)
      for (let s = 0; s < K; s++) {
        const prod = marg[i * K + r] * marg[j * K + s] + marg[j * K + r] * marg[i * K + s];
        D[r][s] += J[e][r][s] + J[e][s][r] - prod;
      }
  });
  let w = omega.map((row) => row.slice());
  for (let it = 0; it < inner; it++) {
    const N = [[0, 0], [0, 0]];
    edges.forEach(([, , q], e) => {
      for (let r = 0; r < K; r++)
        for (let s = 0; s < K; s++) {
          const t = edgePosterior(q, w[r][s], rho);
          N[r][s] += (J[e][r][s] + J[e][s][r]) * t;
        }
    });
    w = w.map((row, r) => row.map((_, s) => Math.min(0.999, Math.max(1e-6, N[r][s] / D[r][s]))));
  }
  return { gamma, omega: w };
}

export function accuracy(marg, g) {
  let hit = 0;
  for (let i = 0; i < g.length; i++) if ((marg[i * K + 1] > 0.5 ? 1 : 0) === g[i]) hit++;
  const a = hit / g.length;
  return Math.max(a, 1 - a); // groups are only defined up to relabelling
}

// Full EM with BP. Returns the fitted parameters, marginals and a history.
export function fitEM(Q, n, { seed = 1, rho: rhoIn, maxOuter = 60, tol = 1e-4, truth = null } = {}) {
  const rng = makeRng(seed);
  const rho = rhoIn ?? rhoHat(Q, n);
  const graph = buildGraph(Q, n);
  let gamma = [0.5, 0.5];
  let omega = [[1.5 * rho, 0.5 * rho], [0.5 * rho, 1.5 * rho]].map((r) => r.map((w) => Math.min(0.95, w)));
  const msg = new Float64Array(graph.edges.length * 2 * K);
  for (let e = 0; e < msg.length / K; e++) {
    const p = 0.5 + 0.2 * (rng.uniform() - 0.5);
    msg[e * K] = p; msg[e * K + 1] = 1 - p;
  }
  const marg = new Float64Array(n * K);
  for (let i = 0; i < n; i++) {
    const p = 0.5 + 0.2 * (rng.uniform() - 0.5);
    marg[i * K] = p; marg[i * K + 1] = 1 - p;
  }
  const history = [];
  let J = null;
  for (let outer = 0; outer < maxOuter; outer++) {
    runBP(graph, gamma, omega, rho, msg, marg);
    J = pairMarginals(graph, omega, rho, msg);
    const upd = mStep(graph, marg, J, omega, rho);
    const change = Math.max(
      Math.abs(upd.omega[0][0] - omega[0][0]), Math.abs(upd.omega[1][1] - omega[1][1]),
      Math.abs(upd.omega[0][1] - omega[0][1]));
    gamma = upd.gamma; omega = upd.omega;
    history.push({
      iter: outer + 1, w00: omega[0][0], w11: omega[1][1], w01: omega[0][1],
      acc: truth ? accuracy(marg, truth) : null,
    });
    if (change < tol) break;
  }
  runBP(graph, gamma, omega, rho, msg, marg, { maxIter: 200, tol: 1e-6 });
  J = pairMarginals(graph, omega, rho, msg);
  return { gamma, omega, rho, marg, msg, J, graph, history };
}

// Eq. (41): P(A_ij = 1 | Q) = sum_rs t_rs^ij q_rs^ij, for pairs with Q > 0.
// Pairs with Q = 0 have t = 0, hence posterior 0.
export function edgeRecovery(fit) {
  const { graph, J, omega, rho } = fit;
  return graph.edges.map(([i, j, q], e) => {
    let p = 0, same = 0;
    for (let r = 0; r < K; r++)
      for (let s = 0; s < K; s++) {
        p += J[e][r][s] * edgePosterior(q, omega[r][s], rho);
        if (r === s) same += J[e][r][s];
      }
    return { i, j, q, post: p, same };
  });
}

// ROC over all pairs. `scores` and `labels` are flat arrays over unordered pairs.
export function roc(scores, labels) {
  const idx = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]);
  let P = 0, N = 0;
  for (const l of labels) l ? P++ : N++;
  const pts = [{ fpr: 0, tpr: 0 }];
  let tp = 0, fp = 0, auc = 0;
  for (let k = 0; k < idx.length; ) {
    const v = scores[idx[k]];
    let dtp = 0, dfp = 0;
    while (k < idx.length && scores[idx[k]] === v) { labels[idx[k]] ? dtp++ : dfp++; k++; }
    const prevF = fp / N, prevT = tp / P;
    tp += dtp; fp += dfp;
    auc += ((fp / N - prevF) * (tp / P + prevT)) / 2;
    pts.push({ fpr: fp / N, tpr: tp / P });
  }
  return { pts, auc };
}

// The thresholding baseline (Sec. III A, Fig. 3a): cut Q at tau, then fit the
// ordinary SBM to the resulting 0/1 network with the same machinery.
export function thresholdFit(Q, n, tau, truth, seed) {
  const B = new Float64Array(n * n);
  for (let k = 0; k < B.length; k++) B[k] = Q[k] > tau ? 1 : 0;
  const rho = rhoHat(B, n);
  if (rho === 0 || rho === 1) return 0.5;
  const f = fitEM(B, n, { seed, rho, maxOuter: 40 });
  return accuracy(f.marg, truth);
}
