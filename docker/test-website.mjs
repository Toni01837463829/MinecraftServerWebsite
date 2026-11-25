// Test website for Docker: does what GitHub Pages and Supabase do for the real website.
//  * Serves the files in site/ on http://localhost:8080, with a config.js like the one GitHub writes.
//  * Passes everything under /rest/v1/ to the API container (PostgREST), like Supabase does.
//    Supabase reads the key from the "apikey" header; here it is turned into the header PostgREST needs.
// Only for testing on your own PC.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, request } from "node:http";
import { extname, join, normalize } from "node:path";

const ROOT = "site";
const PORT = 8080;
const API = new URL(process.env.API_URL || "http://api:3000");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".png": "image/png", ".txt": "text/plain; charset=utf-8",
};

// The website talks to this same address, so supabaseUrl is "" (= the page's own address).
const CONFIG = "window.SITE_CONFIG = " + JSON.stringify({
  supabaseUrl: "",
  supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
  serverName: process.env.SERVER_NAME || "",
  serverAddress: process.env.SERVER_ADDRESS || "",
}) + ";\n";

function proxy(req, res, path) {
  const headers = { ...req.headers, host: API.host };
  if (!headers.authorization && headers.apikey) headers.authorization = "Bearer " + headers.apikey;
  if (!headers.authorization) {
    // Supabase refuses requests without a key, so the test does too.
    res.writeHead(401, { "Content-Type": "application/json" }).end('{"message":"No API key found in request"}');
    return;
  }
  const forward = request({ host: API.hostname, port: API.port, method: req.method, path, headers }, answer => {
    res.writeHead(answer.statusCode, answer.headers);
    answer.pipe(res);
  });
  forward.on("error", () => {
    res.writeHead(502, { "Content-Type": "application/json" }).end('{"message":"The API container is not running yet"}');
  });
  req.pipe(forward);
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/rest/v1/")) {
    proxy(req, res, url.pathname.slice("/rest/v1".length) + url.search);
    return;
  }
  let path = decodeURIComponent(url.pathname);
  if (path === "/config.js") {
    res.writeHead(200, { "Content-Type": TYPES[".js"], "Cache-Control": "no-store" }).end(CONFIG);
    return;
  }
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error();
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(PORT, () => console.log(`Test website: http://localhost:${PORT}  (API for the plugin: http://127.0.0.1:${PORT})`));
