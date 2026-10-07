// The small exact pieces of the primer: Laplace's births (a Beta–Binomial model, where every
// posterior quantity has a closed form to check the numerical answers against).
// The mixture model and the samplers live in ../../viz-common/.

export { makeRng } from "../../../../week-3/code/viz-common/random.js";
import { lgamma } from "../../viz-common/mixture.js";
export * from "../../viz-common/mixture.js";

// Laplace (1774/1812): live births in Paris, 1745–1770 (as in Carpenter's tutorial, §5.3)
export const LAPLACE = { boys: 110312, girls: 105287 };

export const lbeta = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);
export const betaLogPdf = (x, a, b) => (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lbeta(a, b);

// Continued fraction for the incomplete beta function (Numerical Recipes §6.4)
function betacf(x, a, b) {
  const tiny = 1e-300;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 50000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

// Regularized incomplete beta I_x(a, b) = P(θ ≤ x) for θ ~ Beta(a, b)
export function betaCdf(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lfront = a * Math.log(x) + b * Math.log(1 - x) - lbeta(a, b);
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lfront) * betacf(x, a, b)) / a;
  return 1 - (Math.exp(lfront) * betacf(1 - x, b, a)) / b;
}

export function betaQuantile(q, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < q) lo = mid; else hi = mid;
    if (hi - lo < 1e-14) break;
  }
  return (lo + hi) / 2;
}

// Everything section 1 shows, for a Beta(a, b) prior and a fraction of Laplace's data
export function laplace({ a, b, frac }) {
  const boys = Math.round(LAPLACE.boys * frac), girls = Math.round(LAPLACE.girls * frac);
  const A = a + boys, B = b + girls;
  const mean = A / (A + B);
  const sd = Math.sqrt((A * B) / ((A + B) ** 2 * (A + B + 1)));
  const mode = A > 1 && B > 1 ? (A - 1) / (A + B - 2) : NaN;
  const median = betaQuantile(0.5, A, B);
  const ci = [betaQuantile(0.025, A, B), betaQuantile(0.975, A, B)];
  const pLeHalf = betaCdf(0.5, A, B);
  // the grid approximation: evaluate prior × likelihood on a grid and normalize numerically
  const lo = Math.max(1e-6, mean - 7 * sd), hi = Math.min(1 - 1e-6, mean + 7 * sd);
  const G = 400, grid = [], dx = (hi - lo) / (G - 1);
  let mx = -Infinity;
  for (let g = 0; g < G; g++) {
    const t = lo + g * dx;
    const lp = (A - 1) * Math.log(t) + (B - 1) * Math.log(1 - t);
    grid.push([t, lp]);
    if (lp > mx) mx = lp;
  }
  let Z = 0;
  grid.forEach((p) => { p[1] = Math.exp(p[1] - mx); Z += p[1] * dx; });
  // largest gap between the grid and the exact Beta density, relative to the peak
  let err = 0, peak = 0;
  grid.forEach((p) => {
    p[1] /= Z;
    const exact = Math.exp(betaLogPdf(p[0], A, B));
    p.push(exact);
    err = Math.max(err, Math.abs(p[1] - exact));
    peak = Math.max(peak, exact);
  });
  err /= peak;
  return { boys, girls, A, B, mean, sd, mode, median, ci, pLeHalf, lo, hi, grid, gridErr: err };
}
