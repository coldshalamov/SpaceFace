# X-08 draft — Drifter: your rock, your bounty, your bill

Persona: The Drifter. Row §1P 566. Audit: `X-08-audit.md`.

## Ground

On a work site, whatever you throw is yours: the credit and the blame. Today a thrown rock that
flattens a raider pays nobody, because `canCarryThrowCredit` admits only ships and drones
(`tumbleStates.js:688-692`). Fix the attribution, and bounty, loot, and law already know what to do.

## Rule

A body the **player's line released** carries the player's credit for one flight. That covers `ship`
and `drone` (today) plus **`asteroid`**, **`wreck`**, and **`pickup`** (cargo pods). The credit expires
on the first solid impact or at the existing provenance window. A rock that drifts a minute and then
clips a patrol doesn't bill you. The one that hits on the release line does.

## What the player gets

- Thrown rock kills a raider: the normal bounty chip and lootShards burst. Same pay as a gun kill,
  no more.
- First time, a one-time hint: *"Your rock. Your bounty."*
- Thrown rock hits a civilian in a patrol's sight: the existing collision-consequence and witness
  path now names you. Concord answers from its own corpus. First time: *"Your rock. Your bill."*
- A thrown pod that breaks spills like any slammed pod. Throw your own freight and you lose your own
  freight.

## Lands in

- `tumbleStates.js:688-692`: widen the type test to `ship|drone|asteroid|wreck|pickup`, keeping the
  alive and not-player guards. Make sure the release path stamps `provenance.actorId` (`:285-325`) for
  those types. If the stamp lives only in `_beginFromImpulse`, lift it to the shared release seam
  rather than give rocks a tumble status. Add `expiresOnFirstImpact` to the existing provenance object.
- Already wired: `collisionConsequences.js:591` resolves the attacker from provenance, and
  `combat.js:1068` / `lootShards.js:1076` pay through the normal routes. No new credit path.
- `hudAttention.js` `FIRST_USE_LINE`: add `masslineRockPay` and `masslineRockBill`. `onboarding.js`:
  two listeners on kill and incident receipts whose provenance body is a thrown non-ship.
- Pins: `wave-b10-throw-determinism`, tumble provenance tests, law incident tests.

## Working life

The sling becomes a trade tool with liability: it pays when you aim and bills you when you don't.
