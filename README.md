# NETS 7976 directed study: MDL, network reconstruction and message passing

Code written for a directed study (Northeastern, Fall 2026) on the minimum description length
principle, network reconstruction from noisy data, and message-passing inference.

Live site (GitHub Pages): <https://thechesirecat.github.io/nets7976-mdl-reconstruction/>.
Short links: `/martin`, `/newman`, `/primer`, `/dolphins`, `/mdl`.

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
| `week-5/code/peixoto-viz/` | Interactive walkthrough of Peixoto (2025), *Network reconstruction via the minimum description length principle*: L1 vs. the quantized MDL prior on a kinetic Ising model of the karate club, with the greedy fit animated. `precompute.mjs` (Node) regenerates its Fig. 2 data. |

## Running

Python scripts need only NumPy:

```bash
python week-2/code/two_part_mdl.py both
python week-3/code/eb_vs_full_bayes.py sweep
```

The site is built with [Eleventy](https://www.11ty.dev/) (Node 22, see `.nvmrc`). The walkthroughs stay plain
HTML and JavaScript modules: Eleventy only reads each page's front matter and copies the figure code unchanged.

```bash
npm install
npm start          # builds and serves the site at http://localhost:8080/nets7976-mdl-reconstruction/
npm run build      # writes the site to _site/
```

Serving the repository root directly no longer works: the pages carry front matter that only the build strips.

Add `?test` to the primer's URL to log finite-difference checks of every gradient.

The dolphin counts in `week-4/code/young-viz/data/dolphins.json` come from the authors' repository,
[jg-you/noisy-networks-measurements](https://github.com/jg-you/noisy-networks-measurements) (MIT license).

## Publishing

A push to `main` runs `.github/workflows/pages.yml`, which builds the site and deploys `_site/` to GitHub Pages
(Settings → Pages → Source: GitHub Actions). Only the site is published: the Python scripts, this README and
the docs stay in the repository.

Each page's metadata (title, short name, week, order, lede, readings, prerequisites) is YAML front matter at
the top of its `index.html`, and the build generates `previews.json` and the short links in `404.html` from it.
The build fails on a duplicate short name, an unknown or looping prerequisite, or a broken internal link.
The full rules are in [`docs/redesign-spec.md`](docs/redesign-spec.md).

Every page loads `week-3/code/viz-common/site.js`, which adds the light/dark toggle (following the OS
setting until the reader picks one) and loads MathJax. Write math as TeX: `\( ... \)` inline and
`\[ ... \]` displayed.
