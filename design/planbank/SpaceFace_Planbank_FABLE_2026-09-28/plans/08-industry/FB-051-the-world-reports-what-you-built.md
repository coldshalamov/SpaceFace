# FB-051 — Claims and automation report their receipts: convoys arrive, patrols rotate, income lands, raids warn

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: claims.js, seam: automation.js, seam: marketNews.js, seam: dockArrival.js
**Write-set:** `src/ui/marketNews.js`, `src/ui/dockArrival.js`, `src/systems/claims.js`, `src/systems/automation.js`, `test/fb-industry-receipts.test.mjs`
**Neighbours (extend, never restate):** NXB-035, NXI-140, NXI-138

## The gap
Twelve `claim:*` events (`claim:defenseWarning`, `claim:defenseStarted`, `claim:depotPatrolRotation`,
`claim:depotSupport`, `claim:infrastructureConstructed`, `claim:specialized`, `claim:receipt`,
`claim:teleportRequest`, and more) and three `automation:*` events (`automation:incomeCredited`,
`automation:traderCycleCompleted`, `automation:assetResumed`) are emitted with no listener. The two real
authorship levers (a player trader moves prices; a claim summons NPC convoys and a Concord patrol beat) both
work and are silent.

## Why this direction
An empire screen is forbidden. `marketNews.js` already subscribes to economy events and owns a ticker and a
news voice; `dockArrival.js` already shows cards. Subscribing them converts computed authorship into readable
lines at near-zero cost.

## Mechanism
- Subscribe `marketNews.js` to the fifteen events and publish one cited line each (a raid warning is urgent; a
  patrol rotation and an income credit are ambient).
- On dock, show a card summarizing the claim and automation lines since the last dock in `dockArrival.js`.
- Pin that a seed-4242 claim with a depot produces the convoy, patrol and income lines in order, and that a raid
  warning precedes the raid.

## Done when
`test/fb-industry-receipts.test.mjs` pins the ordered lines and the dock card; `claim-defense.test.mjs` and
`automation-depot-intake.test.mjs` stay green.

## Do not
Do not add a claims panel. Do not publish uncited. Do not change raid odds.

## Focus test starting points
- `test/claim-defense.test.mjs`
- `test/automation-depot-intake.test.mjs`
- `test/inf-087-trader-resume.test.mjs`
