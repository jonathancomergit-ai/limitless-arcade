# ROADMAP

What to build next, in order. **Take the top unticked line.**

- One line = one item = one PR.
- Tick it (`[x]`) in the same PR that adds the item.
- Every item also has to meet the rules in `CLAUDE.md` (phone test, privacy, saves).

## How to read a line

```
- [ ] `slug` - one-line pitch
  - acceptance: thing that must be true
  - acceptance: another thing
```

## Up next

Tonight's three for 🎮 Arcade, in this order.

- [x] `timeless-mini` - Timeless Mini: A tiny arena where the clock is your health. Get hit, lose seconds. Win fights, win time back.
  - acceptance: Move: drag anywhere on the stage (virtual stick) on phone; WASD / arrow keys on desktop
  - acceptance: Shooting is automatic at the nearest enemy, so one thumb is enough
  - acceptance: The clock starts at 30s and drains 1s per second; a hit costs 3s, a kill gives +1s
  - acceptance: Waves get harder every 20s (more enemies, faster); show the wave number
  - acceptance: Game over at 0s: show time survived + best, a Retry button, and a link "Wishlist the full game, Timeless, on Steam" to https://store.steampowered.com/app/4437000/ (a normal link, never a fetch)
  - acceptance: Best time survived saves; Export/Import works
  - acceptance: Reduced motion: no screen shake or flashes
  - acceptance: smoke.js: start, move (touch drag on phone, keys on desktop), check the clock went down and the player moved

- [x] `orbit-sling` - Orbit Sling: Circle a planet, tap to let go, and fling yourself to the next one. Real gravity, one thumb.
  - acceptance: One input: tap / click / Space releases you from orbit
  - acceptance: Planets pull with simple inverse-square gravity; getting close to a planet captures you into its orbit
  - acceptance: Score = planets reached; crash into a planet or drift off-screen = game over
  - acceptance: Planets are generated ahead, seeded, getting trickier; the camera follows smoothly
  - acceptance: Best score saves; Export/Import works
  - acceptance: Reduced motion: no camera shake or trails
  - acceptance: smoke.js: tap or press Space and check the ship went from orbiting to flying

- [x] `daily-grid` - Daily Grid: One new lights puzzle every day, the same for everyone. Turn every tile off in as few taps as you can.
  - acceptance: 5x5 grid; tapping a tile flips it and its 4 neighbours (Lights Out rules)
  - acceptance: Today's puzzle comes from a seeded random number from the local date (YYYY-MM-DD), made by pressing random tiles on a solved grid, so it is always solvable; show its par (number of presses used)
  - acceptance: Count moves; Undo and Restart buttons; keyboard: arrows move a cursor, Space/Enter flips
  - acceptance: Win: show moves vs par and a Share button that copies an emoji result (e.g. 🟩🟩⬛) with the date to the clipboard (no network)
  - acceptance: Saves: today's progress, streak of days solved, best moves per date; Export/Import works
  - acceptance: A Practice button makes a random puzzle that doesn't touch the streak
  - acceptance: Unit test (tests/unit): the generator is deterministic for a date and every generated puzzle is solvable
  - acceptance: smoke.js: tap a tile and check the move count is 1 and the tiles changed

### Batch 2

- [ ] `slime-dash` - Slime Dash: A bouncy slime on an endless run. Tap to hop, hold to fly higher, and don't touch the spikes.
  - acceptance: Tap = small hop, hold = higher jump (variable jump height); Space / Up / click on desktop
  - acceptance: Endless level built from seeded chunks: spikes, gaps, low ceilings, moving platforms; speed ramps up slowly
  - acceptance: Coins to collect; score = distance + coins; squash-and-stretch on the slime for a juicy feel
  - acceptance: Fair: coyote time and jump buffering so taps never feel eaten
  - acceptance: Start screen, pause, game over with Retry; best score saves; Export/Import works
  - acceptance: Reduced motion: no screen shake
  - acceptance: Unit test (tests/unit): chunk generator is deterministic for a seed and every chunk is jumpable (gap widths under max jump distance)
  - acceptance: smoke.js: start, tap/press to jump, check the slime left the ground and the distance went up

- [x] `gravity-golf` - Gravity Golf: Mini golf in space. Pull back, aim, and let the planets' gravity curve your shot into the hole.
  - acceptance: Drag back from the ball to aim (slingshot); a dotted preview shows the first moment of the path; arrow keys + Space on desktop
  - acceptance: Planets pull the ball with inverse-square gravity; black holes swallow it; asteroids bounce it
  - acceptance: 12 hand-made holes in items/gravity-golf/levels.js, each with a par; strokes and a scorecard
  - acceptance: Best strokes per hole saves; Export/Import works
  - acceptance: Unit test (tests/unit): the physics step is deterministic, and every level's data is valid (ball, hole and planets on screen, not overlapping)
  - acceptance: smoke.js: drag/shoot, check strokes became 1 and the ball moved

- [x] `brick-breaker` - Brick Breaker+: The classic brick breaker, with real bounce angles, tough bricks and power-ups like multi-ball and lasers.
  - acceptance: Paddle: drag anywhere on phone, mouse or arrow keys on desktop; tap / Space launches
  - acceptance: Bounce angle depends on where the ball hits the paddle; proper circle-vs-rectangle collisions (no tunnelling at high speed)
  - acceptance: Bricks with 1-3 hit points (colour shows HP); power-ups: multi-ball, wide paddle, slow ball, laser, extra life
  - acceptance: 10 hand-made levels in items/brick-breaker/levels.js, then endless generated levels; 3 lives
  - acceptance: Best score saves; Export/Import works
  - acceptance: Reduced motion: no shake or flashes
  - acceptance: Unit test (tests/unit): circle-rectangle collision and reflection maths, including fast balls
  - acceptance: smoke.js: launch, move the paddle, check the ball moved and the paddle moved
## Ideas (not ready yet)

- (add more here)

---

## Example lines, per wing

### 🎮 Arcade

- [ ] `snake-360` - snake that fits a phone held in one hand
  - acceptance: swipe on the stage AND arrow keys both steer
  - acceptance: on-screen pad shows on touch screens only
  - acceptance: best length saves; Export/Import works
  - acceptance: smoke.js: start, turn twice, length or score changes

### 🔬 Lab

- [ ] `pendulum` - drag a pendulum and watch energy swap between height and speed
  - acceptance: live energy bars (kinetic / potential)
  - acceptance: reduced motion: starts paused with a Play button
  - acceptance: a "what's going on" panel in 5 short bullets
  - acceptance: smoke.js: drag the bob, press Play, angle changes

### 🧰 Workshop

- [ ] `image-shrink` - make images smaller, entirely in your browser
  - acceptance: pick or drop a file; nothing is uploaded (no new origins)
  - acceptance: shows before/after size in a table
  - acceptance: download button gives the new file
  - acceptance: smoke.js: load a tiny test image, output is smaller
