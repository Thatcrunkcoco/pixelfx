#!/usr/bin/env node
// Serve the repo so the gallery can load the effects as modules: node tools/serve.mjs [port]
// then open http://localhost:8080/gallery/
//
// For a side-by-side comparison with an older version, add ?against=<commit> to the gallery URL. Modules under
// /baseline/<commit>/ then come from that commit in git, not from the working tree, so nothing has to be stashed,
// checked out or copied. See the A/B section of the gallery's README.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, extname, normalize, sep } from "node:path";
import { ROOT } from "./lib/fxlib.mjs";

const PORT = +(process.argv[2] ?? process.env.PORT ?? 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".md": "text/plain; charset=utf-8", ".mp4": "video/mp4",
};

// ---- files from a git commit, for the baseline side of a comparison
const gitCache = new Map();
function gitShow(ref, path) {
  const key = `${ref}:${path}`;
  if (gitCache.has(key)) return gitCache.get(key);
  const r = spawnSync("git", ["show", `${ref}:${path}`], { cwd: ROOT, maxBuffer: 64 << 20 });
  const val = r.status === 0 ? r.stdout : null;
  gitCache.set(key, val);
  return val;
}

/**
 * A module from a commit, with every relative import inside src/ rewritten to stay on the baseline route and to
 * carry the commit, so ES modules never hand the current tree's instance to an old effect. Without the suffix the
 * two halves of a comparison would share src/core and the old version would silently run today's code.
 */
function baselineModule(ref, text, path) {
  const base = `/baseline/${encodeURIComponent(ref)}/`;
  return text.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"']+)\2/g, (m, lead, q, spec) => {
    if (!spec.endsWith(".js")) return m; // a bare package import is not part of the tree
    const resolved = normalize(join(path, "..", spec)).split(sep).join("/");
    return `${lead}${q}${base}${resolved}?v=${encodeURIComponent(ref)}${q}`;
  });
}

function serveBaseline(ref, path, res) {
  // only JavaScript inside src/ is ever served this way: it is code from a commit, not arbitrary files
  if (!/^src\/[A-Za-z0-9/_.-]+\.js$/.test(path) || path.includes("..")) return res.writeHead(404).end("not found");
  const body = gitShow(ref, path);
  if (!body) return res.writeHead(404).end(`${ref} has no ${path}`);
  res.writeHead(200, { "content-type": TYPES[".js"], "cache-control": "no-store" }).end(baselineModule(ref, body.toString("utf8"), path));
}

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);

  // /baseline/<ref>/src/...: a module from a commit
  const m = path.match(/^\/baseline\/([^/]+)\/(.+)$/);
  if (m) return serveBaseline(m[1], m[2], res);

  if (path === "/") return res.writeHead(302, { location: "/gallery/" }).end();
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`gallery: http://localhost:${PORT}/gallery/\n  compare with a commit: http://localhost:${PORT}/gallery/?against=<commit>`));
