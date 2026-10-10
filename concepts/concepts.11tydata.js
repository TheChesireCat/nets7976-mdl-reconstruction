// Every page under concepts/<slug>/ is a Concept page: its slug is its folder name.
export default {
  kind: "concept",
  layout: "concept.11ty.js",
  eleventyComputed: { slug: (data) => (data.kind === "concept" ? data.page.fileSlug : undefined) },
};
