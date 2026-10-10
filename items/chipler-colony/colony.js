/* ============================================================
   Chipler Colony - the rules (pure: no DOM, no canvas)

   A colony is one plain object. It is what gets saved, so it
   only holds numbers, strings, arrays and plain objects.

     newColony(seed)         a fresh planet with one Chipler
     tick(c, dt)             time passes: walk, work, carry, eat,
                             requests arrive, stages finish.
                             Returns a list of events to show.
     build(c, slot, type)    farm / forge / house on a plot
     removeBuilding(c, slot)
     copyChipler(c)          costs food, needs room
     sendRequest(c) / skipRequest(c)
     checkColony(c)          for imported saves: true or a reason

   The planet has 8 plots round the rim. Plot 0 is the landing
   pod: it stores goods and has room for 4 Chiplers.

   Chiplers walk round the rim by themselves: to a job, work,
   carry the goods to the nearest pod or house, and back again.
   Nobody dies: with no food left they just slow down.

   Unit tests: tests/unit/chipler-colony.test.js
   ============================================================ */

export const SLOTS = 8;
export const TAU = Math.PI * 2;
export const POD_ROOM = 4;
export const WORKERS_PER = 2;     // Chiplers per farm or forge
export const WALK = 0.9;          // radians per second round the rim
export const WORK_TIME = 2.5;     // seconds of work per load
export const EAT_EVERY = 12;      // seconds between meals, per Chipler
export const HUNGRY_SLOW = 0.5;   // speed when the food runs out
export const START_FOOD = 10;
export const FIRST_REQUEST = 20;  // seconds
export const AFTER_SEND = 35;
export const AFTER_SKIP = 10;     // skip one and the next comes sooner

export const BUILDINGS = {
  farm:  { name: "Farm",  cost: { food: 5 },           makes: "food",  amount: 2, blueprints: 0 },
  forge: { name: "Forge", cost: { food: 8 },           makes: "tools", amount: 1, blueprints: 2 },
  house: { name: "House", cost: { food: 4, tools: 4 }, room: 3,                   blueprints: 4 }
};
export const BUILD_ORDER = ["farm", "forge", "house"];

/* walk / work / eat are multipliers; carry is goods per trip. */
export const TRAITS = {
  first:  { name: "First",       walk: 1,   work: 1,   eat: 1,   carry: 1 },
  fast:   { name: "Fast",        walk: 1.7, work: 1,   eat: 1,   carry: 1 },
  sleepy: { name: "Sleepy",      walk: 0.8, work: 0.7, eat: 0.5, carry: 1 },
  strong: { name: "Strong",      walk: 1,   work: 1.6, eat: 1,   carry: 1 },
  double: { name: "Carries two", walk: 1,   work: 1,   eat: 1,   carry: 2 }
};
export const COPY_TRAITS = ["fast", "sleepy", "strong", "double"];

export const STAGES = [
  { goals: [
    { text: "Build a farm",      need: 1, have: (c) => countOf(c, "farm") },
    { text: "Have 2 Chiplers",   need: 2, have: (c) => c.chiplers.length },
    { text: "Send 1 request",    need: 1, have: (c) => c.stats.sent }
  ] },
  { goals: [
    { text: "Build a forge",     need: 1, have: (c) => countOf(c, "forge") },
    { text: "Have 4 Chiplers",   need: 4, have: (c) => c.chiplers.length },
    { text: "Make 12 tools",     need: 12, have: (c) => c.stats.tools }
  ] },
  { goals: [
    { text: "Build 2 houses",    need: 2, have: (c) => countOf(c, "house") },
    { text: "Have 10 Chiplers",  need: 10, have: (c) => c.chiplers.length },
    { text: "Earn 10 Blueprints", need: 10, have: (c) => c.blueprints }
  ] }
];

/* ============================================================
   SMALL HELPERS
   ============================================================ */

/* A seeded random number in [0, 1). The seed lives in the colony,
   so a saved colony carries on with the same dice. */
export function rand(c) {
  let t = (c.rng = (c.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function slotAngle(i) { return (i / SLOTS) * TAU; }

/* -PI..PI: the short way round from a to b. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) { d -= TAU; }
  if (d < -Math.PI) { d += TAU; }
  return d;
}

export function wrap(a) { return ((a % TAU) + TAU) % TAU; }

export function countOf(c, type) {
  return c.slots.filter((s) => s && s.type === type).length;
}

export function room(c) {
  return POD_ROOM + countOf(c, "house") * BUILDINGS.house.room;
}

export function copyCost(c) {
  return 4 + 3 * (c.chiplers.length - 1);
}

export function isUnlocked(c, type) {
  return c.blueprints >= BUILDINGS[type].blueprints;
}

export function workersAt(c, slot) {
  return c.chiplers.filter((ch) => ch.job === slot).length;
}

function isWorkplace(s) { return Boolean(s && BUILDINGS[s.type] && BUILDINGS[s.type].makes); }
function isStore(s) { return Boolean(s && (s.type === "pod" || s.type === "house")); }

function canPay(c, cost) {
  return Object.entries(cost).every(([k, v]) => c[k] >= v);
}

/* ============================================================
   A NEW COLONY
   ============================================================ */
export function newColony(seed = 1) {
  const slots = Array(SLOTS).fill(null);
  slots[0] = { type: "pod" };
  return {
    v: 1,
    rng: seed >>> 0,
    t: 0,
    food: START_FOOD,
    tools: 0,
    blueprints: 0,
    slots,
    chiplers: [makeChipler(1, "first", 0)],
    nextId: 2,
    meal: 0,
    hungry: false,
    request: null,
    nextRequest: FIRST_REQUEST,
    stage: 0,
    done: false,
    doneAt: 0,
    stats: { food: 0, tools: 0, sent: 0, skipped: 0, copies: 0, built: 0 }
  };
}

function makeChipler(id, trait, a) {
  /* task: "idle" (no job), "go" (to job), "work", "carry" (to a store) */
  return { id, trait, a, job: -1, off: 0, task: "idle", work: 0, carry: 0, carryWhat: "food", wander: a };
}

/* ============================================================
   PLAYER ACTIONS
   Each returns { ok: true } or { ok: false, why: "..." }.
   ============================================================ */
export function canBuild(c, slot, type) {
  const b = BUILDINGS[type];
  if (!b) { return { ok: false, why: "Unknown building." }; }
  if (!Number.isInteger(slot) || slot <= 0 || slot >= SLOTS) { return { ok: false, why: "Pick an empty plot." }; }
  if (c.slots[slot]) { return { ok: false, why: "That plot is taken." }; }
  if (!isUnlocked(c, type)) { return { ok: false, why: `${b.name} needs ${b.blueprints} Blueprints.` }; }
  if (!canPay(c, b.cost)) { return { ok: false, why: `Not enough for a ${b.name.toLowerCase()}.` }; }
  return { ok: true };
}

export function build(c, slot, type) {
  const can = canBuild(c, slot, type);
  if (!can.ok) { return can; }
  for (const [k, v] of Object.entries(BUILDINGS[type].cost)) { c[k] -= v; }
  c.slots[slot] = { type };
  c.stats.built += 1;
  checkStage(c);
  return { ok: true };
}

export function removeBuilding(c, slot) {
  const s = c.slots[slot];
  if (!s || s.type === "pod") { return { ok: false, why: "Nothing to remove there." }; }
  c.slots[slot] = null;
  for (const ch of c.chiplers) {
    if (ch.job === slot) {
      ch.job = -1;
      ch.work = 0;
      ch.task = ch.carry > 0 ? "carry" : "idle";
    }
  }
  return { ok: true };
}

export function canCopy(c) {
  if (c.chiplers.length >= room(c)) { return { ok: false, why: "No room. Build a house." }; }
  if (c.food < copyCost(c)) { return { ok: false, why: `Copying needs ${copyCost(c)} food.` }; }
  return { ok: true };
}

/* The new Chipler pops out of the pod with one random trait. */
export function copyChipler(c) {
  const can = canCopy(c);
  if (!can.ok) { return can; }
  c.food -= copyCost(c);
  const trait = COPY_TRAITS[Math.floor(rand(c) * COPY_TRAITS.length)];
  const ch = makeChipler(c.nextId, trait, wrap(slotAngle(0) + (rand(c) - 0.5) * 0.3));
  c.nextId += 1;
  c.chiplers.push(ch);
  c.stats.copies += 1;
  checkStage(c);
  return { ok: true, chipler: ch };
}

/* ============================================================
   REQUESTS
   "Request: 8 food -> +2 Blueprints". Send pays it, Skip drops it.
   ============================================================ */
export function makeRequest(c) {
  const st = Math.min(c.stage, STAGES.length - 1);
  const tools = countOf(c, "forge") > 0 && rand(c) < 0.45;
  const what = tools ? "tools" : "food";
  const base = tools ? [3, 4, 6][st] : [6, 9, 12][st];
  return { what, n: base + Math.floor(rand(c) * 4), reward: [2, 2, 3][st] };
}

export function sendRequest(c) {
  const r = c.request;
  if (!r) { return { ok: false, why: "No request right now." }; }
  if (c[r.what] < r.n) { return { ok: false, why: `Need ${r.n} ${r.what}.` }; }
  c[r.what] -= r.n;
  c.blueprints += r.reward;
  c.stats.sent += 1;
  c.request = null;
  c.nextRequest = AFTER_SEND;
  checkStage(c);
  return { ok: true };
}

export function skipRequest(c) {
  if (!c.request) { return { ok: false, why: "No request right now." }; }
  c.request = null;
  c.stats.skipped += 1;
  c.nextRequest = AFTER_SKIP;
  return { ok: true };
}

/* ============================================================
   STAGES
   ============================================================ */
export function goalsFor(c, stage = c.stage) {
  const s = STAGES[Math.min(stage, STAGES.length - 1)];
  return s.goals.map((g) => {
    const have = Math.min(g.need, g.have(c));
    return { text: g.text, have, need: g.need, met: have >= g.need };
  });
}

/* Moves on while the current stage's goals are all met.
   Returns how many stages were finished just now. */
export function checkStage(c) {
  let n = 0;
  while (!c.done && goalsFor(c).every((g) => g.met)) {
    c.stage += 1;
    n += 1;
    if (c.stage >= STAGES.length) {
      c.stage = STAGES.length;
      c.done = true;
      c.doneAt = c.t;
    }
  }
  return n;
}

/* ============================================================
   TIME PASSES
   ============================================================ */

/* Idle Chiplers take the emptiest job. When food is low, farms first. */
function assignJobs(c) {
  const jobs = [];
  c.slots.forEach((s, i) => { if (isWorkplace(s)) { jobs.push(i); } });
  if (!jobs.length) { return; }
  const lowFood = c.food < 4 + c.chiplers.length;
  for (const ch of c.chiplers) {
    if (ch.task !== "idle") { continue; }
    let best = -1, bestKey = Infinity;
    for (const j of jobs) {
      const n = workersAt(c, j);
      if (n >= WORKERS_PER) { continue; }
      const farmFirst = lowFood && c.slots[j].type === "farm" ? 0 : 1;
      const key = n * 100 + farmFirst * 10 + Math.abs(angleDiff(ch.a, slotAngle(j)));
      if (key < bestKey) { bestKey = key; best = j; }
    }
    if (best === -1) { return; }
    ch.off = workersAt(c, best) === 0 ? -0.07 : 0.07;
    ch.job = best;
    ch.task = "go";
    ch.work = 0;
  }
}

function nearestStore(c, a) {
  let best = 0, bestD = Infinity;
  c.slots.forEach((s, i) => {
    if (!isStore(s)) { return; }
    const d = Math.abs(angleDiff(a, slotAngle(i)));
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/* Walk toward an angle. True once there. */
function walk(ch, target, speed, dt) {
  const d = angleDiff(ch.a, target);
  const stepA = speed * dt;
  if (Math.abs(d) <= stepA) { ch.a = wrap(target); return true; }
  ch.a = wrap(ch.a + Math.sign(d) * stepA);
  return false;
}

export function tick(c, dt) {
  const events = [];
  if (!(dt > 0)) { return events; }
  c.t += dt;

  assignJobs(c);
  const slow = c.hungry ? HUNGRY_SLOW : 1;

  for (const ch of c.chiplers) {
    const tr = TRAITS[ch.trait] || TRAITS.first;
    const speed = WALK * tr.walk * slow;
    if (ch.job !== -1 && !isWorkplace(c.slots[ch.job])) { ch.job = -1; if (ch.task !== "carry") { ch.task = "idle"; } }

    if (ch.task === "go") {
      if (walk(ch, slotAngle(ch.job) + ch.off, speed, dt)) { ch.task = "work"; ch.work = 0; }
    } else if (ch.task === "work") {
      ch.work += (dt * tr.work * slow) / WORK_TIME;
      if (ch.work >= 1) {
        ch.work = 0;
        ch.carry = BUILDINGS[c.slots[ch.job].type].amount * tr.carry;
        ch.carryWhat = BUILDINGS[c.slots[ch.job].type].makes;
        ch.task = "carry";
      }
    } else if (ch.task === "carry") {
      const store = nearestStore(c, ch.a);
      if (walk(ch, slotAngle(store), speed, dt)) {
        const what = ch.carryWhat === "tools" ? "tools" : "food";
        c[what] += ch.carry;
        c.stats[what] += ch.carry;
        events.push({ type: "made", what, n: ch.carry, slot: store, id: ch.id });
        ch.carry = 0;
        ch.task = ch.job === -1 ? "idle" : "go";
      }
    } else {
      /* idle: potter about near the pod */
      if (walk(ch, ch.wander, speed * 0.4, dt)) {
        ch.wander = wrap(slotAngle(0) + (rand(c) - 0.5) * 0.5);
      }
    }
  }

  /* meals: everyone eats a bit; no food = hungry = slow, never worse */
  let eat = 0;
  for (const ch of c.chiplers) { eat += (TRAITS[ch.trait] || TRAITS.first).eat / EAT_EVERY; }
  c.meal += eat * dt;
  while (c.meal >= 1) {
    if (c.food >= 1) {
      c.food -= 1;
      c.meal -= 1;
      if (c.hungry) { c.hungry = false; events.push({ type: "fed" }); }
    } else {
      if (!c.hungry) { c.hungry = true; events.push({ type: "hungry" }); }
      c.meal = 1;
      break;
    }
  }
  /* fresh food arrived: a hungry colony eats straight away */
  if (c.hungry && c.food >= 1) {
    c.food -= 1;
    c.meal = Math.max(0, c.meal - 1);
    c.hungry = false;
    events.push({ type: "fed" });
  }

  /* requests */
  if (!c.request && !c.done) {
    c.nextRequest -= dt;
    if (c.nextRequest <= 0) {
      c.request = makeRequest(c);
      events.push({ type: "request" });
    }
  }

  const before = c.stage;
  if (checkStage(c)) { events.push({ type: "stage", from: before, to: c.stage, done: c.done }); }
  return events;
}

/* ============================================================
   IMPORTED SAVES
   A colony from a file is untrusted. true, or a reason why not.
   ============================================================ */
const num = (v) => typeof v === "number" && Number.isFinite(v);
const count = (v) => num(v) && v >= 0;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function checkColony(c) {
  if (!isObj(c)) { return "The colony is missing."; }
  for (const k of ["food", "tools", "blueprints", "t", "meal", "nextRequest", "nextId", "rng"]) {
    if (!num(c[k])) { return `The colony's ${k} must be a number.`; }
  }
  if (!count(c.food) || !count(c.tools) || !count(c.blueprints)) { return "Goods can't be below zero."; }
  if (!Number.isInteger(c.stage) || c.stage < 0 || c.stage > STAGES.length) { return "Unknown stage."; }
  if (!Array.isArray(c.slots) || c.slots.length !== SLOTS) { return `The planet needs ${SLOTS} plots.`; }
  if (!isObj(c.slots[0]) || c.slots[0].type !== "pod") { return "Plot 0 must be the pod."; }
  for (let i = 1; i < SLOTS; i++) {
    const s = c.slots[i];
    if (s !== null && !(isObj(s) && BUILDINGS[s.type])) { return `Plot ${i} has an unknown building.`; }
  }
  if (!Array.isArray(c.chiplers) || c.chiplers.length < 1 || c.chiplers.length > 200) { return "A colony needs 1 to 200 Chiplers."; }
  for (const ch of c.chiplers) {
    if (!isObj(ch) || !TRAITS[ch.trait] || !num(ch.a) || !Number.isInteger(ch.job) ||
        ch.job < -1 || ch.job >= SLOTS || !Number.isInteger(ch.id)) {
      return "A Chipler in the save looks wrong.";
    }
  }
  const r = c.request;
  if (r !== null && r !== undefined &&
      !(isObj(r) && (r.what === "food" || r.what === "tools") && Number.isInteger(r.n) && r.n > 0 &&
        Number.isInteger(r.reward) && r.reward > 0)) {
    return "The request in the save looks wrong.";
  }
  if (!isObj(c.stats)) { return "The colony's stats are missing."; }
  return true;
}

/* Fill gaps in a checked colony, so older or hand-edited saves load. */
export function normalize(c) {
  const base = newColony(1);
  const out = { ...base, ...c, stats: { ...base.stats, ...c.stats } };
  out.request = c.request || null;
  out.chiplers = c.chiplers.map((ch) => {
    const m = { ...makeChipler(ch.id, ch.trait, wrap(ch.a)), ...ch };
    if (!["idle", "go", "work", "carry"].includes(m.task)) { m.task = "idle"; }
    if (!count(m.work)) { m.work = 0; }
    if (!count(m.carry)) { m.carry = 0; }
    if (!num(m.off)) { m.off = 0; }
    if (!num(m.wander)) { m.wander = m.a; }
    return m;
  });
  out.done = out.stage >= STAGES.length;
  return out;
}
