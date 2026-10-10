// 404.html: GitHub Pages serves it for any missing path. The short-link table (/primer, /mdl, ...) is
// generated from each page's `short:` front matter, in reading order. The rest of the page is fixed text.
export const data = { permalink: "/404.html", eleventyExcludeFromCollections: true };

const HEAD = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Not found · NETS 7976</title>
  <script>
    // GitHub Pages serves this page for any missing path. Short links (/mdl, /dolphins, ...)
    // are redirected here, since Pages has no redirect config. Works at the domain root
    // or under the /<repo>/ project path.
`;
const TAIL = `    const parts = location.pathname.replace(/\\/+$/, "").split("/");
    const target = SHORT[parts.pop()];
    if (target) location.replace(parts.join("/") + "/" + target + location.search + location.hash);
  </script>
  <script src="/nets7976-mdl-reconstruction/week-3/code/viz-common/site.js"></script>
  <link rel="stylesheet" href="/nets7976-mdl-reconstruction/week-3/code/viz-common/styles.css" />
</head>
<body>
  <main class="content" style="margin: 0 auto; padding-top: 72px;">
    <h1>Page not found</h1>
    <p class="lede"><a class="inline" href="/nets7976-mdl-reconstruction/" style="color: var(--model);">Back to the walkthroughs</a></p>
  </main>
</body>
</html>
`;

export function render({ collections }) {
  const rows = collections.pages
    .filter((p) => p.data.short)
    .map((p) => `      ${p.data.short}: "${p.url.slice(1)}",\n`)
    .join("");
  return HEAD + "    const SHORT = {\n" + rows + "    };\n" + TAIL;
}
