# X-08 draft — The Accountant

## Root cause (verified)

`canCarryThrowCredit` (`tumbleStates.js:688-692`) admits only `ship` and `drone`, so `_onThrow`
(`:297`) records no provenance on a thrown rock, wreck or pod. `contactImpulseProvenance`
(`collisionConsequences.js:759`) reads **both** bodies' records. If the rock carried the thrower's
record, the damage would route with `attackerId = player` (`:591`). The kill would then resolve
to the player, and the existing payout would follow unchanged: lootShards burst, bounty chips,
`stats.kills`.

## Proposal

All changes are in `src/systems/tumbleStates.js`.

```js
const THROW_CREDIT_TYPES = new Set(['ship','drone','asteroid','wreck','debris']);
// in canCarryThrowCredit, replace the type test with:
(THROW_CREDIT_TYPES.has(victim.type)
  || (victim.type === 'pickup' && typeof victim.data.commodityId === 'string'))
```

Tumble never admits non-hulls, so the flight hold in `_beginFromImpulse` never runs for them. For a
non-ship, non-drone body, `_onThrow` therefore also calls
`holdImpulseProvenance(victim, throwTick + 240, throwTick, throwTick)`.

## Numbers

| quantity | value |
|---|---|
| hold | 240 ticks = 4 s |
| base window it extends | 180 ticks (`impulseKernel.js:340`) |
| distance a 60 wu/s rock covers in the hold | 240 wu, the starter's whole envelope |

The payout is the existing `killRewards.js` table, with **no new reward table**. Credits land only
on collection (`economy:grantCredits` via lootShards, AC-01).

## Named side effects

- **Lawful victim.** A rock that kills a lawful ship is now the player's kill. `lawSecurity`
  adjudicates it, and a witnessed kill costs heat via `heat.js`. That is honest, and it feeds X-05.
- **Rock on rock.** There is no payout: a non-hostile victim with no manifest yields nothing
  (`lootShards.js:1068`).

## Determinism and save

Impulse records are WeakMap-only and never saved (`impulseKernel.js:346`). Production digests
(`tumbleFling: true`) change for thrown-mass kills, since bursts now spawn. That needs a deliberate
re-record ("throw credit widened"). `legacy47a` has the flag off.

## Tests

- Extend `tumble-fling-attribution.test.mjs`:
  - a thrown asteroid that kills a hostile wasp gives `killerId === playerId` and a burst;
  - a 5 s stale throw gives `null`;
  - a lawful victim gets a law receipt.
- Keep green: `tumble-fling-chain`, `-bounce`, `-free-spin`, `gyre-bowling-contacts`,
  `field-demolition-response`, `wave-b10-throw-determinism`, `adventure-kill-shard`.

**Verdict: shippable, S. This is the root fix the audit names.**
