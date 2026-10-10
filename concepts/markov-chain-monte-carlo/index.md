---
title: Markov chain Monte Carlo (MCMC)
short: mcmc
stub: true
lede: >-
  Markov chain Monte Carlo draws from a distribution you can evaluate only up to a constant. It runs a
  random walk whose long-run positions follow the target, so averages over the walk estimate expectations
  under it. The price is that successive draws are correlated, so a chain has to be checked before its
  averages are trusted.
equation: '\tfrac{1}{M} \textstyle\sum_{m=1}^{M} f(\theta^{(m)}) \;\to\; \mathbb{E}[f(\theta)]'
notation: '\(\theta\) the parameters, \(p(\theta)\) the target density, \(\theta^{(m)}\) the \(m\)-th draw.'
prerequisites: ["wiki:Markov chain", "wiki:Monte Carlo method"]
further: ["wiki:Markov chain Monte Carlo"]
---

<h2 id="metropolis">Metropolis</h2>

To be written.

<h2 id="hmc">Hamiltonian Monte Carlo</h2>

To be written.

<h2 id="gibbs">Gibbs sampling</h2>

To be written.

<h2 id="diagnostics">Diagnostics: \(\hat R\) and effective sample size</h2>

To be written.
