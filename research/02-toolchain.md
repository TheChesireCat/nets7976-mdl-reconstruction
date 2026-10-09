# Toolchain: stay no-build, or move to a static-site generator?

Research for [#2](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/2), part of the map
[#1](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/1). Terms (Article, Concept page,
External reference, Hover preview, Reader) are as in [`CONTEXT.md`](../CONTEXT.md).
Sources checked 2026-10-09. The decision is the human's; the last section is a recommendation, nothing more.

## What has to survive (from the repo, at `3b3737d`)

These are the constraints any option has to meet. Each is from the code, not from memory.

| Constraint | Where it shows up |
|---|---|
| **Articles are hand-written HTML whose figures bind to element ids.** Each article has one module, `js/app.js`, that finds its plots and controls with `document.getElementById` (e.g. `p-grid`, `c-a`, `t-mc`; the primer has 67 `id=`s). Figure containers and sliders sit in the prose. | `week-4/code/bayes-primer-viz/index.html`, `js/app.js` line 8 |
| **Module Workers via `new URL(..., import.meta.url)`.** | `week-3/code/martin-viz/js/app.js:49`, `week-4/code/*/js/app.js` (via `samplerClient` in `week-4/code/viz-common/charts4.js:92`), `week-5/code/peixoto-viz/js/app.js:24` (a pool of workers) |
| **Fetched JSON, resolved off `import.meta.url`.** | `week-4/code/young-viz/js/app.js:462` (`../data/dolphins.json`), `week-5/code/peixoto-viz/js/app.js:570` (`../data/compare.json`) |
| **Cross-folder relative imports** across weeks, up to four levels. | `week-5/code/peixoto-viz/js/app.js:3` imports `../../../../week-3/code/viz-common/charts.js`; `week-4/code/viz-common/worker.js:12` imports from `week-3` |
| **The repo layout is the URL layout.** Pages, CSS and modules are linked by relative paths; short links (`/primer`, `/mdl`, ...) are a JS redirect table in `404.html`, which hard-codes the `/nets7976-mdl-reconstruction/` prefix. | `404.html`, `README.md` § Publishing |
| **MathJax 3 and the theme come from one classic script.** `week-3/code/viz-common/site.js` stamps `data-theme` on `<html>` before first paint, adds the toggle, configures MathJax (`\(..\)` / `\[..\]` only, no `$`, macros `\Poisson`, `\Beta`, ..., `ignoreHtmlClass: "no-math"`) and loads `mathjax@3.2.2/es5/tex-chtml.js` from jsDelivr. Charts re-read the palette on a `themechange` event. | `site.js` |
| **Deploy today:** Pages "Deploy from a branch", `main` / root. The Pages API reports `build_type: "legacy"`, `source: {branch: main, path: /}`. `.nojekyll` turns Jekyll off. | `gh api repos/.../pages` |
| **One Node script already exists**, as a precedent for a build-time helper: `week-5/code/peixoto-viz/precompute.mjs` writes `data/compare.json`, and its output is committed. | `README.md` contents table |

Two consequences follow before looking at any tool:

1. **Markdown cannot replace the article bodies wholesale.** The figures need their containers, ids and inline
   controls, so an Article written in Markdown would still be mostly raw HTML blocks. Markdown pays off for
   Concept pages (mostly prose and math) and for front matter (title, summary, prerequisites), not for Articles.
2. **TeX in Markdown is not free.** CommonMark lets any ASCII punctuation be backslash-escaped, so `\(` renders
   as a literal `(` and `\[` as `[` ([CommonMark 0.31.2, Backslash escapes](https://spec.commonmark.org/0.31.2/#backslash-escapes)).
   The site's chosen delimiters are exactly the ones Markdown eats. Every Markdown path needs either a math
   plugin that claims `\(..\)` before escaping runs, or a switch to `$..$`, which `site.js` deliberately does not
   enable ("No $ delimiters, so prose is safe").

Nothing in any tool below gives Gwern-style **Hover previews** of our own pages out of the box. In every option the
generator (or script) produces an index of pages (title, summary, links), and a small piece of client JS that we
write fetches it and shows the card. What a generator buys is the index and backlinks computed for free from
front matter and templates, plus shared layouts.

## The options

### A. Stay no-build, plus a small Node script that builds a page index

What it is: keep every page as hand-written HTML. Add a script (Node, like `precompute.mjs`) that reads the pages,
pulls out each one's title, a summary (say a `<meta name="description">` or the lede) and its outbound links,
and writes one `pages.json` with backlinks inverted from the links. Client JS reads it for Hover previews,
backlink lists and the table-of-contents landing page.

- **Figure modules:** untouched. Nothing moves.
- **Markdown + TeX:** none. Concept pages are written as HTML, like Articles. TeX stays `\(..\)` with `site.js`.
- **Backlinks / preview index:** the script does it. Node has no built-in HTML parser, so it is either a regex
  over pages whose markup we control, or one dependency (a parser), which brings in `package.json`.
- **Deploy:** can stay "Deploy from a branch" if `pages.json` is committed (the `precompute.mjs` pattern). Forgetting
  to rerun it leaves a stale index, which a CI check (`node build-index.mjs && git diff --exit-code`) can catch.
  Or run it in an Actions workflow and switch Pages to "GitHub Actions" (see below).
- **New author learns:** copy a page, keep its `<head>` and the `site.js` line, add a description, run one script.
- **Cost:** low now. It grows with each feature: shared headers and footers are copy-pasted (or injected by JS at
  runtime), citations need their own BibTeX-to-JSON step, and the script slowly becomes a homemade generator.

### B. Eleventy (11ty)

Current stable is v3.1.6 (2026-06-02; v4 is in alpha), requires Node >= 18 (`npm view @11ty/eleventy@3.1.6 engines`).

- **Figure modules:** copied as-is with passthrough copy. `addPassthroughCopy` keeps the directory structure and
  supports globs (e.g. `"week-*/code/**/*.{js,json,css}"`); files are copied without processing
  ([Passthrough File Copy](https://www.11ty.dev/docs/copy/)). Eleventy does not bundle JS, so `import.meta.url`,
  Workers and cross-week imports keep working as long as the output keeps the same tree, which is the default:
  `week-4/code/bayes-primer-viz/index.html` builds to the same path.
- **Existing Article HTML:** can stay HTML and gain front matter and a layout. One hazard: `.html` files "are
  pre-processed by default as Liquid templates" ([HTML](https://www.11ty.dev/docs/languages/html/)). The current
  articles contain no `{{` or `{%` (checked), but TeX can, so set the HTML template engine to `false` or treat
  articles as passthrough.
- **Markdown + TeX:** markdown-it, with `html: true` set by Eleventy so raw HTML passes through; plugins are added
  with `amendLibrary`. Markdown files are also Liquid-preprocessed by default
  ([Markdown](https://www.11ty.dev/docs/languages/markdown/)), the same TeX hazard. `\(..\)` needs a markdown-it math
  plugin (not built in).
- **Backlinks / preview index:** collections. Everything is in `collections.all`, and each item carries its
  rendered `content` ([Collections](https://www.11ty.dev/docs/collections/)), so a template can scan links and
  emit backlinks and a `pages.json`. We write that template (a few dozen lines); no first-party backlink feature.
- **Deploy:** the docs' route is an Actions workflow (from `eleventy-base-blog`) with Pages set to "GitHub Actions",
  and `--pathprefix=/nets7976-mdl-reconstruction/` ([Deployment](https://www.11ty.dev/docs/deployment/)). The bundled
  HTML Base plugin rewrites only root-relative URLs (`/x`) and leaves relative ones alone
  ([HTML Base](https://www.11ty.dev/docs/plugins/html-base/)), so our relative links are unaffected. `404.html` and
  `.nojekyll` go through passthrough.
- **MathJax / light-dark:** unchanged; `site.js` is a passthrough file and the layout includes it.
- **New author learns:** front matter, one layout name, where the Markdown goes; `npx @11ty/eleventy --serve`
  replaces `python -m http.server`.
- **Cost:** a `package.json`, a config file and a workflow (each to add to the `.gitignore` whitelist), and a
  `_site/` output folder (already ignored by the whitelist's `/*`). The site no longer runs by serving the repo
  root; you serve the build.

### C. Astro

Current is astro@7.3.8 (2026-10-08), requires Node >= 22.12 (`npm view astro@7.3.8 engines`).

- **Figure modules:** two routes, and they pull in opposite directions.
  - Put them in `src/` and Astro (through Vite) processes and bundles them: scripts with imports "will be bundled
    together", and become `type="module"` ([Scripts](https://docs.astro.build/en/guides/client-side-scripts/)).
    Vite rewrites `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })` only when the
    `new URL()` is written directly inside `new Worker()` with literal arguments
    ([Vite, Web Workers](https://vite.dev/guide/features.html#web-workers)). Ours are not all written that way:
    `charts4.js:92` receives the URL as a parameter, and Peixoto builds `workerUrl` once for a pool. Those would
    need rewriting or testing, so "unchanged" fails on this route.
  - Put them in `public/`, which is "copied into the build folder untouched" and "will not be bundled or
    optimized" ([Project structure](https://docs.astro.build/en/basics/project-structure/)), and reference them with
    `<script is:inline type="module" src=...>`, which external and `public/` scripts require
    ([Scripts](https://docs.astro.build/en/guides/client-side-scripts/)). Then the modules are unchanged, but the
    code lives apart from its Article, and most of what Astro adds goes unused.
- **Existing Article HTML:** `.html` files in `src/pages/` are allowed, but "some key Astro features are not
  supported" in them ([Pages](https://docs.astro.build/en/basics/astro-pages/)); the real route is converting each
  Article to `.astro` or `.mdx`.
- **Markdown + TeX:** math is not built in; add `remark-math` plus a rehype renderer, and `@astrojs/mdx` for
  components in Markdown ([Markdown](https://docs.astro.build/en/guides/markdown-content/)). remark-math uses `$`.
- **Backlinks / preview index:** content collections with schemas give typed front matter
  ([Markdown](https://docs.astro.build/en/guides/markdown-content/)); backlinks are still ours to compute.
- **Deploy:** set `site` and `base: '/nets7976-mdl-reconstruction'`, use the official `withastro/action`, and set
  Pages to "GitHub Actions" ([Deploy to GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)).
- **MathJax / light-dark:** keep `site.js` via `is:inline`; Astro has no theme system of its own to collide with.
- **New author learns:** `.astro` component syntax or MDX, `is:inline`, `src/` vs. `public/`, the content
  collection schema. The most to learn of the five.
- **Cost:** highest migration. A Node 22 toolchain and a bundler sitting between the author and the figures.

### D. Quarto

Current is v1.10.19 (2026-10-06, GitHub releases).

- **Figure modules:** Quarto "will automatically detect any files that you reference within your site and copy
  them", and `resources:` globs cover anything not detected
  ([Site resources](https://quarto.org/docs/websites/website-tools.html)). Detection sees files the page links to,
  not files that a module imports or a Worker loads, so the module graph (and the cross-week `viz-common/`) needs
  explicit `resources:` entries. Unverified until tried; plan on it. Raw HTML for figure containers goes in
  ```` ```{=html} ```` blocks ([Pandoc `raw_attribute`](https://pandoc.org/MANUAL.html)).
- **Markdown + TeX:** the strongest here. Pandoc Markdown with MathJax by default
  ([HTML basics](https://quarto.org/docs/output-formats/html-basics.html)). But `\(..\)` is the non-default
  extension `tex_math_single_backslash` ("a drawback ... it precludes escaping `(` and `[`"), listed under
  "Non-default extensions" in the [Pandoc manual](https://pandoc.org/MANUAL.html#extension-tex_math_single_backslash);
  `$..$` is on by default. So: either `from: markdown+tex_math_single_backslash` or move to `$`.
- **Citations and previews:** built in for what's inside a document. `citations-hover`, `footnotes-hover` and
  `crossrefs-hover` are on by default ([HTML options](https://quarto.org/docs/reference/formats/html.html)), which
  overlaps the map's open "Citations and references" question. Hover previews of other pages are not among them.
  Listings build index pages from front matter, with RSS but no JSON
  ([Listings](https://quarto.org/docs/websites/website-listings.html)); a `post-render` script
  ([Project scripts](https://quarto.org/docs/projects/scripts.html), TypeScript via the bundled Deno, or Python)
  would write `pages.json` and backlinks.
- **Deploy:** three routes: render to `docs/` and publish that folder from the branch (keeps branch deploy, but the
  rendered HTML is committed); `quarto publish gh-pages` to a `gh-pages` branch; or a GitHub Action
  ([GitHub Pages](https://quarto.org/docs/publishing/github-pages.html)). `404.html` and `.nojekyll` are copied
  automatically ([Site resources](https://quarto.org/docs/websites/website-tools.html)).
- **MathJax / light-dark: the collisions.** Quarto loads its own MathJax (`tex-chtml-full.js`), so `site.js`'s
  copy and macros must be moved into Quarto's config or one of them turned off. Its dark mode is Bootstrap 5 SCSS
  themes with its own toggle and `.quarto-light` / `.quarto-dark` on `<body>`
  ([HTML themes](https://quarto.org/docs/output-formats/html-themes.html)), while our charts read `data-theme` on
  `<html>` and listen for `themechange`. `minimal: true` strips Bootstrap and the built-ins
  ([HTML basics](https://quarto.org/docs/output-formats/html-basics.html)), but then the hovers go too.
- **New author learns:** Quarto CLI install, `_quarto.yml`, Pandoc Markdown, `{=html}` blocks.
- **Cost:** a non-npm binary for every author and in CI, and two design systems (Bootstrap's and ours) to
  reconcile. Pays off mainly if citations and Concept pages are written as prose-first Markdown.

### E. The Distill template

- **Status:** the last commit to [`distillpub/template`](https://github.com/distillpub/template) is 2020-05-18
  (v2.8.0, 2020-04-28); not archived, 62 open issues. Distill the journal went on hiatus on 2021-07-02, saying the
  template stays open source for others to "run with" ([Distill hiatus](https://distill.pub/2021/distill-hiatus/)).
  The repo calls itself "research code".
- **What it is:** not a generator. One script tag adds custom elements (`d-article`, `d-figure`, `d-cite`,
  `d-footnote`, `d-hover-box`, `d-toc`, `d-bibliography`, ...; `src/components/` in the repo) and layout classes
  `.l-body`, `.l-page`, `.l-screen`, with `-outset` / side variants ([Guide](https://distill.pub/guide/)).
- **Figure modules:** untouched; it is still plain HTML.
- **Math:** `d-math` renders with KaTeX, loaded from `distill.pub/third-party/katex/` (`src/components/d-math.js`),
  which is a second math engine next to MathJax and a runtime dependency on the distill.pub domain.
- **Light/dark:** none; no `prefers-color-scheme` anywhere in the template's `src/` (checked).
- **Backlinks / index / deploy:** none of its business; deploy as today.
- **Cost:** adopting an unmaintained runtime for its looks. Its value is as the reference for the anatomy (one reading
  column, outset figures, sidenotes, hover citations), which belongs to the anatomy prototype, not the toolchain.

## GitHub Pages: branch vs. Actions

GitHub's own advice: publish from a branch "if you do not need any control over the build process", and use an
Actions workflow if you want "a build process other than Jekyll" or "do not want a dedicated branch to hold your
compiled static files" ([Publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)).
A custom workflow uses `actions/upload-pages-artifact` and `actions/deploy-pages`, needs `pages: write` and
`id-token: write`, and the artifact is a tar with no symlinks
([Custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)).
Switching is one setting (Settings, Pages, Source) plus a workflow file. Options A and E can stay on the branch;
B and C go to Actions; D can do either. With Actions, the deployed site is no longer the repo root, so the
README's "serve the repo root and open the page" workflow changes to "run the dev server".

## Side by side

| | A. No-build + script | B. Eleventy | C. Astro | D. Quarto | E. Distill |
|---|---|---|---|---|---|
| Figure modules unchanged | yes | yes (passthrough) | only from `public/` with `is:inline` | likely, with `resources:` globs | yes |
| Article HTML kept as is | yes | yes, plus front matter | convert to `.astro`/`.mdx` | convert to `.qmd` + `{=html}` | rewrite into `d-*` tags |
| Markdown for Concept pages | no | yes, math plugin needed | yes, remark-math (`$`) | yes, best; `\(` needs an extension | no |
| Backlinks / preview index | our script | our template over collections | our code over collections | `post-render` script | no |
| Built-in hovers | no | no | no | citations, footnotes, cross-refs | citations, footnotes |
| MathJax via `site.js` | as is | as is | as is | conflicts; reconcile | KaTeX alongside |
| Our light/dark | as is | as is | as is | conflicts with Bootstrap themes | no dark mode |
| Pages deploy | branch | Actions | Actions | either | branch |
| Toolchain added | Node (have it) | npm, Node >= 18 | npm, Node >= 22.12 | Quarto CLI | none (CDN script) |
| New author learns | least | a little | most | moderate | moderate |

## Recommendation (for the human to accept or reject)

**Recommended: Eleventy (B), used conservatively.** Articles stay the HTML files they are, with front matter
added and Liquid turned off for HTML; all JS, JSON and CSS go through passthrough so the figure tree is byte-for-byte
the same; Concept pages are written in Markdown; one template emits backlinks and the `pages.json` that Hover
previews read; deploy moves to an Actions workflow. Reasons: it is the only generator whose default is "HTML in,
same-path HTML out, nothing bundled", so the figure constraints hold by construction; it leaves `site.js`, MathJax
and the theme alone; and it gives Concept pages Markdown and a shared layout, which is where the redesign's new
pages come from.

**Credible alternative: A (no-build + script)**, if the human values "serve the repo root, no toolchain" over
Markdown, or if there will be only a handful of Concept pages. It is the cheapest start and does not close the door:
moving A's hand-written pages into Eleventy later is mostly adding front matter.

**Not recommended:** Astro (its main strength, bundling, is what the figures must avoid), Quarto (strong authoring,
but its MathJax and Bootstrap dark mode collide with ours, and it adds a non-npm binary), and the Distill template as a
toolchain (unmaintained since 2020, KaTeX, no dark mode; borrow its anatomy instead).

**Open before deciding:**
- How many Concept pages the concept-page model expects, which decides whether Markdown is worth a toolchain.
- Whether citations should be built (BibTeX to JSON) or taken from a tool; only Quarto ships that.
- A spike to confirm: build one Article through Eleventy with passthrough and load it at the project path (Workers,
  `fetch`, short links, theme toggle). Quarto's `resources:` handling is the other claim here worth testing if D
  stays in the running.
