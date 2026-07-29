<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-019
leafId: PQ-019.mission-route
acceptance: focused_green
disposition: PASS
candidateCommit: 5f2c7137
-->

# PQ-019C — authored mission and public route

Branch `claude/pq019c-mission-20260728`, based at `2438b140`. Seven code commits. `candidateCommit`
above is `5f2c7137`, the final code commit; the commit carrying this receipt is docs-only and
necessarily follows it.

Write surface: `src/data/heistMission.js` and `src/missions/heistMissionRuntime.js` (new),
`src/systems/missions.js`, `src/systems/heistFacilities.js`, `src/data/missions.js`,
`src/data/heistFacilities.js`, five focused test files, one tuning matrix fixture, one tuning
runner, one registered broker manifest, and a single `check:pq019c:mission` line in `package.json`.
`src/core/registry.js`, `_saveCapturePlan()`, the save schema, and the program control plane
(`program-queue.json`, `NOW.md`) are untouched.

## Commits

| Commit | Subject |
|---|---|
| `8a40edd1` | `feat(heist): author the Tethys capsule-run contract and wire its mission runtime` |
| `3470d290` | `test(pq019c): prove the packet invariants inside missions.js` |
| `05bb6e8e` | `test(pq019c): reconcile save/reload at the nine named Phase E points` |
| `edcdbb00` | `fix(heist): unblock the second run, make escape flyable, bound an unlaunched contract` |
| `22d94c82` | `chore(pq019c): predeclare the fixed-seed tuning matrix before running it` |
| `1f6f649e` | `feat(pq019c): select tuning from the matrix, compose the theft cue, add the check line` |
| `5f2c7137` | `fix(missions): keep the authored heist row off the head of the board` |

## 1. What is claimed

### 1.1 One authored offer, on the ordinary board, unrollable by generation

`heist_intercept` is appended to `MISSION_TYPES` as the 11th entry while every `OFFER_MIX` row is
10 long. `missions._pickType` reads `weights[i] || 0`, so the type's weight is 0 at every station
type **without editing the mix table at all** — and because adding 0 does not change the weight
total, the procedural offer RNG stream is byte-identical. A sweep of 6 stations x 40 board epochs
(>50 generated offers) never produces the type.

`_pickType`'s float-rounding fallthrough was hardened as part of this: it returned
`TYPE_ORDER[length - 1]`, which after appending would have been the authored-only type, reachable on
a rounding miss with no `_rollOffer`/`_rollParams` case behind it. It now returns the last
**weighted** type, which is the same answer for every shipped mix row. `_rollOffer` refuses
`proceduralWeight === 0` as a second guard.

The offer reaches exactly one board through `_syncHeistOffer`, modelled on the live
`_syncEmbodiedStoryOffer` precedent — the closest existing shape for one authored row that must
survive board epochs, de-dupe against the active list, and never auto-accept. It is boardable,
acceptable via `ui:acceptMission`, and abandonable via `ui:abandonMission` through the shipped
flows. No other station board ever carries it.

Two authored-offer decisions that are load-bearing rather than cosmetic:

- **No `duration_s`.** `missions.update` calls `_expireMission` directly on `deadline_s`, which
  settles a mission with **zero terminal receipts** and breaks `terminalReceiptCount == 1`. The run
  window is an arbitrated `expired` CANDIDATE instead. A test asserts `_expireMission` never runs.
- **`collateral_cr: 0`.** `_completeMission` refunds collateral as a **second**
  `economy:grantCredits`, which would make `economyRewardCount` read 2 on a fenced success.

`abandonMission` is intercepted for the same reason: it called `_failMission` directly. Abandonment
is now a candidate in the arbiter's own vocabulary and competes with any physical fact already
reported — if the capsule was destroyed a tick earlier, that outranks the walk-away.

### 1.2 The wiring

`src/missions/heistMissionRuntime.js` maps facts published by owners that already exist onto the
arbiter's vocabulary. It is not a registered system: it has no slot in `UPDATE_ORDER` and
`registry.js` is untouched. Every entry point is called by `missions`.

| Packet row | Live seam consumed | Candidate produced |
|---|---|---|
| schedule / launch | `heistFacilities.requestLaunchSchedule`, `heist:capsuleLaunched` | phase `launched`; a denial becomes `unresolved_absent` |
| latch (possession) | **existing** `tether:latched` / `tether:released`/`cut`/`broke` | `possession` |
| law | `lawSecurity.reportIncident` (stable `reportId` per mission) | — (receipt journalled at terminal) |
| pursuit | `npcJobsRuntime.claimControl` / `releaseControl` on real job-origin patrols | — |
| escape | distance to the nearest live leased responder | phase `escaped` |
| catcher | `heist:facilityCandidate` (`lawful_catch_contact`) | `lawful_arrival_observed` **or** `lawful_confiscation` |
| fence | `heist:facilityCandidate` (`fence_contact`) | `fenced_success` |
| destruction | `entity:destroyed` on the capsule | `payload_destroyed` |
| expiry | authored run window from `launchTick` | `expired` |
| absence | capsule gone, or reload, or accept-window elapsed | `unresolved_absent` |
| abandonment | `ui:abandonMission` | `abandoned` |

**Both arbiter preconditions are satisfied structurally, not by convention.** Registry order is
`lawSecurity(170) < physics(177) < tetherGameplay(197) < heistFacilities(222) < missions(246)`, so
every candidate-producing event for tick T is emitted before `missions.update` runs for tick T —
submit always precedes step. `causalTick` is taken from the causing event (`receipt.tick` on a
custody contact, `launchedAtTick` on a launch, the live tick at the synchronous instant of a latch
or destruction), never from a cached clock.

**Mapping a physical contact to a legal outcome is mission policy, deliberately.** The arbiter
refuses to know what a fence is. `lawful_catch_contact` is a lawful ARRIVAL if nobody ever took the
capsule and a CONFISCATION if somebody did; a fence contact without prior possession is refused
outright, so a physics fluke cannot pay out a theft nobody committed.

**Pursuit takes leases but never writes intent.** `scanner.js:1024` shows the shipped lawful AI
already engages a WANTED player with no dispatch marker at all. A witnessed theft yields an accepted
law receipt, the heat owner consumes it through its own private path, the player crosses the WANTED
threshold, and the existing tactical AI becomes the one steering writer with zero mission
involvement. The lease's job is the other half: it suspends the patrol's own job intent so its route
does not drag the hull off an intercept. Leases are taken **only** when law reports
`responderAvailability: 'available'` — a lease over a hull nobody steers is a frozen patrol, so that
gate is load-bearing. `none_in_range` takes no lease, is recorded in law's own visible ledger, and
is spoken to the player. A test asserts no `patrol_lawman` is ever manufactured.

### 1.3 Settlement through existing owners

`fenced_success` routes to `_completeMission`; every other terminal routes to `_failMission`. This
module calls neither economy nor factions. Each owner effect is guarded by its own idempotency key in
the arbiter's durable journal, and `missionSettlement` is taken **before** the call, so a synchronous
re-entry finds it spent.

`heistFacilities.releaseSchedule` was added (in the bounded write set as the physical
payload/receiver owner) and is called only after a committed terminal receipt — see §5.1.

## 2. The invariant table — measured IN `missions.js`

PQ-019B proved each count reachable exactly once through the effect journal using a stand-in
consumer, and its receipt explicitly did not claim the mission layer. This is that row.

`test/pq019c-heist-mission.test.mjs` reads every count as a **real side effect** — `missions.js`'s
own bus emissions, heat's durable applied-incident ledger, live capsule entities, live job claims,
cargo and sector-ownership diffs — and asserts the arbiter journal agrees as a second, independent
reading.

| Invariant | fenced_success | lawful_arrival | lawful_confiscation | payload_destroyed | expired | unresolved_absent | abandoned |
|---|---|---|---|---|---|---|---|
| `terminalReceiptCount` | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `terminalStatus` | committed | committed | committed | committed | committed | committed | committed |
| `capsuleProjectionCount` | 1 | 1 | 1 | 1 | 1 | 1 | 0 |
| `receiverCommitCount` | 1 | 1 | 1 | 0 | 0 | 0 | 0 |
| `missionSettlementCount` | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `economyRewardCount` | **1** | 0 | 0 | 0 | 0 | 0 | 0 |
| `factionOutcomeCount` | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `heatApplicationCount` | 1 | **0** | 1 | 1 | 0 | 1 | 0 |
| `playerCargoMutationCountForCapsule` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `sectorOwnershipMutationCount` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `activeJobControlClaimsAfterTerminal` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

`economyRewardCount == (outcome == fenced_success ? 1 : 0)` and
`heatApplicationCount == (validatedWitnessedTheft ? 1 : 0)` both hold: the lawful-arrival column has
no theft, so no heat; the expired and abandoned columns in the suite are driven without possession.

Adversarial coverage in the same suite: duplicate same-tick facility contacts, a late
higher-precedence report after the journal froze (refused, receipt byte-identical), three replayed
settlements (every counter unchanged), and a forged `law:reportIncidentReceipt` that never went
through `lawSecurity` (heat unmoved, ledger empty).

**Measurement basis, stated rather than implied.** The integration scene registers neither `economy`
nor `factions`, so `economyRewardCount` and `factionOutcomeCount` are proven at the **request**
boundary — the events `missions.js` emits — which is the same basis PQ-019B used. Applied credits
and applied reputation are those owners' own proven behaviour, not re-proven here.

## 3. Phase E — save/reload at the nine named points

`test/pq019c-heist-save-reload.test.mjs` boots a **fresh, empty world** per point and hands it only
the serialized bytes. That is what a real load looks like here: `state.heistFacilities` and
`state.lawSecurity` are not in the save capture plan and the capsule is transient, so on the far side
there is no schedule, no capsule, no custody record and no handoff. Deserializing into the same live
scene would keep facility state the real game would have lost and prove nothing.

| # | Point | Reconciliation | Payout |
|---|---|---|---|
| 1 | before launch | `reschedule` — re-requests the window, produces exactly one real capsule | 0 |
| 2 | after launch | `absent_after_reload` -> `unresolved_absent` | 0 |
| 3 | after possession | `absent_after_reload` -> `unresolved_absent` | 0 |
| 4 | during pursuit | `absent_after_reload`; lease absent from the snapshot; claims 0 after | 0 |
| 5 | after escape | `absent_after_reload` -> `unresolved_absent` | 0 |
| 6 | receiver prepared | `resumed_receipt` — the SAME receipt; reservation lost, decision kept | **1** |
| 7 | terminal prepared, nothing applied | resumes the same outcome (`lawful_confiscation`) | 0 |
| 8 | post-commit, pre-mission-event | settlement completes, capsule never re-consumed | **1** |
| 9 | missing projection | `arbiter_refused` — fails closed, no second receipt minted | 0 |

Plus: a mangled subrecord still settles rather than stranding; the same save reloaded twice reaches
an identical outcome and pays once each.

**The payout rule, stated plainly.** A `fenced_success` receipt that predates the save still pays
exactly once on resume. That is not a fabrication — the terminal receipt is the proof the capsule was
physically delivered, and resuming it is the packet's own "a crash after prepare resumes the same
receipt" guarantee. What is never fabricated is a payout with no decided receipt; the five
mid-flight points settle at zero.

**The STOP RULE was never reached.** `heistFacilities` and `lawSecurity` were **not** added to
`_saveCapturePlan()`. No new top-level save key, no schema bump: the heist subrecord nests inside a
`missions.active[]` entry, which `serialize()` already carries via `{ ...rest }`. `check:save-schema`
is **version 12, 274 paths, unchanged**. The capsule not surviving a reload is a design consequence,
recorded with the reconciliation rule beside it rather than papered over.

## 4. Tuning

`test/fixtures/pq019c-tuning-matrix.json` was committed at `22d94c82` **before**
`scripts/tune-pq019c-heist.mjs` existed, so the search space could not be back-fitted. The runner
measured the world, applied each dimension's stated objective, and selected once. Values are pinned
by `test/pq019c-heist-tuning.test.mjs` (13 tests), which also re-derives the relationships the
objectives depend on, so a number changed without re-running the matrix fails.

Measured: launcher->catcher `2040.47 WU`, catcher->fence `1920.61 WU`, Tethys station->launcher head
`2433.2 WU`, live authority `responderCap` 2, risk-tier-3 board maximum `1320 cr`.

| Dimension | Authored | Selected | Why |
|---|---|---|---|
| `launchSpeed` | 120 | **100** | 120 put the capsule at the catcher in 17.0 s, under the 20 s floor for the leg to be a plan rather than a reflex. 100 is the fastest candidate clearing it, at 20.4 s. |
| `capsuleMass` | 180 | **180** (confirmed) | 7.5x the player hull; no candidate changes the ratio band. |
| `launchWindowS` | 45 | **30** | Smallest candidate clearing the measured 17.4 s approach with 25% margin. |
| `runWindowTicks` | 9000 | **6000** | Full route is 40 s at 100 WU/s; 2x margin needs >= 4754 ticks. Cannot expire a run still being flown. |
| `witnessRadius` | 450 | **550 recorded, NOT applied** | See below. |
| `responderLeaseCap` | 2 | **2** (confirmed) | = the live authority policy's own cap. |
| `escapeRadiusWu` | 1800 | **1800** (confirmed) | Largest candidate under 95% of the 2040 WU leg, so breaking contact happens inside the route. |
| `responderLeashWu` | 2600 | **2600** (confirmed) | 800 WU above the escape radius; a leash that released first would make pursuit decorative. |
| `escapeHoldTicks` | 180 | **60** | Smallest candidate >= 1 s, so one lucky frame is not an escape. |
| `payoutCr` | 2400 | **1800** | Smallest candidate in the `(1320, 2640]` band: above the best honest risk-3 work, since this run costs heat, a WANTED flag and a real chance of losing the capsule, without making every other contract pointless. |
| `recoveryPayoutCr` | 1100 | **900** | Nearest candidate to half the selected payout. |
| `unlaunchedWindowTicks` | — | **3000** | Derived: 30 s window = 1800 ticks, +35%, rounded to 600. |

**One selection is deliberately not applied.** The matrix's own objective selects witness radius 550.
`lawSecurity` owns `LAW_INCIDENT_WITNESS_RADIUS`; PQ-019B set it to 450 after finding the gate goes
**vacuous** above the 600 WU lawful-station protection floor, and its annulus test pins that band.
Raising an owner's constant from a consumer packet is a shared-change request, not a tuning edit, so
550 is recorded as `witnessRadiusMatrixSelection` and 450 ships. The mirror is asserted against the
live constant, so a drift on either side fails loudly. **Open row for the integrator.**

**A measurement defect was fixed before selecting, and is recorded rather than hidden.** The runner's
first version projected the authored socket into sector-local space and then added a non-existent
`state.world.originX`; the sum went `NaN`, `|| 0` swallowed it, and "distance to the launcher" was
really the distance to the world origin — 15855 WU instead of 2433. Run 1's launch-window and
run-window numbers came from that broken measurement. It now measures live entity to live entity.
**Run 2 is the selection of record**; run 1 is void.

## 5. Defects found by running it

Five, each pinned by the test that caught it.

**5.1 The first capsule run permanently owned the launcher.** `requestLaunchSchedule` denies any
`scheduleId` that is not the live one, and nothing ever cleared `owned.schedule` —
`_dematerializeSector` and `commitReceiverHandoff` both preserve it deliberately so sector re-entry
can resume a run in progress. Every later mission carries a new stable id, so the **second accepted
contract**, and every reduced-stake recovery (a new mission by construction), died on
`active_schedule` before launching. `owned.receiverHandoff` had the same shape.
`heistFacilities.releaseSchedule` is now the one thing that clears either, called only after a
committed terminal receipt, idempotent. Invisible to 26 green tests because each accepted one run per
scene.

**5.2 `escaped` was unreachable in play.** `_updatePursuit` returned early on an empty lease set —
but the leash branch is what empties it, so from the next tick the guard fired before
`escapeHoldTicks` could accumulate and the counter froze at 1. Breaking contact is the whole point of
the escape route, so the one state it produced was the one state that could not latch. Escape now
gates on whether a pursuit ever started; no pursuer left inside the leash **is** the escaped
condition. The test flies it with nothing hand-set.

**5.3 Accepting and never launching was unbounded.** The clock block sat entirely behind
`launchTick`, and `heistFacilities.update` deliberately preserves an unlaunched schedule outside
Tethys — so a player who accepted and left had a contract with no deadline, no expiry and no absence,
permanently active. An accept-side window closes it. Abandonment being *available* is not the same as
the run being bounded.

**5.4 A clean despawn was reported as destruction.** `entity:destroyed` is the generic "left the
world" event `coreSystem.lifetimeSweep` queues for TTL, `despawnAt` and any `removeEntity` call. The
facility owner removes its transient capsule on sector exit, so a player who simply flew out of
Tethys was told the capsule had been DESTROYED. Destruction and absence are now told apart by an
explicit sector-exit marker; they rank differently in the arbiter's precedence chain, so the wrong
one would have been repeated in the settlement receipt.

**5.6 The authored row displaced a story row at the head of the board.** `_syncHeistOffer` and the
epoch-retention list both put the heist offer at the FRONT of the Tethys board. `station_tethys` is
an MTS branch station, and `check:mission-standing-ladder` asserts a branch station leads with its
tagged B4 intro contract — both on a fresh board and on a same-epoch cached board after story
advancement. The check was **green at `2438b140` and red on this branch**, so it was mine, not
inherited; found by running the whole `check:mission-*` family rather than the subset that looked
relevant. Fixed by appending in both places, after `_generateOffers` in the rebuild path: a standing
black-market contract is not story progress and must never take the slot the board leads with.

**5.5 Two save-boundary defects.** `restore()` stamped its `unresolved_absent` report with the live
world clock while the arbiter restores its own `decidedThroughTick` from the save — whenever the
clock had not caught up the report was refused `stale_tick`, leaving a run with no terminal candidate
at all, an invisible mission soft-lock. The stamp is now floored at the arbiter's own clock, correct
under either deserialize order (`saveSystem` restores `state.tick` from the entity payload, so
whether it leads or trails `missions.deserialize` is the save owner's property). Separately,
`serialize()` was persisting the job-control lease rows, which PQ-019B deliberately does not persist:
after a load every job is virtualized and every `entityId` nulled, so a restored lease names a hull
that does not exist and a controller that no longer does.

## 6. Cues

Eight named families, through existing surfaces only, pinned by `test/pq019c-heist-cues.test.mjs`
(13 tests) driving the **real** `voiceArbiter`.

Every family below is ASSERTED by a test, not merely present in `HEIST_CUE_TEXT`: timing
(`accepted`, `launched`), ownership (`possessed`), witness + WANTED + pursuit (one composed line),
denial (`theft_unwitnessed`, `theft_witnessed_no_patrol`, and the launcher `denied` line when a
competing schedule already owns the launcher), catcher/fence (`lawful_arrival`, `fenced`,
`confiscated`), the remaining outcomes (`destroyed`, `expired`, `absent`, `abandoned`), `escaped`,
and `recovery`.

**Witness, WANTED and pursuit are one line, not three — and that is a defect the arbiter caught.**
All three are decided inside one call in one tick. Emitted as three lines under one stable voice id
they COALESCE IN PLACE (`VoiceQueue` replaces a same-id entry rather than stacking it), so the player
saw only the last and two real facts were silently discarded — verified against the live arbiter
before it was composed. Three different ids would instead put three pills on a floor meant to hold
one. Composing is the only option that is both one-voice compliant and truthful.

Properties asserted: the voice queue never exceeds one entry across a whole run; every surfaced line
carries `id = pq019c:capsule-run` at `CHANNEL_PRIORITY.objective` (60) and never claims danger (110);
every moment fires at most once no matter how long the run is driven; every line reads as a sentence
with no colour word carrying meaning; the cue path emits no `presentation:vfxCue` and spawns no
presenter, so reduced-motion safety is inherited from the existing floor rather than re-invented;
cues are flight-only (docked, the world still runs and the crime is still logged — only the pill is
suppressed, matching PQ-019A's rule); and with no `voiceArbiter` registered the owner receipt still
fires, so the cue is observable headlessly.

**The ownership marker is asserted too, not just smoke-covered.** The nav waypoint is the one
player-visible part of this feature that is not a voice line. `_missionWaypoint` runs on every accept
via `trackMission`, so "it does not throw" was already covered; a test now asserts it points at the
launcher before launch, at the live capsule in flight, and at the fence once the capsule is in tow,
reverting to the capsule on release. It resolves the authored DOCK-APPROACH SOCKET rather than the
facility centre — the same projection `heistFacilities._spawnFacilityHead` uses — so the marker sits
on the physical head the capsule has to touch rather than a few WU off it; asserted to within 1 WU.

**Recorded interaction, not a defect:** `missions.trackMission` enqueues its own "Tracking: …" line
(`objective:tracked`) at the same `objective` priority on accept, and the queue resolves equal
priority by insertion order. Heist lines therefore wait behind it rather than shouting over it —
the arbiter working as designed. The test drives the floor until it frees before asserting a surface.

## 7. Recovery

Implemented, tested with the flag on, and **shipped off** — the packet's balance section mandates
nothing, and "at most one" is satisfied most cheaply by not posting one. Policy travels on the
contract (`offer.params.recoveryEnabled` -> `record.recoveryAllowed`) rather than being read from
frozen shared tuning at settlement time, so it survives the save with the contract that was accepted
and is testable without mutating global state.

Bounded three ways: attempt 0 only, recoverable outcomes only (never a completed fence run), and only
onto a board carrying no heist row. With the flag on, the retry is a real playable run at half stake
that itself grants no further recovery.

## 8. Gates

| Gate | Result |
|---|---|
| `npm run check:pq019c:mission` | **PASS — 65/65** across five suites |
| `npm run check:pq019b:seams` | **PASS — unchanged, 91/91** |
| `npm run check:pq019a:facility-embodiment` | **PASS — unchanged, 19/19** |
| `npm run check:sim:compare` (before any edit, at `2438b140`) | `hashEqual: true`, `firstDivergentTick: null` |
| `npm run check:sim:compare` (final tree) | **`hashEqual: true`, `firstDivergentTick: null`** |
| `npm run check:save-schema` | **OK — version 12, 274 paths, unchanged** |
| `npm run check:npc-jobs` | PASS (convergence proof intact) |
| `npm run check:mission-conditions` | PASS |
| `npm run check:mission-receipts` | PASS |
| `npm run check:mission-board-recommendation` | PASS |
| `npm run check:mission-preflight` | PASS |
| `npm run check:mission-handoff` | PASS |
| `npm run check:mission-navigation` | PASS — owns `_missionWaypoint`, which this packet edits |
| `npm run check:mission-standing-ladder` | **PASS — was a real regression, see §5.6** |
| `npm run check:mission-log-map` | PASS |
| `npm run check:mission-log-contract-terms` | PASS |
| `npm run check:one-voice` | **PASS — 16 sections** (repaired on master today; stays green) |
| `npm run check:audio-identity` | **PASS** (repaired on master today; stays green) |
| `node --test test/content-census.test.mjs` | PASS 5/5 (the new mission type satisfies `authored-type` evidence) |
| `npm run check:baseline` | **PASS — 10/10 green in 74130 ms**, 15870 ms under the 90000 ms budget |
| `node --check` on every changed module, `git diff --check` | clean |

PQ-019C adds no baseline link; the new focused check is explicit.

**Golden safety.** The feature is naturally inert in the 47a golden scenario: the authored offer is
posted only on the Tethys board, no golden mission carries a `heist` subrecord, procedural weight is
zero and adds no RNG draw, and the `heist` key is added by conditional spread on the `clauses`
precedent so every non-heist instance gains no key at all — which is what keeps the `--reload-at 600`
reload comparison byte-identical.

### Inherited reds — A/B'd at the base commit, proven not mine

- **`check:economy:anti-exploit`** — RED at base and RED now, same failing case
  `field_contract_dedupe`. Untouched surface.
- **`check:mission-cargo-loading`** — RED at base and RED now with a **byte-identical signature**:
  same file, same line `scripts/check-mission-cargo-loading-runtime.mjs:226`, same `stationTab`
  assertion, same message *"station missions tab should exist"*. Checked deliberately because this
  packet changes `ensureBoard` retention and puts a new offer type on `station_tethys`, which is that
  script's surface — the signature did not move, so it did not become mine.
- **`check:mission-log-map:runtime`** — RED at base and RED now, same assertion *"tracked
  recommendation should render a Star Map button"* at
  `scripts/check-mission-log-map-runtime.mjs:176`. A/B'd by checking out `2438b140` and re-running.
- **`check:art`** — inherited per the packet brief; not run, not used as acceptance evidence, and
  untouched by this change surface.

All ten `check:mission-*` suites that own a surface this packet touches were run, not a subset.

## 9. Open rows after Phase H1

H1 evidence: [`../evidence/h1/row4-pq019-surface-heist/EVIDENCE.md`](../evidence/h1/row4-pq019-surface-heist/EVIDENCE.md).

The registered `pq019-surface-heist` manifest consumed its one permitted headed Browser acceptance
launch at fixed seed `19019`. Its four deterministic fast gates passed before claim issue. The route
then completed two contexts and stopped in the third:

- **Station DOM accept + Mission Log abandonment: CLOSED / FUNCTIONAL PASS.** The visible station
  Missions controls created active mission `m_2`; `KeyJ` opened the ordinary Mission Log; the danger
  confirmation exposed `role="dialog"`, `aria-modal="true"`, labels/descriptions and safe initial
  focus on Cancel; confirming committed one `abandoned` receipt and one settlement.
- **Lawful-observe route: CLOSED / FUNCTIONAL PASS.** A live capsule reached the production
  `physics:impact` seam at the lawful catcher and committed `lawful_arrival_observed`. The one visible
  floor carried the complete outcome sentence under stable id `pq019c:capsule-run`, with queue size
  one and no mirrored toast.
- **Heist-plus-fence and the remaining named routes: OPEN — H1 FAIL / HARNESS.** The third context
  timed out at `waitForCapsule()` after 20,000 ms. That actor waits on transient
  `state.heistFacilities.capsuleEntityId` using wall time but did not persist simulation-clock,
  schedule, launch, mission-heist or competing-terminal state on failure. The saved frame remained on
  the pre-launch objective. Because the same attempt had already completed a live-capsule route on a
  real Intel/ANGLE D3D11 renderer with no page errors, this is classified HARNESS rather than PRODUCT
  or ENVIRONMENT. Per the one-attempt rule it was not retried. `fenced_success`,
  `lawful_confiscation`, production-combat `payload_destroyed`, reduced-stake recovery, and the
  composed witnessed-theft/WANTED/pursuit line remain unproven.
- **Accessibility route review: PARTIAL.** Dangerous-confirmation semantics and safe focus passed;
  the lawful outcome carried meaning in text. The reduced-motion recovery context was never reached.
- **Electron route acceptance: OPEN.** The PQ-019C cell was Browser-only; no PQ-019C Electron route
  was requested or run in H1.
- **Independent human visual/fun verdict: BLOCKED.** The lawful outcome and DOM frames are available,
  but the full five-route sequence is not. H2 carries this as functional status inside the existing
  PQ-019A facility/capsule decision, not as a seventh human-review decision.
- **Matched performance: OPEN — H3.** No frame p95/p99, hitch measurement, or speed claim is cited.
  The broker process duration is marked informational/contended and is not evidence.

Also open, and recorded above rather than buried:

- **Witness-radius delta.** The matrix selects 550; `lawSecurity` ships 450. Applying it is a
  shared-change request against PQ-019B's owner constant and its annulus test, and is the
  integrator's call.
- **The capsule does not survive a reload.** A design consequence of `heistFacilities` not being in
  the save capture plan, reconciled by the explicit rule in §3 rather than by save-plan surgery. If a
  future consumer needs the capsule durable in its own right, that is the STOP RULE — a new top-level
  save key and an integrator decision.

Per the PQ-019A ruling, unchanged: this route is Tethys-only and excludes Ceres, so it produces no
Cathedral damage/recovery claim. That proof stays with `PQ-023.gold-corridor-required-cues`.

## 10. Disposition

**PASS** on the packet's headless claims. The authored offer reaches the ordinary Tethys board, is
accepted and abandoned through shipped flows, and cannot be procedurally rolled. Every packet
invariant holds in `missions.js` across all seven terminal outcomes, measured as real side effects.
All nine Phase E save points reconcile to exactly one capsule or a bounded
`expired`/`unresolved_absent`, and no undecided outcome ever pays. Tuning was selected once from a
matrix predeclared before the runner existed, with the one out-of-scope selection recorded and
refused. The current focused gate is 65/65; `check:pq019b:seams` and
`check:pq019a:facility-embodiment` remain green; `check:sim:compare` is `hashEqual` and the save schema
is byte-identical.

Phase H1 does **not** upgrade the five-route acceptance claim. Its one Browser attempt proved the real
DOM abandonment and lawful-observe routes, then failed **HARNESS** before heist-plus-fence and never
reached confiscation, destruction or recovery. The failure and all surviving evidence are carried in
§9 rather than smoothed over; H3 performance and the remaining headed rows stay open.
