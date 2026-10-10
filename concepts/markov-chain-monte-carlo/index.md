---
title: Markov chain Monte Carlo
lede: >-
  Draw dependent samples from a posterior you can only evaluate up to a constant, then check
  that the chain has forgotten where it started.
prerequisites: []
---

*Stub.* A Markov chain whose stationary distribution is the posterior turns "evaluate up to a constant"
into "draw samples". Run several chains and compare them: the potential scale reduction \(\hat R\) should be
close to 1, and the state \(x_{t+1}\) depends on \(x_t\) only, so the draws are correlated.

Correlation shrinks the information in \(N\) draws to an effective sample size

\[ \mathrm{ESS} = N/\tau \]

where \(\tau = 1 + 2\sum_{k\ge 1} \rho_k\) is the integrated autocorrelation time, and \(a_{i}*b_{j}\) or
`code with \(no math\)` must survive too.
