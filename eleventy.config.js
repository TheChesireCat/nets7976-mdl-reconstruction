// Eleventy, used conservatively: same-path HTML out, every figure file copied byte for byte,
// no template language ever run over an Article body.
import texPassthrough from "./_config/markdown-tex.js";
import { pagesCollection } from "./_config/pages.js";

export default function (eleventyConfig) {
  // .gitignore is a whitelist (`/*` then `!...`). Eleventy drops `!` lines and keeps `/*`,
  // which ignores every page (0 written), so ignores are listed here instead.
  eleventyConfig.setUseGitIgnore(false);
  for (const p of [
    "node_modules/**", "_site/**", "research/**", "spike/**", ".github/**",
    "README.md", "CONTEXT.md", "SPIKE.md",
    "week-*/!(code)/**", "week-*/*.*", // readings, slides etc. that live untracked next to code/
    "404.html", // passthrough below; it hard-codes the prefix and must stay byte for byte
  ]) eleventyConfig.ignores.add(p);

  // Figures: copied untouched, same relative paths, so import.meta.url, Workers,
  // fetch()es and cross-week imports resolve exactly as they do when serving the repo root.
  eleventyConfig.addPassthroughCopy("week-*/code/**/*.{js,css,json}");
  eleventyConfig.addPassthroughCopy("week-*/code/**/data/**");
  eleventyConfig.addPassthroughCopy("404.html");
  eleventyConfig.addPassthroughCopy(".nojekyll");

  // Markdown (Concept pages): keep \( \) and \[ \] for MathJax in the browser.
  eleventyConfig.amendLibrary("md", (md) => md.use(texPassthrough));

  // Articles + Concept pages with a slug; checks prerequisites (unknown slug or loop fails the build).
  eleventyConfig.addCollection("pages", pagesCollection);

  return {
    pathPrefix: "/nets7976-mdl-reconstruction/",
    templateFormats: ["html", "md", "11ty.js"],
    htmlTemplateEngine: false, // .html: front matter parsed, body never pre-processed
    markdownTemplateEngine: false, // .md: markdown-it only, no Liquid pass first
    dir: { input: ".", output: "_site", includes: "_includes", data: "_data" },
  };
}
