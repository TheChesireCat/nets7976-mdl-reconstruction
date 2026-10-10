---
title: Posterior-predictive check (PPC)
short: ppc
stub: true
lede: >-
  A posterior-predictive check asks whether a fitted model could have produced the data you have. It
  simulates replicate data sets from the posterior and compares them with the real one, often through a
  discrepancy and the p-value it implies. A well-mixed sampler only shows that the posterior was computed
  correctly; this check is about whether the model fits.
equation: 'p = P\bigl(D(\tilde X; \theta) > D(X; \theta) \mid X\bigr)'
notation: '\(X\) the data, \(\tilde X\) a replicate drawn from the posterior predictive, \(D\) a discrepancy.'
prerequisites: ["wiki:Bayesian inference", "wiki:P-value"]
further: ["wiki:Posterior predictive distribution"]
---
