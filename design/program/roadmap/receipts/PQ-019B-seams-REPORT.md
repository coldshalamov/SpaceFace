<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-019
leafId: PQ-019.owner-seams
acceptance: focused_green
disposition: PASS
candidateCommit: f2c6023e221c8f51cacf33fbd65552c0db005d87
-->

# PQ-019B — pure outcome arbiter and four owner seams

Branch `claude/pq019b-seams-20260728`, based at `64840077`. Seven commits, 5 source files, 6 test
files, one `package.json` line. `src/core/registry.js`, the save schema, queue/global ledgers, and
the shared HUD/style surfaces are untouched.

## 1. Live-symbol audit

The packet requires role names to be replaced with exact live symbols before PQ-019B is `ready`.
Where the live shape contradicted the packet's assumed seam, the live symbol won and the delta is
recorded.

| Packet role | Exact live owner | Live shape found | Delta / adaptation |
|---|---|---|---|
| Law / security | `lawSecurity` — `src/systems/lawSecurity.js`; jurisdiction via `protectedStationAt` (`src/ai/engagementAuthority.js`), responder ranking via `rankLawfulResponders` + `authorityResponsePolicy` (`src/law/authorityResponse.js`) | `state.lawSecurity = { version, incidents, receipts[24], nextAmbientScanTick, nextIncidentTick }`. `_openIncident` keys `${stationId}:${attacker.id}` | **Three deltas.** (1) `_openIncident` keys on a LIVE ENTITY ID, which is not stable across save/load, so it cannot answer "already logged?" — the seam is a separate entry point keyed by a caller-supplied stable `reportId`. (2) `_openIncident` → `_dispatchIncident` → `_respondersFor` **spawns** `patrol_lawman` when `reserveAllowed`; the seam never calls it, so "never spawn a fake responder" is structural. (3) **There is no witness owner anywhere in the codebase.** Jurisdiction and responder ranking exist; witnesses do not. Introduced, not reused — see §2a. |
| Heat | `heat` — `src/systems/heat.js`; private mutation path `_raise` / `_setHeat`; canonical scalar `state.player.heat` | Bus-driven only (`entity:killed`, `combat:damage`, `contraband:scanned`, `faction:aggro`, `heat:clear`). **No durable applied-key ledger of any kind** | Exactly-once needed a durable store. `state.player` is serialized wholesale (`_serializePlayer` = `clonePlain(player)` minus cargo), so a lazily-created `player.heatIncidentsApplied` persists with **no schema change**. |
| NPC job runtime | `npcJobsRuntime` — `src/systems/npcJobsRuntime.js` (PQ-014); sole writer of `state.npcJobs`; owns its own `serialize()`/`deserialize()` | One-intent-writer-per-hull is enforced by `_drive` writing `data.intent` and producers yielding for `data.jobId`. `deserialize` virtualizes every job and **nulls every `entityId`** | The lease gates `_drive` and `_reconcileThreat` only; `advance` keeps running (see §2c). Because restore leaves no hull and no controller, the lease is deliberately **not persisted**. |
| Physical payload / receiver | `heistFacilities` — `src/systems/heistFacilities.js` (PQ-019A) | Sole owner of the capsule entity and of `state.heistFacilities`; emits schedule / launch / custody-candidate receipts | **The receiver substrate for this packet is `heistFacilities`, not the PQ-017 `worldSiteKernel` receiver grammar.** The world-site receivers (`receiverId`/`payloadId` operations) are a different, site-settlement substrate that never handles this capsule. Only `heistFacilities` can physically consume it. |
| Mission owner (for PQ-019C) | `missions` — `src/systems/missions.js`; `serialize()` at :4276, `deserialize()` at :4301 | `active[]` entries are serialized via `{ ...rest }` — **arbitrary durable subrecords survive**. Precedent already in-file: "Sidecar lives inside already-serialized `state.story` — migrate/init without save schema change" | The arbiter record is plain JSON by construction and nests inside an active-mission entry with no schema change. Wiring is PQ-019C's. |
| Save owner | `save` — `src/save/saveSystem.js`; `_saveCapturePlan()` / `serializeData()` | **`state.lawSecurity` and `state.heistFacilities` are NOT in the capture plan.** Neither persists today | Drove the whole durability design: nothing that must survive reload was placed in either. See §4. |

## 2. What each seam does

### Pure arbiter — `src/missions/heistArbiter.js` (`b881fa5f`)

Imports exactly one repo symbol (`hash32`). No bus, renderer, entity, economy, law, heat, mission, or
save contact. Transition validator (forward-only progress chain, `resolution_pending` short-circuit,
immutable `terminal`), candidate normalizer to the packet's exact schema, deterministic selector,
terminal compare-and-set, and an effect journal with per-slot idempotency keys.

Two rules the packet left open are **decided and recorded rather than silently interpolated**:

- **`abandoned` ranks last.** The packet lists seven terminal outcomes but only six in its precedence
  chain; `abandoned` appears nowhere in it. It is the weakest claim — any physical fact, and even a
  bounded timeout, describes something that actually happened to the capsule. The first six are
  encoded verbatim and pinned pairwise.
- **Across ticks the earliest causal fact wins.** The packet pins precedence only "at one tick".
  Earliest-first is the only rule that makes the `causalTick + 1` buffer meaningful rather than
  decorative, and it is the truthful one: a destruction report stamped 105 cannot overturn an expiry
  that happened at 100.

**Defect 1, caught by the permutation suite before integration:** the first draft ranked terminal and
nonterminal candidates in one sort. An earlier `possession` (tick 40) then suppressed a later
`lawful_confiscation` (tick 41) purely because earliest-causal-first put the nonterminal report at the
head of the list — stranding a decided heist in `possessed` forever. Terminal and nonterminal are now
separate lanes, which is what "nonterminal possession applies only when no terminal candidate wins"
actually means.

**Defect 2, caught in adversarial review AFTER all six suites were green — the most serious one in
this packet.** `restoreArbiter` restored `phase` and `receipt` independently. A snapshot with
`phase: 'terminal'` whose receipt was dropped or unreadable (`receipt: null`, `outcome: 'jackpot'`,
blank `receiptId`) came back **unfrozen**: `submitCandidate` saw no receipt, accepted new candidates,
and `prepareTerminal` minted a **second receipt with new effect keys** that no longer matched the
effects already applied — every owner effect re-applied, possibly under a different outcome. Verified
by direct repro before and after. The fix is one fail-closed condition: if the phase claims a
decision was reached and no receipt validated, refuse the whole record and let the consumer treat it
as the unresolved case it is. Seven tampered shapes are now pinned, plus the inverse — a genuinely
undecided arbiter (no receipt by definition) must still restore, or every mid-flight heist strands
on load.

### Two preconditions PQ-019C must honor

Selection is order-independent and proven so. **Admission and stamping are not**, and neither can be
enforced from inside a pure module. Both are pinned by tests and stated in the module header:

1. **Within a tick, submit before you step.** `stepArbiter(T)` closes admission through `T - 1`,
   after which a report stamped `T - 1` is refused `stale_tick`. A consumer that steps first and
   polls second drops exactly the reports it was polling for, and the heist falls through to
   `expired` with no terminal ever selected. The drop is recorded in `rejected[]` rather than silent,
   so it is diagnosable — but it is still wrong.
2. **Stamp `causalTick` from the causing event, never a cached or current clock.** Because the
   earliest causal fact wins across ticks, a low `causalTick` is a **privilege**: an under-stamped
   late report outranks a newer, truer fact. Pinned by a test where an `abandoned` report stamped 60
   beats a `payload_destroyed` stamped 100.

### 2a. Law intake — `lawSecurity.reportIncident` (`49339e01`)

Validates jurisdiction (`protectedStationAt`) and witnesses, returns one idempotent receipt per
stable `reportId`, and refuses with an explicit reason otherwise (`invalid_report`,
`no_jurisdiction`, `no_witness`). Responders are **ranked from what already exists**;
`responderAvailability: 'none_in_range'` is a first-class recorded outcome with a visible
"no patrol in range" row in law's own receipt ledger. The seam never steers or authorizes anyone —
enlisting a patrol is seam 2c's job.

**Defect the focused suite caught:** the witness gate was **vacuous**. A lawful station is itself a
lawful witness, so with a witness radius above the 600 WU lawful-station protection floor, every
in-jurisdiction position was automatically witnessed and the gate could never deny. `LAW_INCIDENT_WITNESS_RADIUS`
is now 450 WU — deliberately under the floor — and the suite pins the annulus where a theft is inside
the law's ring but genuinely unseen, and fails if a future edit raises it back above the floor.

**Second law defect caught:** the reported-incident ledger materialized on *denied* reports. Any key that
appears on one leg of the golden save/restore comparison and not the other is a hash divergence
waiting to happen. It is now created only when an accepted receipt is actually stored.

### 2b. Heat listener — `heat.applyIncidentReceipt` (`ff47d0bd`)

Listens for `law:reportIncidentReceipt` and consumes an accepted, law-signed, witness-validated
receipt exactly once through the private `_raise` path every other heat source already uses.
**There is no mission-side heat write anywhere in the chain**: a mission reports a crime to law, and
cannot reach `player.heat` even if it wants to, because the only door needs a receipt it cannot sign.
Priced at 0.22 for `payload_theft` — between a contraband bust (0.16) and a piracy kill (0.28) — with
a 0.12 fallback so a future crime type is never silently free.

**Measurement defect caught in review:** the invariant suite originally counted `heatApplicationCount`
from `heat:changed` events. `_raise` **throttles** emission — it fires only on a WANTED-threshold
crossing or after 0.4s — so an event counter reads 0 for a real application whenever the player was
already wanted, and would have passed the `== 0` assertion for a theft that genuinely charged heat.
Every scenario passed only because heat started at 0 and 0.22 crosses the 0.15 threshold. The counter
now reads heat's **durable applied-incident ledger** (the record of what was applied, rather than a
throttled notification about it), all ten scenarios assert identical numbers under the corrected
counter, and a new scenario covers the hidden regime: an already-WANTED player at heat 0.5, where the
theft charges heat with no `heat:changed` event at all.

### 2c. Job control leases — `npcJobsRuntime.claimControl` / `releaseControl` (`ff47d0bd`)

Lets a pursuit borrow the hull of a real, already-flying patrol job. Idempotent per `claimId`; a
different key is refused while a claim is live, which is the one-writer-per-hull rule enforced rather
than documented.

The lease suspends **intent writing only**. `advance` keeps running: suspending it would stop the
job's clock and break the offscreen≈onscreen convergence proof in `npc-jobs-runtime-convergence.test.mjs`,
and the patrol's schedule did not pause because it got pulled onto an intercept.

Two failure modes closed by construction:

- A job completing while leased is **not** dropped from the bag. Dropping it deletes `data.jobId`, the
  ambient stepper adopts the hull, and two owners write its intent at once. The lease outlives the
  job; `releaseControl` completes the handback.
- The lease is **never persisted**. After a load every job is virtualized and every `entityId` nulled,
  so a restored lease would name a hull that does not exist and a controller that no longer does
  either — nobody left alive to release it, i.e. a permanently frozen patrol. This is why
  `activeJobControlClaimsAfterTerminal == 0` is trivially true across any reload.

Release always succeeds when a claim exists, including when the hull died underneath the controller
(`restored: false`, reason `hull_absent`), and neutralizes the controller's last intent so the hull
cannot coast on a stale boost vector.

### 2d. Receiver prepare / commit / abort — `heistFacilities` (`709c3868`)

Two-phase handoff keyed by the arbiter's terminal receipt. **Prepare reserves and proves; commit
consumes.** Nothing is destroyed, moved, or paid for during prepare, so an arbitration that chooses a
different winner — or a process that dies mid-handoff — costs nothing and leaves a capsule that is
still physically there. The packet's stop condition "receiver must commit before terminal arbitration"
is made inexpressible by this shape.

Prepare also refuses a delivery the physical world did not earn: the facility must already own a
recorded custody candidate for this capsule **and** this schedule. Contact at the catcher does not
authorize a handoff at the fence. A payload destroyed between prepare and commit fails closed
(`payload_absent`, handoff marked spent) rather than retrying into a fabricated delivery.

Added as one appended block at the end of the object plus two module-level helpers; no existing
function in `heistFacilities.js` was reordered or changed, so a concurrent PQ-019A edit merges
trivially.

## 3. Tests and gates

| Suite | Tests | Result |
|---|---|---|
| `test/pq019-heist-arbiter.test.mjs` | 33 | PASS |
| `test/pq019-law-incident-intake.test.mjs` | 14 | PASS |
| `test/pq019-heat-incident-listener.test.mjs` | 9 | PASS |
| `test/pq019-job-control-lease.test.mjs` | 12 | PASS |
| `test/pq019-receiver-handoff.test.mjs` | 13 | PASS |
| `test/pq019-owner-invariants.test.mjs` | 10 | PASS |
| **`npm run check:pq019b:seams`** | **91** | **91/91 PASS** |

| Gate | Result |
|---|---|
| `npm run check:sim:compare` **before** any edit | `hashEqual: true`, `firstDivergentTick: null` |
| `npm run check:sim:compare` **after** all seams | `hashEqual: true`, `firstDivergentTick: null` |
| `npm run check:save-schema` | OK — **version 12, 274 paths, unchanged** |
| `npm run check:npc-jobs` | 61/61 PASS (convergence proof intact) |
| `npm run check:faction-standings` | PASS |
| `npm run check:physics-authority` | PASS |
| `npm run check:pq019a:facility-embodiment` | 19/19 PASS (unchanged) |
| existing law suites (escalation / authority-policy / patrol-ambience) | 16/16 PASS |
| `npm run check:baseline` | **10/10 green.** Wall clock 113s against a 90s budget — a shared-machine timing artifact under concurrent lane load, not a failing link. PQ-019B adds no baseline link. |

Golden safety: the seams are naturally inert in the 47a golden scenario — no heist is scheduled
there, so no law incident is reported, no heat ledger is built, no lease is claimed, and no handoff is
prepared. Every new durable structure is created **only on first actual application**, never in
`init`, `newGame`, or any normalize/ensure path, because `check:sim:compare` runs `--reload-at 600`
and a key present on one leg and absent on the other is exactly how that comparison diverges.

### Inherited reds — proven not mine

- **`check:one-voice`** — RED. Fails at `scripts/check-one-voice.mjs:231`, a source-string assertion
  matching `/core, voiceArbiter, input/` against **`src/core/registry.js`**. `git diff --name-only 64840077..HEAD -- src/core/registry.js`
  returns **zero files**: I never touched it. Stale assertion against an evolved import block.
- `check:economy:anti-exploit`, `check:mission-cargo-loading` (headed), `check:art` — inherited per the
  packet brief; not run, not used as acceptance evidence, and untouched by this change surface.

## 4. Save-schema outcome — **AVOIDED, no blocker**

No version bump. No new top-level save key. `SAVE_SCHEMA.md` is byte-identical (version 12, 274
paths). The STOP RULE was never reached, by placing each durable structure inside an owner that
legitimately owns it and already serializes:

- **Heat** → `state.player.heatIncidentsApplied`, lazily created. `_serializePlayer` clones `player`
  wholesale, so it persists for free; the fixture state has no incidents, so no new schema path.
- **Arbiter** → plain JSON with its own `serializeArbiter`/`restoreArbiter`. It has no save home of its
  own and does not need one: PQ-019C nests it inside a `missions.active[]` entry, which is already
  serialized via `{ ...rest }`.
- **Job lease** → deliberately not persisted (§2c).
- **Law ledger and receiver handoff** → session-scoped, because `state.lawSecurity` and
  `state.heistFacilities` are **not in the save capture plan at all**. Cross-reload correctness does
  not depend on them: `incidentReceiptId` is a content hash of stable inputs, so the same report
  reproduces the same id after a load, and the arbiter's durable effect journal is what stops any
  effect from being applied twice. The post-reload receiver refusal is stable and identical every
  time rather than pretending to remember.

**Recorded for the integrator, not a blocker:** if PQ-019C later needs law incident receipts or a
receiver handoff to survive a reload *in their own right* (rather than via the arbiter journal), that
requires adding `lawSecurity` and/or `heistFacilities` to `_saveCapturePlan()` — a new top-level save
key and therefore an integrator decision, not a packet edit.

## 5. Explicitly not done

| Row | Owner |
|---|---|
| Mission wiring, authored offer, board/accept/complete/fail route | **PQ-019C** |
| Route cues, HUD, accessibility, facility/asset/geometry edits | **PQ-019A / PQ-019C** |
| Browser/Electron live route evidence, matched performance capture | **PQ-019C acceptance** (PQ-034 holds the performance lease) |
| Actual economy reward, faction rep, and mission settlement calls | **PQ-019C** — the arbiter supplies the effect keys and this suite proves each is reachable exactly once; `missions.js` is untouched |
| Balance/tuning matrix for launch speed, witnesses, responder count, payout | **PQ-019C / Phase E** |
| Cathedral damage/recovery visual states | `PQ-023.gold-corridor-required-cues` — the Tethys route excludes Ceres (PQ-019A ruling, unchanged) |

## 6. Open rows

- `missionSettlementCount == 1`, `economyRewardCount`, `factionOutcomeCount`, and
  `capsuleProjectionCount` are proven **reachable exactly once through the arbiter's effect journal**
  by a stand-in consumer in `test/pq019-owner-invariants.test.mjs`. They are not yet proven *in
  `missions.js`* — that is PQ-019C's integration evidence, and this receipt does not claim it.
- `stepArbiter` ordering and `causalTick` stamping are **consumer preconditions**, not guarantees.
  They are pinned by tests and stated in the module header, but PQ-019C must honor them; a pure
  module cannot enforce its caller's update order.
- The witness predicate is new code, not a reused owner. `data.lawWitness` is the marker by which
  PQ-019C can make the lawful catcher a witness without `lawSecurity` learning what a heist is. The
  450 WU radius is a first, deliberately conservative value and is exported for Phase E tuning.
