// Page behaviour around the figures (docs/redesign-spec.md §2, §6). app.js draws the charts; this file
//   - binds every copy of the shared toy-count strip to one state: copies carry data-for / data-click /
//     data-show and drive (and follow) the one control with that id, which is what app.js listens to;
//   - redraws the charts in a digression when it is opened (charts sized while hidden have no width);
//   - marks wide display math that doesn't fit and adds a "Scroll sideways" cue under it.
const $ = (id) => document.getElementById(id);

// ---------- one state, many strips ----------
const copies = [...document.querySelectorAll("input[data-for]")];
for (const c of copies) {
  const src = $(c.dataset.for);
  for (const k of ["min", "max", "step", "value"]) c[k] = src[k];
  c.addEventListener("input", () => {
    src.value = c.value;
    src.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function follow() {
  for (const c of copies) c.value = $(c.dataset.for).value;
  for (const o of document.querySelectorAll("[data-show]")) {
    const src = $(o.dataset.show);
    o.textContent = src.textContent;
    o.classList.toggle("warn", src.classList.contains("warn"));
  }
}
document.addEventListener("input", (e) => { if (e.target.closest?.(".toy-strip")) follow(); });
for (const b of document.querySelectorAll("button[data-click]")) {
  b.addEventListener("click", () => { $(b.dataset.click).click(); requestAnimationFrame(follow); });
}
$("c-dolphin")?.addEventListener("click", () => requestAnimationFrame(follow));
// Outputs and the status line are written by app.js: mirror every change.
const watched = new Set([...document.querySelectorAll("[data-show]")].map((o) => o.dataset.show));
const mo = new MutationObserver(follow);
for (const id of watched) if ($(id)) mo.observe($(id), { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
follow();

// ---------- digressions ----------
for (const d of document.querySelectorAll("details.a-dig")) {
  d.addEventListener("toggle", () => {
    if (!d.open) return;
    if (d.querySelector(".plot")) window.dispatchEvent(new Event("resize")); // app.js redraws every chart on resize
    window.MathJax?.typesetPromise?.([d]).catch(() => {});
  });
}

// ---------- wide math: scroll inside its box, with a cue ----------
function cues() {
  for (const e of document.querySelectorAll(".a-article .eq")) {
    if (e.offsetParent === null) continue; // hidden (e.g. the wide form on a phone)
    const wide = e.scrollWidth > e.clientWidth + 1;
    e.classList.toggle("scrolls", wide);
    let hint = e.nextElementSibling?.classList.contains("eq-hint") ? e.nextElementSibling : null;
    if (wide && !hint) {
      hint = document.createElement("p");
      hint.className = "eq-hint";
      hint.textContent = "Scroll sideways for the rest →";
      e.after(hint);
      e.addEventListener("scroll", () => e.classList.toggle("at-end", e.scrollLeft + e.clientWidth >= e.scrollWidth - 2), { passive: true });
    }
    if (hint) hint.hidden = !wide;
  }
}
const ready = () => (window.MathJax?.startup?.promise ? window.MathJax.startup.promise.then(cues) : setTimeout(ready, 100));
ready();
let t = null;
addEventListener("resize", () => { clearTimeout(t); t = setTimeout(cues, 250); });
