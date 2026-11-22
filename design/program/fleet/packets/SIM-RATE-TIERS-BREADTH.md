# SIM-RATE-TIERS-BREADTH: give every system the rate its job needs

Owner of this packet: sim performance (2026-11-22). Executor: Devin (mechanical breadth).
Goal: the sim worker's step in a round-6 / round-12 Foundry fight and in a dense Adventure sector
costs less because systems that only have to be recent stop running on every 60 Hz step.

## What the profile says (so you do not chase the wrong thing)

Function-level CPU profile of a round-6 Foundry fight, taken with
`node --cpu-prof --cpu-prof-dir=.devshots/sim-bench/prof scripts/bench-sim-fight.mjs --scene=swarm6`.
Shares of the worker's directive time:

| Owner | Share | Note |
|---|---|---|
| physics.update | 35 % | Rapier's own solve is 4 %. The rest is our JS around it: per-body pre-step and readback 12 %, body sync 5 %, impact receipts over the bus 5.5 %, projectile sweep 5 % |
| tacticalAI.update | 14 % | the decision pass (`ai/stack.js update`) is only 4 %; the other 10 % is per-step acting: squad frames, fodder cohorts, cohort drive, firing revalidation |
| fields._applyForces | 8 % | forces on every body in a field, every step (movement: stays every step) |
| bus.emit (all events) | 9 % | overlaps the rows above; impacts are the largest single source |
| read-model diff + vitals | 10 % | overstated in the bench (it diffs every directive; the worker diffs at most every 100 ms) |
| activity classification | 6 % | reused for 3 steps in Swarm since 6a3cb87f8f; every step in Adventure |
| weapons 3.6, lifetime sweep 2.9, plants 2.6, flight 2.5, lineHeads 1.8, tether 1.8, stunt 1.5 | | |

The profile is flat: the hottest single function is 2.2 % self time. There is no one function to
fix. The cost is (number of bodies) x (number of things that look at every body every step).

In Adventure (per-system table, opening sector, ms per step of a 16.9 ms step) the ambient and
faction systems that run every step add up to about 3 ms: world 0.99, plants 0.80,
reactiveMatter 0.38, choirResonance 0.27, vergeCourt 0.23, faction_meridian 0.22,
archiveRedaction 0.20, vaelLiens 0.18, massSignature 0.17, ilexArk 0.16, borrowedSun 0.15,
mining 0.14, faction_helix 0.14, understoryGardens 0.13, frontierHomesteads 0.13,
fulfillmentRoutes 0.13, lootShards 0.10, pitbornCull 0.08, secondRinse 0.08.

## The mechanism already exists. Use it; do not build another.

`src/runtime/authoritativeSystemManifest.js`:

1. `SYSTEM_CADENCE_TICKS` : `{ systemId: [periodTicks, phase] }`. The system runs on one tick in
   every N, on a fixed phase, and receives the elapsed sim time as `dt`. Six systems are on it
   today and are the worked examples: `npcJobsRuntime`, `aiEncounter`, `traffic`,
   `combatOutcome`, `lawSecurity` at `[6, phase]` (10 Hz) and `titles` at `[15, 5]` (4 Hz).
   Periods must divide 30 (so 2, 3, 5, 6, 10, 15, 30). `src/core/catchupPolicy.js` builds the
   per-tick queues from this table; nothing else needs to change.
2. `CALENDAR_CLOCK_IDS` : the 2 Hz calendar, already spread over three cohorts and sub-phases.
   For bookkeeping that is fine at half a second (economy, news, careers, contracts, law ledgers).
3. `strideDt(holder, key, dt, n, state)` in `src/core/catchupPolicy.js` : for ONE expensive scan
   inside a system that otherwise must run every step. Returns the accumulated dt when the gate
   fires, else 0; staggered by key.

Staggering rule: the phase is a constant in the table (or a hash of the key for `strideDt`),
never wall time, never `Math.random()`. For per-entity work inside a system use
`(state.tick + entity.id) % N === 0`. A missing cache (spawn, load) means "do it now".
Nothing about a tier may be saved: after a load every tiered owner simply runs on its next phase.

## What to move, in this order

Use section 2 of `.devshots/director/fable/audits/sim-hot-path-events.txt` (line 5572 on: all
228 systems with a class). Trust the class only after reading the system's `update`.

Batch A (Adventure ambient and faction owners, to `[6, phase]`, phases 0..5 round-robin so no
two heavy ones share a tick): choirResonance, vergeCourt, archiveRedaction, vaelLiens, ilexArk,
borrowedSun, understoryGardens, frontierHomesteads, fulfillmentRoutes, faction_meridian,
faction_helix, pitbornCull, secondRinse, massSignature.

Batch B (every system the audit marks `only-needs-recent` that is not already on a cadence or
the calendar): `[6, phase]` if it reacts to the player within a fight, `[15, phase]` or the 2 Hz
calendar if it is ledgers, news, careers, contracts, reputation, economy observers.

Batch C (`mixed` systems): do not move the system. Find the scan that only has to be recent
(an entity-list census, a ring test, an observer) and wrap that one call in `strideDt`.

Batch D (plants): `src/systems/plants/plantsRuntime.js` walks every plant with an `update` on
every step in both doors (2.6 % of a Swarm step for vignettes that are almost all Adventure
street life). Give each plant module a `modes` declaration (`['flight']`, `['swarm']` or both)
read from the plant's own guard (most start with a `run.kind === 'survival'` early return), and
have the runtime keep one list per mode. Do NOT hard-code a whitelist in the runtime: one was
tried and removed because nothing proved a missing plant was not needed in Swarm.

## What must never be tiered

- physics, flight / flightV3, input, weapons, projectiles, combat and damage, tether and line
  systems, fields (they apply forces), mines and bombs while armed, the lifetime sweep.
- Anything that writes `pos`, `vel`, `rot` or a physics command for a body the player can see.
- Anything with a tick-exact window (parry, hit-stop, i-frames, status expiry counted in ticks).
- Any system whose `update` ignores `dt` and assumes 1/60: fix it to use `dt` first, then move it.
- A system that consumes same-tick events from an every-step owner and must answer in the same
  tick. Bus listeners still fire when the event is emitted; only `update` moves.
- An enemy must still react to the player within 100 ms: nothing that decides a hostile's
  response goes slower than `[6, phase]`.

## Checks, per batch (not per system)

1. Focused tests for each moved system: `node --test test/<system>*.test.mjs`. A test that pins
   "runs every tick" for a moved system is rewritten to state the new rate in its message.
2. `node scripts/bench-sim-fight.mjs --scene=swarm6 --steps=1800 --hash` twice: the two hashes
   must match (determinism). Then `--scene=adventure` the same way.
3. `npm run check:sim`. A moved hash is expected for a batch that changes rates: re-record
   `test/47a.telemetry.save-v27.expected.json` once for the batch and say so in the commit
   (see commit a68e274458 for how the last re-record was done). If the hash moves for a batch
   that should not touch the 47a scene, that is a bug in the batch.
4. Numbers for the commit message: `node scripts/bench-sim-fight.mjs --scene=adventure --profile`
   before and after, the per-system rows you moved and the step mean / p95. Machine load swings
   several-fold here: run before and after back to back, twice, and quote both pairs.
5. `npm run check:playable` under the game lock before the commit.

## Second job: events requested from inside the step

Audit section B lists them: `toast` (285 sites), `audio:cue` (340), `comms:log` (160),
`comms:popup` (205), `economy:grantCredits` / `economy:chargeCredits` (71), `news:*`,
`faction:repDelta`. Each emit runs every listener synchronously in the middle of a system's
loop. `physics:impact` is the pattern to copy (`src/core/physics.js`, `_emitSg02ContactImpacts`):
receipts are collected during the step and delivered once, in order, capped per tick with
carry-over, and anything touching the player is never deferred.

Do it at the bus, not at 1,100 call sites: in `src/core/eventBus.js` (owned by `frame`: agree the
change there first) add a per-step deferred set for presentation-only event names
(`toast`, `audio:cue`, `comms:log`, `comms:popup`, `presentation:caption`). `emit` for those names
appends to a queue; the stepper drains the queue once after the last system and before the
lifetime sweep, in emit order. Sim listeners that must see one of these names in the same tick
are the exception list: grep every `bus.on('<name>'` in `src/systems`, `src/ai`, `src/combat`
first and keep any name with a sim-side listener synchronous. Economy credit events are NOT
presentation: they need an intents queue drained by the economy owner at its own slot, which is
a separate change with its own test (credits must land in the same tick as today).

## Known open items next to this packet

- Sleeping bodies: flag `s0BodySleep` in `src/core/simCoreFlags.js` is OFF because three tests
  fail with it on (shards not in flight after a detonation, Lantern Ward stand, prospector job).
  Each needs a wake where a system expects a resting body to move.
- A round-6 Foundry fight now carries about 60 credit chips and 25 payload pods as full dynamic
  Rapier bodies beside 9-13 ships. Pickups that only drift and get collected do not need a rigid
  body; that is a larger saving than any tier and belongs to sim performance, not this packet.
