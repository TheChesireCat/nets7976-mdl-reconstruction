---
title: Marginalizing a latent variable
stub: true
lede: >-
  When a model contains an unknown you never observe, such as which group an item belongs to, you can
  remove it by summing the joint probability over every value it could take. What is left is the
  likelihood of what you did observe, which a sampler or an optimizer can work with directly. The hidden
  values come back afterwards from their conditional distribution.
equation: 'p(x \mid \theta) = \sum_{z} p(x, z \mid \theta)'
notation: '\(x\) the data, \(z\) the latent variable, \(\theta\) the parameters.'
prerequisites: ["wiki:Marginal distribution", "wiki:Bayesian inference"]
further: ["wiki:Latent and observable variables"]
---
