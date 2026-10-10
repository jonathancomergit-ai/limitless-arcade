/* ============================================================
   Stack Tower - 2D rigid body physics (plain JS, no libraries)

   Boxes only, which is all a tower needs. The method is the
   classic "sequential impulses" solver (as in Box2D Lite):

     1. find touching boxes      SAT test + edge clipping, so a
                                 box resting on a face gets two
                                 contact points (and can tip)
     2. gravity                  v += g dt
     3. solve contacts           a few passes of push-apart and
                                 friction impulses; last step's
                                 impulses are reused (warm start)
                                 so stacks settle fast
     4. move                     x += v dt

   Stability tricks (so towers don't jitter or explode):
   - Speculative contacts: a box about to land is caught exactly
     on the surface, instead of sinking in and being pushed out.
   - Split impulses: any overlap is fixed with a separate "bias"
     velocity that moves boxes but is thrown away after the
     step, so fixing overlap never adds real speed.
   - Shock pass: after solving, one bottom-up pass stops each
     box sinking into the one below it, so a stack acts rigid
     instead of squashing like a spring when a block lands.
   - Calm warm start: after a hit, only the "holding weight"
     part of last step's push is reused, so towers don't bounce.
   - No bounce (restitution 0).
   - Sleeping: a group of touching boxes that has been still
     for half a second stops being simulated until something
     hits it.

   Units: metres, kilograms, seconds, radians. y points UP.
   Pure: no DOM. Unit tested in tests/unit/stack-tower.test.js.
   ============================================================ */

export const SETTINGS = Object.freeze({
  iterations: 12,          // solver passes per step
  slop: 0.005,             // overlap allowed before it's pushed out (m)
  beta: 0.2,               // fraction of the overlap fixed per step
  sleepLinear: 0.06,       // m/s: slower than this counts as still
  sleepAngular: 0.08,      // rad/s
  sleepTime: 0.5,          // seconds still before a group sleeps
  maxBiasSpeed: 2,         // m/s cap on the overlap push
  warmSpeed: 0.5           // m/s: closing faster than this = a hit, not resting
});

/* ============================================================
   BODIES
   ============================================================ */
let nextId = 1;

export function createBox({
  x = 0, y = 0, w = 1, h = 1, angle = 0,
  density = 1, friction = 0.6, isStatic = false
} = {}) {
  const mass = isStatic ? 0 : density * w * h;
  const inertia = isStatic ? 0 : mass * (w * w + h * h) / 12;
  return {
    id: nextId++,
    x, y, angle,
    vx: 0, vy: 0, av: 0,               // velocity, angular velocity
    bvx: 0, bvy: 0, bav: 0,            // split-impulse bias velocity (per step)
    w, h, hw: w / 2, hh: h / 2,
    mass, inertia,
    invMass: isStatic ? 0 : 1 / mass,
    invI: isStatic ? 0 : 1 / inertia,
    friction,
    isStatic,
    sleeping: false,
    sleepT: 0
  };
}

/* The 4 corners, in world space (for drawing and tests). */
export function corners(b) {
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const lx = sx * b.hw, ly = sy * b.hh;
    return { x: b.x + c * lx - s * ly, y: b.y + s * lx + c * ly };
  });
}

/* Highest / lowest point of a (maybe tilted) box. */
export function extentY(b) {
  return Math.abs(b.hw * Math.sin(b.angle)) + Math.abs(b.hh * Math.cos(b.angle));
}
export function extentX(b) {
  return Math.abs(b.hw * Math.cos(b.angle)) + Math.abs(b.hh * Math.sin(b.angle));
}
export const topOf = (b) => b.y + extentY(b);
export const bottomOf = (b) => b.y - extentY(b);

/* Kinetic + potential energy of every moving box (g > 0, y up). */
export function energy(bodies, g) {
  let e = 0;
  for (const b of bodies) {
    if (b.isStatic) { continue; }
    e += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.inertia * b.av * b.av + b.mass * g * b.y;
  }
  return e;
}

/* ============================================================
   COLLISION: box vs box
   Returns 0-2 contacts. The normal points from A to B.
   margin > 0 also returns "speculative" contacts that are not
   touching yet but are closer than margin: the solver lets the
   boxes close that gap this step and no more, so a falling box
   lands exactly on top instead of sinking in first.
   Each contact has a feature key (which edges made it) so the
   next step can find "the same" contact and warm start it.
   ============================================================ */
const NO_EDGE = 0, EDGE1 = 1, EDGE2 = 2, EDGE3 = 3, EDGE4 = 4;
const FACE_A_X = 0, FACE_A_Y = 1, FACE_B_X = 2, FACE_B_Y = 3;

function vert(x, y, i1, o1, i2, o2) { return { x, y, i1, o1, i2, o2 }; }

/* The edge of box (h, pos, rot) that faces most against normal. */
function incidentEdge(hx, hy, px, py, c, s, nx, ny) {
  /* the normal in the box's own frame, flipped */
  const lx = -(c * nx + s * ny), ly = -(-s * nx + c * ny);
  let v0, v1;
  if (Math.abs(lx) > Math.abs(ly)) {
    if (lx > 0) { v0 = vert(hx, -hy, NO_EDGE, NO_EDGE, EDGE3, EDGE4); v1 = vert(hx, hy, NO_EDGE, NO_EDGE, EDGE4, EDGE1); }
    else        { v0 = vert(-hx, hy, NO_EDGE, NO_EDGE, EDGE1, EDGE2); v1 = vert(-hx, -hy, NO_EDGE, NO_EDGE, EDGE2, EDGE3); }
  } else if (ly > 0) {
    v0 = vert(hx, hy, NO_EDGE, NO_EDGE, EDGE4, EDGE1); v1 = vert(-hx, hy, NO_EDGE, NO_EDGE, EDGE1, EDGE2);
  } else {
    v0 = vert(-hx, -hy, NO_EDGE, NO_EDGE, EDGE2, EDGE3); v1 = vert(hx, -hy, NO_EDGE, NO_EDGE, EDGE3, EDGE4);
  }
  for (const v of [v0, v1]) {
    const x = v.x, y = v.y;
    v.x = px + c * x - s * y;
    v.y = py + s * x + c * y;
  }
  return [v0, v1];
}

/* Keep the part of segment vin on the inside of a line. */
function clip(vin, nx, ny, offset, edge) {
  const out = [];
  const d0 = nx * vin[0].x + ny * vin[0].y - offset;
  const d1 = nx * vin[1].x + ny * vin[1].y - offset;
  if (d0 <= 0) { out.push({ ...vin[0] }); }
  if (d1 <= 0) { out.push({ ...vin[1] }); }
  if (d0 * d1 < 0) {
    const t = d0 / (d0 - d1);
    const p = {
      ...(d0 > 0 ? vin[0] : vin[1]),
      x: vin[0].x + t * (vin[1].x - vin[0].x),
      y: vin[0].y + t * (vin[1].y - vin[0].y)
    };
    if (d0 > 0) { p.i1 = edge; p.i2 = NO_EDGE; } else { p.o1 = edge; p.o2 = NO_EDGE; }
    out.push(p);
  }
  return out;
}

export function collide(A, B, margin = 0) {
  const hAx = A.hw, hAy = A.hh, hBx = B.hw, hBy = B.hh;
  const cA = Math.cos(A.angle), sA = Math.sin(A.angle);
  const cB = Math.cos(B.angle), sB = Math.sin(B.angle);
  const dpx = B.x - A.x, dpy = B.y - A.y;
  const dAx = cA * dpx + sA * dpy, dAy = -sA * dpx + cA * dpy;   // in A's frame
  const dBx = cB * dpx + sB * dpy, dBy = -sB * dpx + cB * dpy;   // in B's frame

  /* C = RotA^T * RotB, and |C| */
  const a11 = Math.abs(cA * cB + sA * sB), a21 = Math.abs(-sA * cB + cA * sB);
  const a12 = Math.abs(-cA * sB + sA * cB), a22 = Math.abs(sA * sB + cA * cB);

  /* separation along each of the 4 face normals */
  const fAx = Math.abs(dAx) - hAx - (a11 * hBx + a12 * hBy);
  const fAy = Math.abs(dAy) - hAy - (a21 * hBx + a22 * hBy);
  if (fAx > margin || fAy > margin) { return []; }
  const fBx = Math.abs(dBx) - (a11 * hAx + a21 * hAy) - hBx;
  const fBy = Math.abs(dBy) - (a12 * hAx + a22 * hAy) - hBy;
  if (fBx > margin || fBy > margin) { return []; }

  /* pick the axis of least overlap, preferring A's faces (no flip-flop) */
  const relTol = 0.95, absTol = 0.01;
  let axis = FACE_A_X, sep = fAx;
  let nx = dAx > 0 ? cA : -cA, ny = dAx > 0 ? sA : -sA;
  if (fAy > relTol * sep + absTol * hAy) {
    axis = FACE_A_Y; sep = fAy;
    nx = dAy > 0 ? -sA : sA; ny = dAy > 0 ? cA : -cA;
  }
  if (fBx > relTol * sep + absTol * hBx) {
    axis = FACE_B_X; sep = fBx;
    nx = dBx > 0 ? cB : -cB; ny = dBx > 0 ? sB : -sB;
  }
  if (fBy > relTol * sep + absTol * hBy) {
    axis = FACE_B_Y; sep = fBy;
    nx = dBy > 0 ? -sB : sB; ny = dBy > 0 ? cB : -cB;
  }

  /* reference face (front) and its two side planes */
  let fnx, fny, front, snx, sny, negSide, posSide, negEdge, posEdge, edge;
  if (axis === FACE_A_X || axis === FACE_A_Y) {
    fnx = nx; fny = ny;
    if (axis === FACE_A_X) {
      front = A.x * fnx + A.y * fny + hAx;
      snx = -sA; sny = cA;
      const side = A.x * snx + A.y * sny;
      negSide = -side + hAy; posSide = side + hAy; negEdge = EDGE3; posEdge = EDGE1;
    } else {
      front = A.x * fnx + A.y * fny + hAy;
      snx = cA; sny = sA;
      const side = A.x * snx + A.y * sny;
      negSide = -side + hAx; posSide = side + hAx; negEdge = EDGE2; posEdge = EDGE4;
    }
    edge = incidentEdge(hBx, hBy, B.x, B.y, cB, sB, fnx, fny);
  } else {
    fnx = -nx; fny = -ny;
    if (axis === FACE_B_X) {
      front = B.x * fnx + B.y * fny + hBx;
      snx = -sB; sny = cB;
      const side = B.x * snx + B.y * sny;
      negSide = -side + hBy; posSide = side + hBy; negEdge = EDGE3; posEdge = EDGE1;
    } else {
      front = B.x * fnx + B.y * fny + hBy;
      snx = cB; sny = sB;
      const side = B.x * snx + B.y * sny;
      negSide = -side + hBx; posSide = side + hBx; negEdge = EDGE2; posEdge = EDGE4;
    }
    edge = incidentEdge(hAx, hAy, A.x, A.y, cA, sA, fnx, fny);
  }

  let pts = clip(edge, -snx, -sny, negSide, negEdge);
  if (pts.length < 2) { return []; }
  pts = clip(pts, snx, sny, posSide, posEdge);
  if (pts.length < 2) { return []; }

  const flip = axis === FACE_B_X || axis === FACE_B_Y;
  const out = [];
  for (const p of pts) {
    const s = fnx * p.x + fny * p.y - front;
    if (s > margin) { continue; }
    const f = flip ? [p.i2, p.o2, p.i1, p.o1] : [p.i1, p.o1, p.i2, p.o2];
    out.push({
      x: p.x - s * fnx, y: p.y - s * fny,      // moved onto the reference face
      nx, ny, sep: s,
      key: f[0] | (f[1] << 3) | (f[2] << 6) | (f[3] << 9),
      Pn: 0, Pt: 0, Pb: 0, Ps: 0
    });
  }
  return out;
}

/* ============================================================
   WORLD
   ============================================================ */
export function createWorld({ gravity = 9.81, iterations = SETTINGS.iterations, sleep = true } = {}) {
  const bodies = [];
  const arbiters = new Map();     // "idA:idB" -> { a, b, contacts, friction, touched }
  let stepNo = 0;
  let lastHit = false;            // did anything hit something last step?

  const inert = (b) => b.isStatic || b.sleeping;
  const pairKey = (a, b) => (a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`);

  function wake(b) {
    if (b.isStatic) { return; }
    b.sleeping = false;
    b.sleepT = 0;
  }

  function overlapAABB(a, b, m) {
    return Math.abs(a.x - b.x) <= extentX(a) + extentX(b) + m &&
           Math.abs(a.y - b.y) <= extentY(a) + extentY(b) + m;
  }

  /* How far two boxes could close in one step, plus a little. */
  function marginFor(a, b, dt) {
    const reach = (o) => o.isStatic ? 0 :
      Math.hypot(o.vx, o.vy) + Math.abs(o.av) * Math.hypot(o.hw, o.hh);
    return (reach(a) + reach(b) + Math.abs(gravity) * dt) * dt + SETTINGS.slop;
  }

  /* Collide a pair; keep warm-start impulses for matching contacts. */
  function touch(a, b, dt) {
    if (a.isStatic && b.isStatic) { return 0; }
    const m = marginFor(a, b, dt);
    if (!overlapAABB(a, b, m)) { return 0; }
    const [A, B] = a.id < b.id ? [a, b] : [b, a];
    const contacts = collide(A, B, m);
    if (!contacts.length) { return 0; }
    const key = pairKey(A, B);
    const old = arbiters.get(key);
    if (old) {
      for (const c of contacts) {
        const prev = old.contacts.find((o) => o.key === c.key);
        /* Warm start: reuse last step's push, so stacks hold their
           weight from the first pass. Right after a hit, reuse only
           the calm "holding weight" part (Ps): re-applying the
           impact push would bounce the tower and add energy. */
        if (prev) {
          c.Ps = prev.Ps;
          c.Pn = lastHit ? Math.min(prev.Pn, prev.Ps) : prev.Pn;
          c.Pt = prev.Pn > 0 ? prev.Pt * (c.Pn / prev.Pn) : 0;
        }
      }
    }
    arbiters.set(key, { a: A, b: B, contacts, friction: Math.sqrt(A.friction * B.friction), touched: stepNo });
    return contacts.length;
  }

  function broadphase(dt) {
    /* 1. every pair where something is awake */
    const toWake = [];
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (inert(a) && inert(b)) { continue; }
        if (touch(a, b, dt)) {
          if (a.sleeping) { toWake.push(a); }
          if (b.sleeping) { toWake.push(b); }
        }
      }
    }
    /* 2. anything an awake box touches wakes up, and so on */
    while (toWake.length) {
      const b = toWake.pop();
      if (!b.sleeping) { continue; }
      wake(b);
      for (const o of bodies) {
        if (o === b || !inert(o)) { continue; }       // awake pairs were done in pass 1
        if (touch(b, o, dt) && o.sleeping) { toWake.push(o); }
      }
    }
    /* 3. forget contacts that ended (keep ones between sleepers) */
    for (const [key, arb] of arbiters) {
      if (arb.touched !== stepNo && !(inert(arb.a) && inert(arb.b))) { arbiters.delete(key); }
    }
  }

  function preStep(arb, invDt) {
    const { a, b } = arb;
    for (const c of arb.contacts) {
      const r1x = c.x - a.x, r1y = c.y - a.y, r2x = c.x - b.x, r2y = c.y - b.y;
      const rn1 = r1x * c.nx + r1y * c.ny, rn2 = r2x * c.nx + r2y * c.ny;
      const kN = a.invMass + b.invMass +
        a.invI * (r1x * r1x + r1y * r1y - rn1 * rn1) + b.invI * (r2x * r2x + r2y * r2y - rn2 * rn2);
      const tx = c.ny, ty = -c.nx;
      const rt1 = r1x * tx + r1y * ty, rt2 = r2x * tx + r2y * ty;
      const kT = a.invMass + b.invMass +
        a.invI * (r1x * r1x + r1y * r1y - rt1 * rt1) + b.invI * (r2x * r2x + r2y * r2y - rt2 * rt2);
      Object.assign(c, { r1x, r1y, r2x, r2y, tx, ty, massN: 1 / kN, massT: 1 / kT, Pb: 0 });
      c.spec = Math.max(0, c.sep) * invDt;     // a gap it may still close this step
      /* closing speed before any pushes: a big one means a hit */
      c.vn0 = (b.vx - b.av * r2y - a.vx + a.av * r1y) * c.nx + (b.vy + b.av * r2x - a.vy - a.av * r1x) * c.ny;
      c.bias = Math.min(SETTINGS.maxBiasSpeed, SETTINGS.beta * invDt * Math.max(0, -c.sep - SETTINGS.slop));
    }
  }

  /* Warm start: apply last step's impulses straight away. */
  function warmStart(arb) {
    for (const c of arb.contacts) {
      const px = c.Pn * c.nx + c.Pt * c.tx, py = c.Pn * c.ny + c.Pt * c.ty;
      applyImpulse(arb.a, arb.b, c, -px, -py, "v");
    }
  }

  /* Impulse (px, py) to a, minus to b... kept in one place. */
  function applyImpulse(a, b, c, px, py, kind) {
    if (kind === "v") {
      a.vx += a.invMass * px; a.vy += a.invMass * py; a.av += a.invI * (c.r1x * py - c.r1y * px);
      b.vx -= b.invMass * px; b.vy -= b.invMass * py; b.av -= b.invI * (c.r2x * py - c.r2y * px);
    } else {
      a.bvx += a.invMass * px; a.bvy += a.invMass * py; a.bav += a.invI * (c.r1x * py - c.r1y * px);
      b.bvx -= b.invMass * px; b.bvy -= b.invMass * py; b.bav -= b.invI * (c.r2x * py - c.r2y * px);
    }
  }

  function solve(arb) {
    const { a, b } = arb;
    for (const c of arb.contacts) {
      /* relative velocity of b against a at the contact */
      let dvx = b.vx - b.av * c.r2y - a.vx + a.av * c.r1y;
      let dvy = b.vy + b.av * c.r2x - a.vy - a.av * c.r1x;

      /* push apart (never pull) */
      const vn = dvx * c.nx + dvy * c.ny;
      let dPn = -(vn + c.spec) * c.massN;
      const Pn0 = c.Pn;
      c.Pn = Math.max(Pn0 + dPn, 0);
      dPn = c.Pn - Pn0;
      applyImpulse(a, b, c, -dPn * c.nx, -dPn * c.ny, "v");

      /* friction, limited by the push */
      dvx = b.vx - b.av * c.r2y - a.vx + a.av * c.r1y;
      dvy = b.vy + b.av * c.r2x - a.vy - a.av * c.r1x;
      const vt = dvx * c.tx + dvy * c.ty;
      let dPt = -vt * c.massT;
      const maxPt = arb.friction * c.Pn;
      const Pt0 = c.Pt;
      c.Pt = Math.max(-maxPt, Math.min(maxPt, Pt0 + dPt));
      dPt = c.Pt - Pt0;
      applyImpulse(a, b, c, -dPt * c.tx, -dPt * c.ty, "v");

      /* overlap fix, on the throwaway bias velocity */
      if (c.bias > 0 || c.Pb > 0) {
        const bx = b.bvx - b.bav * c.r2y - a.bvx + a.bav * c.r1y;
        const by = b.bvy + b.bav * c.r2x - a.bvy - a.bav * c.r1x;
        const vb = bx * c.nx + by * c.ny;
        let dPb = (c.bias - vb) * c.massN;
        const Pb0 = c.Pb;
        c.Pb = Math.max(Pb0 + dPb, 0);
        dPb = c.Pb - Pb0;
        applyImpulse(a, b, c, -dPb * c.nx, -dPb * c.ny, "b");
      }
    }
  }

  function shock(arb) {
    /* the lower box stays put; only the upper one (u) is pushed */
    const lowerIsA = arb.a.isStatic || (!arb.b.isStatic && arb.a.y <= arb.b.y);
    const { a, b } = arb;
    const u = lowerIsA ? b : a, sgn = lowerIsA ? 1 : -1;
    if (u.isStatic) { return; }
    const cs = arb.contacts;
    const vn = [], cn = [];
    for (const c of cs) {
      const dvx = b.vx - b.av * c.r2y - a.vx + a.av * c.r1y;
      const dvy = b.vy + b.av * c.r2x - a.vy - a.av * c.r1x;
      vn.push(dvx * c.nx + dvy * c.ny + c.spec);
      const rx = lowerIsA ? c.r2x : c.r1x, ry = lowerIsA ? c.r2y : c.r1y;
      cn.push(rx * c.ny - ry * c.nx);
    }
    const K = (i, j) => u.invMass + u.invI * cn[i] * cn[j];
    let P = [0, 0];
    if (cs.length === 1) {
      P[0] = Math.max(0, -vn[0] / K(0, 0));
    } else {
      /* both points at once (a tiny 2x2 contact problem), or the
         one point that needs it, so the box doesn't see-saw */
      const k11 = K(0, 0), k22 = K(1, 1), k12 = K(0, 1), det = k11 * k22 - k12 * k12;
      const p1 = (-vn[0] * k22 + vn[1] * k12) / det, p2 = (-vn[1] * k11 + vn[0] * k12) / det;
      if (det > 1e-12 && p1 >= 0 && p2 >= 0) { P = [p1, p2]; }
      else if (vn[0] < 0 && vn[1] + k12 * (-vn[0] / k11) >= 0) { P = [-vn[0] / k11, 0]; }
      else if (vn[1] < 0 && vn[0] + k12 * (-vn[1] / k22) >= 0) { P = [0, -vn[1] / k22]; }
    }
    let vx = u.vx, vy = u.vy, av = u.av;
    for (let i = 0; i < cs.length; i++) {
      if (!(P[i] > 0)) { continue; }
      const c = cs[i];
      vx += sgn * u.invMass * P[i] * c.nx;
      vy += sgn * u.invMass * P[i] * c.ny;
      av += sgn * u.invI * cn[i] * P[i];
    }
    /* Only ever a brake: if it would speed the box up (the lower
       one is rising into it), leave it to the normal solver. */
    const ke = (x, y, w) => u.mass * (x * x + y * y) + u.inertia * w * w;
    if (ke(vx, vy, av) <= ke(u.vx, u.vy, u.av)) { u.vx = vx; u.vy = vy; u.av = av; }
  }

  function updateSleep(dt) {
    const lin2 = SETTINGS.sleepLinear ** 2, ang2 = SETTINGS.sleepAngular ** 2;
    const awake = bodies.filter((b) => !inert(b));
    for (const b of awake) {
      if (b.vx * b.vx + b.vy * b.vy > lin2 || b.av * b.av > ang2) { b.sleepT = 0; }
      else { b.sleepT += dt; }
    }
    if (!sleep) { return; }
    /* islands: touching moving boxes (static ground doesn't join them) */
    const parent = new Map(awake.map((b) => [b, b]));
    const find = (b) => { while (parent.get(b) !== b) { parent.set(b, parent.get(parent.get(b))); b = parent.get(b); } return b; };
    for (const arb of arbiters.values()) {
      if (arb.touched !== stepNo || !parent.has(arb.a) || !parent.has(arb.b)) { continue; }
      parent.set(find(arb.a), find(arb.b));
    }
    const minT = new Map();
    for (const b of awake) {
      const r = find(b);
      minT.set(r, Math.min(minT.has(r) ? minT.get(r) : Infinity, b.sleepT));
    }
    for (const b of awake) {
      if (minT.get(find(b)) >= SETTINGS.sleepTime) {
        b.sleeping = true;
        b.vx = 0; b.vy = 0; b.av = 0;
      }
    }
  }

  function step(dt) {
    stepNo += 1;
    const invDt = 1 / dt;
    broadphase(dt);

    /* gravity */
    for (const b of bodies) {
      if (inert(b)) { continue; }
      b.vy -= gravity * dt;
      b.bvx = 0; b.bvy = 0; b.bav = 0;
    }

    const active = [];
    for (const arb of arbiters.values()) {
      if (arb.touched === stepNo) { active.push(arb); }
    }
    for (const arb of active) { preStep(arb, invDt); }
    for (const arb of active) { warmStart(arb); }
    /* Bottom-up then top-down, in turn: support spreads up a stack
       and a hit spreads down it in far fewer passes. */
    active.sort((p, q) => Math.min(p.a.y, p.b.y) - Math.min(q.a.y, q.b.y));
    for (let k = 0; k < iterations; k++) {
      if (k % 2 === 0) { for (let i = 0; i < active.length; i++) { solve(active[i]); } }
      else { for (let i = active.length - 1; i >= 0; i--) { solve(active[i]); } }
    }
    /* Shock pass: bottom-up, each box only stops sinking into the
       one below it (as if that one were fixed). A stack then acts
       rigid at once instead of squashing like a spring. */
    for (const arb of active) { shock(arb); }

    /* remember the calm pushes, for warm starting after a hit */
    let hit = false;
    for (const arb of active) {
      for (const c of arb.contacts) { if (c.vn0 < -SETTINGS.warmSpeed) { hit = true; } }
    }
    if (!hit) {
      for (const arb of active) { for (const c of arb.contacts) { c.Ps = c.Pn; } }
    }
    lastHit = hit;

    /* move */
    for (const b of bodies) {
      if (inert(b)) { continue; }
      b.x += (b.vx + b.bvx) * dt;
      b.y += (b.vy + b.bvy) * dt;
      b.angle += (b.av + b.bav) * dt;
    }
    updateSleep(dt);
  }

  return {
    bodies,
    gravity,
    get arbiters() { return arbiters; },
    add(b) { bodies.push(b); return b; },
    remove(b) {
      const i = bodies.indexOf(b);
      if (i >= 0) { bodies.splice(i, 1); }
      for (const [key, arb] of arbiters) { if (arb.a === b || arb.b === b) { arbiters.delete(key); } }
    },
    clear() { bodies.length = 0; arbiters.clear(); },
    /* Make a box part of the scenery: it never moves again. */
    freeze(b) {
      Object.assign(b, { isStatic: true, invMass: 0, invI: 0, vx: 0, vy: 0, av: 0, sleeping: false });
    },
    wake,
    /* Boxes touching b right now (from this step's contacts). */
    touching(b) {
      const out = [];
      for (const arb of arbiters.values()) {
        if (!arb.contacts.length) { continue; }
        if (arb.a === b) { out.push(arb.b); } else if (arb.b === b) { out.push(arb.a); }
      }
      return out;
    },
    step
  };
}
