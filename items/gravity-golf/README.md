# Gravity Golf

Mini golf in space. **Pull back, aim, and let the planets' gravity curve your shot** into the hole.

| | |
|---|---|
| Slug | `gravity-golf` |
| Wing | Arcade |
| Save | `best` (fewest strokes per hole), `rounds` |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Tee off / pick a hole | Tap a button | Space (starts hole 1) |
| Aim + power | Drag back, like a slingshot | ← → aim, ↑ ↓ power |
| Shoot | Let go | Space or Enter |
| Cancel a drag | Slide back to the ball, let go | - |
| Pause, restart, all holes | Pause button | P or Esc |

## Rules

| Thing | Looks like | What it does |
|---|---|---|
| Planet | coloured disc, faint rings | Pulls (inverse-square). The ball can rest on it |
| Black hole | dark core, spinning pink ring | Swallows the ball: **+1**, back to your last spot |
| Asteroid | grey rock | No pull. Very bouncy |
| Course edge | dashed line | Leave it: **+1**, back to your last spot |
| Cup | flag | Roll in slower than 320/s. A gentle tug helps near misses |

- 12 hand-made holes in `levels.js`, each with a par (34 total).
- The dotted preview is the first 0.65 s of the real path (same physics step).
- Scorecard under the stage: par, this round, best, with totals vs par.

## Reduced motion

- No ball trail.
- Black-hole rings and the flag don't move.
- The swallow animation shrinks the ball without spinning it.

## Smoke test

- Phone: taps **Tee off**, then a real touch drag down from the ball (through Chrome DevTools).
- Desktop: **Space**, a short **→**, then **Space**.
- Checks: `strokes` = 1 and the ball moved.

## Notes

- Physics in `logic.js`, holes in `levels.js` (pure). Tests: `tests/unit/gravity-golf.test.js`.
- The unit test checks every hole's data, determinism, and that a search finds a route in 1-2 shots.
- Fixed 1/120 s steps on top of `kit/loop.js`. Sparks and rings come from fixed pools.
- The 420 × 560 course is scaled to fit and centred, so it looks the same on every screen.
