// PROTOTYPE (throwaway): three phone strategies for prototype-phone.html, chosen with ?variant=A|B|C.
// Runs before MathJax typesets the page. Everything here only matters below 720px wide.
//   A  Inline: controls stay at the top of their figure; wide tables and equations scroll sideways, with a cue.
//   B  In reach: controls stick to the top of their figure while it's on screen; the table becomes cards;
//      annotated equations reflow into rows with their notes underneath; a section pill opens the route; notes open on tap.
//   C  Sheets: an "Adjust" button opens the figure's controls in a bottom sheet; the table shows one column at a time;
//      wide equations shrink to fit; a thin top bar names the current section and opens the route.
(() => {
  const KEYS = ["A", "B", "C"];
  const NAMES = { A: "Inline", B: "In reach", C: "Sheets" };
  const q = new URLSearchParams(location.search);
  let v = (q.get("variant") || "A").toUpperCase();
  if (!KEYS.includes(v)) v = "A";
  document.body.classList.add(`ph-${v}`);
  const phone = () => innerWidth <= 720;
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---------- which section is on screen (B's pill, C's bar) ----------
  const titles = Object.fromEntries($$("section").map((s) => [s.id, s.querySelector("h2").textContent.replace(/^\d+/, "").trim()]));
  const nums = Object.fromEntries($$("section").map((s) => [s.id, s.querySelector(".kicker")?.textContent]));
  let current = null;
  const onSection = [];
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { current = e.target.id; onSection.forEach((f) => f(current)); }
  }, { rootMargin: "-30% 0px -65% 0px" });

  // ---------- a bottom sheet holding the route (B and C) ----------
  function routeSheet() {
    const sheet = document.createElement("div");
    sheet.className = "ph-sheet ph-route-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "The route through this page");
    sheet.innerHTML = `<div class="ph-sheet-head"><b>The route</b><button type="button" class="ph-done">Close</button></div>`;
    const list = document.getElementById("route").cloneNode(true);
    list.removeAttribute("id");
    list.querySelector(".rt-intro")?.remove();
    list.querySelector(".rt-h")?.remove();
    sheet.appendChild(list);
    const close = () => { sheet.classList.remove("open"); document.body.classList.remove("ph-dim"); };
    sheet.querySelector(".ph-done").onclick = close;
    sheet.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
    document.body.appendChild(sheet);
    return { open: () => { sheet.classList.add("open"); document.body.classList.add("ph-dim"); window.MathJax?.typesetPromise?.([sheet]); }, close };
  }

  document.addEventListener("DOMContentLoaded", () => {
    $$("section").forEach((s) => io.observe(s));

    if (v === "B") {
      // table rows become cards: each cell carries its column name
      $$(".tbl table").forEach((t) => {
        const heads = $$("thead th", t).map((th) => th.textContent);
        $$("tbody tr", t).forEach((tr) => $$("td", tr).forEach((td, k) => { if (k) td.dataset.label = heads[k]; }));
      });
      // notes open on tap
      $$(".sn-mark").forEach((m) => {
        m.setAttribute("role", "button"); m.tabIndex = 0; m.setAttribute("aria-expanded", "false");
        const note = m.nextElementSibling;
        const toggle = () => { const o = note.classList.toggle("open"); m.setAttribute("aria-expanded", String(o)); };
        m.addEventListener("click", toggle);
        m.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      });
      // the section pill
      const sheet = routeSheet();
      const pill = document.createElement("button");
      pill.type = "button"; pill.className = "ph-pill";
      pill.onclick = sheet.open;
      document.body.appendChild(pill);
      const routeEl = document.getElementById("route");
      const upd = () => {
        const past = routeEl.getBoundingClientRect().bottom < 0;
        pill.classList.toggle("show", past && phone());
        if (current) pill.innerHTML = `<span class="rt-n">§${nums[current]}</span> ${titles[current]} <span aria-hidden="true">▾</span>`;
      };
      addEventListener("scroll", upd, { passive: true });
      onSection.push(upd);
    }

    if (v === "C") {
      // controls behind an Adjust button, in a sheet
      $$("figure .a-figctl").forEach((ctl) => {
        const fig = ctl.closest("figure");
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "ph-adjust";
        const summary = () => {
          const vals = $$("label.ctl", ctl).map((l) => `${l.firstChild.textContent.trim()} ${l.querySelector("output")?.textContent ?? ""}`).join(", ");
          btn.innerHTML = `<span>Adjust</span><small>${vals}</small>`;
        };
        const sheet = document.createElement("div");
        sheet.className = "ph-sheet ph-ctl-sheet";
        sheet.innerHTML = `<div class="ph-sheet-head"><b>${fig.querySelector("figcaption b")?.textContent ?? "Controls"}</b><button type="button" class="ph-done">Done</button></div>`;
        document.body.appendChild(sheet);
        const home = document.createComment("controls");
        ctl.before(home);
        const open = () => {
          sheet.appendChild(ctl); sheet.classList.add("open");
          // keep the chart in view above the sheet
          const r = fig.getBoundingClientRect();
          scrollBy({ top: r.top - 56, behavior: "instant" });
        };
        const close = () => { home.after(ctl); sheet.classList.remove("open"); summary(); };
        btn.onclick = open;
        sheet.querySelector(".ph-done").onclick = close;
        home.after(btn);
        setTimeout(summary, 300);
        ctl.addEventListener("input", () => setTimeout(summary));
      });
      // the table shows one column at a time
      $$(".tbl").forEach((tb) => {
        const heads = $$("thead th", tb).slice(1).map((th) => th.textContent);
        const seg = document.createElement("div");
        seg.className = "ph-seg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Column to show");
        seg.innerHTML = heads.map((h, k) => `<button type="button" data-col="${k + 2}" aria-pressed="${k === 0}">${h}</button>`).join("");
        tb.dataset.col = "2";
        seg.onclick = (e) => {
          const b = e.target.closest("button"); if (!b) return;
          tb.dataset.col = b.dataset.col;
          $$("button", seg).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        };
        tb.before(seg);
      });
      // the top bar
      const sheet = routeSheet();
      const bar = document.createElement("button");
      bar.type = "button"; bar.className = "ph-topbar";
      bar.onclick = sheet.open;
      document.body.appendChild(bar);
      const routeEl = document.getElementById("route");
      const upd = () => {
        bar.classList.toggle("show", routeEl.getBoundingClientRect().bottom < 0 && phone());
        const h = document.documentElement;
        bar.style.setProperty("--progress", `${(100 * h.scrollTop) / (h.scrollHeight - innerHeight)}%`);
        if (current) bar.innerHTML = `<span class="rt-n">§${nums[current]}</span> <span class="ph-t">${titles[current]}</span> <span class="ph-c">Contents ▾</span>`;
      };
      addEventListener("scroll", upd, { passive: true });
      onSection.push(upd);
    }

    // after MathJax: A marks what scrolls; C shrinks wide equations to fit
    const after = () => {
      $$(".eq-wide, .tbl").forEach((e) => e.classList.toggle("scrolls", e.scrollWidth > e.clientWidth + 1));
      if (v === "A") $$(".eq-wide, .tbl").forEach((e) => {
        if (!e.classList.contains("scrolls") || e.nextElementSibling?.classList.contains("ph-hint")) return;
        const h = document.createElement("p");
        h.className = "ph-hint"; h.textContent = "Scroll sideways for the rest →";
        e.after(h);
        e.addEventListener("scroll", () => e.classList.toggle("at-end", e.scrollLeft + e.clientWidth >= e.scrollWidth - 2), { passive: true });
      });
      if (v === "C") $$(".eq-wide").forEach((e) => {
        const m = e.querySelector("mjx-container");
        if (!m) return;
        m.style.fontSize = "";
        if (!phone()) return;
        const k = e.clientWidth / m.scrollWidth;
        if (k < 1) m.style.fontSize = `${Math.max(0.62, k * 0.98) * 100}%`;
        e.classList.toggle("scrolls", e.scrollWidth > e.clientWidth + 1);
      });
    };
    const wait = () => (window.MathJax?.startup?.promise ? window.MathJax.startup.promise.then(after) : setTimeout(wait, 100));
    wait();
    let t = null;
    addEventListener("resize", () => { clearTimeout(t); t = setTimeout(after, 250); });
  });

  // ---------- prototype switcher ----------
  const go = (d) => { q.set("variant", KEYS[(KEYS.indexOf(v) + d + 3) % 3]); location.search = q.toString(); };
  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.className = "proto-bar";
    bar.innerHTML = `<button type="button" aria-label="Previous variant">←</button><span class="proto-label"><small>Prototype</small>${v}, ${NAMES[v]}</span><button type="button" aria-label="Next variant">→</button>`;
    const [prev, next] = bar.querySelectorAll("button");
    prev.onclick = () => go(-1);
    next.onclick = () => go(1);
    document.body.appendChild(bar);
  });
  addEventListener("keydown", (e) => {
    const t = document.activeElement;
    if (t && (t.matches("input, textarea, select") || t.isContentEditable)) return;
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });
})();
