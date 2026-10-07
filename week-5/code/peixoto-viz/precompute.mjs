// Precomputes the Fig. 2 comparison (MDL vs. normal prior vs. L1 + 5-fold CV, as M grows) for §6,
// because L1 with cross-validation takes tens of seconds per point. Uses the same code as the page.
//
//   node precompute.mjs   ->   data/compare.json

import { writeFileSync } from "node:fs";
import { trueNetwork, simulate, WEIGHT_MODES } from "./js/ising.js";
import { comparePoint } from "./js/fits.js";

const Ms = [100, 200, 400, 800, 1600, 3200], seeds = [1, 2, 3];
const out = { Ms, seeds, modes: {} };
for (const mode of Object.keys(WEIGHT_MODES)) {
  const net = trueNetwork(mode, 1);
  out.modes[mode] = Ms.map((M) => seeds.map((s) => {
    const r = comparePoint(net, simulate(net, M, 7 + 100 * s));
    console.log(mode, M, s, JSON.stringify(r));
    return r;
  }));
}
const round = (k, v) => (typeof v === "number" ? +v.toFixed(4) : v);
writeFileSync(new URL("./data/compare.json", import.meta.url), JSON.stringify(out, round));
