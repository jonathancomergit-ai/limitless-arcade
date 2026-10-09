/* ============================================================
   Daily Grid - pure puzzle logic (no DOM, unit tested)

   A board is a 25-bit number: bit i = tile i is lit.
   Tile i sits at row = floor(i / 5), col = i % 5.

   - press: Lights Out rules (a tile and its 4 neighbours flip)
   - generate: seeded from the date, made by pressing tiles on a
     solved board, so it is always solvable
   - solve: the fewest presses that turn everything off
   - streak: days in a row, with missed days handled
   - share: the emoji result
   ============================================================ */

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const ALL_OFF = 0;

/* ---- presses ---- */

/* The bits a press on tile i flips: itself + up/down/left/right. */
export function pressMask(i) {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  let m = 1 << i;
  if (r > 0) { m |= 1 << (i - SIZE); }
  if (r < SIZE - 1) { m |= 1 << (i + SIZE); }
  if (c > 0) { m |= 1 << (i - 1); }
  if (c < SIZE - 1) { m |= 1 << (i + 1); }
  return m;
}
const MASKS = Array.from({ length: CELLS }, (_, i) => pressMask(i));

export function press(board, i) { return (board ^ MASKS[i]) >>> 0; }
export function pressAll(board, list) { return list.reduce(press, board); }
export function isLit(board, i) { return ((board >>> i) & 1) === 1; }
export function litCount(board) { let n = 0; for (let i = 0; i < CELLS; i++) { n += (board >>> i) & 1; } return n; }

/* ---- dates ---- */

/* The visitor's LOCAL date as YYYY-MM-DD (not UTC: a puzzle day
   starts at the visitor's midnight). */
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* "2026-10-09" -> "2026-10-08". Works across months, years and DST. */
export function prevDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d - 1, 12));
}

export function isDateKey(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }

/* ---- seeded random ---- */

/* FNV-1a: text -> 32-bit seed. */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* mulberry32: a small, fast, seeded generator. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- the solver ----
   Lights Out is linear over GF(2): pressing twice = not pressing,
   and order doesn't matter. Gaussian elimination finds a solution;
   on 5x5 there are 2 "free" tiles, so 4 solutions. We try all 4
   and keep the shortest. Returns a sorted list of tiles, or null
   if the board can't be solved. */
export function solve(board) {
  /* Row k of the system: which presses flip tile k, then the target bit. */
  const rows = [];
  for (let k = 0; k < CELLS; k++) {
    let coeffs = 0;
    for (let j = 0; j < CELLS; j++) { if ((MASKS[j] >>> k) & 1) { coeffs |= 1 << j; } }
    rows.push({ coeffs: coeffs >>> 0, rhs: (board >>> k) & 1 });
  }

  /* Reduce to row-echelon form. */
  const pivotOf = [];          // pivotOf[col] = row index, or -1 if free
  let r = 0;
  for (let col = 0; col < CELLS; col++) {
    let p = -1;
    for (let k = r; k < CELLS; k++) { if ((rows[k].coeffs >>> col) & 1) { p = k; break; } }
    if (p === -1) { pivotOf[col] = -1; continue; }
    [rows[r], rows[p]] = [rows[p], rows[r]];
    for (let k = 0; k < CELLS; k++) {
      if (k !== r && ((rows[k].coeffs >>> col) & 1)) {
        rows[k].coeffs = (rows[k].coeffs ^ rows[r].coeffs) >>> 0;
        rows[k].rhs ^= rows[r].rhs;
      }
    }
    pivotOf[col] = r;
    r += 1;
  }
  /* Any 0 = 1 row means no solution. */
  for (let k = r; k < CELLS; k++) { if (rows[k].coeffs === 0 && rows[k].rhs) { return null; } }

  const free = [];
  for (let col = 0; col < CELLS; col++) { if (pivotOf[col] === -1) { free.push(col); } }

  let best = null;
  for (let combo = 0; combo < 1 << free.length; combo++) {
    let x = 0;
    free.forEach((col, b) => { if ((combo >>> b) & 1) { x |= 1 << col; } });
    for (let col = 0; col < CELLS; col++) {
      const row = pivotOf[col];
      if (row === -1) { continue; }
      /* pivot = rhs xor (other set variables in this row) */
      const others = rows[row].coeffs & ~(1 << col) & x;
      if (rows[row].rhs ^ (litCount(others) & 1)) { x |= 1 << col; }
    }
    const list = [];
    for (let i = 0; i < CELLS; i++) { if ((x >>> i) & 1) { list.push(i); } }
    if (!best || list.length < best.length) { best = list; }
  }
  return best;
}

/* ---- the generator ----
   Start from all-off, press k different random tiles. Keep the
   board only if its shortest solution really is k presses, so
   "par = presses used" is also the best possible score.
   Same seed text -> same puzzle, everywhere. */
export function generate(seedText) {
  const rng = makeRng(hashString(`daily-grid:${seedText}`));
  const k = 5 + Math.floor(rng() * 5);           // 5..9 presses
  for (;;) {
    const cells = [];
    while (cells.length < k) {
      const i = Math.floor(rng() * CELLS);
      if (!cells.includes(i)) { cells.push(i); }
    }
    const board = pressAll(ALL_OFF, cells);
    const best = solve(board);
    if (board !== ALL_OFF && best && best.length === k) {
      return { seed: seedText, board, par: k, presses: cells.sort((a, b) => a - b) };
    }
  }
}

export function puzzleForDate(key) { return generate(key); }

/* ---- streak ----
   save: { streak, bestStreak, lastSolved }   (lastSolved = date key or "")

   Solving today:
     already solved today      -> no change
     last solved was yesterday -> streak + 1
     anything else (missed)    -> streak starts again at 1 */
export function streakAfterSolve(s, today) {
  if (s.lastSolved === today) { return { ...s }; }
  const streak = s.lastSolved && s.lastSolved === prevDay(today) ? s.streak + 1 : 1;
  return { ...s, streak, bestStreak: Math.max(s.bestStreak || 0, streak), lastSolved: today };
}

/* The streak to SHOW today. It's still alive if you solved today
   or yesterday; after a missed day it shows 0. */
export function currentStreak(s, today) {
  if (!s.lastSolved) { return 0; }
  if (s.lastSolved === today || s.lastSolved === prevDay(today)) { return s.streak; }
  return 0;
}

/* ---- share text ----
   One square per move: green up to par, yellow for each extra.
   A 5x5 picture of the start board would spoil the puzzle, so
   only the move bar is shared. */
export function shareText({ date, moves, par, streak = 0 }) {
  const green = Math.min(moves, par);
  const extra = Math.max(0, moves - par);
  const bar = "\u{1F7E9}".repeat(green) + "\u{1F7E8}".repeat(extra);
  const verdict = moves <= par ? "on par" : `par ${par}`;
  const lines = [`Daily Grid ${date}`, `${bar} ${moves} moves (${verdict})`];
  if (streak > 0) { lines.push(`\u{1F525} ${streak} day streak`); }
  return lines.join("\n");
}
