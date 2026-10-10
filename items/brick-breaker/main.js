/* ============================================================
   Brick Breaker+ - main script

   The classic, with real bounce angles, tough bricks and
   power-ups. Collisions, bounces and levels live in logic.js
   and levels.js (pure, unit tested).

   Sections:
     1. save       best score, games
     2. state      paddle, balls, bricks, pools
     3. screens    start / pause / game over
     4. input      drag, mouse, arrows; tap / Space launches
     5. rules      one fixed step
     6. draw       the 400 x 560 field, fitted into the stage
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
  FIELD, BALL_R, PADDLE_Y, PADDLE_H, moveBall, paddleBounce, parseLevel, generateLevel,
  brickPoints, pickPower, POWERS
} from "./logic.js";
import { LEVELS } from "./levels.js";

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
  defaults: { best: 0, games: 0 },
  validate: (d) =>
    (Number.isInteger(d.best) && d.best >= 0 && Number.isInteger(d.games) && d.games >= 0) ||
    "Best and games must be whole numbers."
});
mountSavePanel($("save-panel"), save);

/* ============================================================
   2. STATE
   ============================================================ */
const STEP = 1 / 120;
const PADDLE_W = 72, WIDE_W = 116;
const PADDLE_SPEED = 560;
const MAX_BALLS = 12;
const DROP_CHANCE = 0.15;
const CAPSULE = { w: 30, h: 14, fall: 120 };
const TIMED = { wide: 14, slow: 10, laser: 10 };
const LASER_EVERY = 0.4;

function pool(size, make) {
  const items = Array.from({ length: size }, () => ({ ...make(), alive: false }));
  return {
    items,
    spawn(init) {
      for (const it of items) { if (!it.alive) { return Object.assign(it, make(), init, { alive: true }); } }
      return null;
    },
    count() { return items.reduce((n, it) => n + (it.alive ? 1 : 0), 0); },
    clear() { for (const it of items) { it.alive = false; } }
  };
}
const balls = pool(MAX_BALLS, () => ({ x: 0, y: 0, vx: 0, vy: 0, stuck: false, offset: 0, squash: 0 }));
const caps = pool(6, () => ({ x: 0, y: 0, power: POWERS[0] }));
const lasers = pool(24, () => ({ x: 0, y: 0 }));
const bits = pool(240, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, col: "--text", size: 3 }));
const pops = pool(10, () => ({ x: 0, y: 0, life: 0, text: "", col: "--text" }));

const paddle = { x: FIELD.w / 2, w: PADDLE_W, squash: 0 };

const state = exposeForTests({
  mode: "start",                // "start" | "play" | "clear" | "over"
  score: 0,
  best: save.get().best,
  level: 1,
  lives: 3,
  launches: 0,
  speed: 300,
  timers: { wide: 0, slow: 0, laser: 0 },
  paddle,
  bricks: [],
  get balls() { return balls.items.filter((b) => b.alive); }
});
save.onChange((d) => { state.best = d.best; hud(); });

let bricks = [];
let clearT = 0;
let laserT = 0;
let shake = 0;
let calm = reducedMotion();     // true = no screen shake
onMotionChange((v) => { calm = v; });

const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;

function levelRows(n) {
  return n <= LEVELS.length ? LEVELS[n - 1].rows : generateLevel(n);
}
function levelName(n) {
  return n <= LEVELS.length ? LEVELS[n - 1].name : `Endless ${n - LEVELS.length}`;
}

function loadLevel(n) {
  state.level = n;
  bricks = parseLevel(levelRows(n)).map((b) => ({ ...b, hit: 0 }));
  state.bricks = bricks;
  state.speed = 290 + 10 * Math.min(n - 1, 12);
  resetServe();
  caps.clear(); lasers.clear();
  state.timers.wide = state.timers.slow = state.timers.laser = 0;
  hud();
}

/* A fresh ball sitting on the paddle, waiting for a launch. */
function resetServe() {
  balls.clear();
  balls.spawn({ stuck: true, offset: 10, x: paddle.x + 10, y: PADDLE_Y - BALL_R - 1 });
}

/* ============================================================
   3. SCREENS
   ============================================================ */
const screens = { start: $("start-screen"), pause: $("pause-screen"), over: $("over-screen") };

function show(name) {
  pauseBtn.disabled = !(state.mode === "play" || state.mode === "clear");
  for (const [k, el] of Object.entries(screens)) { el.hidden = k !== name; }
  const focusMe = { start: "start-btn", pause: "resume-btn", over: "retry-btn" }[name];
  if (focusMe && document.activeElement && document.activeElement !== document.body) {
    $(focusMe).focus({ preventScroll: true });
  }
}
for (const el of Object.values(screens)) {
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
}

function startGame() {
  state.score = 0;
  state.lives = 3;
  state.launches = 0;
  paddle.x = FIELD.w / 2;
  paddle.w = PADDLE_W;
  bits.clear(); pops.clear();
  loadLevel(1);
  state.mode = "play";
  acc = 0;
  show(null);
  if (loop.paused) { loop.resume(); }
  banner(`Level 1: ${levelName(1)}`);
}

function gameOver() {
  state.mode = "over";
  overT = 0;
  const old = save.get();
  const isBest = state.score > old.best;
  save.set({ best: Math.max(old.best, state.score), games: old.games + 1 });
  $("over-title").textContent = isBest ? "New best!" : "Game over";
  $("over-score").textContent = String(state.score);
  $("over-level").textContent = String(state.level);
  $("over-best").textContent = String(save.get().best);
  show("over");
  hud();
}

$("start-btn").addEventListener("click", startGame);
$("retry-btn").addEventListener("click", startGame);
$("resume-btn").addEventListener("click", () => loop.resume());

/* ============================================================
   4. INPUT
   Touch: drag anywhere, the paddle moves by as much as your
   finger (so your thumb never hides it). Mouse: the paddle
   follows the pointer. A tap (or click) launches.
   ============================================================ */
const keys = createKeys();
let drag = null;               // { id, startX, paddleX, moved } - id: the owning pointer
let overT = 0;

function launch() {
  if (state.mode !== "play" || loop.paused) { return; }
  let any = false;
  for (const b of balls.items) {
    if (!b.alive || !b.stuck) { continue; }
    const v = paddleBounce(b.offset / (paddle.w / 2) * 0.6 + 0.12, currentSpeed());
    b.vx = v.vx; b.vy = v.vy; b.stuck = false; b.squash = 1;
    any = true;
  }
  if (any) { state.launches += 1; }
}

pointer(stage, {
  down(p) {
    if (drag) { return; }      // a second finger can't take over the paddle
    const f = toField(p.x, p.y);
    drag = { id: p.id, startX: f.x, paddleX: paddle.x, moved: 0 };
    if (p.type === "mouse") { movePaddleTo(f.x); }
  },
  move(p, isDown) {
    const f = toField(p.x, p.y);
    const owns = isDown && drag && p.id === drag.id;
    if (p.type === "mouse") { if (state.mode === "play" && !loop.paused) { movePaddleTo(f.x); } }
    else if (owns) { movePaddleTo(drag.paddleX + (f.x - drag.startX) * 1.15); }
    if (owns) { drag.moved = Math.max(drag.moved, Math.abs(f.x - drag.startX)); }
  },
  up(p) {
    if (!drag || p.id !== drag.id) { return; }
    if (!p.cancelled && drag.moved < 10) { launch(); }
    drag = null;
  }
});

function movePaddleTo(x) {
  if (state.mode !== "play" || loop.paused) { return; }
  paddle.x = Math.max(paddle.w / 2, Math.min(FIELD.w - paddle.w / 2, x));
}

keys.on("action", () => {
  if (state.mode === "start" || (state.mode === "over" && overT > 0.4)) { startGame(); return; }
  if ((state.mode === "play" || state.mode === "clear") && loop.paused) { loop.resume(); return; }
  launch();
});
keys.on("pause", () => { if (state.mode === "play" || state.mode === "clear") { loop.toggle(); } });
pauseBtn.addEventListener("click", () => { if (state.mode === "play" || state.mode === "clear") { loop.toggle(); } });

/* ============================================================
   5. RULES - one fixed step
   ============================================================ */
function currentSpeed() { return state.speed * (state.timers.slow > 0 ? 0.65 : 1); }

function step(dt) {
  if (state.mode === "over") { overT += dt; }
  if (state.mode === "clear") {
    clearT -= dt;
    if (clearT <= 0) {
      state.mode = "play";
      loadLevel(state.level + 1);
      banner(`Level ${state.level}: ${levelName(state.level)}`);
    }
  }
  if (state.mode === "play") { play(dt); }
  effects(dt);
}

function play(dt) {
  /* paddle: keys */
  const dir = (keys.isDown("right") ? 1 : 0) - (keys.isDown("left") ? 1 : 0);
  if (dir) { movePaddleTo(paddle.x + dir * PADDLE_SPEED * dt); }

  /* timed power-ups */
  for (const k of Object.keys(state.timers)) { state.timers[k] = Math.max(0, state.timers[k] - dt); }
  const wantW = state.timers.wide > 0 ? WIDE_W : PADDLE_W;
  paddle.w += (wantW - paddle.w) * Math.min(1, dt * 10);
  paddle.x = Math.max(paddle.w / 2, Math.min(FIELD.w - paddle.w / 2, paddle.x));

  /* balls */
  const speed = currentSpeed();
  for (const b of balls.items) {
    if (!b.alive) { continue; }
    if (b.stuck) {
      b.offset = Math.max(-paddle.w / 2 + 6, Math.min(paddle.w / 2 - 6, b.offset));
      b.x = paddle.x + b.offset; b.y = PADDLE_Y - BALL_R - 1;
      continue;
    }
    /* keep the speed exact (slow-ball and speed-ups change it smoothly) */
    const s = Math.hypot(b.vx, b.vy) || 1;
    const k = 1 + (speed / s - 1) * Math.min(1, dt * 6);
    b.vx *= k; b.vy *= k;

    const hits = moveBall(b, dt, bricks, paddle);
    for (const h of hits) { onHit(b, h); }
    if (b.y > FIELD.h + BALL_R * 3) { b.alive = false; }
  }

  /* lasers: fire by themselves while a ball is in play */
  if (state.timers.laser > 0 && balls.items.some((b) => b.alive && !b.stuck)) {
    laserT -= dt;
    if (laserT <= 0) {
      laserT = LASER_EVERY;
      const top = PADDLE_Y - 4;
      lasers.spawn({ x: paddle.x - paddle.w / 2 + 7, y: top });
      lasers.spawn({ x: paddle.x + paddle.w / 2 - 7, y: top });
    }
  }
  for (const l of lasers.items) {
    if (!l.alive) { continue; }
    const y0 = l.y;
    l.y -= 720 * dt;
    /* swept: any brick between the old and new y at this x */
    let hitB = null;
    for (const br of bricks) {
      if (br.hp <= 0 || l.x < br.x || l.x > br.x + br.w) { continue; }
      if (br.y + br.h >= l.y && br.y <= y0 && (!hitB || br.y > hitB.y)) { hitB = br; }
    }
    if (hitB) { l.alive = false; damage(hitB, l.x, hitB.y + hitB.h); }
    else if (l.y < -20) { l.alive = false; }
  }

  /* falling power-ups */
  const padRect = { x: paddle.x - paddle.w / 2, y: PADDLE_Y, w: paddle.w, h: PADDLE_H };
  for (const c of caps.items) {
    if (!c.alive) { continue; }
    c.y += CAPSULE.fall * dt;
    const r = { x: c.x - CAPSULE.w / 2, y: c.y - CAPSULE.h / 2, w: CAPSULE.w, h: CAPSULE.h };
    if (r.x < padRect.x + padRect.w && r.x + r.w > padRect.x && r.y < padRect.y + padRect.h && r.y + r.h > padRect.y) {
      c.alive = false;
      power(c.power, c.x, c.y);
    } else if (c.y > FIELD.h + 20) { c.alive = false; }
  }

  /* lost every ball? */
  if (!balls.items.some((b) => b.alive)) { loseLife(); return; }

  /* cleared the level? */
  if (!bricks.some((b) => b.hp > 0)) {
    state.mode = "clear";
    clearT = 1.4;
    for (const b of balls.items) { b.alive = false; }
    caps.clear(); lasers.clear();
    banner(`Level ${state.level} clear!`);
    burst(FIELD.w / 2, FIELD.h / 2, 40, ["--cyan", "--amber", "--hot", "--green"], 260);
  }
}

function onHit(b, h) {
  b.squash = 1;
  if (h.kind === "paddle") {
    paddle.squash = 1;
    burst(h.x, PADDLE_Y, 4, ["--text-dim"], 70);
  } else if (h.kind === "brick") {
    damage(h.brick, h.x - h.nx * BALL_R, h.y - h.ny * BALL_R);
  }
}

function damage(br, x, y) {
  br.hp -= 1;
  br.hit = 1;
  const destroyed = br.hp <= 0;
  const pts = brickPoints(br, destroyed);
  state.score += pts;
  state.speed = Math.min(520, state.speed + 2);
  if (destroyed) {
    const col = HP_COLS[br.maxHp - 1];
    burst(br.x + br.w / 2, br.y + br.h / 2, 12 + 4 * br.maxHp, [col], 160);
    pops.spawn({ x: br.x + br.w / 2, y: br.y, life: 0.6, text: `+${pts}`, col });
    if (Math.random() < DROP_CHANCE && caps.count() < 3) {
      caps.spawn({ x: br.x + br.w / 2, y: br.y + br.h / 2, power: pickPower(Math.random()) });
    }
  } else {
    burst(x, y, 4, [HP_COLS[br.hp - 1]], 90);
  }
  popScore();
  hud();
}

function power(p, x, y) {
  state.score += 25;
  pops.spawn({ x, y: y - 10, life: 0.9, text: p.name, col: "--text" });
  burst(x, y, 14, ["--text", "--accent"], 140);
  if (p.id === "multi") {
    /* still waiting on the paddle? launch it, so multi-ball isn't wasted */
    if (balls.items.every((b) => !b.alive || b.stuck)) { launch(); }
    const live = balls.items.filter((b) => b.alive && !b.stuck);
    for (const b of live) {
      for (const turn of [-0.45, 0.45]) {
        if (balls.count() >= MAX_BALLS) { break; }
        const c = Math.cos(turn), s = Math.sin(turn);
        balls.spawn({ x: b.x, y: b.y, vx: b.vx * c - b.vy * s, vy: b.vx * s + b.vy * c, stuck: false });
      }
    }
  } else if (p.id === "life") {
    state.lives = Math.min(6, state.lives + 1);
  } else {
    state.timers[p.id] = TIMED[p.id];
  }
  hud();
}

function loseLife() {
  state.lives -= 1;
  if (!calm) { shake = 1; }
  burst(paddle.x, PADDLE_Y, 20, ["--hot"], 200);
  state.timers.wide = state.timers.slow = state.timers.laser = 0;
  caps.clear(); lasers.clear();
  hud();
  if (state.lives <= 0) { gameOver(); return; }
  resetServe();
  banner(state.lives === 1 ? "Last ball!" : `${state.lives} balls left`);
}

function burst(x, y, n, cols, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    const life = 0.3 + Math.random() * 0.4;
    bits.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life,
      col: cols[i % cols.length], size: 2 + Math.random() * 2.5 });
  }
}

let bannerText = "", bannerT = 0;
function banner(text) { bannerText = text; bannerT = 1.4; }

function effects(dt) {
  for (const b of bits.items) {
    if (!b.alive) { continue; }
    b.life -= dt;
    if (b.life <= 0) { b.alive = false; continue; }
    b.vy += 300 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
  }
  for (const p of pops.items) {
    if (!p.alive) { continue; }
    p.life -= dt; p.y -= 30 * dt;
    if (p.life <= 0) { p.alive = false; }
  }
  for (const br of bricks) { br.hit = Math.max(0, br.hit - dt * 6); }
  for (const b of balls.items) { b.squash = Math.max(0, b.squash - dt * 7); }
  paddle.squash = Math.max(0, paddle.squash - dt * 6);
  shake = Math.max(0, shake - dt * 3);
  bannerT = Math.max(0, bannerT - dt);
}

let popTimer = 0;
function popScore() {
  const box = $("score-box");
  box.classList.add("is-pop");
  clearTimeout(popTimer);
  popTimer = setTimeout(() => box.classList.remove("is-pop"), 200);
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
const HP_COLS = ["--cyan", "--amber", "--hot"];
const POWER_COLS = { multi: "--cyan", wide: "--green", slow: "--amber", laser: "--hot", life: "--text" };

function fit() {
  const pad = 6, top = 46;
  const sc = Math.min((view.width - pad * 2) / FIELD.w, (view.height - top - pad) / FIELD.h);
  return { sc, ox: (view.width - FIELD.w * sc) / 2, oy: top + (view.height - top - pad - FIELD.h * sc) / 2 };
}
function toField(x, y) {
  const f = fit();
  return { x: (x - f.ox) / f.sc, y: (y - f.oy) / f.sc };
}

function draw() {
  const w = view.width, h = view.height;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = color("--bg");
  ctx.fillRect(0, 0, w, h);

  const f = fit();
  let ox = f.ox, oy = f.oy;
  if (shake > 0 && !calm) { ox += (Math.random() - 0.5) * 8 * shake; oy += (Math.random() - 0.5) * 8 * shake; }
  ctx.setTransform(view.dpr * f.sc, 0, 0, view.dpr * f.sc, view.dpr * ox, view.dpr * oy);
  const px = 1 / f.sc;

  /* the field: walls on three sides, open at the bottom */
  ctx.fillStyle = color("--bg-2");
  ctx.fillRect(0, 0, FIELD.w, FIELD.h);
  ctx.strokeStyle = color("--line-bright");
  ctx.lineWidth = 2 * px;
  ctx.beginPath();
  ctx.moveTo(0, FIELD.h); ctx.lineTo(0, 0); ctx.lineTo(FIELD.w, 0); ctx.lineTo(FIELD.w, FIELD.h);
  ctx.stroke();

  /* bricks */
  for (const br of bricks) {
    if (br.hp <= 0) { continue; }
    const s = 1 - 0.12 * br.hit;
    const bw = (br.w - 3) * s, bh = (br.h - 3) * s;
    const x = br.x + (br.w - bw) / 2, y = br.y + (br.h - bh) / 2;
    ctx.fillStyle = color(HP_COLS[br.hp - 1]);
    ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 3); ctx.fill();
    /* a darker lower lip so they read as blocks */
    ctx.fillStyle = color("--bg");
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x, y + bh * 0.62, bw, bh * 0.38);
    ctx.globalAlpha = 1;
    /* cracks once damaged */
    if (br.hp < br.maxHp) {
      ctx.strokeStyle = color("--bg");
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      ctx.moveTo(x + bw * 0.3, y); ctx.lineTo(x + bw * 0.42, y + bh * 0.5); ctx.lineTo(x + bw * 0.34, y + bh);
      if (br.maxHp - br.hp > 1) { ctx.moveTo(x + bw * 0.7, y); ctx.lineTo(x + bw * 0.6, y + bh * 0.55); ctx.lineTo(x + bw * 0.72, y + bh); }
      ctx.stroke();
    }
  }

  /* power-up capsules */
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 11px 'Space Grotesk', sans-serif`;
  for (const c of caps.items) {
    if (!c.alive) { continue; }
    ctx.fillStyle = color(POWER_COLS[c.power.id]);
    ctx.beginPath(); ctx.roundRect(c.x - CAPSULE.w / 2, c.y - CAPSULE.h / 2, CAPSULE.w, CAPSULE.h, CAPSULE.h / 2); ctx.fill();
    ctx.fillStyle = color("--bg");
    ctx.fillText(c.power.label, c.x, c.y + 0.5);
  }

  /* lasers */
  ctx.fillStyle = color("--hot");
  for (const l of lasers.items) { if (l.alive) { ctx.fillRect(l.x - 1.5, l.y, 3, 12); } }

  /* paddle */
  const sq = paddle.squash * 0.25;
  const pw = paddle.w * (1 + sq * 0.3), ph = PADDLE_H * (1 - sq);
  const pxl = paddle.x - pw / 2, pyt = PADDLE_Y + (PADDLE_H - ph);
  ctx.fillStyle = color("--text");
  ctx.beginPath(); ctx.roundRect(pxl, pyt, pw, ph, ph / 2); ctx.fill();
  ctx.fillStyle = color("--accent");
  ctx.fillRect(paddle.x - 2, pyt + 2, 4, ph - 4);            // the middle mark: straight up
  if (state.timers.laser > 0) {
    ctx.fillStyle = color("--hot");
    ctx.fillRect(pxl + 4, pyt - 5, 6, 6);
    ctx.fillRect(pxl + pw - 10, pyt - 5, 6, 6);
  }

  /* balls: squash on every bounce */
  for (const b of balls.items) {
    if (!b.alive) { continue; }
    const k = b.squash * 0.3;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.scale(1 - k, 1 + k * 0.6);
    ctx.fillStyle = color("--text");
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* aim hint while the ball waits on the paddle */
  if (state.mode === "play") {
    const stuck = balls.items.find((b) => b.alive && b.stuck);
    if (stuck) {
      const v = paddleBounce(stuck.offset / (paddle.w / 2) * 0.6 + 0.12, 1);
      ctx.strokeStyle = color("--text-dim");
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(stuck.x, stuck.y); ctx.lineTo(stuck.x + v.vx * 60, stuck.y + v.vy * 60); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* bits and pops */
  for (const b of bits.items) {
    if (!b.alive) { continue; }
    ctx.globalAlpha = Math.max(0, b.life / b.max);
    ctx.fillStyle = color(b.col);
    ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
  }
  ctx.font = `800 13px 'Space Grotesk', sans-serif`;
  for (const p of pops.items) {
    if (!p.alive) { continue; }
    ctx.globalAlpha = Math.min(1, p.life / 0.3);
    ctx.fillStyle = color(p.col);
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  /* active power-up timers, bottom-left */
  ctx.textAlign = "left";
  ctx.font = `600 11px 'JetBrains Mono', monospace`;
  let tx = 8;
  for (const [k, t] of Object.entries(state.timers)) {
    if (t <= 0) { continue; }
    const label = `${k.toUpperCase()} ${Math.ceil(t)}`;
    const tw = ctx.measureText(label).width + 12;
    ctx.fillStyle = color(POWER_COLS[k]);
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.roundRect(tx, FIELD.h - 22, tw, 16, 8); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillText(label, tx + 6, FIELD.h - 13.5);
    tx += tw + 6;
  }

  /* banner: "Level 2", "Last ball!" */
  if (bannerT > 0 && (state.mode === "play" || state.mode === "clear")) {
    ctx.globalAlpha = Math.min(1, bannerT / 0.3);
    ctx.textAlign = "center";
    ctx.font = `800 22px 'Space Grotesk', sans-serif`;
    ctx.fillStyle = color("--text");
    ctx.fillText(bannerText, FIELD.w / 2, FIELD.h * 0.62);
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = "alphabetic";
}

/* ---- HUD ---- */
function hud() {
  $("score").textContent = String(state.score);
  $("level").textContent = String(state.level);
  $("lives").textContent = String(Math.max(0, state.lives));
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

loadLevel(1);
pauseBtn.disabled = true;
const loop = startLoop({
  update,
  draw,
  onPauseChange(paused) {
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
    if (state.mode === "play" || state.mode === "clear") { show(paused ? "pause" : null); }
    drag = null;
    draw();
  }
});

/* Back to the tab mid-game: stay paused until the player says go. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && (state.mode === "play" || state.mode === "clear")) { loop.pause(); }
});

stage.dataset.ready = "true";
