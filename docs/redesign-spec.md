# Redesign spec: the course site as a textbook

This spec is the hand-off from the map [Make the course site read like a textbook](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/1). It gathers every decision on that map into one document that a builder can follow. The first build is [Rebuild the primer as the pilot article](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/13).

- **Where decisions live.** Each decision lives in its ticket, and this spec links to it. If a detail here is ambiguous, the ticket's resolution comment is the primary source. The prototypes are the visual reference.
- **Added by this spec** marks a rule that no single ticket decided. Each one either follows from combining decisions, or comes from one of the three areas the map left to this spec (charts, accessibility, the authoring template). All of them were reviewed and accepted by @TheChesireCat on 2026-10-10.
- **Vocabulary** is [`CONTEXT.md`](../CONTEXT.md): Article, Concept page, Stub, Lede, Backlink, External reference, Prerequisite, Route, Digression, Sidenote, Reading, Locator, Citation, Contents page, Reading order, Hover preview, Reader.

## 1. Who it's for

**The Reader** is a first-year graduate student from another field, with calculus, linear algebra and introductory probability.
- Anything below that level is linked, not explained.
- Anything above it is either explained, linked to a concept page, or put in a digression (§2, §3).

## 2. Article anatomy

Decided in [Prototype the article anatomy on one primer section](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/6). Reference: branch [`prototype/article-anatomy`](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/tree/prototype/article-anatomy), `prototype-anatomy.html?variant=A`. The decision builds on the Distill research in [What is Distill's article anatomy…?](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/4): copy Distill's conventions into our own CSS, not its template, which is frozen since 2020 and breaks dark mode and keyboard access.

**Columns**
- A 680px text column, a 40px gap, then a 220px notes margin on the right.
- Section numbers sit in the left margin beside each `h2`.
- Below about 1060px the margin folds away. Notes then fall inline under their paragraph, with a left rule.

**Type**
- The body text is sans (the site's `system-ui` stack). Math is MathJax.
- The sans/serif mismatch flagged by the red-team is accepted.

**Figures**
- They break out across the text and the margin, on the page background, with no card around them.
- Two charts sit side by side and stack on phones.
- Captions are numbered automatically ("Figure n.") and start with a bold lead phrase, then grey explanation.
- A caption tells the Reader what to do: "Raise prior a to 40, then slide the data share to 100%."

**Controls**
- A slim row along the top edge of the figure they drive. There is no page-level sticky bar.
- A figure with many controls, such as the §4 samplers, may use a side panel holding its caption, controls and readouts.
- Controls shared by several sections, like the primer's toy-count strip, are repeated above each figure that uses them. Every copy is bound to one shared state.

**Stat tiles** are gone. Their live numbers go into the caption: "Now: 215 births, posterior mean 0.51 …".

**Notes and asides**
- **Sidenotes:** short, numbered, in the margin. For a citation or a one-line aside.
- **Digressions:** fold-out passages titled by the question they answer ("Why does a Beta prior give a Beta posterior?"), built on `<details>`/`<summary>`. A digression that holds figures draws them when it is first opened, because charts sized while hidden draw at zero width.
- **Not used:** footnotes at the end of a section.
- **Takeaway boxes** become a paragraph with a bold lead and a left rule, with no tinted background.

**Locators** are pointers into the article's reading. A section's locators sit in an unnumbered margin note level with its heading, and fall under the heading on narrow screens. See §7.

## 3. Opening an article, and the route

Decided in [How does an article lead a reader in…?](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/10) and [Prototype what replaces the flowchart map and transition cards](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/8). Reference: branch [`prototype/route-diagrams`](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/tree/prototype/route-diagrams), `prototype-route.html?variant=A`.

The page opens with these parts, in order:

1. **Title.**
2. **Lede.** Two or three sentences: what the page does, ending with what the Reader can do afterwards. There is no list of learning goals.
3. **Byline row** with three parts:
   - **Week.**
   - **Reading:** links to the reading's entry in References.
   - **Before you start:** only what the article assumes beyond the Reader's background. Each item is a link plus where it's used ("the Poisson distribution (§3 on)").
     - The Reader's background is stated once, on the contents page.
     - Links back to earlier weeks are cross-references, not prerequisites.
4. **At most one shortcut line**, only where the article opens with basics: "Comfortable with Bayes' rule and Monte Carlo? Start at §3, the toy problem."
5. **The route.** A `<nav>` titled "The route through this page", with a one-sentence intro. It replaces both the SVG flowchart map and the contents list.
   - **Rows:** one row per section. Each row has the section number, a plain-language verb phrase in bold, typeset math for input → output, and a tag. Each row links to its section.
   - **Groups:** forward and backward steps form two groups (in the primer: "The model and its posterior" and "When you can't draw from \(p(\theta \mid x)\) directly"). Numbering continues across groups.
   - **Tags:** a coloured dot plus words: *exact*, *error ∝ 1/√M*, *exact in the limit*, *the model*, *a constraint*, *a check*. The words carry the meaning, and the colour only backs it up.

**The strip** goes under each section heading and replaces the transition card. It's one line:
- the previous step, then the **current step** (outlined, with its math and its tag), then the next step;
- on phones, the previous step is dropped.

> **Added by this spec: the route is data.** Each article's route is written once, in its front matter (§11), and the build renders three things from it:
> - the route `<nav>`;
> - each section's strip;
> - the article's section list on the contents page (§8).
>
> The contents page needs the routes as data anyway. This also keeps the strips from drifting out of step with the route.

**What moves out to concept pages.**
- **The rule:** an article explains a concept only as far as its own argument needs, in its paper's notation. The general treatment belongs on the concept page.
- **Until that page has a body,** general material stays in the article as a digression, flagged for the page. It becomes a link once the page is written.
- **Signposting:**
  - Material above the Reader's background that the argument needs stays in the text, linked at first use.
  - Depth the argument doesn't need becomes a digression.
  - There are no difficulty markers.

**The primer's script** (which digressions, sidenotes and links go where) is in the [lead-in resolution](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/10).

## 4. Concept pages

Decided in [What does a concept page contain, and which concepts get one?](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/5)

**Sections, in order:**
1. **Lede.** It is also the text of the hover preview.
2. **Prerequisites** line, generated.
3. **Intuition** (optional), with at most one small figure.
4. **Formal statement.**
5. **Worked example.** It reuses the primer's friends-and-strangers toy where it fits.
6. **Used in the course:** backlinks, generated, never hand-written.
7. **Going further:** external references.

**Length and notation**
- Two or three screens. Anything longer is two concepts.
- Concept pages use textbook notation, stated in a notation line at the top.

**One page per method family**, with an anchored section per member: Metropolis, HMC and Gibbs are sections of the MCMC page. Links and previews can target a section.

**URLs and titles**
- The URL is `/concepts/<slug>/`. The slug is the full name, lowercase and hyphenated, never an abbreviation.
- The title is "Full name (ABBR)".
- The abbreviation becomes a short link (`/mcmc`, §11).

**What earns a page of our own:** an idea used in two or more articles. So does an idea that is one article's core method, when Wikipedia's treatment is too far from how the course uses it. Everything else is an external reference.

**The first list:**
- minimum-description-length (with a Code length section)
- stochastic-block-model
- expectation-maximization
- belief-propagation
- markov-chain-monte-carlo
- posterior-predictive-check
- noisy-network-measurement
- marginalization
- label-switching

These go to Wikipedia instead: Bayes' rule; prior, likelihood and posterior; the Poisson and Beta distributions; conjugate priors; the Ising model; LASSO; false discovery rate; KL divergence; Monte Carlo standard error.

**Stubs** have a lede, prerequisites, generated backlinks and a "to be written" note. Writing full concept-page text is out of scope for this effort.

## 5. Links and hover previews

Linking was decided in [the lead-in ticket](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/10) and the card in [Prototype the hover preview card](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/7). Reference: branch [`prototype/hover-preview`](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/tree/prototype/hover-preview), `prototype-hover.html?variant=A`. The behaviour was researched in [How do Gwern's popups and Wikipedia's page previews work…?](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/3). We copy Wikipedia's behaviour, not its GPL code.

**Linking rules**
- **Concept pages and handed-off terms** are linked at their first use in each section.
- **Prerequisites** are linked in "Before you start" and at their first use in the article only.
- **Never** link in headings or inside equations. Link the word in the prose next to the equation.
- **Sidenotes and captions** follow the same rules.
- **Appearance:** concept-page links take the accent colour (`--model`); external links get a small ↗.

> **Added by this spec: links are written by kind and filled in at build time,** like citations (§7). The author writes `<a data-pv="concept:marginalization">summed out</a>`, `<a data-pv="concept:markov-chain-monte-carlo#hmc">HMC</a>`, `<a data-pv="wiki:Mixture model">mixture model</a>` or `<a data-pv="article:dolphins">the dolphin article</a>`. The build:
> - sets `href` (with the path prefix) and the link's class;
> - checks that the target exists: an unknown slug, short name or uncached Wikipedia title fails the build.
>
> This keeps article HTML free of `../../../` paths and of any template language. It also uses the attribute the hover prototype already reads.

**The card**
- **Size and placement:** 340px wide, under the link. It flips above when the link is in the lower half of the window, and flips left past the middle. On a link that wraps across lines, it anchors to the line under the pointer.
- **Timing:** it starts fetching after 150ms over the link and appears at 500ms, padded so cached and uncached data feel the same. It closes 300ms after the pointer leaves. Moving into the card keeps it open.
- **Nesting:** a preview link inside a card opens a second card beside it, to the right if there's room, else to the left. Leaving the stack closes the cards beyond the one under the pointer.
- **Keyboard:** focus opens the card. Escape closes the top card and returns focus to its link. Blur closes it unless focus moved into the card.
- **Touch and screens under 600px:** the first tap opens the card as a bottom sheet over a dimmed page, with an "Open the concept page / article / Read on Wikipedia" button. A nested card replaces the sheet.
- **Reduced motion:** no fade.

**Each card looks like the page it previews:**

| Card | Shows |
|---|---|
| Concept page | A small "Concept page" label (", stub" when it is one), the title, the lede, the key equation if there is one, and "Needs: …" with the prerequisites as preview links. It doesn't show "Used in the course". |
| Article | "Week n article", the title in the article's title style, the lede, the reading. |
| Wikipedia | A serif title over a hairline, the short description, the thumbnail floated right, the lede, and "W From Wikipedia, CC BY-SA 4.0" ("…, adapted" when the lede was rewritten by hand). Math is TeX typeset by MathJax, never images. |
| Citation | The reference (authors, title, venue, year, DOI) and our one-line note on why we cite it. No abstract. |

**Where the data comes from:** `previews.json` for our pages, `data/external.json` for Wikipedia and `data/references.json` for citations. All three are built or cached at build time, so the Reader's browser never calls Wikipedia (§11).

## 6. Phone layout (below 720px)

Decided in [Prototype the phone layout for articles](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/9). Reference: branch [`prototype/phone-layout`](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/tree/prototype/phone-layout), `prototype-phone.html`, and its CSS and JS.

- **Figure controls** stay inline at the top of the figure, as a 2-column grid of full-width sliders with 36px buttons. They aren't sticky and don't go in a sheet.
- **Comparison tables** become cards: the row name, then each cell under its column label.
- **Annotated equations** (those with notes beside them) get a narrow form written by hand: one row per line, with the note underneath. This is authoring work for every annotated equation.
- **Other wide math** scrolls sideways inside its own box, with a fade edge and "Scroll sideways for the rest →". Shrinking equations to fit is ruled out.
- **The section pill** names the current section top-left and opens the route as a bottom sheet. It is the same pill as at every width (§8).
- **Sidenotes** fall inline under their paragraph.
- **The route strip** stacks vertically.
- **Nothing may widen the page.** Every wide block scrolls or reflows inside its own box.

## 7. Citations and references

Decided in [How are papers cited in articles, and where do the entries come from?](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/14)

**Locators** are an unnumbered margin note level with the section heading: "Young et al. §3.1.2 · Eqs. (A.11)–(A.12) · Fig. 3b".
- An article with two readings names the reading in each locator.
- Locators in the prose ("Eq. 4") stay plain text, not links.

**Citations** of other works and datasets are author–year ("Gelman, Meng & Stern (1996)"), linked to the reference entry and previewed with the citation card.

**Markup:** `<cite data-ref="young2020"></cite>`. The build fills in its text and link from the entry.
- A `<cite>` with its own text keeps that text.
- An unknown key fails the build. An entry nothing cites gets a warning.

**References** close every article: readings first, then other works, then data. Each entry has the full reference and a DOI link. The byline's Reading links to its entry.

**Entries** live in one hand-written file, `data/references.json`: CSL-JSON keyed by id, with an extra `note` field for the card. DOIs and metadata are checked against the publisher record when each entry is written.

## 8. Finding your way around

Decided in [How does a Reader find their way around the site?](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/15)

**The contents page** is the site's front page, generated from front matter.
- **Intro:** a paragraph stating the Reader's background.
- **Articles:** in reading order, grouped by week, numbered across weeks. Each shows its title, reading and lede, with its route underneath as indented section links.
- **Concepts:** a link to the concepts index.

**Reading order:** by week, then by an `order:` field within a week. The primer comes before the dolphins article.

**The header:** a slim bar on every article and concept page, not fixed while scrolling. It holds the site name (linking to the contents page), "Concepts", and the theme toggle.

**The pager:** previous/next at the end of every article, in reading order, with hover previews.
- It replaces the primer's "Continue with the dolphins →" and the same-week "switch" links.
- Concept pages have no pager.

**The section pill:**
- **It replaces** the left sidebar, which goes.
- **Behaviour:** it appears once the Reader has scrolled past the route, names the current section ("§3 The toy problem ▾") and opens the route as a sheet.
- **Widths:** the same at every width.

**The concepts index** at `/concepts/` is generated and alphabetical. It shows each page's lede and the number of articles that use it. Stubs are listed like the other concept pages.

**The footer:** "Source" links to this repository, plus "after the original by chethan749".

**Not in this effort:** search and a site-wide bibliography. Revisit search past about 30 pages.

## 9. Charts in the new look

> **Added by this spec.** The map left this section to the spec. It is drafted from the anatomy decisions and a check against the `dataviz` method.

Figures now sit on the page background instead of in cards. The chart kit (`week-3/code/viz-common/charts.js`) already follows the method in most respects:
- thin marks;
- hairline, solid, recessive grid and axis;
- one shared tooltip;
- a legend helper and direct labels;
- light and dark palettes, each validated as its own step.

Figure modules keep their drawing code. What changes:

1. **Surface colour.**
   - **Today:** dot rings and line halos are drawn in `C.surface`, which reads `--surface-1`, the card colour.
   - **Change:** on the bare page it must read the background the figure actually sits on (`--page`). In dark mode the card colour (`#1a1a19`) and the page (`#0d0d0d`) differ visibly, so today's rings would show as grey outlines.
   - **Cost:** a one-line change in `readPalette()`.
2. **Palette re-checked on the new surfaces.** The validator passes on `#f9f9f7` (light) and `#0d0d0d` (dark), with the same results as on the cards:
   - CVD separation is ΔE ≥ 9.2;
   - the normal-vision floor is ≥ 24.6;
   - every dark slot has ≥ 3:1 contrast.

   One warning carries over from today: light-mode `--edge` (`#1baf7a`) has 2.67:1 contrast against the page. The fix is the method's rule for that warning: every chart that uses it carries a direct label or a legend, and a table view (item 5).
3. **Stat tiles are removed** (`tiles()` is no longer used). Their numbers go into the figure caption's live readout (§2).
4. **Legends and labels.**
   - **Legends:** two or more series always get a legend. Up to four series are also direct-labelled. A single series gets no legend, because the caption names it.
   - **Text colour:** text never takes a series colour. Legends, labels and readouts use the text colour tokens.
   - **Placement:** legends sit in the figure, above the plot. They're never inside a card, since there are no cards.
5. **A tooltip is never the only way to read a value.** Each figure offers a **table view**: a "Show the numbers" fold-out under the plot, holding an HTML table of what the chart currently draws. It updates with the controls.
   - **Kit work:** a `tableView(figure, columns, rows)` helper.
   - **Pilot scope:** every primer figure.
   - **Cost:** this is the largest single cost in this section. The cheaper alternative is caption readouts only, but the method rules that out for any chart whose values the text relies on.
6. **Axes in narrow figures.** Two side-by-side charts stack under 720px (§6). The kit's minimum chart width (260px) stays.

## 10. Accessibility

> **Added by this spec.** The map left this section to the spec. The facts behind it come from today's code:
> - no page responds to `prefers-reduced-motion`;
> - three articles animate (Play buttons, `requestAnimationFrame`);
> - charts are bare SVG, with no role or label;
> - chart hover readouts are mouse-only.

1. **Keyboard**
   - **Controls:** every control is a native `<input>`, `<button>`, `<details>` or link. Native sliders already work from the keyboard.
   - **Hover readouts** on charts (the crosshair, heatmap cells) stay a mouse and touch extra. Their values are also in the table view, so nothing is mouse-only.
   - **Previews and the pill:** hover-preview behaviour is in §5. The section pill and the route sheet are buttons, and the sheet closes on Escape and returns focus.
   - **Focus:** focus is visible everywhere, as a 2px `--model` outline with an offset.
   - **Skip link:** the header carries a "Skip to the article" link.
2. **Text alternatives**
   - **Labels:** each chart `<svg>` gets `role="img"` and an `aria-label` naming what it shows ("Histogram of 1000 draws against the exact posterior").
   - **Captions:** the figure's `<figcaption>` is the description, so captions must say what the chart shows, not only what to do.
   - **Table view:** the table (§9) is the full alternative.
   - **Live readouts** in captions aren't announced as they change. The slider's own `<output>` is.
3. **Reduced motion.** Under `prefers-reduced-motion: reduce`:
   - smooth scrolling is off;
   - the card and sheet fades are off;
   - Play animations don't start on their own, and Play jumps to the final state with a "Step" button beside it;
   - the "running estimate" style redraws happen in one go.
4. **Colour**
   - **Identity:** never colour alone. Routes use tag words, charts use legends and labels, sidenote numbers are text.
   - **Contrast:** body and caption text meet WCAG AA in both themes.
5. **Math.** MathJax's assistive MathML stays on, so equations are read as math.
6. **Check.** The Playwright tour adds an axe-core run at 1400px and 390px in both themes. The pilot ships with no serious or critical violations.

## 11. Build and toolchain

Decided in [Pick the toolchain](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/11), after the research in [Should the site stay no-build…?](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/2). Reference: branch [`spike/eleventy`](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/tree/spike/eleventy), with [`SPIKE.md`](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/blob/spike/eleventy/SPIKE.md) and a working config.

**Generator: Eleventy 3, used conservatively.**
- **Articles** stay HTML and are never run through a template language: `htmlTemplateEngine: false` is required.
- **Concept pages** are Markdown, using the spike's 20-line markdown-it rule that passes `\( \)` and `\[ \]` through to MathJax. Display math can't contain a blank line.
- **Layouts** are plain JS (`.11ty.js`).
- **Figure modules** under `week-*/code/**/js` are passthrough-copied, untouched.

**Front matter is the single source of a page's metadata.** Every header, preview, backlink, short link, contents entry and route is generated from it, never scraped from markup.

> **Added by this spec: the fields.**
>
> ```yaml
> # article (YAML front matter at the top of index.html)
> kind: article
> title: The whole Bayesian workflow, on something small
> short: primer                      # → /primer, and article:primer in data-pv
> week: 4
> order: 1                           # reading order within the week
> lede: >-                           # >- or plain, never double-quoted (TeX)
>   Young, Cantwell and Newman fit a model, …
> readings: [carpenter-getting-started, young2020]   # keys in data/references.json
> prerequisites:
>   - { ref: "wiki:Bayesian inference", label: "prior, likelihood and posterior", where: "§1 on" }
>   - { ref: "wiki:Beta distribution", where: "§1" }
>   - { ref: "wiki:Poisson distribution", where: "§3 on" }
> shortcut: { text: "Comfortable with Bayes' rule and Monte Carlo? Start at §3, the toy problem.", to: "#toy" }
> route:
>   - group: The model and its posterior
>     steps:
>       - { id: grid, verb: "Multiply the prior by the likelihood and normalize", math: 'p(\theta) \to p(\theta \mid y)', tag: exact }
>       # …
> ```
>
> ```yaml
> # concept page (concepts/<slug>/index.md)
> kind: concept
> title: Markov chain Monte Carlo (MCMC)
> short: mcmc
> lede: >-
>   …
> equation: 'p(\theta \mid x) \propto p(x \mid \theta)\, p(\theta)'   # optional, shown on the card
> notation: "θ parameters, x data, …"
> prerequisites: ["wiki:Markov chain"]
> stub: true
> ```
>
> A prerequisite is a concept slug or `wiki:<Title>`. Articles are not prerequisites; links between articles are cross-references.

**Data files**

| File | Written by | Holds |
|---|---|---|
| `data/references.json` | hand | CSL-JSON entries plus a `note` field (§7) |
| `data/external.json` | `npm run refresh-wiki`, committed | one entry per Wikipedia title: the lede (math as TeX), the URL, the date fetched, an optional hand-written override |
| `previews.json` | the build | per page: url, kind, slug, title, lede, equation, prerequisites, week, readings, stub |

- **Refreshing the cache:** `npm run refresh-wiki` fetches only titles some page references that are missing or older than 6 months.
- **The build never touches the network.**

**What the build generates:**
- the article header, at an `<!-- article-header -->` marker;
- the route and the strips;
- `<cite>` and `data-pv` links;
- References;
- the contents page and `/concepts/`;
- backlinks;
- `previews.json`;
- the short-link table in `404.html`.

**The build fails on:**
- a prerequisite loop;
- an unknown prerequisite slug;
- an unknown `data-pv` target or citation key;
- a broken internal link (a concept page that isn't written yet counts);
- a duplicate short name.

A stale Wikipedia cache and an uncited reference only warn.

**Commands**
- Node 22 LTS, pinned in `.nvmrc`, with one root `package.json`.
- `npm start` previews the site at the project path, and `npm run build` builds it.
- Serving the repo root directly no longer works for converted pages.

**Deploy**
- A GitHub Actions workflow (the spike's `spike/pages.yml`) builds and publishes `_site`.
- The Pages source switches to "GitHub Actions".
- Only site files are served. The Python scripts, `precompute.mjs`, README and `CONTEXT.md` stay in the repo but leave the Pages URLs.

**Pitfalls from the spike**
- Eleventy reads the whitelist `.gitignore` and then builds nothing. Use `setUseGitIgnore(false)` with explicit ignores.
- Don't add the HTML Base plugin: it rewrites every page.
- Don't run `npm audit fix --force`: it downgrades Eleventy to 0.6.

## 12. Authoring template for future weeks

> **Added by this spec.** The map left this section to the spec.

The reference article is the rebuilt primer: new articles copy its patterns. The template is the primer cut down to a skeleton, and it's made at the end of the pilot, so it can't drift from a page that works.

- **`templates/article/`**, copied to `week-N/code/<slug>/`. It holds:
  - `index.html` with every front-matter field from §11, filled with placeholders;
  - the `<!-- article-header -->` marker;
  - one example section with a locator note, a sidenote, a `data-pv` link, a `<cite>`, a figure (controls row, plot, numbered caption with an instruction sentence and a live readout, table view), a digression, an equation with its narrow phone form, and a `.tbl` comparison table;
  - `js/app.js`, which imports the kit, draws on resize and theme change, and redraws a digression's figures when it is opened.
- **`templates/concept/index.md`:** the concept front matter, the seven section headings, and the stub note.
- **`docs/authoring.md`:** a one-page checklist of this spec's rules for authors, plus `npm start` and what each build failure means.
  - **The rules:** the lede, "Before you start", the linking rules, digressions versus sidenotes, narrow equation forms, citations, and the route in front matter.
- **Excluded from the build:** `templates/` stays out of the build and the collections, so the template never shows up on the contents page.

## 13. The pilot, and what comes after

[Rebuild the primer as the pilot article](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/13) applies this spec to the primer. Its comments list what it covers:
- the Eleventy setup and deploy;
- front matter on all five articles (the other four keep their current body);
- the primer's script;
- the four stubs (MCMC, marginalization, label switching, posterior-predictive check);
- `data/references.json` and `data/external.json` for the primer's links;
- the contents page and `/concepts/`;
- the chart and accessibility changes for the primer's figures;
- then the authoring template.

**Out of scope** for this effort:
- the Python scripts and the computations behind the charts;
- writing concept-page text beyond the pilot's stubs;
- rolling the redesign out to the other four articles;
- search;
- a site-wide bibliography.

**Rollout notes**, for the later effort that redesigns the other four articles:
- each article's route has to be written by hand from its old map's nodes;
- Peixoto's seven transition cards become strips;
- Young et al. should say up front that it builds on the primer.

## Sources

| Kind | Branch | Open |
|---|---|---|
| Research: toolchain | `research/toolchain` | `research/02-toolchain.md` |
| Research: hover previews | `research/hover-previews` | `research/03-hover-previews.md` |
| Research: Distill anatomy | `research/distill-anatomy` | `research/04-distill-anatomy.md` |
| Prototype: article anatomy | `prototype/article-anatomy` | `week-4/code/bayes-primer-viz/prototype-anatomy.html?variant=A` |
| Prototype: hover preview | `prototype/hover-preview` | `…/prototype-hover.html?variant=A` |
| Prototype: route and strip | `prototype/route-diagrams` | `…/prototype-route.html?variant=A` |
| Prototype: phone layout | `prototype/phone-layout` | `…/prototype-phone.html` |
| Spike: Eleventy | `spike/eleventy` | `SPIKE.md` |

The red-team findings that started the map are in the [map's first comment](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/1#issuecomment-6074061040).
