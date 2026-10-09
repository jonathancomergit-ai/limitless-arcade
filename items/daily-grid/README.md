# Daily Grid

One new lights puzzle every day, **the same for everyone**. Turn every tile off in as few taps as you can.

| | |
|---|---|
| Slug | `daily-grid` |
| Wing | Arcade |
| Save | `days` (best moves per date), `streak`, `bestStreak`, `lastSolved`, `progress` (today's moves) |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Flip a tile | Tap it | Arrows, then Space or Enter |
| Undo | Undo button | U or Backspace |
| Restart | Restart button | R |
| Practice | Practice button | Tab to it, Enter |
| Share (after solving) | Share result | Tab to it, Enter |

## Rules

- 5 × 5 grid. A tap flips the tile **and its 4 neighbours** (Lights Out).
- Goal: every tile off.
- **Par** = presses used to make the puzzle = the fewest possible.

## How the daily puzzle is made

1. Take the visitor's **local** date: `YYYY-MM-DD`.
2. Hash it into a seed → seeded random numbers.
3. Start from all-off. Press 5 to 9 random tiles.
4. Keep it only if the solver agrees that's the shortest answer.

So it's always solvable, and the same for everyone on that date.

## Streak

| Last solved | Solving today makes the streak |
|---|---|
| Today | unchanged |
| Yesterday | +1 |
| Earlier (missed a day) | 1 |

Practice puzzles never touch the streak or the save.

## Share

- Copies text like `🟩🟩🟩🟩🟩🟨 6 moves (par 5)` with the date.
- Uses `navigator.clipboard`. Nothing is sent anywhere.
- No clipboard? The text shows in a box to copy by hand.

## Reduced motion

- No tile pop, no win ripple (kit.css turns CSS animation off).

## Smoke test

- Phone: taps a tile. Desktop: arrows + Space.
- Checks: moves = 1, the board changed. Then Undo puts it back.

## Notes

- Logic + solver in `grid.js` (pure). Tests: `tests/unit/daily-grid.test.js` (a whole year of dates).
- No canvas and no game loop: 25 real buttons.
