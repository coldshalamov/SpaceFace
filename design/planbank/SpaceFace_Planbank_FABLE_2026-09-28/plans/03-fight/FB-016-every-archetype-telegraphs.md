# FB-016 — Every enemy archetype carries a telegraph block, so intent is readable before the shot

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: enemies.js, seam: combat.js
**Write-set:** `src/data/enemies.js`, `src/systems/combat.js`, `test/fb-telegraph-every-archetype.test.mjs`
**Neighbours (extend, never restate):** SFQ-B044, SFQ-B050, SFQ-I017

## The gap
Thirteen of nineteen rows in `ENEMY_TYPES` have no `telegraph` block; only dart, jackal, PD screen, ghost,
tether raider, warden, anchor, dreadnought, foreman and regent do. `combat.js` already routes `telegraph.cue`
into `data.ai.approachTelegraph`, `ai:telegraph` is consumed by `survivalHud.js` and `ai:doctrinePhase` by the
presentation orchestrator. The plumbing is live; the data is missing.

## Why this direction
A generic "enemy approaching" cue was rejected (it says nothing). Each archetype's telegraph names the
physical problem it poses, which is what turns a roster into a set of readable threats.

## Mechanism
- Author `telegraph { bark, line, cue }` for the thirteen missing rows in `src/data/enemies.js`, each naming the
  approach (wasp: the pack turns as one; bruiser: the prow squares up; lancer: the lock-on hum; mule: a hold
  full of something).
- Assert in a table test that every row has a telegraph with a non-empty cue and that every cue resolves in the
  presentation recipes.
- Confirm `combat.js` copies the block for spawned enemies from every spawn path (encounter scripts, survival
  wave, traffic escorts).

## Done when
`test/fb-telegraph-every-archetype.test.mjs`: 19/19 rows telegraph and every cue resolves; seed 4242 Crucible
wave 3 shows at least three distinct `ai:telegraph` payloads in the HUD feed; `pq-161-01-telegraphs.test.mjs`
stays green.

## Do not
Do not add HP or damage to make an enemy "readable". Do not reuse one cue for all thirteen. Do not add a UI
banner.

## Focus test starting points
- `test/pq-161-01-telegraphs.test.mjs`
- `test/pq-140-02-specialists.test.mjs`
