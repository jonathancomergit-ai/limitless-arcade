/* ============================================================
   Gravity Golf - physics + levels (items/gravity-golf/)
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIELD, PHYS, makeBall, launch, stepBall, pullAt, shotVelocity, previewPath,
  simulateShot, scoreName, checkLevel
} from "../../items/gravity-golf/logic.js";
import { LEVELS } from "../../items/gravity-golf/levels.js";

const run = (lv, angle, power, steps) => {
  const b = launch(makeBall(lv.ball.x, lv.ball.y), angle, power);
  const events = [];
  for (let i = 0; i < steps && b.moving; i++) { const e = stepBall(b, lv); if (e) { events.push(e.type); } }
  return { b, events };
};

test("the physics step is deterministic", () => {
  for (const lv of LEVELS) {
    for (const [a, p] of [[-1.2, 0.5], [-2, 0.9], [0.3, 0.2]]) {
      assert.deepEqual(run(lv, a, p, 900), run(lv, a, p, 900));
      assert.deepEqual(simulateShot(lv, lv.ball.x, lv.ball.y, a, p), simulateShot(lv, lv.ball.x, lv.ball.y, a, p));
    }
  }
});

test("12 holes, every one valid: on screen, nothing overlapping", () => {
  assert.equal(LEVELS.length, 12);
  for (const [i, lv] of LEVELS.entries()) {
    assert.deepEqual(checkLevel(lv), [], `hole ${i + 1} (${lv.name})`);
  }
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, 12, "names are unique");
});

test("the level checker catches bad levels", () => {
  const good = LEVELS[1];
  assert.match(checkLevel({ ...good, cup: { x: 500, y: 90 } }).join(), /hole is off screen/);
  assert.match(checkLevel({ ...good, ball: { x: 210, y: 290 } }).join(), /ball overlaps planet 1/);
  assert.match(checkLevel({ ...good, par: 0 }).join(), /par/);
  assert.match(checkLevel({ ...good, rocks: [{ x: 220, y: 300, r: 10 }] }).join(), /overlaps/);
});

test("planets pull with inverse-square gravity", () => {
  const lv = { planets: [{ x: 0, y: 0, r: 10 }], cup: { x: 999, y: 999 } };
  const a1 = pullAt(lv, 100, 0), a2 = pullAt(lv, 200, 0);
  assert.ok(a1.ax < 0 && Math.abs(a1.ay) < 1e-9, "pulls toward the planet");
  assert.ok(Math.abs(a1.ax / a2.ax - 4) < 1e-9, "twice as far = a quarter of the pull");
  assert.ok(Math.abs(pullAt(lv, 10, 0).ax + PHYS.G) < 1e-9, "surface pull is G");
});

test("a straight shot in empty space goes straight and slows down", () => {
  const lv = { planets: [], cup: { x: -100, y: -100 } };
  const b = launch(makeBall(210, 500), -Math.PI / 2, 0.5);
  const v0 = Math.hypot(b.vx, b.vy);
  for (let i = 0; i < 60; i++) { stepBall(b, lv); }
  assert.ok(Math.abs(b.x - 210) < 1e-9);
  assert.ok(b.y < 500);
  assert.ok(Math.hypot(b.vx, b.vy) < v0);
});

test("more power = faster shot, capped", () => {
  assert.ok(Math.hypot(...Object.values(shotVelocity(0, 0.5))) < Math.hypot(...Object.values(shotVelocity(0, 1))));
  assert.ok(Math.abs(Math.hypot(...Object.values(shotVelocity(0, 5))) - PHYS.MAX_SPEED) < 1e-9);
});

test("black holes swallow, asteroids bounce, the field edge is out", () => {
  const bh = { planets: [], holes: [{ x: 210, y: 300, r: 12 }], cup: { x: 10, y: 10 }, ball: { x: 210, y: 500 } };
  assert.ok(run(bh, -Math.PI / 2, 0.5, 2000).events.includes("swallowed"));

  const rock = { planets: [], rocks: [{ x: 210, y: 300, r: 30 }], cup: { x: 10, y: 10 }, ball: { x: 210, y: 500 } };
  const r = run(rock, -Math.PI / 2, 0.6, 2000);
  assert.ok(r.events.includes("bump"));
  assert.ok(r.b.y > 300, "it came back down");

  const empty = { planets: [], cup: { x: 10, y: 10 }, ball: { x: 210, y: 500 } };
  assert.ok(run(empty, -Math.PI / 2, 1, 4000).events.includes("out"));
});

test("a gentle shot at the cup drops in; a rocket skips over", () => {
  const lv = { planets: [], cup: { x: 210, y: 400 }, ball: { x: 210, y: 500 } };
  let found = false;
  for (let p = 0.05; p < 0.6 && !found; p += 0.01) {
    found = simulateShot(lv, 210, 500, -Math.PI / 2, p).result === "cup";
  }
  assert.ok(found);
  assert.notEqual(simulateShot(lv, 210, 500, -Math.PI / 2, 1).result, "cup");
});

test("every hole can be holed (a search finds a route in 1-2 shots)", () => {
  for (const [i, lv] of LEVELS.entries()) {
    let ok = false;
    const ends = [];
    for (let a = 0; a < 180 && !ok; a++) {
      for (let p = 1; p <= 16 && !ok; p++) {
        const r = simulateShot(lv, lv.ball.x, lv.ball.y, (a / 180) * Math.PI * 2, p / 16);
        if (r.result === "cup") { ok = true; } else if (r.result === "stop" && ends.length < 30) { ends.push(r); }
      }
    }
    for (const e of ends) {
      if (ok) { break; }
      for (let a = 0; a < 120 && !ok; a++) {
        for (let p = 1; p <= 12 && !ok; p++) {
          ok = simulateShot(lv, e.x, e.y, (a / 120) * Math.PI * 2, p / 12).result === "cup";
        }
      }
    }
    assert.ok(ok, `hole ${i + 1} (${lv.name}) has a route`);
  }
});

test("the preview shows the start of the real path", () => {
  const lv = LEVELS[1];
  const dots = previewPath(lv, lv.ball.x, lv.ball.y, -1.3, 0.6);
  assert.ok(dots.length > 5);
  const b = launch(makeBall(lv.ball.x, lv.ball.y), -1.3, 0.6);
  for (let i = 0; i < 6; i++) { stepBall(b, lv); }
  assert.deepEqual(dots[0], { x: b.x, y: b.y });
  for (const d of dots) { assert.ok(d.x > -20 && d.x < FIELD.w + 20); }
});

test("golf words", () => {
  assert.equal(scoreName(1, 3), "Hole in one!");
  assert.equal(scoreName(2, 3), "Birdie!");
  assert.equal(scoreName(3, 3), "Par");
  assert.equal(scoreName(4, 3), "Bogey");
  assert.equal(scoreName(8, 3), "+5");
});
