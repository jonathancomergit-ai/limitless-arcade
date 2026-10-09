/* ============================================================
   Gravity Golf - main script

   Mini golf in space. Pull back, aim, and let the planets'
   gravity curve your shot into the hole. Physics in logic.js,
   holes in levels.js (both pure, unit tested).

   Sections:
     1. save       best strokes per hole, rounds played
     2. state      the hole, the ball, effects
     3. screens    start (+ hole picker) / pause / hole done / round over
     4. input      drag back (touch, mouse) or arrows + Space
     5. rules      one fixed step: fly, sink, swallow, lose, stop
     6. draw       the course, fitted into the stage
     7. scorecard  the table under the stage
     8. loop       kit/loop.js + a fixed-step accumulator
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave, isPlainObject } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import { FIELD, PHYS, makeBall, launch, stepBall, previewPath, scoreName } from "./logic.js";
import { LEVELS } from "./levels.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const pauseBtn = $("pause");

/* ============================================================
   1. SAVE
   best: { "0": 2, "5": 4 }  hole index -> fewest strokes
   ============================================================ */
const save = createSave({
  slug: itemSlug(),
  version: 1,
  defaults: { best: {}, rounds: 0 },
  validate: (d) => {
    if (!isPlainObject(d.best)) { return "best must be a list of holes."; }
    for (const [k, v] of Object.entries(d.best)) {
      if (!/^(\d|1[01])$/.test(k) || !Number.isInteger(v) || v < 1) { return "Each best must be a whole number of strokes."; }
    }
    return (Number.isInteger(d.rounds) && d.rounds >= 0) || "rounds must be a whole number.";
  }
});
mountSavePanel($("save-panel"), save);

/* ============================================================
   2. STATE
   ============================================================ */
const MAX_PULL = 150;           // field units of drag = full power
const MIN_PULL = 14;            // less than this = cancel
const PREVIEW_S = 0.65;

function pool(size, make) {
  const items = Array.from({ length: size }, () => ({ ...make(), alive: false }));
  return {
    items,
    spawn(init) {
      for (const it of items) { if (!it.alive) { return Object.assign(it, make(), init, { alive: true }); } }
      return null;
    },
    clear() { for (const it of items) { it.alive = false; } }
  };
}
const sparks = pool(160, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, col: "--text" }));
const rings = pool(8, () => ({ x: 0, y: 0, r: 0, life: 0, max: 0.6, col: "--text" }));
const TRAIL = 40;
const trail = Array.from({ length: TRAIL }, () => ({ x: 0, y: 0 }));
let trailHead = 0, trailCount = 0;

const state = exposeForTests({
  mode: "start",                // "start" | "play" | "holed" | "end"
  hole: 0,                      // index into LEVELS
  strokes: 0,
  shots: 0,                     // real shots this hole (no penalties)
  round: Array(LEVELS.length).fill(null),
  ball: makeBall(0, 0),
  anim: null,                   // { kind: "sink" | "swallow" | "lost", t, x, y }
  last: { x: 0, y: 0 },         // where the last shot was played from
  aim: { angle: -Math.PI / 2, power: 0.45 },
  aimBy: null,                  // "drag" | "keys" | null
  drag: null,                   // { x, y } finger, in field units
  squash: 0,
  /* For smoke.js: where the ball is, in CSS px inside the stage. */
  ballOnScreen: () => toScreen(state.ball.x, state.ball.y)
});

let level = LEVELS[0];
let rockShapes = [];
let calm = reducedMotion();     // true = no trail, no spinning discs, no camera nudge
onMotionChange((v) => { calm = v; });

const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;

function loadHole(i) {
  state.hole = i;
  level = LEVELS[i];
  state.ball = makeBall(level.ball.x, level.ball.y);
  state.last = { x: level.ball.x, y: level.ball.y };
  state.strokes = 0;
  state.shots = 0;
  state.anim = null;
  state.drag = null;
  state.aimBy = null;
  state.aim.angle = Math.atan2(level.cup.y - level.ball.y, level.cup.x - level.ball.x);
  state.aim.power = 0.45;
  for (const p of level.planets) { p.pulse = 0; }
  for (const r of level.rocks || []) { r.pulse = 0; }
  sparks.clear(); rings.clear();
  trailCount = 0;
  rockShapes = (level.rocks || []).map((r, k) => lumpy(r, k + i * 7));
  $("caddie-name").textContent = `Hole ${i + 1}: ${level.name}.`;
  $("caddie-tip").textContent = level.tip;
  toast("", 0);
  hud();
  scorecard();
}

/* A fixed bumpy outline per asteroid, so it reads as a rock. */
function lumpy(r, seed) {
  const n = 9;
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const wob = 0.82 + 0.18 * Math.abs(Math.sin(seed * 12.9898 + k * 78.233));
    pts.push({ x: Math.cos(a) * r.r * wob, y: Math.sin(a) * r.r * wob });
  }
  return pts;
}

/* ============================================================
   3. SCREENS
   ============================================================ */
const screens = {
  start: $("start-screen"), pause: $("pause-screen"), holed: $("holed-screen"), end: $("end-screen")
};

function show(name) {
  pauseBtn.disabled = state.mode !== "play";
  for (const [k, el] of Object.entries(screens)) { el.hidden = k !== name; }
  const focusMe = { start: "start-btn", pause: "resume-btn", holed: "next-btn", end: "again-btn" }[name];
  if (focusMe && document.activeElement && document.activeElement !== document.body) {
    $(focusMe).focus({ preventScroll: true });
  }
}
for (const el of Object.values(screens)) {
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
}

function playHole(i) {
  loadHole(i);
  state.mode = "play";
  acc = 0;
  show(null);
  if (loop.paused) { loop.resume(); }
}

function newRound(from = 0) {
  state.round = Array(LEVELS.length).fill(null);
  playHole(from);
}

function holed() {
  state.mode = "holed";
  const i = state.hole;
  state.round[i] = state.strokes;
  const best = save.get().best;
  const old = best[i];
  if (!old || state.strokes < old) { save.set({ best: { ...best, [i]: state.strokes } }); }
  $("holed-kicker").textContent = `Hole ${i + 1} · ${level.name}`;
  $("holed-title").textContent = scoreName(state.strokes, level.par);
  $("holed-strokes").textContent = String(state.strokes);
  $("holed-par").textContent = String(level.par);
  $("holed-best").textContent = String(save.get().best[i]);
  $("next-btn").textContent = i + 1 < LEVELS.length ? "Next hole" : "See scorecard";
  show("holed");
  scorecard();
}

function nextHole() {
  if (state.hole + 1 < LEVELS.length) { playHole(state.hole + 1); return; }
  /* round over */
  state.mode = "end";
  const played = state.round.filter((s) => s !== null);
  const total = played.reduce((a, b) => a + b, 0);
  const par = state.round.reduce((a, s, k) => a + (s === null ? 0 : LEVELS[k].par), 0);
  if (played.length === LEVELS.length) { save.set({ rounds: save.get().rounds + 1 }); }
  const vs = total - par;
  $("end-title").textContent = `${total} strokes`;
  $("end-vs").textContent = vs === 0 ? "Even par" : vs < 0 ? `${-vs} under par` : `${vs} over par`;
  show("end");
  scorecard();
}

function toMenu() {
  state.mode = "start";
  holeGrid();
  show("start");
  if (loop.paused) { loop.resume(); }
}

$("start-btn").addEventListener("click", () => newRound(0));
$("resume-btn").addEventListener("click", () => loop.resume());
$("restart-btn").addEventListener("click", () => playHole(state.hole));
$("menu-btn").addEventListener("click", toMenu);
$("next-btn").addEventListener("click", nextHole);
$("replay-btn").addEventListener("click", () => playHole(state.hole));
$("again-btn").addEventListener("click", () => newRound(0));

/* Hole picker on the start screen. */
function holeGrid() {
  const grid = $("hole-grid");
  const best = save.get().best;
  grid.replaceChildren();
  LEVELS.forEach((lv, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gg-hole-btn" + (best[i] && best[i] <= lv.par ? " is-under" : "");
    b.setAttribute("aria-label", `Hole ${i + 1}, ${lv.name}, par ${lv.par}` + (best[i] ? `, best ${best[i]}` : ""));
    const small = document.createElement("small");
    small.textContent = best[i] ? `best ${best[i]}` : `par ${lv.par}`;
    b.append(String(i + 1), small);
    b.addEventListener("click", () => newRound(i));
    grid.append(b);
  });
}

/* ============================================================
   4. INPUT
   ============================================================ */
const keys = createKeys();

function canShoot() {
  return state.mode === "play" && !loop.paused && !state.ball.moving && !state.anim;
}

function shoot(angle, power) {
  if (!canShoot()) { return; }
  state.last = { x: state.ball.x, y: state.ball.y };
  launch(state.ball, angle, power);
  state.strokes += 1;
  state.shots += 1;
  state.squash = 1;
  state.aimBy = state.aimBy === "keys" ? "keys" : null;
  trailCount = 0;
  const b = state.ball;
  for (let i = 0; i < 10; i++) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.2;
    const v = 40 + Math.random() * 80;
    spark(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v, 0.35, "--text-dim");
  }
  popStrokes();
  hud();
}

/* Drag back: the pull vector (finger -> ball) is the shot. */
function pullFromDrag() {
  const b = state.ball, d = state.drag;
  const dx = b.x - d.x, dy = b.y - d.y;
  const len = Math.hypot(dx, dy);
  return { angle: Math.atan2(dy, dx), power: Math.min(1, len / MAX_PULL), len };
}

pointer(stage, {
  down(p) {
    if (!canShoot()) { return; }
    state.drag = toField(p.x, p.y);
    state.dragFrom = { ...state.drag };
    state.aimBy = "drag";

  },
  move(p, isDown) {
    if (!isDown || !state.drag) { return; }
    /* the drag is measured from where the finger went down,
       so you don't have to hit the tiny ball exactly */
    const f = toField(p.x, p.y);
    state.drag = { x: state.ball.x + (f.x - state.dragFrom.x), y: state.ball.y + (f.y - state.dragFrom.y) };
    const s = pullFromDrag();
    state.aim.angle = s.angle;
    state.aim.power = s.power;
  },
  up(p) {
    if (!state.drag) { return; }
    const s = pullFromDrag();
    state.drag = null;
    state.aimBy = null;
    if (!p.cancelled && s.len >= MIN_PULL) { shoot(s.angle, s.power); }
  }
});

keys.on("action", () => {
  if (state.mode === "start") { newRound(0); return; }
  if (state.mode === "play" && loop.paused) { loop.resume(); return; }
  if (state.mode === "play") { state.aimBy = "keys"; shoot(state.aim.angle, state.aim.power); }
});
for (const k of ["left", "right", "up", "down"]) {
  keys.on(k, () => { if (canShoot()) { state.aimBy = "keys"; } });
}
keys.on("pause", () => { if (state.mode === "play") { loop.toggle(); } });
pauseBtn.addEventListener("click", () => { if (state.mode === "play") { loop.toggle(); } });

function keyAim(dt) {
  if (!canShoot() || state.drag) { return; }
  const fine = keys.isDown("left") || keys.isDown("right") ? 1 : 0;
  if (fine) {
    state.aimHeld = (state.aimHeld || 0) + dt;
    const speed = state.aimHeld < 0.4 ? 0.5 : 1.6;          // tap = fine, hold = fast
    state.aim.angle += (keys.isDown("right") ? 1 : -1) * speed * dt;
  } else { state.aimHeld = 0; }
  if (keys.isDown("up")) { state.aim.power = Math.min(1, state.aim.power + 0.6 * dt); }
  if (keys.isDown("down")) { state.aim.power = Math.max(0.05, state.aim.power - 0.6 * dt); }
}

/* ============================================================
   5. RULES - one fixed step
   ============================================================ */
function step(dt) {
  if (state.mode === "play" && !state.anim) {
    keyAim(dt);
    const b = state.ball;
    if (b.moving) {
      const ev = stepBall(b, level, dt);
      if (!calm) {
        trail[trailHead].x = b.x; trail[trailHead].y = b.y;
        trailHead = (trailHead + 1) % TRAIL;
        trailCount = Math.min(TRAIL, trailCount + 1);
      }
      if (ev) { onEvent(ev); }
    }
  }
  if (state.anim) {
    state.anim.t += dt;
    const a = state.anim;
    if (a.kind === "sink" && a.t > 0.55) { state.anim = null; holed(); }
    if ((a.kind === "swallow" || a.kind === "lost") && a.t > 0.7) {
      state.anim = null;
      state.ball = makeBall(state.last.x, state.last.y);
      trailCount = 0;
      rings.spawn({ x: state.last.x, y: state.last.y, r: 4, life: 0.4, max: 0.4, col: "--text" });
    }
  }
  effects(dt);
}

function onEvent(ev) {
  const b = state.ball;
  if (ev.type === "cup") {
    state.anim = { kind: "sink", t: 0 };
    rings.spawn({ x: level.cup.x, y: level.cup.y, r: 6, life: 0.6, max: 0.6, col: "--green" });
    const cols = ["--green", "--amber", "--cyan", "--hot"];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const v = 80 + Math.random() * 140;
      spark(level.cup.x, level.cup.y, Math.cos(a) * v, Math.sin(a) * v, 0.6 + Math.random() * 0.4, cols[i % 4]);
    }
  } else if (ev.type === "swallowed") {
    state.anim = { kind: "swallow", t: 0, x: b.x, y: b.y, bx: ev.b.x, by: ev.b.y };
    penalty("Swallowed by a black hole! +1");
  } else if (ev.type === "out") {
    state.anim = { kind: "lost", t: 0, x: b.x, y: b.y };
    penalty("Lost in space! +1");
  } else if (ev.type === "bump") {
    const n = Math.min(12, Math.round(ev.speed / 25));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * 90;
      spark(ev.x, ev.y, Math.cos(a) * v, Math.sin(a) * v, 0.3, ev.rock ? "--text-dim" : "--text");
    }
    state.squash = Math.min(1, ev.speed / 200);
    /* which body was it? give it a pulse */
    for (const p of [...level.planets, ...(level.rocks || [])]) {
      if (Math.hypot(p.x - ev.x, p.y - ev.y) < p.r + 3) { p.pulse = 1; }
    }
  }
}

function penalty(msg) {
  state.strokes += 1;
  popStrokes();
  toast(msg, 2);
  hud();
}

function spark(x, y, vx, vy, life, col) {
  sparks.spawn({ x, y, vx, vy, life, max: life, col });
}

function effects(dt) {
  for (const s of sparks.items) {
    if (!s.alive) { continue; }
    s.life -= dt;
    if (s.life <= 0) { s.alive = false; continue; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.vx *= 1 - 2.5 * dt; s.vy *= 1 - 2.5 * dt;
  }
  for (const r of rings.items) {
    if (!r.alive) { continue; }
    r.life -= dt; r.r += 90 * dt;
    if (r.life <= 0) { r.alive = false; }
  }
  for (const p of [...level.planets, ...(level.rocks || [])]) { p.pulse = Math.max(0, (p.pulse || 0) - dt * 3); }
  state.squash = Math.max(0, state.squash - dt * 5);
  if (toastT > 0) {
    toastT -= dt;
    if (toastT <= 0) { $("toast").hidden = true; }
  }
}

let toastT = 0;
function toast(text, seconds) {
  const el = $("toast");
  if (!text) { el.hidden = true; return; }
  el.textContent = text;
  el.hidden = false;
  toastT = seconds;
}

let popTimer = 0;
function popStrokes() {
  const box = $("strokes-box");
  box.classList.add("is-pop");
  clearTimeout(popTimer);
  popTimer = setTimeout(() => box.classList.remove("is-pop"), 300);
}

/* ============================================================
   6. DRAW
   The 420 x 560 field is scaled to fit the stage and centred.
   ============================================================ */
const css = getComputedStyle(document.documentElement);
const colors = {};
function color(name) {
  if (!colors[name]) { colors[name] = css.getPropertyValue(name).trim() || "#fff"; }
  return colors[name];
}
const PLANET_COLS = ["--cyan", "--amber", "--green"];

function fit() {
  const pad = 8;
  const top = 44;                                   // room for the HUD
  const sc = Math.min((view.width - pad * 2) / FIELD.w, (view.height - top - pad) / FIELD.h);
  return { sc, ox: (view.width - FIELD.w * sc) / 2, oy: top + (view.height - top - pad - FIELD.h * sc) / 2 };
}
function toScreen(x, y) {
  const f = fit();
  return { x: f.ox + x * f.sc, y: f.oy + y * f.sc };
}
function toField(x, y) {
  const f = fit();
  return { x: (x - f.ox) / f.sc, y: (y - f.oy) / f.sc };
}

let clock = 0;
function draw() {
  const w = view.width, h = view.height;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = color("--bg");
  ctx.fillRect(0, 0, w, h);

  const f = fit();
  const px = 1 / f.sc;
  ctx.setTransform(view.dpr * f.sc, 0, 0, view.dpr * f.sc, view.dpr * f.ox, view.dpr * f.oy);

  /* the course: leave it and the ball is lost */
  ctx.fillStyle = color("--bg-2");
  ctx.fillRect(0, 0, FIELD.w, FIELD.h);
  ctx.strokeStyle = color("--line-bright");
  ctx.lineWidth = 1.5 * px;
  ctx.setLineDash([6 * px, 6 * px]);
  ctx.strokeRect(0, 0, FIELD.w, FIELD.h);
  ctx.setLineDash([]);

  /* planets: faint pull rings, then the body */
  level.planets.forEach((p, k) => {
    const col = color(PLANET_COLS[k % PLANET_COLS.length]);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1 * px;
    for (const [m, a] of [[1.7, 0.16], [2.5, 0.08]]) {
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * m, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const r = p.r * (1 + 0.06 * (p.pulse || 0));
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color("--bg-2");
    ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.arc(p.x + r * 0.35, p.y + r * 0.3, r * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });

  /* black holes: a dark core with a pink ring that spins */
  for (const b of level.holes || []) {
    ctx.strokeStyle = color("--hot");
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1 * px;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 4, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(calm ? 0 : clock * 1.6);
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.arc(0, 0, b.r + 7, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.fillStyle = color("--bg");
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color("--hot");
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2); ctx.stroke();
  }

  /* asteroids */
  (level.rocks || []).forEach((r, k) => {
    const pts = rockShapes[k];
    const s = 1 + 0.1 * (r.pulse || 0);
    ctx.fillStyle = color("--line-bright");
    ctx.strokeStyle = color("--text-faint");
    ctx.lineWidth = 1.5 * px;
    ctx.beginPath();
    pts.forEach((pt, j) => { const x = r.x + pt.x * s, y = r.y + pt.y * s; if (j) { ctx.lineTo(x, y); } else { ctx.moveTo(x, y); } });
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  });

  /* the cup and its flag */
  const c = level.cup;
  ctx.fillStyle = color("--bg");
  ctx.strokeStyle = color("--text-dim");
  ctx.lineWidth = 2 * px;
  ctx.beginPath(); ctx.arc(c.x, c.y, PHYS.CUP_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = color("--text");
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - 34); ctx.stroke();
  const wave = calm ? 0 : Math.sin(clock * 4) * 2;
  ctx.fillStyle = color("--hot");
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 34); ctx.lineTo(c.x + 18, c.y - 29 + wave); ctx.lineTo(c.x, c.y - 23);
  ctx.closePath(); ctx.fill();

  /* aim: rubber band, power ring and the dotted preview */
  const b = state.ball;
  const aiming = canShoot() && (state.drag || state.aimBy === "keys");
  if (aiming) {
    const { angle, power } = state.aim;
    const col = power < 0.45 ? color("--cyan") : power < 0.8 ? color("--amber") : color("--hot");
    /* band: from the ball back toward the finger */
    const back = 18 + power * 60;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 3 * px;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(angle) * back, b.y - Math.sin(angle) * back); ctx.stroke();
    ctx.globalAlpha = 1;
    /* power ring */
    ctx.lineWidth = 3 * px;
    ctx.beginPath(); ctx.arc(b.x, b.y, 14, -Math.PI / 2, -Math.PI / 2 + power * Math.PI * 2); ctx.stroke();
    /* preview dots */
    const dots = previewPath(level, b.x, b.y, angle, power, PREVIEW_S, 5);
    ctx.fillStyle = col;
    dots.forEach((d, k) => {
      ctx.globalAlpha = 1 - k / (dots.length + 2);
      ctx.beginPath(); ctx.arc(d.x, d.y, 2.6 * Math.max(0.6, 1.1 - k / dots.length), 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /* trail */
  if (!calm && b.moving) {
    ctx.fillStyle = color("--text-dim");
    for (let k = 0; k < trailCount; k++) {
      const t = trail[(trailHead - 1 - k + TRAIL * 2) % TRAIL];
      ctx.globalAlpha = 0.45 * (1 - k / TRAIL);
      ctx.beginPath(); ctx.arc(t.x, t.y, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* rings + sparks */
  for (const r of rings.items) {
    if (!r.alive) { continue; }
    ctx.strokeStyle = color(r.col);
    ctx.globalAlpha = Math.max(0, r.life / r.max);
    ctx.lineWidth = 2.5 * px;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
  }
  for (const s of sparks.items) {
    if (!s.alive) { continue; }
    ctx.globalAlpha = Math.max(0, s.life / s.max);
    ctx.fillStyle = color(s.col);
    ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  drawBall();
}

function drawBall() {
  const b = state.ball;
  let x = b.x, y = b.y, r = PHYS.BALL_R, alpha = 1;
  const a = state.anim;
  if (a && a.kind === "sink") {
    const k = Math.min(1, a.t / 0.4);
    x = level.cup.x; y = level.cup.y; r *= 1 - k * 0.8;
  } else if (a && a.kind === "swallow") {
    const k = Math.min(1, a.t / 0.6);
    const ang = Math.atan2(a.y - a.by, a.x - a.bx) + (calm ? 0 : k * 6);
    const d = Math.hypot(a.x - a.bx, a.y - a.by) * (1 - k);
    x = a.bx + Math.cos(ang) * d; y = a.by + Math.sin(ang) * d; r *= 1 - k * 0.9;
  } else if (a && a.kind === "lost") {
    x = a.x; y = a.y; alpha = Math.max(0, 1 - a.t / 0.5);
  }
  if (r <= 0.3 || alpha <= 0) { return; }

  /* squash-and-stretch along the way it's going */
  const sp = Math.hypot(b.vx, b.vy);
  const stretch = b.moving ? Math.min(0.35, sp / 1400) : 0;
  const sq = state.squash * 0.25;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(b.moving ? Math.atan2(b.vy, b.vx) : 0);
  ctx.scale(1 + stretch - sq, 1 - stretch * 0.6 + sq);
  ctx.fillStyle = color("--text");
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;

  /* a soft ring around the ball when it's your turn, so it's easy to find */
  if (canShoot() && !state.drag) {
    ctx.strokeStyle = color("--text");
    ctx.globalAlpha = 0.25 + 0.15 * (calm ? 1 : Math.sin(clock * 3) * 0.5 + 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/* ---- HUD ---- */
function hud() {
  $("hole").textContent = `${state.hole + 1}/${LEVELS.length}`;
  $("par").textContent = String(level.par);
  $("strokes").textContent = String(state.strokes);
}

/* ============================================================
   7. SCORECARD
   ============================================================ */
function scorecard() {
  const best = save.get().best;
  const body = $("card-body");
  body.replaceChildren();
  let par = 0, round = 0, roundPar = 0, bestSum = 0, bestAll = true;
  LEVELS.forEach((lv, i) => {
    const tr = document.createElement("tr");
    if (i === state.hole && state.mode !== "start") { tr.className = "is-now"; }
    const th = document.createElement("th");
    th.scope = "row";
    const name = document.createElement("span");
    name.textContent = lv.name;
    th.append(String(i + 1), name);
    const cell = (v, p) => {
      const td = document.createElement("td");
      td.textContent = v === null || v === undefined ? "-" : String(v);
      if (v) { td.className = v < p ? "is-under" : v > p ? "is-over" : ""; }
      return td;
    };
    const r = state.round[i];
    tr.append(th, cell(lv.par), cell(r, lv.par), cell(best[i], lv.par));
    body.append(tr);
    par += lv.par;
    if (r !== null) { round += r; roundPar += lv.par; }
    if (best[i]) { bestSum += best[i]; } else { bestAll = false; }
  });
  $("card-par").textContent = String(par);
  $("card-round").textContent = roundPar ? `${round} (${fmtVs(round - roundPar)})` : "-";
  $("card-best").textContent = bestAll ? `${bestSum} (${fmtVs(bestSum - par)})` : "-";
}
function fmtVs(d) { return d === 0 ? "E" : d > 0 ? `+${d}` : String(d); }

save.onChange(() => { scorecard(); if (state.mode === "start") { holeGrid(); } });

/* ============================================================
   8. LOOP
   ============================================================ */
let acc = 0;
function update(dt) {
  clock += dt;
  acc += dt;
  while (acc >= PHYS.STEP) { step(PHYS.STEP); acc -= PHYS.STEP; }
}

loadHole(0);
holeGrid();
pauseBtn.disabled = true;
const loop = startLoop({
  update,
  draw,
  onPauseChange(paused) {
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
    if (state.mode === "play") { show(paused ? "pause" : null); }
    state.drag = null;
    draw();
  }
});

/* Back to the tab mid-hole: stay paused until the player says go. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.mode === "play") { loop.pause(); }
});

stage.dataset.ready = "true";
