// One fit per message, off the main thread. The page runs several of these in parallel.
//
//   { id, task: "l1", data, lams, fold }  -> { id, result: { Ws } | { held } }
//   { id, task: "mdl", data, seed }       -> { id, result: { snaps, sweeps, ks } }

import { Fit } from "./ising.js";
import { l1PathTask, MDL } from "./fits.js";

self.onmessage = ({ data: msg }) => {
  let result;
  if (msg.task === "l1") result = l1PathTask(msg.data, msg.lams, msg.fold);
  else if (msg.task === "mdl") {
    const mdl = new MDL(new Fit(msg.data), msg.seed);
    const { snaps, sweeps } = mdl.run({ record: true });
    const ks = [1, 2, 3, 4, 5, 6].map((K) => mdl.forceK(K));
    result = { snaps, sweeps, ks };
  }
  self.postMessage({ id: msg.id, result });
};
