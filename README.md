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
