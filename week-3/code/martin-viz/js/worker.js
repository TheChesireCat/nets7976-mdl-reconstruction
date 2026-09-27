// Heavy computation off the main thread, so the page never freezes while you drag a slider.
//
//   {type: "fit", id, params, seed}     -> generate the network, fit EM + BP, score edges
//   {type: "sweep", params, seed}       -> the thresholding baseline, one point per message

import * as M from "./model.js";

// ROC curves have one point per distinct score; resample to a fixed FPR grid for drawing
function rocCurve(scores, labels) {
  const { pts, auc } = M.roc(scores, labels);
  const out = [];
  let k = 0;
  for (let s = 0; s <= 100; s++) {
    const x = s / 100;
    while (k < pts.length - 1 && pts[k + 1].fpr < x) k++;
    const a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)];
    const t = b.fpr === a.fpr ? 1 : Math.max(0, Math.min(1, (x - a.fpr) / (b.fpr - a.fpr)));
    out.push([x, a.tpr + t * (b.tpr - a.tpr)]);
  }
  return { curve: out, auc };
}

function fit(params, seed) {
  const d = M.generate({ ...params, seed });
  const f = M.fitEM(d.Q, d.n, { truth: d.g, seed });
  const rec = M.edgeRecovery(f);
  // align labels with the truth so "group A" means the same thing on every chart
  let agree = 0;
  for (let i = 0; i < d.n; i++) agree += (f.marg[2 * i + 1] > 0.5 ? 1 : 0) === d.g[i] ? 1 : 0;
  const flip = agree < d.n / 2;
  // scores over all pairs for the ROC: raw Q, and the posterior (0 wherever Q = 0)
  const n = d.n, post = new Float64Array(n * n);
  for (const r of rec) post[r.i * n + r.j] = r.post;
  const raw = [], sc = [], lab = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) { raw.push(d.Q[i * n + j]); sc.push(post[i * n + j]); lab.push(d.A[i * n + j]); }
  return {
    data: d,
    fit: { gamma: f.gamma, omega: f.omega, rho: f.rho, marg: f.marg, history: f.history },
    rec, flip,
    rocQ: rocCurve(raw, lab), rocP: rocCurve(sc, lab),
  };
}

const TAUS = Array.from({ length: 12 }, (_, k) => 0.05 + k * 0.06);

self.onmessage = ({ data: msg }) => {
  if (msg.type === "fit") {
    self.postMessage({ type: "fit", id: msg.id, ...fit(msg.params, msg.seed) });
  } else if (msg.type === "sweep") {
    const d = M.generate({ ...msg.params, seed: msg.seed });
    TAUS.forEach((tau, k) => {
      // average two random starts: one BP run on a thresholded network sometimes
      // stays at the uninformative all-1/2 fixed point
      const acc = [0, 100].map((o) => M.thresholdFit(d.Q, d.n, tau, d.g, msg.seed + k + o));
      self.postMessage({ type: "sweep", point: [tau, (acc[0] + acc[1]) / 2], done: k === TAUS.length - 1, total: TAUS.length });
    });
  }
};
