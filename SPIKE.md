# Spike: can Eleventy build this site without touching the figure modules?

Throwaway spike for the toolchain question in `research/02-toolchain.md` (branch `research/toolchain`), option B.
Run 2026-10-10 against `main` at `f19111e`, Eleventy **3.1.6** (npm `latest`), Node 23.3.0, npm 10.9.0, macOS.
Browser checks: Python Playwright 1.49.1, headless Chromium.

**Short answer: yes.** With passthrough copy and `htmlTemplateEngine: false`, all five Articles and the landing
page come out byte-identical, and they work under `/nets7976-mdl-reconstruction/` with Workers, `fetch`, MathJax,
the theme toggle and the 404 short links. No file under `week-*/code/**/js` and no Python script was changed.
Front matter, a layout, a Markdown Concept page with `\( \)` / `\[ \]` math, `previews.json`, backlinks and a
prerequisite check all work. They cost about 150 lines of our own code and one npm dependency (130 packages, 22 MB).

## What is in this branch

| File | Purpose |
|---|---|
| `eleventy.config.js` | the whole config (about 40 lines) |
| `_config/markdown-tex.js` | 20-line markdown-it rule that passes `\( \)` / `\[ \]` through untouched |
| `_config/pages.js` | `pages` collection plus the prerequisite check (unknown slug, duplicate, loop) |
| `_includes/parts.js`, `article.11ty.js`, `concept.11ty.js` | layouts as plain JS functions (no template language) |
| `previews.11ty.js` | writes `_site/previews.json` |
| `concepts/concepts.11tydata.js`, `concepts/markov-chain-monte-carlo/index.md` | the Concept page stub |
| `week-4/code/young-viz/index.html` | front matter added, nothing else |
| `week-4/code/bayes-primer-viz/index.html` | front matter plus layout: `<head>` and hero moved into the layout |
| `spike/serve.mjs` | tiny Pages-like server: prefix-mounted, `index.html`, 404 → `404.html` |
| `spike/check_pages.py` | headless check: console errors, failed requests, MathJax, Workers, short links |
| `spike/pages.yml` | the deploy workflow, **not enabled** (outside `.github/workflows/`) |
| `package.json`, `package-lock.json`, `.gitignore` | dependency and whitelist entries |

Reproduce: `npm ci && npx @11ty/eleventy && node spike/serve.mjs _site 8790`, then
`python spike/check_pages.py http://127.0.0.1:8790/nets7976-mdl-reconstruction/ "" concepts/markov-chain-monte-carlo/`.

## 1. Same-path build of the existing site

Config: `pathPrefix: "/nets7976-mdl-reconstruction/"`, `htmlTemplateEngine: false`, `markdownTemplateEngine: false`,
`templateFormats: ["html", "md", "11ty.js"]`, passthrough copy of `week-*/code/**/*.{js,css,json}`,
`week-*/code/**/data/**`, `404.html` and `.nojekyll`. Output goes to `_site/`.

**Bytes.** Before any front matter was added, the build printed `Copied 29 Wrote 6 files in 0.07 seconds`. Every file in
`_site` was compared with `git show f19111e:<same path>`: **33 files, 0 differ**. Files left out on purpose: the three
`.py` scripts, `precompute.mjs`, `README.md`, `CONTEXT.md` and `.gitignore`. Pages serves all of these publicly today.
Add a passthrough line if any of them should stay published.

**Browser.** The script served `_site` at `http://127.0.0.1:8790/nets7976-mdl-reconstruction/` and checked every
page. To get a baseline, the same check ran first against the untouched `f19111e` tree served the same way (port 8791).
The results match:

| Page | MathJax containers | `mjx-merror` | console errors | failed / ≥400 requests | Workers (messages back) | `#status` after settling |
|---|---|---|---|---|---|---|
| landing | 1 | 0 | 0 | 0 | none | |
| martin-viz | 147 | 0 | 0 | 0 | 2 × `martin-viz/js/worker.js` (13) | `ρ = 0.101 · c = 0.336` |
| newman-viz | 93 | 0 | 0 | 0 | none (page has none) | `977 true edges among 19,900 pairs` |
| bayes-primer-viz | 164 | 0 | 0 | 0 | 1 × `week-4/code/viz-common/worker.js` via `charts4.js` (5) | `100 pairs · 25 of them friends (hidden) · max count 18` |
| young-viz | 67 | 0 | 0 | 0 | 1 × `week-4/code/viz-common/worker.js` via `charts4.js` (3) | `HMC · 4 × 2000 iterations · 248 ms · R̂ 1.008` |
| peixoto-viz | 119 | 0 | 0 | 0 | 7 × `peixoto-viz/js/worker.js` pool (7) | `M = 1000 · 7 fits in parallel on 7 workers · 2394 ms` |

The check script wraps `window.Worker` to count messages that come back, so a non-zero count means the worker
actually loaded and ran, not only that it was constructed. Screenshots confirm the Peixoto page and the primer
drew their figures. All 5 short links (`/martin`, `/newman`, `/primer`, `/dolphins`, `/mdl`) returned the 404 page and
then redirected to the right Article. The theme toggle flipped `data-theme` light → dark with no errors on Peixoto,
the primer and the Concept page.

The Eleventy dev server (`npx @11ty/eleventy --serve --port=8792`) also serves at the prefix. All seven pages and
five short links passed through it too (it returned `404.html` with status 404 for `/primer`).

## 2. Front matter on `.html`, and a layout that writes the header

**Front matter only** (`young-viz`: `kind, slug, week, reading, title, lede, prerequisites`): Eleventy parses it into
data, strips it, and the output is **byte-identical to the original file**. The data shows up in `previews.json`.

**Front matter plus a layout** (`bayes-primer-viz`): `layout: article.11ty.js`. The article file now starts at
`<div class="shell">`. Its old hero `<header>` is replaced by one marker comment, `<!-- article-header -->`. The layout
builds `<head>` (title, `site.js`, stylesheets from front matter) and the header (eyebrow from `week` + `reading`, `<h1>`
from `title`, `.lede` from `lede`, and a "Before you start" list linking each prerequisite by its title). It splits the
body at the marker and joins the pieces. The diff against the original output has three parts: the lede is now on one
line, `week4.css` is linked as `../../../week-4/...` instead of `../viz-common/...` (same file), and the new
"Before you start" `<aside>` is added.

Why a marker: the hero sits inside `.shell > main > .content`, after the nav and the controls bar, so a layout that
only wraps the body cannot put it there. The other option is to move the shell markup into the layout.

**Nothing touches the body. Shown with a canary**, a line added for the test and then removed:
`<p id="canary">\(\{{ title }}\) {{ title }} {% if x %}x{% endif %}</p>` in young-viz and `{{ title }} {% raw %}` in
the primer.

- With this config, both canaries came out **verbatim**.
- With the default `htmlTemplateEngine` (Liquid), the primer build failed with `raw "{% raw %}</p>\n" not closed ... (via TokenizationError)`.
  With that line removed, the young canary rendered as `\(\Who swims with whom, and how sure are we?\) Who swims ...`.
  Liquid ate TeX braces. So `htmlTemplateEngine: false` is required, not optional.

The minimal config for this is the `htmlTemplateEngine: false` line plus a layout. The layouts are `.11ty.js`
(plain JS functions), so no template language runs at all. A Nunjucks or Liquid layout with `{{ content | safe }}`
would also leave the body alone, because the content is inserted as a string and not re-parsed. That was not tested.

**YAML gotcha:** write a `lede` that holds TeX as a block scalar (`>-`) or plain scalar. Inside a double-quoted YAML
string, `\(` is an invalid escape.

## 3. Markdown Concept page with client-side MathJax

`concepts/markov-chain-monte-carlo/index.md` has front matter (`title`, `lede`, `prerequisites: []`). Its body has
`\(\hat R\)`, `\(x_{t+1}\)`, `\(x_t\)`, display `\[ \mathrm{ESS} = N/\tau \]`, `\(a_{i}*b_{j}\)`, and a code span
holding `\(no math\)`. `concepts/concepts.11tydata.js` sets `kind: concept`, the layout, and `slug` = folder name.

Three setups, same input:

- **Plain markdown-it (Eleventy default):** broken. It produces `(\hat R)`, `[ \mathrm{ESS} = N/\tau ]`, and `\(a*b*c\)` → `(a<em>b</em>c)`.
- **markdown-it-texmath 1.0.0, `delimiters: "brackets"`, with a fake engine that re-emits the TeX:** works, but wraps every
  formula in non-standard `<eq>…</eq>` and display math in `<section><eqn>…</eqn></section>`. It is also one more
  dependency, and its API expects a renderer (KaTeX). Not browser-tested.
- **Custom 20-line inline rule (`_config/markdown-tex.js`, chosen):** runs before markdown-it's `escape`. It copies
  `\(…\)` / `\[…\]` through and only HTML-escapes them. The output text equals the source. `\(x < y & z\)` becomes
  `\(x &lt; y &amp; z\)`, which MathJax reads back as `<` and `&`. A code span stays a code span. An unclosed `\(`
  falls back to normal escaping.

In the browser, the Concept page gave **7 `mjx-container`, 0 `mjx-merror`, 0 console errors**. That count is exactly
the 7 formulas, and the code-span one was correctly left alone. Limits of the rule: display math cannot contain a
blank line (it ends the paragraph), and display math sits inside a `<p>`, which MathJax handles fine.

## 4. `previews.json`, backlinks, and the build-failing check

- `previews.11ty.js` writes `_site/previews.json`, served as `200 application/json`. It has one entry per page with a
  `slug` (`url` with the path prefix, `kind`, `slug`, `title`, `lede`, `prerequisites`): the Concept page, the primer
  and young-viz.
- The Concept layout lists **"Used in the course"** from `collections.pages`: both the primer and young-viz, whose
  `prerequisites` include `markov-chain-monte-carlo`, with relative links.
- `_config/pages.js` builds the `pages` collection and throws on a duplicate slug, an unknown prerequisite, or a
  loop. A throw there fails the build:
  - Loop (temporarily `prerequisites: [primer]` on the Concept page):
    `[11ty] Prerequisite loop: markov-chain-monte-carlo -> primer -> markov-chain-monte-carlo`, **exit 1**.
  - Unknown slug (temporarily `[bayes-theorem]`):
    `[11ty] Unknown prerequisite "bayes-theorem" in ./concepts/markov-chain-monte-carlo/index.md. Known slugs: dolphins, primer, markov-chain-monte-carlo`, **exit 1**.
  - Restored to `[]`: `Copied 29 Wrote 8 files`, exit 0.

## 5. Build time, footprint, deploy

- **Build:** Eleventy reports 0.12–0.16 s for the full site. Wall clock for `npx @11ty/eleventy` is about 1.0–1.2 s
  (three clean builds, most of it Node start-up).
- **Install:** `npm ci` from a warm cache took 0.99 s. One direct dev dependency (`@11ty/eleventy@3.1.6`, pinned),
  **130 packages** in the lockfile, **22 MB** of `node_modules`.
- **`npm audit`:** 9 advisories (4 moderate, 5 high). The root causes are `braces` (via `chokidar`, used by the dev
  server's watcher), `sprintf-js`, and `js-yaml`/`argparse` (via `gray-matter`). `npm audit fix --force` proposes a
  downgrade to Eleventy 0.6.0, which is nonsense. All of these are build-time only; nothing ships to the browser.
- **Workflow:** `spike/pages.yml`. On push to `main` it runs `npm ci` → `npx @11ty/eleventy` → `configure-pages@v6`
  → `upload-pages-artifact@v5` (`path: _site`) → `deploy-pages@v5`, with `pages: write` and `id-token: write`.
  These are the latest release tags as of today. To enable it, move the file to `.github/workflows/` and switch
  Settings → Pages → Source to "GitHub Actions". The YAML parses, but **the workflow has never run**.
  `upload-pages-artifact` drops dotfiles by default (`--exclude=.[^/]*`), so `.nojekyll` will not ship. That is
  harmless, because Actions deploys do not run Jekyll.

## 6. What broke or had to change

- **Worker URLs: nothing.** All are `new URL(..., import.meta.url)` and resolve the same, because the output tree is
  the source tree: `charts4.js`'s `samplerClient(workerUrl)`, the Peixoto pool, Martin's two workers, and the two
  `fetch`ed JSON files. No JS file was touched (`git diff f19111e -- 'week-*/code/**/js'` is empty).
- **`.gitignore` defeats Eleventy.** Eleventy honours `.gitignore` by default but drops `!` lines (`src/EleventyFiles.js`, `normalizeIgnoreContent`:
  "does not currently support negative patterns", issue 11ty/eleventy#693) and keeps `/*`. With the default, the
  build said `Wrote 0 files`: every page was ignored, and passthrough still copied. Fix:
  `setUseGitIgnore(false)` plus explicit ignores. The whitelist also needed new entries for the build files
  (done in this branch).
- **Untracked folders in a real checkout.** The working copy on `main` has readings and slides next to `code/`.
  The ignores `week-*/!(code)/**` and `week-*/*.*` keep any stray `.md`/`.html` there from being built. This could
  not be checked against the real untracked files from the worktree.
- **Don't add the HTML Base plugin.** It re-serializes every page through posthtml. All 6 pages then differ:
  `/>` → `>`, `checked` → `checked=""`. It is not needed, because every link is relative and `404.html` is
  passthrough, so its hard-coded prefix is untouched. `pathPrefix` alone only affects the `url` filter, which
  `previews.11ty.js` uses.
- **"Serve the repo root" no longer works for converted pages.** Served raw, young-viz shows its YAML at the top
  of the page. The primer has no `<head>`: no title, no CSS, no MathJax (0 containers, 165 raw `\(`). Once front
  matter or layouts are adopted, the local workflow is `npx @11ty/eleventy --serve`, and the README's Publishing
  section must change.
- **Pre-existing source bug the spike turned up (not fixed):** five attributes are written `class=\"…\"` with
  backslash-escaped quotes, so the class is literally `\"sub\"` and its style never applies. They are in
  `week-5/code/peixoto-viz/index.html` lines 222, 228 and 351 (`.sub`), `week-4/code/young-viz/index.html` line 156
  (`.dist`) and `week-3/code/newman-viz/index.html` line 147 (`.m`), line numbers as at `f19111e`.
- **Not verified:** the real Pages deploy (the workflow never ran), behaviour on Windows, and whether the
  `markdown-it-texmath` output typesets in the browser (only its HTML was inspected). Hover-preview client JS
  was not in scope and was not written.
