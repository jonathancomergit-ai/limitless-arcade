/* ============================================================
   Daily Grid - main script

   One Lights Out puzzle per day, the same for everyone.
   The puzzle maths lives in grid.js (pure, unit tested).
   No canvas: the board is 25 real buttons, so a screen reader,
   a mouse, a finger and a keyboard all work the same way.

   Sections:
     1. save       streak, best per date, today's progress
     2. state      the board in play
     3. board      build + paint the 25 buttons
     4. moves      flip, undo, restart, solved
     5. share      emoji result to the clipboard (no network)
     6. input      keyboard cursor + shortcuts
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import {
  SIZE, CELLS, press, pressAll, isLit, dateKey, isDateKey,
  puzzleForDate, generate, streakAfterSolve, currentStreak, shareText
} from "./grid.js";

bootItem();

const $ = (id) => document.getElementById(id);

/* ============================================================
   1. SAVE
   days:     { "2026-10-09": 7 }   best moves per date
   progress: { date, moves: [tile, tile, ...] }   today, so far
   ============================================================ */
const MAX_DAYS = 800;          // keep about two years of history

const isMoveList = (m) => Array.isArray(m) && m.length <= 500 &&
  m.every((i) => Number.isInteger(i) && i >= 0 && i < CELLS);

const save = createSave({
  slug: itemSlug(),
  version: 1,
  defaults: { days: {}, streak: 0, bestStreak: 0, lastSolved: "", progress: { date: "", moves: [] } },
  validate(d) {
    const okDays = d.days && typeof d.days === "object" && !Array.isArray(d.days) &&
      Object.entries(d.days).every(([k, v]) => isDateKey(k) && Number.isInteger(v) && v > 0);
    const okNums = [d.streak, d.bestStreak].every((n) => Number.isInteger(n) && n >= 0);
    const okLast = d.lastSolved === "" || isDateKey(d.lastSolved);
    const okProg = d.progress && typeof d.progress.date === "string" && isMoveList(d.progress.moves);
    return (okDays && okNums && okLast && okProg) || "That save doesn't look like a Daily Grid save.";
  }
});
mountSavePanel($("save-panel"), save, { onImport: () => loadToday() });
save.onChange(() => { if (!busySaving) { loadTodayIfShowing(); } });

/* ============================================================
   2. STATE
   ============================================================ */
const state = exposeForTests({
  mode: "today",               // "today" | "practice"
  date: dateKey(),
  puzzle: null,                // { seed, board, par, presses }
  board: 0,
  moves: 0,
  history: [],
  solved: false,
  cursor: 12
});

/* ============================================================
   3. BOARD
   ============================================================ */
const boardEl = $("board");
const tiles = [];
for (let i = 0; i < CELLS; i++) {
  const b = document.createElement("button");
  b.type = "button";
  const r = Math.floor(i / SIZE), c = i % SIZE;
  b.className = `dg-tile dg-d${r + c}`;
  b.dataset.i = String(i);
  b.tabIndex = i === state.cursor ? 0 : -1;    // roving tab stop: one Tab into the grid
  b.addEventListener("click", () => { state.cursor = i; flip(i); });
  b.addEventListener("focus", () => { state.cursor = i; syncTabStop(); });
  boardEl.append(b);
  tiles.push(b);
}

function syncTabStop() {
  tiles.forEach((t, i) => { t.tabIndex = i === state.cursor ? 0 : -1; });
}

function paint() {
  for (let i = 0; i < CELLS; i++) {
    const on = isLit(state.board, i);
    const t = tiles[i];
    t.classList.toggle("is-on", on);
    t.setAttribute("aria-pressed", String(on));
    t.setAttribute("aria-label", `Row ${Math.floor(i / SIZE) + 1}, column ${(i % SIZE) + 1}, ${on ? "on" : "off"}`);
    t.disabled = state.solved;
  }
  boardEl.classList.toggle("is-won", state.solved);

  $("moves").textContent = String(state.moves);
  $("moves").classList.toggle("is-over", state.moves > state.puzzle.par);
  $("par").textContent = String(state.puzzle.par);
  const s = save.get();
  $("streak").textContent = String(currentStreak(s, state.date));
  $("mode-name").textContent = state.mode === "today" ? "Today" : "Practice";
  $("date").textContent = state.mode === "today" ? state.date : "random puzzle, no streak";
  $("practice").textContent = state.mode === "today" ? "Practice" : "Today's puzzle";
  $("practice-2").textContent = state.mode === "today" ? "Practice" : "Today's puzzle";
  $("undo").disabled = state.history.length === 0 || state.solved;
  $("restart").disabled = state.history.length === 0;
  $("actions").hidden = state.solved;
  showWin();
}

/* ============================================================
   4. MOVES
   ============================================================ */
let busySaving = false;

function startPuzzle(puzzle, moves = []) {
  state.puzzle = puzzle;
  state.history = [...moves];
  state.board = pressAll(puzzle.board, moves);
  state.moves = moves.length;
  state.solved = state.board === 0 && moves.length > 0;
  say("");
  paint();
}

function loadToday() {
  state.mode = "today";
  state.date = dateKey();
  const p = save.get().progress;
  startPuzzle(puzzleForDate(state.date), p.date === state.date ? p.moves : []);
}
function loadTodayIfShowing() { if (state.mode === "today") { paint(); } }

function startPractice() {
  state.mode = "practice";
  const seed = `practice-${Math.floor(Math.random() * 1e9)}`;
  startPuzzle(generate(seed));
}

function storeProgress() {
  if (state.mode !== "today") { return; }
  busySaving = true;
  save.set({ progress: { date: state.date, moves: state.history } });
  busySaving = false;
}

function flip(i) {
  if (state.solved) { return; }
  state.board = press(state.board, i);
  state.history.push(i);
  state.moves += 1;
  /* a little pop on the tiles that changed */
  const r = Math.floor(i / SIZE), c = i % SIZE;
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) { continue; }
    const t = tiles[rr * SIZE + cc];
    t.classList.remove("is-flip");
    void t.offsetWidth;          // restart the CSS animation
    t.classList.add("is-flip");
  }
  if (state.board === 0) { solved(); }
  storeProgress();
  paint();
}

function undo() {
  if (!state.history.length || state.solved) { return; }
  const i = state.history.pop();
  state.board = press(state.board, i);
  state.moves -= 1;
  storeProgress();
  paint();
  say("Undone.");
}

function restart() {
  state.history = [];
  state.board = state.puzzle.board;
  state.moves = 0;
  state.solved = false;
  storeProgress();
  paint();
  say("Back to the start.");
  tiles[state.cursor].focus({ preventScroll: true });
}

function solved() {
  state.solved = true;
  if (state.mode !== "today") { return; }
  busySaving = true;
  save.update((d) => {
    const prev = d.days[state.date];
    d.days[state.date] = prev ? Math.min(prev, state.moves) : state.moves;
    /* trim very old days so the save stays small */
    const keys = Object.keys(d.days).sort();
    while (keys.length > MAX_DAYS) { delete d.days[keys.shift()]; }
    Object.assign(d, streakAfterSolve(d, state.date));
    return d;
  });
  busySaving = false;
}

function showWin() {
  const win = $("win");
  win.hidden = !state.solved;
  if (!state.solved) { $("copy-box").hidden = true; return; }
  const { moves } = state;
  const par = state.puzzle.par;
  $("win-kicker").textContent = moves <= par ? "Solved on par" : "Solved";
  $("win-line").textContent = `${moves} moves · par ${par}`;
  $("win-bar").textContent = "\u{1F7E9}".repeat(Math.min(moves, par)) + "\u{1F7E8}".repeat(Math.max(0, moves - par));
  $("share").hidden = state.mode !== "today";
  $("again").textContent = state.mode === "today" ? "Play again" : "Another one";
  if (state.mode === "today") {
    const best = save.get().days[state.date];
    $("next").textContent = `Best today: ${best ?? moves}. ${untilMidnight()}`;
  } else {
    $("next").textContent = "Practice doesn't count toward your streak.";
  }
}

function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(1, Math.round((next - now) / 60000));
  return `New puzzle in ${Math.floor(mins / 60)}h ${mins % 60}m.`;
}

/* ============================================================
   5. SHARE - clipboard only, nothing is sent anywhere
   ============================================================ */
async function share() {
  const text = shareText({
    date: state.date,
    moves: state.moves,
    par: state.puzzle.par,
    streak: currentStreak(save.get(), state.date)
  });
  try {
    await navigator.clipboard.writeText(text);
    say("Copied! Paste it anywhere.", true);
  } catch {
    /* No clipboard access: show the text to copy by hand. */
    $("copy-box").hidden = false;
    $("copy-text").value = text;
    $("copy-text").select();
    say("Couldn't copy by itself. Copy the text in the box.");
  }
}

let sayTimer = 0;
function say(text, ok = false) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("is-ok", ok);
  clearTimeout(sayTimer);
  if (text) { sayTimer = setTimeout(() => { el.textContent = ""; }, 3500); }
}

$("undo").addEventListener("click", undo);
$("restart").addEventListener("click", restart);
$("again").addEventListener("click", () => (state.mode === "today" ? restart() : startPractice()));
$("share").addEventListener("click", share);
for (const id of ["practice", "practice-2"]) {
  $(id).addEventListener("click", () => (state.mode === "today" ? startPractice() : loadToday()));
}

/* ============================================================
   6. KEYBOARD
   Arrows move a cursor over the grid; Space/Enter flips it.
   (On a focused tile, Space/Enter is the button's own click.)
   ============================================================ */
const keys = createKeys({
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  action: ["Space", "Enter"],
  undo: ["KeyU", "Backspace", "KeyZ"],
  restart: ["KeyR"]
});

function moveCursor(dr, dc) {
  const r = Math.min(SIZE - 1, Math.max(0, Math.floor(state.cursor / SIZE) + dr));
  const c = Math.min(SIZE - 1, Math.max(0, (state.cursor % SIZE) + dc));
  state.cursor = r * SIZE + c;
  syncTabStop();
  if (!state.solved) { tiles[state.cursor].focus({ preventScroll: false }); }
}
keys.on("left", () => moveCursor(0, -1));
keys.on("right", () => moveCursor(0, 1));
keys.on("up", () => moveCursor(-1, 0));
keys.on("down", () => moveCursor(1, 0));
keys.on("action", () => {
  if (state.solved) { return; }
  flip(state.cursor);
  tiles[state.cursor].focus({ preventScroll: true });
});
keys.on("undo", undo);
keys.on("restart", restart);

/* A new day while the page was open (or in the background). */
function checkNewDay() {
  if (state.mode === "today" && dateKey() !== state.date) { loadToday(); }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkNewDay(); } });
setInterval(checkNewDay, 60_000);

loadToday();
boardEl.dataset.ready = "true";
