/* ============================================================
   Orbit Sling - main script

   Circle a planet, tap to let go, fling to the next one.
   The maths lives in logic.js (pure, unit tested).

   Sections:
     1. save       best score
     2. state      ship, planets, camera, effect pools
     3. screens    start / pause / game over
     4. input      one button: tap, click or Space
     5. rules      one fixed step: orbit, fly, capture, crash
     6. draw       world -> screen through a smooth camera
     7. loop       kit/loop.js + a fixed-step accumulator
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import {
  planetStream, gravityFrom, circularSpeed, releaseVelocity,
  captureCheck, orbitRadius, spinDir, fitScale
} from "./logic.js";

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
  defaults: { best: 0, runs: 0 },
  validate: (d) =>
    (Number.isInteger(d.best) && d.best >= 0 && Number.isInteger(d.runs) && d.runs >= 0) ||
    "Best and runs must be whole numbers."
});
mountSavePanel($("save-panel"), save);

/* ============================================================
   2. STATE
   ============================================================ */
const STEP = 1 / 120;
const SHIP_R = 5;
const LOST_MARGIN = 50;        // px past the screen edge = lost
const MAX_FLIGHT = 7;          // seconds in open space before you're lost
const GRAVITY_RANGE = 900;     // world units; planets further away are ignored

/* Small fixed pools for effects. */
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
const sparks = pool(160, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, hue: 0 }));
const rings = pool(8, () => ({ x: 0, y: 0, r: 0, life: 0, hue: 0 }));
const TRAIL = 36;
const trail = Array.from({ length: TRAIL }, () => ({ x: 0, y: 0 }));

const state = exposeForTests({
  mode: "start",              // "start" | "play" | "over"
  phase: "orbit",             // "orbit" | "fly"
  score: 0,
  best: save.get().best,
  launches: 0,
  seed: 1,
  ship: { x: 0, y: 0, vx: 0, vy: 0 },
  orbit: null,                // { p, R, angle, dir }
  home: null,                 // planet we last left
  flightT: 0,
  slowmo: 0,
  why: ""
});
save.onChange((d) => { state.best = d.best; hud(); });

let planets = [];
let nextPlanet = null;
let trailHead = 0;
let trailCount = 0;
const cam = { x: 0, y: 0, scale: 1, punch: 0 };

let calm = reducedMotion();    // true = no camera shake/punch, no trails
onMotionChange((v) => { calm = v; });

const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;

function newRun() {
  state.seed = (Math.random() * 2 ** 32) >>> 0;
  nextPlanet = planetStream(state.seed);
  planets = [];
  ensurePlanets(0);
  const home = planets[0];
  state.score = 0;
  state.phase = "orbit";
  state.home = home;
  state.orbit = { p: home, R: orbitRadius(home, home.capture - 8), angle: Math.PI, dir: 1 };
  state.flightT = 0;
  state.slowmo = 0;
  placeOnOrbit();
  sparks.clear(); rings.clear();
  trailCount = 0;
  aimCamera(true);
}

function ensurePlanets(i) {
  while (planets.length < i + 5) { planets.push(nextPlanet()); }
}

/* ============================================================
   3. SCREENS
   ============================================================ */
const screens = { start: $("start-screen"), pause: $("pause-screen"), over: $("over-screen") };

function show(name) {
  pauseBtn.disabled = state.mode !== "play";
  for (const [k, el] of Object.entries(screens)) { el.hidden = k !== name; }
  const focusMe = { start: "start-btn", pause: "resume-btn", over: "retry-btn" }[name];
  if (focusMe && document.activeElement && document.activeElement !== document.body) {
    $(focusMe).focus({ preventScroll: true });
  }
}

/* Taps on screen buttons must not reach the stage's pointer handler. */
for (const el of Object.values(screens)) {
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
}

function startGame() {
  newRun();
  state.mode = "play";
  acc = 0;
  show(null);
  if (loop.paused) { loop.resume(); }
  hud();
}

function gameOver(why) {
  if (state.mode !== "play") { return; }
  state.mode = "over";
  state.why = why;
  const old = save.get();
  const isBest = state.score > old.best;
  save.set({ best: Math.max(old.best, state.score), runs: old.runs + 1 });
  $("over-why").textContent = why;
  $("over-title").textContent = isBest ? "New best!" : "Game over";
  $("over-score").textContent = String(state.score);
  $("over-best").textContent = String(save.get().best);
  show("over");
  hud();
}

$("start-btn").addEventListener("click", startGame);
$("retry-btn").addEventListener("click", startGame);
$("resume-btn").addEventListener("click", () => loop.resume());

/* ============================================================
   4. INPUT - one button
   ============================================================ */
const keys = createKeys();

function release() {
  if (state.mode !== "play" || state.phase !== "orbit" || loop.paused) { return; }
  const o = state.orbit;
  const v = releaseVelocity(o.p, o.angle, o.R, o.dir);
  Object.assign(state.ship, v);
  state.phase = "fly";
  state.home = o.p;
  state.orbit = null;
  state.flightT = 0;
  state.launches += 1;
  trailCount = 0;
  for (let i = 0; i < 6; i++) {
    sparks.spawn({ x: state.ship.x, y: state.ship.y,
      vx: -v.vx * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * 60,
      vy: -v.vy * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * 60,
      life: 0.35, max: 0.35, hue: -1 });
  }
}

pointer(stage, { down() { release(); } });

keys.on("action", () => {
  if (state.mode !== "play") { startGame(); }
  else if (loop.paused) { loop.resume(); }
  else { release(); }
});
keys.on("pause", () => { if (state.mode === "play") { loop.toggle(); } });
pauseBtn.addEventListener("click", () => { if (state.mode === "play") { loop.toggle(); } });

/* ============================================================
   5. RULES - one fixed step
   ============================================================ */
function step(dt) {
  /* After a capture, time runs slow for a beat: the "thunk". */
  if (state.slowmo > 0) { state.slowmo -= dt; dt *= 0.35; }

  if (state.phase === "orbit") {
    const o = state.orbit;
    const omega = circularSpeed(o.p.mu, o.R) / o.R;
    o.angle += o.dir * omega * dt;
    placeOnOrbit();
  } else if (state.mode === "play") {
    fly(dt);
  }

  /* effects */
  for (const s of sparks.items) {
    if (!s.alive) { continue; }
    s.life -= dt;
    if (s.life <= 0) { s.alive = false; continue; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.vx *= 1 - 2.5 * dt; s.vy *= 1 - 2.5 * dt;
  }
  for (const r of rings.items) {
    if (!r.alive) { continue; }
    r.life -= dt;
    r.r += 160 * dt;
    if (r.life <= 0) { r.alive = false; }
  }
  for (const p of planets) { p.pulse = Math.max(0, (p.pulse || 0) - dt * 2.5); }
  cam.punch = Math.max(0, cam.punch - dt * 3);

  aimCamera(false, dt);
}

function placeOnOrbit() {
  const o = state.orbit;
  state.ship.x = o.p.x + Math.cos(o.angle) * o.R;
  state.ship.y = o.p.y + Math.sin(o.angle) * o.R;
  const v = circularSpeed(o.p.mu, o.R);
  state.ship.vx = -Math.sin(o.angle) * v * o.dir;
  state.ship.vy = Math.cos(o.angle) * v * o.dir;
}

function fly(dt) {
  const s = state.ship;
  state.flightT += dt;

  /* inverse-square pull from every planet nearby */
  let ax = 0, ay = 0;
  for (const p of planets) {
    if (Math.abs(p.y - s.y) > GRAVITY_RANGE) { continue; }
    const g = gravityFrom(p, s.x, s.y);
    ax += g.ax; ay += g.ay;
  }
  s.vx += ax * dt; s.vy += ay * dt;
  s.x += s.vx * dt; s.y += s.vy * dt;

  if (!calm) {
    trail[trailHead].x = s.x; trail[trailHead].y = s.y;
    trailHead = (trailHead + 1) % TRAIL;
    trailCount = Math.min(TRAIL, trailCount + 1);
  }

  /* capture or crash? (ignore home for a moment after letting go) */
  for (const p of planets) {
    if (p === state.home && state.flightT < 0.6) { continue; }
    const verdict = captureCheck(p, s.x, s.y, s.vx, s.vy, SHIP_R);
    if (verdict === "crash") { crash(p); return; }
    if (verdict === "orbit") { capture(p); return; }
  }

  /* lost in space? */
  const sc = toScreen(s.x, s.y);
  const out = sc.x < -LOST_MARGIN || sc.y < -LOST_MARGIN ||
              sc.x > view.width + LOST_MARGIN || sc.y > view.height + LOST_MARGIN;
  if (out || state.flightT > MAX_FLIGHT) { gameOver("Lost in space"); }
}

function capture(p) {
  const s = state.ship;
  const d = Math.hypot(s.x - p.x, s.y - p.y);
  state.orbit = {
    p,
    R: orbitRadius(p, d),
    angle: Math.atan2(s.y - p.y, s.x - p.x),
    dir: spinDir(p, s.x, s.y, s.vx, s.vy)
  };
  state.phase = "orbit";
  placeOnOrbit();
  ensurePlanets(p.i);

  /* The capture moment: a ring, a burst, a pulse, a beat of slow-mo. */
  const isNew = p.i > state.score;
  if (isNew) { state.score = p.i; popScore(); }
  p.pulse = 1;
  rings.spawn({ x: p.x, y: p.y, r: p.r, life: 0.6, hue: p.hue });
  burst(s.x, s.y, isNew ? 22 : 8, p.hue, 170);
  state.slowmo = isNew ? 0.22 : 0;
  if (!calm && isNew) { cam.punch = 1; }
  hud();
}

function crash(p) {
  burst(state.ship.x, state.ship.y, 40, -2, 240);
  rings.spawn({ x: state.ship.x, y: state.ship.y, r: 4, life: 0.5, hue: -2 });
  gameOver(`Crashed into planet ${p.i}`);
}

function burst(x, y, n, hue, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    const life = 0.35 + Math.random() * 0.4;
    sparks.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, hue });
  }
}

let popTimer = 0;
function popScore() {
  const box = $("score-box");
  box.classList.add("is-pop");
  clearTimeout(popTimer);
  popTimer = setTimeout(() => box.classList.remove("is-pop"), 350);
}

/* ---- camera ----
   Looks at the middle of "where you are" and "where you're going",
   and zooms to fit both. Eased, so it glides instead of jumping. */
function aimCamera(snap, dt = 0) {
  const from = state.orbit ? state.orbit.p : state.home;
  if (!from) { return; }
  ensurePlanets(from.i);
  const to = planets[from.i + 1];
  let tx = (from.x + to.x) / 2;
  let ty = (from.y + to.y) / 2;
  if (state.phase === "fly") {
    tx = tx * 0.75 + state.ship.x * 0.25;
    ty = ty * 0.75 + state.ship.y * 0.25;
  }
  const ts = fitScale(from, to, view.width, view.height);
  if (snap) { cam.x = tx; cam.y = ty; cam.scale = ts; return; }
  const k = 1 - Math.exp(-2.2 * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.scale += (ts - cam.scale) * k;
}

function currentScale() { return cam.scale * (1 + 0.035 * cam.punch); }

function toScreen(x, y) {
  const sc = currentScale();
  return { x: (x - cam.x) * sc + view.width / 2, y: (y - cam.y) * sc + view.height / 2 };
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
const HUES = ["--cyan", "--amber", "--green", "--hot"];
function hueColor(h) {
  if (h === -1) { return color("--text-dim"); }
  if (h === -2) { return color("--hot"); }
  return color(HUES[h % HUES.length]);
}

function draw() {
  const w = view.width, h = view.height;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = color("--bg-2");
  ctx.fillRect(0, 0, w, h);
  if (!planets.length) { return; }

  const sc = currentScale();
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(sc, sc);
  ctx.translate(-cam.x, -cam.y);
  const px = 1 / sc;           // one screen pixel, in world units

  /* planets */
  const target = planets[(state.orbit ? state.orbit.p : state.home).i + 1];
  for (const p of planets) {
    const sp = toScreen(p.x, p.y);
    if (sp.y < -p.capture * sc - 40 || sp.y > h + p.capture * sc + 40) { continue; }
    const col = hueColor(p.hue);

    /* capture ring: dashed; brighter on the one you're aiming for */
    ctx.strokeStyle = col;
    ctx.globalAlpha = p === target ? 0.75 : 0.25;
    ctx.lineWidth = (p === target ? 2 : 1.5) * px;
    ctx.setLineDash([6 * px, 6 * px]);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.capture, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    /* the planet */
    const r = p.r * (1 + 0.12 * (p.pulse || 0));
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    /* a darker band, so it reads as a planet not a dot */
    ctx.fillStyle = color("--bg-2");
    ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.arc(p.x + r * 0.35, p.y + r * 0.3, r * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    /* number */
    ctx.fillStyle = color("--bg");
    ctx.font = `800 ${Math.max(12, r * 0.7)}px 'Space Grotesk', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.i), p.x - r * 0.1, p.y - r * 0.05);
    ctx.textBaseline = "alphabetic";
  }

  /* capture shock rings */
  for (const r of rings.items) {
    if (!r.alive) { continue; }
    ctx.strokeStyle = hueColor(r.hue);
    ctx.globalAlpha = Math.max(0, r.life / 0.6);
    ctx.lineWidth = 3 * px;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* trail (never in reduced motion) */
  if (!calm && state.phase === "fly") {
    ctx.fillStyle = color("--text-dim");
    for (let k = 0; k < trailCount; k++) {
      const t = trail[(trailHead - 1 - k + TRAIL * 2) % TRAIL];
      ctx.globalAlpha = 0.5 * (1 - k / TRAIL);
      ctx.beginPath(); ctx.arc(t.x, t.y, 2 * px, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* aim line: where you'd go if you let go now (straight, before gravity) */
  if (state.phase === "orbit" && state.mode !== "over") {
    const s = state.ship;
    const v = Math.hypot(s.vx, s.vy) || 1;
    ctx.strokeStyle = color("--text");
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2 * px;
    ctx.setLineDash([4 * px, 7 * px]);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + (s.vx / v) * 110, s.y + (s.vy / v) * 110); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  /* sparks */
  for (const s of sparks.items) {
    if (!s.alive) { continue; }
    ctx.globalAlpha = Math.max(0, s.life / s.max);
    ctx.fillStyle = hueColor(s.hue);
    ctx.fillRect(s.x - 1.5 * px, s.y - 1.5 * px, 3 * px, 3 * px);
  }
  ctx.globalAlpha = 1;

  /* the ship: an arrow along its velocity, always 1:1 screen size */
  if (!(state.mode === "over" && state.why.startsWith("Crashed"))) {
    const s = state.ship;
    const a = Math.atan2(s.vy, s.vx);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(a);
    ctx.scale(px, px);
    ctx.fillStyle = color("--text");
    ctx.strokeStyle = color("--accent");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(-7, 7); ctx.lineTo(-3, 0); ctx.lineTo(-7, -7);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  /* off-screen arrow: if the next planet is out of view, point at it */
  if (target && state.mode === "play") {
    const tp = toScreen(target.x, target.y);
    if (tp.y < 0 || tp.x < 0 || tp.x > w || tp.y > h) {
      const cx = Math.min(w - 20, Math.max(20, tp.x));
      const cy = Math.min(h - 20, Math.max(64, tp.y));
      ctx.fillStyle = hueColor(target.hue);
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ---- HUD ---- */
function hud() {
  $("score").textContent = String(state.score);
  $("best").textContent = String(state.best);
}

/* ============================================================
   7. LOOP
   ============================================================ */
let acc = 0;
function update(dt) {
  acc += dt;
  while (acc >= STEP) { step(STEP); acc -= STEP; }
  keys.wasPressed("action");
}

newRun();
pauseBtn.disabled = true;
hud();
const loop = startLoop({
  update,
  draw,
  onPauseChange(paused) {
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
    if (state.mode === "play") { show(paused ? "pause" : null); }
    draw();
  }
});

/* Back to the tab mid-game: stay paused until the player says go. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.mode === "play") { loop.pause(); }
});

stage.dataset.ready = "true";
