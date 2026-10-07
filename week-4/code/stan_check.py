"""Fit the dolphin models of Young, Cantwell & Newman (2020) in CmdStan, to check the
hand-written samplers of the Week 4 web pages against Stan itself.

The model is the one on the pages: K edge types, ordered Poisson rates with Normal+(1, 100)
priors, a flat Dirichlet on the edge-type probabilities, and the network summed out, one
factor per distinct count (the paper's Sec. A.6.2).

    python week-4/code/stan_check.py            # K = 2 and K = 3
    python week-4/code/stan_check.py --K 3

Needs numpy and cmdstanpy (plus a CmdStan install: `python -m cmdstanpy.install_cmdstan`).
"""

import argparse
import json
import tempfile
from pathlib import Path

import numpy as np
from cmdstanpy import CmdStanModel

HERE = Path(__file__).parent

STAN = """
data {
  int<lower=1> V;                 // distinct counts
  array[V] int<lower=0> x;        // the counts
  array[V] int<lower=1> c;        // how many pairs have each count
  int<lower=1> K;                 // edge types
}
parameters {
  positive_ordered[K] lambda;
  simplex[K] rho;
}
model {
  lambda ~ normal(1, 100);
  for (v in 1:V) {
    vector[K] z;
    for (k in 1:K) z[k] = log(rho[k]) + poisson_lpmf(x[v] | lambda[k]);
    target += c[v] * log_sum_exp(z);
  }
}
generated quantities {
  // Q[v, k]: posterior probability that a pair with count x[v] has edge type k (Eq. A.14)
  array[V, K] real Q;
  for (v in 1:V) {
    vector[K] z;
    for (k in 1:K) z[k] = log(rho[k]) + poisson_lpmf(x[v] | lambda[k]);
    for (k in 1:K) Q[v, k] = exp(z[k] - log_sum_exp(z));
  }
}
"""

PAPER = {
    2: "lambda0 0.62 [0.06, 0.98], lambda1 14.3 [10.8, 16.8], rho 0.28 [0.18, 0.43], p = 0.136",
    3: "lambda 0.02, 5.13, 21.97; rho 0.58, 0.28, 0.14; p = 0.722",
}


def load():
    d = json.loads((HERE / "young-viz" / "data" / "dolphins.json").read_text())
    X = np.array(d["X"])
    xs = X[np.triu_indices(d["n"], k=1)]
    values, counts = np.unique(xs, return_counts=True)
    return xs, values, counts


def ppc_pvalue(xs, values, lam, rho, Q, rng, n=500):
    """Discrepancy p-value, as in the authors' tutorial (cells 66 and 70)."""
    idx = {v: i for i, v in enumerate(values)}
    rows = np.array([idx[x] for x in xs])
    pick = rng.choice(len(lam), size=n, replace=False)
    above = 0
    for s in pick:
        q = Q[s][rows]                                   # pairs x K
        m = q @ lam[s]                                   # expected counts
        u = rng.random(len(xs))
        A = (u[:, None] > np.cumsum(q, axis=1)).sum(axis=1)
        rep = rng.poisson(lam[s][A])
        d = lambda y: np.sum(y[y > 0] * np.log(y[y > 0] / m[y > 0]))
        above += d(rep) > d(xs)
    return above / n


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--K", type=int, nargs="*", default=[2, 3])
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    xs, values, counts = load()
    with tempfile.TemporaryDirectory() as tmp:
        stan_file = Path(tmp) / "dolphins.stan"
        stan_file.write_text(STAN)
        model = CmdStanModel(stan_file=str(stan_file))
        rng = np.random.default_rng(args.seed)
        for K in args.K:
            fit = model.sample(data={"V": len(values), "x": values.tolist(), "c": counts.tolist(), "K": K},
                               chains=4, iter_warmup=1000, iter_sampling=1000, seed=args.seed, show_progress=False)
            lam, rho, Q = fit.stan_variable("lambda"), fit.stan_variable("rho"), fit.stan_variable("Q")
            print(f"\n=== K = {K} edge types ===")
            print(fit.summary().loc[[f"lambda[{k + 1}]" for k in range(K)] + [f"rho[{k + 1}]" for k in range(K)],
                                    ["Mean", "5%", "95%", "R_hat", "ESS_bulk"]].round(3).to_string())
            print(f"posterior-predictive p = {ppc_pvalue(xs, values, lam, rho, Q, rng):.3f}")
            print(f"paper:  {PAPER[K]}")


if __name__ == "__main__":
    main()
