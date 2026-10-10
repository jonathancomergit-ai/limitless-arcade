/* ============================================================
   Stack Tower - physics (items/stack-tower/physics.js)
   and rules (items/stack-tower/logic.js)
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, createBox, collide, energy, topOf, corners } from "../../items/stack-tower/physics.js";
import {
  GAME, makeRng, blockWidth, sliderSpeed, slide, isPerfect, pointsFor, roundHeight
} from "../../items/stack-tower/logic.js";

const DT = 1 / 120;
const G = 9.81;
const run = (world, seconds, each = () => {}) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) { world.step(DT); each(i); }
};

/* ---------------- collision ---------------- */

test("two boxes apart don't touch; a box sitting on another gets 2 contacts", () => {
  const ground = createBox({ y: -0.5, w: 4, h: 1, isStatic: true });
  assert.equal(collide(ground, createBox({ y: 2, w: 1, h: 0.5 })).length, 0);
  const sitting = createBox({ x: 0.3, y: 0.24, w: 1, h: 0.5 });     // 1 cm into the ground
  const cs = collide(ground, sitting);
  assert.equal(cs.length, 2);
  for (const c of cs) {
    assert.ok(Math.abs(c.ny - 1) < 1e-9, "normal points up, from ground to box");
    assert.ok(Math.abs(c.sep + 0.01) < 1e-9, "separation = -1 cm");
  }
});

test("corners of a turned box", () => {
  const b = createBox({ x: 1, y: 2, w: 2, h: 1, angle: Math.PI / 2 });
  const xs = corners(b).map((p) => p.x), ys = corners(b).map((p) => p.y);
  assert.ok(Math.abs(Math.min(...xs) - 0.5) < 1e-9 && Math.abs(Math.max(...xs) - 1.5) < 1e-9);
  assert.ok(Math.abs(Math.min(...ys) - 1) < 1e-9 && Math.abs(topOf(b) - 3) < 1e-9);
});

/* ---------------- the acceptance tests ---------------- */

test("a box resting on the ground doesn't drift or jitter over 5 simulated seconds", () => {
  const world = createWorld({ gravity: G });
  world.add(createBox({ y: -0.5, w: 10, h: 1, isStatic: true }));
  const box = world.add(createBox({ x: 0.3, y: 0.25, w: 2, h: 0.5 }));
  let prev = { x: box.x, y: box.y, a: box.angle };
  let maxJump = 0;
  run(world, 5, () => {
    maxJump = Math.max(maxJump, Math.abs(box.x - prev.x), Math.abs(box.y - prev.y), Math.abs(box.angle - prev.a));
    prev = { x: box.x, y: box.y, a: box.angle };
  });
  assert.ok(Math.abs(box.x - 0.3) < 1e-4, `drifted sideways: x = ${box.x}`);
  assert.ok(Math.abs(box.y - 0.25) < 0.005, `sank or rose: y = ${box.y}`);
  assert.ok(Math.abs(box.angle) < 1e-4, `tilted: ${box.angle}`);
  assert.ok(maxJump < 1e-3, `jittered: biggest move in one step ${maxJump}`);
  assert.equal(box.sleeping, true, "it settles and sleeps");
});

test("a box dropped half over an edge tips off; one mostly on the ledge stays", () => {
  for (const [cx, falls] of [[0.06, true], [0.2, true], [-0.06, false], [-0.2, false]]) {
    const world = createWorld({ gravity: G });
    world.add(createBox({ x: -2, y: -0.5, w: 4, h: 1, isStatic: true }));   // ledge ends at x = 0
    const box = world.add(createBox({ x: cx, y: 0.5, w: 1, h: 0.5 }));
    let maxTilt = 0;
    run(world, 3, () => { maxTilt = Math.max(maxTilt, Math.abs(box.angle)); });
    if (falls) {
      assert.ok(box.y < -2, `centre ${cx} m past the edge should fall off (y = ${box.y})`);
      assert.ok(maxTilt > 0.5, `and tip as it goes (max tilt ${maxTilt})`);
    } else {
      assert.ok(Math.abs(box.y - 0.25) < 0.01 && Math.abs(box.angle) < 0.01, `centre ${cx} m should stay on the ledge`);
    }
  }
});

test("total energy never grows", () => {
  /* Blocks dropped one by one (like the game), one half over the
     base edge so it tips and falls, and a tumbling one. */
  const world = createWorld({ gravity: G });
  world.add(createBox({ y: -10, w: 2.8, h: 20, isStatic: true }));
  const rng = makeRng(11);
  const drops = [
    { x: 0, angle: 0 }, { x: 0.3, angle: 0 }, { x: -0.25, angle: 0 }, { x: 0.1, angle: 0 },
    { x: 1.45, angle: 0 }, { x: 0.05, angle: 0.4 }, { x: -0.2, angle: 0 }
  ];
  for (const d of drops) {
    const top = Math.max(0, ...world.bodies.filter((b) => !b.isStatic && b.y > -1).map(topOf));
    world.add(createBox({ x: d.x, y: top + 1.6, w: blockWidth(rng()), h: GAME.BLOCK_H, angle: d.angle }));
    const weight = world.bodies.reduce((s, b) => s + (b.isStatic ? 0 : b.mass * G), 0);
    const tol = weight * 0.0005;        // = lifting every block half a millimetre
    let e = energy(world.bodies, G);
    const start = e;
    run(world, 1.5, (i) => {
      const now = energy(world.bodies, G);
      assert.ok(now <= e + tol, `energy grew by ${(now - e).toFixed(5)} J at step ${i}`);
      e = now;
    });
    assert.ok(e < start, "each drop loses energy overall");
  }
});

test("a 20-block tower stands still, keeps its height and goes to sleep", () => {
  const world = createWorld({ gravity: G });
  world.add(createBox({ y: -10, w: 3, h: 20, isStatic: true }));
  const rng = makeRng(3);
  const blocks = [];
  for (let i = 0; i < 20; i++) {
    blocks.push(world.add(createBox({ x: (rng() - 0.5) * 0.4, y: 0.25 + 0.5 * i, w: blockWidth(rng()), h: 0.5 })));
  }
  run(world, 6);
  const top = blocks.at(-1);
  assert.ok(Math.abs(topOf(top) - 10) < 0.05, `top at ${topOf(top)}, expected 10`);
  for (const b of blocks) { assert.ok(Math.abs(b.angle) < 0.01, "no block tilts"); }
  assert.ok(blocks.every((b) => b.sleeping), "the whole tower sleeps");
});

test("a sleeping tower wakes when a block lands on it, then settles again", () => {
  const world = createWorld({ gravity: G });
  world.add(createBox({ y: -10, w: 3, h: 20, isStatic: true }));
  const low = world.add(createBox({ y: 0.25, w: 2, h: 0.5 }));
  const mid = world.add(createBox({ y: 0.75, w: 2, h: 0.5 }));
  run(world, 1.5);
  assert.ok(low.sleeping && mid.sleeping);
  const drop = world.add(createBox({ x: 0.1, y: 2.5, w: 1.8, h: 0.5 }));
  let woke = false;
  run(world, 3, () => { if (!low.sleeping) { woke = true; } });
  assert.ok(woke, "the bottom block woke up");
  assert.ok(Math.abs(drop.y - 1.25) < 0.01, `landed on top (y = ${drop.y})`);
  assert.ok(drop.sleeping && low.sleeping, "and everything sleeps again");
});

test("friction: a box on a gentle slope stays, on a steep one it slides", () => {
  for (const [deg, slides] of [[10, false], [45, true]]) {
    const a = (deg * Math.PI) / 180;
    const world = createWorld({ gravity: G });
    world.add(createBox({ w: 20, h: 1, angle: a, isStatic: true, friction: 0.6 }));
    /* sit the box on the slope's top face */
    const nx = -Math.sin(a), ny = Math.cos(a);
    const box = world.add(createBox({ x: nx * 0.75, y: ny * 0.75, w: 1, h: 0.5, angle: a, friction: 0.6 }));
    const x0 = box.x;
    run(world, 2);
    const moved = Math.abs(box.x - x0);
    if (slides) { assert.ok(moved > 1, `should slide down a ${deg} degree slope (moved ${moved})`); }
    else { assert.ok(moved < 0.01, `should grip a ${deg} degree slope (moved ${moved})`); }
  }
});

/* ---------------- rules ---------------- */

test("the rng is seeded", () => {
  const a = makeRng(5), b = makeRng(5), c = makeRng(6);
  const sa = [a(), a(), a()];
  assert.deepEqual(sa, [b(), b(), b()]);
  assert.notDeepEqual(sa, [c(), c(), c()]);
});

test("block widths vary a little, inside the limits", () => {
  const rng = makeRng(1);
  const ws = Array.from({ length: 200 }, () => blockWidth(rng()));
  assert.ok(ws.every((w) => w >= GAME.MIN_W && w <= GAME.MAX_W));
  assert.ok(new Set(ws).size > 20, "not all the same");
  assert.equal(blockWidth(0), GAME.MIN_W);
  assert.equal(blockWidth(1), GAME.MAX_W);
});

test("the slider bounces between the ends and speeds up with the tower", () => {
  let s = { x: 0, dir: 1 };
  for (let i = 0; i < 2000; i++) {
    s = slide(s.x, s.dir, 3, 1 / 60);
    assert.ok(Math.abs(s.x) <= GAME.RANGE + 1e-9);
  }
  const r = slide(GAME.RANGE - 0.1, 1, 1, 0.3), l = slide(-GAME.RANGE + 0.1, -1, 1, 0.3);
  assert.equal(r.dir, -1);
  assert.ok(Math.abs(r.x - (GAME.RANGE - 0.2)) < 1e-9, "bounced back off the right end");
  assert.equal(l.dir, 1);
  assert.ok(Math.abs(l.x - (-GAME.RANGE + 0.2)) < 1e-9, "bounced back off the left end");
  assert.equal(sliderSpeed(0), GAME.SPEED0);
  assert.ok(sliderSpeed(10) > sliderSpeed(0));
  assert.equal(sliderSpeed(1000), GAME.SPEED_MAX);
});

test("Perfect drops and points", () => {
  assert.equal(isPerfect(0), true);
  assert.equal(isPerfect(-GAME.PERFECT), true);
  assert.equal(isPerfect(GAME.PERFECT + 0.01), false);
  assert.equal(pointsFor(false), GAME.POINTS);
  assert.equal(pointsFor(true), GAME.POINTS + GAME.BONUS);
  assert.equal(roundHeight(1.26), 1.3);
  assert.equal(roundHeight(-0.4), 0);
});
