// Layout for an Article whose front matter says `layout: article.11ty.js` (docs/redesign-spec.md §3, §8).
// The article stays a whole hand-written HTML document; this fills its markers and adds the shell:
//   <!-- article-header -->  title, lede, byline, Before you start, shortcut line
//   <!-- route -->           the route, from `route:` in front matter
//   <!-- strip -->           one per routed section, under its heading
//   <!-- pager -->           previous / next article
// plus the slim header after <body>, the footer before </body>, and the shell's CSS and pill script.
// A missing marker, a routed section with no strip marker, or a strip marker outside the route fails the build.
import { rootFrom } from "./parts.js";
import { siteHeader, siteFooter, articleHeader, route, strip, routeSteps, pager } from "./shell.js";

export default function (data) {
  const root = rootFrom(data.page.url);
  const where = data.page.inputPath;
  let html = data.content;
  const need = (marker) => { if (!html.includes(marker)) throw new Error(`${where}: missing ${marker}`); };
  ["<!-- article-header -->", "<!-- route -->", "<!-- pager -->", "</head>", "</body>"].forEach(need);

  html = html.replace("</head>", `  <link rel="stylesheet" href="${root}week-3/code/viz-common/pages.css" />
  <script type="module" src="${root}week-3/code/viz-common/pill.js"></script>
</head>`);
  html = html.replace(/<body([^>]*)>/, (m) => `${m}\n${siteHeader(root)}`);
  html = html.replace("</body>", `${siteFooter()}\n</body>`);
  html = html.replace(/<main(?![^>]*\bid=)([^>]*)>/, `<main id="main"$1>`);
  html = html.replace("<!-- article-header -->", articleHeader(data));
  html = html.replace("<!-- route -->", route(data));
  html = html.replace("<!-- pager -->", pager(data, data.collections.pages ?? []));

  // Strips: each routed section has exactly one <!-- strip --> marker.
  const ids = new Set(routeSteps(data).map((s) => s.id));
  const seen = new Set();
  html = html.replace(/(<section\b[^>]*\bid="([^"]+)"[^>]*>)([\s\S]*?)(?=<section\b|<\/main>)/g, (all, open, id, body) => {
    if (!body.includes("<!-- strip -->")) return all;
    if (!ids.has(id)) throw new Error(`${where}: section #${id} has a strip marker but no route step`);
    seen.add(id);
    return open + body.replace("<!-- strip -->", strip(data, id));
  });
  for (const id of ids) if (!seen.has(id)) throw new Error(`${where}: route step "${id}" has no <!-- strip --> in its section`);
  return html;
}
