// Layout for a Concept page: header from front matter, the Markdown body,
// then "Used in the course": every page whose prerequisites name this concept (Backlinks).
import { esc, head, pageHeader, rootFrom } from "./parts.js";

export default function (data) {
  const root = rootFrom(data.page.url);
  const users = (data.collections.pages || []).filter((p) => (p.data.prerequisites || []).includes(data.slug));
  const backlinks = users.length
    ? `
      <section class="used-in" id="used-in">
        <h2>Used in the course</h2>
        <ul>
          ${users.map((p) => `<li><a class="inline" href="${root}${p.url.slice(1)}">${esc(p.data.title)}</a>${p.data.kind === "article" ? ` <span class="muted">(Week ${esc(p.data.week)})</span>` : ""}</li>`).join("\n          ")}
        </ul>
      </section>`
    : "";
  return `${head(data, root)}
<body>
  <main class="home">
    <div class="content">
      ${pageHeader(data, root)}
      <section>
${data.content}      </section>${backlinks}
    </div>
  </main>
</body>
</html>
`;
}
