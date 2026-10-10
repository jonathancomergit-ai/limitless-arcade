# Chipler Colony

One little Chipler lands on a tiny round planet and **copies himself**. Build farms and forges and grow a whole colony. Cozy: nobody gets hurt.

| | |
|---|---|
| Slug | `chipler-colony` |
| Wing | Arcade |
| Save | `colony` (the whole planet), `finished` (colonies completed) |
| Added | 2026-10-10 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Turn the planet | Swipe the stage, or tap a plot | Left / Right |
| Build farm / forge / house | Tap the button | 1 / 2 / 3 |
| Copy a Chipler | Copy button | Space or C |
| Send / skip a request | Send or Skip | Y / N |
| See a Chipler's trait | Tap the Chipler | T (next Chipler) |
| Remove a building | Remove (tap twice) | X (twice) |
| Pause | Pause button | P or Esc |

## Rules

| Thing | What it does |
|---|---|
| Landing pod | Plot 1. Stores goods. Room for 4 Chiplers |
| Farm (5 food) | 2 workers. 2 food a load |
| Forge (8 food, needs 2 Blueprints) | 2 workers. 1 tool a load |
| House (4 food + 4 tools, needs 4 Blueprints) | Stores goods. Room for 3 more |
| Copy | 4 food, +3 for each Chipler you already have. Needs room |
| Request | e.g. "8 food → +2 Blueprints". Send pays it. Skip: the next one comes sooner |
| No food | Chiplers walk and work at half speed. Nobody dies |

- Chiplers pick the emptiest job by themselves, walk there, work, and carry the goods to the **nearest** pod or house. Build close together!
- Traits: **Fast** (walks faster), **Sleepy** (slower, eats half), **Strong** (works faster), **Carries two** (double loads).

| Stage | Goals |
|---|---|
| 1 | Build a farm · Have 2 Chiplers · Send 1 request |
| 2 | Build a forge · Have 4 Chiplers · Make 12 tools |
| 3 | Build 2 houses · Have 10 Chiplers · Earn 10 Blueprints |

Finishing Stage 3 shows the end card, with a link to MISSION C.H.I.P.L.E.R.

## Reduced motion

- No hopping, swaying crops or forge smoke.
- No pop-in for new buildings, and "+2" numbers fade in place.
- The camera turns more gently. Nothing ever shakes or flashes.

## Smoke test

- Phone: taps **Farm**, waits for food to come in, taps plot 5 on the planet, taps **Copy**.
- Desktop: presses **1**, waits, clicks plot 5, presses **Right**, presses **Space**.
- Checks: the farm stands, food was made, the picked plot changed, Chiplers went from 1 to 2.

## Notes

- Rules in `colony.js` (pure, seeded dice in the save). Tests: `tests/unit/chipler-colony.test.js`.
- A simple bot finishes all three stages in about 3 to 4 minutes (a unit test checks it). People take longer.
- The colony saves every 4 seconds, after every action, and when the tab is hidden.
