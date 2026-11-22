import { fit, hex, mix, clamp, wrap, lerp, smooth, ease, TAU, track, smearOutline } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

export const meta = {
  name: "Bird",
  desc: "A songbird flies in place: bursts of wingbeats that lift its body on each downstroke, a glide on spread wings, its tail fanning, a loose feather drifting away.",
  tags: ["critter", "bird", "flying", "animal", "loop"],
  size: [112, 80],
  origin: [56, 40],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "sky",
  options: {
    palette: ["#0a0e1e", "#18244a", "#24407a", "#3466aa", "#5a94d4", "#9cc8f0", "#eaf6ff"],
    breast: ["#4a1a0e", "#a8441c", "#e8783a", "#ffb070"],
    seed: 1,
  },
};

const D = meta.duration, GRID = new Grid(-26, -26, 52, 46), BEAK = hex("#f0b030"), BEAKD = hex("#a86a18");
// The near wing's key poses, index 0 is the shoulder, 1 the wrist, 2-7 the flight feathers trailing back.
// A raised wing is a diagonal, not a vertical slab: shoulder, wrist up and back, then the primaries sweeping
// out and down behind it, so the leading edge stays readable along the top.
const POSE = {
  // raised on the upstroke: wrist high and well back, the hand's feathers pointing up and out, so the leading
  // edge runs diagonally up from the shoulder and the shape reads as a full wing, not a slab beside the head
  up: [[0, 0], [-3, -6], [-8.5, -11.5], [-12.5, -13.5], [-15, -11], [-14.5, -7], [-12, -3.5], [-8.5, -0.5]],
  mid: [[0, 0], [-3, -2.5], [-9, -2.5], [-10.5, -0.5], [-10, 1.2], [-8.5, 2], [-7, 2.2], [-5, 2]],
  down: [[0, 0], [-1, 6], [-3.5, 12], [-6, 11], [-7.5, 8.5], [-8, 6], [-7, 3], [-5, 2]],
  fold: [[0, 0], [-3, -4], [-10, -5.5], [-11, -4], [-10, -2.5], [-8.5, -1], [-7, 0.5], [-5, 1.5]],
  glide: [[0, 0], [-2, -5], [-7, -10], [-10, -9], [-12, -6.5], [-11.5, -3.5], [-9, -1], [-6, 1]],
};
// The flap is a set of hand-timed drawings, not a formula sampled every frame. Each key is one drawing of the
// wing (the outline it uses, how far it bows, how the feathers sit); the track says when it is on screen and how
// the next one arrives. Holds make a beat settle, "out" makes a downstroke strike, "snap" makes a pose a drawing
// rather than a curve. That spacing is what hands do, and what a smooth function of t cannot.
const WRIST = 1;
const DRAWING = {
  // the top of the stroke, held a beat longer than the rest: the bird hangs there
  top: { name: "up", flex: -0.05, lag: 0, spread: 0.9, splay: 0.75, dark: 0 },
  // the drive: the wing nearly straight and fully out, feathers fanned, a smear trailing behind it
  drive: { name: "mid", flex: 0.06, lag: 0, spread: 1, splay: 1.15, dark: 0.9 },
  // contact: the wing's lowest drawing, bowed down, feathers swept back
  low: { name: "down", flex: 0.3, lag: 0.5, spread: 1, splay: 0.95, dark: 0.5 },
  // the gather between beats: wing drawn up and gathered close, a single drawing snapped to
  gather: { name: "fold", flex: -0.08, lag: 0, spread: 0.85, splay: 0.5, dark: 0.1 },
  glide: { name: "glide", flex: -0.18, lag: 0, spread: 1.05, splay: 1.35, dark: -0.2 },
};
// flapping until GLIDE, then a glide on spread wings. Each beat: hang at the top, strike, land, gather, float up.
const FLAPS = 5, GLIDE = 1.6, BEAT = GLIDE / FLAPS;
function wingKeys() {
  const keys = [];
  for (let i = 0; i < FLAPS; i++) {
    const t0 = i * BEAT, q = BEAT;
    keys.push([t0, DRAWING.top]);                        // carried from the beat before
    keys.push([t0 + q * 0.3, DRAWING.top]);              // held: the bird hangs at the top of the beat
    keys.push([t0 + q * 0.42, DRAWING.drive, "out"]);    // strike: fast off the hold
    keys.push([t0 + q * 0.56, DRAWING.low, "snap"]);     // contact: a drawing snapped to, not eased into
    keys.push([t0 + q * 0.7, DRAWING.gather, "out"]);    // gathered up in one fast move
    // the last third of the beat floats back to the top drawing
  }
  keys.push([GLIDE, DRAWING.glide]);                     // the glide, spread and held
  keys.push([D, DRAWING.top]);                           // meeting t = 0 for a seamless loop
  return keys;
}
// one track for the whole loop: the beats, then the glide, then back to the top
const WING = track({ keys: wingKeys(), loop: D, rate: 0 });const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
// how far through a beat we are, as the wing itself sees it: 0 at the top, ~0.5 on the drive, back to 1
function beatPhase(t) {
  if (t >= GLIDE) return 0;
  const q = wrap(t, BEAT) / BEAT;
  return q < 0.3 ? 0 : smooth(0.3, 0.58, q) * (1 - smooth(0.58, 1, q));
}
function shape(d, breathe = 0) {
  const pts = POSE[d.name], W = pts[WRIST], N = pts.length - 1, out = [], bow = d.flex;
  const splay = d.splay + breathe * 0.3;
  for (let i = 0; i <= N; i++) {
    const P = pts[i], L = i / N;
    let [dx, dy] = [P[0] - SH[0], P[1] - SH[1]];
    // the bow: the wing stays out and curves, bending a little more as it nears the tip
    dx += bow * 3.2 * L * L;
    dy += bow * 2.4 * L * L;
    if (i >= WRIST) {
      const e = (i - WRIST) / (N - WRIST);
      // a light second kink at the wrist, so the hand doesn't hinge like a folded umbrella
      const [hx, hy] = [P[0] - W[0], P[1] - W[1]], [rx, ry] = rot(hx, hy, bow * 0.3);
      dx += (rx - hx) * e; dy += (ry - hy) * e;
      // the fingertips trail the hand, and the hand trails the arm
      dy += d.lag * 1.2 * e * e;
      dx += d.lag * 0.3 * e;
      // the flight feathers fan from the wrist, more at the tips
      dx += (i % 2 ? 0.55 : -0.55) * splay * e;
      dy += (i % 2 ? 0.4 : -0.4) * splay * e;
    }
    // a hand out from behind the body rides a little further out along its own axis
    const k = 1 + 0.1 * d.spread * L;
    out.push([SH[0] + dx * k, SH[1] + dy * k]);
  }
  return out;
}
function wing(t) {
  t = wrap(t, D);
  const d = WING(t);
  // through the glide the wing still breathes: the tip's feather fan opens and closes slowly, so the held
  // drawing is a soar rather than a freeze
  const breathe = t >= GLIDE ? Math.sin(((t - GLIDE) / (D - GLIDE)) * Math.PI * 4) : 0;
  return { pts: shape(d, breathe), flex: d.flex, dark: d.dark, name: d.name };
}
// the body rises on the strike and hangs through the glide, read from the same drawings the wing uses
function lift(t) {
  t = wrap(t, D);
  let y = 0;
  for (let k = 0; k < 7; k++) {
    const d = t - k / 30;
    if (d >= 0 && d < GLIDE && WING(d).name === "down") y -= 0.45;
  }
  if (t >= GLIDE) {
    // the glide itself drifts: a slow rise and fall, so the held pose is a soar and not a freeze
    const g = (t - GLIDE) / (D - GLIDE);
    y += 2.4 * Math.sin(Math.PI * g) + 0.5 * Math.sin(g * Math.PI * 6);
  }
  return y + 1.2;
}

const SH = [1, -2];
// The far wing is the same drawing seen further back: pushed away from the viewer and a little up, so it clears
// the near wing instead of hiding behind it, and shorter, because it's further away.
const wingPts = (w, far) => w.pts.map(([x, y]) => (far ? [SH[0] + x * 0.86 - 2.5, SH[1] + y * 0.74 - 3.5] : [SH[0] + x, SH[1] + y]));

function bird(g, C, Br, t, w) {
  g.clear();
  // the far wing, behind the body and in shadow: drawn as its own shaded shape, so when it is raised it reads as
  // a wing seen edge-on and not as a flat bar beside the head
  const wfp = wingPts(w, true);
  g.poly(wfp, (x, y) => {
    const d = Math.min(Math.hypot(x - wfp[1][0], y - wfp[1][1]), Math.hypot(x - wfp[2][0], y - wfp[2][1]));
    return d < 1.1 ? C[2] : d < 2.4 ? C[1] : C[0];
  });
  // its flight feathers, a shade lighter than the shadow so the shape keeps its direction
  for (let i = 3; i < 7; i++) {
    const ex = lerp(wfp[1][0], wfp[i][0], 0.9), ey = lerp(wfp[1][1], wfp[i][1], 0.9);
    if (wfp[i][1] < wfp[1][1] + 2) g.line(wfp[1][0], wfp[1][1], ex, ey, C[1]);
  }
  // the tail counter-swings the stroke: it trails down as the wings drive, and lifts as they gather, plus a slow
  // idle sway so it is never quite still
  const drive = beatPhase(t);
  const tf = 0.3 + 0.22 * Math.sin((t / D) * TAU * 2) + 0.5 * drive;
  for (let i = 0; i < 3; i++) {
    const a = Math.PI + (i - 1) * tf * 0.5 + 0.1, L = 9 - Math.abs(i - 1);
    g.poly([[-7, -2.4], [-7 + Math.cos(a) * L, -1 + Math.sin(a) * L - 1.2], [-7 + Math.cos(a) * L, -1 + Math.sin(a) * L + 1.2], [-7, 0.6]], i === 0 ? C[3] : C[2]);
  }
  // body and head: a blue back lit from above, a rust breast, a pale belly. The head has a life of its own: it
  // leads the stroke a beat and nods on the drive, so the bird is not one rigid piece bobbing up and down.
  const lead = -drive * 0.9 - 0.35 * Math.sin((t / D) * TAU * 2);
  const inHead = (x, y) => (x - 6.5) ** 2 + (y + 3 - lead) ** 2 <= 4.6 ** 2;
  const inBodyOnly = (x, y) => ((x + 1) / 8.5) ** 2 + (y / 5.2) ** 2 <= 1;
  const inBody = (x, y) => inBodyOnly(x, y) || inHead(x, y);
  g.shade(-10, -9, 12, 6, (x, y) => {
    if (!inBody(x, y)) return 0;
    // the head is lit in its own space, so nodding it doesn't drag the body's shading rules across it
    if (inHead(x, y)) {
      const hx = x - 6.5, hy = y + 3 - lead;
      if (hy > 1.4 && hx > 0.5) return Br[2];               // the throat, under the beak
      return hy < -2.6 ? C[5] : hy < -0.6 ? C[4] : C[3];    // lit cap, mid, shadow under the jaw
    }
    const top = !inBody(x, y - 2.2), under = !inBody(x + 0.5, y + 1.6);
    if (y > -0.5 && x > -2.5) return under ? Br[1] : x > 3 && y < 2 ? Br[3] : Br[2];
    if (y > 1.5) return under ? C[4] : C[5];
    return top ? (x > 2 ? C[5] : C[4]) : y < -3.5 && x > 3 ? C[4] : C[3];
  });
  // beak, eye with a glint, a dark cap stripe: they ride with the head's nod. The eye sits on the lit cheek,
  // with a pale pixel on its upper edge, so it still reads against the mid tone of the head.
  const hy = -Math.round(lead);
  g.poly([[10.5, -4.5 + hy], [14.5, -3 + hy], [10.5, -2 + hy]], (x, y) => (y < -3 + hy ? BEAK : BEAKD));
  g.set(8, -5 + hy, C[0]); g.set(8, -4 + hy, C[0]); g.set(9, -5 + hy, C[6]); g.set(9, -4 + hy, C[4]);
  g.line(5, -7 + hy, 9, -6.5 + hy, C[2]);
  // the near wing: lit along its leading edge, the flight feathers splayed at the tips
  const wp = wingPts(w, false), wf = wingPts(w, true);
  const edge = (x, y) => {
    let m = Infinity;
    for (let i = 1; i < 3; i++) {
      const [ax, ay] = wp[i - 1], [bx, by] = wp[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, u = clamp(((x - ax) * dx + (y - ay) * dy) / L2);
      m = Math.min(m, Math.hypot(ax + dx * u - x, ay + dy * u - y));
    }
    return m;
  };
  g.poly(wp, (x, y) => {
    const d = edge(x, y);
    return d < 1.2 ? C[5] : d < 3 ? C[4] : C[3];
  });
  // the flight feathers: dark lines splaying from the wrist to the trailing edge, curling as the hand folds
  const curl = (w.flex ?? 0) * 1.4;
  const dash = (pts) => {
    const edge = (x, y) => {
      let m = Infinity;
      for (let i = 1; i < 3; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, u = clamp(((x - ax) * dx + (y - ay) * dy) / L2);
        m = Math.min(m, Math.hypot(ax + dx * u - x, ay + dy * u - y));
      }
      return m;
    };
    g.poly(pts, (x, y) => {
      const d = edge(x, y);
      return d < 1.2 ? C[4] : d < 3 ? C[3] : C[2];
    });
    for (let i = 3; i < 7; i++) {
      const bend = (w.flex ?? 0) * 0.8;
      g.line(pts[1][0], pts[1][1], lerp(pts[1][0], pts[i][0], 0.9), lerp(pts[1][1], pts[i][1], 0.9) + bend * (i - 4), C[1]);
    }
  };
  if (w.flex > 0.2) dash(wf);
  for (let i = 3; i < 7; i++) {
    const ex = lerp(wp[1][0], wp[i][0], 0.92), ey = lerp(wp[1][1], wp[i][1], 0.92) + curl * (i - 4);
    // a slight bow, so the feathers read as laid over one another rather than as spokes
    const mx = lerp(wp[1][0], ex, 0.5) + 0.5, my = lerp(wp[1][1], ey, 0.5) - 0.35 * (i - 4);
    g.line(wp[1][0], wp[1][1], mx, my, C[2]);
    g.line(mx, my, ex, ey, C[2]);
  }
  g.outline(C[0]);
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 7), Br = fit(o.breast, 4), w = wing(t), y = lift(t);
  const g = GRID, dark = (col, k) => (k > 0 ? mix(col, C[0], k) : col);
  // On the strike the wing crosses several pixels in a frame. Rather than repeating it, draw one smear: the
  // single stretched shape a hand animator would draw for that frame, swept along the arc the wing travels.
  const span = w.dark ?? 0;
  if (span > 0.25) {
    const was = wingPts(wing(t - 0.05), false), b = wingPts(w, false);
    // the wing's leading edge before and now: the band between them is the arc it swept
    const band = smearOutline(was, b, { samples: 2, lag: 0.6 });
    g.clear();
    g.poly(band, dark(C[3], 0.28 * Math.min(1, (span - 0.25) / 0.5)));
    for (let i = 0; i < g.a.length; i++) if (g.a[i] > 0) g.a[i] *= 0.5;
    g.draw(p, 1, 0, Math.round(lift(t - 0.05)));
  }
  bird(g, C, Br, t, w);
  g.draw(p, 1, 0, Math.round(y));
  // a speed line off the leading edge of the hand while it is driving, from the wrist out past the tip
  if (span > 0.35) {
    const wp = wingPts(w, false), wy = Math.round(y), a = Math.min(1, (span - 0.35) / 0.5);
    for (let k = 2; k < 5; k++) {
      const [x0, y0] = wp[1], [x1, y1] = wp[3];
      const u = 0.55 + k * 0.11, x = lerp(x0, x1, u), yy = lerp(y0, y1, u) + wy;
      p.dot(x - 1.2 - k * 0.35, yy, dark(C[5], 0.15), a * (0.85 - k * 0.16));
      p.dot(x - 2.1 - k * 0.35, yy + 0.6, C[3], a * (0.7 - k * 0.14));
    }
  }
  // a loose feather drifts off and rocks down out of sight: small and dim, a detail rather than a stray mark
  const fa = wrap(t - 0.45, D);
  if (fa < 1.2) {
    const fx = -7 - 11 * fa - 2.5 * Math.sin(fa * 5), fy = 3 + 7 * fa + 1.2 * Math.cos(fa * 5) * fa, rock = Math.sin(fa * 5) * 0.8;
    const a = Math.min(1, (1.2 - fa) * 3) * 0.75;
    for (let i = -1; i <= 1; i++) p.dot(fx + i * Math.cos(rock), fy + i * Math.sin(rock) * 0.8, i < 0 ? C[4] : C[3], a);
  }
  // a little moonlight on its back
  p.glow(2, y - 6, 16, C[5], 0.12);
}
