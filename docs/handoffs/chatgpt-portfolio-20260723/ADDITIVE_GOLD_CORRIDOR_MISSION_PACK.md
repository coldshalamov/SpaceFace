# SF-PORT-08 — Additive Gold Corridor Mission-Pack Design

> **NON-AUTHORITATIVE · PLANNING-ONLY · NOT INTEGRATED**
>
> Historical controller handoff. This file changes no runtime behavior, canon, program status, or integration state.

| Field | Value |
|---|---|
| Task | `SF-PORT-08` |
| Requested source branch | `codex/delegation-base-20260723` |
| Audited base commit | `8f1c630f5ebf26f209052b8164f3cdf024ffd06f` |
| Requested result branch | `agent/chatgpt-gold-corridor-missions-20260723` |
| Allowed repository output | `docs/handoffs/chatgpt-portfolio-20260723/ADDITIVE_GOLD_CORRIDOR_MISSION_PACK.md` |
| Receipt ceiling | `returned` / `planning_complete` only |

## 0. Authority, evidence labels, and hard boundary

This handoff follows [CANONICAL_BUILD_MAP.md](../../../CANONICAL_BUILD_MAP.md), [AGENTS.md](../../../AGENTS.md), [docs/AGENTS.md](../../AGENTS.md), [design/program/roadmap/02_GOLD_CORRIDOR.md](../../../design/program/roadmap/02_GOLD_CORRIDOR.md), and [design/GDD_2_0.md](../../../design/GDD_2_0.md). It does not supersede them.

- **VERIFIED** — observed at the exact base, grounded in a path plus symbol or focused check.
- **INFERENCE** — follows from verified behavior but is not itself a shipped guarantee.
- **PROPOSAL REQUIRING PRODUCT ADMISSION** — future content or implementation; not canon or scheduled work.
- **UNKNOWN / BLOCKED** — the base does not establish the needed fact, or a protected owner must provide it.

Per the task statement, **PQ-017 is in progress and not yet integrated**. No additional PQ-017 fact, ID, event, schema, or candidate behavior is claimed.

Every mission name, archetype ID, stage ID, branch label, quantity, payout, collateral value, and duration below is a **PROPOSAL REQUIRING PRODUCT ADMISSION**.

## 1. Executive decision

**Decision: retain the additive architecture for controller review; admit neither concept yet.**

The smallest safe design is two three-stage set-piece chains compiled through the existing `SET_PIECE_MISSIONS` → `buildSetPieceMissionOffers()` → ordinary mission-board and mission-lifecycle path. No parallel quest manager, save root, reward writer, faction writer, heat writer, cargo writer, UI system, worldbuilding authority, item, or authored location is proposed.

1. **Rank 1 — `gold_corridor_anvil_margin`: PROPOSAL REQUIRING PRODUCT ADMISSION; CONTRACT-BLOCKED.** It uses only verified frozen-base Tethys, Anvil, Helios, and Pallas locations. It is blocked because base `planet:harvest` emits only `{ commodityId, qty, siteId }`: no actor, owner receipt ID, event tick, or event time. The controller must prove both player-only emission and deterministic exact-once identity. If either guarantee requires a planet-owner change, stop and request a separately owned planet-harvest contract packet.
2. **Rank 2 — `gold_corridor_belt_handoff`: PROPOSAL REQUIRING PRODUCT ADMISSION; DEPENDENCY-BLOCKED.** It proposes no location beyond a separately integrated PQ-017 World Site, but has no valid base-commit site binding. It remains blocked until the controller supplies an integrated, save-stable site identity and an exact industrial-beam/World Site receipt contract.

No NPC-job laundering is permitted. Ambient traffic, natural NPC jobs, automation, passive production, and non-player survey/harvest/salvage/transfer events never become synthetic player mission proof.

## 2. Current-state inventory at the exact base

### 2.1 Mission architecture

| Claim | Status | Ground |
|---|---|---|
| Ten ordinary mission types include cargo delivery, salvage retrieval, escort, smuggling, and recon. | **VERIFIED** | [src/data/missions.js](../../../src/data/missions.js), `MISSION_TYPES`. |
| Five authored set-piece archetypes compile into ordinary sequential offers. | **VERIFIED** | `SET_PIECE_MISSIONS`, `SET_PIECE_ARCHETYPE_IDS`, `validateSetPieceMissionCatalog()`. |
| The validator requires two branches, 3–4 accepted stages per route, valid IDs/references, branch collateral, and at least one clause per route. | **VERIFIED** | `validateSetPieceMissionCatalog()`; [test/depth-program-sp1-setpieces.test.mjs](../../../test/depth-program-sp1-setpieces.test.mjs); [test/mission-shape-depth.test.mjs](../../../test/mission-shape-depth.test.mjs). |
| Chain, stage, branch, attempt, offer, and fingerprint identities are deterministic. | **VERIFIED** | [src/systems/setPieceMissionOffers.js](../../../src/systems/setPieceMissionOffers.js), `chainIdFor()`, `buildOffer()`, `buildSetPieceMissionOffers()`. |
| First failure produces one reduced-stake retry; second failure is terminal. | **VERIFIED** | `advanceSetPieceMission()` and the two focused tests above. |
| Boards, active missions, `cause`, receipts, and `setPieceSettlements` carry save/reload continuity. | **VERIFIED** | [src/systems/missions.js](../../../src/systems/missions.js), serialize/deserialize and receipt paths; save/reload focused tests. |
| Branch siblings are ordinary offers and are withdrawn atomically only on accepted branch activation. | **VERIFIED** | Mission acceptance and `_withdrawSetPieceChoiceOffers()` in `src/systems/missions.js`. |
| `repeatable` is not consulted by `_syncSetPieceOpeningOffers()`. | **VERIFIED** | `src/systems/missions.js`. |
| Therefore `repeatable: false` is not currently a one-shot guarantee. | **INFERENCE** | Requires mission-owner implementation and regression proof. |
| Generic `recon_scan` counts generic destination-sector scans unless a specialized objective intercepts them. | **VERIFIED** | `missions._onScan()`. |
| Mission settlement routes credits and reputation through owner events; cargo uses canonical helpers. | **VERIFIED** | `missions._completeMission()`, `_failMission()`, `_expireMission()`, acceptance and dock-delivery paths. |
| The mission log is read-only and already exposes objective, next step, timer, reward, progress, tracking, and abandonment. | **VERIFIED** | [src/ui/screens/missionLog.js](../../../src/ui/screens/missionLog.js), file contract and presentation helpers. |

### 2.2 Existing locations, items, and verbs

| Claim | Status | Ground |
|---|---|---|
| `station_tethys`, `station_customs`, `poi_tethys_weigh`, and `poi_tethys_customs_log` exist in Tethys Junction. | **VERIFIED** | [src/data/sectors.js](../../../src/data/sectors.js), `sector_tethys_junction`. |
| `station_helios` and `station_smuggler` are existing destinations. | **VERIFIED** | `sector_helios_prime` and `sector_pallas_drift` in `src/data/sectors.js`. |
| `planet_tethys_anvil` / `zone_tethys_anvil` is the existing Tethys planet site. | **VERIFIED** | [src/data/planets.js](../../../src/data/planets.js), `PLANET_SITE`. |
| The Anvil yields existing `cmdty_gas_hydrogen` and `cmdty_gas_helium3`. | **VERIFIED** | `PLANET_SITE.harvest`. |
| Hydrogen, scrap metal, salvage electronics, and classified salvage are existing commodities. | **VERIFIED** | [src/data/commodities.js](../../../src/data/commodities.js), `COMMODITIES`. |
| Existing set pieces already use preloaded `cmdty_classified_salvage` and clauses `no_kills`, `cargo_intact`, and `no_scan`. | **VERIFIED** | `SET_PIECE_MISSIONS` in `src/data/missions.js`. |
| Rank 1 uses only the verified locations above. | **VERIFIED BINDING SET** | No new location is introduced. |
| Rank 2 adds no location beyond a separately integrated PQ-017 World Site, but this audit has no valid base site ID or binding. | **UNKNOWN / BLOCKED** | PQ-017 is in progress and not yet integrated. |

### 2.3 Owner-event and interaction seams

| Claim | Status | Ground |
|---|---|---|
| `planet:harvest` emits exactly `commodityId`, `qty`, and `siteId`. | **VERIFIED** | [src/systems/planetRuntime.js](../../../src/systems/planetRuntime.js), `_settle()`. |
| It has no actor/player field, receipt ID, event tick, or event time. | **VERIFIED** | The emitted object in `_settle()` contains only those three fields. |
| Player-only provenance and exact-once deterministic identity are not established. | **UNKNOWN / BLOCKED** | A consumer cannot create exact-once truth from the three-field payload. There is no `simTick` field to hash. |
| The industrial beam exposes `cut`, `extract`, `repair`, and `transfer`. | **VERIFIED** | [src/combat/industrialBeam.js](../../../src/combat/industrialBeam.js), `resolveBeamVerb()`. |
| `beam:transferred` exposes only `targetId`; it does not prove site, receiver, commodity, quantity, actor, or exact-once identity. | **VERIFIED** | [src/systems/mining.js](../../../src/systems/mining.js), `_applyTransfer()`. |
| Base asteroid-site `transferGoods()` returns movement but does not emit a detailed mission-grade receipt. | **VERIFIED** | [src/systems/asteroidSites.js](../../../src/systems/asteroidSites.js), `transferGoods()`. This is base behavior, not a PQ-017 claim. |
| Heat is sole-writer-owned and reacts to contraband/law events. | **VERIFIED** | [src/systems/heat.js](../../../src/systems/heat.js), ownership header and event handlers. |

## 3. Architecture, event flow, and data flow

### 3.1 Existing path to preserve

```text
station board refresh / dock
  -> missions._syncSetPieceOpeningOffers()
  -> buildSetPieceMissionOffers(state, cursor)
  -> ordinary board offer { id, type, params, station, cause }
  -> read-only acceptance preflight
       standing + affordability + canonical cargo footprint/capacity
       rejection => no charge, cargo mutation, active mission, or offer loss
  -> successful atomic acceptance
       withdraw selected branch sibling(s)
       emit economy charge intent
       insert ordinary active mission
       preload cargo through cargo owner when specified
  -> owner event / ordinary objective event
  -> missions exact observer updates mission-owned progress only
  -> _completeMission() / _failMission() / _expireMission()
  -> economy/faction/cargo owner routing + set-piece receipt
  -> advanceSetPieceMission()
       next stage / two branch siblings / one reduced-stake retry / terminal receipt
```

### 3.2 Consumer contract

A future mission observer may consume only facts carrying enough owner truth:

```js
observeSetPieceFact({
  factKind,
  ownerReceiptId,
  actorId,
  stableSourceId,
  stableTargetId,
  commodityId,
  qty,
})
```

The exact API is not prescribed. The behavioral contract is:

1. inspect only active, unsettled matching attempts;
2. match set-piece source, archetype, stage, attempt, and immutable expected IDs;
3. require `actorId === state.playerId`, or a controller-approved producer contract proving the event family is player-only;
4. require positive accepted quantity where applicable;
5. reject NPC jobs, ambient traffic, automation, and non-player provenance;
6. require an owner-issued deterministic receipt/correlation identity with documented duplicate semantics;
7. retain a bounded owner-receipt set inside the ordinary mission record;
8. update mission-owned progress only;
9. settle through existing mission paths only when all predicates hold.

No mission listener may grant credits, mutate reputation, alter heat, move cargo, harvest a planet, create/change a World Site, drive the beam, or poll owner stores to manufacture success.

### 3.3 Save flow

Stable stage/branch/attempt IDs, expected source IDs, optional stable World Site binding, provenance counters, and bounded owner receipt IDs remain inside ordinary offers/active missions and serialize through existing mission ownership. No new save root or migration is proposed.

On Continue, owner actions are not replayed. If an owner re-emits a durable receipt, its deterministic identity suppresses duplicate progress. An event family without such identity remains blocked. Missing optional fields normalize to “no proof,” never automatic completion.

## 4. Ranked mission concepts

### 4.1 Rank 1 — `gold_corridor_anvil_margin`

> **PROPOSAL REQUIRING PRODUCT ADMISSION · CONTRACT-BLOCKED**

Purpose: place a recoverable Tethys decision after the opening teaching window using only verified existing locations and goods.

Deterministic opening proposal:

- board: `station_tethys`;
- physical arrival is the pacing gate; no wall-time or story-beat gate;
- existing standing/risk gate applies;
- no active/posted same-archetype chain;
- no durable terminal settlement for this proposed non-repeatable archetype;
- implementation remains stopped until the harvest contract is proven player-only and exact-once.

| Stage | Proposed ID | Existing type / clause | Existing binding | Provisional stake | Required proof |
|---|---|---|---|---|---|
| Common 0 | `survey_tethys_approach` | `recon_scan` | `station_tethys`; `poi_tethys_weigh`; `poi_tethys_customs_log`; `faction_scn` | R1; 720 cr; 0 collateral; 1,500 s | Two distinct post-acceptance stable-source investigation receipts. Generic pulses, duplicate receipts, and unrelated targets do not count. Stop if existing scanner receipts cannot expose stable source IDs without an owner change. |
| Common 1 | `recover_anvil_sample` | `salvage_retrieval` | `planet_tethys_anvil`; 2u `cmdty_gas_hydrogen`; return `station_tethys`; `faction_mts` | R1; 1,180 cr; 240 collateral; 1,500 s | Capacity preflight for 2u hydrogen, then ordinary dock delivery plus controller-proven player-only, deterministic exact-once harvest receipts for the exact site/commodity and positive accepted quantity. Bought gas, NPC jobs, ambient harvest, wrong site, wrong commodity, zero quantity, and duplicate receipts do not count. Base `planet:harvest` alone is insufficient. |
| Branch A | `escort_verified_manifest` | `escort`; `no_kills` | destination `station_helios`; `faction_scn` | R2; 1,680 cr; 420 collateral; 1,800 s | Existing escortee-alive dock-arrival path. |
| Branch B | `fence_sealed_record` | `smuggling_run`; `no_scan` | preloaded 1u `cmdty_classified_salvage`; destination `station_smuggler`; `faction_quiet` | R3; 2,080 cr; 560 collateral; 1,800 s | Capacity preflight before any mutation; ordinary covert delivery. Existing scan/bust fails the mission and heat changes only through the heat owner. |

Failure/recovery proposal:

- expiry, abandonment, escort loss, or scan bust uses existing settlement semantics;
- first mission failure posts one reduced-stake retry; second failure is terminal;
- capacity rejection is not a mission failure: it preserves attempt zero, payout, collateral, fingerprint, and offer identity;
- no synthetic replacement cargo within an active attempt;
- preloaded retry cargo appears exactly once after prior-attempt cleanup;
- the opening does not reappear after durable terminal settlement once `repeatable:false` is actually enforced.

### 4.2 Rank 2 — `gold_corridor_belt_handoff`

> **PROPOSAL REQUIRING PRODUCT ADMISSION · DEPENDENCY-BLOCKED**

Purpose: place a compact Ceres survey/recovery/choice route around a separately integrated PQ-017 World Site. This proposal adds no location beyond that dependency and claims no valid base-commit site binding.

Deterministic opening proposal after dependency admission:

- board: `station_beltout`;
- integrated owner exposes one or more eligible, save-stable site IDs in `sector_ceres_belt`;
- candidate IDs are sorted bytewise before deterministic seeded selection;
- the selected stable ID enters offer/chain identity before display;
- transient entity IDs are forbidden;
- the same binding survives failure and retry;
- no offer posts at the audited base because no valid binding exists.

| Stage | Proposed ID | Existing type / clause | Existing binding | Provisional stake | Required proof |
|---|---|---|---|---|---|
| Common 0 | `survey_bound_world_site` | `recon_scan` | `station_beltout`; future owner-stable site ID; `faction_dmc` | R1; 680 cr; 0 collateral; 1,500 s | One exact post-acceptance survey/investigation receipt for the bound stable site. Generic Ceres scans do not count. |
| Common 1 | `cut_transfer_recovery` | `salvage_retrieval` | same site; existing `cut` + `transfer` or admitted equivalent; existing scrap/electronics; return `station_beltout` | R2; 1,260 cr; 280 collateral; 1,800 s | Capacity preflight for the admitted cargo. Owner-issued deterministic exact-once receipt must prove site, player actor, verb, stable target/receiver, commodity, and positive moved quantity; then ordinary dock delivery. `beam:transferred {targetId}` cannot satisfy it. |
| Branch A | `deliver_recovery_record` | `cargo_delivery`; `cargo_intact` | preloaded 1u `cmdty_classified_salvage`; destination `station_tethys`; `faction_dmc` | R2; 1,720 cr; 440 collateral; 1,600 s | Atomic capacity preflight, then ordinary exact-destination handoff. |
| Branch B | `fence_recovery_record` | `smuggling_run`; `no_scan` | preloaded 1u `cmdty_classified_salvage`; destination `station_smuggler`; `faction_quiet` | R3; 2,180 cr; 600 collateral; 1,700 s | Same atomic capacity preflight, then ordinary covert handoff; law/heat stay owner-routed. |

Required future World Site contract facts:

- stable `siteId` and stable target/receiver identity;
- player/actor identity;
- accepted existing verb;
- commodity and positive moved quantity;
- owner-issued deterministic receipt/correlation ID with duplicate semantics;
- explicit result and save/load re-emission behavior.

Tick/time may be supporting context but never substitutes for deterministic identity. If facts arrive across events, they may be joined only by an owner-issued stable correlation key. No joining by “latest target,” nearest entity, array order, cargo delta, or mutable site store.

Site absence before acceptance prevents posting. Site loss after acceptance follows an owner-defined truthful fail/block policy. First failure retries only against the same still-eligible binding; otherwise it terminates rather than silently rebinding.

## 5. Capacity preflight and rejection atomicity

The future focused suite must cover every cargo-bearing acceptance:

1. Rank 1 `recover_anvil_sample`: canonical capacity for 2u hydrogen.
2. Rank 1 `fence_sealed_record`: one preloaded classified-salvage unit.
3. Rank 2 `cut_transfer_recovery`: admitted recovery commodity/quantity.
4. Both Rank 2 branch payloads: one preloaded classified-salvage unit each.

For each deliberately insufficient hold, rejected acceptance must prove all of these together:

- zero `economy:chargeCredits` intents for collateral or upfront cost;
- byte-equivalent cargo items, `usedVolume`, and `usedMass`;
- no active mission and no mission-progress mutation;
- the offer remains on its board;
- at a choice, both siblings remain with unchanged IDs, fingerprints, rewards, collateral, and attempt;
- after capacity is freed, the same offer accepts successfully at attempt zero without reduced stake;
- preloaded cargo appears exactly once;
- sibling withdrawal occurs only after successful acceptance.

A capacity rejection is an acceptance retry, not the set-piece’s reduced-stake mission retry. If preflight passes but cargo preload still partially fails, stop and request the appropriate mission/cargo-owner repair packet; do not charge first and refund later.

## 6. Stable-ID and determinism strategy

Proposed static IDs:

- archetypes: `gold_corridor_anvil_margin`, `gold_corridor_belt_handoff`;
- Rank 1 stages: `survey_tethys_approach`, `recover_anvil_sample`, `escort_verified_manifest`, `fence_sealed_record`;
- Rank 1 branches: `escort_manifest`, `fence_record`;
- Rank 2 stages: `survey_bound_world_site`, `cut_transfer_recovery`, `deliver_recovery_record`, `fence_recovery_record`;
- Rank 2 branches: `deliver_record`, `fence_record`.

Copy references continue through `mission.sp1.<archetype>.<stage>.<phase>`. IDs are never recycled for different semantics.

Offers use `state.meta.seed`, board epoch, stable IDs, attempt, and any admitted stable binding. Never use `Date.now()`, `Math.random()`, object insertion order, nearest entity, current array order, or transient runtime IDs.

An owner-issued deterministic receipt/correlation ID is mandatory for Rank 1 harvest and Rank 2 site/beam progress. Do not invent `simTick`, hash cumulative quantity, use event-arrival order, or infer identity from current cargo/owner state. Owner-receipt storage stays bounded.

## 7. Exact future write-set proposal

This section is a proposal, not authorization.

### 7.1 Rank 1 conditional mission packet

Rank 1 has no valid packet until the harvest contract is proven. If a planet change is needed, issue a separate planet-owner packet first; the mission packet must not absorb `src/systems/planetRuntime.js`.

After proof, proposed mission-owned writes are exactly:

- `src/data/missions.js` — add one archetype and validator ID; use existing types/items/clauses only;
- `src/data/flavor/090-set-piece-missions.js` — operational, non-canonical stage copy;
- `src/systems/missions.js` — enforce `repeatable:false`, exact survey correlation, consume admitted harvest receipts, preserve owner routing, and enforce capacity rejection atomicity;
- `test/depth-program-sp1-setpieces.test.mjs`;
- `test/mission-shape-depth.test.mjs`;
- new `test/gold-corridor-mission-pack.test.mjs`.

The focused test owns: player-only/exact-once harvest contract consumption, duplicate suppression, no NPC-job laundering, capacity rejection/acceptance retry, branch atomicity, failure/expiry/retry, save/Continue, and single-writer spies.

`src/data/flavor/index.generated.js` is never hand-edited. Regeneration requires its serialized owner or a controller-approved combined packet.

### 7.2 Rank 2 conditional mission packet

No packet exists until PQ-017 is separately integrated and the controller freezes its stable ID/receipt contract.

After that handshake, the proposed paths are the same six mission/test paths above. Add `src/systems/setPieceMissionOffers.js` only if a generic immutable `bindings` field is required to place the stable site ID into offer identity before display; that expansion needs separate deterministic review.

### 7.3 Explicitly excluded paths

No mission packet may edit:

- PQ-017 candidate or World Site owner files;
- planet runtime/data unless a separate planet-owner contract packet is issued;
- industrial beam, mining, cargo, economy, factions, heat;
- registry, save-schema, package, scripts, generated indexes without their owner;
- renderer, graphics, Blender, assets, manifests, browser-GPU;
- HUD/UI, input, combat, AI, Massline, tether;
- worldbuilding or shared program ledgers.

## 8. Mutex, dependency, and collision analysis

| Surface | Collision | Required disposition |
|---|---|---|
| Mission catalog | Hardcoded archetype count/allowlist and focused expectations. | Change data and both focused tests atomically. |
| One-shot opening | `repeatable` currently ignored. | Mission-owner fix scoped only to explicit `false`; prove legacy repeatable chains still repeat. |
| Recon | Generic in-sector scans currently count. | Specialized stable-source path only; no global recon rewrite. |
| Planet harvest | Base event lacks player-only/exact-once proof. | Rank 1 blocked; controller proof or separate planet contract packet. |
| Capacity/preload | Late load failure could occur after charge/branch mutation if preflight is wrong. | Test every Section 5 case; mismatch is a stop, not charge/refund compensation. |
| PQ-017 / World Site | Concurrent protected dependency. | Rank 2 has no base binding; wait for separate integration receipt and contract. |
| Industrial beam | `beam:transferred` carries only `targetId`. | Consume a future owner receipt; never infer from cargo/site stores. |
| NPC jobs/ambient sim | Natural jobs may emit superficially similar facts. | Require actor equality or proven player-only family; event storm must leave progress unchanged. |
| Economy/faction/cargo/heat | Sole-writer domains. | Existing intents/helpers/events only; mission tests spy against direct mutation. |
| Save | Mission serialization is the intended carrier. | No new root/version; stop if required fields are dropped. |
| Board crowding | Authored, story, causal, career, and procedural rows coexist. | One opening per new board, non-repeatable semantics, board-budget test; no Helios opening. |
| Flavor index | Generated owner. | Serialize regeneration; never bypass. |
| UI/render/input/browser | Protected concurrent lanes. | Existing board/log/marker/input route must suffice or the packet stops. |

Rank 1 dependencies: exact Tethys POI identity; controller-proven player-only and exact-once harvest contract; ordinary cargo handoff; existing escort/smuggling lifecycle; enforceable one-shot opening; flavor-index owner.

Rank 2 dependencies: admitted generic mission-framework work; separately integrated PQ-017; owner-stable site ID; exact interaction receipt; deterministic pre-display binding; no protected producer edits by the mission packet.

## 9. Constraints

### 9.1 Determinism

- Same seed/epoch/binding produces byte-equivalent offers.
- Binding enters fingerprint before display or acceptance.
- Retry changes only `attempt` and reduced stake; it does not rebind.
- Each target/owner receipt counts once.
- No identity is derived from nonexistent `simTick`, cumulative quantity, arrival order, cargo delta, or mutable owner state.
- Save/load produces the same next offer, branch pair, retry, and terminal receipt as uninterrupted play.

### 9.2 Single writers

- Economy owns credits/collateral.
- Cargo owns items, mass, and volume.
- Factions own reputation/hostility.
- Heat owns WANTED state.
- Planet owns harvest/runtime.
- World Site owner owns site state/transfer.
- Beam/mining own action execution.
- Missions alone own board rows, active progress, branch, retry, and mission receipts.

### 9.3 Save safety

Persist stable IDs and bounded owner receipts, never transient entity IDs. Save/Continue proof is required after acceptance, partial survey, harvest before dock, branch posting, branch acceptance, first failure, and retry success. Continue must not duplicate owner actions, rewards, collateral, cargo, escortees, siblings, or openings.

### 9.4 Accessibility

Every objective, capacity denial, collateral risk, clause, legal consequence, failure reason, and recovery action must be text-visible in the existing board/log path. No essential information may depend on color, sound, particles, haptics, or transient toast. Keyboard/controller, large text/narrow viewport, reduced-motion, and reduced-flash routes must remain operable. If a new binding, screen, or HUD control is required, stop.

### 9.5 Performance

Event-driven observers only; no new `update(dt)` loop or owner-state polling. Inspect at most the existing active-mission cap and use direct stable-ID comparisons. Receipt sets remain bounded. No new renderer, entity, asset, particle, audio, or browser-GPU cost is proposed. An irrelevant-event storm must allocate no unbounded history and make no progress.

## 10. Adversarial failure modes

| Failure | Guard / proof |
|---|---|
| Any Tethys scan completes Rank 1 survey. | Exact two-source allowlist; generic/wrong/duplicate scan tests remain zero. |
| Pre-acceptance owner facts are imported. | Observe only current active attempt; historical producer activity remains zero after acceptance. |
| Same owner receipt re-emits after load. | Deterministic owner ID dedupes; without owner identity admission stops. |
| Bought hydrogen satisfies provenance. | Separate owner-receipt provenance plus current cargo at dock. |
| Wrong site/gas, zero quantity, NPC job, or ambient harvest counts. | Exact site/commodity/player contract/positive quantity; no progress. |
| Planet event is not provably player-only. | Rank 1 remains blocked; separate planet contract packet. |
| Planet event lacks deterministic identity. | No mission-derived key; separate owner contract or stop. |
| Rank 1 hydrogen offer lacks capacity. | Reject with zero charge/cargo/active/offer loss; same attempt-zero offer succeeds after freeing space. |
| Rank 2 recovery offer lacks capacity. | Same full atomic rejection and successful acceptance retry. |
| Preloaded branch offer lacks capacity. | Both siblings survive unchanged; selected payload loads once only after capacity is available. |
| Capacity rejection increments attempt or reduces stake. | IDs, fingerprint, reward, collateral, and attempt remain unchanged. |
| Preflight passes but preload partially fails. | Stop and request owner repair; no charge-first/refund-later design. |
| Branch siblings both survive successful acceptance. | Existing atomic withdrawal regression test: exactly one chosen route remains. |
| Retry duplicates preloaded cargo. | Prior-attempt cleanup plus exact one-unit inventory delta. |
| One-shot opening reposts next epoch. | Durable terminal settlement blocks repost; legacy repeatables still repeat. |
| Rank 2 binds a placeholder/transient base site. | No base binding; only separately integrated stable ID admitted. |
| Cut and transfer belong to different targets or zero movement. | Owner correlation key and exact stable target/receiver; incomplete otherwise. |
| Site disappears between attempts. | Same binding only; owner-defined failure/block, never silent rebind. |
| Escort arrival/death races. | One ordered settlement and one receipt. |
| Scan bust double-penalizes mission/heat. | One mission settlement; heat remains owner canonical. |
| NPC job/ambient event satisfies player stage. | Actor/player-only contract and owner receipt; event storm leaves progress unchanged. |
| Board row crowds first/recommended contract. | Board-budget and first-contract route regression. |
| UI exposes risk only by color/icon. | Text-equivalent objective, clause, collateral, capacity, and legal consequence. |

## 11. Phased implementation plan and stop conditions

### Phase 0 — Controller admission contracts

Approve or replace IDs/copy/tuning; identify flavor-index owner; prove stable Tethys survey IDs; prove Rank 1 harvest is player-only and exact-once; otherwise issue a separate planet-owner contract packet. For Rank 2, provide no implementation authority until PQ-017 is separately integrated.

**Stop if:** any mission-side invention of actor/identity, new location/item/canon/UI/writer/save root, unowned protected producer edit, or unsupported PQ-017 integration claim is required.

### Phase 1 — Catalog shape

Add Rank 1 data/copy and compile both three-stage branches. Prove existing types/items/locations/clauses only, unique IDs, copy refs, deterministic offers, no Helios opening, and valid route lengths.

**Stop if:** harvest contract is unresolved, a new mission type/compiler path is needed, or generated-index ownership is unavailable.

### Phase 2 — Mission-owned observers and one-shot rule

Consume admitted survey and harvest receipts; implement exact correlation and `repeatable:false`; add capacity rejection atomicity.

Required proof: legacy repeatables repeat; Rank 1 does not; wrong/pre-acceptance/duplicate/NPC/ambient facts stay zero; every Section 5 rejection is side-effect-free and succeeds after capacity is freed.

**Stop if:** scanner producer changes are needed, planet proof remains ambiguous, exact identity is absent, or mission serialization drops required fields. A needed planet change becomes a separate packet.

### Phase 3 — Rank 1 lifecycle

Prove both branches, completion, expiry, abandonment, escort loss, scan bust, one reduced-stake retry, terminal second failure, branch atomicity, preload cleanup, save/Continue, and sole-writer routing.

### Phase 4 — Rank 1 player route

Across required careers, capture natural Tethys arrival, decline/accept, both branches, low-capacity rejection and successful acceptance retry, low-credit denial, failure/recovery, route economics, keyboard/controller, accessibility settings, and save/Continue. No dev injection or fabricated owner receipt.

**Stop if:** the route crowds teaching, misses the intended 55–90 minute window, strands the player, or needs inaccessible precision/new UI.

### Phase 5 — Rank 2 dependency handshake

After separate PQ-017 integration, freeze stable site identity, eligibility surface, receipt fields, duplicate/save semantics, availability policy, and whether generic compiler binding is needed.

**Stop if:** any fact is transient, mutable-only, unknown, or available only through a protected producer edit by the mission agent.

### Phase 6 — Rank 2 implementation and route proof

Use the conditional write set only after Phase 5. Repeat catalog, determinism, capacity, lifecycle, save, accessibility, economics, and natural Ceres route proof. The absence of an eligible site must leave normal Ceres play intact.

### Phase 7 — Controller integration

Only the controller may run integration lanes, update authoritative ledgers, and issue a stronger receipt. This handoff cannot claim `implemented`, `focused_green`, `route_accepted`, or `integrated`.

## 12. Focused checks and player-route evidence

### 12.1 Planning checks performed

- exact base and branch ancestry inspected;
- required authority/status/task sources read;
- directly relevant mission, sector, planet, scanner, beam, mining, heat, base-site, commodity, mission-log, and focused-test surfaces inspected;
- repository claims separated as verified/inference/proposal/unknown;
- Markdown relative-link target list retained and revalidated;
- JSON fences parsed; code fences balanced; trailing whitespace/tabs rejected;
- no runtime, browser, GPU, asset, save-schema, generated-index, worldbuilding, or program-ledger change performed.

### 12.2 Future focused checks

```bash
node --test test/depth-program-sp1-setpieces.test.mjs
node --test test/mission-shape-depth.test.mjs
node --test test/gold-corridor-mission-pack.test.mjs
node scripts/check-depth-program-sp1-duration.mjs
git diff --check -- src/data/missions.js \
  src/data/flavor/090-set-piece-missions.js \
  src/systems/missions.js \
  test/depth-program-sp1-setpieces.test.mjs \
  test/mission-shape-depth.test.mjs \
  test/gold-corridor-mission-pack.test.mjs
```

If Rank 2 needs generic immutable binding, add `src/systems/setPieceMissionOffers.js` to the deterministic and diff matrix.

Focused traces must identify seed, commit, chain/stage/branch/attempt, owner receipt IDs, accepted/rejected facts, exact owner intents/deltas, and next offers. Test traces are evidence only, not a runtime save root.

### 12.3 Player-route acceptance matrix

For every required career:

1. existing first contract remains reachable and recommended;
2. Ceres remains playable with Rank 2 absent/ineligible;
3. Rank 2 appears only after a valid integrated site binding and only once;
4. Rank 1 appears at Tethys once and can be declined;
5. unrelated scans cannot complete survey;
6. bought/wrong/NPC/ambient/duplicate harvest cannot complete sample;
7. Rank 1 hydrogen, Rank 1 Quiet preload, Rank 2 recovery, and both Rank 2 branch offers reject low capacity with no side effects, then accept after capacity is freed;
8. lawful escort succeeds/fails naturally;
9. Quiet delivery succeeds clean and fails on bust with owner-routed heat;
10. first mission failure retries once at reduced stake; second is terminal;
11. Continue works at all Section 9.3 boundaries;
12. failure remains economically recoverable without dev grants;
13. keyboard/controller and reduced-motion/flash routes work;
14. no dev console, direct event injection, or fabricated owner receipt is used;
15. evidence names exact commit and seed;
16. a 90-minute run shows no duplicate opening, settlement, cargo, sibling, or owner-state corruption.

## 13. Unresolved questions

1. Do existing signal-investigation receipts expose the two stable Tethys POI IDs without scanner-owner changes?
2. Can the controller prove every `planet:harvest` emission represents only player-accepted cargo?
3. What owner-issued deterministic receipt/correlation ID provides exact-once harvest semantics across save/load and listener reattachment?
4. If either harvest guarantee needs code, which separately owned planet contract packet will provide it?
5. Should terminal second failure permanently settle a non-repeatable chain? This report recommends yes.
6. Which owner approves operational non-canonical copy?
7. Are proposed rewards, collateral, durations, and 2u hydrogen viable across real career cohorts and costs?
8. What board-row budget is acceptable at Tethys and Belt Outpost?
9. Is classified salvage approved for all proposed preloaded branches?
10. Which owner regenerates/verifies the flavor index?
11. What stable site ID, eligibility surface, and lifetime will separately integrated PQ-017 expose?
12. What exact owner receipt proves positive World Site/beam movement with actor, site, verb, target/receiver, commodity, quantity, identity, and duplicate semantics?
13. Can the stable site binding enter offer identity without changing the compiler?
14. What is the truthful policy if a bound site becomes unavailable?
15. Do Ceres and Tethys naturally fall in the intended 30–60 and 55–90 minute windows for all careers?
16. Can existing board/log copy expose provenance, capacity, legal risk, and recovery without UI edits?

## 14. Controller-ready acceptance checklist

### Planning packet

- [ ] Marked **NON-AUTHORITATIVE**, **PLANNING-ONLY**, and **NOT INTEGRATED**.
- [ ] Base is exactly `8f1c630f5ebf26f209052b8164f3cdf024ffd06f`.
- [ ] Exactly one new allowed handoff file changed.
- [ ] No protected path, existing handoff, runtime, test, script, asset, program ledger, or worldbuilding changed.
- [ ] Every repository claim has path/symbol/check grounding.
- [ ] Every concept is labeled **PROPOSAL REQUIRING PRODUCT ADMISSION**.
- [ ] PQ-017 is described only as in progress and not yet integrated.
- [ ] Rank 1 uses only verified base locations.
- [ ] Rank 2 claims no base binding and no location beyond separately integrated PQ-017.
- [ ] No new canon, item, writer, UI, save root, or worldbuilding authority.
- [ ] Markdown links resolve.
- [ ] ZIP contains exactly report plus `manifest.json`.

### Rank 1 admission

- [ ] Base `planet:harvest` insufficiency acknowledged: only `commodityId`, `qty`, `siteId`.
- [ ] Controller proves player-only emission.
- [ ] Controller proves deterministic exact-once owner identity and duplicate semantics.
- [ ] If proof needs planet code, separate owner packet is issued and Rank 1 stays stopped.
- [ ] Tethys survey identity proven.
- [ ] One-shot terminal semantics approved.
- [ ] Commodity/tuning/copy approved.
- [ ] Generated-index owner and exact mission write set claimed.
- [ ] 2u hydrogen and Rank 1 Quiet capacity atomicity approved.

### Rank 1 focused acceptance

- [ ] Catalog/flavor and legacy-repeatable regressions pass.
- [ ] Rank 1 opening is one-shot.
- [ ] Wrong/pre-acceptance/duplicate/NPC/ambient facts do not progress.
- [ ] Bought cargo cannot satisfy provenance.
- [ ] Hydrogen and Quiet capacity rejection causes zero charge/cargo/active/offer loss and accepts at attempt zero after freeing capacity.
- [ ] Cargo/economy/faction/heat ownership checks pass.
- [ ] Both branches complete through normal input.
- [ ] Escort loss and bust fail once and recover once.
- [ ] Second failure terminal; save/Continue safe.
- [ ] Board, accessibility, performance, and player-route evidence reviewed.

### Rank 2 dependency/admission

- [ ] Controller confirms separate PQ-017 integration outside this handoff.
- [ ] No valid base-commit site binding is claimed.
- [ ] Stable site ID/eligibility documented after integration.
- [ ] Exact World Site/beam receipt documented.
- [ ] No protected producer edit required by mission packet.
- [ ] Binding enters identity before display.
- [ ] Unavailable-site/retry policy approved.
- [ ] Recovery cargo and both preloaded branches pass full atomic capacity rejection and successful acceptance retry.
- [ ] Rank 2 write set re-issued after dependency inspection.
- [ ] Full focused and route proof precedes integration.

## 15. SpaceFace receipt

```json
{
  "taskId": "SF-PORT-08",
  "title": "Additive Gold Corridor mission-pack design",
  "baseCommit": "8f1c630f5ebf26f209052b8164f3cdf024ffd06f",
  "requestedBranch": "agent/chatgpt-gold-corridor-missions-20260723",
  "disposition": "returned",
  "status": "planning_complete",
  "authority": "non-authoritative",
  "workClass": "planning-only",
  "integrationState": "not-integrated",
  "rank1AdmissionState": "blocked_pending_player_only_and_exact_once_planet_harvest_contract",
  "rank2AdmissionState": "dependency_blocked_pending_separately_integrated_pq017_world_site_binding",
  "changedFilesExpected": [
    "docs/handoffs/chatgpt-portfolio-20260723/ADDITIVE_GOLD_CORRIDOR_MISSION_PACK.md"
  ],
  "runtimeImplementation": false,
  "focusedRuntimeChecksRun": false,
  "playerRouteAccepted": false,
  "programLedgersUpdated": false,
  "pq017Statement": "in progress and not yet integrated"
}
```

This receipt claims only `returned` and `planning_complete`.

## 16. Repository references

- [Mission data and catalog](../../../src/data/missions.js)
- [Set-piece compiler](../../../src/systems/setPieceMissionOffers.js)
- [Mission lifecycle owner](../../../src/systems/missions.js)
- [Set-piece flavor source](../../../src/data/flavor/090-set-piece-missions.js)
- [Sectors/stations/POIs](../../../src/data/sectors.js)
- [Commodities](../../../src/data/commodities.js)
- [Planet data](../../../src/data/planets.js)
- [Planet runtime](../../../src/systems/planetRuntime.js)
- [Scanner](../../../src/systems/scanner.js)
- [Industrial beam](../../../src/combat/industrialBeam.js)
- [Mining/beam consumer](../../../src/systems/mining.js)
- [Heat owner](../../../src/systems/heat.js)
- [Base asteroid-site owner](../../../src/systems/asteroidSites.js)
- [Mission log](../../../src/ui/screens/missionLog.js)
- [Set-piece focused tests](../../../test/depth-program-sp1-setpieces.test.mjs)
- [Mission-shape focused tests](../../../test/mission-shape-depth.test.mjs)
