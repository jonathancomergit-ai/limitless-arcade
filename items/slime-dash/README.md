# Slime Dash

A bouncy slime on an endless run. **Tap to hop, hold to jump higher**, and don't touch the spikes.

| | |
|---|---|
| Slug | `slime-dash` |
| Wing | Arcade |
| Save | `best` (score), `runs` |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Start / Retry | Tap the button | Space or Enter |
| Hop | Tap the stage | Tap Space or ↑ (or click) |
| Jump higher | Hold the stage | Hold Space or ↑ |
| Pause | Pause button | P or Esc |

## Rules

| Thing | Colour | What it does |
|---|---|---|
| Spikes | pink | Touch = splat |
| Low ceiling | grey block, pink spikes | Tap under it. A held jump hits it |
| Gap | dark, pink edges | Fall in = gone |
| Moving platform | blue | Rides up and down. Land on it to cross a wide pit |
| Coin | amber | +5 points |

- **Score = metres + 5 × coins.** 40 world units = 1 m.
- Speed starts slow (260/s) and eases up to 440/s over 2½ minutes.

## Fair play

| Help | How long |
|---|---|
| Coyote time: jump just after running off an edge | 0.10 s |
| Jump buffer: a press just before landing still jumps | 0.13 s |
| Every tap is at least a 0.07 s jump | so a quick tap is never a dud |
| Step-up: land on a ledge a little below its top | 12 units |
| Hitboxes | a few units smaller than the drawings |

- The first two chunks are flat. The next two are single spike rows.
- Gaps and spike rows are always under 62% of a full jump at the slowest speed.

## Reduced motion

- No screen shake on a splat.
- Coins don't spin.
- Squash and stretch stays (it's small and doesn't move the screen).

## Smoke test

- Phone: taps **Start**, then taps the stage.
- Desktop: presses **Space** twice.
- Checks: `jumps` = 1, the slime got more than 20 units off the ground, and the distance and score went up.

## Notes

- Rules and level maker in `logic.js` (pure). Tests: `tests/unit/slime-dash.test.js`.
- Chunks: flat, spikes, gap, low ceiling, moving platform, spike-then-gap. New kinds unlock as you go.
- Fixed 1/120 s steps on top of `kit/loop.js`. Dust, coin sparks, "+5" pops and splat bits come from fixed pools.
