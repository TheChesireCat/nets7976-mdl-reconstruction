// After the build: every internal href/src in the written HTML must resolve to a file in _site,
// and a #fragment must name an id on the target page. External links (any scheme) are not checked.
// Script bodies and comments are skipped; script src attributes are still checked.
import fs from "node:fs";
import path from "node:path";

export function checkLinks({ output, results, prefix }) {
  const root = path.resolve(output);
  const idCache = new Map();
  const idsOf = (file) => {
    if (!idCache.has(file)) {
      const html = fs.readFileSync(file, "utf8");
      idCache.set(file, new Set([...html.matchAll(/\s(?:id|name)="([^"]+)"/g)].map((m) => m[1])));
    }
    return idCache.get(file);
  };

  const errors = [];
  for (const r of results) {
    if (!r.outputPath || !r.outputPath.endsWith(".html")) continue;
    const pageFile = path.resolve(r.outputPath);
    const html = r.content.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, "$1</script>").replace(/<!--[\s\S]*?-->/g, "");
    for (const m of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
      const raw = m[2].replaceAll("&amp;", "&");
      if (raw === "" || raw === "#" || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue;
      const [beforeHash, frag] = raw.split("#");
      const pathPart = beforeHash.split("?")[0];
      let file;
      if (pathPart === "") file = pageFile;
      else if (pathPart.startsWith("/")) {
        if (!pathPart.startsWith(prefix)) { errors.push(`${r.url}: ${raw} is outside ${prefix}`); continue; }
        file = path.join(root, decodeURIComponent(pathPart.slice(prefix.length)));
      } else file = path.resolve(path.dirname(pageFile), decodeURIComponent(pathPart));
      if (pathPart.endsWith("/") || (fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, "index.html");
      if (!fs.existsSync(file)) { errors.push(`${r.url}: ${m[1]}="${raw}" points to a missing file`); continue; }
      if (frag && file.endsWith(".html") && !idsOf(file).has(decodeURIComponent(frag))) {
        errors.push(`${r.url}: ${m[1]}="${raw}" points to a missing #${frag}`);
      }
    }
  }
  if (errors.length) throw new Error(`Broken internal links (${errors.length}):\n  ${errors.join("\n  ")}`);
}
