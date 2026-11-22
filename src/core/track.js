// Hand-drawn animation for pixel loops: a track of key poses with a time, instead of one formula sampled every
// frame. Hand animation holds a drawing, then snaps to the next one; a smooth function of t slides through every
// frame, which is what makes a loop look mechanical. A track lets an effect say "this shape from here to here, then
// that one, arriving like this", exactly the way the character's acts already work (poseAt in act.js).
//
//   const WING = track({
//     keys: [
//       [0,    { up: 1, tip: 0 }],              // held until the key that follows
//       [0.18, { up: 0.2, tip: 0.5 }, "out"],   // arrives fast, settles: a downstroke
//       [0.26, { up: 0, tip: 1 }, "snap"],      // snaps on: the pose is a drawing, not a curve
//       [0.6,  { up: 0.6, tip: 0.4 }],
//     ],
//     loop: 2.4,     // the track repeats over the loop's duration and its ends must match
//     rate: 12,      // values step in whole 12 fps drawings, like a hand-timed animation
//   });
//   const s = WING(t);              // { up, tip } at time t
//
// `how` on a key says how it is reached from the key before it:
//   (default)  eases in and out
//   "out"      fast at first, settling: the shape of a strike or a flap's drive
//   "in"       slow at first, then fast: a wind-up releasing
//   "line"     constant speed
//   "snap"     no interpolation: the previous pose holds, then the new one appears on the key
// A key may also name its own ease, e.g. "outExpo", from `ease` in math.js.
//
// Numbers interpolate; anything that isn't a number (a colour, a flag, a string) changes at the later key, so a
// colour never smears into another mid-drawing.

import { wrap } from "./math.js";
import { ease } from "./math.js";

const NAMED = { out: "outQuad", in: "inQuad", line: "linear" };

/** The value at time t: a number, or an object whose numbers are interpolated and other fields switch at keys. */
export function sampleTrack(keys, t, { loop = 0, rate = 0 } = {}) {
  if (!keys.length) return undefined;
  let u = t;
  if (loop > 0) u = wrap(t, loop);
  // the key we're past, and the next one
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1][0] <= u) i++;
  const a = keys[i];
  if (i === keys.length - 1) return a[1];
  const b = keys[i + 1];
  // a loop's last key leads back to its first, so the shapes at t = loop and t = 0 are the same drawing
  const to = b[1], how = b[2];
  if (how === "snap") return a[1];
  const span = b[0] - a[0] || 1e-9;
  let x = (u - a[0]) / span;
  if (rate > 0) x = Math.min(1, Math.floor(x * rate + 1e-6) / rate);
  const f = ease[NAMED[how] ?? how] ?? ease.inOutQuad;
  return mixValue(a[1], to, f(x));
}

function mixValue(a, b, u) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * u;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const out = Array.isArray(a) ? b.slice() : { ...a };
    for (const k of Object.keys(b)) {
      const va = a[k], vb = b[k];
      if (typeof va === "number" && typeof vb === "number") out[k] = va + (vb - va) * u;
      else out[k] = u >= 1 ? vb : va ?? vb;
    }
    return out;
  }
  return u >= 1 ? b : a;
}

/**
 * A track of keys, callable: `track(t)` gives the pose at t. opts: { loop (seconds; 0 is none), rate (steps a
 * second, 0 smooth), ease (the default 'how' for keys that don't name one) }.
 */
export function track({ keys, loop = 0, rate = 12, ease: how } = {}) {
  if (!keys?.length) throw new Error("track needs keys: [[t, pose, how?], ...]");
  const ks = how ? keys.map(([t, p, h]) => [t, p, h ?? how]) : keys;
  const fn = (t) => sampleTrack(ks, t, { loop, rate });
  fn.keys = ks;
  fn.loop = loop;
  return fn;
}

/**
 * Between two poses of a track, how the numbers are moving: each key's value minus the one before, per field.
 * Diagnostics for authoring: a field that moves 0 px over four frames and 9 px over the next is the signature of
 * an animation that reads as stiff, and tools/inspect.mjs reports the same thing from the rendered frames.
 */
export function trackSteps({ keys, rate = 12 }) {
  const out = [];
  for (let i = 1; i < keys.length; i++) {
    const [t0, a] = keys[i - 1], [t1, b] = keys[i];
    const d = {};
    for (const k of Object.keys(b)) if (typeof a[k] === "number" && typeof b[k] === "number") d[k] = b[k] - a[k];
    out.push({ from: t0, to: t1, frames: Math.max(1, Math.round((t1 - t0) * rate)), how: b[2] ?? "inOut", delta: d });
  }
  return out;
}
