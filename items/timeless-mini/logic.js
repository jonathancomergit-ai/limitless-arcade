/* ============================================================
   Timeless Mini - pure rules (no DOM, unit tested)

   Everything here is plain maths, so tests/unit/timeless-mini
   can check it in Node:
     - the clock (drain, hit, kill)
     - waves (when they change, how hard they are)
     - picking the nearest target
     - the virtual stick
     - a fixed-size object pool
     - where enemies appear
   ============================================================ */

/* ---- the clock is your health ---- */
export const RULES = Object.freeze({
  startTime: 30,    // seconds on the clock at the start
  drain: 1,         // seconds lost per second
  hitCost: 3,       // seconds lost when an enemy touches you
  killBonus: 1,     // seconds won back per kill
  maxClock: 99,     // the clock never goes above this
  waveLength: 20,   // a new, harder wave every 20 s
  invuln: 1.2,      // seconds of safety after a hit
  spawnWarn: 0.9    // seconds a spawn is shown before it can hurt
});

export function drainClock(clock, dt) {
  return Math.max(0, clock - RULES.drain * dt);
}

export function hitClock(clock) {
  return Math.max(0, clock - RULES.hitCost);
}

export function killClock(clock) {
  return Math.min(RULES.maxClock, clock + RULES.killBonus);
}

/* ---- waves ---- */

/* Wave number (1, 2, 3...) after `elapsed` seconds of play. */
export function waveAt(elapsed) {
  return 1 + Math.floor(Math.max(0, elapsed) / RULES.waveLength);
}

/* How hard a wave is. Wave 1 is gentle on purpose: slow chasers,
   one at a time, so the first 30 s teach the game. */
export function waveConfig(wave) {
  const w = Math.max(1, Math.floor(wave));
  return {
    spawnEvery: Math.max(0.4, 1.5 - 0.18 * (w - 1)),   // seconds between spawns
    maxAlive: Math.min(28, 3 + 2 * w),                  // never more than this at once
    speed: Math.min(2, 1 + 0.1 * (w - 1)),              // enemy speed multiplier
    dasherChance: w < 2 ? 0 : Math.min(0.35, 0.12 + 0.05 * (w - 2)),
    bruteChance: w < 3 ? 0 : Math.min(0.25, 0.08 + 0.04 * (w - 3))
  };
}

/* Which enemy to spawn, from a random number r in [0, 1). */
export function pickKind(wave, r) {
  const c = waveConfig(wave);
  if (r < c.bruteChance) { return "brute"; }
  if (r < c.bruteChance + c.dasherChance) { return "dasher"; }
  return "chaser";
}

/* ---- targeting ---- */

/* Index of the closest live, active thing within maxDist, or -1.
   list items need { alive, x, y } and optional { warn } (still
   spawning = not a target yet). */
export function nearest(from, list, maxDist = Infinity) {
  let best = -1;
  let bestD = maxDist * maxDist;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive || e.warn > 0) { continue; }
    const dx = e.x - from.x;
    const dy = e.y - from.y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) { bestD = d; best = i; }
  }
  return best;
}

/* ---- the virtual stick ---- */

/* Direction from where the thumb landed to where it is now.
   Length 0..1; a small dead zone stops jitter. */
export function stickVector(ox, oy, x, y, radius = 46, dead = 0.12) {
  const dx = x - ox;
  const dy = y - oy;
  const len = Math.hypot(dx, dy);
  if (len === 0) { return { x: 0, y: 0 }; }
  const mag = Math.min(1, len / radius);
  if (mag < dead) { return { x: 0, y: 0 }; }
  return { x: (dx / len) * mag, y: (dy / len) * mag };
}

/* Keyboard direction, normalised so diagonals aren't faster. */
export function keyVector(left, right, up, down) {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (down ? 1 : 0) - (up ? 1 : 0);
  const len = Math.hypot(x, y);
  return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

/* ---- pooling ----
   A fixed array of objects that get switched on and off, so the
   game makes no garbage while it plays. */
export function createPool(size, make) {
  const items = Array.from({ length: size }, () => ({ ...make(), alive: false }));
  return {
    items,
    /* Wake a sleeping object and copy init onto it. null if full. */
    spawn(init) {
      for (const it of items) {
        if (!it.alive) { Object.assign(it, make(), init, { alive: true }); return it; }
      }
      return null;
    },
    count() { let n = 0; for (const it of items) { if (it.alive) { n++; } } return n; },
    clear() { for (const it of items) { it.alive = false; } }
  };
}

/* ---- spawning ---- */

/* A point just inside the arena edge, at least minDist from the
   player when the arena is big enough. rng() returns [0, 1). */
export function edgePoint(w, h, player, rng = Math.random, minDist = 150, inset = 22) {
  let p = { x: inset, y: inset };
  for (let tries = 0; tries < 12; tries++) {
    const side = Math.floor(rng() * 4);
    const t = rng();
    if (side === 0) { p = { x: inset + t * (w - 2 * inset), y: inset }; }
    else if (side === 1) { p = { x: w - inset, y: inset + t * (h - 2 * inset) }; }
    else if (side === 2) { p = { x: inset + t * (w - 2 * inset), y: h - inset }; }
    else { p = { x: inset, y: inset + t * (h - 2 * inset) }; }
    if (Math.hypot(p.x - player.x, p.y - player.y) >= minDist) { return p; }
  }
  return p;
}

/* ---- text ---- */

/* 27.35 -> "0:27.3" (the big clock). Never shows a negative. */
export function formatClock(t) {
  const tenths = Math.floor(Math.max(0, t) * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}

/* 65.4 -> "1:05" (time survived, best). */
export function formatTime(t) {
  const s = Math.floor(Math.max(0, t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
