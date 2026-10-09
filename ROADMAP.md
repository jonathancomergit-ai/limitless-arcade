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

- [ ] `timeless-mini` - Timeless Mini: A tiny arena where the clock is your health. Get hit, lose seconds. Win fights, win time back.
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

- [ ] `daily-grid` - Daily Grid: One new lights puzzle every day, the same for everyone. Turn every tile off in as few taps as you can.
  - acceptance: 5x5 grid; tapping a tile flips it and its 4 neighbours (Lights Out rules)
  - acceptance: Today's puzzle comes from a seeded random number from the local date (YYYY-MM-DD), made by pressing random tiles on a solved grid, so it is always solvable; show its par (number of presses used)
  - acceptance: Count moves; Undo and Restart buttons; keyboard: arrows move a cursor, Space/Enter flips
  - acceptance: Win: show moves vs par and a Share button that copies an emoji result (e.g. 🟩🟩⬛) with the date to the clipboard (no network)
  - acceptance: Saves: today's progress, streak of days solved, best moves per date; Export/Import works
  - acceptance: A Practice button makes a random puzzle that doesn't touch the streak
  - acceptance: Unit test (tests/unit): the generator is deterministic for a date and every generated puzzle is solvable
  - acceptance: smoke.js: tap a tile and check the move count is 1 and the tiles changed

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
