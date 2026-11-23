// A clap of the hands, and in one snap of light he and the training dummy have traded places — no travel, a blink.
// The clap fires an anime impact frame (composed from impacts/impact-frame.js, centered on the hands), and the swap
// happens underneath it: the hero's x teleports on the key the white frame covers, and the dummy snaps to his old
// spot on the same beat. He claps again and they snap back.
// Built from core's primitives only. Nothing here is borrowed from Sprite Fusion's files.
import { Rng, clamp, fit, mix, hex, lerp, READY, poseAt, posed, createFrame, painterFor } from "../../core/index.js";
import { create as impactCreate } from "../impacts/impact-frame.js";

const CLAP1 = 0.24, SNAP1 = 0.3, CLAP2 = 1.24, SNAP2 = 1.3, D = 2.3, TRAVEL = 200, HEAD = -24;
const TELE = 1 / 60; // the teleport lives inside one 30 fps frame, hidden by the impact's white
const BLOW = 2; // the impact frame reads at twice its own pixel size, so the burst fills the room

export const meta = {
  name: "Boogie woogie",
  desc: "He claps his hands, an impact frame snaps the room white, and he and the training dummy have traded places; he claps again and they snap back.",
  tags: ["movement", "swap", "teleport", "clap", "impact", "boogie", "loop"],
  size: [320, 70],
  origin: [72, 58],
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

// ---- the act: the body. x leaves on the clap, lands on the key the impact's white covers.
const ANTIC = { crouch: 7, lean: -9, fx: -8, fy: -30, bx: -10, by: -28 };
const CLAP = { crouch: 5, lean: 10, fx: 13, fy: -25, bx: 11, by: -22 };
// arrival: he pops in a beat off balance, then finds his feet
const CATCH = { crouch: 9, lean: -3, fx: 10, fy: -18, bx: -8, by: -16, ffx: 8, ffy: -3, fbx: -13, fby: -4 };

export const act = {
  target: { x: TRAVEL },
  hits: [
    { t: CLAP1, stop: 0.06, shake: 0.14, amp: 1.6, target: false },
    { t: SNAP1, to: 0, glide: 0.02, push: 0, straw: 0, flash: 0 },
    { t: 0.4, push: 0.9, straw: 4, flash: 0.02 },
    { t: CLAP2, stop: 0.06, shake: 0.14, amp: 1.6, target: false },
    { t: SNAP2, to: TRAVEL, glide: 0.02, push: 0, straw: 0, flash: 0 },
    { t: 1.4, push: 0.9, straw: 4, flash: 0.02 },
  ],
  dust: [
    { t: SNAP1 + 0.08, x: 3, n: 5, dir: 1 }, { t: SNAP1 + 0.08, x: TRAVEL - 3, n: 5, dir: -1 },
    { t: 0.44, x: TRAVEL - 3, n: 6, dir: 1 }, { t: 0.44, x: 3, n: 4, dir: -1 },
    { t: SNAP2 + 0.08, x: TRAVEL - 3, n: 5, dir: 1 }, { t: SNAP2 + 0.08, x: 3, n: 5, dir: -1 },
    { t: 1.44, x: 4, n: 6, dir: 1 }, { t: 1.44, x: TRAVEL - 3, n: 4, dir: -1 },
  ],
  poses: [
    [0, { ...READY }],
    [0.12, ANTIC],
    [CLAP1, CLAP],
    [SNAP1, { ...CLAP, x: 0 }, "snap"],
    [SNAP1 + TELE, { ...CATCH, x: TRAVEL }],
    [0.44, { ...CATCH, x: TRAVEL }],
    [0.62, { ...READY, x: TRAVEL }],
    // the settled idle: one key far enough above the next that he breathes while he waits
    [1.12, { ...ANTIC, x: TRAVEL }],
    [CLAP2, { ...CLAP, x: TRAVEL }],
    [SNAP2, { ...CLAP, x: TRAVEL }, "snap"],
    [SNAP2 + TELE, { ...CATCH, x: 0 }],
    [1.44, { ...CATCH, x: 0 }],
    [1.62, { ...READY, x: 0 }],
    [D, { ...READY, x: 0 }],
  ],
};

// where the hero's feet are: the act's x, walked through the pose keys (it teleports on the TELE hop)
function heroAt(t) {
  const k = act.poses, e = { snap: () => 0 };
  if (t <= k[0][0]) return k[0][1].x ?? 0;
  for (let i = 0; i < k.length - 1; i++) {
    const [t0, a] = k[i], [t1, b, how] = k[i + 1];
    if (t >= t1) continue;
    const fn = e[how ?? ""] ?? ((u) => u * u * (3 - 2 * u));
    return lerp(a.x ?? 0, b.x ?? 0, fn(clamp((t - t0) / (t1 - t0))));
  }
  return k[k.length - 1][1].x ?? 0;
}

export function create(o) {
  const R = new Rng(o.seed), C = fit(o.palette, 6);
  const WHITE = C[5], PINK = C[4], GHOST = C[3];
  const [W, H] = meta.size, [OX, OY] = meta.origin;
  // the impact frame renders to a canvas-sized scratch, which blits through this effect's painter, so the
  // flash can never spill past our canvas however big the burst's reach wants to be
  const buf = createFrame(W, H), bp = painterFor(buf);
  let t = 0, flash = null, flashBorn = 0, flashAt = [OX + 12, OY + HEAD], before = 0;
  const fired = [], motes = [];
  const ring = { at: null };

  const once = (mark, fn) => {
    const cyc = Math.floor(t / D), key = cyc * 100 + mark;
    if (!fired.includes(key) && t % D >= mark) { fired.push(key); fn(); }
  };
  // a fresh impact frame each clap, so its 8 beats land exactly on this snap; centered on him, where he stands.
  // flashAt is where the mask's centre lands in the scratch's own (blown-up) pixels
  const fireFlash = (mark) => {
    flash = impactCreate({ palette: ["#0c0a14", "#f4efe4", "#f4efe4"], lines: 44, seed: R.int(1, 9) });
    flashBorn = t;
    flashAt = [Math.round((OX + heroAt(mark)) / BLOW), Math.round((OY - 26) / BLOW)];
  };
  // the clap: a ring and sparks from the hands. Fires as the freeze lifts, so it blooms as the flash resolves
  const clapAt = (mark) => {
    once(mark, () => {
      ring.at = { x: heroAt(mark) + 12, y: HEAD, born: t, span: 0.34 };
      for (let i = 0; i < 4; i++) {
        const a = R.range(-1.4, 1.4) - Math.PI / 2;
        motes.push({ x: ring.at.x, y: HEAD, vx: Math.cos(a) * R.range(60, 150), vy: Math.sin(a) * R.range(40, 120), life: R.range(0.1, 0.24), age: 0, c: R.chance(0.5) ? WHITE : PINK, spark: true });
      }
    });
  };
  // dust where each of them reappears, small and grey so the flash stays the loudest thing
  const puff = (x, dir, n = 5) => {
    const c = mix(hex("#8f8693"), GHOST, 0.2);
    for (let i = 0; i < n; i++)
      motes.push({ x: x + R.range(-3, 3), y: -1 - R.range(0, 2), vx: dir * R.range(25, 80), vy: -R.range(4, 20), life: R.range(0.14, 0.3), age: 0, big: R.chance(0.35), c });
  };

  return {
    update(dt) {
      before = t;
      t += dt;
      // ---- the snap: the impact frame first, the world resolving with the swap already done underneath
      for (const [mark, clap] of [[SNAP1, CLAP1], [SNAP2, CLAP2]]) once(mark, () => fireFlash(clap));
      if (flash) { flash.update(dt); if (t - flashBorn > 0.28) flash = null; }
      clapAt(CLAP1);
      clapAt(CLAP2);
      for (const [mark, here] of [[SNAP1 + 0.08, TRAVEL], [SNAP2 + 0.08, 0]]) {
        once(mark, () => {
          puff(here, here === 0 ? 1 : -1);
          puff(TRAVEL - here, here === 0 ? -1 : 1, 4);
        });
      }
      // a little magic clinging to the hands after each swap
      for (const mark of [0.88, 1.98]) {
        once(mark, () => {
          const x = heroAt(t) + 12;
          for (let i = 0; i < 3; i++)
            motes.push({ x: x + R.range(-2, 2), y: HEAD - R.range(0, 3), vx: R.range(-8, 8), vy: -R.range(8, 20), life: R.range(0.2, 0.36), age: 0, c: R.chance(0.5) ? PINK : WHITE, spark: true });
        });
      }
      for (const m of motes) {
        m.age += dt;
        m.x += m.vx * dt;
        m.vy += (m.spark ? 140 : 60) * dt;
        m.y = m.spark ? m.y + m.vy * dt : Math.min(-0.5, m.y + m.vy * dt);
      }
      for (let i = motes.length - 1; i >= 0; i--) if (motes[i].age >= motes[i].life) motes.splice(i, 1);
      // the loop came round once more: this cycle's one-shot events may fire again
      if (Math.floor(t / D) > Math.floor(before / D)) fired.length = 0;
    },

    drawBack(p) {
      // the fade echo: for a few frames his old shape lingers where he blinked from, then fingers off
      const ct = t % D;
      for (const [snap, back] of [[SNAP1, false], [SNAP2, true]]) {
        const u = (ct - snap) / 0.12;
        if (u <= 0 || u >= 1) continue;
        const pose = poseAt(act.poses, CLAP1), r = posed(pose), a = 0.5 * (1 - u);
        for (let i = 0; i < r.n; i++) p.dot((back ? TRAVEL : 0) + r.xs[i], r.ys[i], GHOST, a);
      }
      for (const m of motes) {
        if (m.spark) continue;
        const k = 1 - m.age / m.life;
        p.dot(m.x, m.y, m.c, k * 0.55);
        if (m.big) p.dot(m.x + 1, m.y - 1, m.c, k * 0.35);
      }
    },

    draw(p) {
      for (const m of motes) {
        if (!m.spark) continue;
        const k = 1 - m.age / m.life;
        p.dot(m.x, m.y, m.c, k);
        if (k > 0.5) p.light(m.x, m.y, m.c, 0.5 * k);
      }
      // the ring where the hands clapped, blooming as the flash resolves
      const ct = t % D;
      if (ring.at) {
        const u = (t - ring.at.born) / ring.at.span;
        if (u > 0 && u < 1) {
          const r = 3 + 14 * (1 - (1 - u) * (1 - u)), a = (1 - u) * 0.85;
          for (let i = 0; i < 22; i++) {
            const th = (i / 22) * Math.PI * 2, x = ring.at.x + Math.cos(th) * r, y = ring.at.y + Math.sin(th) * r * 0.62;
            p.dot(x, y, i % 3 ? PINK : WHITE, a);
          }
        } else if (u >= 1) ring.at = null;
      }
      // right at the clap, under the freeze: a hard cross of white at the hands, held for the two frame beat
      for (const clap of [CLAP1, CLAP2]) {
        if (ct < clap || ct > clap + 0.06) continue;
        const x = heroAt(clap) + 12, a = 0.65 + 0.35 * ((ct - clap) / 0.06);
        p.glow(x, HEAD, 12, WHITE, 0.5);
        for (let d = 0; d <= 4; d++) {
          p.dot(x + d, HEAD, WHITE, a); p.dot(x - d - 1, HEAD, WHITE, a);
          p.dot(x, HEAD + Math.round(d * 0.6), WHITE, a); p.dot(x, HEAD - Math.round(d * 0.6) - 1, WHITE, a);
        }
      }
      // the impact frame: two frames of white with a burst, two inverted, then lines pulling out past the edges.
      // Rendered on a canvas-sized scratch and blitted at twice its pixel size, in local coordinates, so the
      // burst reads over the whole width of the room; the mask is full-bleed, so the screen fully turns.
      if (flash) {
        buf.color.fill(0);
        bp.reset().place(flashAt[0], flashAt[1]);
        flash.draw(bp);
        const bw = Math.ceil(W / BLOW), bh = Math.ceil(H / BLOW);
        for (let by = 0; by < bh; by++)
          for (let bx = 0; bx < bw; bx++) {
            const c = buf.color[by * W + bx];
            if (c) p.rect(bx * BLOW - OX, by * BLOW - OY, BLOW, BLOW, c, 1);
          }
      }
    },
  };
}
