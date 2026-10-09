/* ============================================================
   Slime Dash - pure rules (no DOM, unit tested)

   - a seeded random number generator
   - the jump: tap = small hop, hold = higher (variable height)
   - run speed that ramps up slowly
   - the level: seeded chunks of spikes, gaps, low ceilings and
     moving platforms, every one of them jumpable

   World units. x grows to the right, y grows DOWN, and the top
   of the ground is y = 0 (so things above it are negative).
   ============================================================ */

/* ---- seeded random (mulberry32) ---- */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- tuning ---- */
export const PHYS = Object.freeze({
  G: 2600,            // gravity, falling or not holding
  G_HOLD: 1150,       // gravity while rising AND holding: the "fly higher" part
  JUMP_V: 640,        // take-off speed
  CUT_V: 230,         // let go early: upward speed is cut to this
  MIN_HOLD: 0.07,     // every jump counts as held this long (a tap is never a dud)
  MAX_FALL: 1000,
  COYOTE: 0.1,        // can still jump this long after running off an edge
  BUFFER: 0.13,       // a press this long before landing still jumps
  SLIME_W: 30,
  SLIME_H: 26,
  SPIKE_W: 26,
  SPIKE_H: 24,
  BASE_SPEED: 260,
  MAX_SPEED: 440,
  RAMP_TIME: 150      // seconds to reach MAX_SPEED
});

/* Run speed after t seconds: eases up slowly, never past MAX. */
export function speedAt(t) {
  const k = Math.min(1, Math.max(0, t) / PHYS.RAMP_TIME);
  return PHYS.BASE_SPEED + (PHYS.MAX_SPEED - PHYS.BASE_SPEED) * k * (2 - k);
}

/* ---- the jump ----
   One step of vertical motion. body: { vy, jumpT, cut, air }.
   held = is the button down right now. Mutates body. */
export function stepVertical(body, held, dt) {
  if (body.air && body.jumpT >= 0) {
    body.jumpT += dt;
    const holding = held || body.jumpT < PHYS.MIN_HOLD;
    if (!holding && !body.cut && body.vy < -PHYS.CUT_V) { body.vy = -PHYS.CUT_V; }
    if (!holding) { body.cut = true; }
    const g = holding && !body.cut && body.vy < 0 ? PHYS.G_HOLD : PHYS.G;
    body.vy = Math.min(PHYS.MAX_FALL, body.vy + g * dt);
  } else {
    body.vy = Math.min(PHYS.MAX_FALL, body.vy + PHYS.G * dt);
  }
  return body;
}

export function startJump(body) {
  body.vy = -PHYS.JUMP_V;
  body.jumpT = 0;
  body.cut = false;
  body.air = true;
  return body;
}

/* Fly a jump on flat ground with the button held for `hold` seconds.
   Returns how high the feet got and how long it was in the air. */
export function jumpArc(hold, dt = 1 / 240) {
  const b = startJump({ vy: 0 });
  let y = 0, t = 0, top = 0;
  for (let i = 0; i < 2000; i++) {
    t += dt;
    stepVertical(b, t < hold, dt);
    y += b.vy * dt;
    top = Math.min(top, y);
    if (y >= 0 && b.vy > 0) { break; }
  }
  return { height: -top, air: t };
}

const FULL = jumpArc(10);
export const FULL_JUMP = Object.freeze({ height: FULL.height, air: FULL.air });
/* A quick tap on a phone is about a tenth of a second. */
export const TAP_JUMP = Object.freeze(jumpArc(0.1));

/* How far one full jump carries you at a given speed. */
export function maxJumpDistance(speed) {
  return speed * FULL_JUMP.air;
}

/* Gaps and spike rows are kept under this, measured at the SLOWEST
   speed, so they're always clearable (faster only helps). */
export const SAFE_JUMP = maxJumpDistance(PHYS.BASE_SPEED) * 0.62;

/* Low ceilings: the spike tips sit this high. A tap hop fits under,
   a held jump doesn't. */
export const CEILING_CLEAR = Math.ceil(TAP_JUMP.height + PHYS.SLIME_H + 26);

/* 0 at the start, 1 by chunk 40. */
export function difficulty(i) {
  return Math.min(1, Math.max(0, i) / 40);
}

/* ============================================================
   CHUNKS
   A chunk is a stretch of level, all in absolute x:
     floor     [[x0, x1], ...]    solid ground (gaps between)
     spikes    [{ x, w }]         on the ground
     ceilings  [{ x0, x1, y }]    y = where the spike tips are
     plats     [{ x, w, y0, y1, period, phase }]  moving up and down
     coins     [{ x, y }]
   ============================================================ */
const KINDS = [
  { kind: "flat",     from: 0 },
  { kind: "spikes",   from: 0 },
  { kind: "gap",      from: 0.05 },
  { kind: "ceiling",  from: 0.15 },
  { kind: "platform", from: 0.25 },
  { kind: "combo",    from: 0.5 }
];

function between(rng, a, b) { return a + (b - a) * rng(); }

/* Coins along a jump-ish arc from x0 to x1, peaking at height h. */
function coinArc(out, x0, x1, h, n) {
  for (let k = 0; k < n; k++) {
    const u = n === 1 ? 0.5 : k / (n - 1);
    out.push({ x: x0 + (x1 - x0) * u, y: -(16 + h * 4 * u * (1 - u)) });
  }
}
function coinLine(out, x0, x1, y, n) {
  for (let k = 0; k < n; k++) { out.push({ x: x0 + ((x1 - x0) * (k + 0.5)) / n, y }); }
}

function makeChunk(i, x, rng) {
  const d = difficulty(i);
  const c = { i, x, w: 0, kind: "flat", floor: [], spikes: [], ceilings: [], plats: [], coins: [] };
  const lead = Math.round(between(rng, 150, 190) - 30 * d);

  /* The first chunks are always calm: a fair, easy start. */
  let kind = "flat";
  if (i >= 2) {
    const open = KINDS.filter((k) => d >= k.from);
    kind = i < 4 ? "spikes" : open[Math.floor(rng() * open.length)].kind;
  }
  c.kind = kind;

  if (kind === "flat") {
    const w = Math.round(between(rng, 260, 380));
    c.floor.push([x, x + w]);
    if (i > 0) { coinLine(c.coins, x + 40, x + w - 40, -16, 4); }
    c.w = w;
  } else if (kind === "spikes") {
    const n = 1 + Math.floor(rng() * (1 + 2.4 * d));          // 1..3
    const sw = n * PHYS.SPIKE_W;
    const tail = 150;
    const w = lead + sw + tail;
    c.floor.push([x, x + w]);
    for (let k = 0; k < n; k++) { c.spikes.push({ x: x + lead + k * PHYS.SPIKE_W, w: PHYS.SPIKE_W }); }
    coinArc(c.coins, x + lead - 30, x + lead + sw + 30, n > 1 ? 110 : 60, 3 + n);
    c.w = w;
  } else if (kind === "gap") {
    const gap = Math.round(between(rng, 60, 80 + 60 * d));
    const tail = 150;
    c.floor.push([x, x + lead], [x + lead + gap, x + lead + gap + tail]);
    coinArc(c.coins, x + lead - 20, x + lead + gap + 20, 90, 4);
    c.w = lead + gap + tail;
  } else if (kind === "ceiling") {
    const len = Math.round(between(rng, 200, 300 + 80 * d));
    const tail = 140;
    c.floor.push([x, x + lead + len + tail]);
    c.ceilings.push({ x0: x + lead, x1: x + lead + len, y: -CEILING_CLEAR });
    /* Later: one spike underneath, so you must hop - but only hop. */
    if (d > 0.3) {
      const sx = x + lead + Math.round(len * between(rng, 0.45, 0.6));
      c.spikes.push({ x: sx, w: PHYS.SPIKE_W });
      coinArc(c.coins, sx - 30, sx + PHYS.SPIKE_W + 30, 40, 3);
    } else {
      coinLine(c.coins, x + lead + 30, x + lead + len - 30, -16, 4);
    }
    c.w = lead + len + tail;
  } else if (kind === "platform") {
    const g1 = Math.round(between(rng, 60, 100));
    const pw = Math.round(between(rng, 110 - 20 * d, 130 - 20 * d));
    const g2 = Math.round(between(rng, 60, 100));
    const tail = 150;
    const px = x + lead + g1;
    c.floor.push([x, x + lead], [px + pw + g2, px + pw + g2 + tail]);
    c.plats.push({ x: px, w: pw, y0: -20, y1: -Math.round(between(rng, 60, 90)),
      period: between(rng, 2.2, 3.2) - 0.5 * d, phase: rng() });
    coinLine(c.coins, px + 20, px + pw - 20, -110, 3);
    c.w = lead + g1 + pw + g2 + tail;
  } else {
    /* combo: a spike, a short run, then a gap */
    const gap = Math.round(between(rng, 70, 120));
    const run = 150;
    const tail = 150;
    const sx = x + lead;
    const gx = sx + PHYS.SPIKE_W + run;
    c.floor.push([x, gx], [gx + gap, gx + gap + tail]);
    c.spikes.push({ x: sx, w: PHYS.SPIKE_W });
    coinArc(c.coins, gx - 20, gx + gap + 20, 90, 4);
    c.w = gx + gap + tail - x;
  }
  return c;
}

/* A stream of chunks for a seed: call it to get the next one. */
export function chunkStream(seed) {
  const rng = makeRng(seed);
  let i = 0;
  let x = -200;               // a little ground behind the start
  return function next() {
    const c = makeChunk(i, x, rng);
    i += 1;
    x += c.w;
    return c;
  };
}

/* The first n chunks for a seed. Always the same for the same seed. */
export function generateChunks(seed, n) {
  const next = chunkStream(seed);
  return Array.from({ length: n }, () => next());
}

/* The jumps a chunk asks for, as [x0, x1]: the open air between
   things you can stand on (ground and moving platforms). */
export function jumpGaps(chunk) {
  const solid = [...chunk.floor, ...chunk.plats.map((p) => [p.x, p.x + p.w])].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let k = 1; k < solid.length; k++) {
    if (solid[k][0] > solid[k - 1][1]) { out.push([solid[k - 1][1], solid[k][0]]); }
  }
  return out;
}

/* Where a moving platform's top is at time t. */
export function platY(p, t) {
  const u = 0.5 - 0.5 * Math.cos(((t / p.period) + p.phase) * Math.PI * 2);
  return p.y0 + (p.y1 - p.y0) * u;
}

/* Score: one point per metre, five per coin. 40 units = 1 m. */
export const UNITS_PER_M = 40;
export function scoreFor(distance, coins) {
  return Math.floor(Math.max(0, distance) / UNITS_PER_M) + coins * 5;
}

/* Box overlap, with an inset to be kind to the player. */
export function overlaps(a, b, inset = 0) {
  return a.x0 + inset < b.x1 && a.x1 - inset > b.x0 &&
         a.y0 + inset < b.y1 && a.y1 - inset > b.y0;
}
