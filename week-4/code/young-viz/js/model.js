// The dolphin network model of Young, Cantwell & Newman (2020), §3.1, on top of the shared
// Poisson mixture: pair (i, j) has edge type A_ij ∈ {0, …, K − 1}, the count X_ij is Poisson with
// rate λ_{A_ij}, and P(A_ij = k) = ρ_k. Pairs are independent given θ = (λ, ρ).

export { makeRng } from "../../../../week-3/code/viz-common/random.js";
export * from "../../viz-common/mixture.js";
import { histogram, resp } from "../../viz-common/mixture.js";

export async function loadDolphins(url) {
  const d = await (await fetch(url)).json();
  const pairs = [];
  for (let i = 0; i < d.n; i++) for (let j = i + 1; j < d.n; j++) pairs.push({ i, j, x: d.X[i][j] });
  const xs = pairs.map((p) => p.x);
  return { n: d.n, X: d.X, pairs, xs, h: histogram(xs), source: d.source };
}

// Q(k) for every distinct count value, for one draw of θ (Eq. A.14)
export function qByValue(values, { lam, pi }) {
  const out = new Map();
  for (const v of values) out.set(v, resp(v, lam, pi));
  return out;
}

// One network from P(A | θ, X): an independent draw per pair (Eq. A.13)
export function drawNetwork(pairs, Qv, rng) {
  return pairs.map((p) => {
    const q = Qv.get(p.x);
    let u = rng.uniform(), k = 0;
    while (k < q.length - 1 && u > q[k]) { u -= q[k]; k++; }
    return k;
  });
}

// Number of edges (any type) and of triangles in a sampled network
export function netStats(n, pairs, A) {
  const adj = Array.from({ length: n }, () => new Uint8Array(n));
  let m = 0;
  pairs.forEach((p, e) => { if (A[e] > 0) { adj[p.i][p.j] = adj[p.j][p.i] = 1; m++; } });
  let tri = 0;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (adj[a][b]) for (let c = b + 1; c < n; c++) if (adj[a][c] && adj[b][c]) tri++;
  return { m, tri };
}
