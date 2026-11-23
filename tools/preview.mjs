#!/usr/bin/env node
// Build the gallery as one self-contained HTML file, so judging an effect doesn't need a server:
//
//   node tools/preview.mjs                        pixelfx-preview.html, then open it
//   node tools/preview.mjs --against=5294518      also bake in a version to compare beside
//   node tools/preview.mjs --no-open              build only
//
// Everything is inlined: src/ becomes one script, the page and its styles are part of the file, and the effects are
// still the real modules, so the file plays at your display's rate exactly like the served gallery does. Nothing is
// fetched, so it opens straight from disk with no localhost, no CORS and no ports.
//
// With --against, the old version is baked in as well, bundled in its own pass so it carries its own src/core. That
// is what makes a comparison honest: the two halves are separate module graphs, not one graph drawn twice.
//
// The file is a snapshot of src/ as it was when this ran. It prints the time and a hash of what went into it, so a
// stale preview is obvious; rebuilding takes well under a second, so re-run it after each edit.

import { build } from "esbuild";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { ROOT } from "./lib/fxlib.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};
const AGAINST = opt("against", null);
const OUT = opt("out", join(ROOT, "pixelfx-preview.html"));
const open = !opt("no-open", false);

const SRC = join(ROOT, "src");

// ---- files from a git commit, for the baseline half
function gitShow(ref, path) {
  const r = spawnSync("git", ["show", `${ref}:${path}`], { cwd: ROOT, maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout : null;
}
function gitResolve(ref) {
  const r = spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}
function gitList(ref, dir) {
  const r = spawnSync("git", ["ls-tree", "-r", "--name-only", ref, "--", dir], { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout.split("\n").filter(Boolean) : [];
}

/**
 * The baseline's src/ as it was, written to a temp dir so esbuild can bundle it normally. Only files that exist at
 * that commit are written, so an effect added later simply isn't in the registry and the gallery reports it missing
 * the same way the server does.
 */
async function materialize(ref) {
  const dir = await mkdtemp(join(tmpdir(), "pixelfx-baseline-"));
  const files = gitList(ref, "src");
  for (const f of files) {
    const body = gitShow(ref, f);
    if (!body) continue;
    const dest = join(dir, f);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, body);
  }
  return { dir, files };
}

// every effect id the baseline had, read from its src/fx/index.js (`effects` is `{ "cat/name": module }`)
function effectIds(from) {
  const text = gitShow(from, "src/fx/index.js")?.toString("utf8");
  if (!text) throw new Error(`no src/fx/index.js in ${from}`);
  const block = text.slice(text.indexOf("export const effects")).split("};")[0];
  return [...new Set([...block.matchAll(/["']([a-z0-9]+\/[a-z0-9-]+)["']\s*:/g)].map((m) => m[1]))];
}

async function main() {
  const t0 = Date.now();
  const html = await readFile(join(ROOT, "gallery/index.html"), "utf8");
  const css = await readFile(join(ROOT, "gallery/style.css"), "utf8");

  // the gallery itself, with every import of src/ followed and inlined. Identifier mangling is deliberately off:
  // esbuild's minifier mis-renames a helper shared between the backdrops and several effects' palette caches, which
  // crashed the detail view with "a.join is not a function". Whitespace and syntax minification are safe and carry
  // most of the size, so the cost of leaving names alone is a few hundred kB.
  const minified = { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false };
  const app = await build({
    entryPoints: [join(ROOT, "gallery/app.js")],
    bundle: true,
    format: "iife",
    write: false,
    logLevel: "silent",
    absWorkingDir: ROOT,
    ...minified,
  });

  // the baseline, bundled on its own so it keeps its own copy of src/core
  let baseline = "null", baselineHash = null;
  if (AGAINST) {
    baselineHash = gitResolve(AGAINST);
    if (!baselineHash) throw new Error(`${AGAINST} is not a commit, branch or tag in this repo`);
    const { dir } = await materialize(baselineHash);
    try {
      const ids = effectIds(baselineHash);
      // one tiny entry that re-exports each effect, so esbuild gives us the whole set in one bundle. Static imports,
      // so everything is resolved now: a baked registry has nothing left to fetch when the page opens.
      const imports = ids.map((id, i) => `import * as e${i} from ${JSON.stringify(`./${id}.js`)};`).join("\n");
      const entries = ids.map((id, i) => `["${id}"]: e${i},`).join("\n");
      await writeFile(join(dir, "src/fx/__registry.js"), `${imports}\nexport const effects = {\n${entries}\n};\n`);
      const built = await build({
        entryPoints: [join(dir, "src/fx/__registry.js")],
        bundle: true,
        format: "iife",
        globalName: "__PIXELFX_BASELINE_REGISTRY",
        write: false,
        logLevel: "silent",
        absWorkingDir: dir,
        ...minified,
      });
      // the bundle defines a global holding the effects; lift it into the shape the gallery reads
      baseline = `(() => {\n${built.outputFiles[0].text}\nreturn { "${baselineHash}": __PIXELFX_BASELINE_REGISTRY.effects };\n})()`;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // the local display font becomes a data URI; the page's other two fonts have system fallbacks, so the remote
  // stylesheet is dropped and the file needs no network at all
  let fontCSS = css;
  try {
    const b64 = (await readFile(join(ROOT, "gallery/fonts/PatchPixel-Regular.woff2"))).toString("base64");
    fontCSS = css.replace(/url\(\s*["']?fonts\/PatchPixel-Regular\.woff2["']?\s*\)/g, `url(data:font/woff2;base64,${b64})`);
  } catch { /* the font is optional: the stack falls back to monospace */ }

  const srcHash = createHash("sha1");
  for (const f of spawnSync("git", ["ls-files", "-co", "--exclude-standard", "src", "gallery"], { cwd: ROOT, encoding: "utf8" }).stdout.split("\n").filter(Boolean).sort()) {
    srcHash.update(f).update(gitShow("HEAD", f) ?? "").update(await readFile(join(ROOT, f), "utf8").catch(() => ""));
  }
  const stamp = { built: new Date().toISOString(), hash: srcHash.digest("hex").slice(0, 8), against: baselineHash?.slice(0, 8) ?? null };

  // inline the stylesheet where the local <link> was, drop every remote font link, drop the module <script> (the
  // bundle below replaces it), and add the bundle
  const styleTag = `<style>\n${fontCSS}\n</style>`;
  let page = html
    .replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\s*/gi, "")
    .replace(/<link[^>]*href="style\.css"[^>]*>/i, styleTag)
    .replace(/<script[^>]*src="app\.js"[^>]*>\s*<\/script>\s*/i, "");
  const scripts = `<script>window.PIXELFX_BUILD=${JSON.stringify(stamp)};window.PIXELFX_BASELINE=${baseline};</script>\n<script>${app.outputFiles[0].text}</script>\n</body>`;
  page = page.replace(/<\/body>/i, scripts);

  await writeFile(OUT, page);
  const kb = Math.round(Buffer.byteLength(page) / 1024);
  const ms = Date.now() - t0;
  const rel = relative(process.cwd(), OUT) || OUT;
  console.log(`${rel}  ${kb} kB  built in ${ms}ms`);
  console.log(`  src ${stamp.hash} at ${stamp.built}${stamp.against ? `  vs ${stamp.against}` : ""}`);

  if (open) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    const r = spawnSync(opener, [OUT], { stdio: "ignore" });
    if (r.error || r.status !== 0) console.log(`  open it yourself: ${OUT}`);
  }
}

main().catch((e) => {
  console.error(`preview: ${e.message}`);
  process.exit(1);
});
