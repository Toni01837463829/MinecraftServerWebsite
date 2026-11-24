// Test website for Docker: does what GitHub does for the real website.
// Every UPDATE_SECONDS it runs scripts/export.mjs (reads the database, writes _site/), and it serves
// _site/ on http://localhost:8080 like GitHub Pages. Only for testing on your own PC.

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const ROOT = "_site";
const PORT = 8080;
const EVERY = Math.max(5, Number(process.env.UPDATE_SECONDS || 30)) * 1000;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".png": "image/png", ".txt": "text/plain; charset=utf-8",
};

function update() {
  return new Promise(resolve => {
    const run = spawn(process.execPath, ["scripts/export.mjs"], { stdio: "inherit" });
    run.on("exit", resolve);
  });
}

async function loop() {
  await update();
  setTimeout(loop, EVERY);
}

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
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
}).listen(PORT, () => console.log(`Test website: http://localhost:${PORT} (updates every ${EVERY / 1000} s)`));

loop();
