/* ============================================================
   Brick Breaker+ - collisions, bounces, levels
   (items/brick-breaker/logic.js + levels.js)
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIELD, GRID, BALL_R, PADDLE_Y, MAX_BOUNCE, circleRect, sweepCircleRect, reflect, paddleBounce,
  unflatten, moveBall, parseLevel, generateLevel, brickPoints, pickPower, POWERS
} from "../../items/brick-breaker/logic.js";
import { LEVELS } from "../../items/brick-breaker/levels.js";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const box = { x: 100, y: 100, w: 40, h: 20 };

test("circle-rectangle overlap: faces, corners, misses", () => {
  assert.equal(circleRect(90, 110, 6, box), null, "6 away from the left face");
  const left = circleRect(96, 110, 6, box);
  assert.ok(left && near(left.nx, -1) && near(left.ny, 0) && near(left.depth, 2));
  const top = circleRect(120, 97, 6, box);
  assert.ok(top && near(top.ny, -1) && near(top.depth, 3));
  /* corner: just outside on the diagonal, then just inside */
  assert.equal(circleRect(100 - 4.3, 100 - 4.3, 6, box), null);
  const c = circleRect(100 - 4, 100 - 4, 6, box);
  assert.ok(c && near(c.nx, -Math.SQRT1_2) && near(c.ny, -Math.SQRT1_2));
  /* centre inside: pushed out of the nearest side */
  const inside = circleRect(102, 110, 6, box);
  assert.ok(near(inside.nx, -1));
});

test("swept hit: finds the first touch on a face", () => {
  const h = sweepCircleRect(50, 110, 100, 0, 6, box);   // moving right
  assert.ok(h);
  assert.ok(near(h.t, (100 - 6 - 50) / 100));
  assert.deepEqual([h.nx, h.ny], [-1, 0]);
  const up = sweepCircleRect(120, 200, 0, -200, 6, box); // moving up into the bottom
  assert.ok(near(up.t, (200 - 126) / 200));
  assert.deepEqual([up.nx, up.ny], [0, 1]);
  assert.equal(sweepCircleRect(50, 110, -100, 0, 6, box), null, "moving away");
  assert.equal(sweepCircleRect(50, 300, 100, 0, 6, box), null, "passes below");
});

test("swept hit: corners use the rounded corner, with a diagonal normal", () => {
  /* aimed so the ball's path just clips the top-left corner */
  const h = sweepCircleRect(80, 80, 40, 40, 6, box);
  assert.ok(h);
  const hx = 80 + 40 * h.t, hy = 80 + 40 * h.t;
  assert.ok(near(Math.hypot(hx - 100, hy - 100), 6, 1e-6), "touches the corner at radius r");
  assert.ok(h.nx < 0 && h.ny < 0);
  /* a path that misses the rounded corner but would hit the square box */
  assert.equal(sweepCircleRect(90, 80, 20, 0, 6, { x: 100, y: 86 + 4.5, w: 40, h: 20 }), null);
});

test("no tunnelling: a very fast ball still hits a thin brick", () => {
  const thin = { x: 0, y: 300, w: 400, h: 2 };
  for (const speed of [500, 5000, 50000, 500000]) {
    const ball = { x: 200, y: 400, vx: 0, vy: -speed };
    const hits = moveBall(ball, 0.5, [{ ...thin, hp: 1 }], null);   // 250+ units in one step
    assert.ok(hits.some((x) => x.kind === "brick"), `speed ${speed}`);
    assert.ok(ball.y > 302 && ball.vy > 0, `bounced back down at ${speed}`);
  }
});

test("fast balls bounce off walls and stay in the field", () => {
  /* 250+ units a step; a floor stands in for the paddle */
  const floor = { x: -1000, y: FIELD.h, w: 3000, h: 1000, hp: 1 };
  const ball = { x: 200, y: 300, vx: 30000, vy: -24000 };
  let bounces = 0;
  for (let i = 0; i < 200; i++) {
    bounces += moveBall(ball, 1 / 120, [floor], null).length;
    assert.ok(ball.x >= BALL_R - 1e-6 && ball.x <= FIELD.w - BALL_R + 1e-6, `x in the field at step ${i}`);
    assert.ok(ball.y >= BALL_R - 1e-6 && ball.y <= FIELD.h - BALL_R + 1e-6, `y in the field at step ${i}`);
  }
  assert.ok(bounces > 200);
});

test("reflection mirrors the velocity and keeps the speed", () => {
  assert.deepEqual(reflect(3, 4, 0, -1), { vx: 3, vy: -4 });
  assert.deepEqual(reflect(3, 4, -1, 0), { vx: -3, vy: 4 });
  const d = reflect(5, 0, -Math.SQRT1_2, -Math.SQRT1_2);
  assert.ok(near(Math.hypot(d.vx, d.vy), 5) && near(d.vx, 0, 1e-9) && near(d.vy, -5, 1e-9));
  assert.deepEqual(reflect(3, -4, 0, -1), { vx: 3, vy: -4 }, "already leaving: unchanged");
});

test("bounce angle depends on where the ball hits the paddle", () => {
  const mid = paddleBounce(0, 300);
  assert.ok(near(mid.vx, 0) && near(mid.vy, -300));
  const r = paddleBounce(1, 300), l = paddleBounce(-1, 300);
  assert.ok(near(Math.atan2(r.vx, -r.vy), MAX_BOUNCE) && near(Math.atan2(l.vx, -l.vy), -MAX_BOUNCE));
  assert.ok(paddleBounce(0.5, 300).vx > 0 && paddleBounce(0.5, 300).vx < r.vx);
  assert.deepEqual(paddleBounce(9, 300), r, "clamped");
  for (const o of [-1, -0.3, 0, 0.7, 1]) { const v = paddleBounce(o, 420); assert.ok(near(Math.hypot(v.vx, v.vy), 420)); }

  const ball = { x: 230, y: PADDLE_Y - 20, vx: 0, vy: 300 };
  const hits = moveBall(ball, 0.1, [], { x: 200, w: 80 });
  assert.equal(hits[0].kind, "paddle");
  assert.ok(ball.vy < 0 && ball.vx > 0, "right of centre goes right");
});

test("a ball never ends up flat", () => {
  const u = unflatten(300, 1);
  assert.ok(Math.abs(u.vy) / 300 > 0.2 && near(Math.hypot(u.vx, u.vy), Math.hypot(300, 1)));
  assert.deepEqual(unflatten(100, -200), { vx: 100, vy: -200 });
});

test("10 hand-made levels, all valid", () => {
  assert.equal(LEVELS.length, 10);
  for (const lv of LEVELS) {
    assert.ok(lv.name);
    assert.ok(lv.rows.length >= 3 && lv.rows.length <= 10, lv.name);
    for (const row of lv.rows) { assert.match(row, /^[.123]{10}$/, `${lv.name}: ${row}`); }
    const bricks = parseLevel(lv.rows);
    assert.ok(bricks.length >= 10, `${lv.name} has bricks`);
    for (const b of bricks) {
      assert.ok(b.x >= 0 && b.x + b.w <= FIELD.w + 1e-9 && b.y >= GRID.top);
      assert.ok(b.y + b.h < PADDLE_Y - 200, "room to play under the bricks");
    }
  }
  assert.ok(LEVELS.some((l) => l.rows.join("").includes("3")), "tough bricks appear");
});

test("parseLevel: hit points come from the digits", () => {
  const b = parseLevel(["1.3", "..2"]);
  assert.deepEqual(b.map((x) => [x.col, x.row, x.hp]), [[0, 0, 1], [2, 0, 3], [2, 1, 2]]);
});

test("endless levels: seeded, valid, mirrored", () => {
  for (let n = 11; n < 60; n++) {
    const a = generateLevel(n);
    assert.deepEqual(a, generateLevel(n));
    for (const row of a) {
      assert.match(row, /^[.123]{10}$/);
      assert.equal(row, [...row].reverse().join(""));
    }
    assert.ok(parseLevel(a).length >= 14);
  }
  assert.notDeepEqual(generateLevel(11), generateLevel(12));
});

test("points and power-ups", () => {
  assert.equal(brickPoints({ maxHp: 3 }, true), 150);
  assert.equal(brickPoints({ maxHp: 3 }, false), 10);
  assert.equal(pickPower(0).id, "multi");
  assert.equal(pickPower(0.9999).id, "life");
  const seen = new Set();
  for (let i = 0; i < 100; i++) { seen.add(pickPower(i / 100).id); }
  assert.equal(seen.size, POWERS.length);
});
