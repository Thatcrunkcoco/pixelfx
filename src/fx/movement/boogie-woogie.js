// A clap of the hands and the two of them trade places — the training dummy on the far side of the room and he
// swap, then he claps again and they swap back. The dummy is the act's own target: a hit with `to` glides it to
// a new spot on the same easing the hero's poses run, so the two cross exactly on the beat.
// Built from core's primitives only. Nothing here is borrowed from Sprite Fusion's files.
import { Rng, clamp, fit, mix, hex, lerp, READY, poseAt, posed } from "../../core/index.js";

const CLAP1 = 0.38, SWAP1 = 0.5, LAND1 = 0.8, CLAP2 = 1.28, SWAP2 = 1.4, LAND2 = 1.7, D = 2.3, TRAVEL = 66;
const HEAD = -24; // hands meet about here when he claps

export const meta = {
  name: "Boogie woogie",
  desc: "He claps his hands, and in a streak of light he and the training dummy trade places; he claps again and they swap back.",
  tags: ["movement", "swap", "teleport", "clap", "boogie", "loop"],
  size: [172, 70],
  origin: [60, 58],
  duration: D,
  loop: true,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: {
    seed: 1,
    palette: ["#20132e", "#4a2462", "#8a3fb4", "#c065d8", "#ff9de2", "#fff0fa"],
  },
};

// ---- the act: the body. The travel lives in x, keyed to leave on the beat after each clap.
const ANTIC = { crouch: 7, lean: -9, fx: -8, fy: -30, bx: -10, by: -28 };
const CLAP = { crouch: 5, lean: 10, fx: 13, fy: -25, bx: 11, by: -22 };
// the transit: two sprint strides — lean low, one leg thrown past the other, arms driving with the run
const RUNA = { crouch: 7, lean: 16, fx: 16, fy: -20, bx: -9, by: -15, ffx: 19, ffy: -5, fbx: -15, fby: -8, toeF: true };
const RUNB = { crouch: 7, lean: 15, fx: 12, fy: -16, bx: -8, by: -18, ffx: 13, ffy: -9, fbx: -18, fby: -4 };
const LAND = { crouch: 12, lean: 3, fx: 4, fy: -20, bx: -10, by: -14, ffx: 14, ffy: -8, fbx: -12, fby: -2 };

export const act = {
  target: { x: TRAVEL },
  hits: [
    { t: CLAP1, stop: 0.09, shake: 0.14, amp: 1.6, target: false },
    { t: SWAP1, to: TRAVEL / 2, glide: 0.15, push: 0, straw: 0, flash: 0 },
    { t: SWAP1 + 0.15, to: 0, glide: 0.15, push: 0, straw: 0, flash: 0 },
    { t: LAND1, push: 0.7, straw: 5, flash: 0.02 },
    { t: CLAP2, stop: 0.09, shake: 0.14, amp: 1.6, target: false },
    { t: SWAP2, to: TRAVEL / 2, glide: 0.15, push: 0, straw: 0, flash: 0 },
    { t: SWAP2 + 0.15, to: TRAVEL, glide: 0.15, push: 0, straw: 0, flash: 0 },
    { t: LAND2, push: 0.7, straw: 5, flash: 0.02 },
  ],
  dust: [
    { t: SWAP1, x: 3, n: 6, dir: 1 }, { t: SWAP1, x: TRAVEL - 3, n: 6, dir: -1 },
    { t: LAND1, x: TRAVEL - 3, n: 7, dir: 1 }, { t: LAND1, x: 3, n: 5, dir: -1 },
    { t: SWAP2, x: TRAVEL - 3, n: 6, dir: 1 }, { t: SWAP2, x: 3, n: 6, dir: -1 },
    { t: LAND2, x: 4, n: 7, dir: 1 }, { t: LAND2, x: TRAVEL - 3, n: 5, dir: -1 },
  ],
  poses: [
    [0, { ...READY }],
    [0.2, ANTIC],
    [CLAP1, CLAP],
    [SWAP1, { ...RUNA, x: 0 }, "snap"],
    [SWAP1 + 0.15, { ...RUNB, x: TRAVEL / 2 }, "out"],
    [LAND1, { ...LAND, x: TRAVEL }, "out"],
    [0.92, { ...READY, x: TRAVEL }],
    [1.1, ANTIC],
    [CLAP2, CLAP],
    [SWAP2, { ...RUNA, x: TRAVEL }, "snap"],
    [SWAP2 + 0.15, { ...RUNB, x: TRAVEL / 2 }, "out"],
    [LAND2, { ...LAND, x: 0 }, "out"],
    [1.84, { ...READY, x: 0 }],
    [D, { ...READY, x: 0 }],
  ],
};

// where the dummy is: its glides mirror the hero's x keys exactly — two "out" segments on the same clocks
const outE = (u) => 1 - (1 - u) * (1 - u);
function dummyAt(t) {
  const seg = (t0, from, to) => from + (to - from) * outE(clamp((t - t0) / 0.15));
  if (t < SWAP1) return TRAVEL;
  if (t < SWAP1 + 0.15) return seg(SWAP1, TRAVEL, TRAVEL / 2);
  if (t < LAND1) return seg(SWAP1 + 0.15, TRAVEL / 2, 0);
  if (t < SWAP2) return 0;
  if (t < SWAP2 + 0.15) return seg(SWAP2, 0, TRAVEL / 2);
  if (t < LAND2) return seg(SWAP2 + 0.15, TRAVEL / 2, TRAVEL);
  return TRAVEL;
}
// and the hero's feet: the act's x, walked through the same keys
function heroAt(t) {
  const x = (k) => k[1].x ?? 0, how = { snap: () => 0, out: outE };
  const k = act.poses;
  if (t <= k[0][0]) return x(k[0]);
  for (let i = 0; i < k.length - 1; i++) {
    const [t0, a] = k[i], [t1, b, h] = k[i + 1];
    if (t >= t1) continue;
    const e = how[h ?? ""] ?? ((u) => u * u * (3 - 2 * u));
    return lerp(x([0, a]), x([0, b]), e(clamp((t - t0) / (t1 - t0))));
  }
  return x(k[k.length - 1]);
}
const gliding = (t) => (t > SWAP1 && t <= LAND1) || (t > SWAP2 && t <= LAND2);

export function create(o) {
  const R = new Rng(o.seed), C = fit(o.palette, 6);
  const WHITE = C[5], PINK = C[4];
  const DUST = [hex("#8f8693"), hex("#c9bfb8"), mix(hex("#5a5468"), C[2], 0.25)]; // grey, warmed only slightly by the palette
  const streaks = [], motes = [];
  let t = 0, acc = 0, acc2 = 0;
  const fired = [];

  const once = (mark, fn) => {
    if (!fired.includes(mark) && t >= mark) { fired.push(mark); fn(); }
  };
  // the beat where the clap lands: a ring, a few sparks and one bright pulse at the hands
  const clapAt = (mark) => {
    once(mark, () => {
      const x = heroAt(t) + 12;
      mur.ring = { x, y: HEAD, born: t, r0: 3, r1: 15 };
      for (let i = 0; i < 5; i++) {
        const a = R.range(-1.4, 1.4) - Math.PI / 2;
        motes.push({ x, y: HEAD, vx: Math.cos(a) * R.range(60, 150), vy: Math.sin(a) * R.range(40, 120), life: R.range(0.1, 0.24), age: 0, c: R.chance(0.5) ? WHITE : PINK, spark: true });
      }
    });
  };
  // dust kicked up where something leaves or lands, small and grey so the pink stays special
  const puff = (x, dir, n = 6) => {
    for (let i = 0; i < n; i++)
      motes.push({ x: x + R.range(-3, 3), y: -1 - R.range(0, 2), vx: dir * R.range(25, 80), vy: -R.range(4, 20), life: R.range(0.14, 0.3), age: 0, big: R.chance(0.35), c: DUST[R.chance(0.4) ? 2 : R.chance(0.6) ? 0 : 1] });
  };
  const mur = { ring: null };
  mur.clapAt = clapAt;

  return {
    update(dt) {
      const prev = t;
      t += dt;
      if (t < prev) fired.length = 0; // the loop came round: this cycle's marks start over
      // ---- events
      for (const mark of [SWAP1, SWAP2]) {
        once(mark, () => streaks.push({ flash: t, kind: "flash" }));
      }
      clapAt(CLAP1);
      clapAt(CLAP2);
      // streaks: a thin supply while anyone is moving, then dying out
      if (gliding(t)) {
        acc += dt * 15;
        while (acc >= 1) {
          acc -= 1;
          const dir = t < LAND1 ? -1 : 1; // the light streams with the swap, back over the dummy's shoulder
          streaks.push({
            x: dir < 0 ? TRAVEL + 8 : -12, y: [-3, -9, -17, -26, -34][R.int(0, 4)],
            len: R.range(6, 14), vx: dir * R.range(220, 460), life: R.range(0.1, 0.2), age: 0,
            c: R.chance(0.25) ? WHITE : R.chance(0.5) ? PINK : C[3],
          });
        }
        // and the dummy's own skid dust as it slides
        acc2 += dt * 9;
        while (acc2 >= 1) {
          acc2 -= 1;
          const dx = dummyAt(t), dir = t < LAND1 ? -1 : 1;
          motes.push({ x: dx + R.range(-4, 4), y: -1, vx: dir * R.range(20, 70), vy: -R.range(2, 12), life: R.range(0.12, 0.26), age: 0, big: R.chance(0.3), c: DUST[R.chance(0.5) ? 2 : 1] });
        }
      }
      // departures and landings: dust where feet and base hit the floor
      for (const mark of [SWAP1, LAND1, SWAP2, LAND2]) {
        once(mark, () => {
          const here = mark === SWAP1 ? 0 : mark === LAND1 ? TRAVEL : mark === SWAP2 ? TRAVEL : 0;
          const there = TRAVEL - here, dir = here === 0 ? 1 : -1;
          puff(here, dir);
          puff(there, -dir, 5);
        });
      }
      // a little magic clinging to the hands after each clap: a few motes rise off them and fade
      for (const mark of [LAND1 + 0.1, LAND2 + 0.1]) {
        once(mark, () => {
          const x = heroAt(t) + 12;
          for (let i = 0; i < 3; i++)
            motes.push({ x: x + R.range(-2, 2), y: HEAD - R.range(0, 3), vx: R.range(-8, 8), vy: -R.range(8, 20), life: R.range(0.2, 0.36), age: 0, c: R.chance(0.5) ? PINK : WHITE, spark: true });
          motes.push({ x: (TRAVEL - heroAt(t)) + R.range(-2, 2), y: HEAD - R.range(0, 3), vx: R.range(-8, 8), vy: -R.range(8, 20), life: R.range(0.2, 0.36), age: 0, c: WHITE, spark: true });
        });
      }
      // ring + motes physics
      for (const s of streaks) { s.age = (s.age ?? 0) + dt; s.x += s.vx * dt; }
      for (const m of motes) {
        m.age += dt;
        m.x += m.vx * dt;
        if (m.spark) { m.vy += 140 * dt; m.y += m.vy * dt; }
        else { m.vy += 60 * dt; m.y = Math.min(-0.5, m.y + m.vy * dt); m.vx *= 1 - 3 * dt; }
      }
      for (let i = streaks.length - 1; i >= 0; i--) if (streaks[i].age >= streaks[i].life) streaks.splice(i, 1);
      for (let i = motes.length - 1; i >= 0; i--) if (motes[i].age >= motes[i].life) motes.splice(i, 1);
    },

    // behind the two of them: his after-images (silhouette copies on the same 12 fps steps the rig reads), then dust
    drawBack(p) {
      const GHOST = C[3];
      for (let k = 4; k >= 1; k--) {
        const tg = t - k / 12;
        const inSwap = tg > SWAP1 + 0.04 && tg < LAND1, back = tg > SWAP2 + 0.04 && tg < LAND2;
        if (!inSwap && !back) continue;
        const pose = poseAt(act.poses, tg), r = posed(pose), a = 0.22 * (1 - k / 5);
        for (let i = 0; i < r.n; i++) p.dot(pose.x + r.xs[i], r.ys[i], GHOST, a);
      }
      for (const m of motes) {
        if (m.spark) continue;
        const k = 1 - m.age / m.life;
        p.blend(m.x, m.y, m.c, k * 0.55);
        if (m.big) p.blend(m.x + 1, m.y - 1, m.c, k * 0.35);
      }
    },

    draw(p) {
      const k0 = t % D;
      // the swirl: streaks rip along the corridor, hot at the head
      for (const s of streaks) {
        if (s.kind === "flash") continue;
        const kk = 1 - s.age / s.life;
        for (let i = 0; i < s.len; i++) {
          const u = i / (s.len - 1 || 1);
          p.dot(s.x + (s.vx < 0 ? -i : i), s.y, u > 0.8 ? WHITE : s.c, kk * (1 - u * 0.7));
        }
      }
      // the halfway flash: a column of light where they cross
      for (const s of streaks) {
        if (s.kind !== "flash") continue;
        const u = (t - s.flash) / 0.14;
        if (u < 0 || u > 1) continue;
        const a = (1 - u) * (1 - u);
        p.glow(TRAVEL / 2, -24, 14 + 26 * u, PINK, 0.3 * a);
        for (let y = -50; y <= -2; y++) p.dot(TRAVEL / 2, y, WHITE, a * (1 - Math.abs(y + 26) / 52) * 0.9);
      }
      // the ring where the hands clap, tightening back onto the contact point as it fades
      if (mur.ring) {
        const u = (t - mur.ring.born) / 0.15;
        if (u > 0 && u < 1) {
          const r = mur.ring.r0 + (mur.ring.r1 - mur.ring.r0) * outE(u), a = (1 - u) * 0.9;
          for (let i = 0; i < 22; i++) {
            const th = (i / 22) * Math.PI * 2, x = mur.ring.x + Math.cos(th) * r, y = mur.ring.y + Math.sin(th) * r * 0.62;
            p.dot(x, y, i % 3 ? PINK : WHITE, a * (1 - Math.abs(th / Math.PI - 1) * 0.15));
          }
        } else if (u >= 1) mur.ring = null;
      }
      // sparks: bright, drop like sparks do
      for (const m of motes) {
        if (!m.spark) continue;
        const k = 1 - m.age / m.life;
        p.dot(m.x, m.y, m.c, k);
        if (k > 0.5) p.light(m.x, m.y, m.c, 0.5 * k);
      }
    },
  };
}
