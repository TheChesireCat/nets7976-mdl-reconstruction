// Layout for an Article: supplies <head> and the header, built from front matter.
// The body (data.content) is the article's own HTML, already untouched by any engine
// (htmlTemplateEngine: false); it is only split at the marker and concatenated.
import { head, pageHeader, rootFrom } from "./parts.js";

const MARKER = "<!-- article-header -->";

export default function (data) {
  const root = rootFrom(data.page.url);
  const parts = data.content.split(MARKER);
  if (parts.length !== 2) throw new Error(`${data.page.inputPath}: expected exactly one ${MARKER}, found ${parts.length - 1}`);
  return `${head(data, root)}
<body>
${parts[0]}${pageHeader(data, root)}${parts[1]}</body>
</html>
`;
}
