/* ============================================================
   Orbit Sling - pure rules (no DOM, unit tested)

   - a seeded random number generator
   - planet generation: same seed = same planets, harder as you go
   - inverse-square gravity
   - orbit maths: circular speed, escape speed, the sling kick
   - capture: do you go into orbit, or crash?
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
export const G = 2600;          // gravity strength: mu = G * r^2
export const SLING = 1.6;       // release speed = circular speed x this (escape is x1.41)
export const MAX_X = 230;       // planets stay within this many units of the centre line

/* 0 at the start, 1 by planet 30. Everything hard scales with it. */
export function difficulty(i) {
  return Math.min(1, Math.max(0, i) / 30);
}

/* One planet. Planet 0 is the big, easy home planet.
   Later planets are farther apart, further to the side and smaller,
   with a thinner capture zone. */
function planetAt(i, prev, rng) {
  if (i === 0) { return makePlanet(0, 0, 0, 36); }
  const d = difficulty(i);
  const gap = 230 + 140 * d + rng() * (40 + 60 * d);
  const side = (rng() * 2 - 1) * (50 + 170 * d);
  const x = Math.max(-MAX_X, Math.min(MAX_X, prev.x + side));
  const r = 34 - 14 * d + rng() * 6;
  return makePlanet(i, x, prev.y - gap, r);
}

function makePlanet(i, x, y, r) {
  const d = difficulty(i);
  return {
    i, x, y, r,
    mu: G * r * r,
    capture: r + 62 - 20 * d,          // enter this ring (not head-on) = orbit
    hue: i % 4                         // palette colour: neighbours always differ
  };
}

/* The first n planets for a seed. Always the same for the same seed. */
export function generatePlanets(seed, n) {
  const rng = makeRng(seed);
  const out = [];
  for (let i = 0; i < n; i++) { out.push(planetAt(i, out[i - 1], rng)); }
  return out;
}

/* A generator you can keep pulling from as the player climbs. */
export function planetStream(seed) {
  const rng = makeRng(seed);
  let prev = null;
  let i = 0;
  return () => { prev = planetAt(i, prev, rng); i += 1; return prev; };
}

/* ---- gravity ---- */

/* Acceleration on a point at (x, y) from one planet: mu / d^2,
   pointing at the planet. */
export function gravityFrom(p, x, y) {
  const dx = p.x - x;
  const dy = p.y - y;
  const d2 = Math.max(dx * dx + dy * dy, p.r * p.r);   // no infinities inside a planet
  const d = Math.sqrt(d2);
  const a = p.mu / d2;
  return { ax: (dx / d) * a, ay: (dy / d) * a };
}

export function circularSpeed(mu, radius) { return Math.sqrt(mu / radius); }
export function escapeSpeed(mu, radius) { return Math.sqrt((2 * mu) / radius); }

/* Velocity when you let go: along the orbit, with the sling kick. */
export function releaseVelocity(planet, angle, radius, dir) {
  const v = circularSpeed(planet.mu, radius) * SLING;
  /* Tangent to the circle. dir = +1 means the angle grows
     (clockwise on screen, where y points down), -1 the other way. */
  return { vx: -Math.sin(angle) * v * dir, vy: Math.cos(angle) * v * dir };
}

/* ---- capture ----
   Inside the capture ring you go into orbit, UNLESS you're diving
   almost straight at the planet: then gravity wins and you crash.
   Returns "orbit", "crash" or null (nothing happens yet). */
export const HEAD_ON = 0.9;     // cos of ~25 degrees

export function captureCheck(p, x, y, vx, vy, shipR = 5) {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= p.r + shipR) { return "crash"; }
  if (d > p.capture) { return null; }
  const speed = Math.hypot(vx, vy) || 1;
  const inward = -(dx * vx + dy * vy) / (d * speed);    // 1 = straight at the centre
  return inward > HEAD_ON ? null : "orbit";
}

/* Orbit radius after a capture: where you are, but never touching
   the surface and never outside the ring. */
export function orbitRadius(p, d) {
  return Math.max(p.r + 20, Math.min(p.capture - 6, d));
}

/* Which way round: +1 or -1, from the angular momentum. */
export function spinDir(p, x, y, vx, vy) {
  const cross = (x - p.x) * vy - (y - p.y) * vx;
  return cross >= 0 ? 1 : -1;
}

/* Camera zoom that fits two planets (and their rings) on screen. */
export function fitScale(a, b, w, h, pad = 70) {
  const spanX = Math.abs(a.x - b.x) + a.capture + b.capture + pad;
  const spanY = Math.abs(a.y - b.y) + a.capture + b.capture + pad;
  return Math.max(0.4, Math.min(1.15, w / spanX, h / spanY));
}
