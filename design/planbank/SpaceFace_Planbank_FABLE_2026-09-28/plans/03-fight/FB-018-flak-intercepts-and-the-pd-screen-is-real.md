# FB-018 — The flak turret's intercept flag intercepts, and the PD screen escort is reached by the live AI

**Kind:** wire · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: countermeasures.js, seam: pdScreen.js, seam: tacticalAI.js
**Write-set:** `src/systems/countermeasures.js`, `src/ai/pdScreen.js`, `src/systems/tacticalAI.js`, `test/fb-flak-intercepts.test.mjs`
**Neighbours (extend, never restate):** NXB-012, NXI-046

## The gap
`wpn_flak_turret_s` carries `intercepts: true` and `src/ai/pdScreen.js` states that weapons never consume it
at runtime, so "shreds missiles" is an approximation. `PD_ROLE_IDS` is reached only from `aiFireIntent.js` and
encounter scripts, not from `tacticalAI.js`. `countermeasures.js` already runs an always-on PD servo loop for
the player and emits `pds:intercept` (with no listener).

## Why this direction
A separate point-defence system was rejected; the servo exists. Consuming the fitted weapon's `intercepts` in
that loop, for player and escort alike, makes the flag true and gives the escort its identity.

## Mechanism
- In `countermeasures.js`, treat a fitted `intercepts` weapon as a PD source: intercept chance and arc from the
  weapon def, ammo/heat charged through the normal weapon path.
- Route `pd_screen_escort` through `tacticalAI.js` so it takes the screen position from `pdScreen.js` in any
  spawn path, not only encounter scripts.
- Give `pds:intercept` a listener: a spark record in `actionEventRecipes.js` and a short cue, so an intercepted
  missile is seen (line INST covers the voice).

## Done when
Seed 4242 script: a missile salvo against a flak-fitted hull records ≥1 `pds:intercept` per salvo while an
unfitted hull records 0; the escort takes the screen slot in a survival spawn;
`test/fb-flak-intercepts.test.mjs` pins both; `pd-screen.test.mjs` stays green.

## Do not
Do not make intercepts free (no heat/ammo). Do not give escorts perfect interception. Do not intercept the
player's own rounds.

## Focus test starting points
- `test/pd-screen.test.mjs`
- `test/pq-140-00-interceptor.test.mjs`
