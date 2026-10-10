// The section pill (docs/redesign-spec.md §6, §8). Once the Reader has scrolled past the route, a pill in the
// top-left corner names the current section ("§3 The toy problem ▾") and opens the route as a sheet. The same
// at every width: under 720px the sheet rises from the bottom, wider it drops down under the pill.
// Escape or a tap outside closes the sheet and returns focus to the pill.
const route = document.getElementById("route");
if (route) {
  const ids = new Set([...route.querySelectorAll("a[href^='#']")].map((a) => a.getAttribute("href").slice(1)));
  const sections = [...document.querySelectorAll("section[id]")].filter((s) => ids.has(s.id));
  const label = (s) => ({
    num: s.querySelector(".sec-num, .kicker")?.textContent.trim(),
    title: (s.querySelector("h2")?.textContent ?? "").replace(/^\s*\d+\s*/, "").trim(),
  });

  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "sp-pill";
  pill.setAttribute("aria-haspopup", "dialog");
  pill.setAttribute("aria-expanded", "false");
  document.body.appendChild(pill);

  const sheet = document.createElement("div");
  sheet.className = "sp-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "The route through this page");
  sheet.hidden = true;
  document.body.appendChild(sheet);

  let current = null;
  const setCurrent = (s) => {
    current = s;
    const { num, title } = label(s);
    pill.innerHTML = `<span class="rt-n">§${num}</span> <span class="sp-t">${title}</span> <span aria-hidden="true">▾</span>`;
    pill.setAttribute("aria-label", `Section ${num}, ${title}. Open the route`);
  };
  setCurrent(sections[0]);
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setCurrent(e.target); }, { rootMargin: "-30% 0px -65% 0px" });
  sections.forEach((s) => io.observe(s));

  // Sit below the sticky controls bar where a page still has one.
  const bar = document.getElementById("controls");
  const place = () => {
    const past = route.getBoundingClientRect().bottom < 0;
    pill.classList.toggle("show", past);
    const b = bar && getComputedStyle(bar).position === "sticky" ? bar.getBoundingClientRect().bottom : 0;
    document.documentElement.style.setProperty("--sp-top", `${Math.max(0, b) + 12}px`);
  };
  addEventListener("scroll", place, { passive: true });
  addEventListener("resize", place);
  place();

  const close = (refocus = true) => {
    if (sheet.hidden) return;
    sheet.hidden = true;
    document.body.classList.remove("sp-dim");
    pill.setAttribute("aria-expanded", "false");
    if (refocus) pill.focus();
  };
  const open = () => {
    const copy = route.cloneNode(true);
    copy.removeAttribute("id");
    copy.querySelector(".rt-intro")?.remove();
    copy.querySelector(".rt-h")?.remove();
    for (const li of copy.querySelectorAll("li")) {
      if (li.querySelector("a")?.getAttribute("href") === `#${current?.id}`) li.classList.add("here");
    }
    sheet.innerHTML = `<div class="sp-head"><b>The route</b><button type="button" class="sp-close">Close</button></div>`;
    sheet.appendChild(copy);
    sheet.querySelector(".sp-close").onclick = () => close();
    sheet.hidden = false;
    document.body.classList.add("sp-dim");
    pill.setAttribute("aria-expanded", "true");
    (sheet.querySelector("li.here a") ?? sheet.querySelector("a"))?.focus();
  };
  pill.addEventListener("click", () => (sheet.hidden ? open() : close()));
  sheet.addEventListener("click", (e) => { if (e.target.closest("a")) close(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  document.addEventListener("click", (e) => { if (!sheet.hidden && !e.target.closest(".sp-sheet, .sp-pill")) close(false); });
}
