/* ============================================================
   Stack Tower - main script

   A block slides back and forth above the tower. Tap (or Space)
   to drop it. Every block is a real rigid body (physics.js), so
   the tower leans, wobbles and, if you're sloppy, falls.

   Sections:
     1. save       best height, top score, games
     2. state      world, blocks, slider, camera, effects
     3. screens    start hint / pause / game over
     4. input      one button: tap, click, Space, Enter or Down
     5. rules      one fixed step: slide, drop, land, fall
     6. draw       side view, y up, camera rises with the tower
     7. loop       kit/loop.js + a fixed-step accumulator
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys, buttonBar } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import { createWorld, createBox, topOf } from "./physics.js";
import {
  GAME, makeRng, blockWidth, sliderSpeed, slide, isPerfect, pointsFor, roundHeight
} from "./logic.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const pauseBtn = $("pause");
const msg = $("msg");

/* ============================================================
   1. SAVE
   ============================================================ */
const save = createSave({
  slug: itemSlug(),
  version: 1,
  defaults: { best: 0, top: 0, games: 0 },
  validate: (d) =>
    (typeof d.best === "number" && Number.isFinite(d.best) && d.best >= 0 && d.best < 1e5 &&
     Number.isInteger(d.top) && d.top >= 0 && Number.isInteger(d.games) && d.games >= 0) ||
    "Best must be a height in metres; top score and games must be whole numbers."
});
mountSavePanel($("save-panel"), save);

/* ============================================================
   2. STATE
   ============================================================ */
const STEP = 1 / 120;
const FREEZE_DEPTH = 6;        // m: sleeping blocks this far under the top turn to stone
const CALM_TIME = 0.25;        // s a landed block must be still before it counts for height
const COLOURS = ["--hot", "--cyan", "--amber", "--green"];

const world = createWorld({ gravity: 9.81 });
const base = createBox({ x: 0, y: -20, w: GAME.BASE_W, h: 40, isStatic: true, friction: 0.8 });

const slider = { x: 0, y: 2, w: 1.8, h: GAME.BLOCK_H, dir: 1, visible: false, col: 0 };

const state = exposeForTests({
  mode: "play",                // "play" | "over"
  started: false,              // first drop made?
  dropped: 0,                  // blocks let go
  blocks: 0,                   // blocks that landed on the tower
  height: 0,                   // m, tower height right now (still blocks only)
  peak: 0,                     // m, the tallest it got this game
  newBest: false,              // beat the saved best this game?
  best: save.get().best,
  score: 0,
  perfects: 0,
  why: "",
  slider
});
save.onChange((d) => { state.best = d.best; hud(); });

let pieces = [];               // { body, col, landed, calmT, frozen }
let falling = null;            // the piece in the air, until it lands
let nextT = 0;                 // countdown to the next slider block
let overT = 0;                 // time since game over
let rng = makeRng(1);
const cam = { y: -2.2, shake: 0, ready: false };
const pops = [];               // floating "+10" / "Perfect!" text
const rings = [];              // Perfect rings (not in reduced motion)

let calm = reducedMotion();    // true = no shake, no flashes
onMotionChange((v) => { calm = v; });

const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;

function newGame() {
  world.clear();
  world.add(base);
  pieces = [];
  falling = null;
  pops.length = 0;
  rings.length = 0;
  rng = makeRng((Math.random() * 2 ** 32) >>> 0);
  state.newBest = false;
  Object.assign(state, { mode: "play", dropped: 0, blocks: 0, height: 0, peak: 0, score: 0, perfects: 0, why: "" });
  cam.shake = 0;
  nextT = 0;
  spawnSlider();
  show(null);
  hud();
}

function towerTop() {
  let top = 0;
  for (const p of pieces) { if (p.landed) { top = Math.max(top, topOf(p.body)); } }
  return top;
}

/* A new block appears at one end and slides toward the middle. */
function spawnSlider() {
  const side = rng() < 0.5 ? -1 : 1;
  Object.assign(slider, {
    w: blockWidth(rng()),
    x: side * GAME.RANGE,
    dir: -side,
    y: towerTop() + GAME.GAP + GAME.BLOCK_H / 2,
    visible: true,
    col: state.dropped % COLOURS.length
  });
}

/* ============================================================
   3. SCREENS
   ============================================================ */
const overScreen = $("over-screen");

function show(name) {
  overScreen.hidden = name !== "over";
  pauseBtn.disabled = state.mode !== "play";
  if (name === "over" && document.activeElement && document.activeElement !== document.body) {
    $("retry-btn").focus({ preventScroll: true });
  }
  msg.hidden = !(loop && loop.paused) && state.started;
  msg.textContent = loop && loop.paused ? "Paused" : "Tap or press Space to drop";
}

/* Taps on the game-over buttons must not reach the stage. */
overScreen.addEventListener("pointerdown", (e) => e.stopPropagation());
$("retry-btn").addEventListener("click", () => newGame());

function gameOver(why) {
  if (state.mode !== "play") { return; }
  state.mode = "over";
  state.why = why;
  overT = 0;
  slider.visible = false;
  if (!calm) { cam.shake = 1; }
  const old = save.get();
  const isBest = state.newBest;      // best is saved live, as the tower grows
  save.set({ best: Math.max(old.best, state.peak), top: Math.max(old.top, state.score), games: old.games + 1 });
  $("over-why").textContent = why;
  $("over-title").textContent = isBest ? "New best!" : "Game over";
  $("over-height").textContent = `${state.peak.toFixed(1)} m`;
  $("over-best").textContent = `${save.get().best.toFixed(1)} m`;
  $("over-blocks").textContent = String(state.blocks);
  $("over-score").textContent = String(state.score);
  pauseBtn.disabled = true;
  hud();
}

/* ============================================================
   4. INPUT - one button
   ============================================================ */
const keys = createKeys();

function press() {
  if (state.mode === "over") {
    if (overT > 0.35) { newGame(); }
    return;
  }
  if (loop.paused) { loop.resume(); return; }
  drop();
}

function drop() {
  if (!slider.visible) { return; }
  const body = world.add(createBox({
    x: slider.x, y: slider.y, w: slider.w, h: slider.h, friction: 0.8
  }));
  falling = { body, col: slider.col, landed: false, calmT: 0, frozen: false };
  pieces.push(falling);
  slider.visible = false;
  state.dropped += 1;
  if (!state.started) { state.started = true; msg.hidden = true; }
}

pointer(stage, { down() { press(); } });
keys.on("action", press);
keys.on("down", press);
buttonBar($("pad-slot"), [{ action: "action", label: "Drop", name: "Drop the block", wide: true }], keys);

function togglePause() { if (state.mode === "play") { loop.toggle(); } }
keys.on("pause", togglePause);
pauseBtn.addEventListener("click", togglePause);

/* ============================================================
   5. RULES - one fixed step
   ============================================================ */
function step(dt) {
  if (state.mode === "play" && slider.visible) {
    const s = slide(slider.x, slider.dir, sliderSpeed(state.blocks), dt);
    slider.x = s.x; slider.dir = s.dir;
  }
  if (nextT > 0) {
    nextT -= dt;
    if (nextT <= 0 && state.mode === "play") { spawnSlider(); }
  }

  world.step(dt);

  if (falling) { checkLanding(falling); }

  /* height counts only blocks that have landed and gone still */
  let h = 0;
  for (const p of pieces) {
    if (!p.landed) { continue; }
    const b = p.body;
    const still = b.isStatic || b.sleeping || (Math.hypot(b.vx, b.vy) < 0.15 && Math.abs(b.av) < 0.3);
    p.calmT = still ? p.calmT + dt : 0;
    if (p.calmT >= CALM_TIME) { h = Math.max(h, topOf(b)); }
  }
  if (state.mode === "play") {
    const height = roundHeight(h);
    if (height !== state.height) {
      state.height = height;
      state.peak = Math.max(state.peak, height);
      if (height > save.get().best) { save.set({ best: height }); state.newBest = true; }
      hud();
    }
  }

  /* anything below the base = the tower came down */
  for (const p of pieces) {
    if (p.body.y < GAME.FALL_LINE) {
      gameOver(p === falling ? "Missed the tower" : "The tower fell");
      break;
    }
  }

  /* deep, sleeping blocks turn to stone (keeps tall towers cheap and steady) */
  const top = towerTop();
  for (const p of pieces) {
    if (!p.frozen && p.landed && p.body.sleeping && topOf(p.body) < top - FREEZE_DEPTH) {
      world.freeze(p.body);
      p.frozen = true;
    }
  }

  /* blocks that fell far out of sight are gone */
  for (const p of pieces) {
    if (p.body.y < cam.y - 40) { world.remove(p.body); p.gone = true; }
  }
  if (pieces.some((p) => p.gone)) { pieces = pieces.filter((p) => !p.gone); }
  if (falling && falling.gone) { falling = null; }

  if (state.mode === "over") {
    overT += dt;
    if (overT > 0.9 && overScreen.hidden) { show("over"); }
  }
  effects(dt);
}

/* Landed = resting on something below it (not just scraping a side). */
function checkLanding(p) {
  const b = p.body;
  const under = world.touching(b).filter((o) => o.y < b.y && topOf(o) <= b.y);
  if (!under.length) { return; }
  const on = under.reduce((m, o) => (topOf(o) > topOf(m) ? o : m));
  p.landed = true;
  falling = null;
  if (state.mode !== "play") { return; }
  state.blocks += 1;
  const perfect = isPerfect(b.x - on.x);
  const pts = pointsFor(perfect);
  state.score += pts;
  if (perfect) {
    state.perfects += 1;
    pops.push({ x: b.x, y: topOf(b) + 0.3, life: 1.1, max: 1.1, text: `Perfect! +${pts}`, big: true });
    if (!calm) { rings.push({ x: b.x, y: b.y, r: 0.4, life: 0.5 }); }
  } else {
    pops.push({ x: b.x, y: topOf(b) + 0.3, life: 0.8, max: 0.8, text: `+${pts}`, big: false });
  }
  nextT = GAME.NEXT_DELAY;
  hud();
}

function effects(dt) {
  for (const p of pops) { p.life -= dt; p.y += 0.6 * dt; }
  for (const r of rings) { r.life -= dt; r.r += 4 * dt; }
  while (pops.length && pops[0].life <= 0) { pops.shift(); }
  while (rings.length && rings[0].life <= 0) { rings.shift(); }
  cam.shake = Math.max(0, cam.shake - dt * 2.5);

  /* camera: keep the slider near the top, and the base in view early on */
  const { viewH } = layout();
  const sliderTop = towerTop() + GAME.GAP + GAME.BLOCK_H;
  const target = Math.max(-2.2, sliderTop + 1.1 - viewH);
  if (!cam.ready) { cam.y = target; cam.ready = true; }
  cam.y += (target - cam.y) * Math.min(1, dt * 3);
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

/* Fit about 7.4 m across a phone, and 10.5 m of height. */
function layout() {
  const sc = Math.min(view.width / 7.4, view.height / 10.5);
  return { sc, viewH: view.height / sc };
}

function draw() {
  const w = view.width, h = view.height;
  const { sc } = layout();
  const dpr = view.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = color("--bg-2");
  ctx.fillRect(0, 0, w, h);

  let ox = 0, oy = 0;
  if (cam.shake > 0 && !calm) {
    ox = (Math.random() - 0.5) * 12 * cam.shake;
    oy = (Math.random() - 0.5) * 12 * cam.shake;
  }
  /* world -> screen: x = 0 in the middle, y up, cam.y at the bottom edge */
  const sx = (x) => w / 2 + x * sc + ox;
  const sy = (y) => h - (y - cam.y) * sc + oy;
  const toWorld = () => ctx.setTransform(dpr * sc, 0, 0, -dpr * sc, dpr * (w / 2 + ox), dpr * (h + cam.y * sc + oy));
  const yBottom = cam.y - 1, yTop = cam.y + h / sc + 1;

  /* height lines every metre */
  ctx.font = "600 11px 'JetBrains Mono', monospace";
  ctx.textAlign = "left";
  for (let m = Math.max(1, Math.ceil(yBottom)); m < yTop; m++) {
    ctx.fillStyle = color("--line");
    ctx.fillRect(0, Math.round(sy(m)), w, 1);
    ctx.fillStyle = color("--text-faint");
    ctx.fillText(`${m} m`, 8, sy(m) - 4);
  }

  /* best height */
  if (state.best > 0) {
    const y = Math.round(sy(state.best)) + 0.5;
    ctx.strokeStyle = color("--amber");
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color("--amber");
    ctx.textAlign = "right";
    ctx.fillText(`Best ${state.best.toFixed(1)} m`, w - 8, y - 5);
    ctx.textAlign = "left";
  }

  /* the base */
  toWorld();
  const bw = GAME.BASE_W / 2;
  ctx.fillStyle = color("--surface-2");
  ctx.fillRect(-bw, yBottom, bw * 2, -yBottom);
  ctx.fillStyle = color("--line-bright");
  ctx.fillRect(-bw, -0.07, bw * 2, 0.07);

  /* aim mark: the middle of the top block */
  const topPiece = pieces.filter((p) => p.landed).reduce((m, p) => (!m || topOf(p.body) > topOf(m.body) ? p : m), null);
  const aimX = topPiece ? topPiece.body.x : 0;
  const aimY = topPiece ? topOf(topPiece.body) : 0;

  /* blocks */
  for (const p of pieces) { drawBlock(p.body.x, p.body.y, p.body.w, p.body.h, p.body.angle, p.col); }

  /* the sliding block, with a drop guide */
  if (slider.visible && state.mode === "play") {
    ctx.strokeStyle = color("--text-dim");
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 0.03;
    ctx.setLineDash([0.12, 0.12]);
    ctx.beginPath(); ctx.moveTo(slider.x, slider.y - slider.h / 2); ctx.lineTo(slider.x, aimY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    drawBlock(slider.x, slider.y, slider.w, slider.h, 0, slider.col);

    ctx.fillStyle = color("--amber");
    ctx.beginPath();
    ctx.moveTo(aimX, aimY + 0.02);
    ctx.lineTo(aimX - 0.12, aimY + 0.2);
    ctx.lineTo(aimX + 0.12, aimY + 0.2);
    ctx.closePath();
    ctx.fill();
  }

  /* Perfect rings */
  ctx.strokeStyle = color("--amber");
  ctx.lineWidth = 0.05;
  for (const r of rings) {
    ctx.globalAlpha = Math.max(0, r.life / 0.5);
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* floating points */
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = "center";
  for (const p of pops) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.3));
    ctx.font = p.big ? "800 22px 'Space Grotesk', sans-serif" : "700 16px 'Space Grotesk', sans-serif";
    ctx.fillStyle = color(p.big ? "--amber" : "--text");
    ctx.fillText(p.text, sx(p.x), sy(p.y));
  }
  ctx.globalAlpha = 1;
}

function drawBlock(x, y, bw, bh, angle, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color(COLOURS[col]);
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 0.06);
  ctx.fill();
  /* a lighter top edge and a dark outline, so blocks read apart */
  ctx.fillStyle = color("--text");
  ctx.globalAlpha = 0.25;
  ctx.fillRect(-bw / 2 + 0.06, bh / 2 - 0.12, bw - 0.12, 0.06);
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = color("--bg");
  ctx.lineWidth = 0.04;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ---- HUD ---- */
function hud() {
  $("height").textContent = `${state.height.toFixed(1)} m`;
  $("score").textContent = String(state.score);
  $("best").textContent = `${state.best.toFixed(1)} m`;
}

/* ============================================================
   7. LOOP
   ============================================================ */
let acc = 0;
function update(dt) {
  acc += dt;
  while (acc >= STEP) { step(STEP); acc -= STEP; }
}

let loop = null;
newGame();
loop = startLoop({
  update,
  draw,
  onPauseChange(paused) {
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
    msg.hidden = !paused && state.started;
    msg.textContent = paused ? "Paused" : "Tap or press Space to drop";
    draw();
  }
});

/* Back to the tab mid-game: stay paused until the player says go. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.mode === "play" && state.started) { loop.pause(); }
});

draw();
stage.dataset.ready = "true";
