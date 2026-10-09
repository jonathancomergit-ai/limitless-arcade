/* ============================================================
   Slime Dash - rules (items/slime-dash/logic.js)
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeRng, PHYS, speedAt, jumpArc, startJump, stepVertical, FULL_JUMP, TAP_JUMP,
  maxJumpDistance, SAFE_JUMP, CEILING_CLEAR, generateChunks, chunkStream, jumpGaps,
  platY, scoreFor, overlaps
} from "../../items/slime-dash/logic.js";

const SEEDS = [1, 2, 3, 42, 99, 777, 12345, 0xdeadbeef];

test("the rng is seeded: same seed, same numbers", () => {
  const a = makeRng(5), b = makeRng(5), c = makeRng(6);
  const sa = [a(), a(), a()];
  assert.deepEqual(sa, [b(), b(), b()]);
  assert.notDeepEqual(sa, [c(), c(), c()]);
});

test("chunks are deterministic for a seed", () => {
  for (const seed of SEEDS) {
    assert.deepEqual(generateChunks(seed, 80), generateChunks(seed, 80));
    const s = chunkStream(seed);
    assert.deepEqual(Array.from({ length: 80 }, () => s()), generateChunks(seed, 80));
  }
  assert.notDeepEqual(generateChunks(1, 20), generateChunks(2, 20));
});

test("chunks join up with no holes or overlaps", () => {
  for (const seed of SEEDS) {
    const cs = generateChunks(seed, 120);
    for (let k = 1; k < cs.length; k++) {
      assert.equal(cs[k].x, cs[k - 1].x + cs[k - 1].w, `chunk ${k} starts where ${k - 1} ends`);
      /* every chunk starts and ends on solid ground */
      assert.equal(cs[k].floor[0][0], cs[k].x);
      assert.equal(cs[k].floor.at(-1)[1], cs[k].x + cs[k].w);
    }
  }
});

test("a tap is a small hop; holding goes much higher", () => {
  const tap = jumpArc(0), quick = jumpArc(0.1), held = jumpArc(1);
  assert.ok(tap.height > PHYS.SPIKE_H + 15, "even the shortest tap clears a spike");
  assert.ok(quick.height < held.height * 0.5, "a tap is well under half a full jump");
  assert.ok(held.height > 150);
  assert.ok(jumpArc(0.2).height > quick.height && jumpArc(0.3).height > jumpArc(0.2).height, "height grows with hold");
  assert.deepEqual(FULL_JUMP, { height: held.height, air: held.air });
});

test("letting go cuts the jump, but only once and only upward", () => {
  const b = startJump({ vy: 0 });
  for (let t = 0; t < PHYS.MIN_HOLD + 0.01; t += 1 / 120) { stepVertical(b, false, 1 / 120); }
  assert.ok(b.vy >= -PHYS.CUT_V - 1e-9 && b.cut);
});

test("every chunk is jumpable: gaps and spike rows under the max jump", () => {
  const reach = maxJumpDistance(PHYS.BASE_SPEED);
  assert.ok(SAFE_JUMP < reach * 0.7);
  for (const seed of SEEDS) {
    for (const c of generateChunks(seed, 200)) {
      for (const [g0, g1] of jumpGaps(c)) {
        assert.ok(g1 > g0, "a real gap");
        assert.ok(g1 - g0 < SAFE_JUMP, `gap ${g1 - g0} too wide in chunk ${c.i} (seed ${seed})`);
      }
      /* a spike row plus the slime's own width fits in one jump */
      const rows = [];
      for (const s of [...c.spikes].sort((a, b) => a.x - b.x)) {
        const last = rows.at(-1);
        if (last && s.x <= last.x1) { last.x1 = s.x + s.w; } else { rows.push({ x0: s.x, x1: s.x + s.w }); }
      }
      for (const r of rows) {
        assert.ok(r.x1 - r.x0 + PHYS.SLIME_W < SAFE_JUMP, `spike row too long in chunk ${c.i}`);
        /* spikes sit on solid ground */
        assert.ok(c.floor.some(([a, b]) => r.x0 >= a && r.x1 <= b), "spikes on the floor");
      }
      /* moving platforms: reachable from the ground, gaps either side jumpable */
      for (const p of c.plats) {
        assert.ok(-p.y1 < FULL_JUMP.height - 30, "platform top within a full jump");
        assert.ok(p.period > 1);
      }
    }
  }
});

test("low ceilings: a tap fits under, a held jump does not", () => {
  assert.ok(CEILING_CLEAR > TAP_JUMP.height + PHYS.SLIME_H + 20, "room for a quick tap");
  assert.ok(CEILING_CLEAR < FULL_JUMP.height + PHYS.SLIME_H, "a full jump would hit it");
  for (const c of generateChunks(9, 200)) {
    for (const ce of c.ceilings) { assert.equal(ce.y, -CEILING_CLEAR); }
  }
});

test("there's always a run-up between hazards", () => {
  for (const seed of SEEDS) {
    for (const c of generateChunks(seed, 200)) {
      /* the first 120 units of every chunk are clear ground */
      const clear = c.x + 120;
      assert.ok(c.floor[0][1] >= clear);
      for (const s of c.spikes) { assert.ok(s.x >= clear); }
      for (const ce of c.ceilings) { assert.ok(ce.x0 >= clear); }
    }
  }
});

test("an easy start: the first chunks are calm", () => {
  for (const seed of SEEDS) {
    const cs = generateChunks(seed, 4);
    assert.equal(cs[0].kind, "flat");
    assert.equal(cs[1].kind, "flat");
    assert.equal(cs[2].kind, "spikes");
  }
});

test("speed ramps up slowly and stops at the max", () => {
  assert.equal(speedAt(0), PHYS.BASE_SPEED);
  assert.ok(speedAt(10) < PHYS.BASE_SPEED + 30, "slow ramp");
  assert.ok(speedAt(60) > speedAt(30));
  assert.equal(speedAt(PHYS.RAMP_TIME), PHYS.MAX_SPEED);
  assert.equal(speedAt(9999), PHYS.MAX_SPEED);
});

test("platforms move between their two heights", () => {
  const p = { y0: -20, y1: -80, period: 2, phase: 0 };
  assert.equal(platY(p, 0), -20);
  assert.ok(Math.abs(platY(p, 1) - -80) < 1e-9);
  for (let t = 0; t < 4; t += 0.1) { const y = platY(p, t); assert.ok(y <= -20 + 1e-9 && y >= -80 - 1e-9); }
});

test("score is distance plus coins", () => {
  assert.equal(scoreFor(0, 0), 0);
  assert.equal(scoreFor(400, 0), 10);
  assert.equal(scoreFor(400, 3), 25);
  assert.equal(scoreFor(-50, 1), 5);
});

test("overlaps uses a kind inset", () => {
  const a = { x0: 0, x1: 10, y0: 0, y1: 10 };
  assert.ok(overlaps(a, { x0: 9, x1: 20, y0: 0, y1: 10 }));
  assert.ok(!overlaps(a, { x0: 9, x1: 20, y0: 0, y1: 10 }, 2));
});
