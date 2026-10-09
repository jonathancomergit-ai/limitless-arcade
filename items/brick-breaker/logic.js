/* ============================================================
   Brick Breaker+ - pure rules (no DOM, unit tested)

   - the field: a fixed 400 x 560 box (x right, y down)
   - circle vs rectangle: overlap, and a SWEPT test that finds
     the first touch along the whole move, so a fast ball can
     never skip through a brick
   - moving a ball for one step: walls, bricks, paddle, with
     several bounces in one step if it needs them
   - the paddle: where you hit it sets the bounce angle
   - levels: parse the hand-made ones, generate endless ones
   ============================================================ */

export const FIELD = Object.freeze({ w: 400, h: 560 });

export const GRID = Object.freeze({
  cols: 10,
  left: 8,
  top: 44,
  cellW: (400 - 16) / 10,   // 38.4
  cellH: 18
});

export const BALL_R = 6;
export const PADDLE_Y = 516;
export const PADDLE_H = 12;
export const MAX_BOUNCE = (60 * Math.PI) / 180;   // furthest from straight up

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

/* ============================================================
   CIRCLE vs RECTANGLE
   rect: { x, y, w, h }
   ============================================================ */

/* Does the circle overlap the rectangle right now? If so, which
   way is "out" (the normal) and how deep is it? */
export function circleRect(cx, cy, r, rect) {
  const qx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const qy = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - qx, dy = cy - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) { return null; }
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }
  /* centre inside the rectangle: push out the nearest side */
  const sides = [
    { nx: -1, ny: 0, depth: cx - rect.x + r },
    { nx: 1, ny: 0, depth: rect.x + rect.w - cx + r },
    { nx: 0, ny: -1, depth: cy - rect.y + r },
    { nx: 0, ny: 1, depth: rect.y + rect.h - cy + r }
  ];
  return sides.reduce((a, b) => (b.depth < a.depth ? b : a));
}

/* The first moment t (0..1) a circle moving from (px, py) by
   (dx, dy) touches the rectangle, with the surface normal there.
   Faces are the rectangle grown by r; corners are circles of r.
   Returns null if it doesn't touch during this move. */
export function sweepCircleRect(px, py, dx, dy, r, rect) {
  const x0 = rect.x, x1 = rect.x + rect.w, y0 = rect.y, y1 = rect.y + rect.h;

  /* already touching: only counts if moving inward */
  const now = circleRect(px, py, r, rect);
  if (now) {
    return dx * now.nx + dy * now.ny < 0 ? { t: 0, nx: now.nx, ny: now.ny } : null;
  }

  let best = null;
  const consider = (t, nx, ny) => {
    if (t >= 0 && t <= 1 && (!best || t < best.t)) { best = { t, nx, ny }; }
  };

  /* four faces */
  if (dx > 0) { const t = (x0 - r - px) / dx; const y = py + dy * t; if (y >= y0 && y <= y1) { consider(t, -1, 0); } }
  if (dx < 0) { const t = (x1 + r - px) / dx; const y = py + dy * t; if (y >= y0 && y <= y1) { consider(t, 1, 0); } }
  if (dy > 0) { const t = (y0 - r - py) / dy; const x = px + dx * t; if (x >= x0 && x <= x1) { consider(t, 0, -1); } }
  if (dy < 0) { const t = (y1 + r - py) / dy; const x = px + dx * t; if (x >= x0 && x <= x1) { consider(t, 0, 1); } }

  /* four corners */
  const a = dx * dx + dy * dy;
  if (a > 0) {
    for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const fx = px - cx, fy = py - cy;
      const b = 2 * (fx * dx + fy * dy);
      if (b >= 0) { continue; }                 // moving away from this corner
      const c = fx * fx + fy * fy - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) { continue; }
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      const hx = px + dx * t, hy = py + dy * t;
      /* only a real corner hit if the touch point is outside both face spans */
      if ((hx < x0 || hx > x1) && (hy < y0 || hy > y1)) { consider(t, (hx - cx) / r, (hy - cy) / r); }
    }
  }
  return best;
}

/* Mirror a velocity off a surface with normal (nx, ny). */
export function reflect(vx, vy, nx, ny) {
  const d = vx * nx + vy * ny;
  if (d >= 0) { return { vx, vy }; }          // already leaving
  return { vx: vx - 2 * d * nx, vy: vy - 2 * d * ny };
}

/* ---- the paddle ----
   offset: -1 (left end) .. 0 (middle) .. 1 (right end).
   Middle = straight up; ends = MAX_BOUNCE off to that side. */
export function paddleBounce(offset, speed) {
  const o = Math.max(-1, Math.min(1, offset));
  const a = o * MAX_BOUNCE;
  return { vx: Math.sin(a) * speed, vy: -Math.cos(a) * speed };
}

/* Never let a ball go (nearly) flat: that's a boring endless rally.
   Keeps the speed, nudges the angle to at least `min` off horizontal. */
export function unflatten(vx, vy, min = 0.22) {
  const s = Math.hypot(vx, vy);
  if (s === 0) { return { vx, vy }; }
  const a = Math.atan2(vy, vx);
  const off = Math.asin(Math.min(1, Math.abs(vy) / s));
  if (off >= min) { return { vx, vy }; }
  const sy = vy < 0 || (vy === 0 && a <= 0) ? -1 : 1;
  return { vx: Math.sign(vx || 1) * Math.cos(min) * s, vy: sy * Math.sin(min) * s };
}

/* ============================================================
   MOVE ONE BALL FOR ONE STEP
   ball:    { x, y, vx, vy }
   bricks:  [{ x, y, w, h, hp, ... }]  (hp > 0 = still there)
   paddle:  { x, w }  x = centre; its top is at PADDLE_Y
   Returns a list of what it hit, in order:
     { kind: "wall" | "brick" | "paddle", brick?, nx, ny, x, y }
   Bricks are NOT damaged here; the caller decides.
   ============================================================ */
const WALLS = [
  { x: -1000, y: -1000, w: 1000, h: FIELD.h + 2000 },          // left
  { x: FIELD.w, y: -1000, w: 1000, h: FIELD.h + 2000 },        // right
  { x: -1000, y: -1000, w: FIELD.w + 2000, h: 1000 }           // top
];

export function moveBall(ball, dt, bricks, paddle) {
  const hits = [];
  let left = dt;
  const pad = paddle ? { x: paddle.x - paddle.w / 2, y: PADDLE_Y, w: paddle.w, h: PADDLE_H } : null;
  const gone = new Set();           // bricks already hit this step

  for (let guard = 0; guard < 8 && left > 1e-9; guard++) {
    const dx = ball.vx * left, dy = ball.vy * left;
    let first = null;
    const test = (rect, kind, brick) => {
      const h = sweepCircleRect(ball.x, ball.y, dx, dy, BALL_R, rect);
      if (h && (!first || h.t < first.t)) { first = { ...h, kind, brick }; }
    };
    for (const w of WALLS) { test(w, "wall"); }
    for (const b of bricks) { if (b.hp > 0 && !gone.has(b)) { test(b, "brick", b); } }
    if (pad && ball.vy > 0) { test(pad, "paddle"); }

    if (!first) { ball.x += dx; ball.y += dy; break; }

    /* move to the touch, a hair back so we don't start inside */
    const t = Math.max(0, first.t - 1e-6);
    ball.x += dx * t; ball.y += dy * t;
    left -= left * first.t;

    if (first.kind === "paddle" && first.ny < -0.5) {
      const speed = Math.hypot(ball.vx, ball.vy);
      const v = paddleBounce((ball.x - paddle.x) / (paddle.w / 2), speed);
      ball.vx = v.vx; ball.vy = v.vy;
    } else {
      const v = reflect(ball.vx, ball.vy, first.nx, first.ny);
      ball.vx = v.vx; ball.vy = v.vy;
      if (first.kind !== "paddle") {
        const u = unflatten(ball.vx, ball.vy);
        ball.vx = u.vx; ball.vy = u.vy;
      }
    }
    if (first.brick) { gone.add(first.brick); }
    hits.push({ kind: first.kind, brick: first.brick, nx: first.nx, ny: first.ny, x: ball.x, y: ball.y });
  }
  return hits;
}

/* ============================================================
   LEVELS
   A level is rows of 10 characters:
     .  empty      1 2 3  a brick with that many hit points
   ============================================================ */
export function parseLevel(rows) {
  const bricks = [];
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const hp = "123".indexOf(ch) + 1;
      if (hp > 0) {
        bricks.push({
          col: c, row: r, hp, maxHp: hp,
          x: GRID.left + c * GRID.cellW, y: GRID.top + r * GRID.cellH,
          w: GRID.cellW, h: GRID.cellH
        });
      }
    });
  });
  return bricks;
}

/* An endless level for level number n (n >= 1). Seeded by n, so
   level 14 is always the same level 14. Mirrored, so it looks made. */
export function generateLevel(n) {
  const rng = makeRng(0x9E3779B1 ^ (n * 7919));
  const d = Math.min(1, n / 30);
  const rows = 5 + Math.floor(rng() * (2 + 2 * d));
  const fill = 0.55 + 0.3 * rng();
  const out = [];
  for (let r = 0; r < rows; r++) {
    const half = [];
    for (let c = 0; c < 5; c++) {
      if (rng() > fill) { half.push("."); continue; }
      const roll = rng() + d * 0.5 + (r < 2 ? 0.25 : 0);
      half.push(roll > 1.15 ? "3" : roll > 0.75 ? "2" : "1");
    }
    out.push(half.join("") + [...half].reverse().join(""));
  }
  /* never an empty (or nearly empty) level */
  if (out.join("").replace(/\./g, "").length < 14) { out[0] = "2222222222"; out[1] = "1111111111"; }
  return out;
}

/* ---- scoring ---- */
export function brickPoints(brick, destroyed) {
  return destroyed ? 50 * brick.maxHp : 10;
}

/* ---- power-ups ---- */
export const POWERS = Object.freeze([
  { id: "multi", label: "M", name: "Multi-ball", weight: 3 },
  { id: "wide",  label: "W", name: "Wide paddle", weight: 3 },
  { id: "slow",  label: "S", name: "Slow ball", weight: 2 },
  { id: "laser", label: "L", name: "Lasers", weight: 2 },
  { id: "life",  label: "+", name: "Extra life", weight: 1 }
]);

/* Pick a power-up from a 0..1 roll, by weight. */
export function pickPower(roll) {
  const total = POWERS.reduce((a, p) => a + p.weight, 0);
  let x = Math.max(0, Math.min(0.999999, roll)) * total;
  for (const p of POWERS) { if (x < p.weight) { return p; } x -= p.weight; }
  return POWERS[0];
}
