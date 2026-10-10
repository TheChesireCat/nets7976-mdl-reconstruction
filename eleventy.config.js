// Eleventy, used conservatively (docs/redesign-spec.md §11): same-path HTML out, every figure file
// copied byte for byte, and no template language ever run over an Article body.
import { pagesCollection } from "./_config/pages.js";
import { checkLinks } from "./_config/check-links.js";

export const PATH_PREFIX = "/nets7976-mdl-reconstruction/";

export default function (eleventyConfig) {
  // .gitignore is a whitelist (`/*` then `!...`). Eleventy drops the `!` lines and keeps `/*`,
  // which would ignore every page, so the ignores are listed here instead.
  eleventyConfig.setUseGitIgnore(false);
  for (const p of [
    "node_modules/**", "_site/**", ".github/**", ".claude/**", ".playwright-mcp/**", "docs/**", "templates/**",
    "README.md", "CONTEXT.md",
    "week-*/!(code)/**", "week-*/*.*", // readings, slides etc. kept untracked next to code/
  ]) eleventyConfig.ignores.add(p);

  // Figures: copied untouched at the same relative paths, so import.meta.url, Workers,
  // fetch()es and cross-week imports resolve exactly as they do when serving the repo root.
  eleventyConfig.addPassthroughCopy("week-*/code/**/*.{js,css,json}");
  eleventyConfig.addPassthroughCopy("week-*/code/**/data/**");
  eleventyConfig.addPassthroughCopy(".nojekyll");

  // Every Article and Concept page; checks short names and the prerequisite graph.
  eleventyConfig.addCollection("pages", pagesCollection);

  // After writing _site: every internal link and asset must resolve.
  eleventyConfig.on("eleventy.after", ({ dir, results }) => checkLinks({ output: dir.output, results, prefix: PATH_PREFIX }));

  return {
    pathPrefix: PATH_PREFIX,
    templateFormats: ["html", "11ty.js"],
    htmlTemplateEngine: false, // .html: front matter parsed, body never pre-processed (required, see the spike)
    dir: { input: ".", output: "_site", includes: "_includes", data: "_data" },
  };
}
