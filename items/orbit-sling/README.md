# Orbit Sling

Circle a planet, **tap to let go**, and fling yourself to the next one. Real gravity, one thumb.

| | |
|---|---|
| Slug | `orbit-sling` |
| Wing | Arcade |
| Save | `best` (planets reached), `runs` |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Start / Retry | Tap the button | Space or Enter |
| Let go of orbit | Tap the stage | Space (or click) |
| Pause | Pause button | P or Esc |

## Rules

| What happens | Result |
|---|---|
| Enter a planet's dashed ring at an angle | **Orbit** (score +1 if it's a new planet) |
| Dive almost straight at a planet | **Crash** |
| Drift off the screen (or fly 7 s) | **Lost** |

- Gravity is inverse-square: pull = μ / d².
- Letting go gives a sling kick (1.6 × orbit speed), more than escape speed.
- Planets are made from a seed. They get smaller, further apart and more to the side.

## Reduced motion

- No camera punch on capture.
- No trail behind the ship.
- The camera still glides (it never shakes).

## Smoke test

- Phone: taps **Start**, then taps the stage.
- Desktop: presses **Space** twice.
- Checks: `phase` went from `orbit` to `fly`, and the ship moved.

## Notes

- Maths in `logic.js` (pure). Tests: `tests/unit/orbit-sling.test.js`.
- Fixed 1/120 s steps on top of `kit/loop.js`.
- Sparks and shock rings come from fixed pools.
