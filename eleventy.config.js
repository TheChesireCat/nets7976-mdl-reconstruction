// Eleventy, used conservatively (docs/redesign-spec.md §11): same-path HTML out, every figure file
// copied byte for byte, and no template language ever run over an Article body.
import { pagesCollection } from "./_config/pages.js";
import { checkLinks } from "./_config/check-links.js";
import { linkPass } from "./_config/links.js";
import texPassthrough from "./_config/markdown-tex.js";

export const PATH_PREFIX = "/nets7976-mdl-reconstruction/";

export default function (eleventyConfig) {
  // .gitignore is a whitelist (`/*` then `!...`). Eleventy drops the `!` lines and keeps `/*`,
  // which would ignore every page, so the ignores are listed here instead.
  eleventyConfig.setUseGitIgnore(false);
  for (const p of [
    "node_modules/**", "_site/**", ".github/**", ".claude/**", ".playwright-mcp/**", "docs/**", "templates/**",
    "scripts/**", "data/**", "README.md", "CONTEXT.md",
    "week-*/!(code)/**", "week-*/*.*", // readings, slides etc. kept untracked next to code/
  ]) eleventyConfig.ignores.add(p);

  // Figures: copied untouched at the same relative paths, so import.meta.url, Workers,
  // fetch()es and cross-week imports resolve exactly as they do when serving the repo root.
  eleventyConfig.addPassthroughCopy("week-*/code/**/*.{js,css,json}");
  eleventyConfig.addPassthroughCopy("week-*/code/**/data/**");
  eleventyConfig.addPassthroughCopy(".nojekyll");

  // Concept pages are Markdown: keep \( \) and \[ \] for MathJax in the browser.
  eleventyConfig.amendLibrary("md", (md) => md.use(texPassthrough));

  // Every Article and Concept page; checks short names and the prerequisite graph.
  eleventyConfig.addCollection("pages", pagesCollection);

  // data-pv links and <cite data-ref> get their href, class and text; the References section is generated.
  eleventyConfig.addTransform("links", linkPass);

  // After writing _site: every internal link and asset must resolve.
  eleventyConfig.on("eleventy.after", ({ dir, results }) => checkLinks({ output: dir.output, results, prefix: PATH_PREFIX }));

  return {
    pathPrefix: PATH_PREFIX,
    templateFormats: ["html", "md", "11ty.js"],
    htmlTemplateEngine: false, // .html: front matter parsed, body never pre-processed (required, see the spike)
    markdownTemplateEngine: false, // .md: markdown-it only, no Liquid pass first
    dir: { input: ".", output: "_site", includes: "_includes", data: "_data" },
  };
}
