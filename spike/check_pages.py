"""Headless check of every page of the site as served under the Pages project prefix.

usage: python spike/check_pages.py [base=http://127.0.0.1:8790/nets7976-mdl-reconstruction/] [shots_dir]

Per page: console errors, uncaught page errors, failed or >=400 requests, MathJax containers
and mjx-merror count, Workers created and messages received back from them, #status text.
Then the 404.html short links. Exit status 1 if anything is wrong.
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/nets7976-mdl-reconstruction/"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
PAGES = [
    "",
    "week-3/code/martin-viz/",
    "week-3/code/newman-viz/",
    "week-4/code/bayes-primer-viz/",
    "week-4/code/young-viz/",
    "week-5/code/peixoto-viz/",
]
# extra pages, comma-separated, e.g. concepts/markov-chain-monte-carlo/
EXTRA = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else []
SHORT = {
    "martin": "week-3/code/martin-viz/",
    "newman": "week-3/code/newman-viz/",
    "primer": "week-4/code/bayes-primer-viz/",
    "dolphins": "week-4/code/young-viz/",
    "mdl": "week-5/code/peixoto-viz/",
}

# Test harness only (not site code): count Workers and the messages they post back.
INSTRUMENT = """
window.__workers = []; window.__workerMsgs = 0; window.__workerErrors = [];
const W = window.Worker;
window.Worker = class extends W {
  constructor(url, opts) {
    super(url, opts);
    window.__workers.push(String(url));
    this.addEventListener('message', () => { window.__workerMsgs++; window.__lastWorkerMsg = performance.now(); });
    this.addEventListener('error', (e) => window.__workerErrors.push(e.message || 'error'));
  }
};
"""

STATE = """async () => {
  if (window.MathJax && MathJax.startup && MathJax.startup.promise) { try { await MathJax.startup.promise; } catch (e) {} }
  const svgs = [...document.querySelectorAll('svg')].filter(s => s.querySelectorAll('*').length > 5 && !s.closest('button'));
  return {
    title: document.title,
    mathjax: !!(window.MathJax && MathJax.version),
    mjxContainers: document.querySelectorAll('mjx-container').length,
    mjxErrors: [...document.querySelectorAll('mjx-merror')].map(e => e.getAttribute('data-mjx-error') || e.textContent).slice(0, 5),
    rawTeXLeft: (document.body.innerText.match(/\\\\\\(|\\\\\\[/g) || []).length,
    workers: window.__workers, workerMsgs: window.__workerMsgs, workerErrors: window.__workerErrors,
    busy: document.querySelectorAll('.busy').length,
    status: document.getElementById('status')?.textContent || null,
    drawnSvgs: svgs.length, canvases: document.querySelectorAll('canvas').length,
    sinceLastWorkerMsg: window.__lastWorkerMsg ? performance.now() - window.__lastWorkerMsg : null,
  };
}"""


def check(page, url, expect_404=False):
    errors, failed = [], []
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("requestfailed", lambda r: failed.append(f"FAILED {r.url} {r.failure}"))
    page.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 and not (expect_404 and r.url == url) else None)
    page.goto(url, wait_until="load")
    page.wait_for_load_state("networkidle")
    # let workers settle: wait until no worker message for 3 s (max 90 s)
    t0 = time.time()
    while time.time() - t0 < 90:
        s = page.evaluate(STATE)
        if not s["workers"] or (s["sinceLastWorkerMsg"] is not None and s["sinceLastWorkerMsg"] > 3000 and s["busy"] == 0):
            break
        page.wait_for_timeout(500)
    s = page.evaluate(STATE)
    s.update(final_url=page.url, errors=errors, failed=failed, settle_s=round(time.time() - t0, 1))
    return s


def main():
    bad = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for rel in PAGES + EXTRA:
            ctx = browser.new_context(viewport={"width": 1400, "height": 900})
            ctx.add_init_script(INSTRUMENT)
            page = ctx.new_page()
            s = check(page, BASE + rel)
            ok = not s["errors"] and not s["failed"] and not s["mjxErrors"] and s["mathjax"] and (not s["workers"] or (s["workerMsgs"] > 0 and not s["workerErrors"]))
            bad += not ok
            print(("OK  " if ok else "BAD ") + "/" + rel, json.dumps({k: s[k] for k in s if k != "sinceLastWorkerMsg"}, ensure_ascii=False))
            if SHOTS:
                page.screenshot(path=f"{SHOTS}/{(rel.strip('/') or 'index').replace('/', '_')}.png", full_page=False)
            ctx.close()
        for short, target in SHORT.items():
            ctx = browser.new_context()
            page = ctx.new_page()
            page.goto(BASE + short, wait_until="load")
            page.wait_for_url(BASE + target, timeout=10000)
            ok = page.url == BASE + target and page.evaluate("document.title") != "Not found · NETS 7976"
            bad += not ok
            print(("OK  " if ok else "BAD ") + f"short link /{short} -> {page.url}")
            ctx.close()
        browser.close()
    print("ALL OK" if not bad else f"{bad} problem(s)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
