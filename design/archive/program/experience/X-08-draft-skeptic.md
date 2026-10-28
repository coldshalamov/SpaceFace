# X-08 draft — The Skeptic

**Verdict.** I threw a rock into a pirate, it died, and nobody paid me. `canCarryThrowCredit` admits only
`ship`/`drone` (`tumbleStates.js:688-692`). A thrown rock, wreck or pod carries no impulse record, so the
kill's `killerId` is null: no burst, no bounty, no `stats.kills` (`combat.js:1068,1085-1098`). The sling pays
only when you happen to throw a hull. That is the 1-vs-45 spread.

**Proposal — credit the thrower through the record that already exists.**
1. In `canCarryThrowCredit`, also admit `asteroid`, `wreck` and `payload`. Keep the alive and not-player
   guards.
2. In `_onThrow` (`:285-326`), handle the flight hold for those types. `_beginFromImpulse` only tumbles ships
   and drones, so its hold never reaches a rock. Call `holdImpulseProvenance(victim, tick + 300, tick,
   throwTick)` (`impulseKernel.js:348`). 300 ticks (5 s) outlasts `IMPULSE_PROVENANCE_MAX_AGE_TICKS` 180
   (`:14`).
3. Nothing else changes:
   - `contactImpulseProvenance(a,b)` already takes the best record of *both* bodies
     (`collisionConsequences.js:759-761`).
   - So the victim's damage routes with `attackerId` = player (`:591`).
   - Combat's existing kill path then pays.

**Numbers.** No new table. Gun kills and physics kills pay alike (`killRewards.js:8-10`):
- wasp: light tier, one 40–90 cr chip plus scrap;
- reaver: heavy tier, three 90–180 cr chips plus materials, into the bay.

The sling becomes income because it now pays *at all*.

**Poke → reward.** Latch a rock, orbit, release into a raider: chips burst, the kill counts, and stunt grammar
may name it for a salvage-rights chit (`stuntGrammar.js:172-188`). Throw a rock into a lawful hauler and it is
your kill, witnessed and heated. That consequence is a promise kept too.

**Regression risk.**
- A friendly ricochet within 5 s names you. This is intended and matches the hull fling.
- A thrown rock that hits a claimed wreck now names you for claim law. Check the claim-jump code in
  `mining.js`.
- A held record on a non-tumbling body may need a quiet-latch wake.

Keep green:
- `tumble-fling-throw-attribution`, `tumble-fling-attribution`, `tumble-fling-chain`
- `throwable-credit-chip`, `wave-b10-throw-determinism`, `inf-034-single-death-single-pay`
- `physical-kill-causality`, `pq-028-01-sling-throw`, `tumble-states-quiet-latch`

New test: a player-thrown asteroid kills a hostile wasp, with `killerId === playerId` and exactly one burst.
