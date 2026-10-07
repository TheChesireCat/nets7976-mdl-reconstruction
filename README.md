# NETS 7976 directed study: MDL, network reconstruction and message passing

Code written for a directed study (Northeastern, Fall 2026) on the minimum description length
principle, network reconstruction from noisy data, and message-passing inference.

## Contents

| Path | What it is |
|---|---|
| `week-2/code/two_part_mdl.py` | Crude two-part-code MDL for Markov chains and polynomials, and the regularities it cannot see (Grünwald 2004). |
| `week-3/code/eb_vs_full_bayes.py` | Empirical Bayes vs. full Bayes (Gibbs) for Newman's noisy-network model on synthetic networks: where plugging in θ̂ is fine and where it is overconfident. |
| `week-3/code/martin-viz/` | Interactive walkthrough of Martin, Ball & Newman (2016), *Structural inference for uncertain networks*: which distribution each step produces, with EM, exact enumeration and belief propagation. |
| `week-3/code/newman-viz/` | Interactive walkthrough of Newman (2018), *Network structure from rich but noisy data*. |
| `week-3/code/viz-common/` | Chart helpers, styles and a seeded RNG shared by the two walkthroughs. |
| `week-4/code/bayes-primer-viz/` | A Bayesian workflow primer after Carpenter's *Getting Started with Bayesian Statistics*: grid and Monte Carlo on Laplace's births, then Metropolis vs. HMC, marginalization, label switching and posterior-predictive checks on a Poisson mixture. |
| `week-4/code/young-viz/` | Interactive walkthrough of Young, Cantwell & Newman (2020), *Bayesian inference of network structure from unreliable data*, on the dolphin data. |
| `week-4/code/viz-common/` | The Week 4 samplers (Metropolis, HMC, R̂, ESS), the Poisson-mixture model, and a Web Worker that runs them. |
| `week-4/code/stan_check.py` | Fits the dolphin models in CmdStan, to check the in-browser samplers against Stan. |

## Running

Python scripts need only NumPy:

```bash
python week-2/code/two_part_mdl.py both
python week-3/code/eb_vs_full_bayes.py sweep
```

The walkthroughs are plain HTML and JavaScript modules with no dependencies or build step, but
browsers only load modules over HTTP, so serve the folder and open the pages:

```bash
cd week-3/code && python -m http.server 8765
```

Then visit `http://localhost:8765/martin-viz/` and `http://localhost:8765/newman-viz/`.

The Week 4 pages import shared code from `week-3/`, so serve the repository root for those:

```bash
python -m http.server 8765
```

and visit `http://localhost:8765/week-4/code/bayes-primer-viz/` and `http://localhost:8765/week-4/code/young-viz/`.
Add `?test` to the primer's URL to log finite-difference checks of every gradient.

The dolphin counts in `week-4/code/young-viz/data/dolphins.json` come from the authors' repository,
[jg-you/noisy-networks-measurements](https://github.com/jg-you/noisy-networks-measurements) (MIT license).
