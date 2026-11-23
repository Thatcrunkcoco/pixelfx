// He thumbs a playing card out of the deck at his hip, lets it hang in his fingers while the purple aura pours
// into it, then flicks it across the room. The card spins as it flies, trailing violet light, and the moment it
// touches the dummy it detonates: the arcane release inside pops out in a flash of rings and runes, and the straw
// man takes the hit. A beginning (the draw and the infusion), a middle (the flight) and an end (the blast).
import { Rng, clamp, ease, fit, lerp, TAU, WHITE, READY, PAL, chain } from "../../core/index.js";
import * as blast from "../explosions/plasma-explosion.js";

const THROW = 1.0, FLY = 0.5, HIT = THROW + FLY, D = HIT + 3.2, SPEED = 330, TX = 190, CY = -22;

export const meta = {
  name: "Card throw",
  desc: "He thumbs out a playing card, the purple aura pours into it, and he flicks it spinning across the room; it detonates on the straw in a burst of purple plasma.",
  tags: ["move", "arcane", "card", "projectile", "explosion", "one-shot"],
  size: [356, 260],
  origin: [64, 214],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { seed: 1, palette: PAL.arcane },
};

// ---- the flying card: a tiny spinning ace wearing an aura of purple light. Drawn face-on with a horizontal
// squash for the spin (the pixel-art way), a diamond pip when the face shows, and a glowless edge line.
const CARD = { w: 9, h: 12 };
const spinCard = {
  meta: { name: "card", duration: 4, loop: false, fps: 30, bg: "ground", size: [96, 64], origin: [48, 32], options: { palette: PAL.arcane, spin: 26, hold: 0 } },
  create(o) {
    const R = new Rng(o.seed), C = fit(o.palette, 8);
    const VIO = [C[3], C[4], C[5]]; // the aura steps: deep, bright, pale
    const hold = o.hold, span = hold > 0 ? hold : 0.5, spin = o.spin;
    let t = 0;
    const trail = [];
    const drawn = () => { // aura strength: pours in over the hold, held at full in flight
      const u = clamp(t / span);
      return hold > 0 ? u * u : Math.min(1, 0.75 + u * 0.25);
    };
    return {
      update(dt) {
        t += dt;
        for (const m of trail) { m.age += dt; m.x += m.vx * dt; m.y += m.vy * dt; }
        for (let i = trail.length - 1; i >= 0; i--) if (trail[i].age > trail[i].life) trail.splice(i, 1);
      },
      done() { return t > 4.5; },
      draw(p, layer) {
        if (layer === "back") return;
        const a = drawn();
        // the trail: purple motes sloughing off behind the card (flight only — they'd pool in the hand)
        if (hold === 0 && t > 0.05) {
          trail.push({ x: R.range(-2, 2), y: R.range(-3, 3) + t * 0.5, vx: R.range(-26, -58), vy: R.range(-9, 13), age: 0, life: R.range(0.3, 0.55), c: R.chance(0.68) ? VIO[1] : VIO[2] });
          trail.push({ x: R.range(-2, 2), y: R.range(-2, 2), vx: R.range(-40, -90), vy: R.range(-16, 6), age: 0, life: R.range(0.2, 0.4), c: VIO[0] });
        }
        for (const m of trail) {
          const k = 1 - m.age / m.life;
          p.dot(m.x, m.y, m.c, k * 0.8);
          if (k > 0.5) p.dot(m.x * 0.92, m.y * 0.92, VIO[0], k * 0.35);
        }
        // the aura: a glow wrapping the card, plus orbiting wisps that tighten as it pours in
        p.glow(0, 0, 8 + 3 * a, VIO[1], 0.32 * a);
        p.glow(0, 0, 3, WHITE, 0.14 * a);
        const orbit = hold > 0 ? 9 - 4 * a : 8 + Math.sin(t * 9) * 1.4;
        for (let i = 0; i < 5; i++) {
          const th = t * 7 + (i / 5) * TAU, x = Math.cos(th) * orbit, y = Math.sin(th) * orbit * 0.62;
          p.dot(x, y, VIO[i % 3], 0.75 * a);
          p.dot(x * 0.82, y * 0.82, VIO[i % 3], 0.3 * a);
        }
        // the card itself: spinning about its vertical axis, so the width pulses 5-3-1-3 as the face turns
        const ph = t * spin, face = Math.abs(Math.cos(ph)), w = Math.max(1, Math.round(CARD.w * face / 2) * 2 - 1), h = CARD.h, W = C[6], edge = C[2], pip = C[4];
        for (let yy = -h / 2; yy < h / 2; yy++)
          for (let xx = -w / 2; xx <= w / 2; xx++) {
            const border = Math.abs(xx) > w / 2 - (w > 2 ? 1.6 : 0.6) || Math.abs(yy) > h / 2 - 1.1;
            p.dot(xx, yy, border ? edge : W, 1);
          }
        if (w >= 3) { // the ace of diamonds: a purple pip, proud on the face
          for (let d = 0; d <= 2; d++) {
            p.dot(d, -d + 1, pip, 1); p.dot(-d, -d + 1, pip, 1);
            p.dot(d, d - 1, pip, 1); p.dot(-d, d - 1, pip, 1);
          }
          p.dot(0, 1, VIO[2], 1); // its shine
        }
      },
    };
  },
};

// ---- the act: card up in the off hand, a snap of the wrist to flick it, then he watches his work
const DRAWN = { ...READY, x: -2, crouch: 3, lean: -2, fx: 8, fy: -27, bx: 12, by: -17, ffx: 8, fbx: -8 };
const INFUSE = { ...DRAWN, crouch: 4, lean: -4, fx: 10, fy: -28, bx: 14, by: -15 };
const FLICK = { ...READY, x: 6, crouch: 4, lean: 7, fx: 17, fy: -21, bx: -7, by: -27, ffx: 13, fbx: -10, toeB: true };
const WATCH = { ...READY, x: 5, crouch: 4, lean: 4, fx: 14, fy: -20, bx: -3, by: -24 };
export const act = {
  target: { x: TX },
  poses: [
    [-0.42, { ...READY, x: -2 }],
    [0.06, DRAWN],
    [0.5, INFUSE],
    [THROW - 0.05, { ...INFUSE, crouch: 6, lean: -6, fx: 7, fy: -24 }], // coil the wrist
    [THROW, FLICK, "snap"],
    [HIT - 0.02, WATCH],
    [HIT, { ...WATCH, lean: 2, crouch: 5 }, "snap"],
    [HIT + 0.7, { ...WATCH, crouch: 3, lean: -1 }],
    [HIT + 1.4, { ...READY, x: 2 }],
    [HIT + 2.1, { ...READY, x: -2 }],
    [D, { ...READY, x: -2 }],
  ],
  hits: [
    { t: HIT, stop: 0.16, shake: 0.34, amp: 2.6, push: 3, straw: 26, flash: 0.05, skin: "char" },
    { t: HIT + 2.6, push: 0, straw: 0, flash: 0, skin: null },
  ],
  dust: [{ t: THROW, x: 15, n: 6, dir: 1 }],
};

export const create = chain([
  // the beginning: cards out, the thumbing and the infusion, aura pouring into it while it hangs in his fingers
  { fx: spinCard, t: 0.08, until: THROW, x: 10, y: CY - 4, hold: THROW - 0.08, spin: 5 },
  // the middle: flicked. It flies flat and fast, spinning hard, shedding violet light
  { fx: spinCard, t: THROW, until: HIT, x: (t) => 16 + (t - THROW) * SPEED, y: (t) => CY - 2 - 14 * Math.sin(((t - THROW) / FLY) * Math.PI), spin: 26 },
  // the end: it touches straw and the charge goes off — a plasma burst, not a magical flourish. The palette is
  // the aura's own ramp (reset to the arcane blues, with the violets kept for the accented shells and arcs)
  { fx: blast, t: HIT, x: TX - 4, y: -50 },
]);
