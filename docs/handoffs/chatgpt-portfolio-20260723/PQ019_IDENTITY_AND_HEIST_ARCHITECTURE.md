# PQ-019 Identity and Physical Cargo-Heist Architecture Reconciliation

> **NON-AUTHORITATIVE · PLANNING-ONLY · NOT INTEGRATED**
>
> **Task:** `SF-PORT-01`  
> **Requested result branch:** `agent/chatgpt-pq019-architecture-20260723`  
> **Exact audit base:** `8f1c630f5ebf26f209052b8164f3cdf024ffd06f`  
> **Allowed repository write:** this new historical handoff only  
> **Runtime claim ceiling:** planning and architecture only; no implementation, focused-green, route-accepted, or integrated claim  
> **Concurrent-work boundary:** PQ-017 is **in progress and not yet integrated**. No other current PQ-017 fact is asserted here.

This is historical evidence under [`docs/handoffs/`](../../README.md), not a status surface. Current dispatch and integration authority remain [`CANONICAL_BUILD_MAP.md`](../../../CANONICAL_BUILD_MAP.md), [`design/program/NOW.md`](../../../design/program/NOW.md), and [`design/program/roadmap/program-queue.json`](../../../design/program/roadmap/program-queue.json).

## Evidence vocabulary

Every repository statement is marked:

- **VERIFIED** — observed at the exact base in a named path, symbol, or check.
- **INFERENCE** — a conclusion from verified behavior, not implemented behavior.
- **PROPOSAL** — a future owner-leased change or acceptance requirement.
- **UNKNOWN** — not established at the exact base.

Grounding uses `path :: symbol/check`. Proposed event and method names are explicitly labeled **NEW SEAM**.

---

## 1. Executive decision

### 1.1 Stable identity correction

**PROPOSAL:** PQ-019 must stop claiming `W03`, `W04`, and `W05` as canonical identities. Preserve `SF-16` as its historical alias. Ask the controller to allocate one unclaimed provisional identity; at this audit, the next candidate is `PROPOSED-W22`.

```diff
 {
   "id": "PQ-019",
-  "canonical": ["W03", "W04", "W05"],
+  "canonical": ["PROPOSED-W22"],
   "aliases": ["SF-16"]
 }
```

Do not apply that ledger edit from a feature branch. The controller must recheck allocation at integration time.

Ground:

- **VERIFIED** — `design/program/roadmap/program-queue.json :: PQ-019.canonical` assigns `W03/W04/W05`.
- **VERIFIED** — the same queue assigns `W03` to `PQ-010`.
- **VERIFIED** — [`04_WORLD_CONTENT_RELEASE.md`](../../../design/program/roadmap/04_WORLD_CONTENT_RELEASE.md) defines `W03` as mine-layer doctrine, `W04` as point-defense screening, and `W05` as sensor-ghost encounters.
- **VERIFIED** — the queue already assigns `PROPOSED-W21` to `PQ-027`; therefore `W21` is unavailable and `W22` is the next candidate found unallocated at this audit.
- **VERIFIED** — [`BUILD_PLAN_CORRECTED.md`](../../../design/sequential-build-plan/REVIEW/BUILD_PLAN_CORRECTED.md) uses “folds W03–W05” as an SF-16 grouping statement. It does not override the stable roadmap rows.
- **CORRECTION:** [`roadmap/README.md`](../../../design/program/roadmap/README.md) defines the stable W namespace and authority hierarchy, but it does **not** define a provisional-ID allocation convention. The `PROPOSED-*` pattern is grounded here only in existing queue rows and controller allocation practice.

### 1.2 Readiness decision

**DECISION:** PQ-019 is **not implementation-ready at the exact base**.

**VERIFIED:** the base contains a reusable generic `payload` entity substrate, but repository searches and inspected world/asset entry points found no implemented PQ-019 mass driver, cargo capsule identity, orbital catcher, or physical fence facility.

Ground:

- `src/combat/industrialBeam.js :: spawnPayloadEntity` creates a generic payload whose default `payloadType` is `cut_panel`; this is substrate, not a cargo-capsule feature.
- `src/data/sectorAnchors.js :: CORE_SECTOR_ANCHORS` contains stations, gates, fields, and POIs, but no PQ-019 launcher/catcher identities.
- `src/data/sectors.js :: applySectorAnchors` and `src/systems/world.js :: world ownership` are the existing geography/runtime owners.
- `src/render/visualFactory.js :: build(entity)` is a presentation entry point, not evidence that a launcher/catcher asset exists.
- Exact-base searches for `mass driver`, `massDriver`, `cargo capsule`, `catcher`, `surface_launch`, and equivalent live identities found no implemented route object.

**HARD PREREQUISITE / STOP:** before mission, law, or settlement implementation begins, an owner-leased facility-embodiment packet must land and prove a visible launcher, a distinct physical cargo capsule, a visible lawful catcher/impound receiver, and a physical fence receiver. Generic payload code cannot satisfy this gate.

Until that prerequisite is integrated, the only valid PQ-019 state is **planning_complete / blocked_on_facilities**.

### 1.3 Architecture decision after the prerequisite

**PROPOSAL:** after the facility packet lands, implement PQ-019 as one authored-only mission/set-piece consumer of existing owners. Do not add a registered heist system, second cargo ledger, fence market, law authority, faction authority, economy authority, AI, or pursuer spawner.

The route is:

```text
ordinary authored offer
  -> deterministic visible launch schedule
  -> visible launcher emits one physical foreign-owned cargo capsule
  -> lawful observation OR earlier physical possession
  -> validated witnesses report theft
  -> existing law owner opens one incident
  -> existing heat owner applies one theft consequence
  -> law temporarily claims existing job-origin patrols
  -> existing engagement/AI owners pursue
  -> local escape can end immediate response but does not erase WANTED
  -> physical fence receiver prepares capsule consumption
  -> one outcome arbiter chooses exactly one terminal winner
  -> owner commits and ordinary mission settlement run exactly once
  -> save/Continue resumes the same receipt, or bounded recovery resolves absence
```

The capsule remains physical. It does not become an invisible stack in `state.player.cargo`. Credits and reputation settle through existing mission/economy/faction paths only.

---

## 2. Current-state inventory

| Surface | Class | Exact-base behavior | Ground |
|---|---|---|---|
| Program authority | VERIFIED | Queue and controller own identity/status; handoffs are historical. | `CANONICAL_BUILD_MAP.md`; `design/program/roadmap/00_EXECUTION_PROTOCOL.md` |
| PQ-019 row | VERIFIED | Planned, alias `SF-16`, depends on PQ-013/PQ-014, incorrectly claims W03/W04/W05. | `program-queue.json :: PQ-019` |
| W identities | VERIFIED | W03/W04/W05 already describe other packets; W03 is also used by PQ-010. | `04_WORLD_CONTENT_RELEASE.md`; queue `PQ-010` |
| Provisional candidate | VERIFIED | PQ-027 owns `PROPOSED-W21`; W22 was not allocated at audit. | queue `PQ-027`; exact-base search |
| Historical heist intent | VERIFIED | Scheduled physical capsule, witnesses, pursuit, heat, fence, persistence, failure/recovery; no direct resource writes. | `BUILD_PLAN_CORRECTED.md :: SF-16 / Step 18` |
| Pirate ecology | VERIFIED | Readable motive, witness/consequence logic, deterministic encounters, existing owner reuse. | [`BP-13_PIRATE_ECOLOGY.md`](../../../design/revamp/BP-13_PIRATE_ECOLOGY.md) |
| Missions | VERIFIED | Owns offers, active lifecycle, completion/failure, receipts, serialization, and target reconstruction. | `src/systems/missions.js :: _completeMission`, `_failMission`, `serialize`, `deserialize`, `spawnTargetsForSector` |
| Mission data | VERIFIED | Mission definitions and stable content IDs live in the existing catalog. | `src/data/missions.js :: MISSION_TYPES`, `SET_PIECE_MISSIONS` |
| Credits | VERIFIED | Economy is sole writer; missions emit `economy:grantCredits`. | `src/systems/economy.js :: grantCredits`; `missions.js :: _completeMission` |
| Cargo | VERIFIED | Cargo owner exposes `addCargo`/`removeCargo`; caches are owner-maintained. | `src/systems/cargo.js :: addCargo`, `removeCargo`, `recompute` |
| Reputation/ownership | VERIFIED | Factions owns reputation and sector ownership. | `src/systems/factions.js :: applyRep`, conflict flip path |
| Heat/WANTED | VERIFIED | Heat is sole heat writer. It has private `_raise`/`_setHeat` and public read helpers; there is no public `addHeat`. | `src/systems/heat.js :: _raise`, `_setHeat`, `isPlayerWanted` |
| Law incidents | VERIFIED | Law intake is damage-driven; it validates jurisdiction, dispatches responders, and records receipts. | `src/systems/lawSecurity.js :: _handleDamage`, `_openIncident`, `_dispatchIncident` |
| Patrol jobs | VERIFIED | Traffic creates lawful patrol jobs; NPC-job runtime owns job movement and hold-fire intent. | `src/systems/traffic.js :: _maybeAssignJob`; `src/systems/npcJobsRuntime.js :: update` |
| Job lookup | VERIFIED | `npcJobsRuntime` has no runtime `get()` method. `init` exposes `helpers.npcJobs.get`, but no control lease. | `src/systems/npcJobsRuntime.js :: init`, `assign`, `release`, `update` |
| Physical payload | VERIFIED | Generic collidable payload with ownership, contents, pose, velocity, and optional record ID exists. | `src/combat/industrialBeam.js :: spawnPayloadEntity` |
| Tether possession signal | VERIFIED | Payload is tetherable and successful latch emits `tether:latched`. | `src/systems/tetherGameplay.js :: acquisition/create path` |
| Physical receiver | VERIFIED NEGATIVE | Existing transfer consumes player-hold cargo; no generic physical-payload prepare/commit receiver contract exists. | `src/combat/industrialBeam.js :: resolveBeamVerb('transfer')`; `src/systems/mining.js :: _applyTransfer` |
| Save | VERIFIED | Missions and NPC jobs serialize. Generic entity save includes player and `flags.persistent`; world records exclude payloads. | `src/save/saveSystem.js :: _saveCapturePlan`, `_serializeEntities`; `src/world/worldRecords.js :: entityHasDurableMarkers` |
| Facilities | VERIFIED NEGATIVE | No implemented launcher/capsule/catcher route identity was found at the base. | `sectorAnchors.js`; source/asset search |
| PQ-017 | USER-SUPPLIED | In progress and not yet integrated. | supplied task statement only |

### Important distinction

**VERIFIED substrate:** a generic `payload` can exist and can be tethered.

**NOT VERIFIED / ABSENT:** a scheduled surface-launch facility, authored cargo-capsule identity, lawful catcher facility, and fence receiver.

**INFERENCE:** the mission record should own durable heist phase and outcome arbitration. Runtime capsule, incident, and responder projections should be reconstructed from stable IDs rather than creating a new top-level save authority.

---

## 3. Ownership invariants

| State/decision | Existing owner | PQ-019 may | PQ-019 must not |
|---|---|---|---|
| Credits | economy | trigger ordinary mission reward intent after terminal fence success | assign `state.player.credits` |
| Player cargo | cargo | read capacity if required; keep capsule physical | mint/remove capsule as hidden cargo |
| Reputation | factions | emit existing owner intent from settlement/failure | mutate faction maps |
| Sector ownership | factions/world | read jurisdiction | change ownership |
| Heat/WANTED | heat | submit one validated law receipt to a **NEW owner listener** | call private `_raise` externally or write heat |
| Crime validity | lawSecurity | submit a **NEW `law:reportIncident` seam** | decide guilt/responders in mission code |
| Patrol job intent | npcJobsRuntime | request **NEW `claimControl` / `releaseControl` seams** | edit job rows or spawn replacement patrols |
| Combat pursuit | law/engagement/AI | supply existing lawful target/motive | add a heist AI or direct weapon intents |
| Mission progression | missions | own authored cursor, candidate journal, terminal receipt, recovery | add a registered heist authority |
| Payload lifecycle | entity/physics/receiver owners | request spawn/rebind and prepare/commit | teleport or delete without owner receipt |
| Save envelope | save + missions | persist inside ordinary mission record | add top-level save key in first slice |
| UI/input/presentation | existing owners | reuse mission/law/target/receiver cues | add HUD/input mode without owner lease |

---

## 4. Facility-embodiment prerequisite

### 4.1 Required outcome

**PROPOSAL — separate owner-leased prerequisite packet:** embody one complete facility route before PQ-019 runtime work.

It must provide:

1. a deterministic schedule expressed in simulation time;
2. a visible, named launcher/mass-driver structure with a physical muzzle/rail;
3. a distinct cargo-capsule entity identity using the generic payload substrate but with authored mass, hull, ownership, manifest, sockets, and visual;
4. a visible lawful catcher/impound receiver whose capture volume matches its geometry;
5. a visible physical fence receiver with explicit eligibility;
6. stable world/content IDs and normal-route reachability;
7. browser and required Electron evidence at launch, interception, catcher approach, and fence delivery;
8. accessible schedule/catcher/fence semantics that survive reduced motion, reduced flash, forced colors, and non-audio play;
9. measured entity/query/draw cost under ordinary traffic.

### 4.2 Owner-leased future write-set for the prerequisite

These are **PROPOSED**, not authorized edits:

| Proposed path/surface | Purpose | Owner/mutex |
|---|---|---|
| `src/data/sectorAnchors.js` or an owner-approved imported data file | stable launcher/catcher/fence geography | world/data |
| `src/data/sectors.js` | consume approved identities only if needed | world/data |
| `src/systems/world.js` or an owner-approved imported helper | materialize facilities and capsule schedule | world |
| `src/render/visualFactory.js` or current asset-backed visual owner | visible facility/capsule presentation | renderer |
| owner-selected asset source/release/manifest paths | actual launcher, catcher, capsule, receiver assets | blender/asset-manifest |
| focused facility tests and route capture script | schedule, geometry, collision, accessibility, performance | test/browser-GPU |

**HARD STOP:** exact asset/manifest paths must be allocated by the graphics/asset owner after checking concurrent leases. Do not invent those paths in PQ-019. Do not start the mission packet if the facility exists only as coordinates, invisible volumes, generic primitives, or debug fixtures.

---

## 5. Proposed mission data and event flow

### 5.1 Authored-only mission identity

**PROPOSAL:** add one authored mission/set-piece definition with procedural weight zero. It must enter through the normal board/accept path and use ordinary mission completion/failure.

```js
{
  id: 'mission_pq019_surface_heist',
  type: 'surface_heist',
  source: 'authored_set_piece',
  proceduralWeight: 0,
  retryPolicy: { maxReducedPayRetries: 1 }
}
```

### 5.2 Durable mission record

Persist inside the active mission object already serialized by `missions`:

```js
{
  heist: {
    schemaVersion: 1,
    stableId,
    progress: 'scheduled',
    schedule: {
      launchTick,
      launcherId,
      catcherId,
      fenceReceiverId,
      jurisdictionFactionId,
      legalOwnerFactionId
    },
    payload: {
      stableId,
      payloadType,
      manifest,
      mass,
      radius,
      hull,
      hullMax,
      pose: { x, z, rot },
      velocity: { x, z },
      legalOwnerId,
      legalOwnerFactionId,
      projectionEntityId: null
    },
    witness: {
      reportId: null,
      witnessStableIds: [],
      witnessedTick: null
    },
    law: {
      incidentId: null,
      heatReceiptId: null,
      responderJobIds: [],
      localPursuitResolved: false
    },
    resolution: {
      status: 'open',
      candidateIds: [],
      candidates: {},
      decisionAfterTick: null,
      terminalOutcome: null,
      terminalReceiptId: null,
      terminalReceipt: null,
      effectStatus: {}
    },
    recovery: {
      reconcileAttempts: 0,
      reconcileDeadlineTick: null,
      retryPosted: false
    }
  }
}
```

`projectionEntityId` and live responder entity IDs are transient. Stable mission/payload/job/incident IDs are durable and deterministic.

### 5.3 High-level flow

1. Mission owner opens the authored offer.
2. Facility owner publishes schedule and creates exactly one capsule projection at `launchTick`.
3. Capsule owner emits launch receipt with stable ID, pose, velocity, owner, and manifest.
4. End-of-tick arbiter receives zero or more nonterminal/terminal candidates.
5. If lawful catcher arrival wins before possession, terminal outcome is `lawful_arrival_observed`.
6. If possession wins earlier, mission requests **NEW `law:reportIncident`** with stable witnesses and jurisdiction.
7. Law validates and returns one incident receipt; heat’s **NEW owner listener** applies that receipt once using private `_raise`.
8. Law requests **NEW job-control claims** for existing patrol jobs; no pursuer is invented.
9. Escape releases immediate control claims but does not clear owner heat.
10. Fence uses **NEW two-phase physical receiver events**. It prepares consumption; the arbiter chooses a winner; only then may it commit.
11. Mission completion/failure/recovery follows the one terminal receipt.

---

## 6. Race-safe idempotent outcome FSM

### 6.1 Separate progress from resolution

Progress is nonterminal:

```text
scheduled
  -> launched
  -> possessed
  -> pursued
  -> escaped
  -> receiver_pending
  -> resolution_pending
  -> terminal
```

Lawful observation can move `launched -> resolution_pending` without possession. Destruction, confiscation, expiry, and unresolved absence can enter `resolution_pending` from any legal nonterminal state.

Terminal outcomes are immutable:

```text
lawful_arrival_observed
payload_destroyed
lawful_confiscation
fenced_success
expired
unresolved_absent
```

### 6.2 Allowed progress transitions

| From | Allowed next | Condition |
|---|---|---|
| `scheduled` | `launched` | exact stable capsule launch receipt |
| `launched` | `possessed` | player latch/possession candidate wins end-of-tick |
| `launched` | `resolution_pending` | lawful catcher, destruction, expiry, or bounded absence candidate |
| `possessed` | `pursued` | validated incident plus at least one claimed job-origin patrol, or monitoring receipt if none available |
| `possessed` | `escaped` | cause-specific local response leash cleared |
| `possessed` | `receiver_pending` | physical fence prepare accepted |
| `possessed` | `resolution_pending` | destruction/confiscation/expiry/absence |
| `pursued` | `escaped` | immediate responders released by law |
| `pursued` | `receiver_pending` | physical fence prepare accepted |
| `pursued` | `resolution_pending` | destruction/confiscation/expiry/absence |
| `escaped` | `receiver_pending` | physical fence prepare accepted |
| `escaped` | `resolution_pending` | destruction/confiscation/expiry/absence |
| `receiver_pending` | `resolution_pending` | fence/destruction/confiscation/expiry/absence candidate |
| `resolution_pending` | `terminal` | arbiter selects one winner and creates terminal receipt |
| `terminal` | none | every replay returns existing receipt/no-op |

Illegal or stale transitions are rejected with a diagnostic and no resource mutation.

### 6.3 Candidate shape and stable identity

Every candidate is plain deterministic data:

```js
{
  candidateId,       // hash(missionId, payloadStableId, kind, causalTick, sourceStableId)
  missionId,
  payloadStableId,
  kind,              // possessed|lawful_arrival|destroyed|confiscated|fenced|expired|unresolved_absent
  causalTick,
  sourceStableId,
  proof
}
```

Duplicate `candidateId` is ignored. Candidate comparison never uses callback order, insertion order, wall time, live entity ID, or `Math.random()`.

### 6.4 Deferred arbitration

The mission owner buffers candidates through the fixed step and decides no earlier than `causalTick + 1`. This lets catcher, latch, destruction, capture, fence, and expiry reports from the same step coexist before a decision.

Selection:

1. discard candidates invalid for the pre-step durable state;
2. choose the earliest `causalTick`;
3. at the same tick, use this terminal precedence:
   1. `destroyed`
   2. `confiscated`
   3. `fenced`
   4. `lawful_arrival`
   5. `expired`
   6. `unresolved_absent`
4. if no terminal candidate wins, apply nonterminal `possessed`;
5. break any remaining tie by stable `candidateId`.

Explicit race decisions:

- **catcher vs latch, same tick:** lawful arrival wins; a capsule accepted by the lawful catcher in that fixed step cannot also be stolen;
- **latch at an earlier tick:** possession is already durable, so later lawful-arrival input is invalid and the theft path continues;
- **destruction vs fence, same tick:** destruction wins; abort fence preparation and grant nothing;
- **capture vs escape, same tick:** lawful confiscation wins; escape is nonterminal and cannot outrank physical custody;
- **fence vs expiry, same tick:** physical fence wins;
- **absence vs expiry, same tick:** expiry wins;
- replay after `terminal`: return the existing terminal receipt, with zero side effects.

### 6.5 Exactly one terminal receipt

The arbiter creates one deterministic receipt:

```js
{
  receiptId,         // hash(missionId, payloadStableId, terminalOutcome, causalTick)
  missionId,
  payloadStableId,
  outcome,
  causalTick,
  winnerCandidateId,
  status: 'prepared', // prepared|committed
  effectKeys: {}
}
```

The compare-and-set rule is:

```text
if terminalReceiptId exists:
    return existing receipt
else:
    persist exactly one prepared terminal receipt
    reject every other candidate
```

A crash after preparation does not choose again. Continue resumes the same receipt and idempotency keys.

### 6.6 Two-phase owner commits

**PROPOSED NEW PHYSICAL RECEIVER SEAMS:**

- `payload:receiverPrepared`
- `payload:receiverCommit`
- `payload:receiverAbort`
- `payload:receiverCommitted`
- `payload:receiverRejected`

A receiver may reserve eligibility and custody during prepare but must not destroy the capsule, grant cargo, grant credits, or settle a mission until the arbiter sends `payload:receiverCommit` with the terminal receipt ID. Losing candidates receive abort.

Winner effects:

| Outcome | Payload owner | Mission/economy | Factions | Heat | Cargo |
|---|---|---|---|---|---|
| `lawful_arrival_observed` | catcher commits custody | observation/neutral receipt only | none | none | zero mutation |
| `payload_destroyed` | destruction already authoritative; cleanup deduped | one failure receipt/recovery policy | failure delta only if authored | prior heat unchanged | zero capsule mutation |
| `lawful_confiscation` | impound commits custody | one failure/confiscation receipt | failure delta only if authored | prior heat unchanged | zero capsule mutation |
| `fenced_success` | fence commits custody | one mission completion; economy reward once | ordinary completion once | prior heat unchanged | zero capsule mutation |
| `expired` | owner cleanup after selection | one expiry/failure/recovery | authored failure once | unchanged | zero capsule mutation |
| `unresolved_absent` | no fabricated payload | one explicit unresolved failure/recovery | authored failure once | unchanged | zero capsule mutation |

The mission must not use ordinary market sale to fence the capsule. If later design requires market stock pressure, that is a separate economy-owner request.

---

## 7. New owner seams versus existing APIs

### Existing APIs/events to reuse

- `tether:latched` — possession evidence.
- `economy:grantCredits` — reward intent; economy remains writer.
- `faction:repDelta` or existing mission completion payload — faction owner remains writer.
- `mission:completed`, `mission:failed`, `mission:expired` — ordinary settlement lifecycle.
- `isPlayerWanted(state)` — lawful read gate.
- `helpers.npcJobs.list/byEntity/summary` — current helper-side observation only.
- existing law engagement target/motive fields — pursuit execution remains existing AI/engagement ownership.

### Explicitly new seams

1. **`law:reportIncident` — NEW SEAM.**  
   Input: stable report ID, crime kind `physical_theft`, actor, payload stable ID, owner faction, jurisdiction, witness stable IDs, causal tick.  
   Law validates witnesses/jurisdiction, dedupes report ID, opens/returns one incident receipt, and chooses existing responders.

2. **Heat incident listener — NEW SEAM.**  
   Heat consumes the validated law receipt exactly once, calls private `_raise` internally, and returns/stores a stable heat receipt. There is no public `addHeat`; mission code never calls `_raise`.

3. **`claimControl` / `releaseControl` — NEW SEAMS.**  
   Add owner methods to `npcJobsRuntime`, preferably surfaced through `helpers.npcJobs`. A lease records job ID, claimant/incident ID, target ID, acquired tick, and release condition. While claimed, ordinary job movement yields. Release restores the same job phase/route or fails safe if its hull is gone. `npcJobsRuntime` currently has no runtime `get()` method; do not cite one.

4. **Physical receiver prepare/commit events — NEW SEAMS.**  
   Extend the existing receiver owner to accept a physical payload source and terminal receipt key. Existing beam transfer of player-hold cargo is not this seam.

5. **Mission outcome arbiter — NEW INTERNAL SEAM.**  
   Pure candidate normalization, transition validation, deterministic selection, terminal compare-and-set, and effect journal.

---

## 8. Exact future write-set proposal

This is a planning budget, not authorization.

### Phase A — facility prerequisite

| Path/surface | Change |
|---|---|
| `src/data/sectorAnchors.js` or owner-approved imported data file | stable launcher/catcher/fence identities and positions |
| `src/data/sectors.js` | consume approved facility identities if required |
| `src/systems/world.js` or owner-approved helper | schedule/materialize facility and capsule |
| `src/render/visualFactory.js` or current visual owner | visible facility/capsule visuals |
| owner-selected asset source/release/manifests | authored launcher/catcher/capsule/fence |
| new focused facility test/capture files | schedule, physical geometry, route, accessibility, performance |

### Phase B — mission/law architecture after Phase A integration

| Proposed path | Change |
|---|---|
| `src/data/missions.js` | authored-only surface-heist definition |
| `src/missions/pq019OutcomeArbiter.js` **NEW** | pure FSM/candidate/receipt arbitration |
| `src/systems/missions.js` | route events into arbiter; persist/reconstruct; settle/recover |
| `src/systems/lawSecurity.js` | **NEW** `law:reportIncident` intake and idempotent incident receipt |
| `src/systems/heat.js` | **NEW** validated-incident listener using private `_raise` internally |
| `src/systems/npcJobsRuntime.js` | **NEW** `claimControl`/`releaseControl` lease |
| `src/combat/industrialBeam.js` and/or current receiver owner | **NEW** physical receiver prepare/commit/abort contract |
| focused PQ-019 test files | transition, race, save, single-writer, route-contract tests |
| owner-approved route capture script | ordinary lawful/heist/capture/failure/recovery evidence |

### Explicit non-write set

No direct changes are proposed to package, input, tactical AI, combat doctrine, Massline/tether authority, registry order, save schema/version, shared HUD/styles, generated indexes, worldbuilding prose, or program ledgers from a feature agent. Any required shared edit is a controller/integration request.

---

## 9. Mutex, dependency, and collision analysis

### Dependencies

- PQ-013 supplies the planetary vertical, but **does not by itself prove a mass driver/catcher**.
- PQ-014 supplies natural NPC jobs and job-origin patrols.
- Facility embodiment is a new hard prerequisite.
- PQ-017 is in progress/not integrated; re-read any interface it touches before implementation.
- PQ-016 supplies generic payload/receiver substrate only; it does not satisfy the cargo-capsule/facility or physical-receiver contract.

### Mutexes

| Domain | Reason | Required handling |
|---|---|---|
| world/data | facility identities and materialization | exclusive owner lease |
| renderer/assets/manifests/browser-GPU | visible facilities and route evidence | separate serialized prerequisite |
| missions | single authored lifecycle/outcome writer | one implementation owner |
| law/AI contract | incident and responder targeting | law owner; no AI rewrite |
| NPC jobs | movement intent writer | land claim/release contract before pursuit consumer |
| heat/factions/economy/cargo | single writers | owner-side events/APIs only |
| save | mission serialization/Continue | no schema edit unless evidence forces controller request |
| program ledgers | identity/status | controller only |

### Semantic collision stops

Stop if:

- facility owner cannot provide visible physical launcher/catcher/fence;
- no existing patrol job can be claimed without overwriting another intent owner;
- law validation would be performed in mission code;
- fence success requires direct credit/cargo/rep/heat writes;
- receiver must consume before terminal arbitration;
- another active packet changes mission receipt, payload, law, job-control, or save contracts;
- PQ-017 integration changes relevant persistence/receiver assumptions.

---

## 10. Determinism, save, accessibility, and performance

### Determinism

- Stable IDs derive from save seed plus authored mission/facility/payload keys.
- Schedule uses `state.simTime`/ticks, never wall time.
- Candidate arbitration uses causal tick, explicit priority, and stable ID.
- No `Math.random()`, callback order, object iteration order, or live entity ID determines outcomes.
- Same seed/input tape and save/reload boundary must produce the same terminal receipt and owner-effect digest.

### Single-writer and exactly-once

For every route and replay:

```text
terminalReceiptCount == 1
capsuleReceiverCommitCount <= 1
missionSettlementCount == 1
economyRewardCount == (outcome == fenced_success ? 1 : 0)
factionOutcomeCount <= 1
heatApplicationCount == (validatedWitnessedTheft ? 1 : 0)
playerCargoMutationCountForCapsule == 0
sectorOwnershipMutationCount == 0
activeJobControlClaimsAfterTerminal == 0
```

### Save/Continue

Mission serialization stores the durable capsule snapshot, candidate journal, prepared/committed terminal receipt, incident/heat receipts, job lease identities, and effect keys. On Continue:

1. clear transient entity IDs;
2. rebind an existing matching capsule projection or spawn exactly one from the durable snapshot through the facility/payload owner;
3. re-query law and heat by stable receipt IDs; replay returns existing receipts;
4. reclaim surviving patrol jobs or deterministically record unavailable response;
5. resume a prepared receiver/settlement commit using the same terminal receipt;
6. if no capsule can be reconciled, advance a bounded deterministic absence counter;
7. select exactly one `unresolved_absent` or `expired` terminal result when its condition wins;
8. post at most one reduced-stake recovery offer.

No top-level save key or schema bump is proposed unless characterization proves mission serialization cannot carry this data.

### Accessibility

The route must communicate schedule, launcher charge, capsule identity, legal ownership, witness state, WANTED, pursuit, catcher custody, fence eligibility, capture, destruction, failure, and recovery through text/non-color semantics as well as visuals/audio. Reduced motion/flash must preserve timing and custody meaning. No critical action may require simultaneous cursor steering and flight input beyond existing controls.

### Performance

- one scheduled capsule per active authored mission;
- bounded witness query at the theft transition, not every frame;
- bounded responder set drawn from existing jobs;
- no all-pairs scans;
- candidate journal capped and terminally frozen;
- receiver/catcher checks use existing spatial/query owners;
- facility prerequisite must measure normal and traffic-loaded route cost.

---

## 11. Adversarial failure modes

| Failure | Required disposition |
|---|---|
| catcher and latch report same tick | lawful arrival terminal; latch ignored |
| latch is earlier than catcher | theft path; catcher arrival invalid |
| destruction and fence prepare same tick | destruction terminal; receiver abort; zero payout |
| capture and escape same tick | confiscation terminal; escape ignored |
| fence and expiry same tick | fence terminal |
| absence and expiry same tick | expiry terminal |
| duplicate callbacks | same candidate ID ignored |
| callback order reversed | identical digest |
| save after terminal receipt prepared but before effects | Continue resumes same receipt/effect keys |
| save after receiver commit but before mission completion event | receiver replay returns committed; mission settles once |
| duplicate law report before/after Continue | one incident and one heat receipt |
| no witnesses | no theft incident/heat; mission remains observation/unauthorized attempt per authored rule |
| witnesses vanish after report | durable witness receipt remains valid |
| no patrol available | law records monitoring/unavailable response; never spawns a fake job-origin patrol |
| patrol hull destroyed during claim | job owner releases/fails safe; no orphan claim |
| payload projection duplicated on load | stable-ID reconciliation keeps one and rejects duplicate |
| payload absent transiently | bounded reconciliation, no immediate fabrication or payout |
| payload absent through grace | one unresolved terminal/recovery |
| facility missing/hidden | implementation stop; no route claim |
| receiver accepts wrong payload | prepare rejected; no terminal candidate |
| player hold full | irrelevant to physical capsule; no hidden cargo conversion |
| heat decays naturally during route | heat owner remains authoritative; mission never pins/clears it |
| player dies | ordinary death/save policy; terminal arbitration remains idempotent |
| mission abandoned | one authored terminal/failure path; release jobs and abort receivers |
| stale event from earlier retry | stable mission/payload IDs fail validation |
| PQ-017 interface drift | stop, re-read, and re-plan; no implied integration |

---

## 12. Proof matrix

### 12.1 Pure transition and arbitration matrix

Every row must assert one terminal receipt and the owner invariants above.

| Inputs/replay pair | Expected winner/state | Required proof |
|---|---|---|
| scheduled -> launch | `launched` | one capsule stable ID/projection |
| duplicate launch | unchanged | no duplicate capsule |
| catcher then latch, same tick | `lawful_arrival_observed` | one catcher commit; latch ignored |
| latch then catcher, same tick | same lawful result | callback-order-independent digest |
| latch tick N, catcher N+1 | possession/theft continues | no catcher consume |
| catcher vs destruction, same tick | `payload_destroyed` | destruction priority; no observation receipt |
| lawful arrival vs expiry, same tick | lawful arrival | no retry/heat/reward |
| destruction vs fence, both callback orders | `payload_destroyed` | fence abort; zero credits/rep/cargo |
| fence tick N, destruction N+1 after committed terminal | `fenced_success` frozen | destruction replay ignored |
| capture vs escape, both callback orders | `lawful_confiscation` | impound once; claims released |
| escape tick N, later valid capture | confiscation if law still has custody proof | one terminal receipt |
| fence vs capture, same tick | confiscation | lawful custody outranks fence |
| fence vs expiry, same tick | `fenced_success` | one reward, no retry |
| destruction vs expiry, same tick | destroyed | one failure |
| confiscation vs expiry, same tick | confiscation | one capture receipt |
| unresolved absence vs expiry, same tick | expired | one recovery decision |
| duplicate terminal candidates | existing winner | receipt count remains one |
| replay all events after terminal | frozen terminal | zero additional owner effects |

### 12.2 Law, heat, job, and receiver idempotence

| Case | Required proof |
|---|---|
| duplicate `law:reportIncident` | same incident receipt |
| law report replay after Continue | no second incident/responders |
| heat receipt replay | private `_raise` called once total |
| no valid witnesses | no incident and no heat |
| patrol claim duplicate | same lease or explicit already-claimed result |
| competing claimant | stable owner decision; no dual intent writer |
| release duplicate | harmless; same restored job state |
| claimed hull destroyed | no orphan lease/job write |
| receiver prepare duplicate | same reservation |
| receiver commit duplicate | same committed receipt; no extra payout |
| receiver abort after loss | no consumption |
| commit-pending Continue | same terminal/effect IDs finish once |

### 12.3 Save/absence matrix

| Boundary | Required proof |
|---|---|
| save before launch | same launch tick and stable capsule |
| save after launch before possession | one reconstructed capsule |
| save after witnessed theft | same incident/heat receipts |
| save during pursuit | same job identities or explicit unavailable response |
| save after escape | no resurrected immediate responders |
| save at receiver prepare | no premature consumption |
| save after terminal prepared | same winner; effect journal resumes |
| save after receiver commit before mission event | no second commit/reward |
| missing projection, valid durable snapshot | exactly one reconstruction |
| unresolved missing projection before deadline | bounded attempts; no terminal yet |
| grace exhausted | one `unresolved_absent` terminal and one recovery decision |
| deadline wins | one `expired` terminal |
| repeated Continue after absence/expiry | no extra receipt/retry/rep |

### 12.4 Owner-side invariants per outcome

| Outcome | Credits | Reputation | Heat | Player cargo | Sector owner |
|---|---:|---:|---:|---:|---:|
| lawful arrival observed | 0 | 0 | 0 | 0 | 0 |
| destroyed before theft | 0 | authored failure at most once | 0 | 0 | 0 |
| destroyed after witnessed theft | 0 | authored failure at most once | one prior theft application | 0 | 0 |
| lawful confiscation | 0 | authored failure at most once | one prior theft application | 0 | 0 |
| fenced success | exactly one mission reward | exactly one ordinary completion effect | one prior theft application, never cleared by settlement | 0 | 0 |
| expired | 0 | authored failure at most once | unchanged | 0 | 0 |
| unresolved absent | 0 | authored failure at most once | unchanged | 0 | 0 |

### 12.5 Player-route evidence

1. **Lawful observe/arrival:** watch schedule, see physical launch, do not latch, see capsule enter visible catcher, receive neutral lawful-arrival receipt.
2. **Primary heist:** launch, earlier latch, validated witnesses, existing job-origin patrol pursuit, escape, persistent WANTED, physical fence prepare/commit, one settlement.
3. **Lawful capture/confiscation:** steal, get pursued, lose capsule into lawful impound/catcher, one confiscation receipt, no payout, WANTED remains owner-controlled.
4. **Destruction:** destroy capsule before and after possession; one destruction terminal, no fence/credit/cargo.
5. **Continue/recovery:** save at launch, theft, pursuit, receiver-pending, terminal-prepared, and absent projection boundaries; prove one reconstruction or one expiry/unresolved result and one recovery posting.
6. **Accessibility/performance:** repeat representative routes with reduced motion/flash, forced colors/text scaling, sound disabled, ordinary traffic, and measured frame/query/entity budgets.

No debug injection may substitute for the normal offer, launch, latch, patrol, catcher, or fence route.

---

## 13. Phased implementation plan and stop conditions

### Phase 0 — controller reconciliation

- allocate a non-colliding canonical candidate;
- retain `SF-16` alias;
- record facility prerequisite and path leases;
- recheck PQ-017 status/interfaces.

**Stop:** identity or lease collision remains.

### Phase 1 — facility prerequisite

Build and accept visible launcher, capsule, catcher/impound, and fence under world/data/presentation/assets owners.

**Stop:** any facility is invisible, generic-only, debug-only, physically misaligned, inaccessible, or unmeasured.

### Phase 2 — pure contracts

Add the pure outcome arbiter and characterize current mission/payload/law/job/save contracts. Prove all transition/race rows without bus or renderer changes.

**Stop:** callback order changes the digest; more than one terminal receipt can appear.

### Phase 3 — owner seams

Land law report intake, heat owner listener, NPC-job control lease, and physical receiver prepare/commit independently with focused tests.

**Stop:** any seam needs a new authority or direct resource write.

### Phase 4 — authored mission wiring

Wire schedule/launch events, possession, witnesses, pursuit, escape, catcher, fence, failure, and recovery into ordinary mission lifecycle.

**Stop:** pursuers are not job-origin, capsule becomes player cargo, or terminal effects are not idempotent.

### Phase 5 — save/Continue and adversarial races

Run every save/race/replay pair and deterministic repeated-run digest.

**Stop:** duplicate projection, incident, heat, receiver commit, reward, rep effect, or recovery offer.

### Phase 6 — player-route acceptance

Capture lawful observe, heist/fence, confiscation, destruction, and absence/expiry/recovery routes through normal input, then accessibility/performance/browser/Electron evidence.

**Stop:** missing semantic cue, stale receipt, hidden facility, unacceptable performance, or concurrent owner drift.

---

## 14. Unresolved questions

1. **UNKNOWN:** controller-selected final stable ID after rechecking `PROPOSED-W22`.
2. **UNKNOWN:** exact sector and authored launcher/catcher/fence identities.
3. **UNKNOWN:** graphics owner’s exact asset source/release/manifest paths.
4. **UNKNOWN:** whether the first route is same-sector only; same-sector is recommended to reduce persistence risk.
5. **UNKNOWN:** witness eligibility rules and whether stations count when occluded/out of jurisdiction.
6. **UNKNOWN:** lawful catcher versus impound geometry—one facility with modes or two receivers.
7. **UNKNOWN:** exact heat delta for validated theft; heat owner must tune it.
8. **UNKNOWN:** whether successful fence changes market stock; first slice recommends no.
9. **UNKNOWN:** responder count and claim selection policy when multiple patrol jobs qualify.
10. **UNKNOWN:** bounded absence reconciliation duration before `unresolved_absent`.
11. **UNKNOWN:** recovery fiction and reduced-stake retry location.
12. **UNKNOWN:** whether PQ-017 integration changes payload/site persistence or receiver ownership.

---

## 15. Controller-ready acceptance checklist

### Identity and readiness

- [ ] PQ-019 no longer claims W03/W04/W05.
- [ ] `SF-16` remains an alias.
- [ ] `PROPOSED-W21` remains attributed to PQ-027.
- [ ] controller rechecks/allocates W22 candidate.
- [ ] visible launcher, distinct cargo capsule, catcher/impound, and fence prerequisite is integrated.
- [ ] generic payload substrate is not presented as the capsule implementation.

### FSM and idempotence

- [ ] allowed transitions match Section 6.
- [ ] candidates use stable IDs and causal ticks.
- [ ] decisions are deferred across the fixed step.
- [ ] same-tick precedence is implemented exactly.
- [ ] catcher-vs-latch, destruction-vs-fence, capture-vs-escape, and expiry/absence pairs pass in both callback orders.
- [ ] one immutable terminal receipt wins.
- [ ] prepared terminal effects resume after Continue.
- [ ] every replay after terminal is a no-op.

### Ownership

- [ ] no direct credits, cargo, reputation, sector ownership, or heat writes.
- [ ] `law:reportIncident` is implemented as a new law-owner seam.
- [ ] heat owner consumes one validated receipt and calls private `_raise` only internally.
- [ ] `claimControl`/`releaseControl` are new NPC-job owner seams; no runtime `get()` is assumed.
- [ ] physical receiver prepare/commit/abort events are new owner seams.
- [ ] pursuit uses existing job-origin patrols and existing engagement/AI.
- [ ] no new cargo/economy/faction/law/AI authority exists.

### Save, route, accessibility, performance

- [ ] capsule, candidates, terminal receipt, effect journal, incident/heat/job identities persist through mission serialization.
- [ ] one projection rebind/reconstruction or one bounded unresolved/expiry result occurs.
- [ ] lawful arrival/observe route is captured.
- [ ] theft/pursuit/escape/fence route is captured.
- [ ] lawful capture/confiscation route is captured.
- [ ] destruction and recovery routes are captured.
- [ ] browser and required Electron proof use normal inputs/current build.
- [ ] reduced motion/flash, non-color/text cues, keyboard/trackpad/gamepad compatibility are preserved.
- [ ] witness/responder/receiver work is bounded and measured.
- [ ] PQ-017 is described only as in progress and not yet integrated unless new controller evidence says otherwise.

---

## 16. Corrected SpaceFace receipt

```yaml
taskId: SF-PORT-01
packet: PQ-019
title: PQ-019 identity and heist architecture reconciliation
state_reached:
  - returned
  - planning_complete
readiness: blocked_on_visible_facility_prerequisite
markers:
  - NON-AUTHORITATIVE
  - PLANNING-ONLY
  - NOT INTEGRATED
baseCommit: 8f1c630f5ebf26f209052b8164f3cdf024ffd06f
requestedBranch: agent/chatgpt-pq019-architecture-20260723
paths_changed:
  - docs/handoffs/chatgpt-portfolio-20260723/PQ019_IDENTITY_AND_HEIST_ARCHITECTURE.md
identity_recommendation:
  remove:
    - W03
    - W04
    - W05
  preserve_alias:
    - SF-16
  occupied:
    PROPOSED-W21: PQ-027
  candidate:
    - PROPOSED-W22
  allocation_owner: controller
verified_substrate:
  - generic_payload_entity
  - tether_latch_event
  - mission_lifecycle_and_receipts
  - damage_driven_law_incidents
  - private_heat_mutation
  - natural_patrol_jobs
  - ordinary_credit_reputation_cargo_owners
missing_prerequisite:
  - visible_mass_driver_launcher
  - distinct_cargo_capsule_identity
  - visible_lawful_catcher_or_impound
  - visible_physical_fence_receiver
new_seams_proposed:
  - law:reportIncident
  - heat_validated_incident_listener
  - npcJobsRuntime.claimControl
  - npcJobsRuntime.releaseControl
  - payload:receiverPrepared
  - payload:receiverCommit
  - payload:receiverAbort
  - payload:receiverCommitted
  - mission_outcome_arbiter
terminal_outcomes:
  - lawful_arrival_observed
  - payload_destroyed
  - lawful_confiscation
  - fenced_success
  - expired
  - unresolved_absent
claim_ceiling:
  allowed:
    - returned
    - planning_complete
  forbidden:
    - implemented
    - focused_green
    - route_accepted
    - integrated
known_risks:
  - controller_identity_allocation
  - facility_prerequisite_absent
  - new_owner_seams_unimplemented
  - race_and_replay_matrix_unproven
  - save_projection_reconstruction_unproven
  - PQ-017_in_progress_not_integrated
```
