/* ============================================================
   Timeless Mini - main script

   A tiny arena where the clock is your health. The rules live
   in logic.js (pure, unit tested); this file is the game:

   Sections:
     1. save       best time survived
     2. state      player, pools, the clock
     3. screens    start / pause / game over
     4. input      virtual stick, keys
     5. rules      one fixed step of the game
     6. draw       pictures
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
  RULES, drainClock, hitClock, killClock, waveAt, waveConfig, pickKind,
  nearest, stickVector, keyVector, createPool, edgePoint, formatClock, formatTime
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
  defaults: { best: 0, bestWave: 0, runs: 0 },
  validate: (d) =>
    (typeof d.best === "number" && d.best >= 0 && d.best < 1e6 &&
     Number.isInteger(d.bestWave) && d.bestWave >= 0 &&
     Number.isInteger(d.runs) && d.runs >= 0) || "That save has odd numbers in it."
});
mountSavePanel($("save-panel"), save);

/* ============================================================
   2. STATE
   ============================================================ */
const STEP = 1 / 120;          // fixed physics step (seconds)
const PLAYER_R = 13;
const PLAYER_SPEED = 200;      // px per second
const FIRE_EVERY = 0.26;
const FIRE_RANGE = 340;
const BULLET_SPEED = 560;
const STICK_R = 46;

const KINDS = {
  chaser: { r: 11, hp: 2, speed: 62 },
  dasher: { r: 12, hp: 2, speed: 46 },
  brute:  { r: 19, hp: 6, speed: 38 }
};

const enemies = createPool(48, () => ({
  kind: "chaser", x: 0, y: 0, vx: 0, vy: 0, r: 11, hp: 1, maxHp: 1, speed: 60,
  warn: 0, mode: "walk", t: 0, ax: 0, ay: 0, flash: 0
}));
const bullets = createPool(48, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
const sparks = createPool(220, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: "#fff", size: 2 }));
const popups = createPool(20, () => ({ x: 0, y: 0, text: "", color: "#fff", life: 0 }));

const state = exposeForTests({
  mode: "start",               // "start" | "play" | "over"
  clock: RULES.startTime,
  elapsed: 0,
  wave: 1,
  kills: 0,
  hits: 0,
  best: save.get().best,
  player: { x: 0, y: 0, invuln: 0, fireT: 0, aim: -Math.PI / 2 },
  spawnT: 1.2,
  shake: 0,
  flash: 0,
  waveBanner: 0,
  enemies: enemies.items
});
save.onChange((d) => { state.best = d.best; hud(true); });

let calm = reducedMotion();    // true = no shake, no flashes, no blinking
onMotionChange((v) => { calm = v; });

const view = createCanvas(stage, { onResize: () => { keepInArena(); draw(); } });
const ctx = view.ctx;

function keepInArena() {
  const p = state.player;
  if (state.mode === "start" || (!p.x && !p.y)) { p.x = view.width / 2; p.y = view.height * 0.55; }
  p.x = Math.min(view.width - PLAYER_R, Math.max(PLAYER_R, p.x));
  p.y = Math.min(view.height - PLAYER_R, Math.max(PLAYER_R, p.y));
}
keepInArena();

/* ============================================================
   3. SCREENS
   ============================================================ */
const screens = { start: $("start-screen"), pause: $("pause-screen"), over: $("over-screen") };

function show(name) {
  pauseBtn.disabled = state.mode !== "play";
  for (const [k, el] of Object.entries(screens)) { el.hidden = k !== name; }
  const focusMe = { start: "start-btn", pause: "resume-btn", over: "retry-btn" }[name];
  /* Move focus only for keyboard users already on the page,
     so a phone doesn't scroll or pop up anything. */
  if (focusMe && document.activeElement && document.activeElement !== document.body) {
    $(focusMe).focus({ preventScroll: true });
  }
}

/* Taps on a screen's buttons must not reach the stage's pointer
   handler (it would capture the pointer and swallow the click). */
for (const el of Object.values(screens)) {
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
}

function startGame() {
  enemies.clear(); bullets.clear(); sparks.clear(); popups.clear();
  Object.assign(state, {
    mode: "play", clock: RULES.startTime, elapsed: 0, wave: 1, kills: 0, hits: 0,
    spawnT: 1.2, shake: 0, flash: 0, waveBanner: 2
  });
  Object.assign(state.player, { x: view.width / 2, y: view.height * 0.55, invuln: 0, fireT: 0.4 });
  stick = null;
  acc = 0;
  show(null);
  if (loop.paused) { loop.resume(); }
  hud(true);
}

function gameOver() {
  state.mode = "over";
  stick = null;
  const old = save.get();
  const isBest = state.elapsed > old.best;
  save.set({
    best: isBest ? Math.round(state.elapsed * 10) / 10 : old.best,
    bestWave: Math.max(old.bestWave, state.wave),
    runs: old.runs + 1
  });
  burst(state.player.x, state.player.y, 40, color("--amber"), 260);
  $("over-title").textContent = isBest ? "New best!" : "Time's up";
  $("over-time").textContent = formatTime(state.elapsed);
  $("over-best").textContent = formatTime(save.get().best);
  $("over-wave").textContent = String(state.wave);
  show("over");
  hud(true);
}

$("start-btn").addEventListener("click", startGame);
$("retry-btn").addEventListener("click", startGame);
$("resume-btn").addEventListener("click", () => loop.resume());

/* ============================================================
   4. INPUT
   Virtual stick: it appears wherever the thumb (or mouse) lands,
   and steers by how far you drag from there.
   ============================================================ */
const keys = createKeys();
let stick = null;              // { id, ox, oy, x, y }

pointer(stage, {
  down(p) {
    if (state.mode !== "play" || loop.paused) { return; }
    if (stick) { return; }     // one thumb at a time
    stick = { id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
  },
  move(p) {
    if (stick && p.id === stick.id) {
      stick.x = p.x; stick.y = p.y;
      /* Drag far past the ring and the base follows the thumb,
         so you never "run out" of stick. */
      const dx = p.x - stick.ox, dy = p.y - stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R * 1.6) {
        const k = (len - STICK_R * 1.6) / len;
        stick.ox += dx * k; stick.oy += dy * k;
      }
    }
  },
  up(p) { if (stick && p.id === stick.id) { stick = null; } }
});

keys.on("action", () => {
  if (state.mode === "start" || state.mode === "over") { startGame(); }
  else if (loop.paused) { loop.resume(); }
});
keys.on("pause", () => { if (state.mode === "play") { loop.toggle(); } });
pauseBtn.addEventListener("click", () => { if (state.mode === "play") { loop.toggle(); } });

function moveInput() {
  const k = keyVector(keys.isDown("left"), keys.isDown("right"), keys.isDown("up"), keys.isDown("down"));
  if (k.x || k.y) { return k; }
  if (stick) { return stickVector(stick.ox, stick.oy, stick.x, stick.y, STICK_R); }
  return { x: 0, y: 0 };
}

/* ============================================================
   5. RULES - one fixed step
   ============================================================ */
function step(dt) {
  if (state.mode !== "play") { return; }
  const p = state.player;

  /* ---- clock + waves ---- */
  state.elapsed += dt;
  state.clock = drainClock(state.clock, dt);
  const wave = waveAt(state.elapsed);
  if (wave !== state.wave) { state.wave = wave; state.waveBanner = 2; }
  const cfg = waveConfig(state.wave);

  /* ---- player ---- */
  const m = moveInput();
  p.x = Math.min(view.width - PLAYER_R, Math.max(PLAYER_R, p.x + m.x * PLAYER_SPEED * dt));
  p.y = Math.min(view.height - PLAYER_R, Math.max(PLAYER_R, p.y + m.y * PLAYER_SPEED * dt));
  p.invuln = Math.max(0, p.invuln - dt);

  /* ---- spawning ---- */
  state.spawnT -= dt;
  if (state.spawnT <= 0) {
    state.spawnT = cfg.spawnEvery * (0.8 + Math.random() * 0.4);
    if (enemies.count() < cfg.maxAlive) { spawnEnemy(pickKind(state.wave, Math.random()), cfg); }
  }

  /* ---- auto-fire at the nearest enemy ---- */
  p.fireT -= dt;
  if (p.fireT <= 0) {
    const i = nearest(p, enemies.items, FIRE_RANGE);
    if (i >= 0) {
      const e = enemies.items[i];
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      p.aim = a;
      bullets.spawn({ x: p.x + Math.cos(a) * PLAYER_R, y: p.y + Math.sin(a) * PLAYER_R,
        vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: 0.8 });
      p.fireT = FIRE_EVERY;
    } else {
      p.fireT = 0.05;
    }
  }

  /* ---- enemies ---- */
  for (const e of enemies.items) {
    if (!e.alive) { continue; }
    e.flash = Math.max(0, e.flash - dt);
    if (e.warn > 0) { e.warn -= dt; continue; }   // still appearing: harmless
    moveEnemy(e, p, dt);

    /* touch = hit */
    if (p.invuln <= 0 && dist2(e, p) < (e.r + PLAYER_R - 3) ** 2) { hurt(e); }
  }
  separate();

  /* ---- bullets ---- */
  for (const b of bullets.items) {
    if (!b.alive) { continue; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < -10 || b.y < -10 || b.x > view.width + 10 || b.y > view.height + 10) { b.alive = false; continue; }
    for (const e of enemies.items) {
      if (!e.alive || e.warn > 0) { continue; }
      if (dist2(e, b) < (e.r + 4) ** 2) {
        b.alive = false;
        e.hp -= 1; e.flash = 0.09;
        e.x += b.vx * 0.012; e.y += b.vy * 0.012;    // a little knock-back
        burst(b.x, b.y, 3, color("--cyan"), 90);
        if (e.hp <= 0) { kill(e); }
        break;
      }
    }
  }

  /* ---- effects ---- */
  for (const s of sparks.items) {
    if (!s.alive) { continue; }
    s.life -= dt;
    if (s.life <= 0) { s.alive = false; continue; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.vx *= 1 - 3 * dt; s.vy *= 1 - 3 * dt;
  }
  for (const u of popups.items) {
    if (!u.alive) { continue; }
    u.life -= dt; u.y -= 28 * dt;
    if (u.life <= 0) { u.alive = false; }
  }
  state.shake = Math.max(0, state.shake - dt * 30);
  state.flash = Math.max(0, state.flash - dt * 3);
  state.waveBanner = Math.max(0, state.waveBanner - dt);

  if (state.clock <= 0) { gameOver(); }
}

function spawnEnemy(kind, cfg) {
  const k = KINDS[kind];
  const at = edgePoint(view.width, view.height, state.player);
  enemies.spawn({
    kind, x: at.x, y: at.y, r: k.r, hp: k.hp, maxHp: k.hp,
    speed: k.speed * cfg.speed, warn: RULES.spawnWarn,
    mode: "walk", t: 1 + Math.random(), vx: 0, vy: 0
  });
}

function moveEnemy(e, p, dt) {
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;

  if (e.kind !== "dasher") {
    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
    return;
  }

  /* Dasher: walk, then STOP and aim a line at you (the warning),
     then charge along that line, then rest. */
  e.t -= dt;
  if (e.mode === "walk") {
    e.x += (dx / d) * e.speed * dt; e.y += (dy / d) * e.speed * dt;
    if (e.t <= 0 && d < 280) { e.mode = "aim"; e.t = 0.75; e.ax = dx / d; e.ay = dy / d; }
  } else if (e.mode === "aim") {
    if (e.t <= 0) { e.mode = "dash"; e.t = 0.42; }
  } else if (e.mode === "dash") {
    const sp = 430 * Math.min(1.4, e.speed / KINDS.dasher.speed);
    e.x += e.ax * sp * dt; e.y += e.ay * sp * dt;
    e.x = Math.min(view.width - e.r, Math.max(e.r, e.x));
    e.y = Math.min(view.height - e.r, Math.max(e.r, e.y));
    if (e.t <= 0) { e.mode = "rest"; e.t = 0.9; }
  } else if (e.t <= 0) {
    e.mode = "walk"; e.t = 1.2 + Math.random();
  }
}

/* Enemies push apart a little, so they don't stack into one blob. */
function separate() {
  const list = enemies.items;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive || a.warn > 0) { continue; }
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive || b.warn > 0) { continue; }
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
  }
}

function hurt(e) {
  const p = state.player;
  state.clock = hitClock(state.clock);
  state.hits += 1;
  p.invuln = RULES.invuln;
  /* Shove the enemy back so it can't hit again the moment safety ends. */
  const dx = e.x - p.x, dy = e.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  e.x += (dx / d) * 60; e.y += (dy / d) * 60;
  if (e.kind === "dasher") { e.mode = "rest"; e.t = 1; }
  popup(p.x, p.y - 24, `−${RULES.hitCost}s`, color("--hot"));
  burst(p.x, p.y, 14, color("--hot"), 200);
  if (!calm) { state.shake = 9; state.flash = 1; }
  pulseClock("is-hit");
}

function kill(e) {
  e.alive = false;
  state.kills += 1;
  state.clock = killClock(state.clock);
  burst(e.x, e.y, e.kind === "brute" ? 22 : 12, kindColor(e.kind), 190);
  popup(e.x, e.y - 14, `+${RULES.killBonus}s`, color("--green"));
  pulseClock("is-gain");
}

/* ---- little helpers ---- */
function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

function burst(x, y, n, col, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.65);
    const life = 0.3 + Math.random() * 0.35;
    sparks.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color: col, size: 1.5 + Math.random() * 2 });
  }
}

function popup(x, y, text, col) { popups.spawn({ x, y, text, color: col, life: 0.9 }); }

let clockPulse = 0;
function pulseClock(cls) {
  const box = $("clock-box");
  box.classList.remove("is-hit", "is-gain");
  box.classList.add(cls);
  clearTimeout(clockPulse);
  clockPulse = setTimeout(() => box.classList.remove(cls), 260);
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
function kindColor(kind) {
  return kind === "dasher" ? color("--amber") : kind === "brute" ? color("--accent") : color("--hot");
}

function draw() {
  const w = view.width, h = view.height;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = color("--bg-2");
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  if (state.shake > 0 && !calm) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }

  /* arena edge */
  ctx.strokeStyle = color("--line");
  ctx.lineWidth = 2;
  ctx.strokeRect(5, 5, w - 10, h - 10);

  drawEnemies();

  /* bullets */
  ctx.fillStyle = color("--cyan");
  for (const b of bullets.items) {
    if (!b.alive) { continue; }
    ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  drawPlayer();

  /* sparks */
  for (const s of sparks.items) {
    if (!s.alive) { continue; }
    ctx.globalAlpha = Math.max(0, s.life / s.max);
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
  }
  ctx.globalAlpha = 1;

  /* +1s / -3s */
  ctx.font = "800 16px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  for (const u of popups.items) {
    if (!u.alive) { continue; }
    ctx.globalAlpha = Math.min(1, u.life * 2);
    ctx.fillStyle = u.color;
    ctx.fillText(u.text, u.x, u.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawStick();

  /* wave banner */
  if (state.mode === "play" && state.waveBanner > 0) {
    ctx.globalAlpha = Math.min(1, state.waveBanner);
    ctx.fillStyle = color("--text");
    ctx.font = "700 22px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Wave ${state.wave}`, w / 2, h - 34);
    ctx.globalAlpha = 1;
  }

  /* hit flash: a red edge, never in reduced motion */
  if (state.flash > 0 && !calm) {
    ctx.strokeStyle = color("--hot");
    ctx.globalAlpha = state.flash * 0.6;
    ctx.lineWidth = 18;
    ctx.strokeRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  hud();
}

function drawEnemies() {
  for (const e of enemies.items) {
    if (!e.alive) { continue; }
    const col = kindColor(e.kind);

    /* Spawning: a ring closing in on the spot. Harmless. */
    if (e.warn > 0) {
      const k = e.warn / RULES.spawnWarn;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.35 + 0.5 * (1 - k);
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 26 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      continue;
    }

    /* Dasher aiming: the line it is about to charge along. */
    if (e.kind === "dasher" && e.mode === "aim") {
      const k = 1 - e.t / 0.75;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.25 + 0.5 * k;
      ctx.lineWidth = 2 + 4 * k;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.ax * 190, e.y + e.ay * 190); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = e.flash > 0 ? color("--text") : col;
    ctx.beginPath();
    if (e.kind === "chaser") {
      /* diamond */
      ctx.moveTo(e.x, e.y - e.r - 2); ctx.lineTo(e.x + e.r + 2, e.y);
      ctx.lineTo(e.x, e.y + e.r + 2); ctx.lineTo(e.x - e.r - 2, e.y);
    } else if (e.kind === "dasher") {
      /* triangle pointing where it's going */
      const a = e.mode === "walk" ? Math.atan2(state.player.y - e.y, state.player.x - e.x) : Math.atan2(e.ay, e.ax);
      for (let i = 0; i < 3; i++) {
        const t = a + (i * Math.PI * 2) / 3;
        const r = i === 0 ? e.r + 5 : e.r;
        ctx.lineTo(e.x + Math.cos(t) * r, e.y + Math.sin(t) * r);
      }
    } else {
      /* brute: hexagon */
      for (let i = 0; i < 6; i++) {
        const t = (i * Math.PI) / 3 + Math.PI / 6;
        ctx.lineTo(e.x + Math.cos(t) * e.r, e.y + Math.sin(t) * e.r);
      }
    }
    ctx.closePath();
    ctx.fill();

    /* brute health pips */
    if (e.kind === "brute") {
      ctx.fillStyle = color("--bg");
      ctx.font = "800 13px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(e.hp), e.x, e.y + 1);
      ctx.textBaseline = "alphabetic";
    }
  }
}

function drawPlayer() {
  const p = state.player;
  if (state.mode === "over") { return; }
  const hurtNow = p.invuln > 0;
  /* After a hit: blink (or, in reduced motion, just go see-through). */
  const fade = hurtNow ? (calm ? 0.45 : (Math.floor(p.invuln * 12) % 2 ? 0.25 : 0.85)) : 1;
  ctx.globalAlpha = fade;

  /* The player is a little clock. The amber arc is the time left
     (a full ring = 30 s), and the hand sweeps once a second. */
  ctx.fillStyle = color("--surface-2");
  ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color("--cyan");
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const frac = Math.min(1, state.clock / RULES.startTime);
  ctx.strokeStyle = state.clock < 8 ? color("--hot") : color("--amber");
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER_R + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  ctx.stroke();

  const hand = -Math.PI / 2 + (state.clock % 1) * Math.PI * 2;
  ctx.strokeStyle = color("--text");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(hand) * (PLAYER_R - 4), p.y + Math.sin(hand) * (PLAYER_R - 4));
  ctx.stroke();

  /* aim tick: shows where you're shooting */
  ctx.fillStyle = color("--cyan");
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(p.aim) * (PLAYER_R + 10), p.y + Math.sin(p.aim) * (PLAYER_R + 10), 2.5, 0, Math.PI * 2);
  ctx.fill();

  if (hurtNow) {
    ctx.strokeStyle = color("--hot");
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 10, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawStick() {
  if (!stick || state.mode !== "play") { return; }
  const v = stickVector(stick.ox, stick.oy, stick.x, stick.y, STICK_R, 0);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color("--line-bright");
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color("--accent-dim");
  ctx.fill();
  ctx.fillStyle = color("--accent");
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(stick.ox + v.x * STICK_R, stick.oy + v.y * STICK_R, 18, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

/* ---- the DOM HUD (only touched when the text changes) ---- */
const hudEls = { wave: $("wave"), clock: $("clock"), best: $("best"), box: $("clock-box") };
const shown = {};
function hud(force = false) {
  const vals = {
    wave: String(state.wave),
    clock: formatClock(state.clock),
    best: formatTime(state.best)
  };
  for (const k of Object.keys(vals)) {
    if (force || shown[k] !== vals[k]) { hudEls[k].textContent = vals[k]; shown[k] = vals[k]; }
  }
  const low = state.mode === "play" && state.clock < 8;
  if (shown.low !== low) { hudEls.box.classList.toggle("is-low", low); shown.low = low; }
}

/* ============================================================
   7. LOOP
   kit/loop.js gives a capped dt; the accumulator turns it into
   fixed 1/120 s steps, so the game plays the same at any frame rate.
   ============================================================ */
let acc = 0;
function update(dt) {
  acc += dt;
  while (acc >= STEP) { step(STEP); acc -= STEP; }
  /* Start / Retry with Space or Enter is handled by keys.on above. */
  keys.wasPressed("action");
}

pauseBtn.disabled = true;
hud(true);
const loop = startLoop({
  update,
  draw,
  onPauseChange(paused) {
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
    stick = null;
    if (state.mode === "play") { show(paused ? "pause" : null); }
    draw();
  }
});

/* Coming back to the tab mid-game: stay paused until the player
   says go. (kit/loop.js would resume by itself; this runs after it.) */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.mode === "play") { loop.pause(); }
});

stage.dataset.ready = "true";
