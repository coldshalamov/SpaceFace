# FB-065 — A physics contract condition says when it is pending, progressing or broken, in flight

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: missions.js, seam: missionConditions.js, seam: hud.js
**Write-set:** `src/systems/missions.js`, `src/ui/hud.js`, `test/fb-condition-tells-you.test.mjs`
**Neighbours (extend, never restate):** NXI-149, SFQ-I025

## The gap
`mission:conditionPending`, `mission:conditionProgress` and `mission:conditionBroken` are emitted from the
per-tick evaluator and have no listener. The physics-vocabulary terms (keep it under 40 WU/s, never let the
line go slack) are scored every tick and the player learns the result at the dock.

## Why this direction
A contract HUD panel was rejected (ORRERY). One objective line on the existing HUD objective slot with a state
word and a voice on the break is the minimum; the sim already computes all three states.

## Mechanism
- Consume the three events in `hud.js`'s objective slot: pending shows the term, progress shows the fraction,
  broken swaps the word and stays for 4 s (functional edit).
- Voice the break once through the voice arbiter at mission priority; never voice progress.
- Pin one broken line and voice on a scripted slack-line break on seed 4242.

## Done when
`test/fb-condition-tells-you.test.mjs`: pending→progress→broken states appear in the HUD model with one voice
line on the break; `pq-152-03-twist-clauses.test.mjs` stays green.

## Do not
Do not add a panel. Do not voice progress. Do not change condition scoring.

## Focus test starting points
- `test/pq-152-03-twist-clauses.test.mjs`
- Locate condition suites with `rg missionConditions test/`.
