# Stack Tower

Drop blocks onto a wobbly tower with **real physics**. How high can you build before it all comes crashing down?

| | |
|---|---|
| Slug | `stack-tower` |
| Wing | Arcade |
| Save | `best` (height in m), `top` (score), `games` |
| Added | 2026-10-10 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Drop the block | Tap the stage or **Drop** | Space, Enter or ↓ (or click) |
| Build again | Tap the button | Space |
| Pause | Pause button | P or Esc |

## Rules

| Thing | What happens |
|---|---|
| Sliding block | Swings between ±2.3 m. Starts at 1.9 m/s, speeds up 0.06 m/s per block, max 3.6 m/s |
| Block size | 0.5 m tall, 1.5 to 2.1 m wide (random) |
| Drop | Falls straight down (no sideways speed) |
| Land | +10 points. The next block comes 0.4 s later |
| **Perfect!** | Centre within 10 cm of the block below: +25 more |
| Game over | Any block's centre drops below the top of the base |
| Height | Top of the highest landed block that has been still for 0.25 s |

## Physics (`physics.js`)

Plain JS, no libraries. Boxes only. Units: m, kg, s. y up.

| Part | How |
|---|---|
| Collision | Box vs box: SAT + edge clipping → up to 2 contact points (so boxes can rest flat AND tip over an edge) |
| Solver | Sequential impulses, 12 passes, friction 0.8, no bounce |
| Warm start | Last step's pushes reused, so stacks hold their weight at once |
| Speculative contacts | A falling box is caught exactly on the surface, no sinking in |
| Split impulses | Overlap is fixed with a throwaway "bias" velocity, so it never adds real speed |
| Shock pass | One bottom-up pass after solving: no box keeps sinking into the one below. Stacks act rigid, not springy |
| Calm warm start | After a hit, only the "holding weight" push is reused, so the tower doesn't bounce |
| Sleeping | Touching boxes that stay still for 0.5 s sleep until something hits them |
| Stone | Sleeping blocks more than 6 m under the top become static. Keeps tall towers cheap and steady |

- Fixed 1/120 s steps on top of `kit/loop.js`.
- Energy: never grows by more than lifting each block half a millimetre in a step (tested).

## Reduced motion

- No screen shake when the tower falls.
- No Perfect ring flash. The "Perfect!" text still shows.
- The camera still rises with the tower (it has to), smoothly.

## Smoke test

- Waits until the sliding block is near the middle, then drops it. 3 times.
- Phone: taps the stage. Desktop: one mouse click, then Space twice.
- Checks: 3 blocks landed, height > 1 m and shown in the HUD, still playing.

## Notes

- Physics in `physics.js`, small rules in `logic.js` (both pure). Tests: `tests/unit/stack-tower.test.js`.
- Unit tests: a resting box doesn't drift or jitter for 5 s, a box half over an edge tips off, energy never grows, a 20-block tower stays put and sleeps, sleeping towers wake on a hit, friction on slopes.
