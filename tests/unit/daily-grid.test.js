/* ============================================================
   Daily Grid - puzzle logic (items/daily-grid/grid.js)
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CELLS, press, pressAll, isLit, litCount, pressMask, dateKey, prevDay, isDateKey,
  generate, puzzleForDate, solve, streakAfterSolve, currentStreak, shareText
} from "../../items/daily-grid/grid.js";

/* Every date in a year, as YYYY-MM-DD. */
function yearOfDates(year = 2026) {
  const out = [];
  for (let d = new Date(year, 0, 1, 12); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    out.push(dateKey(d));
  }
  return out;
}

test("a press flips the tile and its 4 neighbours", () => {
  assert.equal(litCount(pressMask(12)), 5, "middle: 5 tiles");
  assert.equal(litCount(pressMask(0)), 3, "corner: 3 tiles");
  assert.equal(litCount(pressMask(2)), 4, "edge: 4 tiles");
  const b = press(0, 12);
  for (const i of [7, 11, 12, 13, 17]) { assert.ok(isLit(b, i)); }
  assert.equal(press(b, 12), 0, "pressing twice undoes it");
  assert.equal(pressAll(0, [3, 9, 3, 9]), 0);
});

test("dates are local YYYY-MM-DD, and prevDay crosses months and years", () => {
  assert.equal(dateKey(new Date(2026, 9, 9, 23, 59)), "2026-10-09");
  assert.equal(prevDay("2026-03-01"), "2026-02-28");
  assert.equal(prevDay("2024-03-01"), "2024-02-29");
  assert.equal(prevDay("2027-01-01"), "2026-12-31");
  assert.ok(isDateKey("2026-10-09"));
  assert.ok(!isDateKey("10/09/2026"));
});

test("the generator is deterministic for a date", () => {
  for (const key of ["2026-10-09", "2026-01-01", "2030-12-31"]) {
    assert.deepEqual(puzzleForDate(key), puzzleForDate(key));
  }
  assert.notEqual(puzzleForDate("2026-10-09").board, puzzleForDate("2026-10-10").board);
});

test("every puzzle for a whole year is solvable, and par is the best possible", () => {
  const boards = new Set();
  for (const key of yearOfDates()) {
    const p = puzzleForDate(key);
    assert.notEqual(p.board, 0, `${key} starts solved`);
    assert.equal(pressAll(p.board, p.presses), 0, `${key}: its own presses don't solve it`);
    const best = solve(p.board);
    assert.ok(best, `${key}: solver found nothing`);
    assert.equal(pressAll(p.board, best), 0, `${key}: solver's answer doesn't work`);
    assert.equal(best.length, p.par, `${key}: par isn't the minimum`);
    assert.equal(p.presses.length, p.par, `${key}: par = presses used`);
    assert.ok(p.par >= 5 && p.par <= 9);
    boards.add(p.board);
  }
  assert.ok(boards.size > 360, "puzzles hardly ever repeat");
});

test("the solver finds the shortest answer, and spots unsolvable boards", () => {
  assert.deepEqual(solve(0), []);
  assert.deepEqual(solve(press(0, 12)), [12]);
  assert.deepEqual(solve(pressAll(0, [0, 24])), [0, 24]);
  /* A single lit corner can't be solved on 5x5. */
  assert.equal(solve(1), null);
  /* Practice puzzles from any seed are solvable too. */
  for (let s = 0; s < 50; s++) {
    const p = generate(`practice-${s}`);
    assert.equal(pressAll(p.board, solve(p.board)), 0);
  }
});

test("streak: +1 for yesterday, unchanged for today, restarts after a missed day", () => {
  const fresh = { streak: 0, bestStreak: 0, lastSolved: "" };
  const d1 = streakAfterSolve(fresh, "2026-10-08");
  assert.deepEqual(d1, { streak: 1, bestStreak: 1, lastSolved: "2026-10-08" });
  const d2 = streakAfterSolve(d1, "2026-10-09");
  assert.equal(d2.streak, 2);
  assert.deepEqual(streakAfterSolve(d2, "2026-10-09"), d2, "solving again today changes nothing");
  const missed = streakAfterSolve(d2, "2026-10-11");
  assert.equal(missed.streak, 1, "missed the 10th");
  assert.equal(missed.bestStreak, 2, "best streak is kept");
});

test("streak shown today: alive if solved today or yesterday, else 0", () => {
  const s = { streak: 4, bestStreak: 4, lastSolved: "2026-10-08" };
  assert.equal(currentStreak(s, "2026-10-08"), 4);
  assert.equal(currentStreak(s, "2026-10-09"), 4);
  assert.equal(currentStreak(s, "2026-10-10"), 0);
  assert.equal(currentStreak({ streak: 0, lastSolved: "" }, "2026-10-10"), 0);
});

test("share text: date, one square per move, streak", () => {
  const t = shareText({ date: "2026-10-09", moves: 7, par: 6, streak: 3 });
  assert.match(t, /^Daily Grid 2026-10-09\n/);
  assert.ok(t.includes("\u{1F7E9}".repeat(6) + "\u{1F7E8} 7 moves (par 6)"));
  assert.ok(t.includes("3 day streak"));
  assert.ok(shareText({ date: "2026-10-09", moves: 6, par: 6 }).includes("(on par)"));
  assert.ok(!/https?:/.test(t), "no links in the share text");
  assert.equal(CELLS, 25);
});
