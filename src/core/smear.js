// Hand-drawn smear: one shape stretched along the arc between where something was and where it now is.
// A hand animator doesn't copy the wing three times at low alpha; they draw a single distorted shape that spans
// the movement. These build that shape from two outlines sampled at the same moment either side of `t`.

import { lerp } from "./math.js";

/**
 * One solid outline spanning outlines `a` and `b` (arrays of [x, y], same length and order): out along the
 * later shape's leading side, back along the earlier shape's trailing side, with `samples - 1` intermediate
 * outlines folded in between. `lag` weights where the bulk of the smear sits (0 at a, 1 at b, 0.5 between).
 */
export function smearOutline(a, b, { samples = 3, lag = 0.5 } = {}) {
  const n = Math.min(a.length, b.length), out = [];
  for (let i = Math.floor(n * 0.45); i < n; i++) out.push([b[i][0], b[i][1]]);
  for (let s = samples; s >= 1; s--) {
    const u = lag * (s / samples);
    for (let i = n - 1; i >= 0; i--) out.push([lerp(a[i][0], b[i][0], u), lerp(a[i][1], b[i][1], u)]);
  }
  return out;
}

/**
 * Short dashes from each point of `a` towards the matching point of `b`, `along` of the way: the cheap version
 * that still reads as speed at small sizes, where a filled smear just makes a blob.
 * `fn(ax, ay, bx, by, i, n)` receives the dash's ends; it owns the drawing (a pixel line, a lit tip, nothing).
 */
export function smearStreaks(a, b, fn, { along = 0.55, count = 10 } = {}) {
  const n = Math.min(a.length, b.length), step = Math.max(1, Math.round(n / count));
  for (let i = 0; i < n; i += step) {
    const ax = a[i][0], ay = a[i][1], bx = lerp(a[i][0], b[i][0], along), by = lerp(a[i][1], b[i][1], along);
    fn(ax, ay, bx, by, i, n);
  }
}
