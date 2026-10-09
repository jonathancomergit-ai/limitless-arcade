/* ============================================================
   Slime Dash - main script

   A bouncy slime on an endless run. Tap to hop, hold to jump
   higher. The rules and the level maker live in logic.js
   (pure, unit tested).

   Sections:
     1. save       best score, runs
     2. state      slime, level chunks, camera, effect pools
     3. screens    start / pause / game over
     4. input      one button: tap, click, Space or Up
     5. rules      one fixed step: run, jump, land, collect, splat
     6. draw       side view, the ground near the bottom
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
  PHYS, speedAt, stepVertical, startJump, chunkStream, platY, scoreFor, overlaps, UNITS_PER_M
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
const W = PHYS.SLIME_W, H = PHYS.SLIME_H;
const STEP_UP = 12;            // land on a ledge even if a little below its top
const PIT_DEPTH = 320;         // fall this far = gone
const PLAT_H = 12;
const CEIL_SPIKE = 16;         // how far the ceiling spikes hang
const COIN_R = 8;

/* Small fixed pools for effects: nothing is allocated mid-run. */
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
const bits = pool(180, () => ({ x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 3, col: "--text-dim" }));
const pops = pool(10, () => ({ x: 0, y: 0, life: 0, text: "" }));
const rings = pool(10, () => ({ x: 0, y: 0, r: 0, life: 0 }));

const slime = {
  x: 0, y: 0, vy: 0,
  air: false, jumpT: -1, cut: false,
  coyote: 0, buffer: 0,
  wob: 0, wobV: 0,             // squash-and-stretch spring
  plat: null,                  // the moving platform we're riding
  blink: 2
};

const state = exposeForTests({
  mode: "start",               // "start" | "play" | "dying" | "over"
  t: 0,                        // seconds of running
  distance: 0,
  coins: 0,
  score: 0,
  best: save.get().best,
  jumps: 0,
  peak: 0,                     // highest the feet have been this run
  seed: 1,
  why: "",
  slime,
  chunks: []
});
save.onChange((d) => { state.best = d.best; hud(); });

let chunks = [];
let nextChunk = null;
let idleT = 0;                 // for the start-screen bob
let overT = 0;                 // time since game over (Space-to-retry guard)
let held = 0;                  // pointers held down on the stage
const cam = { x: 0, shake: 0 };

let calm = reducedMotion();    // true = no screen shake
onMotionChange((v) => { calm = v; });

const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;

function newRun() {
  state.seed = (Math.random() * 2 ** 32) >>> 0;
  nextChunk = chunkStream(state.seed);
  chunks = [];
  state.chunks = chunks;       // for smoke tests and bots
  Object.assign(slime, { x: 0, y: 0, vy: 0, air: false, jumpT: -1, cut: false,
    coyote: 0, buffer: 0, wob: 0, wobV: 0, plat: null });
  Object.assign(state, { t: 0, distance: 0, coins: 0, score: 0, jumps: 0, peak: 0, why: "" });
  ensureChunks();
  bits.clear(); pops.clear(); rings.clear();
  cam.x = 0; cam.shake = 0;
}

function ensureChunks() {
  while (!chunks.length || chunks.at(-1).x + chunks.at(-1).w < slime.x + 2400) {
    const c = nextChunk();
    for (const coin of c.coins) { coin.got = false; }
    chunks.push(c);
  }
  while (chunks.length > 2 && chunks[0].x + chunks[0].w < slime.x - 900) { chunks.shift(); }
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

function splat(why) {
  if (state.mode !== "play") { return; }
  state.mode = "dying";
  state.why = why;
  pauseBtn.disabled = true;
  const cx = slime.x, cy = slime.y - H / 2;
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 120 + Math.random() * 260;
    const life = 0.5 + Math.random() * 0.5;
    bits.spawn({ x: cx, y: cy, vx: Math.cos(a) * v + 60, vy: Math.sin(a) * v - 120, g: 900,
      life, max: life, size: 3 + Math.random() * 4, col: "--green" });
  }
  rings.spawn({ x: cx, y: cy, r: 8, life: 0.5 });
  if (!calm) { cam.shake = 1; }
  setTimeout(gameOver, 750);
}

function gameOver() {
  if (state.mode !== "dying") { return; }
  state.mode = "over";
  overT = 0;
  const old = save.get();
  const isBest = state.score > old.best;
  save.set({ best: Math.max(old.best, state.score), runs: old.runs + 1 });
  $("over-why").textContent = state.why;
  $("over-title").textContent = isBest ? "New best!" : "Game over";
  $("over-score").textContent = String(state.score);
  $("over-best").textContent = String(save.get().best);
  $("over-dist").textContent = `${Math.floor(state.distance / UNITS_PER_M)} m`;
  $("over-coins").textContent = String(state.coins);
  show("over");
  hud();
}

$("start-btn").addEventListener("click", startGame);
$("retry-btn").addEventListener("click", startGame);
$("resume-btn").addEventListener("click", () => loop.resume());

/* ============================================================
   4. INPUT - one button, with a hold
   ============================================================ */
const keys = createKeys();

/* A press is remembered for a moment (jump buffering), so a tap
   just before landing still jumps. */
function press() {
  if (state.mode !== "play" || loop.paused) { return; }
  slime.buffer = PHYS.BUFFER;
}

function isHeld() {
  return held > 0 || keys.isDown("action") || keys.isDown("up");
}

pointer(stage, {
  down() { held += 1; press(); },
  up() { held = Math.max(0, held - 1); }
});

function onKeyJump() {
  if (state.mode === "start" || (state.mode === "over" && overT > 0.35)) { startGame(); }
  else if (state.mode === "play" && loop.paused) { loop.resume(); }
  else { press(); }
}
keys.on("action", onKeyJump);
keys.on("up", onKeyJump);
keys.on("pause", () => { if (state.mode === "play") { loop.toggle(); } });
pauseBtn.addEventListener("click", () => { if (state.mode === "play") { loop.toggle(); } });

/* ============================================================
   5. RULES - one fixed step
   ============================================================ */
function step(dt) {
  if (state.mode === "play") { run(dt); }
  else if (state.mode === "start") {
    idleT += dt;
    if (idleT % 1.6 < dt) { slime.wobV -= 4; }      // a little idle bounce
  } else if (state.mode === "over") {
    overT += dt;
  }
  effects(dt);
}

function run(dt) {
  const s = slime;
  state.t += dt;
  const speed = speedAt(state.t);
  s.x += speed * dt;
  state.distance = s.x;
  ensureChunks();

  /* ---- jump: buffered press + coyote time ---- */
  s.buffer = Math.max(0, s.buffer - dt);
  s.coyote = s.air ? Math.max(0, s.coyote - dt) : PHYS.COYOTE;
  if (s.buffer > 0 && (!s.air || s.coyote > 0)) {
    startJump(s);
    s.buffer = 0;
    s.coyote = 0;
    s.plat = null;
    s.wobV += 9;                // stretch up
    state.jumps += 1;
    dust(s.x, 0 + s.y, 6, -1);
  }

  /* ---- vertical motion ---- */
  const prevY = s.y;
  if (s.plat) {
    s.y = platY(s.plat, state.t);
    s.vy = 0;
  } else {
    stepVertical(s, isHeld(), dt);
    s.y += s.vy * dt;
  }
  state.peak = Math.max(state.peak, -s.y);

  /* ---- what's under us? ---- */
  const feet0 = s.x - W / 2 + 5, feet1 = s.x + W / 2 - 5;
  let support = null;      // { top, plat }
  for (const c of chunks) {
    if (c.x > feet1 || c.x + c.w < feet0) { continue; }
    for (const [a, b] of c.floor) {
      if (feet1 > a && feet0 < b) { support = pick(support, 0, null, prevY, s.y); }
    }
    for (const p of c.plats) {
      if (feet1 > p.x && feet0 < p.x + p.w) {
        const top = platY(p, state.t);
        const before = platY(p, state.t - dt);
        support = pick(support, top, p, prevY - (top - before), s.y);
      }
    }
  }
  if (support) {
    if (s.air || s.plat !== support.plat) { land(support); }
    s.y = support.top;
    s.vy = 0;
  } else if (!s.air) {
    s.air = true;              // ran off an edge: coyote time starts
    s.jumpT = -1;
    s.plat = null;
  }

  /* ---- dangers ---- */
  const box = { x0: s.x - W / 2, x1: s.x + W / 2, y0: s.y - H, y1: s.y };
  for (const c of chunks) {
    if (c.x > box.x1 || c.x + c.w < box.x0) { continue; }
    /* the side of a ledge, too far below its top to step up */
    for (const [a, b] of c.floor) {
      if (feet1 > a + 2 && feet0 < b - 2 && s.y > STEP_UP) { return splat("Smacked into a ledge"); }
    }
    for (const sp of c.spikes) {
      if (overlaps(box, { x0: sp.x, x1: sp.x + sp.w, y0: -PHYS.SPIKE_H, y1: 0 }, 6)) {
        return splat("Spiked!");
      }
    }
    for (const ce of c.ceilings) {
      if (overlaps(box, { x0: ce.x0, x1: ce.x1, y0: -9999, y1: ce.y }, 4)) {
        return splat("Spiked by a low ceiling");
      }
    }
    /* coins */
    for (const coin of c.coins) {
      if (coin.got) { continue; }
      if (Math.hypot(coin.x - s.x, coin.y - (s.y - H / 2)) < COIN_R + 16) {
        coin.got = true;
        state.coins += 1;
        pops.spawn({ x: coin.x, y: coin.y - 10, life: 0.7, text: "+5" });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          bits.spawn({ x: coin.x, y: coin.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, g: 0,
            life: 0.3, max: 0.3, size: 3, col: "--amber" });
        }
        popBox("coins-box");
      }
    }
  }
  if (s.y > PIT_DEPTH) { return splat("Fell in a pit"); }

  const score = scoreFor(state.distance, state.coins);
  if (score !== state.score) { state.score = score; hud(); }
}

/* Of the things under us, take the highest one we're actually
   landing on (coming down onto it, not climbing up through it). */
function pick(best, top, plat, prevY, y) {
  const s = slime;
  const onIt = s.air ? (s.vy >= 0 && prevY <= top + STEP_UP && y >= top - 0.5)
                     : (Math.abs(y - top) <= STEP_UP || (s.plat === plat && plat));
  if (!onIt) { return best; }
  if (!best || top < best.top) { return { top, plat }; }
  return best;
}

function land(support) {
  const s = slime;
  const impact = s.air ? Math.min(1, Math.max(0, s.vy) / 900) : 0;
  s.air = false;
  s.jumpT = -1;
  s.cut = false;
  s.vy = 0;
  s.plat = support.plat;
  if (impact > 0.1) {
    s.wobV -= 6 + 10 * impact;   // squash down
    dust(s.x, support.top, Math.round(4 + 8 * impact), 1);
  }
  /* a buffered press fires on the very next step */
}

function dust(x, y, n, dir) {
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const life = 0.25 + Math.random() * 0.2;
    bits.spawn({ x: x + side * (6 + Math.random() * 8), y: y - 2,
      vx: side * (50 + Math.random() * 90) * (dir > 0 ? 1 : 0.6) - 40, vy: -20 - Math.random() * 60,
      g: 300, life, max: life, size: 2 + Math.random() * 2, col: "--text-dim" });
  }
}

function effects(dt) {
  /* squash-and-stretch spring */
  slime.wobV += (-220 * slime.wob - 13 * slime.wobV) * dt;
  slime.wob += slime.wobV * dt;
  slime.blink -= dt;
  if (slime.blink < -0.12) { slime.blink = 1.5 + Math.random() * 2.5; }

  for (const b of bits.items) {
    if (!b.alive) { continue; }
    b.life -= dt;
    if (b.life <= 0) { b.alive = false; continue; }
    b.vy += b.g * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
  }
  for (const p of pops.items) {
    if (!p.alive) { continue; }
    p.life -= dt; p.y -= 40 * dt;
    if (p.life <= 0) { p.alive = false; }
  }
  for (const r of rings.items) {
    if (!r.alive) { continue; }
    r.life -= dt; r.r += 180 * dt;
    if (r.life <= 0) { r.alive = false; }
  }
  cam.shake = Math.max(0, cam.shake - dt * 3);
}

const popTimers = {};
function popBox(id) {
  const box = $(id);
  box.classList.add("is-pop");
  clearTimeout(popTimers[id]);
  popTimers[id] = setTimeout(() => box.classList.remove("is-pop"), 250);
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

/* World units -> screen: fit about 420 units across a phone,
   and about 330 units of height on a wide screen. */
function layout() {
  const sc = Math.min(view.width / 420, view.height / 330);
  return { sc, groundY: view.height * 0.78, slimeX: view.width * (view.width < 600 ? 0.22 : 0.26) };
}

function draw() {
  const w = view.width, h = view.height;
  const { sc, groundY, slimeX } = layout();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = color("--bg-2");
  ctx.fillRect(0, 0, w, h);
  if (!chunks.length) { return; }

  /* camera follows the slime; shake only when motion is allowed */
  cam.x = slime.x - slimeX / sc;
  let ox = 0, oy = 0;
  if (cam.shake > 0 && !calm) {
    ox = (Math.random() - 0.5) * 10 * cam.shake;
    oy = (Math.random() - 0.5) * 10 * cam.shake;
  }
  const left = cam.x - 40, right = cam.x + w / sc + 40;
  const top = -groundY / sc - 20;          // world y at the top of the screen
  const bottom = (h - groundY) / sc + 20;
  const px = 1 / sc;

  ctx.setTransform(view.dpr * sc, 0, 0, view.dpr * sc,
    view.dpr * (-cam.x * sc + ox), view.dpr * (groundY + oy));

  /* distance markers every 25 m: so you can feel the speed */
  const every = 25 * UNITS_PER_M;
  ctx.font = `600 ${11 * px}px 'JetBrains Mono', monospace`;
  ctx.textAlign = "left";
  for (let m = Math.floor(left / every) * every; m < right; m += every) {
    if (m <= 0) { continue; }
    ctx.strokeStyle = color("--line");
    ctx.lineWidth = 1 * px;
    ctx.setLineDash([4 * px, 6 * px]);
    ctx.beginPath(); ctx.moveTo(m, top); ctx.lineTo(m, 0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color("--text-faint");
    ctx.fillText(`${m / UNITS_PER_M} m`, m + 5 * px, Math.max(top + 80 * px, -245));
  }

  for (const c of chunks) {
    if (c.x > right || c.x + c.w < left) { continue; }

    /* ground */
    for (const [a, b] of c.floor) {
      ctx.fillStyle = color("--surface-2");
      ctx.fillRect(a - 1, 0, b - a + 2, bottom);   /* overlap: no seams between chunks */
      ctx.fillStyle = color("--line-bright");
      ctx.fillRect(a, 0, b - a, 3 * px + 1);
    }
    /* ledges: a pink lip so pits read as danger */
    for (let k = 1; k < c.floor.length; k++) {
      ctx.fillStyle = color("--hot");
      ctx.globalAlpha = 0.5;
      ctx.fillRect(c.floor[k - 1][1] - 2, 0, 2, bottom);
      ctx.fillRect(c.floor[k][0], 0, 2, bottom);
      ctx.globalAlpha = 1;
    }

    /* spikes */
    ctx.fillStyle = color("--hot");
    for (const sp of c.spikes) {
      ctx.beginPath();
      ctx.moveTo(sp.x + 1, 0);
      ctx.lineTo(sp.x + sp.w / 2, -PHYS.SPIKE_H);
      ctx.lineTo(sp.x + sp.w - 1, 0);
      ctx.closePath();
      ctx.fill();
    }

    /* low ceilings: a block from the top, spikes hanging down */
    for (const ce of c.ceilings) {
      const base = ce.y - CEIL_SPIKE;
      ctx.fillStyle = color("--surface-2");
      ctx.fillRect(ce.x0, top, ce.x1 - ce.x0, base - top);
      ctx.fillStyle = color("--line-bright");
      ctx.fillRect(ce.x0, base - 3 * px - 1, ce.x1 - ce.x0, 3 * px + 1);
      ctx.fillStyle = color("--hot");
      const n = Math.max(1, Math.floor((ce.x1 - ce.x0) / 20));
      const sw = (ce.x1 - ce.x0) / n;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const x = ce.x0 + k * sw;
        ctx.moveTo(x + 1, base); ctx.lineTo(x + sw / 2, ce.y); ctx.lineTo(x + sw - 1, base);
      }
      ctx.fill();
    }

    /* moving platforms, with a faint rail showing where they travel */
    for (const p of c.plats) {
      const y = platY(p, state.t);
      ctx.strokeStyle = color("--cyan");
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 2 * px;
      ctx.setLineDash([3 * px, 5 * px]);
      ctx.beginPath();
      ctx.moveTo(p.x + p.w / 2, p.y0 + PLAT_H); ctx.lineTo(p.x + p.w / 2, p.y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color("--cyan");
      ctx.beginPath();
      ctx.roundRect(p.x, y, p.w, PLAT_H, 4);
      ctx.fill();
    }

    /* coins */
    for (const coin of c.coins) {
      if (coin.got) { continue; }
      const spin = calm ? 1 : Math.abs(Math.cos(state.t * 4 + coin.x * 0.02));
      ctx.fillStyle = color("--amber");
      ctx.beginPath();
      ctx.ellipse(coin.x, coin.y, Math.max(1.5, COIN_R * spin), COIN_R, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color("--bg-2");
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(coin.x, coin.y, Math.max(0.5, COIN_R * 0.45 * spin), COIN_R * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* rings */
  ctx.strokeStyle = color("--green");
  for (const r of rings.items) {
    if (!r.alive) { continue; }
    ctx.globalAlpha = Math.max(0, r.life / 0.5);
    ctx.lineWidth = 3 * px;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* the slime */
  if (state.mode === "play" || state.mode === "start") { drawSlime(); }

  /* bits */
  for (const b of bits.items) {
    if (!b.alive) { continue; }
    ctx.globalAlpha = Math.max(0, b.life / b.max);
    ctx.fillStyle = color(b.col);
    ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
  }
  ctx.globalAlpha = 1;

  /* +5 pops */
  ctx.font = `800 ${15 * px}px 'Space Grotesk', sans-serif`;
  ctx.textAlign = "center";
  for (const p of pops.items) {
    if (!p.alive) { continue; }
    ctx.globalAlpha = Math.min(1, p.life / 0.3);
    ctx.fillStyle = color("--amber");
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawSlime() {
  const s = slime;
  /* stretch with vertical speed, plus the springy wobble */
  const stretch = s.air ? Math.min(0.28, Math.abs(s.vy) / 2600) : 0;
  const k = Math.max(-0.4, Math.min(0.45, s.wob * 0.08 + stretch));
  const sy = 1 + k, sx = 1 - k * 0.75;
  const w = W * sx, h = H * sy;
  const x = s.x, y = s.y;
  const lean = s.air ? Math.max(-4, Math.min(4, s.vy / 160)) : 0;

  ctx.fillStyle = color("--green");
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x + w / 2, y);
  ctx.bezierCurveTo(x + w / 2 + 3, y - h * 0.55, x + w * 0.32 + lean, y - h, x + lean, y - h);
  ctx.bezierCurveTo(x - w * 0.32 + lean, y - h, x - w / 2 - 3, y - h * 0.55, x - w / 2, y);
  ctx.fill();

  /* shine */
  ctx.fillStyle = color("--text");
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(x - w * 0.2 + lean, y - h * 0.72, w * 0.1, h * 0.12, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  /* eyes: look up when rising, down when falling */
  const look = s.air ? Math.max(-2, Math.min(2, s.vy / 300)) : 0;
  const ey = y - h * 0.52 + look * 0.5;
  for (const ex of [x + w * 0.08 + lean * 0.6, x + w * 0.3 + lean * 0.6]) {
    ctx.fillStyle = color("--bg");
    if (s.blink < 0) {
      ctx.fillRect(ex - 2.5, ey, 5, 1.6);
    } else {
      ctx.beginPath(); ctx.ellipse(ex, ey, 2.6, 3.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color("--text");
      ctx.beginPath(); ctx.arc(ex + 0.9, ey - 1.2 + look * 0.4, 1, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ---- HUD ---- */
function hud() {
  $("score").textContent = String(state.score);
  $("coins").textContent = String(state.coins);
  $("best").textContent = String(state.best);
}

/* ============================================================
   7. LOOP
   ============================================================ */
let acc = 0;
function update(dt) {
  acc += dt;
  while (acc >= STEP) { step(STEP); acc -= STEP; }
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
    held = 0;
    draw();
  }
});

/* Back to the tab mid-run: stay paused until the player says go. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.mode === "play") { loop.pause(); }
});

stage.dataset.ready = "true";
