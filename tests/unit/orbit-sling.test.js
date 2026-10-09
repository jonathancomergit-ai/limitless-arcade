/* ============================================================
   Orbit Sling - rules (items/orbit-sling/logic.js)
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeRng, generatePlanets, planetStream, difficulty, gravityFrom, circularSpeed,
  escapeSpeed, releaseVelocity, captureCheck, orbitRadius, spinDir, fitScale, SLING
} from "../../items/orbit-sling/logic.js";

test("the rng is seeded: same seed, same numbers", () => {
  const a = makeRng(42), b = makeRng(42), c = makeRng(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) { assert.ok(v >= 0 && v < 1); }
});

test("planets are the same for the same seed", () => {
  assert.deepEqual(generatePlanets(7, 40), generatePlanets(7, 40));
  assert.notDeepEqual(generatePlanets(7, 10), generatePlanets(8, 10));
  const s = planetStream(7);
  const streamed = Array.from({ length: 40 }, () => s());
  assert.deepEqual(streamed, generatePlanets(7, 40));
});

test("planets climb upward and never overlap", () => {
  for (const seed of [1, 2, 3, 99, 12345]) {
    const ps = generatePlanets(seed, 60);
    for (let i = 1; i < ps.length; i++) {
      assert.ok(ps[i].y < ps[i - 1].y, "each planet is above the last");
      const d = Math.hypot(ps[i].x - ps[i - 1].x, ps[i].y - ps[i - 1].y);
      assert.ok(d > ps[i].capture + ps[i - 1].capture, `capture rings overlap at ${i}`);
      assert.ok(ps[i].r > 0 && ps[i].capture > ps[i].r + 20);
    }
  }
});

test("it gets gradually harder: smaller planets, bigger gaps", () => {
  assert.equal(difficulty(0), 0);
  assert.equal(difficulty(30), 1);
  assert.equal(difficulty(100), 1);
  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const early = [], late = [], earlyR = [], lateR = [];
  for (let seed = 1; seed <= 30; seed++) {
    const ps = generatePlanets(seed, 45);
    for (let i = 1; i <= 5; i++) { early.push(ps[i - 1].y - ps[i].y); earlyR.push(ps[i].r); }
    for (let i = 35; i < 45; i++) { late.push(ps[i - 1].y - ps[i].y); lateR.push(ps[i].r); }
  }
  assert.ok(avg(late) > avg(early) + 80, "gaps grow");
  assert.ok(avg(lateR) < avg(earlyR) - 8, "planets shrink");
});

test("gravity is inverse-square and points at the planet", () => {
  const p = { x: 0, y: 0, r: 10, mu: 1000 };
  const near = gravityFrom(p, 100, 0);
  const far = gravityFrom(p, 200, 0);
  assert.ok(near.ax < 0 && Math.abs(near.ay) < 1e-12, "pulls toward the planet");
  assert.ok(Math.abs(near.ax / far.ax - 4) < 1e-9, "twice as far = a quarter of the pull");
  assert.ok(Number.isFinite(gravityFrom(p, 0, 0).ax), "no infinity at the centre");
});

test("letting go is faster than escape speed, so you really leave", () => {
  const p = generatePlanets(1, 1)[0];
  const R = 80;
  const v = releaseVelocity(p, 0.3, R, 1);
  const speed = Math.hypot(v.vx, v.vy);
  assert.ok(Math.abs(speed - circularSpeed(p.mu, R) * SLING) < 1e-9);
  assert.ok(speed > escapeSpeed(p.mu, R));
  /* tangent: at right angles to the radius */
  assert.ok(Math.abs(Math.cos(0.3) * v.vx + Math.sin(0.3) * v.vy) < 1e-9);
});

test("capture: a glancing approach orbits, a head-on dive crashes", () => {
  const p = { x: 0, y: 0, r: 30, capture: 90, mu: 1 };
  assert.equal(captureCheck(p, 200, 0, -100, 0), null, "outside the ring");
  assert.equal(captureCheck(p, 80, 0, 0, -100), "orbit", "sideways into the ring");
  assert.equal(captureCheck(p, 80, 0, -100, 0), null, "straight in: no orbit");
  assert.equal(captureCheck(p, 33, 0, -100, 0), "crash", "touching the planet");
});

test("orbit radius stays off the surface and inside the ring", () => {
  const p = { r: 30, capture: 90 };
  assert.equal(orbitRadius(p, 10), 50);
  assert.equal(orbitRadius(p, 70), 70);
  assert.equal(orbitRadius(p, 200), 84);
});

test("spin direction follows the way you came in", () => {
  const p = { x: 0, y: 0 };
  assert.equal(spinDir(p, 50, 0, 0, 10), 1);
  assert.equal(spinDir(p, 50, 0, 0, -10), -1);
  /* and matches releaseVelocity: dir +1 at angle 0 moves +y */
  assert.ok(releaseVelocity({ mu: 100 }, 0, 10, 1).vy > 0);
});

test("the camera zoom fits both planets", () => {
  const a = { x: 0, y: 0, capture: 90 }, b = { x: 100, y: -300, capture: 80 };
  const s = fitScale(a, b, 390, 560);
  assert.ok((300 + 170) * s <= 560 && (100 + 170) * s <= 390);
  assert.ok(fitScale(a, { x: 0, y: -5000, capture: 80 }, 390, 560) >= 0.4, "never smaller than 0.4");
});
