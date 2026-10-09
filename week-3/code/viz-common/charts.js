// Small SVG/canvas chart kit. Thin marks, hairline recessive axes, one tooltip.

const NS = "http://www.w3.org/2000/svg";

// The palette, read from the CSS tokens. Re-read on "themechange" (site.js), which is
// followed by "resize", so each page redraws with the new values. Read C.* when drawing,
// never into a module-level constant, or the colour will not follow the theme.
export const C = {};
export const isLight = () => document.documentElement.dataset.theme === "light";
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  Object.assign(C, {
    surface: v("--surface-1"), grid: v("--grid"), axis: v("--axis"),
    ink: v("--text-primary"), ink2: v("--text-secondary"), muted: v("--text-muted"),
    g1: v("--g1"), g2: v("--g2"), edge: v("--edge"), nonedge: v("--nonedge"),
    model: v("--model"), neutral: v("--neutral"),
  });
}
readPalette();
window.addEventListener("themechange", readPalette);

export function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export function scale(d0, d1, r0, r1) {
  const f = (x) => r0 + ((x - d0) / (d1 - d0 || 1)) * (r1 - r0);
  f.inv = (y) => d0 + ((y - r0) / (r1 - r0 || 1)) * (d1 - d0);
  return f;
}

export function niceTicks(lo, hi, count = 5) {
  const span = hi - lo || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const out = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9; t += step) out.push(+t.toFixed(10));
  return out;
}

export const fmt = (x, d = 2) =>
  Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : (+x).toFixed(d);

// ---------------------------------------------------------------------------
// Tooltip (one, shared). Values lead, labels follow. textContent only.
// ---------------------------------------------------------------------------

const tip = document.createElement("div");
tip.className = "tooltip";
tip.setAttribute("role", "status");
document.body.appendChild(tip);

export function showTip(evt, rows, title = null) {
  tip.replaceChildren();
  if (title) {
    const h = document.createElement("div");
    h.className = "tt-title";
    h.textContent = title;
    tip.appendChild(h);
  }
  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "tt-row";
    if (r.color) {
      const k = document.createElement("span");
      k.className = "tt-key";
      k.style.background = r.color;
      row.appendChild(k);
    }
    const v = document.createElement("span");
    v.className = "tt-value";
    v.textContent = r.value;
    const l = document.createElement("span");
    l.className = "tt-label";
    l.textContent = r.label;
    row.append(v, l);
    tip.appendChild(row);
  }
  tip.style.opacity = "1";
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
  tip.style.transform = `translate(${x}px, ${y}px)`;
}

export function hideTip() {
  tip.style.opacity = "0";
}

// ---------------------------------------------------------------------------
// Legend (HTML). Mirrors the mark: line key for lines, dot for dots, rect for bars.
// ---------------------------------------------------------------------------

export function legend(container, items) {
  const box = document.createElement("div");
  box.className = "legend";
  for (const it of items) {
    const row = document.createElement("span");
    row.className = "legend-item";
    const k = document.createElement("span");
    k.className = `legend-key ${it.type ?? "line"}`;
    k.style.background = it.color;
    const t = document.createElement("span");
    t.textContent = it.label;
    row.append(k, t);
    box.appendChild(row);
  }
  container.appendChild(box);
  return box;
}

// ---------------------------------------------------------------------------
// Frame: an SVG with axes, hairline grid, tick labels and axis titles.
// ---------------------------------------------------------------------------

export function frame(container, opts) {
  const {
    height = 260, margin = { t: 14, r: 18, b: 44, l: 52 },
    x, y, xTicks = 5, yTicks = 5, xFormat = (v) => fmt(v, 1), yFormat = (v) => fmt(v, 1),
  } = opts;
  const width = Math.max(260, container.clientWidth || 480);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, class: "chart" });
  container.appendChild(svg);
  const iw = width - margin.l - margin.r, ih = height - margin.t - margin.b;
  const xs = scale(x.domain[0], x.domain[1], margin.l, margin.l + iw);
  const ys = scale(y.domain[0], y.domain[1], margin.t + ih, margin.t);
  const gGrid = el("g", {}, svg);
  const yt = y.ticks ?? niceTicks(y.domain[0], y.domain[1], yTicks);
  for (const t of yt) {
    el("line", { x1: margin.l, x2: margin.l + iw, y1: ys(t), y2: ys(t), stroke: C.grid, "stroke-width": 1 }, gGrid);
    const lab = el("text", { x: margin.l - 8, y: ys(t) + 4, "text-anchor": "end", class: "tick" }, gGrid);
    lab.textContent = yFormat(t);
  }
  const xt = x.ticks ?? niceTicks(x.domain[0], x.domain[1], xTicks);
  for (const t of xt) {
    const lab = el("text", { x: xs(t), y: margin.t + ih + 18, "text-anchor": "middle", class: "tick" }, gGrid);
    lab.textContent = xFormat(t);
  }
  el("line", { x1: margin.l, x2: margin.l + iw, y1: margin.t + ih, y2: margin.t + ih, stroke: C.axis, "stroke-width": 1 }, gGrid);
  if (x.label) {
    const t = el("text", { x: margin.l + iw / 2, y: height - 6, "text-anchor": "middle", class: "axis-label" }, svg);
    t.textContent = x.label;
  }
  if (y.label) {
    const t = el("text", {
      x: 14, y: margin.t + ih / 2, "text-anchor": "middle", class: "axis-label",
      transform: `rotate(-90 14 ${margin.t + ih / 2})`,
    }, svg);
    t.textContent = y.label;
  }
  const plot = el("g", {}, svg);
  return { svg, plot, xs, ys, width, height, margin, iw, ih };
}

// Non-finite y values break the line into separate pieces.
export function path(points, xs, ys) {
  let d = "", pen = false;
  for (const [a, b] of points) {
    if (!Number.isFinite(b)) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${xs(a).toFixed(2)},${ys(b).toFixed(2)}`;
    pen = true;
  }
  return d;
}

export function line(f, points, color, extra = {}) {
  return el("path", {
    d: path(points, f.xs, f.ys), fill: "none", stroke: color, "stroke-width": 2,
    "stroke-linejoin": "round", "stroke-linecap": "round", ...extra,
  }, f.plot);
}

export function area(f, points, color, y0 = 0) {
  const top = path(points, f.xs, f.ys);
  const last = points[points.length - 1], first = points[0];
  return el("path", {
    d: `${top}L${f.xs(last[0])},${f.ys(y0)}L${f.xs(first[0])},${f.ys(y0)}Z`,
    fill: color, opacity: 0.1, stroke: "none",
  }, f.plot);
}

export function dot(f, x, y, color, r = 4.5) {
  return el("circle", { cx: f.xs(x), cy: f.ys(y), r, fill: color, stroke: C.surface, "stroke-width": 2 }, f.plot);
}

export function label(f, x, y, text, { anchor = "start", dx = 6, dy = 4, cls = "direct-label" } = {}) {
  const t = el("text", { x: f.xs(x) + dx, y: f.ys(y) + dy, "text-anchor": anchor, class: cls }, f.plot);
  t.textContent = text;
  return t;
}

// Reference line: solid, muted hairline (never dashed)
export function refLine(f, pts, color = C.axis) {
  return el("path", { d: path(pts, f.xs, f.ys), fill: "none", stroke: color, "stroke-width": 1 }, f.plot);
}

// Crosshair that snaps to the nearest x of the first series and lists all series.
export function crosshair(f, series, { xLabel = (x) => fmt(x, 3), yFmt = (v) => fmt(v, 3) } = {}) {
  const hair = el("line", {
    y1: f.margin.t, y2: f.margin.t + f.ih, stroke: C.axis, "stroke-width": 1, opacity: 0,
  }, f.svg);
  const rect = el("rect", {
    x: f.margin.l, y: f.margin.t, width: f.iw, height: f.ih, fill: "transparent",
  }, f.svg);
  const xsAll = series[0].points.map((p) => p[0]);
  rect.addEventListener("pointermove", (evt) => {
    const box = f.svg.getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * f.width;
    const xv = f.xs.inv(px);
    let k = 0, best = Infinity;
    xsAll.forEach((x, i) => { const d = Math.abs(x - xv); if (d < best) { best = d; k = i; } });
    const xk = xsAll[k];
    hair.setAttribute("x1", f.xs(xk));
    hair.setAttribute("x2", f.xs(xk));
    hair.setAttribute("opacity", 1);
    showTip(evt, series.map((s) => ({ color: s.color, value: yFmt(s.points[k]?.[1]), label: s.name })), xLabel(xk));
  });
  rect.addEventListener("pointerleave", () => { hair.setAttribute("opacity", 0); hideTip(); });
  return rect;
}

// ---------------------------------------------------------------------------
// Heatmap on canvas: n x n matrix in a given node order, with hover.
// ---------------------------------------------------------------------------

export function ramp(stops) {
  const rgb = stops.map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
  return (t) => {
    t = Math.max(0, Math.min(1, t));
    const x = t * (rgb.length - 1), i = Math.min(rgb.length - 2, Math.floor(x)), u = x - i;
    return rgb[i].map((c, k) => Math.round(c + u * (rgb[i + 1][k] - c)));
  };
}

// A sequential ramp with its own steps per theme, both starting at that theme's chart surface
// (so zero recedes into the card) and running to the strong end.
export function themedRamp(darkStops, lightStops) {
  const d = ramp(darkStops), l = ramp(lightStops);
  return (t) => (isLight() ? l : d)(t);
}
// Edge ramp: surface (no edge) to strong aqua (certain edge). One hue.
export const edgeRamp = themedRamp(
  ["#1a1a19", "#113f30", "#156b4d", "#199e70", "#4cc497", "#a6ecd0"],
  ["#fcfcfb", "#c6eedd", "#82d5b1", "#1baf7a", "#13845b", "#0a5139"],
);
// Model ramp: surface to strong violet, for quantities the method computes.
export const modelRamp = themedRamp(
  ["#1a1a19", "#2c2850", "#474090", "#6b62c6", "#9085e9", "#d2cdf8"],
  ["#fcfcfb", "#dedbf5", "#b1aae6", "#7d71cf", "#4a3aa7", "#2b2066"],
);

export function heatmap(container, { n, order, value, groups = null, size = 340, tooltip, colors = edgeRamp }) {
  const wrap = document.createElement("div");
  wrap.className = "heatmap";
  const strip = groups ? 6 : 0;
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  const total = size + strip + 2;
  canvas.width = total * dpr;
  canvas.height = total * dpr;
  canvas.style.width = `${total}px`;
  canvas.style.height = `${total}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const img = ctx.createImageData(n, n);
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      const c = colors(a === b ? 0 : value(order[a], order[b]));
      const k = 4 * (a * n + b);
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
  const off = document.createElement("canvas");
  off.width = n; off.height = n;
  off.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, strip + 2, strip + 2, size, size);
  if (groups) {
    const cell = size / n;
    for (let a = 0; a < n; a++) {
      ctx.fillStyle = groups(order[a]) ? C.g2 : C.g1;
      ctx.fillRect(0, strip + 2 + a * cell, strip, Math.ceil(cell));
      ctx.fillRect(strip + 2 + a * cell, 0, Math.ceil(cell), strip);
    }
  }
  canvas.addEventListener("pointermove", (evt) => {
    const box = canvas.getBoundingClientRect();
    const px = evt.clientX - box.left - strip - 2, py = evt.clientY - box.top - strip - 2;
    if (px < 0 || py < 0 || px >= size || py >= size) return hideTip();
    const b = Math.floor((px / size) * n), a = Math.floor((py / size) * n);
    if (a === b) return hideTip();
    showTip(evt, tooltip(order[a], order[b]), `pair ${order[a]} – ${order[b]}`);
  });
  canvas.addEventListener("pointerleave", hideTip);
  wrap.appendChild(canvas);
  container.appendChild(wrap);
  return canvas;
}

// Colour scale bar for the edge ramp
export function rampLegend(container, lo = "0", hi = "1", caption = "", colors = edgeRamp) {
  const box = document.createElement("div");
  box.className = "ramp-legend";
  const bar = document.createElement("span");
  bar.className = "ramp-bar";
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => `rgb(${colors(t).join(",")})`);
  bar.style.background = `linear-gradient(90deg, ${stops.join(",")})`;
  const a = document.createElement("span"); a.textContent = lo;
  const b = document.createElement("span"); b.textContent = hi;
  const c = document.createElement("span"); c.className = "ramp-caption"; c.textContent = caption;
  box.append(a, bar, b, c);
  container.appendChild(box);
}

// ---------------------------------------------------------------------------
// Stat tiles
// ---------------------------------------------------------------------------

export function tiles(container, items) {
  const row = document.createElement("div");
  row.className = "tiles";
  for (const it of items) {
    const t = document.createElement("div");
    t.className = "tile";
    const l = document.createElement("div"); l.className = "tile-label"; l.textContent = it.label;
    const v = document.createElement("div"); v.className = "tile-value"; v.textContent = it.value;
    t.append(l, v);
    if (it.note) { const n = document.createElement("div"); n.className = "tile-note"; n.textContent = it.note; t.appendChild(n); }
    row.appendChild(t);
  }
  container.appendChild(row);
  return row;
}
