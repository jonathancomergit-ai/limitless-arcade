/* ============================================================
   Stack Tower - game rules (pure, no DOM)

   The physics lives in physics.js. This file is the small stuff
   around it: block sizes, the sliding block, Perfect drops and
   scoring. Unit tested in tests/unit/stack-tower.test.js.
   ============================================================ */

export const GAME = Object.freeze({
  BLOCK_H: 0.5,          // m
  MIN_W: 1.5,            // m: block widths vary a little
  MAX_W: 2.1,
  BASE_W: 2.8,           // the stone base the tower stands on
  RANGE: 2.3,            // the slider swings this far either side of 0
  GAP: 1.4,              // slider's bottom sits this far above the tower top
  SPEED0: 1.9,           // m/s at the start...
  SPEED_MAX: 3.6,        // ...up to this
  PERFECT: 0.1,          // m: land this close to centred = Perfect!
  POINTS: 10,            // per block that lands
  BONUS: 25,             // extra for a Perfect drop
  FALL_LINE: -0.3,       // a block's centre below this (base top = 0) = game over
  NEXT_DELAY: 0.4        // s after a landing before the next block appears
});

/* Small seeded random numbers (mulberry32). */
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

/* Width of the next block, from a 0..1 random number. */
export function blockWidth(r) {
  return Math.round((GAME.MIN_W + (GAME.MAX_W - GAME.MIN_W) * r) * 100) / 100;
}

/* The slider speeds up slowly as the tower grows. */
export function sliderSpeed(blocks) {
  return Math.min(GAME.SPEED_MAX, GAME.SPEED0 + 0.06 * blocks);
}

/* Back and forth between -RANGE and +RANGE. Returns the next x
   and direction after moving for dt seconds. */
export function slide(x, dir, speed, dt, range = GAME.RANGE) {
  let nx = x + dir * speed * dt, nd = dir;
  if (nx > range) { nx = 2 * range - nx; nd = -1; }
  if (nx < -range) { nx = -2 * range - nx; nd = 1; }
  return { x: Math.max(-range, Math.min(range, nx)), dir: nd };
}

/* dx: landed block's centre minus the centre of what it landed on. */
export function isPerfect(dx) {
  return Math.abs(dx) <= GAME.PERFECT;
}

export function pointsFor(perfect) {
  return GAME.POINTS + (perfect ? GAME.BONUS : 0);
}

/* Height in metres, to one decimal place, for the HUD and save. */
export function roundHeight(h) {
  return Math.max(0, Math.round(h * 10) / 10);
}
