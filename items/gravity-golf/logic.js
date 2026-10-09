/* ============================================================
   Gravity Golf - pure rules (no DOM, unit tested)

   - the field: a fixed 420 x 560 box every level is drawn in
   - one physics step: inverse-square pull from planets and
     black holes, bounces off planets and asteroids, the hole
   - the shot: drag length -> speed
   - checking that a level's data makes sense

   Same inputs, same outputs: no Math.random, no clocks.
   ============================================================ */

export const FIELD = Object.freeze({ w: 420, h: 560 });

export const PHYS = Object.freeze({
  STEP: 1 / 120,
  G: 900,              // pull = G * r^2 / d^2, so a planet's surface pull is G
  HOLE_G: 1800,        // a black hole pulls like a planet of radius 30, harder
  HOLE_PULL_R: 30,
  DRAG: 0.45,          // space "friction": speed x e^(-DRAG * t)
  SLOW_DRAG: 1.6,      // extra friction below SLOW_SPEED, so slow balls settle
  SLOW_SPEED: 45,
  CUP_PULL: 260,       // a gentle tug toward the cup when close
  CUP_PULL_R: 34,
  BALL_R: 6,
  CUP_R: 11,
  CUP_MAX_SPEED: 320,  // faster than this and the ball skips over the hole
  MAX_SPEED: 430,      // a full-power shot
  STOP_SPEED: 9,
  REST_SPEED: 32,      // slower than this while touching a planet = it settles
  MAX_TIME: 12,        // a shot ends after this many seconds, wherever it is
  E_PLANET: 0.45,      // bounciness
  E_ROCK: 0.85,
  FRICTION: 0.85       // keeps this much sliding speed on a planet bounce
});

/* ---- shots ---- */

/* Pull back `power` (0..1) at `angle`: the ball goes the other way. */
export function shotVelocity(angle, power) {
  const p = Math.max(0, Math.min(1, power));
  const v = PHYS.MAX_SPEED * (0.06 + 0.94 * p);
  return { vx: Math.cos(angle) * v, vy: Math.sin(angle) * v };
}

/* A fresh ball at rest. */
export function makeBall(x, y) {
  return { x, y, vx: 0, vy: 0, t: 0, moving: false, rest: 0 };
}

export function launch(ball, angle, power) {
  const v = shotVelocity(angle, power);
  ball.vx = v.vx; ball.vy = v.vy;
  ball.t = 0; ball.moving = true; ball.rest = 0;
  return ball;
}

/* ---- gravity ---- */
export function pullAt(level, x, y) {
  let ax = 0, ay = 0;
  for (const p of level.planets) {
    const dx = p.x - x, dy = p.y - y;
    const d2 = Math.max(dx * dx + dy * dy, p.r * p.r);
    const d = Math.sqrt(d2);
    const a = (PHYS.G * p.r * p.r) / d2;
    ax += (a * dx) / d; ay += (a * dy) / d;
  }
  for (const b of level.holes || []) {
    const dx = b.x - x, dy = b.y - y;
    const d2 = Math.max(dx * dx + dy * dy, 36);
    const d = Math.sqrt(d2);
    const a = (PHYS.HOLE_G * PHYS.HOLE_PULL_R * PHYS.HOLE_PULL_R) / d2;
    ax += (a * dx) / d; ay += (a * dy) / d;
  }
  return { ax, ay };
}

/* Push the ball out of a circle and bounce. Returns true on contact. */
function bounce(ball, c, e, friction) {
  const dx = ball.x - c.x, dy = ball.y - c.y;
  const min = c.r + PHYS.BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) { return false; }
  const d = Math.sqrt(d2) || 1e-6;
  const nx = dx / d, ny = dy / d;
  ball.x = c.x + nx * min;
  ball.y = c.y + ny * min;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    const tx = ball.vx - vn * nx, ty = ball.vy - vn * ny;
    ball.vx = tx * friction - e * vn * nx;
    ball.vy = ty * friction - e * vn * ny;
  }
  return { hit: true, speed: Math.abs(vn), nx, ny };
}

/* ============================================================
   ONE STEP. Mutates ball. Returns what happened, or null:
     { type: "cup" }            in the hole
     { type: "swallowed", b }   a black hole got it
     { type: "out" }            left the field
     { type: "stop" }           came to rest
     { type: "bump", speed, x, y, rock }  bounced off something
   ============================================================ */
export function stepBall(ball, level, dt = PHYS.STEP) {
  if (!ball.moving) { return null; }
  ball.t += dt;

  let { ax, ay } = pullAt(level, ball.x, ball.y);
  const cx = level.cup.x - ball.x, cy = level.cup.y - ball.y;
  const cd = Math.hypot(cx, cy);
  if (cd < PHYS.CUP_PULL_R && cd > 0.01) { ax += (PHYS.CUP_PULL * cx) / cd; ay += (PHYS.CUP_PULL * cy) / cd; }
  ball.vx += ax * dt; ball.vy += ay * dt;
  const slow = Math.hypot(ball.vx, ball.vy) < PHYS.SLOW_SPEED ? PHYS.SLOW_DRAG : 0;
  const k = Math.exp(-(PHYS.DRAG + slow) * dt);
  ball.vx *= k; ball.vy *= k;
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  const speed = Math.hypot(ball.vx, ball.vy);

  /* the hole */
  const h = level.cup;
  if (Math.hypot(ball.x - h.x, ball.y - h.y) < PHYS.CUP_R && speed < PHYS.CUP_MAX_SPEED) {
    ball.moving = false;
    ball.x = h.x; ball.y = h.y; ball.vx = 0; ball.vy = 0;
    return { type: "cup" };
  }

  /* black holes */
  for (const b of level.holes || []) {
    if (Math.hypot(ball.x - b.x, ball.y - b.y) < b.r) {
      ball.moving = false;
      return { type: "swallowed", b };
    }
  }

  /* bounces */
  let event = null;
  let touching = false;
  for (const p of level.planets) {
    const hit = bounce(ball, p, PHYS.E_PLANET, PHYS.FRICTION);
    if (hit) {
      touching = true;
      if (hit.speed > 40) { event = { type: "bump", speed: hit.speed, x: ball.x - hit.nx * PHYS.BALL_R, y: ball.y - hit.ny * PHYS.BALL_R, rock: false }; }
    }
  }
  for (const r of level.rocks || []) {
    const hit = bounce(ball, r, PHYS.E_ROCK, 1);
    if (hit && hit.speed > 20) {
      event = { type: "bump", speed: hit.speed, x: ball.x - hit.nx * PHYS.BALL_R, y: ball.y - hit.ny * PHYS.BALL_R, rock: true };
    }
  }

  /* out of the field */
  const m = PHYS.BALL_R;
  if (ball.x < -m || ball.y < -m || ball.x > FIELD.w + m || ball.y > FIELD.h + m) {
    ball.moving = false;
    return { type: "out" };
  }

  /* coming to rest: slow on a planet, slow in open space, or out of time */
  const s2 = Math.hypot(ball.vx, ball.vy);
  ball.rest = touching && s2 < PHYS.REST_SPEED ? ball.rest + dt : (s2 < PHYS.STOP_SPEED ? ball.rest + dt : 0);
  if (ball.rest > 0.25 || ball.t > PHYS.MAX_TIME) {
    ball.moving = false;
    ball.vx = 0; ball.vy = 0;
    return { type: "stop" };
  }
  return event;
}

/* The path for the first `seconds` of a shot: the dotted preview.
   Uses the very same step, so the dots never lie. */
export function previewPath(level, x, y, angle, power, seconds = 0.6, every = 6) {
  const ball = launch(makeBall(x, y), angle, power);
  const out = [];
  const n = Math.round(seconds / PHYS.STEP);
  for (let i = 1; i <= n; i++) {
    const ev = stepBall(ball, level);
    if (i % every === 0) { out.push({ x: ball.x, y: ball.y }); }
    if (!ball.moving || (ev && ev.type === "bump")) { out.push({ x: ball.x, y: ball.y }); break; }
  }
  return out;
}

/* Fly a whole shot. Returns the last event and where the ball ended. */
export function simulateShot(level, x, y, angle, power) {
  const ball = launch(makeBall(x, y), angle, power);
  let ev = null;
  for (let i = 0; i < 4000 && ball.moving; i++) { ev = stepBall(ball, level) || ev; }
  return { result: ev && ev.type !== "bump" ? ev.type : "stop", x: ball.x, y: ball.y };
}

/* Golf words for a score against par. */
export function scoreName(strokes, par) {
  if (strokes === 1) { return "Hole in one!"; }
  const d = strokes - par;
  return { "-3": "Albatross!", "-2": "Eagle!", "-1": "Birdie!", 0: "Par", 1: "Bogey", 2: "Double bogey" }[d] ||
    (d < 0 ? "Amazing!" : `+${d}`);
}

/* ============================================================
   LEVEL CHECKS (used by the unit test)
   Returns a list of problems; empty = fine.
   ============================================================ */
export function checkLevel(lv) {
  const out = [];
  const inField = (o, r, what) => {
    if (!(o.x - r >= 0 && o.y - r >= 0 && o.x + r <= FIELD.w && o.y + r <= FIELD.h)) {
      out.push(`${what} is off screen`);
    }
  };
  if (typeof lv.name !== "string" || !lv.name) { out.push("needs a name"); }
  if (!Number.isInteger(lv.par) || lv.par < 1 || lv.par > 6) { out.push("par must be 1-6"); }
  inField(lv.ball, PHYS.BALL_R, "ball");
  inField(lv.cup, PHYS.CUP_R, "hole");

  const bodies = [
    { ...lv.ball, r: PHYS.BALL_R + 8, what: "ball" },
    { ...lv.cup, r: PHYS.CUP_R + 8, what: "hole" },
    ...lv.planets.map((p, i) => ({ ...p, what: `planet ${i + 1}` })),
    ...(lv.holes || []).map((b, i) => ({ ...b, r: b.r + 18, what: `black hole ${i + 1}` })),
    ...(lv.rocks || []).map((r, i) => ({ ...r, what: `asteroid ${i + 1}` }))
  ];
  for (const b of bodies.slice(2)) {
    if (!(b.r > 0)) { out.push(`${b.what} needs a radius`); }
    inField(b, b.what.startsWith("black") ? b.r - 18 : b.r, b.what);
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) { out.push(`${a.what} overlaps ${b.what}`); }
    }
  }
  return out;
}
