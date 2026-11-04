// A small static file server for the repository folder, used by the tests (and handy for playing locally with
// the full soundtrack: `npm start`, then open http://127.0.0.1:4173). No dependencies.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, rel);
  // never serve anything outside the repository folder, or its node_modules and git data
  if (!file.startsWith(ROOT + path.sep) || /[\\/](node_modules|\.git)([\\/]|$)/.test(file.slice(ROOT.length))) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // like GitHub Pages: unknown paths get the 404 page
      fs.readFile(path.join(ROOT, "404.html"), (e, body) => {
        res.writeHead(404, { "content-type": TYPES[".html"] });
        res.end(e ? "Not found" : body);
      });
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "content-length": st.size,
      "cache-control": "no-store",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`White Isle Drive on http://127.0.0.1:${PORT}/`));
