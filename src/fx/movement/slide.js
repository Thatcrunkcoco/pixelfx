// A floor sliding left to right beneath him: the marks he leaves stay put in world space, so they trail away behind
// while he comes to rest further along. This is what carries the speed — a body alone just reads as posing.
//
// Built from core's primitives only. Nothing here is borrowed from Sprite Fusion's files.
import { Rng, clamp, fit, lerp, mix, hex, WHITE, READY, posed } from "../../core/index.js";

const LAUNCH = 0, FULL = 0.34, SCUFF = 0.62, PLANT = 1.02, UP = 1.55, END = 1.62, TRAVEL = 196;

export const meta = {
  name: "Slide",
  desc: "He coils, throws himself flat and skids on his trailing boot: the ground tears past in streaks, dust sprays back in a wedge, and the skid leaves scuffs he climbs out of.",
  tags: ["movement", "slide", "skid", "dash", "ground", "one-shot"],
  size: [372, 116],
  origin: [92, 104],
  duration: END,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: {
    seed: 1,
    palette: ["#1a1420", "#33283a", "#574563", "#8a7196", "#c0a6c2", "#efe3d6"],
    scuff: ["#241c2c", "#4a3a52", "#7a6286", "#a98fae", "#dbc4cd"],
  },
};

// ---- the act. The travel is in x, keyed so the skid goes off hard and then dies back; the body changes silhouette
// with it, flat and stretched at speed, sitting up over the boot as it slows, then planting a hand and rising.
const COIL = { ...READY, crouch: 9, lean: 6, fx: 6, fy: -18, bx: -8, by: -20, ffx: 7, fbx: -7 };
const COIL_BACK = { ...COIL, crouch: 11, lean: -3, fx: 1, fy: -13, bx: -11, by: -17 };
// the near hand is thrown out low and forward but stays inside the arm's reach: bones don't stretch
const THROW = { crouch: 15, lean: 22, turn: 2.2, fx: 5, fy: -17, bx: 2, by: -16, ffx: 17, ffy: -2, fbx: -14, fby: -4, toeF: true, ghost: 1 };
const SKID = { crouch: 17, lean: 26, turn: 2.6, fx: 5, fy: -18, bx: 1, by: -15, ffx: 21, ffy: -2, fbx: -17, fby: -7, toeF: true, ghost: 1 };
const RIDE = { crouch: 15, lean: -6, turn: 2.9, fx: 2, fy: -22, bx: -13, by: -8, ffx: 20, ffy: -6, fbx: -11, fby: -2, toeB: true };
const STOP = { crouch: 14, lean: 3, turn: 2.6, fx: -7, fy: -15, bx: -6, by: -13, ffx: 17, ffy: -4, fbx: -12, fby: -1 };
const GRAB = { crouch: 16, lean: -4, turn: 2.7, fx: 9, fy: -8, bx: -8, by: -18, ffx: 15, ffy: -5, fbx: -11, fby: -1 };
const RISE = { ...READY, crouch: 6, lean: 4, fx: 8, fy: -19, bx: -4, by: -19, ffx: 9, fbx: -8 };

const KEYS = [
  [-0.52, { ...READY }],
  [-0.3, COIL],
  [-0.1, COIL_BACK],
  [LAUNCH, { ...THROW, x: 6 }, "snap"],
  [FULL, { ...SKID, x: TRAVEL * 0.5 }, "line"],
  [0.5, { ...SKID, x: TRAVEL * 0.66, lean: 17 }, "out"],
  [SCUFF, { ...RIDE, x: TRAVEL * 0.88 }, "out"],
  [0.78, { ...STOP, x: TRAVEL * 0.975 }, "out"],
  [PLANT, { ...GRAB, x: TRAVEL }, "snap"],
  [1.24, { ...GRAB, x: TRAVEL, crouch: 11, lean: -2 }],
  [UP, { ...RISE, x: TRAVEL }],
  [END, { ...READY, x: TRAVEL }],
];

export const act = { poses: KEYS };

// The floor has to agree with the act exactly, or the streaks and scuffs drift off the boot. Walk the same keys with
// the same curves poseAt uses rather than approximating the motion a second time.
const EASE = { snap: () => 0, line: (u) => u, out: (u) => 1 - (1 - u) * (1 - u), in: (u) => u * u, smooth: (u) => u * u * (3 - 2 * u) };
function travelAt(t) {
  const k = KEYS;
  if (t <= k[0][0]) return k[0][1].x ?? 0;
  for (let i = 0; i < k.length - 1; i++) {
    const [t0, a] = k[i], [t1, b, how] = k[i + 1];
    if (t >= t1) continue;
    return lerp(a.x ?? 0, b.x ?? 0, EASE[how ?? "smooth"](clamp((t - t0) / (t1 - t0))));
  }
  return k[k.length - 1][1].x ?? 0;
}
const speedAt = (t) => (t <= LAUNCH || t >= SCUFF ? 0 : Math.pow(1 - (t - LAUNCH) / (SCUFF - LAUNCH), 0.55));

export function create(o) {
  const R = new Rng(o.seed), C = fit(o.palette, 6), S = fit(o.scuff, 5);
  const DUST = [mix(hex("#8f8693"), C[4], 0.4), mix(hex("#c9bfb8"), C[5], 0.35), mix(hex("#5a5468"), C[3], 0.5)];
  const streaks = [], motes = [], scuffs = [];
  let t = 0, acc = 0, next = 0;

  // the boot that's dragging: the trailing foot of the pose, in world space, is where the debris comes from
  const bootAt = (time) => travelAt(time) - 13;

  const emit = () => {
    const k = speedAt(t), where = travelAt(t);
    streaks.push({
      x: where + R.range(-8, 12), y: R.range(-1, 1), len: R.range(4, 11) * (0.5 + k),
      vx: -R.range(110, 320) * (0.5 + k), life: R.range(0.09, 0.2) * (0.5 + k), age: 0,
      c: R.chance(0.3) ? C[5] : R.chance(0.55) ? C[3] : C[2],
    });
    motes.push({
      x: where + R.range(-10, 4), y: -R.range(0, 2), vx: -R.range(30, 170) * (0.4 + k), vy: -R.range(2, 16) * k,
      life: R.range(0.2, 0.5), age: 0, big: R.chance(0.4), c: DUST[R.chance(0.4) ? 1 : R.chance(0.5) ? 0 : 2],
    });
  };

  return {
    update(dt) {
      t += dt;
      // the floor's supply of debris follows the slide's speed, so the spray eases in and out with it
      if (t >= LAUNCH && t < SCUFF) {
        acc += dt * (6 + 48 * speedAt(t));
        while (acc >= 1) {
          acc -= 1;
          emit();
        }
      }
      for (const s of streaks) { s.age += dt; s.x += s.vx * dt; }
      for (const m of motes) {
        m.age += dt; m.x += m.vx * dt; m.vy += 90 * dt; m.y += m.vy * dt;
        if (m.y > -0.5) { m.y = -0.5; m.vy = 0; m.vx *= 0.4; }
      }
      if (t >= LAUNCH && t < SCUFF + 0.12 && t >= next) {
        next = t + 0.07;
        // marks fade on their own clock, all gone by the end: a one-shot has to leave the frame empty
        const life = R.range(0.8, 1.15);
        scuffs.push({ x: bootAt(t) + R.range(-4, 4), len: R.range(7, 15), thick: R.chance(0.3) ? 2 : 1, age: 0, life, until: Math.min(END - 0.02, t + life) });
      }
      for (const s of scuffs) s.age += dt;
      for (let i = streaks.length - 1; i >= 0; i--) if (streaks[i].age >= streaks[i].life) streaks.splice(i, 1);
      for (let i = motes.length - 1; i >= 0; i--) if (motes[i].age >= motes[i].life) motes.splice(i, 1);
      // a scuff shrinks back to nothing over the last of its life, so it's gone rather than cut off at the end
      for (let i = scuffs.length - 1; i >= 0; i--) if (t >= scuffs[i].until || scuffs[i].age >= scuffs[i].life + 0.25) scuffs.splice(i, 1);
    },

    // marks on the floor, behind everything: laid where the boot was, so they trail away as he goes on
    drawBack(p) {
      for (const s of scuffs) {
        // shrink from both ends over the last stretch of the scuff's life rather than blink out of existence
        const k = clamp((s.until - t) / 0.25) * (1 - s.age / s.life), live = Math.max(1, Math.round(s.len * clamp(k * 1.6)));
        if (k <= 0.02) continue;
        const mid = (s.len - live) / 2;
        for (let i = 0; i < live; i++) {
          const u = i / Math.max(1, live - 1), y = Math.round(Math.sin(u * Math.PI) * 0.8);
          p.dot(s.x - s.len + mid + i, y, S[Math.min(4, 1 + Math.floor((1 - s.age / s.life) * 3))], k * (1 - Math.abs(u - 0.5) * 0.5));
        }
      }
    },

    draw(p) {
      const k = speedAt(t);
      for (const s of streaks) {
        const kk = 1 - s.age / s.life, L = s.len * (0.6 + kk * 0.4);
        for (let i = 0; i < L; i++) {
          const u = i / Math.max(1, L - 1);
          p.dot(s.x + i, s.y, u > 0.82 ? C[5] : s.c, kk * (1 - u * 0.75));
        }
        if (kk > 0.4) p.glow(s.x + L * 0.6, s.y, 5, C[4], 0.2 * kk);
      }
      for (const m of motes) {
        const kk = 1 - m.age / m.life, a = kk * (0.9 - Math.min(0.55, -m.x / 90));
        if (a <= 0.02) continue;
        p.blend(m.x, m.y, m.c, a);
        if (m.big) p.blend(m.x + 1, m.y - 1, mix(m.c, WHITE, 0.3), a * 0.7);
      }
      const boot = bootAt(t);
      if (k > 0.12) {
        p.glow(boot, -1, 6 + 5 * k, C[4], 0.3 * k);
        for (let i = 0; i < 3; i++) {
          const ph = (t * 9 + i * 0.37) % 1, sp = 1 - ph;
          const x = boot - ph * 20 * (0.4 + k), y = -1 - Math.sin(ph * Math.PI) * 3 * k;
          p.px(x, y, ph < 0.4 ? C[5] : C[3]);
          if (sp > 0.3) p.light(x, y, C[4], 0.4 * sp * k);
        }
      }
      // the first touch: a flat streak of light under him an instant before he's really moving
      if (t >= LAUNCH && t < LAUNCH + 0.08) {
        const a = 1 - (t - LAUNCH) / 0.08;
        for (let x = -4; x <= 18; x++) p.dot(x, 0, Math.abs(x) < 10 ? C[5] : C[4], a * (1 - Math.abs(x) / 22));
      }
    },
  };
}
