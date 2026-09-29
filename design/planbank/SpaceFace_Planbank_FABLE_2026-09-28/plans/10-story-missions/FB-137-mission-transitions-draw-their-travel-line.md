# FB-137 — A set-piece transition draws its travel line on the map and the HUD instead of emitting into nothing

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: missions.js, seam: routeRibbon.js, seam: hud.js
**Write-set:** `src/systems/missions.js`, `src/presentation/routeRibbon.js`, `test/fb-set-piece-travel-line.test.mjs`
**Neighbours (extend, never restate):** NXB-054, SF-245

## The gap
`mission:setPieceTransition` and `mission:setPieceTravelLine` are emitted with no listener; the authored set
pieces know where the next beat is and the player gets no line. The route ribbon already draws a travel line
for engaged routes.

## Why this direction
One consumer: the route ribbon draws the set-piece's travel line as a secondary ribbon until the transition
completes; NXB-054 keeps knowledge distinct from the active route, so this is a second-destination ribbon,
never the active route.

## Mechanism
- Subscribe the route ribbon presentation to `mission:setPieceTravelLine` and draw a distinct secondary ribbon;
  clear on `mission:setPieceTransition` or completion.
- Pin one ribbon per travel line and its clearing on seed 4242's beat-1 set piece.

## Done when
`test/fb-set-piece-travel-line.test.mjs`: ribbon appears and clears, the active route is untouched;
`pq-032-00-set-pieces.test.mjs` stays green.

## Do not
Do not set the active route. Do not add a map layer file. Do not draw for unaccepted offers.

## Focus test starting points
- `test/pq-032-00-set-pieces.test.mjs`
- `test/navigation-stale-route.test.mjs`
