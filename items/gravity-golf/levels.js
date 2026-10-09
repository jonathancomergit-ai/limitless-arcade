/* ============================================================
   Gravity Golf - the 12 holes

   Every hole lives in the same 420 x 560 field (x right, y down).
     ball     where you tee off
     cup      the hole
     planets  { x, y, r }  pull (inverse-square) and stop the ball
     holes    { x, y, r }  black holes: r = point of no return
     rocks    { x, y, r }  asteroids: no pull, very bouncy

   The unit test checks every hole: on screen, nothing overlapping.
   ============================================================ */

export const LEVELS = [
  {
    name: "First Putt",
    tip: "Drag back from the ball and let go.",
    par: 2,
    ball: { x: 210, y: 470 },
    cup: { x: 210, y: 110 },
    planets: [{ x: 345, y: 300, r: 28 }]
  },
  {
    name: "Curveball",
    tip: "Aim to one side. The planet bends it back.",
    par: 2,
    ball: { x: 210, y: 490 },
    cup: { x: 210, y: 90 },
    planets: [{ x: 210, y: 290, r: 50 }]
  },
  {
    name: "Around the Bend",
    tip: "Go up and over. Let gravity bring it down.",
    par: 3,
    ball: { x: 80, y: 480 },
    cup: { x: 340, y: 480 },
    planets: [{ x: 210, y: 400, r: 48 }]
  },
  {
    name: "Twin Moons",
    tip: "Thread the gap, or swing round the outside.",
    par: 2,
    ball: { x: 210, y: 500 },
    cup: { x: 210, y: 80 },
    planets: [{ x: 120, y: 290, r: 38 }, { x: 300, y: 290, r: 38 }]
  },
  {
    name: "Rock Garden",
    tip: "Asteroids bounce. Bank it in.",
    par: 3,
    ball: { x: 210, y: 500 },
    cup: { x: 210, y: 90 },
    planets: [],
    rocks: [{ x: 210, y: 270, r: 34 }, { x: 95, y: 200, r: 22 }, { x: 325, y: 200, r: 22 }, { x: 150, y: 380, r: 18 }]
  },
  {
    name: "Event Horizon",
    tip: "Black holes swallow the ball. Keep your distance.",
    par: 3,
    ball: { x: 90, y: 490 },
    cup: { x: 330, y: 100 },
    planets: [],
    holes: [{ x: 210, y: 290, r: 12 }]
  },
  {
    name: "Far Side",
    tip: "The hole hides behind the moon.",
    par: 3,
    ball: { x: 210, y: 500 },
    cup: { x: 210, y: 95 },
    planets: [{ x: 210, y: 245, r: 62 }]
  },
  {
    name: "Pinball",
    tip: "Rocks all the way up.",
    par: 3,
    ball: { x: 70, y: 500 },
    cup: { x: 350, y: 80 },
    planets: [{ x: 345, y: 420, r: 30 }],
    rocks: [{ x: 130, y: 330, r: 26 }, { x: 260, y: 270, r: 26 }, { x: 140, y: 170, r: 26 }, { x: 290, y: 150, r: 18 }]
  },
  {
    name: "Gravity Well",
    tip: "One big planet. Ride the curve.",
    par: 3,
    ball: { x: 60, y: 500 },
    cup: { x: 360, y: 70 },
    planets: [{ x: 210, y: 285, r: 74 }]
  },
  {
    name: "Black Hole Sun",
    tip: "Two black holes. Hug the planet.",
    par: 3,
    ball: { x: 210, y: 510 },
    cup: { x: 210, y: 60 },
    planets: [{ x: 210, y: 290, r: 40 }],
    holes: [{ x: 80, y: 220, r: 12 }, { x: 340, y: 360, r: 12 }]
  },
  {
    name: "Asteroid Belt",
    tip: "Find the gap in the belt.",
    par: 3,
    ball: { x: 330, y: 500 },
    cup: { x: 90, y: 90 },
    planets: [{ x: 300, y: 150, r: 34 }],
    rocks: [
      { x: 30, y: 300, r: 20 }, { x: 80, y: 300, r: 20 }, { x: 130, y: 300, r: 20 },
      { x: 250, y: 300, r: 20 }, { x: 300, y: 300, r: 20 }, { x: 350, y: 300, r: 20 }, { x: 395, y: 300, r: 18 }
    ]
  },
  {
    name: "Grand Tour",
    tip: "Everything at once. Take it in steps.",
    par: 4,
    ball: { x: 60, y: 510 },
    cup: { x: 360, y: 70 },
    planets: [{ x: 120, y: 300, r: 40 }, { x: 320, y: 330, r: 32 }],
    holes: [{ x: 230, y: 190, r: 12 }],
    rocks: [{ x: 250, y: 440, r: 22 }, { x: 330, y: 190, r: 18 }]
  }
];
