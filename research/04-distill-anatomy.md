# Distill's article anatomy, and how much of its template we can reuse

Research for [#4](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/4), part of the map [#1](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/1).
Gathered 2026-10-09. Vocabulary follows [`CONTEXT.md`](../CONTEXT.md): Article, Concept page, External reference, Hover preview, Reader.

**Sources, all primary:** the `distillpub/template` source on GitHub (`master`), the bundle served at `https://distill.pub/template.v2.js`, the GitHub API for repo metadata, distill.pub's guide and hiatus post, one real Distill article ([*A Gentle Introduction to Graph Neural Networks*](https://distill.pub/2021/gnn-intro/), 2021), and the source of Bartosz Ciechanowski's [*Gears*](https://ciechanow.ski/gears/), Amit Patel's [Red Blob Games making-of notes](https://www.redblobgames.com/making-of/line-drawing/) and Bret Victor's [*Explorable Explanations*](https://worrydream.com/ExplorableExplanations/).
**Tested:** one test page in Playwright, at 1400px and 390px, in light and dark. It loaded `template.v2.js` together with this site's MathJax 3.2.2 setup and an ES-module figure. Results are marked **[tested]**.

---

## 1. Is the template still usable and maintained?

| Fact | Value | Source |
|---|---|---|
| License | Apache-2.0 ("Copyright 2018, The Distill Template Authors") | [`LICENSE`](https://github.com/distillpub/template/blob/master/LICENSE), [`README.md`](https://github.com/distillpub/template/blob/master/README.md) |
| Last release | `v2.8.0`, 2020-04-28 | GitHub releases API |
| Last commit on `master` | 2020-05-18 (merge of PR #106) | GitHub commits API |
| Last push of any kind | 2022-12-05 (a Dependabot bump) | GitHub repo API, `pushed_at` |
| Open issues | 62. One of the last, from Nov 2022, asks "What alternatives exist for an addon style set for academic writing for the web?" | GitHub issues API |
| Hosted bundle | `https://distill.pub/template.v2.js` still serves: 200, 292 KB, `Last-Modified: 2022-08-03` | `curl -I` |
| KaTeX it bundles | `"katex": "^0.8.3"` (a 2017 line), loaded from `https://distill.pub/third-party/katex/` | [`package.json`](https://github.com/distillpub/template/blob/master/package.json), [`src/components/d-math.js`](https://github.com/distillpub/template/blob/master/src/components/d-math.js) |
| Journal status | On hiatus since 2021-07-02, "which may be extended indefinitely". The post adds: "the Distill template is open source, and we'd love to see others run with it!" | [distill.pub/2021/distill-hiatus](https://distill.pub/2021/distill-hiatus/) |
| Docs | [distill.pub/guide](https://distill.pub/guide/) still documents **v1** (`template.v1.js`, `<dt-article>`, `<dt-fn>`, `<dt-cite>`). The v2 `d-*` elements are documented only by the repo's `examples/` and source. | guide page, [`examples/index.html`](https://github.com/distillpub/template/blob/master/examples/index.html) |

**In short:** it still works and the license lets us copy it, but nobody maintains it. It has been frozen since 2020 and its documentation describes the previous version. Linking to `distill.pub/template.v2.js` makes the site depend on a CDN run by a journal on hiatus. If we use the template at all, we should keep our own copy (Apache-2.0 allows that, as long as we keep the license header).

## 2. The anatomy, part by part

Each part names the template element or class that does the job, and the file that defines it.

### 2.1 Layout grid ([`src/styles/styles-layout.css`](https://github.com/distillpub/template/blob/master/src/styles/styles-layout.css))

`d-title`, `d-byline`, `d-article`, `d-appendix` and the lists in the appendix are all `display: grid` with **named column lines**: `screen`, `page`, `middle`, `text`, `kicker`, `gutter`. Each `l-*` class just sets `grid-column` to one of those names:

| Class | `grid-column` | Width at ≥1180px | at 1000px | at 768px | <768px |
|---|---|---|---|---|---|
| `.l-body` / `.l-text` (the default for every child of `d-article`) | `text` | **704px** (8×60 + 7×32 gap) | 512 | 472 | full width minus 8px gutters |
| `.l-body-outset` | `middle` | 888px | 644 | 533 | same as text |
| `.l-page` / `.l-page-outset` | `page` | **1072px** (12 cols) | 776 | 594 | same as text |
| `.l-screen` | `screen` | full viewport | | | |
| `.l-screen-inset` | `screen` + `padding-left: 16px` | full viewport. The source sets `padding-left` twice and `padding-right` never, so the right edge is not inset. | | | |
| `.l-gutter`, `aside`, `.side` | `gutter` | **152px** right margin column | 116 | 106 | inline, full width |
| `.marker` / `.kicker` | `kicker` | the 2 columns left of the text, for section numbers | | | |

Breakpoints: 768, 1000, 1180px. Column gaps: 8, 16, 16, 32px. **[tested]** At 1400px the text column measured x=348, w=704; an `aside` sat in the gutter at x=1084, w=152; `figure.l-page` measured w=1072. At 390px everything collapsed to one 358px column with 16px side margins, asides fell inline under their paragraph, and there was no horizontal scroll.

The grid itself is about 60 lines of CSS. This is the part of Distill most worth copying.

### 2.2 Typography ([`styles-base.css`](https://github.com/distillpub/template/blob/master/src/styles/styles-base.css), [`d-article.css`](https://github.com/distillpub/template/blob/master/src/styles/d-article.css), [`d-title.css`](https://github.com/distillpub/template/blob/master/src/styles/d-title.css))

- **Body font:** the system sans stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`). It is **not a serif**, and it is close to our `--font`. The html font size is 14px, 16px at ≥768px; `d-article` is 16px, and 1.06rem with line-height 1.7em at ≥1024px. **[tested]** 16.96px at 1400px, 14px at 390px.
- **Math:** KaTeX's serif fonts. So **Distill has the same sans-text / serif-math mismatch** as red-team finding #3. A Distill feel does not by itself fix #3; changing the body font would be a separate decision.
- **Headings:** `d-title h1` is 50px/700 (40px on phones), followed by a lede `p` at 1.2rem, weight 300. `h2` is 24px, 36px at ≥1024, weight 600, with a bottom rule. `h3` is 18–20px/700. `h4` is 14px uppercase. Section numbers are `<a class="marker">` in the `kicker` column, left of the heading.
- **Text colour:** set as `rgba(0,0,0,0.8)`. Captions and asides use `rgba(0,0,0,0.6)`. Links are drawn as a 1px `border-bottom` at 0.4 alpha instead of an underline.

### 2.3 Figures and captions

- These are plain `<figure>` and `<figcaption>`. There is no `d-figure` styling: [`d-figure.js`](https://github.com/distillpub/template/blob/master/src/components/d-figure.js) is only an IntersectionObserver that fires `ready`, `onscreen` and `offscreen` events, starting `ready` up to two screen heights before the figure scrolls into view. That gives lazy initialisation, which we could copy for heavy charts.
- Width comes from an `l-*` class, or from inline `grid-column: page`. **[observed]** The GNN article uses `grid-column` with `text` ×9, `page` ×4, `screen` ×4, `gutter` ×4, `middle` ×1, and no `l-*` classes.
- Figure margins are 1.5em above and 2.5em below. Captions are 12px (13px at ≥1024), colour 0.6 alpha, and `figcaption b` goes to full black. That is the "bold lead phrase, then grey explanation" style.
- **The template does not number captions.** The GNN article has 39 `<figcaption>`s and none says "Figure n". Its captions often **tell the reader what to do**: "Hover over a node in the diagram below to see how it accumulates information…", "Click on an image pixel to toggle its value…". If we want numbered captions (red-team finding #2), we write them ourselves, with a CSS counter or by hand.
- Figures have **no card chrome**: no border, background or radius. Distill figures sit on the page itself.

### 2.4 Footnotes, citations and the hover box

- **`<d-footnote>`** ([source](https://github.com/distillpub/template/blob/master/src/components/d-footnote.js)) numbers itself. It renders a superscript, and on hover shows its content in a `d-hover-box`. `d-footnote-list` copies every footnote into the appendix with a `[↩]` backlink.
- **`<d-cite key="a,b">`** ([source](https://github.com/distillpub/template/blob/master/src/components/d-cite.js)) works with `<d-bibliography><script type="text/bibtex">…`. It renders `[1]`, its hover box shows the formatted entry, and `d-citation-list` writes the References in the appendix. **[tested]** One BibTeX entry rendered as `[1]`, and the appendix grew "Footnotes" and "References" sections.
- **`<d-hover-box>`** ([source](https://github.com/distillpub/template/blob/master/src/components/d-hover-box.js)) is the one popover that both footnotes and citations use. It is a 704px-wide panel spanning the text column, placed 10px below the trigger. It opens on `mouseover`, hides 300–500ms after `mouseout` (staying open while the pointer is over the box), and toggles on `touchstart`. **It has no keyboard or focus handling** (**[tested]** the footnote marker has `tabIndex = -1`), and its colours (`rgba(250,250,250,0.95)` panel) are **inside a shadow root**, so page CSS cannot theme it.
- This overlaps with our **Hover preview**. One shared hover-card component could serve footnotes, citations and hover previews of concept pages. That bears on the map's open question "Citations and references … whether that shares machinery with hover previews".

### 2.5 Byline, appendix and front matter

- **`<d-front-matter><script type="text/json">`** takes title, description, published date, authors (`author`, `authorURL`, `affiliations[]`) and optional `katex` options ([`examples/index.html`](https://github.com/distillpub/template/blob/master/examples/index.html)).
- **`<d-byline>`** is a four-column strip: **Authors, Affiliations, Published, DOI**. **[tested]** With no DOI it prints "No DOI yet."; with no affiliations it shows an empty column. It is built for a journal; for a course article we would want something like "Week 4 · reading: Young et al. (2020) · prerequisites: …".
- **`<d-appendix>`** has smaller (0.8em), grey text, a top rule and 60px of padding; `h3`s sit in the left `page-start / text-start` margin. It is filled automatically with the footnote and citation lists. The Distill-branded parts ("Updates and Corrections", "Reuse", "Citation", plus `distill-header` and `distill-footer`) appear only if you add those elements. **[tested]** No Distill branding appeared on the test page.
- `d-toc` exists: it builds a list from the `h2`/`h3`s on `window.onload` and places it wherever you put the element. Distill articles rarely use it, and it is not a sticky sidebar.

### 2.6 What Distill doesn't have

There is no sticky control bar, no stat tiles, no cards, no "takeaway" box and no transition card. Tables get light rules (15px, `2px 8px` padding) but **no overflow handling**, so red-team finding #9 (tables wider than a 390px screen) is not solved by the template. Block math on screens under 768px gets `overflow-x: scroll` with the scrollbar hidden. That avoids page-wide scrolling, but the reader can't tell the equation scrolls (red-team finding #7).

## 3. Does it work with MathJax 3, our light/dark tokens and ES-module figures?

| Concern | Result |
|---|---|
| **MathJax 3 alongside the template** | **Works [tested].** KaTeX loads only when the page has a `<d-math>` element or `katex` options in the front matter ([`d-math.js`](https://github.com/distillpub/template/blob/master/src/components/d-math.js) `connectedCallback`, [`controller.js`](https://github.com/distillpub/template/blob/master/src/controller.js) L163). With neither, `katex` stayed undefined and no KaTeX script was requested. MathJax typeset all 7 expressions, **including inside `<d-footnote>`** (footnote content is light DOM, slotted into the shadow root) and in the copy in the appendix's footnote list. Our `\( \)` / `\[ \]` delimiters don't clash with KaTeX's default `$$`. One caveat: citation hover boxes are built inside a shadow root, so TeX in a BibTeX title would not be typeset. |
| **Light/dark tokens** | **Breaks [tested].** With `data-theme="dark"` and our `--page`, `d-article` text stayed `rgba(0,0,0,0.8)`: near-black text on `#0d0d0d`, so headings and body all but disappear. The light-DOM rules (`d-article`, captions, appendix, links) can be overridden from our stylesheet with tokens, but there are about 40 hardcoded `rgba(0, 0, 0, …)` values in the bundle. The hover box, citation number and footnote marker colours are in shadow roots and cannot be overridden without forking. |
| **ES-module figures** | **Work [tested].** A `<script type="module">` figure ran next to the template. Nothing in the template stops our `js/app.js` modules. |
| **Weight and age** | 292 KB of script, Custom Elements v1 with a `webcomponentsjs` v1 polyfill loader and a 2017 KaTeX. The template also rewrites the DOM on load (moving the title, inserting byline and appendix), so our modules must not assume the original DOM order. |

## 4. Other explorable-explanation sites: controls next to figures

Red-team finding #4 is the sticky top bar driving charts several sections down. Three respected sources, plus Distill itself, all handle this the same way:

- **Ciechanowski (*Gears*).** Each figure is a `<div class="drawer_container" id="gears_…">`, and its slider is built into **that figure's own** `…_slider_container` (`new Slider(document.getElementById("gears_rpm_slider_container"…`). The prose announces the control just before the figure: "In the demonstration below you can control the fan's speed using a slider". A single sentence near the top offers a **global pause** for all animations ("if you find them distracting, or you want to save power, you can globally pause all animations"), a reduced-motion pattern worth copying. *Source: the page HTML and `/js/gears.js`.*
- **Red Blob Games (Amit Patel).** He prefers **direct manipulation** (draggable handles inside the diagram) and **scrubbable numbers in the prose** (`<span data-name="XYZ">` turned into draggable values) to separate sliders: "What I most often do for interaction is let the reader change the *inputs* to the algorithm and then I show the *outputs*." Each diagram is built from small layers (`new Diagram('interpolate-t').addGrid().addTrack().addInterpolated(0.5).addHandles()`), and he says he has no generic framework: "I make one specific for each tutorial that needs it." *Source: making-of/line-drawing.*
- **Bret Victor (*Explorable Explanations*, the source of the term).** A "reactive document" "allows the reader to play with the author's assumptions and analyses, and see the consequences". Its adjustable values are underlined words in the sentence, and "the consequences of your adjustments are reflected in the following paragraph".
- **Distill (GNN article).** Its controls are inside the figure, and the caption says how to use them.

**The common pattern:** the control lives inside the figure it changes (or in the sentence about it), and the caption or the sentence before it says what to do. None of these sources uses a page-level control bar.

**Where this collides with our primer:** one set of toy-count sliders (λ₀, λ₁, ρ, N) drives §3–7. Per-figure controls mean either (a) repeating a small control strip in each section, all bound to one shared state object so they stay in sync, or (b) one strip at the start of §3 that is `position: sticky` *only inside a wrapper around §3–7*, so it scrolls away after §7 and never sits over the rest of the page, or (c) scrubbable numbers in the text ("with λ₁ = **10** and ρ = **0.3** …"). This is a choice for the anatomy prototype; see the options below.

## 5. How the current pages map onto the anatomy

Classes in [`week-3/code/viz-common/styles.css`](../week-3/code/viz-common/styles.css), as used by [`week-4/code/bayes-primer-viz/index.html`](../week-4/code/bayes-primer-viz/index.html):

| Ours | Distill equivalent | Note |
|---|---|---|
| `.shell` grid, 232px `nav.side` | none (`d-toc` is rare, not sticky, and goes where you put it) | Distill has no sidebar. A contents list could go in the gutter at ≥1180px, at the top on phones (red-team #10). |
| `.controls` sticky bar | none | Replace with per-figure controls (§4). |
| `.content` max-width 1120, `p` max-width 720 | `d-article` grid: `text` 704 / `page` 1072 | Nearly the same numbers already. |
| `header.hero`, `.eyebrow`, `h1`, `.lede` | `d-title` `h1` + lede `p`; `.status` in the `kicker` column | The eyebrow corresponds to Distill's `d-title .status`. |
| `.sec-head` / `.sec-num` + `h2` | `a.marker` in the `kicker` column + `h2` | Move the number into the left margin. |
| `.refs` ("Carpenter §5 · …") | `aside` in the gutter, or a `d-cite` | Natural marginalia. |
| `.eq` (bordered box, `overflow-x: auto`) | `d-math[block]`: no box; scrolls with a hidden scrollbar under 768px | Distill keeps no chrome; neither choice fixes #7 alone. |
| `.card` + `.grid-2` / `.grid-3`, `.card h3` + `.sub` | `figure.l-page` (or `l-body-outset`) with a `figcaption` whose `b` lead is bold | Drop the card chrome; `h3` + `.sub` become the caption. |
| `.transition` card | none | Ours to keep or restyle (red-team #6). |
| `.takeaway` | none (Distill writes it as prose) | Keep as our own element, or make it a gutter `aside`. |
| `.note` | `aside` / `d-footnote` | |
| `.tiles` | none | Fold into captions or the figure. |
| `.tooltip` (chart readouts) | none: `d-hover-box` is for footnotes and citations, not charts | Matches `CONTEXT.md`: "tooltip" stays reserved for chart readouts. |
| `table.recipe` | `d-article table` (light rules) | Neither handles overflow; needs a scrolling wrapper or a stacked phone layout (#9). |
| tokens `--page`, `--text-*`, `--border` … | hardcoded `rgba(0,0,0,…)` | Ours are strictly better; keep them. |
| MathJax via `site.js` (`\( \)`, `\[ \]`, macros) | KaTeX via `d-math` | Ours can stay (§3). |

## 6. Options

**A. Adopt `template.v2.js` (a vendored copy), using the `d-*` elements.**
*Gains:* the grid, footnotes, BibTeX citations with hover boxes, footnote and reference lists in the appendix, and the byline, all at once. *Costs:* dark mode is broken and only partly fixable from outside (shadow-root colours); hover boxes have no keyboard access; the byline is built for a journal; 292 KB of unmaintained 2020 code that rewrites the DOM on load; no fixes upstream will come.

**B. Fork the template and patch it (CSS variables in the shadow styles, focus handling, a course byline).**
*Gains:* as for A, plus theming and accessibility fixed. *Costs:* we maintain a Rollup build with 2017–2020 dependencies (KaTeX 0.8, a webcomponents v1 polyfill) for a static site that has no build step today.

**C. Re-implement the anatomy in our own CSS and a little JS.** Port the named-line grid and the `l-*`, `aside` and `kicker` classes (≈60 lines; copying the CSS verbatim is fine under Apache-2.0 if we keep its header). Restyle `figure`/`figcaption` in Distill's way using our tokens. Write footnotes and citations as plain HTML plus one small hover-card module that also serves **Hover previews**.
*Gains:* our tokens, MathJax and modules stay as they are; no new dependency; keyboard access and dark mode designed in from the start; one hover machine for footnotes, citations and concept-page previews. *Costs:* we write about 150–250 lines of hover-card JS and handle citation numbering ourselves (or keep a hand-written reference list); no BibTeX parsing unless we add it.

**C′. As C, but also keep `d-figure`'s lazy-ready idea** (an IntersectionObserver with a margin of two screen heights) for heavy figures like the Martin et al. heatmaps. It is a small, separable pattern.

> **Recommendation (flagged, not decided):** **C**, with the grid ported from `styles-layout.css` and figure controls inside the figure as in §4 (for the primer's shared toy-count state, option (a) or (b) in §4 is a choice for the anatomy prototype). The deciding facts: the template is frozen since 2020, its dark mode cannot be fixed without forking, its hover box has no keyboard access, and our Hover preview needs a hover-card component of its own anyway. Its strongest part, the grid, is small enough to copy. Choose A only if BibTeX-driven citations matter more than dark mode and keyboard access.

## 7. Parts worth re-implementing, in priority order

1. **The named-line grid** (`screen / page / middle / text / kicker / gutter`, three breakpoints) and the `l-body`, `l-body-outset`, `l-page`, `l-screen`, `l-gutter` classes, with `aside` → gutter that falls inline under 768px.
2. **Figure and caption conventions:** no chrome; a bold lead phrase, then grey caption text; captions that tell the reader what to do; our own numbering if we want it.
3. **The section number in the kicker column**, left of the `h2`.
4. **Gutter asides** for sources and short notes (`.refs`, `.note`).
5. **Footnotes and citations on one hover card**, with keyboard support (focusable trigger, `Escape` to close, `aria-describedby`), tap on touch, and lists in the appendix with backlinks. Build it with the Hover preview.
6. **The appendix:** smaller grey text, `h3`s in the left margin, holding Footnotes, References and (for us) "Prerequisites" and "Further reading".
7. **Lazy figure start-up** (`d-figure` pattern) for expensive charts.

Not worth copying: the byline as it is, `d-toc`, `d-code`, `d-math`/KaTeX, the front-matter JSON, and the Distill-branded header, footer and appendix.

## Open questions for the human

- Distill's body is sans, like ours; should the textbook look move the body to a serif to match MathJax (red-team #3), or keep sans like Distill?
- Numbered figure captions ("Figure 3.") or Distill's unnumbered ones?
- Citations: BibTeX-driven (needs a parser) or a short hand-written reference list per article?
- For the primer's shared controls: a strip repeated in each section, a strip sticky within §3–7, or scrubbable numbers in the text?
