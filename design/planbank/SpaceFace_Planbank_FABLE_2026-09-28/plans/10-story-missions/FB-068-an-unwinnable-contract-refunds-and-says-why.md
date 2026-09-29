# FB-068 — A contract whose target a third party destroyed fails with a receipt and a refund

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: missions.js, seam: economy.js
**Write-set:** `src/systems/missions.js`, `src/systems/economy.js`, `test/fb-unwinnable-contract.test.mjs`
**Neighbours (extend, never restate):** SFQ-B079, NXB-038, NXI-150

## The gap
The mission owner reconciles targets on restore and `mission:failed` triggers autosave, but no path fails a
contract whose target was destroyed by someone else, refunds the deposit and tells the player why. The
contract sits open until it expires.

## Why this direction
Failure creates content: the world took the target, the contract should say so, refund what was fronted, and
offer the wreck as the follow-on. This is a settlement rule in the mission owner plus one credit write by the
economy.

## Mechanism
- On `entity:killed`/`entity:destroyed` for a mission target where the killer is not the player, settle the
  mission as `+failed_external` with a receipt naming the cause (from `killCausality`), refund the deposit
  through `economy:grantCredits`, and offer the target's wreck through the aftermath path.
- Pin the receipt text, the refund amount and the wreck offer on a seed-4242 script.

## Done when
`test/fb-unwinnable-contract.test.mjs`: one failure receipt with cause, refund equals deposit, one wreck
offer; `set-piece-follow-on.test.mjs` stays green.

## Do not
Do not refund the reward. Do not fail on player-caused deaths. Do not double-settle after load (once-only
boundary as in SF-278).

## Focus test starting points
- `test/set-piece-follow-on.test.mjs`
- `test/loss-ledger-kill-provenance.test.mjs`
