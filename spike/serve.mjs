// Tiny static server that imitates GitHub Pages for a project site:
// files are served under PREFIX only, directories get index.html (with a trailing-slash redirect),
// and anything missing gets 404.html with status 404.
// usage: node spike/serve.mjs [root=_site] [port=8790]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || "_site");
const PORT = Number(process.argv[3] || 8790);
const PREFIX = "/nets7976-mdl-reconstruction/";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
};

function send(res, status, file) {
  res.writeHead(status, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const pathname = decodeURIComponent(url.pathname);
  const notFound = () => send(res, 404, path.join(ROOT, "404.html"));
  if (!pathname.startsWith(PREFIX) && pathname !== PREFIX.slice(0, -1)) return notFound();
  if (pathname === PREFIX.slice(0, -1)) { res.writeHead(301, { location: PREFIX + url.search }); return res.end(); }
  const file = path.join(ROOT, pathname.slice(PREFIX.length));
  if (!file.startsWith(ROOT)) return notFound();
  let st;
  try { st = fs.statSync(file); } catch { return notFound(); }
  if (st.isDirectory()) {
    if (!pathname.endsWith("/")) { res.writeHead(301, { location: pathname + "/" + url.search }); return res.end(); }
    const index = path.join(file, "index.html");
    return fs.existsSync(index) ? send(res, 200, index) : notFound();
  }
  send(res, 200, file);
}).listen(PORT, "127.0.0.1", () => console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}${PREFIX}`));
