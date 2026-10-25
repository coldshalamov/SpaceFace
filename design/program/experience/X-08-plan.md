# X-08 plan — sling income: a thrown rock is the thrower's kill

Row §1P 566. Audit `X-08-audit.md` (audit✓3). Tribunal judge, 2026-10-24.

## Scores

| draft | crit-path | authentic | specific | cost | non-redundant | total |
|---|---|---|---|---|---|---|
| Skeptic | 4 | 4 | 5 | 5 | 4 | **22** |
| Accountant | 4 | 4 | 5 | 5 | 4 | **22** |
| Drifter | 4 | 5 | 4 | 3 | 4 | **20** |

Kept: the Skeptic/Accountant root fix (widen the gate, hold through flight), the Accountant's 240-tick hold, the Skeptic's lawful-kill consequence, the Drifter's "released from the player's line" scope. Rejected: the Drifter's `expiresOnFirstImpact` (a new kernel field); its hints are deferred.

## Where provenance is stamped (verified)

- One stamp only: `tumbleStates._onThrow` → `recordImpulseProvenance(victim, {actorId: player, tag:'massline_throw'})` (`tumbleStates.js:297-305`), on `massline:throw` (`:120`) from `masslineThrow._executeThrow` (`masslineThrow.js:571`; armed/snap/snap-manual, `:262-269`).
- A plain cut of a swung body releases via `tether:released` (`tetherGameplay.js:1490,1516`) with no `massline:throw`, so a widened gate alone still misses free sling releases.
- The flight hold lives only in `_beginFromImpulse` (`:466-471`), which tumbles only ships/drones; a rock's record dies at `IMPULSE_PROVENANCE_MAX_AGE_TICKS = 180` (`impulseKernel.js:14,322-335`).

## Design (`src/systems/tumbleStates.js` only)

1. **Widen the type gate** (`canCarryThrowCredit`, `:688-692`). Add `asteroid`, `wreck` and `payload` (cargo pods spawn as `payload` bodies, `lootShards.js:472-489`). Keep the `alive`, `data` and not-player guards.
2. **Hold non-tumbling bodies.** In `_onThrow`, after `recordImpulseProvenance`, add:

   ```js
   if (victim.type !== 'ship' && victim.type !== 'drone')
     holdImpulseProvenance(victim, throwTick + THROW_CREDIT_HOLD_TICKS, throwTick, throwTick);
   ```

   Then export `THROW_CREDIT_HOLD_TICKS = 240`.
3. **Cover the plain sling release.**
   - Subscribe to `tether:released` (a deliberate cut only, never `tether:broke`).
   - For `payload.targetId`, if `combatFlag('tumbleFling')`, `canCarryThrowCredit`, the type is not ship or drone, the body's speed is at least `THROW_CREDIT_MIN_SPEED_WU = 25`, and no `massline_throw` record exists at this tick, record and hold through the same two calls.
   - Ships and drones keep their existing paths untouched.

Nothing downstream changes, because every later step already exists:
- `contactImpulseProvenance` reads both bodies (`collisionConsequences.js:759-761`).
- Damage routes with `attackerId = player` (`:591`).
- Combat's kill path pays the burst, bounty and stats.
- `lawSecurity` adjudicates lawful victims, and `heat.js` writes heat from the incident receipt.

## Numbers

- **240 ticks = 4 s.** This is the "4 s flight" the hold was designed for (`impulseKernel.js:339-347`). At a 60 wu/s throw that is 240 wu, about the starter's latch envelope. Past it, a drifting rock bills nobody.
- **25 wu/s.** This is the repo's existing "that was a throw" floor (`RAID_THROW_MIN_SPEED_WU`, `onboarding.js:252`). A set-down below it carries no credit.
- **Payout.** The existing `killRewards.js` tiers, no new table:
  - wasp → one 40–90 cr chip plus scrap;
  - reaver → heavy burst into the bay.

  Credits land only on collection, via `economy:grantCredits`.

## Save / determinism

- Records are WeakMap-only and never saved (`impulseKernel.js:5,346`). There are no RNG draws.
- Production (`tumbleFling: true`) digests change where thrown mass kills hostiles, because bursts now spawn. Re-record deliberately with the reason "throw credit widened to rocks/wrecks/pods". Likely affected: `wave-b10-throw-determinism`, if it kills with a rock.
- `legacy47a` has the flag off, so it is unchanged.

## Tests to add (extend `test/tumble-fling-attribution.test.mjs`)

1. A `massline:throw` asteroid hits a hostile wasp at tick +120: `killerId === playerId`, exactly one burst, `stats.kills + 1`.
2. The same hit at tick +230 is still the player's (held). At tick +260 it gives `killerId == null`.
3. **Plain sling cut.** A `tether:released` rock at 40 wu/s that kills a wasp is the player's. The same rock released at 10 wu/s carries no record.
4. A thrown `payload` pod and a thrown `wreck` that each kill a wasp are both the player's.
5. **Accepted side effect.** A thrown rock kills a lawful patrol hull inside a witness's radius: `lawSecurity` files the kill incident with `offenderEntityId === playerId`, and `player.heat` rises through `heat.js` only. An unwitnessed lawful kill files no heat.
6. A rock that hits another asteroid produces no burst and no incident (`lootShards.js:1068`).
7. A thrown rock that rebounds into the player produces no self-kill credit and no incident.
8. `tether:broke` (an involuntary break) stamps nothing.

## Must stay green

`tumble-fling-throw-attribution`, `tumble-fling-chain`, `-bounce`, `-free-spin`, `-outbound`, `throwable-credit-chip`, `inf-034-single-death-single-pay`, `physical-kill-causality`, `pq-028-01-sling-throw`, `tumble-states-quiet-latch`, `gyre-bowling-contacts`, `field-demolition-response`, `adventure-kill-shard`, `sfq-b183-impulse-throw-read`, `inf-061-raid-discovery` (the raid lesson credits through `lastWhipAt`, unchanged).

## Non-goals

- No new reward table and no new kernel field.
- No `expiresOnFirstImpact`.
- No change to ship or drone throw paths, mass, or thrust.
- No first-use hints for this row; the burst is the read.

## Approvals

- plan-gate reviewer 4964e62b — APPROVE (2026-10-24)
- plan-gate reviewer fb54441e — APPROVE (2026-10-24)
- plan-gate reviewer 53f3e19e — APPROVE (2026-10-24) — plan✓3
