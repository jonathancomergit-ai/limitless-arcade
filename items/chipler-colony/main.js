/* ============================================================
   Chipler Colony - main script

   One little Chipler, a tiny round planet, a colony to grow.
   The rules live in colony.js (pure, unit tested). This file
   draws the planet, wires up the buttons and saves.

   Sections:
     1. save       the whole colony, every few seconds
     2. state      colony, camera, effects
     3. actions    build, copy, send, skip, remove
     4. input      swipe / tap the planet, keys, buttons
     5. panels     the cards under the stage
     6. draw       planet, buildings, Chiplers
     7. loop       kit/loop.js
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys, hasTouch } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import {
  newColony, tick, build, removeBuilding, copyChipler, canCopy, copyCost, room,
  sendRequest, skipRequest, goalsFor, checkColony, normalize, isUnlocked,
  slotAngle, angleDiff, wrap, workersAt,
  BUILDINGS, BUILD_ORDER, TRAITS, STAGES, SLOTS, TAU, WORKERS_PER
} from "./colony.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const pauseBtn = $("pause");

/* ============================================================
   1. SAVE
   ============================================================ */
const save = createSave({
  slug: itemSlug(),
  version: 1,
  defaults: { colony: null, finished: 0 },
  validate: (d) => {
    if (!Number.isInteger(d.finished) || d.finished < 0) { return "finished must be a whole number."; }
    return d.colony === null || checkColony(d.colony);
  }
});
mountSavePanel($("save-panel"), save);

let writing = false;
function store() {
  writing = true;
  save.set({ colony: state.c });
  writing = false;
  saveTimer = 0;
}

/* Import or Delete from the save panel: load what's there now. */
save.onChange((d) => {
  if (writing) { return; }
  loadColony(d.colony);
  $("end-screen").hidden = true;
  toast(d.colony ? "Colony loaded." : "Fresh colony.");
});

function loadColony(saved) {
  let c = null;
  if (saved && checkColony(saved) === true) { c = normalize(saved); }
  state.c = c || newColony((Math.random() * 2 ** 32) >>> 0);
  state.sel = 1;
  cam.rot = slotAngle(1);
  bubble = null;
  puffs.length = 0;
  rosterKey = "";
  shownStage = state.c.stage;
  pops.fill(1);
  panels();
}

/* ============================================================
   2. STATE
   ============================================================ */
const state = exposeForTests({
  c: null,           // the colony (colony.js)
  sel: 1,            // the plot at the top of the planet
  /* where plot i is on screen, in stage pixels (for smoke.js) */
  slotXY: (i) => surface(slotAngle(i), geo.R * 1.08)
});

const cam = { rot: slotAngle(1), drag: null };
const geo = { cx: 0, cy: 0, R: 100, s: 16 };
const puffs = [];                 // "+2" numbers floating up
const pops = Array(SLOTS).fill(1);  // 0..1 while a new building pops up
let bubble = null;                // { id, life } trait label over a Chipler
let saveTimer = 0;
let uiTimer = 0;
let lookIndex = -1;

let calm = reducedMotion();       // true = no hops, pops or floating numbers
onMotionChange((v) => { calm = v; });

const view = createCanvas(stage, { onResize: () => { layout(); draw(); } });
const ctx = view.ctx;

function layout() {
  const w = view.width, h = view.height;
  /* The whole planet fits under the resource bar, with room above
     the top plot for its building and the selection arrow. */
  geo.R = Math.max(70, Math.min(w * 0.36, (h - 64) / 2.9));
  geo.cx = w / 2;
  geo.cy = 64 + geo.R * 1.66;
  geo.s = geo.R * 0.2;
}

/* World angle -> screen point at radius r. The plot at cam.rot is on top. */
function screenAngle(a) { return a - cam.rot - Math.PI / 2; }
function surface(a, r) {
  const p = screenAngle(a);
  return { x: geo.cx + Math.cos(p) * r, y: geo.cy + Math.sin(p) * r };
}

/* ============================================================
   3. ACTIONS
   ============================================================ */
let toastTimer = 0;
function toast(text, kind = "") {
  const el = $("toast");
  el.textContent = text;
  el.className = "cc-toast" + (kind ? ` is-${kind}` : "");
  toastTimer = 2.6;
}

function report(r, okText) {
  if (r.ok) { if (okText) { toast(okText, "good"); } } else { toast(r.why, "bad"); }
  if (r.ok) { store(); }
  panels();
  return r.ok;
}

function doBuild(type) {
  const r = build(state.c, state.sel, type);
  if (r.ok) {
    pops[state.sel] = calm ? 1 : 0;
    $("hint").hidden = true;
  }
  report(r, r.ok ? `Built a ${BUILDINGS[type].name.toLowerCase()}.` : "");
  afterStage();
}

function doCopy() {
  const r = copyChipler(state.c);
  if (r.ok) {
    bubble = { id: r.chipler.id, life: 3 };
    report(r, `New Chipler: ${TRAITS[r.chipler.trait].name}.`);
  } else {
    report(r);
  }
  afterStage();
}

function doSend() { report(sendRequest(state.c), "Sent! Blueprints earned."); afterStage(); }
function doSkip() { report(skipRequest(state.c), "Skipped. Another comes soon."); }

let removeArmed = 0;
function doRemove() {
  const s = state.c.slots[state.sel];
  if (!s || s.type === "pod") { return; }
  if (removeArmed <= 0) {
    removeArmed = 3;
    toast(`Remove the ${BUILDINGS[s.type].name.toLowerCase()}? Press again.`, "bad");
    panels();
    return;
  }
  removeArmed = 0;
  report(removeBuilding(state.c, state.sel), "Removed.");
}

let shownStage = 0;
function afterStage() {
  const c = state.c;
  if (c.stage > shownStage) {
    if (c.done) { finish(); } else { toast(`Stage ${c.stage + 1} of ${STAGES.length}!`, "good"); }
  }
  shownStage = c.stage;
}

function finish() {
  const c = state.c;
  writing = true;
  save.set({ colony: c, finished: save.get().finished + 1 });
  writing = false;
  showEnd();
}

function showEnd() {
  const c = state.c;
  $("end-pop").textContent = String(c.chiplers.length);
  $("end-built").textContent = String(c.slots.filter((s) => s && s.type !== "pod").length);
  const secs = Math.round(c.doneAt || c.t);
  $("end-time").textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  $("end-screen").hidden = false;
  if (document.activeElement && document.activeElement !== document.body) { $("keep-btn").focus({ preventScroll: true }); }
}

function select(i) {
  state.sel = ((i % SLOTS) + SLOTS) % SLOTS;
  removeArmed = 0;
  panels();
}

/* ============================================================
   4. INPUT
   ============================================================ */
const keys = createKeys({
  left:   ["ArrowLeft", "KeyA"],
  right:  ["ArrowRight", "KeyD"],
  copy:   ["Space", "KeyC"],
  farm:   ["Digit1", "Numpad1"],
  forge:  ["Digit2", "Numpad2"],
  house:  ["Digit3", "Numpad3"],
  send:   ["KeyY"],
  skip:   ["KeyN"],
  look:   ["KeyT"],
  remove: ["KeyX", "Delete"],
  pause:  ["KeyP", "Escape"]
});

const playing = () => !loop.paused && $("end-screen").hidden;
keys.on("left",  () => { if (playing()) { select(state.sel - 1); } });
keys.on("right", () => { if (playing()) { select(state.sel + 1); } });
keys.on("copy",  () => { if (playing()) { doCopy(); } });
for (const type of BUILD_ORDER) { keys.on(type, () => { if (playing()) { doBuild(type); } }); }
keys.on("send",  () => { if (playing()) { doSend(); } });
keys.on("skip",  () => { if (playing()) { doSkip(); } });
keys.on("remove", () => { if (playing()) { doRemove(); } });
keys.on("look", () => {
  const list = state.c.chiplers;
  lookIndex = (lookIndex + 1) % list.length;
  bubble = { id: list[lookIndex].id, life: 3 };
  const ch = list[lookIndex];
  toast(`Chipler #${ch.id}: ${TRAITS[ch.trait].name}`);
});
keys.on("pause", () => loop.toggle());
pauseBtn.addEventListener("click", () => loop.toggle());

/* Swipe turns the planet; a tap picks a Chipler or a plot. */
pointer(stage, {
  down(p) {
    if (!playing()) { return; }
    cam.drag = { x0: p.x, rot0: cam.rot, moved: false, id: p.id };
  },
  move(p, held) {
    const d = cam.drag;
    if (!held || !d || d.id !== p.id) { return; }
    if (Math.abs(p.x - d.x0) > 8) { d.moved = true; }
    if (d.moved) { cam.rot = d.rot0 - (p.x - d.x0) / (geo.R * 0.9); }
  },
  up(p) {
    const d = cam.drag;
    cam.drag = null;
    if (!d || d.id !== p.id) { return; }
    if (d.moved) {
      $("hint").hidden = true;
      select(Math.round(wrap(cam.rot) / (TAU / SLOTS)));
      return;
    }
    tapAt(p.x, p.y);
  }
});

function tapAt(x, y) {
  /* a Chipler? */
  let best = null, bestD = geo.s * 1.4;
  for (const ch of state.c.chiplers) {
    const q = surface(ch.a, geo.R + geo.s * 0.45);
    const dd = Math.hypot(q.x - x, q.y - y);
    if (dd < bestD) { bestD = dd; best = ch; }
  }
  if (best) {
    bubble = { id: best.id, life: 3 };
    toast(`Chipler #${best.id}: ${TRAITS[best.trait].name}`);
    return;
  }
  /* a plot? */
  for (let i = 0; i < SLOTS; i++) {
    const q = surface(slotAngle(i), geo.R + geo.s * 0.8);
    if (Math.hypot(q.x - x, q.y - y) < geo.s * 2.2) { select(i); return; }
  }
}

$("copy-btn").addEventListener("click", doCopy);
for (const type of BUILD_ORDER) { $(`build-${type}`).addEventListener("click", () => doBuild(type)); }
$("send-btn").addEventListener("click", doSend);
$("skip-btn").addEventListener("click", doSkip);
$("remove-btn").addEventListener("click", doRemove);
$("keep-btn").addEventListener("click", () => { $("end-screen").hidden = true; });
$("end-btn").addEventListener("click", showEnd);
$("end-screen").addEventListener("pointerdown", (e) => e.stopPropagation());

let newArmed = false;
$("new-btn").addEventListener("click", () => {
  const btn = $("new-btn");
  if (!newArmed) {
    newArmed = true;
    btn.classList.add("is-armed");
    btn.textContent = "Tap again to start over";
    setTimeout(() => { newArmed = false; btn.classList.remove("is-armed"); btn.textContent = "Start a new colony"; }, 4000);
    return;
  }
  newArmed = false;
  btn.classList.remove("is-armed");
  btn.textContent = "Start a new colony";
  loadColony(null);
  shownStage = 0;
  $("end-screen").hidden = true;
  store();
  toast("A fresh planet.", "good");
});

/* ============================================================
   5. PANELS - only touch the DOM when the text changes
   ============================================================ */
function setText(id, text) { const el = $(id); if (el.textContent !== text) { el.textContent = text; } }
function setOn(el, on) { if (el.disabled === on) { el.disabled = !on; } }

const costText = (cost) => Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(", ");
let rosterKey = "";

function panels() {
  const c = state.c;
  if (!c) { return; }

  /* resource bar */
  setText("food", String(c.food));
  setText("tools", String(c.tools));
  setText("blueprints", String(c.blueprints));
  setText("pop", `${c.chiplers.length}/${room(c)}`);
  $("food-box").classList.toggle("is-hungry", c.hungry);

  /* copy */
  setText("copy-cost", c.chiplers.length >= room(c) ? "need a house" : `${copyCost(c)} food`);
  $("copy-btn").setAttribute("aria-disabled", String(!canCopy(c).ok));

  /* the selected plot */
  const s = c.slots[state.sel];
  const name = s ? (s.type === "pod" ? "Landing pod" : BUILDINGS[s.type].name) : "Empty plot";
  setText("plot-title", `Plot ${state.sel + 1}: ${name}`);
  let info = "Build something here.";
  if (s && s.type === "pod") { info = "Stores goods. Room for 4 Chiplers."; }
  else if (s && s.type === "house") { info = `Stores goods. Room for ${BUILDINGS.house.room} more Chiplers.`; }
  else if (s) {
    const b = BUILDINGS[s.type];
    info = `${workersAt(c, state.sel)} of ${WORKERS_PER} workers. Makes ${b.amount} ${b.makes} a load.`;
  }
  setText("plot-info", info);
  $("builds").hidden = Boolean(s);
  $("remove-btn").hidden = !s || s.type === "pod";
  setText("remove-btn", removeArmed > 0 ? "Sure?" : "Remove");
  for (const type of BUILD_ORDER) {
    const b = BUILDINGS[type];
    setText(`cost-${type}`, isUnlocked(c, type) ? costText(b.cost) : `${b.blueprints} Blueprints`);
    const ok = isUnlocked(c, type) && Object.entries(b.cost).every(([k, v]) => c[k] >= v);
    $(`build-${type}`).setAttribute("aria-disabled", String(!ok));
  }

  /* the request */
  const r = c.request;
  if (r) {
    setText("request-text", `${r.n} ${r.what} → +${r.reward} Blueprints`);
  } else if (c.done) {
    setText("request-text", "No more requests. The colony is complete.");
  } else {
    setText("request-text", `Next request in ${Math.max(1, Math.ceil(c.nextRequest))} s.`);
  }
  setOn($("send-btn"), Boolean(r));
  setOn($("skip-btn"), Boolean(r));
  $("send-btn").setAttribute("aria-disabled", String(!r || c[r.what] < r.n));

  /* stage goals */
  setText("stage-title", c.done ? "All 3 stages done!" : `Stage ${c.stage + 1} of ${STAGES.length}`);
  const goals = goalsFor(c, Math.min(c.stage, STAGES.length - 1));
  const list = $("goals");
  const key = goals.map((g) => `${g.text}${g.have}`).join("|");
  if (list.dataset.key !== key) {
    list.dataset.key = key;
    list.replaceChildren(...goals.map((g) => {
      const li = document.createElement("li");
      if (g.met || c.done) { li.className = "is-met"; }
      const t = document.createElement("span");
      t.textContent = g.text;
      const n = document.createElement("output");
      n.textContent = `${c.done ? g.need : g.have}/${g.need}`;
      li.append(t, n);
      return li;
    }));
  }
  $("end-btn").hidden = !c.done;

  /* roster */
  const rk = c.chiplers.map((ch) => ch.id).join(",");
  if (rk !== rosterKey) {
    rosterKey = rk;
    $("roster").replaceChildren(...c.chiplers.map((ch) => {
      const li = document.createElement("li");
      const b = document.createElement("b");
      b.textContent = `#${ch.id}`;
      li.append(b, ` ${TRAITS[ch.trait].name}`);
      return li;
    }));
  }
}

/* ============================================================
   6. DRAW
   ============================================================ */
const css = getComputedStyle(document.documentElement);
const colors = {};
function color(name) {
  if (!colors[name]) { colors[name] = css.getPropertyValue(name).trim() || "#fff"; }
  return colors[name];
}
const PASTEL = ["#9FE8C8", "#FFC9A8", "#C9B6FF", "#A8DFFF"];
const TRAIT_COLOR = { first: "#FFC93C", fast: "#35D6F5", sleepy: "#C9B6FF", strong: "#FF7EAC", double: "#7DF0B8" };

function draw() {
  const w = view.width, h = view.height;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = color("--bg-2");
  ctx.fillRect(0, 0, w, h);
  const c = state.c;
  if (!c) { return; }
  const { cx, cy, R, s } = geo;

  /* the planet: a soft glow, a core, then pastel tiles round the rim */
  ctx.fillStyle = "rgba(201, 182, 255, 0.07)";
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, TAU); ctx.fill();
  ctx.fillStyle = "#1C1F33";
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

  const TILES = 32;
  for (let i = 0; i < TILES; i++) {
    const a0 = screenAngle((i / TILES) * TAU), a1 = screenAngle(((i + 1) / TILES) * TAU);
    ctx.fillStyle = PASTEL[i % PASTEL.length];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0 + 0.004, a1 - 0.004);
    ctx.arc(cx, cy, R * 0.82, a1 - 0.004, a0 + 0.004, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* a few craters that turn with the planet */
  ctx.fillStyle = "#262A44";
  for (const [a, r, k] of [[0.6, 0.45, 0.16], [2.3, 0.3, 0.1], [3.9, 0.55, 0.13], [5.2, 0.25, 0.08], [1.4, 0.15, 0.07]]) {
    const q = surface(a, R * r);
    ctx.beginPath(); ctx.arc(q.x, q.y, R * k, 0, TAU); ctx.fill();
  }

  /* plots and buildings */
  for (let i = 0; i < SLOTS; i++) { drawSlot(i, c.slots[i]); }

  /* Chiplers */
  for (const ch of c.chiplers) { drawChipler(ch); }

  /* floating "+2" numbers */
  ctx.font = `700 ${Math.round(s * 0.85)}px 'Space Grotesk', sans-serif`;
  ctx.textAlign = "center";
  for (const p of puffs) {
    const q = surface(slotAngle(p.slot), R + s * (2.3 + (calm ? 0 : (1 - p.life) * 1.2)));
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.what === "tools" ? "#C8CEE6" : "#7DF0B8";
    ctx.fillText(`+${p.n}`, Math.min(w - 20, Math.max(20, q.x)), Math.min(h - 8, Math.max(20, q.y)));
  }
  ctx.globalAlpha = 1;

  /* the trait bubble */
  if (bubble) {
    const ch = c.chiplers.find((x) => x.id === bubble.id);
    if (ch) {
      const q = surface(ch.a, R + s * 2.3);
      const text = `#${ch.id} ${TRAITS[ch.trait].name}`;
      ctx.font = `600 ${Math.max(12, Math.round(s * 0.7))}px 'Inter', sans-serif`;
      const tw = ctx.measureText(text).width + 14;
      const bx = Math.min(w - tw - 6, Math.max(6, q.x - tw / 2));
      ctx.globalAlpha = Math.min(1, bubble.life * 2);
      ctx.fillStyle = "rgba(7, 7, 12, 0.85)";
      ctx.strokeStyle = TRAIT_COLOR[ch.trait];
      ctx.lineWidth = 1.5;
      roundRect(bx, q.y - 12, tw, 24, 12);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color("--text");
      ctx.textBaseline = "middle";
      ctx.fillText(text, bx + tw / 2, q.y);
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
    }
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/* Draw in a frame standing on the surface at world angle a: up = away from the planet. */
function standAt(a, lift = 0) {
  const q = surface(a, geo.R + lift);
  ctx.save();
  ctx.translate(q.x, q.y);
  ctx.rotate(screenAngle(a) + Math.PI / 2);
}

function drawSlot(i, slot) {
  const { s } = geo;
  const selected = i === state.sel;
  standAt(slotAngle(i));

  /* the plot: a small pad on the surface */
  ctx.fillStyle = selected ? color("--accent") : "rgba(7, 7, 12, 0.35)";
  ctx.globalAlpha = selected ? 0.9 : 1;
  roundRect(-s * 1.15, -s * 0.12, s * 2.3, s * 0.3, s * 0.15);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (!slot) {
    /* empty: a dashed outline of where a building would go */
    ctx.strokeStyle = selected ? color("--text") : "rgba(236, 238, 246, 0.35)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    roundRect(-s * 0.8, -s * 1.5, s * 1.6, s * 1.35, 4);
    ctx.stroke();
    ctx.setLineDash([]);
    if (selected) {
      ctx.fillStyle = color("--text");
      ctx.fillRect(-1.5, -s * 1.1, 3, s * 0.6);
      ctx.fillRect(-s * 0.3, -s * 0.82, s * 0.6, 3);
    }
  } else {
    const k = pops[i] < 1 ? easeBack(pops[i]) : 1;
    ctx.scale(k, k);
    if (slot.type === "pod") { drawPod(s); }
    else if (slot.type === "farm") { drawFarm(s); }
    else if (slot.type === "forge") { drawForge(s); }
    else if (slot.type === "house") { drawHouse(s); }
  }

  /* selection arrow above the plot */
  if (selected) {
    ctx.fillStyle = color("--accent");
    const y = -s * 2.9 - (calm ? 0 : Math.sin(clock * 3) * 2);
    ctx.beginPath();
    ctx.moveTo(-s * 0.35, y - s * 0.4); ctx.lineTo(s * 0.35, y - s * 0.4); ctx.lineTo(0, y);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function easeBack(t) { const k = 1.7; return 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2); }

function drawPod(s) {
  ctx.fillStyle = "#DDE3F5";
  roundRect(-s * 0.8, -s * 2.1, s * 1.6, s * 2.1, [s * 0.8, s * 0.8, s * 0.2, s * 0.2]);
  ctx.fill();
  ctx.fillStyle = "#A8B0CC";
  ctx.beginPath(); ctx.moveTo(-s * 0.8, -s * 0.5); ctx.lineTo(-s * 1.2, 0); ctx.lineTo(-s * 0.8, 0); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.8, -s * 0.5); ctx.lineTo(s * 1.2, 0); ctx.lineTo(s * 0.8, 0); ctx.fill();
  ctx.fillStyle = "#35D6F5";
  ctx.beginPath(); ctx.arc(0, -s * 1.35, s * 0.38, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath(); ctx.arc(-s * 0.12, -s * 1.47, s * 0.12, 0, TAU); ctx.fill();
}

function drawFarm(s) {
  ctx.fillStyle = "#8A5A44";
  roundRect(-s * 1.05, -s * 0.45, s * 2.1, s * 0.45, 3);
  ctx.fill();
  for (let k = -1; k <= 1; k++) {
    const x = k * s * 0.65;
    const sway = calm ? 0 : Math.sin(clock * 2 + k) * s * 0.06;
    ctx.strokeStyle = "#3DBE7A";
    ctx.lineWidth = Math.max(1.5, s * 0.12);
    ctx.beginPath(); ctx.moveTo(x, -s * 0.4); ctx.lineTo(x + sway, -s * 1.15); ctx.stroke();
    ctx.fillStyle = "#7DF0B8";
    ctx.beginPath(); ctx.ellipse(x + sway - s * 0.18, -s * 0.95, s * 0.2, s * 0.11, -0.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + sway + s * 0.18, -s * 1.1, s * 0.2, s * 0.11, 0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = "#FFC9A8";
    ctx.beginPath(); ctx.arc(x + sway, -s * 1.25, s * 0.14, 0, TAU); ctx.fill();
  }
}

function drawForge(s) {
  ctx.fillStyle = "#8C93B0";
  ctx.fillRect(s * 0.35, -s * 2, s * 0.35, s * 0.9);
  ctx.fillStyle = "#6B7290";
  roundRect(-s * 0.85, -s * 1.3, s * 1.7, s * 1.3, 4);
  ctx.fill();
  ctx.fillStyle = "#FFC93C";
  roundRect(-s * 0.35, -s * 0.75, s * 0.7, s * 0.75, [s * 0.35, s * 0.35, 0, 0]);
  ctx.fill();
  if (!calm) {
    ctx.fillStyle = "rgba(200, 206, 230, 0.35)";
    for (let k = 0; k < 3; k++) {
      const t = (clock * 0.6 + k / 3) % 1;
      ctx.beginPath(); ctx.arc(s * 0.52 + t * s * 0.3, -s * 2.1 - t * s * 1.2, s * (0.12 + t * 0.2), 0, TAU); ctx.fill();
    }
  }
}

function drawHouse(s) {
  ctx.fillStyle = "#FFC9A8";
  ctx.fillRect(-s * 0.8, -s * 1.1, s * 1.6, s * 1.1);
  ctx.fillStyle = "#C9B6FF";
  ctx.beginPath(); ctx.moveTo(-s * 1.05, -s * 1.05); ctx.lineTo(0, -s * 2); ctx.lineTo(s * 1.05, -s * 1.05); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#8A5A44";
  roundRect(-s * 0.22, -s * 0.65, s * 0.44, s * 0.65, [s * 0.22, s * 0.22, 0, 0]);
  ctx.fill();
  ctx.fillStyle = "#A8DFFF";
  ctx.fillRect(s * 0.35, -s * 0.85, s * 0.28, s * 0.28);
}

/* A Chipler: a little chip with pins for legs and two eyes. */
function drawChipler(ch) {
  const { s } = geo;
  const moving = ch.task === "go" || ch.task === "carry" || (ch.task === "idle" && Math.abs(angleDiff(ch.a, ch.wander)) > 0.01);
  const hop = !calm && moving ? Math.abs(Math.sin(clock * 11 + ch.id)) * s * 0.18 : 0;
  const busy = ch.task === "work" && !calm ? Math.sin(clock * 14 + ch.id) * s * 0.05 : 0;
  standAt(ch.a, hop);
  const bw = s * 0.62, bh = s * 0.58;
  const dir = ch.task === "go" ? Math.sign(angleDiff(ch.a, slotAngle(ch.job))) : 0;

  /* pins (legs) */
  ctx.fillStyle = "#C8CEE6";
  for (const k of [-0.18, 0.18]) { ctx.fillRect(k * s - 1, -s * 0.16, 2, s * 0.16); }

  /* body */
  ctx.globalAlpha = state.c.hungry ? 0.65 : 1;
  ctx.fillStyle = TRAIT_COLOR[ch.trait] || "#FFC93C";
  roundRect(-bw / 2 + busy, -s * 0.14 - bh, bw, bh, s * 0.14);
  ctx.fill();
  ctx.globalAlpha = 1;

  /* side pins */
  ctx.fillStyle = "#C8CEE6";
  for (const y of [-0.5, -0.3]) {
    ctx.fillRect(-bw / 2 - s * 0.1 + busy, y * s, s * 0.1, 1.5);
    ctx.fillRect(bw / 2 + busy, y * s, s * 0.1, 1.5);
  }

  /* eyes */
  ctx.fillStyle = "#11121C";
  const ey = -s * 0.14 - bh * 0.62;
  for (const k of [-0.13, 0.13]) {
    ctx.beginPath(); ctx.arc(k * s + dir * s * 0.06 + busy, ey, Math.max(1.2, s * 0.06), 0, TAU); ctx.fill();
  }

  /* carrying something home */
  if (ch.task === "carry" && ch.carry > 0) {
    ctx.fillStyle = ch.carryWhat === "tools" ? "#C8CEE6" : "#7DF0B8";
    for (let k = 0; k < Math.min(2, ch.carry); k++) {
      ctx.beginPath(); ctx.arc((k - (ch.carry > 1 ? 0.5 : 0)) * s * 0.3, -s * 0.95 - bh * 0.5, s * 0.15, 0, TAU); ctx.fill();
    }
  }
  /* the one you tapped */
  if (bubble && bubble.id === ch.id) {
    ctx.strokeStyle = color("--text");
    ctx.lineWidth = 1.5;
    roundRect(-bw / 2 - 3, -s * 0.14 - bh - 3, bw + 6, bh + 6, s * 0.18);
    ctx.stroke();
  }
  ctx.restore();
}

/* ============================================================
   7. LOOP
   ============================================================ */
let clock = 0;

function update(dt) {
  clock += dt;
  const c = state.c;

  for (const e of tick(c, dt)) {
    if (e.type === "made") {
      puffs.push({ slot: e.slot, n: e.n, what: e.what, life: 1 });
      if (puffs.length > 24) { puffs.shift(); }
    } else if (e.type === "request") {
      toast("A new request!");
    } else if (e.type === "hungry") {
      toast("Out of food. Chiplers slow down.", "bad");
    } else if (e.type === "stage") {
      afterStage();
    }
  }
  for (const p of puffs) { p.life -= dt * 0.8; }
  while (puffs.length && puffs[0].life <= 0) { puffs.shift(); }
  for (let i = 0; i < SLOTS; i++) { if (pops[i] < 1) { pops[i] = Math.min(1, pops[i] + dt * 3); } }
  if (bubble) { bubble.life -= dt; if (bubble.life <= 0) { bubble = null; } }
  if (removeArmed > 0) { removeArmed -= dt; if (removeArmed <= 0) { panels(); } }

  /* the camera glides to the selected plot (slower in reduced motion) */
  if (!cam.drag) {
    const target = slotAngle(state.sel);
    const k = 1 - Math.exp(-(calm ? 4 : 9) * dt);
    cam.rot = wrap(cam.rot + angleDiff(cam.rot, target) * k);
  }

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) { $("toast").textContent = ""; } }

  saveTimer += dt;
  if (saveTimer > 4) { store(); }
  uiTimer += dt;
  if (uiTimer > 0.2) { uiTimer = 0; panels(); }
}

loadColony(save.get().colony);
layout();
$("hint").textContent = hasTouch() ? "Swipe to turn the planet. Tap a plot." : "← → turn the planet. 1 2 3 build.";
$("hint").hidden = state.c.stats.built > 0;

const loop = startLoop({
  update,
  draw,
  onPauseChange(paused) {
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
    $("msg").hidden = !paused;
    if (paused) { store(); }
    draw();
  }
});

/* Leaving the page: save where we are. */
document.addEventListener("visibilitychange", () => { if (document.hidden) { store(); } });
window.addEventListener("pagehide", store);

draw();
stage.dataset.ready = "true";
