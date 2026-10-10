/* ============================================================
   Chipler Colony - rules (items/chipler-colony/colony.js)
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newColony, tick, build, removeBuilding, copyChipler, canCopy, copyCost, room,
  sendRequest, skipRequest, makeRequest, goalsFor, checkStage, checkColony, normalize,
  angleDiff, rand, isUnlocked, countOf, workersAt,
  BUILDINGS, TRAITS, COPY_TRAITS, STAGES, SLOTS, POD_ROOM, START_FOOD, AFTER_SKIP, AFTER_SEND
} from "../../items/chipler-colony/colony.js";

/* Run the colony for a while in small steps, like the game does. */
function run(c, seconds, step = 1 / 30) {
  const events = [];
  for (let t = 0; t < seconds; t += step) { events.push(...tick(c, step)); }
  return events;
}

test("a new colony: one Chipler, a pod, some food", () => {
  const c = newColony(7);
  assert.equal(c.chiplers.length, 1);
  assert.equal(c.chiplers[0].trait, "first");
  assert.equal(c.slots.length, SLOTS);
  assert.equal(c.slots[0].type, "pod");
  assert.equal(c.food, START_FOOD);
  assert.equal(room(c), POD_ROOM);
  assert.equal(checkColony(c), true);
});

test("the dice are seeded: same seed, same colony", () => {
  const a = newColony(42), b = newColony(42), d = newColony(43);
  const ra = [rand(a), rand(a)], rb = [rand(b), rand(b)], rd = [rand(d), rand(d)];
  assert.deepEqual(ra, rb);
  assert.notDeepEqual(ra, rd);
  for (const v of ra) { assert.ok(v >= 0 && v < 1); }
});

test("angleDiff takes the short way round", () => {
  assert.ok(Math.abs(angleDiff(0.1, 6.2) - (6.2 - 0.1 - Math.PI * 2)) < 1e-9);
  assert.ok(Math.abs(angleDiff(6.2, 0.1) - (0.1 + Math.PI * 2 - 6.2)) < 1e-9);
  assert.equal(angleDiff(1, 1), 0);
});

test("copying costs food and adds a Chipler with a trait", () => {
  const c = newColony(3);
  const cost = copyCost(c);
  const food = c.food;
  const r = copyChipler(c);
  assert.equal(r.ok, true);
  assert.equal(c.chiplers.length, 2);
  assert.equal(c.food, food - cost);
  const fresh = c.chiplers[1];
  assert.ok(COPY_TRAITS.includes(fresh.trait), `trait ${fresh.trait}`);
  assert.ok(TRAITS[fresh.trait].name.length > 0);
  assert.notEqual(fresh.id, c.chiplers[0].id);
  assert.ok(copyCost(c) > cost, "the next copy costs more");
});

test("copying needs enough food and room", () => {
  const c = newColony(3);
  c.food = 0;
  assert.equal(copyChipler(c).ok, false);
  assert.equal(c.chiplers.length, 1);
  c.food = 999;
  while (canCopy(c).ok) { copyChipler(c); }
  assert.equal(c.chiplers.length, POD_ROOM, "the pod holds 4");
  assert.match(canCopy(c).why, /room/i);
  c.blueprints = 99; c.tools = 99;
  assert.equal(build(c, 3, "house").ok, true);
  assert.equal(room(c), POD_ROOM + BUILDINGS.house.room);
  assert.equal(copyChipler(c).ok, true);
});

test("every trait shows up across many copies", () => {
  const seen = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const c = newColony(seed);
    copyChipler(c);
    seen.add(c.chiplers[1].trait);
  }
  assert.deepEqual([...seen].sort(), [...COPY_TRAITS].sort());
});

test("building costs goods, needs a free plot, and forge/house need Blueprints", () => {
  const c = newColony(1);
  assert.equal(build(c, 0, "farm").ok, false, "not on the pod");
  assert.equal(build(c, 1, "forge").ok, false, "forge is locked");
  assert.equal(isUnlocked(c, "farm"), true);
  assert.equal(build(c, 1, "farm").ok, true);
  assert.equal(c.food, START_FOOD - BUILDINGS.farm.cost.food);
  assert.equal(build(c, 1, "farm").ok, false, "plot taken");
  c.blueprints = BUILDINGS.forge.blueprints;
  c.food = 50;
  assert.equal(build(c, 2, "forge").ok, true);
  assert.equal(build(c, 3, "house").ok, false, "house still locked");
  assert.equal(removeBuilding(c, 0).ok, false, "the pod stays");
  assert.equal(removeBuilding(c, 2).ok, true);
  assert.equal(c.slots[2], null);
});

test("a farm tick adds food: a Chipler walks there, works and carries it home", () => {
  const c = newColony(5);
  build(c, 1, "farm");
  c.meal = -100;                                   // nobody eats in this test
  const food = c.food;
  const events = run(c, 8);
  assert.equal(c.chiplers[0].job, 1, "went to the farm by himself");
  assert.ok(c.food > food, `food ${food} -> ${c.food}`);
  assert.ok(c.stats.food >= BUILDINGS.farm.amount);
  assert.ok(events.some((e) => e.type === "made" && e.what === "food"));
});

test("a forge makes tools", () => {
  const c = newColony(5);
  c.blueprints = 2; c.food = 100;
  build(c, 7, "forge");
  run(c, 10);
  assert.ok(c.tools > 0 && c.stats.tools === c.tools);
});

test("each farm takes two workers; the rest stay idle", () => {
  const c = newColony(9);
  c.food = 200;
  build(c, 1, "farm");
  copyChipler(c); copyChipler(c);
  run(c, 1);
  assert.equal(workersAt(c, 1), 2);
  assert.equal(c.chiplers.filter((ch) => ch.job === -1).length, 1);
});

test("cozy: with no food nobody vanishes, they just slow down", () => {
  const c = newColony(2);
  c.food = 0;
  c.blueprints = 0;
  build(c, 4, "farm");                             // fails: no food
  const n = c.chiplers.length;
  const events = run(c, 30);
  assert.equal(c.hungry, true);
  assert.ok(events.some((e) => e.type === "hungry"));
  assert.equal(c.chiplers.length, n);
  assert.equal(c.food, 0, "food never goes below zero");
});

test("a hungry Chipler walks at half speed", () => {
  const fed = newColony(1), hungry = newColony(1);
  for (const c of [fed, hungry]) { c.food = 100; build(c, 4, "farm"); c.meal = -100; }
  hungry.hungry = true;
  hungry.food = 0;
  tick(fed, 0.5); tick(hungry, 0.5);
  const gone = (c) => Math.abs(angleDiff(0, c.chiplers[0].a));
  assert.ok(Math.abs(gone(hungry) - gone(fed) / 2) < 1e-6, `${gone(hungry)} vs ${gone(fed)}`);
});

test("requests arrive; Send pays Blueprints, Skip pays nothing and the next comes sooner", () => {
  const c = newColony(11);
  c.meal = -1000;
  run(c, 21);
  assert.ok(c.request, "a request arrived");
  const r = c.request;
  c[r.what] = r.n + 5;
  assert.equal(sendRequest(c).ok, true);
  assert.equal(c[r.what], 5);
  assert.equal(c.blueprints, r.reward);
  assert.equal(c.stats.sent, 1);
  assert.equal(c.request, null);
  assert.equal(c.nextRequest, AFTER_SEND);

  c.request = makeRequest(c);
  const before = { food: c.food, tools: c.tools, blueprints: c.blueprints };
  assert.equal(skipRequest(c).ok, true);
  assert.deepEqual({ food: c.food, tools: c.tools, blueprints: c.blueprints }, before);
  assert.equal(c.stats.skipped, 1);
  assert.ok(AFTER_SKIP < AFTER_SEND);
  assert.equal(c.nextRequest, AFTER_SKIP);
});

test("Send needs the goods", () => {
  const c = newColony(1);
  c.request = { what: "food", n: 50, reward: 2 };
  c.food = 10;
  assert.equal(sendRequest(c).ok, false);
  assert.equal(c.food, 10);
  assert.equal(c.blueprints, 0);
});

test("finishing a stage's goals unlocks the next", () => {
  const c = newColony(4);
  assert.equal(c.stage, 0);
  assert.equal(goalsFor(c).every((g) => g.met), false);
  build(c, 1, "farm");
  c.food = 100;
  copyChipler(c);
  assert.equal(c.stage, 0, "still need to send a request");
  c.request = { what: "food", n: 5, reward: 2 };
  sendRequest(c);
  assert.equal(c.stage, 1, "on to stage 2");
  assert.equal(goalsFor(c)[0].text, STAGES[1].goals[0].text);
  assert.equal(isUnlocked(c, "forge"), true, "the Blueprints unlocked the forge");

  /* stage 2 and 3 in one go */
  c.food = 999; c.tools = 50; c.blueprints = 10; c.stats.tools = 12;
  build(c, 2, "forge");
  build(c, 3, "house"); build(c, 4, "house");
  while (canCopy(c).ok) { copyChipler(c); }
  assert.equal(c.done, true);
  assert.equal(c.stage, STAGES.length);
});

test("a simple player finishes all three stages in a few minutes", () => {
  const c = newColony(2026);
  const plan = [[1, "farm"], [7, "farm"], [2, "forge"], [6, "house"], [3, "house"], [5, "farm"]];
  let t = 0;
  while (!c.done && t < 20 * 60) {
    tick(c, 0.1);
    t += 0.1;
    if (c.request) { sendRequest(c); }
    const next = plan.find(([slot]) => !c.slots[slot]);
    if (next && build(c, next[0], next[1]).ok) { continue; }
    if (c.food > copyCost(c) + 4) { copyChipler(c); }
  }
  assert.equal(c.done, true, `stage ${c.stage} after ${Math.round(t)} s`);
  assert.ok(t > 2 * 60 && t < 15 * 60, `took ${Math.round(t)} s`);
  assert.ok(countOf(c, "house") >= 2);
});

test("checkColony accepts real colonies and rejects junk", () => {
  const c = newColony(8);
  build(c, 1, "farm");
  run(c, 30);
  const copy = JSON.parse(JSON.stringify(c));
  assert.equal(checkColony(copy), true);
  assert.deepEqual(normalize(copy).slots, c.slots);

  assert.notEqual(checkColony(null), true);
  assert.notEqual(checkColony({ ...copy, food: -1 }), true);
  assert.notEqual(checkColony({ ...copy, slots: [] }), true);
  assert.notEqual(checkColony({ ...copy, slots: [{ type: "farm" }, ...copy.slots.slice(1)] }), true);
  assert.notEqual(checkColony({ ...copy, chiplers: [] }), true);
  assert.notEqual(checkColony({ ...copy, chiplers: [{ ...copy.chiplers[0], trait: "evil" }] }), true);
  assert.notEqual(checkColony({ ...copy, request: { what: "gold", n: 1, reward: 1 } }), true);
  assert.notEqual(checkColony({ ...copy, stage: 9 }), true);
});

test("checkStage does nothing until the goals are met", () => {
  const c = newColony(1);
  assert.equal(checkStage(c), 0);
  assert.equal(c.stage, 0);
});
