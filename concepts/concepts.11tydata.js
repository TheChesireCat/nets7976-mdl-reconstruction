// Every page under concepts/ is a Concept page: its slug is its folder name.
export default {
  kind: "concept",
  layout: "concept.11ty.js",
  eleventyComputed: { slug: (data) => data.page.fileSlug },
};
