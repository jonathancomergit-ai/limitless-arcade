# Timeless Mini

A tiny arena where **the clock is your health**. A mini version of the full game, Timeless.

| | |
|---|---|
| Slug | `timeless-mini` |
| Wing | Arcade |
| Save | `best` (seconds survived), `bestWave`, `runs` |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Start / Retry | Tap the button | Space or Enter |
| Move | Drag anywhere (a stick appears under your thumb) | WASD or arrows |
| Shoot | Automatic, at the nearest enemy | Automatic |
| Pause | Pause button | P or Esc |

## Rules

| Thing | Value |
|---|---|
| Clock at start | 30 s |
| Drain | 1 s per second |
| Hit | **−3 s**, then 1.2 s of safety |
| Kill | **+1 s** |
| New wave | every 20 s (more enemies, faster) |

Enemies:

| Shape | Name | Comes from | Warning |
|---|---|---|---|
| Pink diamond | Chaser | wave 1 | ring where it will appear |
| Yellow triangle | Dasher | wave 2 | stops and draws a line, then charges |
| Pink hexagon (number = HP) | Brute | wave 3 | ring where it will appear |

## Reduced motion

- No screen shake.
- No red hit flash.
- No blinking after a hit (the player just goes see-through).

## Smoke test

- Phone: taps **Start**, then does a real touch drag (via Chrome DevTools) to work the stick.
- Desktop: presses **Space**, then holds **D**.
- Checks: game is playing, the clock went down, the player moved the right way.

## Notes

- Rules are in `logic.js` (pure). Tests: `tests/unit/timeless-mini.test.js`.
- Fixed 1/120 s steps on top of `kit/loop.js`.
- Enemies, bullets, sparks and popups come from fixed pools (no garbage while playing).
- The Steam link is a plain `<a>` in `index.html`. Nothing is fetched.
