/* ============================================================
   Timeless Mini - rules (items/timeless-mini/logic.js)
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RULES, drainClock, hitClock, killClock, waveAt, waveConfig, pickKind,
  nearest, stickVector, keyVector, createPool, edgePoint, formatClock, formatTime
} from "../../items/timeless-mini/logic.js";

test("the clock: starts at 30, drains 1 s per second, hit -3, kill +1", () => {
  assert.equal(RULES.startTime, 30);
  assert.equal(drainClock(30, 1), 29);
  assert.equal(drainClock(0.5, 1), 0, "never below zero");
  assert.equal(hitClock(10), 7);
  assert.equal(hitClock(2), 0, "a hit can't go below zero");
  assert.equal(killClock(10), 11);
  assert.equal(killClock(RULES.maxClock), RULES.maxClock, "capped");
});

test("waves change every 20 s", () => {
  assert.equal(waveAt(0), 1);
  assert.equal(waveAt(19.9), 1);
  assert.equal(waveAt(20), 2);
  assert.equal(waveAt(65), 4);
  assert.equal(waveAt(-5), 1);
});

test("each wave is harder: more enemies, faster, more often", () => {
  for (let w = 1; w < 12; w++) {
    const a = waveConfig(w), b = waveConfig(w + 1);
    assert.ok(b.spawnEvery <= a.spawnEvery, `spawnEvery wave ${w}`);
    assert.ok(b.maxAlive >= a.maxAlive, `maxAlive wave ${w}`);
    assert.ok(b.speed >= a.speed, `speed wave ${w}`);
  }
  assert.ok(waveConfig(3).maxAlive > waveConfig(1).maxAlive);
  assert.ok(waveConfig(3).speed > waveConfig(1).speed);
});

test("wave 1 is gentle: chasers only, few at a time", () => {
  const c = waveConfig(1);
  assert.equal(c.dasherChance, 0);
  assert.equal(c.bruteChance, 0);
  assert.ok(c.maxAlive <= 5);
  for (let r = 0; r < 1; r += 0.05) { assert.equal(pickKind(1, r), "chaser"); }
  assert.equal(pickKind(5, 0), "brute");
  assert.equal(pickKind(5, 0.99), "chaser");
});

test("nearest skips dead and still-spawning enemies", () => {
  const list = [
    { alive: true, x: 5, y: 0, warn: 0.5 },   // spawning - not a target
    { alive: false, x: 6, y: 0 },
    { alive: true, x: 50, y: 0, warn: 0 },
    { alive: true, x: 20, y: 0, warn: 0 }
  ];
  assert.equal(nearest({ x: 0, y: 0 }, list), 3);
  assert.equal(nearest({ x: 0, y: 0 }, list, 10), -1, "out of range");
  assert.equal(nearest({ x: 0, y: 0 }, []), -1);
});

test("the virtual stick: direction, clamp, dead zone", () => {
  assert.deepEqual(stickVector(0, 0, 0, 0), { x: 0, y: 0 });
  assert.deepEqual(stickVector(0, 0, 2, 0, 46), { x: 0, y: 0 }, "dead zone");
  const half = stickVector(0, 0, 23, 0, 46);
  assert.ok(Math.abs(half.x - 0.5) < 1e-9);
  const far = stickVector(10, 10, 10, 500, 46);
  assert.ok(Math.abs(far.y - 1) < 1e-9 && far.x === 0, "clamped to length 1");
});

test("keyboard diagonals are not faster", () => {
  const v = keyVector(false, true, true, false);
  assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9);
  assert.deepEqual(keyVector(true, true, false, false), { x: 0, y: 0 });
});

test("pool: reuses objects, never grows", () => {
  const pool = createPool(3, () => ({ hp: 1 }));
  const a = pool.spawn({ hp: 5 });
  pool.spawn({}); pool.spawn({});
  assert.equal(pool.count(), 3);
  assert.equal(pool.spawn({}), null, "full");
  a.alive = false;
  const again = pool.spawn({});
  assert.equal(again, a, "same object reused");
  assert.equal(again.hp, 1, "reset to defaults");
  pool.clear();
  assert.equal(pool.count(), 0);
  assert.equal(pool.items.length, 3);
});

test("enemies appear at the edge, away from the player", () => {
  let seed = 1;
  const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const player = { x: 200, y: 300 };
  for (let i = 0; i < 200; i++) {
    const p = edgePoint(400, 600, player, rng);
    const onEdge = p.x <= 22 || p.y <= 22 || p.x >= 378 || p.y >= 578;
    assert.ok(onEdge, `not on the edge: ${JSON.stringify(p)}`);
    assert.ok(Math.hypot(p.x - player.x, p.y - player.y) >= 150);
  }
});

test("clock text", () => {
  assert.equal(formatClock(30), "0:30.0");
  assert.equal(formatClock(27.36), "0:27.3");
  assert.equal(formatClock(65.4), "1:05.4");
  assert.equal(formatClock(-1), "0:00.0");
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(0), "0:00");
});
