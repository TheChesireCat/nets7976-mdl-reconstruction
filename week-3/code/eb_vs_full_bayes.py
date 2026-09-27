#!/usr/bin/env python3
"""
Empirical Bayes vs. full Bayes for network reconstruction from noisy data.

Newman (2018), "Network structure from rich but noisy data", Nature Physics.

THE MODEL (Newman's simplest version)
-------------------------------------
    A_ij ~ Bernoulli(rho)                          network prior, one per pair
    E_ij | A_ij = 1 ~ Binomial(N_ij, alpha)        true edge seen w.p. alpha
    E_ij | A_ij = 0 ~ Binomial(N_ij, beta)         non-edge seen w.p. beta

theta = (rho, alpha, beta) is shared by every pair. Given theta, the posterior
over A factorizes into independent Bernoullis with

    Q_ij(theta) = rho a^E (1-a)^(N-E) / [rho a^E (1-a)^(N-E) + (1-rho) b^E (1-b)^(N-E)].

TWO WAYS TO HANDLE theta
------------------------
  EB   Empirical Bayes (what Newman does). Find theta_hat maximizing the marginal
       likelihood P(data | theta) = sum_A P(data | A, theta) P(A | theta) by EM,
       then report Q_ij(theta_hat).  One slice of the joint, at theta = theta_hat.

  FB   Full Bayes. Uniform Beta(1,1) priors on rho, alpha, beta, with alpha > beta
       imposed to break the edge/non-edge mirror symmetry. Blocked Gibbs sampling
       alternates
           A     | theta, data   -- independent coin per pair, prob Q_ij(theta)
           theta | A, data       -- three conjugate Beta draws
       and reports the edge marginals P(A_ij = 1 | data) = E[Q_ij(theta) | data],
       averaged over the posterior of theta (Rao-Blackwellized: we average Q_ij
       over theta samples rather than averaging the 0/1 draws of A).

Under uniform priors, EB's maximum-marginal-likelihood theta is also the MAP of
P(theta | data), so the only difference between EB and FB is whether we sit at
the peak of P(theta | data) or average over its full width. That is exactly the
approximation being tested.

WHAT TO LOOK FOR
----------------
  sweep   Network size n goes from tiny to moderate at fixed density. Watch
            * sd(alpha): the posterior width of theta under FB, shrinking ~ 1/n
              (the number of pairs grows ~ n^2, and width ~ 1/sqrt(pairs));
            * mean / max |Q_EB - Q_FB|: how far the slice is from the average;
            * AUC and log-loss against the TRUE network: does the approximation
              cost any recovery accuracy?
            * 90% coverage of the true edge count: how often each method's
              interval for sum_ij A_ij contains the truth. EB ignores the
              uncertainty in theta. That uncertainty shrinks with n, but a sum
              over M pairs multiplies it by M, so for global quantities like
              this one EB's intervals stay too narrow at every n.

  single  One network at one size, with more detail about theta and the edges.

Usage:
    python eb_vs_full_bayes.py sweep                       # default
    python eb_vs_full_bayes.py sweep --sizes 10 20 40 80 160 --reps 40
    python eb_vs_full_bayes.py single --n 200
"""

import argparse
import time

import numpy as np

EPS = 1e-12

# --------------------------------------------------------------------------
# Synthetic data
# --------------------------------------------------------------------------


def generate(n, rho, alpha, beta, n_meas, rng):
    """Draw a true network A and noisy measurements (E, N) for all n(n-1)/2 pairs.

    N_ij is uniform on 1..n_meas. With equal N for every pair, Q_ij is monotone in
    E_ij for any theta with alpha > beta, so EB and FB would rank pairs identically
    and AUC could never tell them apart. Unequal N makes the ranking depend on theta.

    Everything is stored as flat arrays over the upper triangle; nothing in this
    model depends on which nodes a pair connects, so there is no need for a matrix.
    """
    m_pairs = n * (n - 1) // 2
    A = rng.random(m_pairs) < rho
    N = rng.integers(1, n_meas + 1, size=m_pairs)  # uneven effort: 1..n_meas per pair
    E = np.where(A, rng.binomial(N, alpha), rng.binomial(N, beta))
    return A, E, N


# --------------------------------------------------------------------------
# The shared piece: edge posterior given theta
# --------------------------------------------------------------------------


def edge_posterior(E, N, rho, alpha, beta):
    """Q_ij(theta), computed through its log-odds for numerical stability."""
    logit = (
        np.log(rho + EPS)
        - np.log(1 - rho + EPS)
        + E * (np.log(alpha + EPS) - np.log(beta + EPS))
        + (N - E) * (np.log(1 - alpha + EPS) - np.log(1 - beta + EPS))
    )
    return 1.0 / (1.0 + np.exp(-logit))


# --------------------------------------------------------------------------
# Empirical Bayes: EM for the maximum-marginal-likelihood theta
# --------------------------------------------------------------------------


def fit_eb(E, N, init=(0.1, 0.9, 0.1), tol=1e-10, max_iter=5000):
    """EM, Newman's Eqs. for rho, alpha, beta. Returns theta_hat and Q(theta_hat).

    E-step:  Q_ij = P(A_ij = 1 | data, theta)
    M-step:  rho   = sum Q / M
             alpha = sum Q E / sum Q N              (hit rate among true edges)
             beta  = sum (1-Q) E / sum (1-Q) N      (hit rate among non-edges)
    """
    rho, alpha, beta = init
    for _ in range(max_iter):
        Q = edge_posterior(E, N, rho, alpha, beta)
        new = (
            Q.mean(),
            (Q * E).sum() / ((Q * N).sum() + EPS),
            ((1 - Q) * E).sum() / (((1 - Q) * N).sum() + EPS),
        )
        if max(abs(a - b) for a, b in zip(new, (rho, alpha, beta))) < tol:
            rho, alpha, beta = new
            break
        rho, alpha, beta = new
    return (rho, alpha, beta), edge_posterior(E, N, rho, alpha, beta)


# --------------------------------------------------------------------------
# Full Bayes: blocked Gibbs over (A, theta)
# --------------------------------------------------------------------------


def draw_alpha_beta(a1, b1, a2, b2, rng, max_tries=1000):
    """alpha ~ Beta(a1, b1), beta ~ Beta(a2, b2), conditioned on alpha > beta.

    The two are independent given A, so rejection from the product is exact.
    If the constraint almost never holds (tiny data), fall back to sorting.
    """
    for _ in range(max_tries):
        alpha, beta = rng.beta(a1, b1), rng.beta(a2, b2)
        if alpha > beta:
            return alpha, beta
    return max(alpha, beta), min(alpha, beta)


def fit_fb(E, N, rng, n_samples=2000, burn=500, init=(0.1, 0.9, 0.1)):
    """Gibbs sampler. Returns theta samples, Rao-Blackwellized edge marginals,
    and samples of the total edge count sum_ij A_ij."""
    rho, alpha, beta = init
    m_pairs = len(E)
    thetas = np.empty((n_samples, 3))
    edge_counts = np.empty(n_samples)
    Q_sum = np.zeros(m_pairs)
    for t in range(burn + n_samples):
        # A | theta: independent coin flips, one per pair
        Q = edge_posterior(E, N, rho, alpha, beta)
        A = rng.random(m_pairs) < Q
        # theta | A: conjugate Beta updates from counts over the current network
        m = A.sum()
        rho = rng.beta(1 + m, 1 + m_pairs - m)
        hits_edge, meas_edge = E[A].sum(), N[A].sum()
        hits_non, meas_non = E[~A].sum(), N[~A].sum()
        alpha, beta = draw_alpha_beta(
            1 + hits_edge, 1 + meas_edge - hits_edge, 1 + hits_non, 1 + meas_non - hits_non, rng
        )
        if t >= burn:
            s = t - burn
            thetas[s] = rho, alpha, beta
            edge_counts[s] = m
            Q_sum += edge_posterior(E, N, rho, alpha, beta)
    return thetas, Q_sum / n_samples, edge_counts


# --------------------------------------------------------------------------
# Scoring against the true network
# --------------------------------------------------------------------------


def auc(scores, truth):
    """Probability a random true edge outranks a random non-edge (ties count 1/2)."""
    pos, neg = truth.sum(), (~truth).sum()
    if pos == 0 or neg == 0:
        return np.nan
    # average rank of each distinct score value (pairs with equal E tie exactly)
    _, inverse, counts = np.unique(scores, return_inverse=True, return_counts=True)
    upper = np.cumsum(counts)
    ranks = (upper - (counts - 1) / 2.0)[inverse]
    return (ranks[truth].sum() - pos * (pos + 1) / 2) / (pos * neg)


def log_loss(Q, truth):
    """Mean negative log-probability assigned to the true state of each pair."""
    Q = np.clip(Q, 1e-12, 1 - 1e-12)
    return -np.mean(np.where(truth, np.log(Q), np.log(1 - Q)))


def eb_edge_count_samples(Q, rng, n_draws=2000, chunk=200):
    """Samples of sum_ij A_ij under EB's factorized posterior (a Poisson-binomial)."""
    out = []
    for _ in range(n_draws // chunk):
        out.append((rng.random((chunk, len(Q))) < Q).sum(axis=1))
    return np.concatenate(out)


def covers(samples, value, level=0.90):
    lo, hi = np.quantile(samples, [(1 - level) / 2, 1 - (1 - level) / 2])
    return lo <= value <= hi


# --------------------------------------------------------------------------
# Experiments
# --------------------------------------------------------------------------


def run_one(n, args, rng):
    A, E, N = generate(n, args.rho, args.alpha, args.beta, args.meas, rng)
    theta_eb, Q_eb = fit_eb(E, N)
    thetas, Q_fb, counts_fb = fit_fb(E, N, rng, args.samples, args.burn)
    counts_eb = eb_edge_count_samples(Q_eb, rng)
    m_true = A.sum()
    return dict(
        theta_eb=np.array(theta_eb),
        theta_fb_mean=thetas.mean(axis=0),
        theta_fb_sd=thetas.std(axis=0),
        dQ_mean=np.abs(Q_eb - Q_fb).mean(),
        dQ_max=np.abs(Q_eb - Q_fb).max(),
        auc_eb=auc(Q_eb, A),
        auc_fb=auc(Q_fb, A),
        ll_eb=log_loss(Q_eb, A),
        ll_fb=log_loss(Q_fb, A),
        cov_eb=covers(counts_eb, m_true),
        cov_fb=covers(counts_fb, m_true),
        m_true=m_true,
        m_eb=(Q_eb.sum(), counts_eb.std()),
        m_fb=(Q_fb.sum(), counts_fb.std()),
        n_pairs=len(A),
    )


def print_header(args):
    print("=" * 110)
    print(
        "True theta: rho = %.3f, alpha = %.2f, beta = %.3f;  1..%d measurements per pair;  "
        "Gibbs: %d samples after %d burn-in"
        % (args.rho, args.alpha, args.beta, args.meas, args.samples, args.burn)
    )
    print("=" * 110)


def run_sweep(args):
    print_header(args)
    print("Averages over %d synthetic networks per size.\n" % args.reps)
    print(
        "%5s %7s | %9s %11s | %10s %9s | %6s %6s | %8s %8s | %7s %7s"
        % ("n", "pairs", "FB sd(a)", "|a_EB-a_FB|", "mean|dQ|", "max|dQ|",
           "AUC EB", "AUC FB", "LL EB", "LL FB", "cov EB", "cov FB")
    )
    print("-" * 110)
    for n in args.sizes:
        rng = np.random.default_rng(args.seed + n)
        t0 = time.time()
        res = [run_one(n, args, rng) for _ in range(args.reps)]
        get = lambda k: np.array([r[k] for r in res], dtype=float)
        sd_alpha = np.mean([r["theta_fb_sd"][1] for r in res])
        d_alpha = np.mean([abs(r["theta_eb"][1] - r["theta_fb_mean"][1]) for r in res])
        print(
            "%5d %7d | %9.4f %11.4f | %10.2e %9.3f | %6.3f %6.3f | %8.4f %8.4f | %6.0f%% %6.0f%%   (%.0fs)"
            % (n, res[0]["n_pairs"], sd_alpha, d_alpha,
               get("dQ_mean").mean(), get("dQ_max").mean(),
               np.nanmean(get("auc_eb")), np.nanmean(get("auc_fb")),
               get("ll_eb").mean(), get("ll_fb").mean(),
               100 * get("cov_eb").mean(), 100 * get("cov_fb").mean(),
               time.time() - t0)
        )
    print(
        "\nColumns: FB sd(a) = posterior sd of alpha under full Bayes (width of the theta spike);"
        "\n  |a_EB-a_FB| = EB point estimate vs FB posterior mean of alpha;"
        "\n  dQ = Q_EB - Q_FB per pair (mean over pairs, max over pairs);"
        "\n  AUC / LL (log-loss, lower is better) score each method's edge probabilities against the TRUE network;"
        "\n  cov = how often the 90% posterior interval for the number of edges contains the true number."
    )


def run_single(args):
    print_header(args)
    rng = np.random.default_rng(args.seed)
    t0 = time.time()
    r = run_one(args.n, args, rng)
    print("n = %d nodes, %d pairs, %d true edges   (%.1fs)\n" % (args.n, r["n_pairs"], r["m_true"], time.time() - t0))
    print("%8s %10s %10s %16s" % ("param", "true", "EB", "FB mean +- sd"))
    for i, name in enumerate(("rho", "alpha", "beta")):
        true = (args.rho, args.alpha, args.beta)[i]
        print("%8s %10.4f %10.4f %9.4f +- %.4f"
              % (name, true, r["theta_eb"][i], r["theta_fb_mean"][i], r["theta_fb_sd"][i]))
    print("\nEdge probabilities:  mean |Q_EB - Q_FB| = %.2e,  max = %.2e" % (r["dQ_mean"], r["dQ_max"]))
    print("Recovery vs truth:   AUC  EB = %.4f   FB = %.4f" % (r["auc_eb"], r["auc_fb"]))
    print("                     LL   EB = %.5f  FB = %.5f" % (r["ll_eb"], r["ll_fb"]))
    print("Number of edges:     true = %d,  EB = %.1f +- %.1f,  FB = %.1f +- %.1f"
          % (r["m_true"], *r["m_eb"], *r["m_fb"]))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("mode", nargs="?", default="sweep", choices=["sweep", "single"])
    p.add_argument("--sizes", type=int, nargs="+", default=[10, 20, 40, 80, 160, 320])
    p.add_argument("--n", type=int, default=200, help="network size for 'single'")
    p.add_argument("--reps", type=int, default=30, help="networks per size in 'sweep'")
    p.add_argument("--rho", type=float, default=0.05)
    p.add_argument("--alpha", type=float, default=0.6)
    p.add_argument("--beta", type=float, default=0.02)
    p.add_argument("--meas", type=int, default=5, help="N_ij is uniform on 1..meas")
    p.add_argument("--samples", type=int, default=2000)
    p.add_argument("--burn", type=int, default=500)
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args()
    run_sweep(args) if args.mode == "sweep" else run_single(args)


if __name__ == "__main__":
    main()
