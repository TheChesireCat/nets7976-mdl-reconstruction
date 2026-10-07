// Runs the samplers off the main thread, so dragging a slider never freezes the page.
// Shared by the primer and the dolphin page.
//
//   { id, key, target: makeTarget args, sampler: "hmc" | "mh", starts, iters, warmup,
//     opts, seed, record, ppc?: { xs, n } }
//   -> { id, key, chains: [{ params, lps, steps, accept, evals, eps, scale }], diagnostics, ppc? }
//
// `steps` (the first `record` iterations, for animation) come back in the model's own
// parameters, not the unconstrained ones the sampler moved in.

import * as M from "./mixture.js";
import { makeRng } from "../../../week-3/code/viz-common/random.js";

self.onmessage = ({ data: msg }) => {
  const rng = makeRng(msg.seed);
  const target = M.makeTarget(msg.target);
  const res = M.sampleMixture(target, {
    sampler: msg.sampler, starts: msg.starts, iters: msg.iters, warmup: msg.warmup,
    rng, opts: msg.opts ?? {}, record: msg.record ?? 0,
  });
  const P = (u) => target.toParams(u).lam.slice(0, 2);
  const chains = res.chains.map((c) => ({
    params: c.params, lps: c.lps, accept: c.accept, evals: c.evals, eps: c.eps, scale: c.scale,
    steps: c.steps.map((s) => ({ from: P(s.from), to: s.to ? P(s.to) : null, path: s.path ? s.path.map(P) : null, ok: s.ok })),
  }));
  const out = { id: msg.id, key: msg.key, chains, diagnostics: res.diagnostics };
  if (msg.ppc) {
    const post = res.chains.flatMap((c) => c.params.slice(msg.warmup));
    const pick = Array.from({ length: msg.ppc.n }, () => post[Math.floor(rng.uniform() * post.length)]);
    out.ppc = M.ppc(msg.ppc.xs, pick, rng);
    out.ppcParams = pick;
  }
  self.postMessage(out);
};
