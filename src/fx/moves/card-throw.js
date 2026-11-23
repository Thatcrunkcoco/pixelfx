// He thumbs a playing card out of the deck at his hip — its patterned back to you as the purple aura pours
// into it — then flicks it off flat with a snap of the wrist. The card glides level across the room, tumbling
// face over edge like a frisbee, trailed by violet light, and the moment it touches the dummy the charge goes
// off in a burst of purple plasma, and the straw takes it.
import { Rng, clamp, fit, TAU, WHITE, hex, READY, PAL, chain } from "../../core/index.js";
import * as blast from "../explosions/plasma-explosion.js";

const THROW = 1.0, FLY = 0.5, HIT = THROW + FLY, D = HIT + 3.2, SPEED = 330, TX = 190, CY = -24;

export const meta = {
  name: "Card throw",
  desc: "He thumbs out a playing card, the purple aura pours into its patterned back, and he flicks it tumbling flat across the room; it detonates on the straw in a burst of purple plasma.",
  tags: ["move", "arcane", "card", "deck", "projectile", "explosion", "one-shot"],
  size: [356, 260],
  origin: [64, 214],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { seed: 1 },
};

// ---- the card itself: the back of a playing card — the one thing everyone recognises — paper white rimmed in
// ink with a red patterned field. While the aura pours in, it's held upright like a hand of cards shows it; in
// flight it lies flat and tumbles over a couple of times like a frisbee. The suit doesn't matter: just the read.
const INK = hex("#262a36"), RED = hex("#c03343"), PAPER = hex("#eef0e4"), EDGE = hex("#3a3040");
// the card: a tiny ace wearing an aura of purple light, with its own slot in the chain
export const spinCard = {
  meta: { name: "card", duration: 4, loop: false, fps: 30, bg: "ground", size: [96, 64], origin: [48, 32], options: { palette: PAL.arcane, spin: 26, hold: 0 } },
  create(o) {
    const R = new Rng(o.seed), C = fit(o.palette, 8);
    const VIO = [C[3], C[4], C[5]]; // the aura steps: deep, bright, pale
    const hold = o.hold, span = hold > 0 ? hold : 0.5, spin = o.spin;
    let t = 0;
    const trail = [];
    const charged = () => {
      const u = clamp(t / span);
      return hold > 0 ? u * u : Math.min(1, 0.8 + u * 0.2);
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
        const a = charged();
        // the trail: violet particles riding off the back of the card while it cuts the air
        if (hold === 0 && t > 0.05) {
          trail.push({ x: R.range(-2, 2), y: R.range(-3, 3) + t * 0.4, vx: R.range(-26, -58), vy: R.range(-9, 13), age: 0, life: R.range(0.3, 0.55), c: R.chance(0.68) ? VIO[1] : VIO[2] });
          trail.push({ x: R.range(-2, 2), y: R.range(-2, 2), vx: R.range(-40, -90), vy: R.range(-16, 6), age: 0, life: R.range(0.2, 0.4), c: VIO[0] });
        }
        for (const m of trail) {
          const k = 1 - m.age / m.life;
          p.dot(m.x, m.y, m.c, k * 0.8);
          if (k > 0.5) p.dot(m.x * 0.92, m.y * 0.92, VIO[0], k * 0.35);
        }
        // the aura: a glow wrapping the card, plus orbiting wisps that tighten as it pours in
        p.glow(0, 0, 8 + 3 * a, VIO[1], 0.3 * a);
        p.glow(0, 0, 3, WHITE, 0.12 * a);
        const orbit = hold > 0 ? 9 - 4 * a : 8 + Math.sin(t * 9) * 1.4;
        for (let i = 0; i < 5; i++) {
          const th = t * 7 + (i / 5) * TAU, x = Math.cos(th) * orbit, y = Math.sin(th) * orbit * 0.62;
          p.dot(x, y, VIO[i % 3], 0.75 * a);
          p.dot(x * 0.82, y * 0.82, VIO[i % 3], 0.3 * a);
        }
        // the card body. Held: upright, face-on, the patterned back plain to see. Flying: flat, a horizontal
        // card wobbling through its tumble — face, then edge-on, face again — like a thrown frisbee from the side
        if (hold > 0) {
          const w = Math.round(5 * Math.abs(Math.cos(t * spin))) * 2 - 1; // 9..3..1 as the slow spin turns it
          const top = -6, bot = 6;
          for (let y = top; y <= bot; y++)
            for (let x = -(w - 1) / 2; x <= (w - 1) / 2; x++) {
              const border = Math.abs(x) > (w - 1) / 2 - 1 || y === top || y === bot;
              const back = !border && Math.abs(x) <= (y === 0 ? 2 : 1); // the white diamond of the card's pattern
              p.dot(x, y, border ? EDGE : back ? PAPER : RED, 1);
            }
        } else {
          const face = Math.abs(Math.cos(t * spin + 0.5)) > 0.62; // tumbling: face, edge, face...
          for (let y = face ? -1 : 0; y <= (face ? 1 : 0); y++)
            for (let x = -5; x <= 5; x++) {
              const border = face && (y !== 0 || Math.abs(x) > 3.6);
              p.dot(x, y, border ? EDGE : face && y === 0 && Math.abs(x) < 2 ? RED : PAPER, 1);
            }
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
  // the beginning: the thumbing and the infusion — the dealt face shows while the aura pours in
  { fx: spinCard, t: 0.08, until: THROW, x: 10, y: CY - 5, hold: THROW - 0.08, spin: 2.2 },
  // the middle: flicked flat. It flies level, spinning frisbee-style, blank now, ringed in violet particles
  { fx: spinCard, t: THROW, until: HIT, x: (t) => 16 + (t - THROW) * SPEED, y: CY - 5, spin: 14 },
  // the end: it touches straw and the charge goes off — a plasma burst, not a magical flourish
  { fx: blast, t: HIT, x: TX - 4, y: -50 },
]);
