# Hover previews: how Gwern's popups and Wikipedia's Page Previews work, and what we can reuse

Research for [#3](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/3) (part of [#1](https://github.com/TheChesireCat/nets7976-mdl-reconstruction/issues/1)).
Researched 2026-10-09. Vocabulary follows [`CONTEXT.md`](../CONTEXT.md): a **Hover preview** is the card;
"tooltip" stays reserved for chart hover readouts.

Sources are pinned where possible:

- Wikimedia Page Previews: [`wikimedia/mediawiki-extensions-Popups`](https://github.com/wikimedia/mediawiki-extensions-Popups) at commit `371d6a4` (2026-09-22), cited as `WM:<file>:<lines>`.
- Gwern.net: [`gwern/gwern.net`](https://github.com/gwern/gwern.net) at commit `5a4d6818b3` (2026-10-08), cited as `GW:<file>:<lines>`.
- Empirical checks: `curl` against `en.wikipedia.org` and our GitHub Pages site on 2026-10-09 (marked **[curl]**).

---

## 1. Wikipedia Page Previews (the `Popups` MediaWiki extension)

### Where the content comes from

- The card shows "a portion of the first paragraph from the article" plus "an image (if available)"; since March 2018 it renders HTML rather than plain text, which gave "correct representation of mathematical, chemical and other formulas" ([mediawiki.org: Page Previews](https://www.mediawiki.org/wiki/Page_Previews)).
- The gateway is configurable (`mwApiPlain | restbasePlain | restbaseHTML`); the REST gateways call `PopupsRestGatewayEndpoint`, default `/api/rest_v1/page/summary/`, and the endpoint "must meet the spec at Specs/Summary" (`WM:extension.json:62-68`). The REST gateway sends `Accept: application/json; profile=".../Specs/Summary/1.2.0"` and `Accept-Language` (`WM:src/gateway/rest.js:7,40-49`).
- Client-side cap: `EXTRACT_LENGTH: 525` characters; thumbnail requested at `320 × max(devicePixelRatio, 1.5)` px (`WM:src/constants.js:23-27`).
- Disambiguation pages get their own card type (`WM:src/preview/model.js:18-22`).

### Trigger, timing, dismissal

- **Hover delay:** wait `FETCH_START_DELAY = 150 ms` before fetching; then pad so the card appears at `FETCH_COMPLETE_TARGET_DELAY = 500 ms` total even if the response is cached or fast, "to make the preview delay consistent to the user" (`WM:src/constants.js:9-16`; rationale in [T161284](https://phabricator.wikimedia.org/T161284), [T70861](https://phabricator.wikimedia.org/T70861#3129780)).
- **Abandon grace:** `ABANDON_END_DELAY = 300 ms` after the pointer leaves; any in-flight fetch is aborted immediately (`WM:src/constants.js:21`, `WM:src/actions.js:260-280`). Moving the pointer *into* the card cancels the abandon (`mouseenter`/`mouseleave` on the card, `WM:src/ui/renderer.js:304-305`).
- **Keyboard:** listeners are `mouseover` and **`keyup`** (so Tab-focusing a link opens a card), `mouseout` and `blur` to abandon (`WM:src/index.js:295-299`). The docs say they "are usable for people who use keyboard navigation" ([Page Previews](https://www.mediawiki.org/wiki/Page_Previews)).
- **Screen readers:** the card container is `aria-hidden` (`WM:src/ui/templates/popup/popup.js:9`); docs: "screen reader software ignore Page Previews".
- **Touch:** not loaded at all on touch devices: `const isTouchDevice = 'ontouchstart' in document.documentElement; … if ( !isTouchDevice && … )` (`WM:resources/ext.popups/index.js:3,11`). Mobile Wikipedia and the apps have separate implementations.
- **Opt-out:** a user setting ("disable rate was around 0.01%" in 2017–18 A/B tests) ([Page Previews](https://www.mediawiki.org/wiki/Page_Previews)).

### Placement

`createLayout()` (`WM:src/ui/renderer.js:369-445`):

- Fixed widths: 320 px (portrait/no image) or 450 px (landscape image); 8 px pointer (`WM:src/ui/renderer.js:10-13`).
- Below the link by default, pointer at the link's centre for short links (< 28 px wide) or at the mouse x for longer ones; for keyboard focus, anchored to the link's box.
- **Flip X** if the anchor is past the window's horizontal midpoint; **flip Y** (card above) if past the vertical midpoint. Multi-line links use the client rect closest to the pointer. RTL mirrors X.
- **No nesting:** one card at a time.

### License

GPL-2.0-or-later (`WM:extension.json:11`, `WM:COPYING`). Copying its code into our site would put that code under the GPL. Its **constants and layout rules are facts we can re-implement freely**; its code we should not vendor.

---

## 2. Gwern.net popups (desktop) and popovers (mobile)

### Where the content comes from

- **Annotations are precomputed at build time.** A Haskell build (`build/LinkMetadata.hs`, `build/Annotation.hs`, [repo `build/`](https://github.com/gwern/gwern.net/tree/master/build)) writes one HTML fragment per annotated link; the browser fetches `/metadata/annotation/<double-URL-encoded target>.html` (`GW:js/annotations.js:2,101-105`). Annotated links carry class `link-annotated` / `link-annotated-partial` (`GW:js/annotations.js:4-27`). Sources include hand-written summaries and scraped Wikipedia, arXiv, bioRxiv, PubMed metadata ([gwern.net/design](https://gwern.net/design)).
- **Local pages are transcluded live:** `extracts-content.js` / `transclude.js` fetch the target page and slice the relevant section ("within-page or cross-page, arbitrary IDs or ranges", [gwern.net/design](https://gwern.net/design)).
- **Wikipedia links are fetched live from the browser** via `/api/rest_v1/page/html/<title>` (the whole article's Parsoid HTML, not `page/summary`), following `mw:PageProp/redirect` links (`GW:js/content.js:556-590`).
- Results are cached in memory per target (`GW:js/annotations.js:59-73`).

### Trigger, timing, dismissal

- **Desktop:** `mouseenter`/`mouseleave`/`mousedown` on each target (`GW:js/popups.js:148-150`). `popupTriggerDelay: 750` ms, `popupFadeoutDelay: 100` ms, `popupFadeoutDuration: 250` ms (`GW:js/popups.js:24-26`). Per-target overrides via `specialPopupTriggerDelay` (`GW:js/popups.js:1997-2007`).
- **Keyboard:** I found no focus trigger in `popups.js`; the keyboard handles **Escape** (close) and tiling keys for open popups (`GW:js/popups.js:2584-2610`). So Gwern's popups are effectively mouse-only to open.
- **Mobile → "popovers":** mode chosen by `GW.isMobile()` or `matchMedia("(max-width: 1279px) and (max-height: 959px)")` (`GW:js/extracts.js:179-183`). First tap opens the popover (`preventDefault` on the link click), tapping the backdrop closes it, and popovers are tied to browser history so Back closes them (`GW:js/popovers.js:640-696`). The header comment: "On mobile, clicking on links … will bring up the annotation …; another click on it or the popup will then go to it" (`GW:js/extracts.js:9`).

### Nesting and placement

- **Recursive:** "One can popup links from popups" ([gwern.net/design](https://gwern.net/design)). Each popup joins its parent's `popupStack` (`GW:js/popups.js:437-443`); leaving the stack despawns it.
- **Placement** (`GW:js/popups.js:1795-1890`): nested popups (or targets that ask for it) go **to the side** (right, else left); otherwise **above** the link if it fits, else **below**, else retry with tighter spacing, else to the side. Breathing room 12 px horizontal, 8 px vertical (`GW:js/popups.js:20-22`).
- Popups can be dragged, resized, pinned, maximised and tiled ([gwern.net/design](https://gwern.net/design)).

### Coupling and size

The pop-frame stack (`popups.js` 2,719 lines, `popovers.js` 733, `extracts*.js` ~1,250, `annotations.js` 445, `content.js` 2,031, `transclude.js` 2,587; ~10k lines at the pinned commit) depends on Gwern's utilities (`GWLog`, `newElement`, `GW.notificationCenter`) and on build-time HTML conventions (link classes, annotation fragments). It is not a drop-in library.

### License

- Site **text**: CC-0 ("This site is licensed under the Creative Commons public domain (CC-0) license", [gwern.net/about](https://gwern.net/about)).
- **Code**: per-file headers only; the repo has **no top-level LICENSE** (GitHub API reports `license: null`; root has no LICENSE file). `extracts.js`: "Author: Said Achmiz, Shawn Presser … license: MIT (derivative of footnotes.js, which is PD)" (`GW:js/extracts.js:1-5`). `popups.js` / `popovers.js` headers cite Lukas Mathis' public-domain footnotes code (`GW:js/popups.js:1-10`); [gwern.net/design](https://gwern.net/design) lists `popups.js` as "Said Achmiz, Shawn Presser; MIT". So **MIT, with attribution, is the reasonable reading for the popup JS**, but it is stated file by file, not repo-wide.

---

## 3. Calling Wikipedia from the browser on GitHub Pages

| Question | Finding | Source |
|---|---|---|
| CORS | `access-control-allow-origin: *`, methods `GET,HEAD`; `api-user-agent` and `accept-language` are allowed request headers. Preflight with `Api-User-Agent` returns 200. | **[curl]** `GET`/`OPTIONS` on `/api/rest_v1/page/summary/…` with `Origin: https://thechesirecat.github.io` |
| Caching | `cache-control: s-maxage=1209600, max-age=300` (CDN 14 days, browser 5 minutes); `etag` exposed. | **[curl]** |
| Redirects | `page/summary/EM_algorithm` returns 200 with the target's summary (no client redirect handling needed). | **[curl]** |
| Response | JSON per [Specs/Summary](https://www.mediawiki.org/wiki/Specs/Summary/1.5.0) (now profile 1.5.0): `type` (`standard`/`disambiguation`/…), `title`, `displaytitle`, `description`, `extract`, `extract_html`, `thumbnail{source,width,height}`, `content_urls`, `lang`, `dir`, `revision`, `timestamp`. | **[curl]** |
| Rate limits | New in 2026 and "subject to experimentation and change". "Requests made from a web browser by an unauthenticated user": **200 req/min**; unidentified clients 10/min. On 429 honour `Retry-After`, else wait ≥ 5 s or back off exponentially. Phase 1 enforcement March 2026, Phase 2 April 2026. | [Wikimedia APIs/Rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) (modified 2026-06-03); [Changelog](https://www.mediawiki.org/wiki/Wikimedia_APIs/Changelog) |
| User-agent | A User-Agent is mandatory (format `<client>/<version> (<contact>) <library>/<version>`); browser JS that can't set it should send **`Api-User-Agent`**. | [Wikimedia APIs/Access policy](https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy) (modified 2026-04-24) |
| Content license | Text is CC BY-SA 4.0 (and GFDL); attribution can be "a hyperlink … or URL to the page"; modifications must be marked and stay CC BY-SA; **images carry their own licenses**. | [Wikipedia:Reusing Wikipedia content](https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content) |

Implications:

- **Yes, it works from GitHub Pages with no proxy.** A reader hovering a few External references per minute is far below 200/min. The limit is stated per client class; the page does not spell out how a browser client is keyed (per IP or otherwise), so a classroom behind one NAT is the one case worth a back-off on 429.
- **`Api-User-Agent` costs a preflight.** It is a non-simple header, so each cold request is `OPTIONS` + `GET`; the preflight response sent no `access-control-max-age` **[curl]**, so browsers fall back to their short default preflight cache. That trade (etiquette vs. one extra round-trip) is ours to choose; the access policy asks for it.
- **Math in `extract_html` is an `<img>` from the Wikimedia Math API** (`https://wikimedia.org/api/rest_v1/media/math/render/svg/<hash>`, `aria-hidden`, no MathML or TeX alongside) **[curl]** on *Kullback–Leibler divergence*. The [Changelog](https://www.mediawiki.org/wiki/Wikimedia_APIs/Changelog) (August 2026) says the Math API "will be fully sunset by the end of September 2026". On 2026-10-09 the SVG still returned 200 **[curl]**, but this is a live risk: math-heavy External references (most of ours) may show broken images. Fallbacks: use the plain-text `extract` (math is dropped), or curate our own summary for those links.
- Card text must carry attribution (title linking to the article, plus "Wikipedia, CC BY-SA"); the thumbnail is safest omitted or credited via its Commons page.

---

## 4. Platform pieces available in 2026 (nothing to license)

From the `web-features` dataset on unpkg (fetched 2026-10-09):

- **Popover API** (`popover` attribute, top layer, light-dismiss): Baseline since 2025-01-27 (Chrome 116, Firefox 125, Safari 17).
- **CSS anchor positioning** core properties (`anchor-name`, `position-area`, `position-try-fallbacks`): Baseline (newly available) since 2026-01-13 (Chrome 125–129, Firefox 147, Safari 26); `position-anchor` only since 2026-09-14 and the feature as a whole is not yet Baseline. A JS positioner is still the safe default; [Floating UI](https://github.com/floating-ui/floating-ui) is MIT ([Tippy.js](https://github.com/atomiks/tippyjs), MIT, is archived).
- **Interest invokers** (`interestfor`, hover/focus "interest" with built-in delays): Chromium 142+ only, marked experimental ([MDN: interest event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/interest_event)). Not usable alone yet.
- Our site already loads MathJax in `week-3/code/viz-common/site.js`, so a card holding TeX needs a `MathJax.typesetPromise([card])` after insertion.

---

## 5. Previewing our own pages (Concept pages, Articles)

What the site is today: plain static HTML, no build step except ad-hoc Node scripts (e.g. `week-5/code/peixoto-viz/precompute.mjs`). Article prose is in the static HTML (the primer has 37 `<p>`), there is no `<meta name="description">`, and GitHub Pages serves pages with `cache-control: max-age=600` and `access-control-allow-origin: *` (primer: 33 KB uncompressed) **[curl]**.

| Option | How | For | Against |
|---|---|---|---|
| **A. Prebuilt JSON index** | A Node script (like `precompute.mjs`) walks the pages and writes `previews.json`: `{ url → {title, kind, summary_html} }`, ideally in the Wikipedia Summary shape so one card renderer serves both. | One small fetch, then instant cards; easy to make the shape match External references; this is what Wikipedia (server-side) and Gwern (build-time annotations) both do. | A build step to remember; stale if someone edits a page and forgets to rerun (mitigate with a CI check or a GitHub Action). |
| **B. Fetch and parse on hover** | `fetch(href)` (same origin), `DOMParser`, take a marked element (e.g. the first `<p>` after `<h1>`, or `[data-preview]`/`meta[name=description]`). | No build; always current; Gwern does this for local transclusion. | ~33 KB per first hover (cached 10 min); parsing rules depend on page anatomy, which #1 is still redesigning; heavier on phones. |
| **C. Hybrid: author-marked summary, built into the index** | Each page carries its own summary (`<meta name="description">` or a `data-preview` block); option A's script only extracts those. Option B can be the fallback when the index lacks a URL. | Summary lives next to the content it describes; the index is a cache, not a second source of truth. | Both pieces exist; slightly more to explain in the authoring template. |

---

## 6. What we can reuse

| Piece | Reuse? | Why |
|---|---|---|
| Wikipedia's timing: 150 ms dwell before fetch, card at 500 ms, 300 ms abandon grace, card hover keeps it open | **Yes, as numbers** | Measured and tuned on a very large audience; facts aren't copyrightable. |
| Wikipedia's keyboard model (focus opens, blur closes) | **Yes, as behaviour** | Gwern lacks it; our #1 map lists accessibility. |
| Wikipedia's code | **No** | GPL-2.0+, MediaWiki/ResourceLoader/Redux-bound. |
| Wikipedia `page/summary` as the source for External references | **Yes, with care** | CORS open, per-reader 200/min, CDN-cached; attribution required; math images at risk (§3). |
| Gwern's placement rules (above → below → tight → side; nested go sideways) | **Yes, as behaviour** | Good fit for a one-column reading layout with nested previews. |
| Gwern's mobile model (tap opens a popover, tap again/backdrop closes, Back closes) | **Yes, as behaviour** | Wikipedia simply disables previews on touch; Gwern's is the worked example. |
| Gwern's JS | **Possible, not advised** | MIT per file but ~10k coupled lines with build-time conventions; far more than a course site needs (dragging, tiling, pinning). |
| Gwern's architecture (precomputed per-link fragments + live transclusion of local pages) | **Yes, as a pattern** | Maps directly onto options A/C plus B (§5). |
| Popover API + Floating UI (or anchor positioning later) | **Yes** | Platform/MIT; gives top-layer, light-dismiss and collision handling cheaply. |

---

## 7. Options for the decision

1. **Own small module, Wikipedia-style behaviour, single level.** ~200–400 lines: Popover API card, JS positioning, Wikipedia timings, focus trigger, tap-to-preview on touch; External references from `page/summary`, our pages from a JSON index (option C). No nesting.
2. **As 1, plus Gwern-style nesting** (links inside a card open a card beside it, a stack that collapses on leave). More state, more to test on phones.
3. **Vendor Gwern's pop-frame stack.** Most features soonest, but largest code, own conventions to adopt, per-file MIT attributions to carry.
4. **No live Wikipedia calls:** curate summaries for External references into the same JSON index at build time (a script may call `page/summary` once, with a proper User-Agent, and we edit the result). No runtime dependency, rate limits or Math API risk; costs authoring time and needs CC BY-SA attribution in the card.

**Flagged recommendation (for the human to decide):** option 1 with a C-style index, and for External references take option 4's build-time route for math-heavy links (or all of them), because the Math API sunset makes live `extract_html` unreliable for exactly the links this course needs. Leave nesting (option 2) as a follow-up once the pilot shows whether readers want it. Open questions this leaves: where the index script runs (manually vs. a GitHub Action), and whether citation hover (listed under "Not yet specified" in #1) shares the same card renderer, which the Summary-shaped index would make easy.
