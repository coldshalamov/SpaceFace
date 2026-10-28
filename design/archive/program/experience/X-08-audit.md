# X-08 audit — sling income verb

Row: build_map §1P 566. Catalog agent ba3b5ac3, recorded by devin-lanea 2026-10-24.

## What exists

- Whip impact while tethered credits the player (`combat.js:980-1007`) → lootShards credit chips (40–460 cr by tier,
  `data/killRewards.js:47-126`) or `economy:grantCredits{reason:'bounty'}` (`combat.js:1134-1135`).
- Thrown ships/drones carry impulse provenance (`tumbleStates.js:285-325`); collision kills resolve the attacker from
  `receipt.provenance.actorId` (`collisionConsequences.js:591`).
- Stunt grammar pays salvage-rights chits for named tricks (`stuntRecognition.js:7-15`, `stuntGrammar.js:172-188`).

## Root cause of the 1-vs-45 spread

- `canCarryThrowCredit` admits only `ship`/`drone` (`tumbleStates.js:688-692`). A thrown asteroid, wreck or cargo pod
  carries no provenance, so a ballistic rock kill resolves `killerId = null` → no burst, no bounty, no kill stat
  (`combat.js:1068`; `lootShards.js:1076`). Only line-attached whip kills and thrown-ship kills pay.

## Missing

- Thrown rocks/wrecks/pods do not credit the thrower; the sling only pays by accident.

## Approvals

- audit-gate reviewer 27464a4d — APPROVE (2026-10-24)
- audit-gate reviewer 98e62e20 — APPROVE (2026-10-24)
- audit-gate reviewer 03b56769 — APPROVE (2026-10-24) — audit✓3
