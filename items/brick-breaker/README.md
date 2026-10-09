# Brick Breaker+

The classic brick breaker, with **real bounce angles, tough bricks and power-ups** like multi-ball and lasers.

| | |
|---|---|
| Slug | `brick-breaker` |
| Wing | Arcade |
| Save | `best` (score), `games` |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Start / Retry | Tap the button | Space or Enter |
| Move the paddle | Drag anywhere on the stage | ← → (or the mouse) |
| Launch | Tap the stage | Space (or click) |
| Pause | Pause button | P or Esc |

## Rules

| Brick colour | Hits to break | Points |
|---|---|---|
| Blue | 1 | 10 a hit, 50 to break |
| Amber | 2 | 10 a hit, 100 to break |
| Pink | 3 | 10 a hit, 150 to break |

| Power-up | Does | Lasts |
|---|---|---|
| **M** Multi-ball | Every ball splits into 3 | until they fall |
| **W** Wide paddle | 72 → 116 wide | 14 s |
| **S** Slow ball | 65% speed | 10 s |
| **L** Lasers | Twin shots fire by themselves | 10 s |
| **+** Extra life | +1 (max 6) | - |

- Paddle angle: middle = straight up, ends = 60° off.
- 3 lives. 10 hand-made levels (`levels.js`), then endless seeded levels.
- The ball speeds up a little with every brick hit.

## Reduced motion

- No screen shake when you lose a ball.
- No flashes anywhere (bricks shrink a little when hit instead).

## Smoke test

- Phone: taps **Start**, drags sideways (real touch through Chrome DevTools), then taps.
- Desktop: **Space**, holds **←**, then **Space**.
- Checks: the paddle moved, a drag didn't launch, the ball launched and moved.

## Notes

- Collisions in `logic.js` (pure). Tests: `tests/unit/brick-breaker.test.js`.
- **No tunnelling:** each step sweeps the ball's whole path against walls, bricks and paddle (faces + rounded corners) and takes the first touch, up to 8 bounces a step.
- Fixed 1/120 s steps on top of `kit/loop.js`. Balls, capsules, lasers, bits and pops are fixed pools.
