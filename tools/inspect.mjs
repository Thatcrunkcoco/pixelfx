#!/usr/bin/env node
// See an animation the way you should judge it: every frame, flat background, labelled, at 1x and zoomed, on
// transparency, with the frame-to-frame pixel change printed. Judging smoothness by eye on a contact sheet or a
// dithery backdrop is how a stiff animation gets shipped; the numbers make the timing profile obvious.
//
//   node tools/inspect.mjs critters/bird              records/critters/bird/inspect/
//   node tools/inspect.mjs critters/bird --zoom 8      every frame at 8x
//   node tools/inspect.mjs "critters/*"                a whole category
//
// Writes <out>/strip-1x.png (every frame, small), <out>/strip-zoom.png (every frame, big), <out>/clear.png
// (transparent frames on a checker), and prints per-frame change: "held" frames, "jumps", and the seam.
//
// Options: --zoom N --step N (frames between strips) --bg KIND --out DIR --fps N --seed N --opts JSON
//          --no-actor --cols N --flat COLOR (strip background, default #202030)

import { join } from "node:path";
import { ROOT, resolveIds, loadEffect, renderFrames, canvas, save } from "./lib/fxlib.mjs";

const args = process.argv.slice(2), flags = {}, ids = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith("--")) ids.push(a);
  else if (a === "--no-actor") flags["no-actor"] = true;
  else flags[a.slice(2)] = args[++i];
}
if (!ids.length) {
  console.error("usage: node tools/inspect.mjs <id|category|pattern>... [--zoom N] [--step N] [--bg KIND] [--out DIR]");
  process.exit(1);
}

const out = flags.out ?? join(ROOT, "records");
const flat = hexColor(flags.flat ?? "#202030");

function hexColor(s) {
  const h = s.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
}

// how much a frame changed vs the one before: pixels that differ at all, and the mean distance moved
function delta(a, b, w, h) {
  let changed = 0, sum = 0, maxd = 0;
  for (let i = 0, n = w * h; i < n; i++) {
    const o = i * 4;
    if (!(a[o + 3] | a[o + 1] | a[o + 2]) && !(b[o + 3] | b[o + 1] | b[o + 2])) continue;
    const d = Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]) + Math.abs(a[o + 3] - b[o + 3]);
    if (d > 8) { changed++; sum += d / 3; if (d / 3 > maxd) maxd = d / 3; }
  }
  return { changed, mean: changed ? sum / changed : 0, max: maxd };
}

// a bar of ~n px showing the change, so the timing profile is visible at a glance
function spark(values, width, height) {
  const img = canvas(width * 3 + 4, height);
  const peak = Math.max(1, ...values);
  values.forEach((v, i) => {
    const bh = Math.round((v / peak) * (height - 2));
    for (let y = height - 1 - bh; y < height - 1; y++) {
      const t = y / height;
      img.rect(i * 3, y, 2, 1, [Math.round(90 + 120 * t), Math.round(150 + 90 * t), 255, 255]);
    }
  });
  return img;
}

for (const id of resolveIds(ids)) {
  const fx = await loadEffect(id);
  const r = renderFrames(fx, {
    fps: flags.fps ? +flags.fps : undefined,
    seed: flags.seed ? +flags.seed : undefined,
    bg: flags.bg,
    actor: flags["no-actor"] ? false : undefined,
    options: flags.opts ? JSON.parse(flags.opts) : undefined,
  });
  const { w, h, frames, fps } = r, n = frames.length;
  const dir = join(out, id, "inspect");

  // per-frame change on transparency (what actually moved), and the loop seam
  const d = frames.map((f, i) => (i ? delta(frames[i - 1].clear, f.clear, w, h) : { changed: 0, mean: 0, max: 0 }));
  const seam = fx.meta.loop && n > 1 ? delta(frames[n - 1].clear, frames[0].clear, w, h) : null;
  const changed = d.slice(1).map((x) => x.changed);
  const typical = [...changed].sort((a, b) => a - b)[Math.floor(changed.length * 0.9)] ?? 0;
  // frames where nothing moved: signal in a loop, and in a one-shot only up to the point it has finished
  const drawn = () => frames.map((f) => {
    let n = 0;
    for (let i = 0; i < w * h; i++) if (f.clear[i * 4 + 3]) n++;
    return n;
  });
  const ink = drawn();
  const lastInk = ink.reduce((last, v, i) => (v > 0 ? i : last), -1);
  const held = d.map((x, i) => (i && i <= lastInk && x.changed < Math.max(2, typical * 0.05) ? i : -1)).filter((i) => i >= 0);
  const jumps = d.map((x, i) => (i && x.changed > Math.max(typical * 2.2, typical + 14) ? i : -1)).filter((i) => i >= 0);

  // strips: every frame, labelled, on flat grey; and the same at zoom
  // crop to what the effect itself draws (over every frame) so the subject fills its cell: clear is the
  // transparent composite; color has the backdrop baked in and is opaque everywhere
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  for (const f of frames)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (f.clear[o + 3]) {
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
      }
  const margin = 3;
  if (bx1 < 0) (bx0 = 0), (by0 = 0), (bx1 = w - 1), (by1 = h - 1);
  bx0 = Math.max(0, bx0 - margin); by0 = Math.max(0, by0 - margin);
  bx1 = Math.min(w - 1, bx1 + margin); by1 = Math.min(h - 1, by1 + margin);
  const bw0 = bx1 - bx0 + 1, bh0 = by1 - by0 + 1;

  const strip = (zoom, colour) => {
    const x0 = bx0, y0 = by0, bw = bw0, bh = bh0;
    const pad = 6, label = 14, head = 26;
    // a browsable grid: up to 18 columns over three or more rows, wrapping left to right. If the cells are too
    // wide for that, back the zoom off, so a strip never turns into a column of two thumbnails
    let k = zoom;
    const cols = Math.max(1, Math.min(+(flags.cols ?? Math.ceil(n / 3)), 18, n));
    while (k > 1 && cols * (bw * k + pad) > 1450) k--;
    const rows = Math.ceil(n / cols);
    const cw = bw * k, ch = bh * k;
    const img = canvas(pad + cols * (cw + pad), head + rows * (ch + label + pad) + pad, colour);
    img.text(`${id}  ${n}f @${fps}  ${fx.meta.loop ? "loop" : "one-shot"}  ${k}x  ${bw}x${bh}px`, pad, 7, 2);
    for (let i = 0; i < n; i++) {
      const x = pad + (i % cols) * (cw + pad), y = head + Math.floor(i / cols) * (ch + label + pad);
      const tag = i === 0 || !d[i].changed ? `${i}` : `${i} ·${d[i].changed}`;
      img.text(tag, x, y, 1, [150, 150, 175]);
      for (let yy = 0; yy < ch; yy++)
        for (let xx = 0; xx < cw; xx++) {
          const s = ((y0 + Math.floor(yy / k)) * w + x0 + Math.floor(xx / k)) * 4, o = ((y + label + yy) * img.w + x + xx) * 4;
          const a = frames[i].color[s + 3] / 255;
          for (let c = 0; c < 3; c++) img.data[o + c] = frames[i].color[s + c] * a + colour[c] * (1 - a);
          img.data[o + 3] = 255;
        }
    }
    return img.png();
  };

  // transparent frames on a checkerboard, so holes, fringes and smears show without a backdrop hiding them
  const clear = () => {
    const k = Math.max(2, Math.min(6, Math.floor(1500 / (bw0 * Math.max(1, Math.ceil(frames.length / 3))))));
    const cols = Math.max(1, Math.min(+(flags.cols ?? Math.ceil(frames.length / 3)), 18, frames.length));
    const rows = Math.ceil(frames.length / cols), pad = 4;
    const cw = bw0 * k, chh = bh0 * k;
    const img = canvas(pad + cols * (cw + pad), pad + rows * (chh + pad));
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < img.w; x++) {
        const c = ((x >> 3) + (y >> 3)) & 1 ? 58 : 44;
        img.data.set([c, c, c + 6, 255], (y * img.w + x) * 4);
      }
    frames.forEach((f, i) => {
      const x0i = pad + (i % cols) * (cw + pad), y0i = pad + Math.floor(i / cols) * (chh + pad);
      for (let yy = 0; yy < chh; yy++)
        for (let xx = 0; xx < cw; xx++) {
          const s = ((by0 + Math.floor(yy / k)) * w + bx0 + Math.floor(xx / k)) * 4, o = ((y0i + yy) * img.w + x0i + xx) * 4;
          const a = f.clear[s + 3] / 255;
          for (let c = 0; c < 3; c++) img.data[o + c] = f.clear[s + c] * a + img.data[o + c] * (1 - a);
        }
    });
    return img.png();
  };

  const made = [
    save(join(dir, "strip-1x.png"), strip(1, flat)),
    save(join(dir, "strip-zoom.png"), strip(+(flags.zoom ?? 8), flat)),
    save(join(dir, "clear.png"), clear()),
  ];

  // the timing profile, printed and saved as a strip of bars
  const barH = 40, gap = 4;
  const bars = spark(d.slice(1).map((x) => x.changed), n - 1, barH);
  const head = canvas(Math.max(bars.w, 380), barH + 30, flat);
  head.text(`${id} change per frame (peak ${Math.max(...changed)})`, 2, 2, 1);
  head.text("held", 2, 12, 1, [230, 190, 120]);
  head.text(held.length ? runs(held) : "none", 30, 12, 1, [230, 190, 120]);
  head.text("jumps", 2, 20, 1, [240, 130, 130]);
  head.text(jumps.length ? runs(jumps) : "none", 36, 20, 1, [240, 130, 130]);
  head.paste(bars.data, bars.w, bars.h, 0, 30);
  made.push(save(join(dir, "timing.png"), head.png()));

  console.log(`${id}  ${n} frames, ${fx.meta.loop ? "loop" : "one-shot"}  ->  ${made.map((m) => m.replace(join(ROOT, "records") + "/", "")).join("  ")}`);
  console.log(`      change per frame: median ${median(changed)}, peak ${Math.max(...changed)}${seam ? `, seam ${seam.changed} (typical step ${typical})` : ""}`);
  if (held.length) console.log(`      held: ${runs(held)}  (nothing changes: a hold, which reads as intent in 3-6 frames and as a stall past that)`);
  if (!fx.meta.loop && ink.length && lastInk >= 0 && lastInk < n - 1) console.log(`      ends at frame ${lastInk} of ${n - 1}: ${n - 1 - lastInk} empty frames (fine, or trim duration)`);
  if (jumps.length) console.log(`      jumps: ${runs(jumps)}  (over twice a normal step: a pop unless it is a deliberate snap)`);
}

// [3,4,5,9,10] -> "3-5, 9-10": frame lists are read as stretches, not as individual numbers
function runs(list) {
  const out = [];
  for (const i of list) {
    const last = out[out.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else out.push([i, i]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");
}

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

function upscaleNearest(src, w, h, k) {
  const out = new Uint8ClampedArray(w * k * h * k * 4);
  for (let y = 0; y < h * k; y++)
    for (let x = 0; x < w * k; x++) {
      const s = (Math.floor(y / k) * w + Math.floor(x / k)) * 4, o = (y * w * k + x) * 4;
      out[o] = src[s]; out[o + 1] = src[s + 1]; out[o + 2] = src[s + 2]; out[o + 3] = src[s + 3];
    }
  return out;
}
