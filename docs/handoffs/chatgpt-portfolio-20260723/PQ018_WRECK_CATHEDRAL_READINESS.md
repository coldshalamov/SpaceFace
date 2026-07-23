# SF-PORT-02 — PQ-018 Wreck Cathedral Integration Readiness

> **NON-AUTHORITATIVE · PLANNING-ONLY · NOT INTEGRATED**
>
> Historical handoff prepared against exact base commit `8f1c630f5ebf26f209052b8164f3cdf024ffd06f` on 2026-07-23. This file records an audit and a conditional implementation plan. It does not amend the canonical build map, program queue, runtime, assets, manifests, save schema, registry, package scripts, or acceptance state.

| Field | Value |
|---|---|
| Task ID | `SF-PORT-02` |
| Title | `PQ-018 Wreck Cathedral integration readiness` |
| Requested source branch | `codex/delegation-base-20260723` |
| Audited base commit | `8f1c630f5ebf26f209052b8164f3cdf024ffd06f` |
| Requested result branch | `agent/chatgpt-pq018-readiness-20260723` |
| Allowed output | `docs/handoffs/chatgpt-portfolio-20260723/PQ018_WRECK_CATHEDRAL_READINESS.md` |
| Runtime work | None |
| PQ-017 current status | **USER-SUPPLIED:** in progress and not yet integrated; no other current PQ-017 fact is asserted here |

## 1. Claim discipline

This packet uses five labels deliberately:

- **VERIFIED @ BASE** — observed at exact commit `8f1c630f5ebf26f209052b8164f3cdf024ffd06f`, with a repository path, symbol, data field, or check named in the same entry.
- **USER-SUPPLIED CURRENT STATUS** — supplied by the task controller and not inferred from stale repository planning records.
- **INFERENCE** — a bounded conclusion drawn from verified facts; not a repository fact.
- **PROPOSAL** — a future change or controller decision; not present at the base.
- **UNKNOWN UNTIL PQ-017 RESULT** — cannot be established honestly until the PQ-017 result commit exists and this branch is rebased onto it.

The governing order and scope rules come from [`CANONICAL_BUILD_MAP.md`](../../../CANONICAL_BUILD_MAP.md), root [`AGENTS.md`](../../../AGENTS.md), the historical program snapshot in [`design/program/NOW.md`](../../../design/program/NOW.md), the queue record in [`design/program/roadmap/program-queue.json`](../../../design/program/roadmap/program-queue.json), and the execution rules in [`design/program/roadmap/00_EXECUTION_PROTOCOL.md`](../../../design/program/roadmap/00_EXECUTION_PROTOCOL.md).

## 2. Executive decision

### Decision: **NO-GO for runtime integration at the audited base; GO for post-PQ-017 admission planning only**

1. **VERIFIED @ BASE — the authored source candidate exists and carries unusually strong source-level evidence.** The handoff names asset ID `place_landmark_wreck_cathedral`, a Blender source, an approximately 11.16 MB source GLB, three strictly reducing authored LODs, eight draw groups per LOD, eight materials, twenty-six textures, source hashes, semantic markers, sixteen captures, a clean glTF validator report, and a sampled fly-through clearance result. Its own lifecycle fields also say `SOURCE_GLB`, `runtime_wired: false`, and `route_accepted: false`. The handoff’s `state_reached: IMPLEMENTED` therefore describes source-authoring completion, not a live game feature. Evidence: [`2026-07-20-B-pq018-wreck-cathedral-source.yaml`](../../../design/graphics-sprints/handoffs/2026-07-20-B-pq018-wreck-cathedral-source.yaml).

2. **VERIFIED @ BASE — the candidate is not admitted to the release/runtime chain.** `place_landmark_wreck_cathedral` is absent from `assets/ships/parts/parts_manifest.json`, absent from the generated release manifest, and absent from `PLACE_FILES` / `PLACE_FILE_BY_ID` in `src/render/partsLibrary.js`. The source handoff explicitly records `needs_new_row`, deferred release compression, deferred runtime LOD activation, and no live route. Evidence: [`parts_manifest.json`](../../../assets/ships/parts/parts_manifest.json), [`release_manifest.json`](../../../assets/ships/release/release_manifest.json), [`partsLibrary.js`](../../../src/render/partsLibrary.js), and the source handoff above.

3. **VERIFIED @ BASE — the candidate has no canonical place identity or physical placement.** The Atlas is a deterministic read model derived from authored sector stations, gates, POIs, and zones; it is not a second authoring registry. No Wreck Cathedral record exists in the audited `sectorAnchors.js`, `sectorZones.js`, or additive `authoredPlaces.js` seam. Evidence: [`PLACE_REGISTRATION.md`](../../../src/data/PLACE_REGISTRATION.md), [`atlasIndex.js`](../../../src/core/atlasIndex.js), [`sectorAnchors.js`](../../../src/data/sectorAnchors.js), [`sectorZones.js`](../../../src/data/sectorZones.js), and [`authoredPlaces.js`](../../../src/data/authoredPlaces.js).

4. **USER-SUPPLIED CURRENT STATUS — PQ-017 is in progress and not yet integrated.** No claim is made about its candidate files, API, schema, test names, branch, or result commit. The audited queue only establishes the intended dependency: PQ-018 follows the generic persistent multi-component site kernel. Evidence for the historical dependency only: [`program-queue.json`](../../../design/program/roadmap/program-queue.json) and [`CANONICAL_BUILD_MAP.md`](../../../CANONICAL_BUILD_MAP.md).

5. **VERIFIED @ BASE — the reusable interaction and beam owners already exist.** PQ-015’s catalog/query path provides stable entity keys, component descriptions, capability flags, eligibility, and selection without owning persisted state. PQ-016’s industrial beam/mining path already distinguishes `cut`, `extract`, `repair`, and `transfer`, including physical payload entities and owner-routed transfer. PQ-018 should adapt the future PQ-017 site contract into those owners rather than create a Cathedral-specific verb grammar. Evidence: [`interactionDescriptorCatalog.js`](../../../src/data/interactionDescriptorCatalog.js), [`entityInteractionProfiles.js`](../../../src/data/entityInteractionProfiles.js), [`interactionDescriptors.js`](../../../src/systems/interactionDescriptors.js), [`industrialBeam.js`](../../../src/combat/industrialBeam.js), and [`mining.js`](../../../src/systems/mining.js).

6. **VERIFIED @ BASE — geography is contradictory.** The older Depth H1a plan and the existing landmark-lore record place the Concord Vigilant in `sector_io_reach` / `zone_io_derelict`; the corrected sequential plan places PQ-018 in an off-lane Ceres graveyard pocket, and PQ-020 is the queued Ceres activity-pocket owner. This is a controller decision, not a mergeable detail. Evidence: [`design/depth-program/BUILD_PLAN.md`](../../../design/depth-program/BUILD_PLAN.md), [`080-landmark-lore.js`](../../../src/data/flavor/080-landmark-lore.js), [`BUILD_PLAN_CORRECTED.md`](../../../design/sequential-build-plan/REVIEW/BUILD_PLAN_CORRECTED.md), and [`program-queue.json`](../../../design/program/roadmap/program-queue.json).

7. **PROPOSAL — use Ceres as the forward planning default, but do not write placement data until the controller explicitly rules on the Io/Ceres conflict.** This preference follows the corrected sequence and the PQ-020 dependency, not an assertion that the older Io record is already obsolete. If Ceres is selected, preserve the existing `wreck_cathedral` and `c1_01`–`c1_05` lore identities while updating only the canonical location metadata through its owning data path.

8. **PROPOSAL — split future work into three serialized owners:**
   - **Asset admission:** independent art review, generated release promotion, manifest/runtime-map admission, runtime LOD/residency proof.
   - **Simulation/data wiring:** post-PQ-017 site record, stable components, operations, persistence, collision, place/Atlas identity, salvage/history receipts.
   - **Visual evidence:** browser route first, Electron parity second, three-scale and fly-through evidence, accessibility and performance measurements.

No asset, simulation, save, Atlas, browser, or acceptance state should advance merely because the source GLB is present.

## 3. Current-state inventory

| Surface | Base classification | Exact audited fact | Consequence |
|---|---|---|---|
| Source asset | **VERIFIED @ BASE** | `place_landmark_wreck_cathedral.glb` is documented as a source candidate with Blender provenance, hashes, semantic audit, validator output, three authored LODs, and capture evidence in the source handoff. | Eligible for independent admission review; not a runtime feature. |
| Source metrics | **VERIFIED @ BASE** | Bounds approximately `633.50 × 369.89 × 282.59`; LOD triangles `91,908 / 34,164 / 8,364`; eight draw groups per LOD; eight materials; twenty-six textures; estimated RGBA8+mips residency `26.667 MiB`; sampled clear fly-through envelope `72 × 58`. Source: the PQ-018 YAML handoff. | Release compression, runtime residency, collision, and live framing remain separate gates. |
| Asset provenance | **VERIFIED @ BASE** | The handoff identifies an original deterministic Blender build and no external donor asset, with a source GLB SHA-256 beginning `f335935f…` and Blender SHA-256 beginning `1bc08169…`. | Preserve source hashes through admission; any source mutation invalidates the reviewed evidence set. |
| Parts manifest | **VERIFIED @ BASE** | No `place_landmark_wreck_cathedral` row exists. `budgetClass: landmark` has broad source guards, but passing a class guard is not release acceptance. | Manifest owner must add an exact row only after review; no hand-authored runtime assumption. |
| Release artifact | **VERIFIED @ BASE** | No release-manifest record exists. The release manifest is generated and records source/release hashes, compression, bytes, textures, and contract-node counts. | Generate; never hand-edit the release manifest or fabricate a release hash. |
| Runtime place map | **VERIFIED @ BASE** | `partsLibrary.js` uses an explicit `PLACE_FILES` whitelist and derives `PLACE_FILE_BY_ID`; the Cathedral ID is absent. Missing authored slots retain procedural fallback instead of blanking an entity. | A visually plausible route can still be false-positive fallback; diagnostics must prove the authored GLB loaded. |
| Runtime preload/residency | **VERIFIED @ BASE** | `partsLibrary.js` currently treats a place within `INITIAL_PLACE_COMPOSITION_RADIUS = 700` as opening-shot composition; other place assets stream on demand. | A 633 WU hero body requires measured cold-load, upload, LOD, and residency behavior rather than an assumed preload. |
| Place/Atlas registration | **VERIFIED @ BASE** | No Cathedral station, POI, or zone record exists. `atlasIndex.js` derives sorted nodes from sectors/zones and composes sector-local coordinates through `sectorLocalToGlobalForSector`. | Add one canonical authored place path; never write a separate Atlas registry or global coordinates. |
| Ceres geography | **VERIFIED @ BASE** | Ceres has `worldRadius: 4200`, existing stations/gates/fields, `poi_driller` at `{x:240,z:-1180}`, `poi_survey`, and `zone_ceres_derelict` around the driller. | A new Cathedral cannot silently overlap, duplicate, or erase the Abandoned Driller pocket. |
| Io geography | **VERIFIED @ BASE** | Io has `poi_cruiser` at `{-1420,-780}` and `zone_io_derelict` (“Cruiser Graveyard”), matching the old H1a/lore location. | Selecting Ceres requires an explicit lore/location migration decision; selecting Io conflicts with the corrected sequence/PQ-020 plan. |
| Coordinate frame | **VERIFIED @ BASE** | Ceres global origin is `(-3×4096, +2×4096)` and Io is `(+5×4096, +5×4096)`; authored places remain sector-local. | A Helios-origin shortcut would produce a hidden frame bug. Atlas/map checks are mandatory. |
| Generic site owner | **UNKNOWN UNTIL PQ-017 RESULT** | The exact PQ-017 owner module, registry slot, record schema, action API, and serializer do not exist as authoritative facts in this audit. | Hard dependency; no Cathedral site wiring before rebase. |
| Existing `state.sites` owner | **VERIFIED @ BASE** | `asteroidSites` declares ownership of `state.sites`; `saveSystem` captures the `sites` key by calling `asteroidSites.serialize()` or cloning `state.sites`. | PQ-017 may extend, replace, or adapt this seam. PQ-018 must not create a second writer or second top-level save tree. |
| Component descriptors | **VERIFIED @ BASE** | `interactionDescriptors` is a pure read/query layer; it derives stable keys and components and owns no serialized descriptor state. | Future Cathedral components belong in the site owner and are projected through the descriptor adapter. |
| Beam verbs/payloads | **VERIFIED @ BASE** | `resolveBeamVerb` supports contextual `cut/extract/repair/transfer`; the beam can create physical payload entities, and mining routes transfers to owning systems/cargo helpers. | Reuse this path; no second beam, inventory, or payload implementation. |
| Salvage grammar | **VERIFIED @ BASE** | `SALVAGE_ACTIONS` already includes `cut_panel`, `pull_module`, `decode_blackbox`, and `vent_reactor`; `actionForWreck` is a pure classifier. | Use existing vocabulary where it fits. Add generic capability data only if the future site contract cannot express the required operation. |
| Wreck provenance | **VERIFIED @ BASE** | `check-wreck-provenance.mjs` enforces event sourcing, stable seeded IDs, bounded history, single-writer behavior, and agreement between recorded loss and wreck class. | Cathedral history must be a canonical durable receipt, not ad hoc text or a direct ledger write. |
| Cathedral lore | **VERIFIED @ BASE** | `wreck_cathedral` exists with target `landmark_c1_wreck_cathedral_concord_vigilant`, five stable lines `c1_01`–`c1_05`, and an Io location. | Reuse IDs and text; location must follow the controller’s geography ruling. |
| Ship’s Ledger | **VERIFIED @ BASE** | `shipLedger.js` is a deterministic, read-only projection over existing durable receipts and has no registry slot, serializer, event listeners, or mutations. | PQ-018 should produce a canonical receipt/history state. PQ-021 should own any new Ledger projection, avoiding a parallel ledger. |
| Unique-wreck runtime | **VERIFIED @ BASE** | `uniqueWrecks.js` owns only `state.player.uniqueWrecks`, normalizes bounded durable phases/receipts, and routes rewards through existing owners. | Useful precedent, not the default Cathedral owner: PQ-018 is explicitly downstream of the generic multi-component site kernel. |
| Collision | **VERIFIED @ BASE** | Current collision manifests use bounded planar compound primitives, never parse GLBs in sim, never render proxies, and cap expanded primitives at `32`. No Cathedral manifest exists. | Author a dedicated compound proxy preserving the fly-through opening; do not use a single bounding ball or mesh collider. |
| Runtime LOD | **VERIFIED @ BASE** | Authored LOD geometry exists in the source candidate; the handoff says runtime LOD activation is deferred. | “Three LODs in the GLB” is not proof that live selection, transitions, or material residency work. |
| Browser/Electron | **VERIFIED @ BASE** | The source handoff records no browser route, Electron route, Ceres placement, interaction, persistence, or performance acceptance. Root architecture requires the same game route in browser and Electron. | Browser proof precedes Electron parity; neither can be claimed from Blender renders. |
| PQ-017 current integration | **USER-SUPPLIED CURRENT STATUS** | In progress and not yet integrated. | Rebase gate remains closed. |

Primary evidence for this inventory: [`PQ-018 source handoff`](../../../design/graphics-sprints/handoffs/2026-07-20-B-pq018-wreck-cathedral-source.yaml), [`parts_manifest.json`](../../../assets/ships/parts/parts_manifest.json), [`release_manifest.json`](../../../assets/ships/release/release_manifest.json), [`partsLibrary.js`](../../../src/render/partsLibrary.js), [`sectors.js`](../../../src/data/sectors.js), [`sectorAnchors.js`](../../../src/data/sectorAnchors.js), [`sectorZones.js`](../../../src/data/sectorZones.js), [`sectorCoordinates.js`](../../../src/data/sectorCoordinates.js), [`asteroidSites.js`](../../../src/systems/asteroidSites.js), and [`saveSystem.js`](../../../src/save/saveSystem.js).

## 4. Known at the base versus unknowable before PQ-017 lands

### 4.1 Exact facts available now

- **VERIFIED @ BASE:** PQ-018 is ordered after PQ-017 in the canonical/queue material. The intended enabling capability is a reusable persistent multi-component site kernel, not a one-off Cathedral system. Sources: [`CANONICAL_BUILD_MAP.md`](../../../CANONICAL_BUILD_MAP.md), [`program-queue.json`](../../../design/program/roadmap/program-queue.json), and [`BUILD_PLAN_CORRECTED.md`](../../../design/sequential-build-plan/REVIEW/BUILD_PLAN_CORRECTED.md).
- **VERIFIED @ BASE:** the current `state.sites` writer is `asteroidSites`, and save capture names that owner for the `sites` payload. Sources: [`asteroidSites.js`](../../../src/systems/asteroidSites.js) and [`saveSystem.js`](../../../src/save/saveSystem.js).
- **VERIFIED @ BASE:** stable descriptor and beam/payload seams are already available and should be reused. Sources: [`interactionDescriptors.js`](../../../src/systems/interactionDescriptors.js), [`industrialBeam.js`](../../../src/combat/industrialBeam.js), and [`mining.js`](../../../src/systems/mining.js).
- **VERIFIED @ BASE:** the Atlas derives from ordinary place data and sorts/validates identities; map proxies must remain cheap and must not load the hero GLB. Sources: [`PLACE_REGISTRATION.md`](../../../src/data/PLACE_REGISTRATION.md) and [`atlasIndex.js`](../../../src/core/atlasIndex.js).
- **VERIFIED @ BASE:** source-level art, lore, salvage vocabulary, provenance checks, and a read-only Ledger already exist. Sources: [`PQ-018 source handoff`](../../../design/graphics-sprints/handoffs/2026-07-20-B-pq018-wreck-cathedral-source.yaml), [`080-landmark-lore.js`](../../../src/data/flavor/080-landmark-lore.js), [`salvageActions.js`](../../../src/data/salvageActions.js), [`check-wreck-provenance.mjs`](../../../scripts/check-wreck-provenance.mjs), and [`shipLedger.js`](../../../src/systems/shipLedger.js).

### 4.2 Facts that cannot be known honestly until the PQ-017 result commit exists

The following are **UNKNOWN UNTIL PQ-017 RESULT** and must not be guessed from the historical queue row or from another agent’s uncommitted candidate:

1. The exact result commit, ancestor relationship, changed-file list, and merge-conflict surface.
2. The generic site owner’s module path and registry name.
3. Whether PQ-017 retains `asteroidSites` as the sole `state.sites` writer, introduces an adapter, migrates to a new owner, or changes the save payload shape.
4. The landed site schema version, required/optional fields, stable-ID format, state vocabulary, and transition rules.
5. The exact component registration API and whether descriptors consume site components automatically or through an adapter.
6. The exact action request/receipt API, event names, idempotency contract, and failure receipt shape.
7. Whether physical payload identity and sector-transition persistence are owned by PQ-017, delegated to the existing industrial-beam helper, or represented through world records.
8. The collision-registration seam for a multi-component static site and whether component-state changes can update collision safely.
9. The save migration/default behavior for old saves lacking the site.
10. The focused check names and fixtures the PQ-017 owner will require downstream consumers to run.
11. Whether PQ-017 touches any protected registry, save-schema, package, interaction, renderer, world, or manifest path and therefore creates a mutex/rebase conflict.
12. Whether PQ-017 is itself integrated; the only allowed current statement is the controller-supplied “in progress and not yet integrated.”

**Stop rule:** if the post-result audit cannot answer all twelve items from the committed PQ-017 diff and its checks, PQ-018 remains blocked.

## 5. Architecture, event, and data flow

### 5.1 Proposed authority flow

```text
AUTHORED SOURCE (immutable reviewed input)
  Blender + source GLB + source evidence
          |
          v
ASSET ADMISSION OWNER
  independent review
  -> parts manifest row
  -> generated release GLB + generated release manifest
  -> renderer place whitelist / release-path resolution
  -> runtime LOD and residency diagnostics
          |
          v
AUTHORED PLACE DATA (sector-local only)
  one physical placement identity + one map/zone identity or one landed adapter that derives both
          |
          v
WORLD / PQ-017 SITE MATERIALIZATION
  one durable siteId
  stable componentIds
  component states and operation receipts
  compound collision registration
          |
          +-----------------------> ATLAS READ MODEL
          |                          derived node, discovery, route target; no hero GLB in map
          v
PQ-015 DESCRIPTOR QUERY
  describe site/components; no mutation, no save tree
          |
          v
PQ-016 INDUSTRIAL BEAM / MINING OWNER
  resolve cut / extract / repair / transfer
  create or move physical payload through existing authority seams
          |
          v
PQ-017 SITE OWNER MUTATION
  validate transition once
  persist state once
  emit canonical result/receipt once
          |
          +-----------------------> CARGO / MODULE / ECONOMY OWNERS
          |                          canonical APIs/events only; no direct writes
          |
          +-----------------------> HISTORY RECEIPT OWNER
          |                          black-box/fragments/recovery provenance
          |                          Ship's Ledger remains a read-only projection
          v
SAVE OWNER
  capture the sole landed site owner; migrate/default old saves; reload idempotently
          |
          v
BROWSER ROUTE -> ELECTRON PARITY -> CONTROLLER ACCEPTANCE
```

This flow follows the repository’s fixed-loop/event-bus/single-writer architecture in [`ARCHITECTURE.md`](../../../ARCHITECTURE.md), the module ownership map in [`docs/MODULE_MAP.md`](../../../docs/MODULE_MAP.md), the asset pipeline in [`design/world-identity/PIPELINE.md`](../../../design/world-identity/PIPELINE.md), and the execution protocol’s rule that interface contracts land before consumers in [`00_EXECUTION_PROTOCOL.md`](../../../design/program/roadmap/00_EXECUTION_PROTOCOL.md).

### 5.2 Required one-writer boundaries

- **Site state:** exactly the landed PQ-017 owner. No `state.wreckCathedral`, no second `state.sites` writer, and no Cathedral serializer.
- **Descriptors:** `interactionDescriptors` reads the site/component contract and returns deterministic projections. It does not persist selection, state, or rewards.
- **Beam actions:** the existing industrial-beam/mining path resolves and executes beam verbs. PQ-018 supplies component capabilities/state; it does not create a second tool controller.
- **Cargo/module rewards:** use cargo/ships owner APIs or events. Never mutate player cargo, module inventory, credits, or fittings from the site owner.
- **History:** the site owner creates one durable recovery/history receipt or calls the existing story/history owner. `shipLedger.js` remains read-only; PQ-021 owns any new projection.
- **Atlas:** ordinary authored place data remains the source; `atlasIndex.js` derives the read model. Never serialize live site state into Atlas nodes.
- **Collision:** physics authority registers a bounded compound proxy. Renderer geometry never becomes simulation collision authority.
- **Visual state:** renderer derives visible component state from simulation data; it does not decide whether a relay is repaired or cargo is recovered.

### 5.3 Proposed component contract, conditional on PQ-017 vocabulary

The corrected plan calls for the following semantic components. The stable-ID syntax below is intentionally not frozen until PQ-017 lands; the semantic suffixes are the required identities.

| Semantic component | Initial semantic state | Allowed operation(s) | Irreversible result | Persistence obligation |
|---|---|---|---|---|
| `power_relay_a` | offline, attached | `repair` | repaired/online | Must remain repaired after sector exit and Continue. |
| `power_relay_b` | separated or disabled | inspect/optional recovery according to final contract | controller-defined | Must never reattach or duplicate after load. |
| `port_cargo_brace` | intact, attached | `cut` | cut/open | Collision and visual state must both reflect the cut. |
| `cargo_weapon_module` | attached behind brace | `extract`, then `transfer` | one physical payload or one bounded fallback receipt | Reward may be granted once only. |
| `reactor_core` | attached/unstable | physical extraction preferred; bounded fallback action permitted | one resolved reactor outcome | **Exactly one** reactor design path may ship. |
| `black_box` | hidden or unpowered | reveal/scan/decode after power precondition | decoded | Emits one canonical history receipt and fragment progress. |
| `lore_fragment_c1_01` … `c1_05` | unrecovered | scan/read through existing scanner/history seam | recovered | Preserve existing fragment IDs/text; no random fragment identity. |

**PROPOSAL:** site-level progression should be derived from component receipts, not separately hand-maintained booleans. Any first irreversible operation yields the plan’s `partially_recovered` semantic state; the required completion set yields `recovered`. The exact enum names and derivation function must match PQ-017 rather than force these words into a different landed schema.

**PROPOSAL:** every irreversible operation is idempotent under a stable tuple equivalent to `(siteId, componentId, actionId)`. Repeating input, duplicate events, save reload, and residency rematerialization must return the already-applied result instead of spawning a second payload or reward.

## 6. Exact future write-set proposal

This is a **conditional future write-set**, not permission to edit protected paths now. It is intentionally split by owner and includes explicit “one-of” choices where the exact PQ-017 contract is unavailable.

### 6.1 Asset admission owner — exact proposed paths

| Path | Proposed future change | Owner/mutex | Gate |
|---|---|---|---|
| `assets/ships/parts/places/place_landmark_wreck_cathedral.glb` | **No change by default.** Treat the audited source hash as immutable input. Re-author only if independent review rejects it. | Blender/graphics | Source review ruling. |
| `assets/ships/parts/parts_manifest.json` | Add one `place_landmark_wreck_cathedral` place row with exact source hash, dimensions, semantic contract, and `budgetClass: "landmark"`. | asset-manifest | Independent review + exact source hash. |
| `assets/ships/release/parts/places/place_landmark_wreck_cathedral.glb` | Create through the release builder; KTX2/meshopt and semantic-node parity must be measured, not assumed. | asset-manifest/release pipeline | Source manifest row accepted. |
| `assets/ships/release/release_manifest.json` | Generated update only; record exact source/release hashes, bytes, texture/compression facts, and contract-node count. | generated manifest | Release builder succeeds. |
| `src/render/partsLibrary.js` | Add the place file to the existing explicit runtime place map, or consume the generator-owned equivalent if the post-PQ-017 base changes this seam. | renderer | Release artifact exists and runtime owner accepts residency plan. |

Commands and contracts already present at the base include `npm run build:sg04:release-assets`, `npm run check:art`, `npm run check:runtime-assets`, `npm run check:asset-reachability`, `npm run check:assets:live`, and `npm run check:visual-stability` in [`package.json`](../../../package.json). The pipeline’s generated-release rule is documented in [`design/world-identity/PIPELINE.md`](../../../design/world-identity/PIPELINE.md).

### 6.2 Simulation/data wiring owner — exact and conditional proposed paths

#### Hard post-PQ-017 insertion point

- **UNKNOWN UNTIL PQ-017 RESULT:** the exact landed site-manifest and site-runtime paths.
- **Required action after rebase:** replace this unknown with the committed PQ-017 path list before any implementation branch is authorized. The Cathedral must be one data instance/adapter of that kernel, not a new system.

#### Current-base paths that may be touched after that audit

| Path | Proposed future change | Condition |
|---|---|---|
| `src/data/authoredPlaces.js` | Preferred additive Atlas/zone identity: add a stable Cathedral zone in the selected sector using `appendAuthoredZones`, with no ambient `presence` unless hostiles are explicitly part of PQ-018 scope. | Use only if PQ-017 does not derive an Atlas-visible zone from its own canonical place record. |
| `src/data/sectorAnchors.js` | Add one physical POI identity carrying `landmarkGlb: 'place_landmark_wreck_cathedral'`, or replace a controller-selected existing POI. | Use only if PQ-017 does not provide an additive physical-placement catalog. Never duplicate the same site through both paths. |
| `src/data/flavor/080-landmark-lore.js` | Preserve `wreck_cathedral`, target reference, and `c1_01`–`c1_05`; update only location metadata if the controller selects Ceres. | Geography ruling selects Ceres. No change if Io is retained. |
| `src/data/collisionProxyManifests.js` | Add a bounded compound Cathedral proxy whose deliberate open corridor preserves the reviewed fly-through envelope and whose component-sensitive pieces can follow landed PQ-017 state safely. | Collision owner approves exact attachment seam. |
| PQ-017 landed data path(s) | Add one site record with stable component IDs, preconditions, action capabilities, completion derivation, payload definitions, and history receipt references. | Exact paths known only after result rebase. |
| PQ-017 landed runtime path(s) | Materialize/despawn/rematerialize the site through the generic owner; route actions through existing descriptors/beam/mining; persist once. | Exact paths known only after result rebase. |
| `src/systems/interactionDescriptors.js` | **No asset-specific branch by default.** Change only if PQ-017’s generic adapter does not expose its components; any change must remain generic. | Interface gap proven after rebase. |
| `src/data/salvageActions.js` | **No change by default.** Reuse `cut_panel`, `pull_module`, `decode_blackbox`, and `vent_reactor`; add a generic action only if the landed component capability cannot be represented. | Focused contract test proves a missing generic verb. |
| `src/systems/shipLedger.js` | **No PQ-018 change by default.** PQ-018 creates the durable receipt; PQ-021 owns projection into the read-only Ledger. | Controller explicitly combines PQ-021, otherwise deferred. |
| `src/save/saveSystem.js` | **No direct PQ-018 edit.** It must serialize the sole PQ-017 owner through the landed hook. | Any new save key/schema requirement is a stop-and-escalate condition for the save owner. |
| `src/core/registry.js` | **No direct PQ-018 edit.** Reuse the PQ-017 registration. | A missing registration is a PQ-017 integration defect, not Cathedral scope. |
| `package.json` | Add PQ-018 check/capture aliases only through the package mutex owner after focused scripts exist. | Package mutex granted. |

#### Proposed new focused proof files

These names are **PROPOSAL**, chosen to keep PQ-018 proof local and discoverable:

- `test/pq018-wreck-cathedral-contract.test.mjs` — exact site/component IDs, preconditions, state transitions, idempotency, and one-reactor-path assertion.
- `test/pq018-wreck-cathedral-persistence.test.mjs` — sector dematerialize/rematerialize, save/Continue, extracted-payload non-duplication, black-box/history non-duplication.
- `scripts/check-pq018-wreck-cathedral-route.mjs` — normal browser player route, authored-asset diagnostics, Atlas navigation, actions, reload, return.
- `scripts/capture-pq018-wreck-cathedral.mjs` — deterministic three-scale, fly-through, interaction, recovered-state, and diagnostics capture.

### 6.3 Placement proposal and collision with existing geography

**PROPOSAL — preferred forward identity if Ceres is selected:**

- Asset ID: `place_landmark_wreck_cathedral` — already authored.
- Site ID: use the PQ-017 stable-ID convention with semantic identity `wreck_cathedral`; do not invent the final prefix before rebase.
- Atlas/POI identity: `poi_wreck_cathedral` unless the landed site adapter defines one canonical ID used by both world and Atlas.
- Zone identity: `zone_ceres_wreck_cathedral` only if a separate zone is required.
- Placement class: an off-lane graveyard/mystery pocket in `sector_ceres_belt`, authored in sector-local XZ.

**INFERENCE:** a southwest Ceres envelope around sector-local `(-2200, -1800)` appears geometrically separated from the currently authored Ceres station, belt/refinery/ambush/derelict zone centers and gate anchors while remaining inside the 4200 WU sector radius. This is not an accepted coordinate. It must be checked against actual zone radii, hazard footprint, route lines, spawn clearances, PQ-020 pocket composition, hero dimensions, camera framing, and collision corridor before adoption. Evidence for the existing geometry: [`sectors.js`](../../../src/data/sectors.js), [`sectorAnchors.js`](../../../src/data/sectorAnchors.js), and [`sectorZones.js`](../../../src/data/sectorZones.js).

**Controller must choose exactly one placement strategy:**

1. **New off-lane site — recommended planning default.** Preserve `poi_driller` / `zone_ceres_derelict`; add the Cathedral as a distinct graveyard pocket. This avoids silently rewriting shipped Ceres identity but adds one new map-visible place.
2. **Upgrade the existing Ceres derelict pocket.** Replace/rename `poi_driller` and its zone semantics. This reduces count but destroys or migrates the Abandoned Driller identity and requires explicit narrative/data review.
3. **Retain Io.** Use the existing `zone_io_derelict` / Cruiser Graveyard context, preserving lore location but rejecting the corrected Ceres sequencing assumption and requiring PQ-020/PQ-018 dependency clarification.

Never combine these strategies. Duplicate IDs, overlapping POIs, two Atlas nodes for one physical site, or two physical Cathedrals are integration failures.

### 6.4 Visual-evidence owner — outputs and non-ownership

The visual-evidence owner may run browser-GPU/Electron tools and produce captures, logs, diagnostics, and a new immutable acceptance receipt. It must not edit the source GLB, manifests, renderer, HUD, input, worldbuilding, save schema, registry, or package while those mutexes are held.

Required evidence products:

- authored-asset loader diagnostics proving the release GLB was requested and resolved, with no procedural fallback;
- Atlas marker and route-target evidence;
- distant silhouette, mid-range approach, close component-readability, and interior/fly-through views;
- collision-debug overlay proving the deliberate open corridor remains navigable;
- LOD transition and component-marker stability evidence;
- complete interaction route with keyboard and gamepad-equivalent access through existing controls;
- reduced-motion/reduced-flash presentation evidence;
- post-Continue recovered-state evidence;
- cold-load, steady-state, LOD-transition, and fly-through performance telemetry;
- same normal route in browser and Electron.

The evidence owner is a witness, not an authority: it cannot change simulation state, declare route acceptance unilaterally, or promote program ledgers.

## 7. Mutex, dependency, and collision analysis

### 7.1 Hard dependencies

| Dependency | Status in this packet | Rule |
|---|---|---|
| PQ-015 descriptors | **VERIFIED @ BASE present** | Reuse; do not fork a descriptor grammar. |
| PQ-016 beam/payload | **VERIFIED @ BASE present** | Reuse; do not fork beam verbs or payload ownership. |
| PQ-017 generic site kernel | **USER-SUPPLIED in progress, not integrated** | Hard block. Rebase and inspect committed result before PQ-018 implementation. |
| PQ-020 Ceres pocket composition | **Historical queue dependency/collision** | Coordinate/place decision must be co-owned; PQ-018 must not pre-empt the activity-pocket layout. |
| PQ-021 Ship’s Ledger wiring | **Historical downstream owner** | PQ-018 should produce durable history facts; PQ-021 should project them into the existing Ledger unless controller recombines scope. |

Sources: [`CANONICAL_BUILD_MAP.md`](../../../CANONICAL_BUILD_MAP.md), [`program-queue.json`](../../../design/program/roadmap/program-queue.json), and [`BUILD_PLAN_CORRECTED.md`](../../../design/sequential-build-plan/REVIEW/BUILD_PLAN_CORRECTED.md).

### 7.2 Protected mutexes and required ownership handoffs

- **Asset manifest / generated release:** one serialized owner. No hand-edit of generated release files.
- **Renderer:** one owner adds the place runtime mapping and validates release-path loading/residency.
- **Blender/graphics:** source remains frozen during integration unless art review returns it.
- **Browser GPU:** browser capture and Electron capture run serially; no concurrent headed probes.
- **Registry / save schema / package:** PQ-018 requests changes from owners only if the post-PQ-017 contract proves they are necessary. It does not seize these files.
- **HUD / input:** use existing descriptor/readout/input paths. A missing presentation hook is an owner request, not permission to build a Cathedral HUD.
- **Combat / AI / Massline / tether:** the Cathedral may be a physical site and may host salvage/payload behavior, but PQ-018 must not alter protected combat, AI, Massline, or tether logic.
- **Worldbuilding / shared program ledgers:** reuse existing lore and queue semantics; do not edit canonical program/worldbuilding records from this task.
- **World/Atlas hot data:** prefer the additive authored-place seam or the landed PQ-017 placement adapter over parallel/hot-file rewrites. If a `sectorAnchors.js` edit is required, serialize it with the geography/PQ-020 owner.

### 7.3 Concrete collision risks at the base

1. `state.sites` is already owned by `asteroidSites`; a new Cathedral writer would violate single-writer and save ownership.
2. Ceres already contains `poi_driller` and `zone_ceres_derelict`; a Cathedral at the same or nearby coordinates can create duplicate route markers, ambiguous `zoneAt` results, spawn overlap, or narrative replacement.
3. Io already carries Cathedral lore location while the corrected sequence names Ceres.
4. `PLACE_FILES` and both manifests are exact allowlists; changing one without the others creates silent procedural fallback or unreachable release data.
5. The source asset is 633 WU long; a naive sphere/ball collider would seal the reviewed fly-through and misrepresent the silhouette.
6. Runtime LOD and semantic markers can drift if release optimization renames/removes nodes or if components are bound to LOD-local rather than stable host transforms.
7. Browser GPU, renderer, and manifest work are naturally coupled but separately mutexed; one agent must not “finish” by crossing all three owners without leases.
8. A Ledger edit in PQ-018 would collide with PQ-021 and with `shipLedger.js`’s explicit read-only design.

## 8. Determinism, single-writer, save, accessibility, and performance constraints

### 8.1 Determinism

- Stable site/component/action identities must come from authored IDs and the landed PQ-017 schema, not entity allocation order.
- No `Math.random()`, `Date.now()`, wall-clock deadlines, renderer frame counts, or camera-dependent state in site progression.
- If a deterministic variation is needed, derive it from `state.meta.seed` plus stable site/component IDs through the repository RNG/hash path.
- Component enumeration, receipts, and serialized maps must use stable sorted order.
- A repeated action, rematerialization, replay, and Continue must converge to the same site state and reward count.
- The normal golden simulation must remain unchanged unless the player reaches/acts on the new site; a passive place record without `presence` should not alter ambient spawn RNG.

Repository basis: root [`AGENTS.md`](../../../AGENTS.md), [`ARCHITECTURE.md`](../../../ARCHITECTURE.md), stable-key logic in [`interactionDescriptorCatalog.js`](../../../src/data/interactionDescriptorCatalog.js), deterministic Atlas construction in [`atlasIndex.js`](../../../src/core/atlasIndex.js), and seeded provenance checks in [`check-wreck-provenance.mjs`](../../../scripts/check-wreck-provenance.mjs).

### 8.2 Single-writer and event/API boundaries

- The PQ-017 site owner alone mutates site/component state.
- Mining/beam code requests an operation and consumes a result; it does not write the site record directly.
- Cargo, module inventory, credits, reputation, and fittings are updated only by their existing owners.
- Collision state is commanded through physics authority; no renderer or site-data file directly writes body velocity/physics internals.
- The Ship’s Ledger remains a pure projection. Site completion creates a durable source receipt; it never pushes a rendered ledger line into state.
- Atlas/discovery state remains owned by world/map systems; site data supplies stable authored identity only.

### 8.3 Save and persistent recovery

The base save path already serializes `sites` through `asteroidSites`; therefore the exact post-PQ-017 save arrangement is unknown. The following are non-negotiable regardless of implementation shape:

1. One canonical save tree and one serializer for site state.
2. Old saves without the Cathedral default to an untouched initial site without migration crashes.
3. A cut brace remains cut; a repaired relay remains repaired; decoded fragments remain decoded.
4. Extracted payload/reward identity survives sector transitions and Continue or is represented by an idempotent consumed receipt.
5. No component, payload, fragment, module, cargo grant, or history receipt can duplicate after reload.
6. Destroyed/removed component visuals and collision do not rematerialize from the authored source defaults.
7. Save/load during an in-flight asynchronous asset load cannot overwrite newer simulation state.
8. Save capture contains plain bounded data only—no Three.js objects, functions, Maps, renderer handles, or transient entity references.
9. Save-schema/registry changes require their owners and migration checks; they are not hidden inside PQ-018.

Repository basis: [`asteroidSites.js`](../../../src/systems/asteroidSites.js), [`saveSystem.js`](../../../src/save/saveSystem.js), the bounded durable precedent in [`uniqueWrecks.js`](../../../src/systems/uniqueWrecks.js), and world-record persistence in [`world.js`](../../../src/systems/world.js).

### 8.4 Accessibility and interaction legibility

- Every required operation must be reachable by keyboard and gamepad-equivalent control through the existing target/descriptor/action path; mouse-only marker clicking is unacceptable.
- The action readout must expose component name, verb, precondition, blocked reason, progress/result, and persistence consequence in DOM-accessible UI owned by existing HUD/UI systems.
- Relay state, cut state, black-box availability, and unstable-reactor danger cannot be communicated by emissive color alone. Pair color with geometry, icon/glyph, text, audio/caption, or motion-safe cues.
- Respect reduced-motion and reduced-flash settings. Emergency emitters and the Marker need bounded flash rates and a static/reduced alternative.
- The 633 WU silhouette and close component markers must remain readable without relying on bloom or post-processing.
- Interaction prompts must remain legible against Ceres’ amber/rust palette and true-black space.
- Fly-through collision and camera behavior must not induce forced rapid roll, strobing occlusion, or disorienting camera cuts.

Repository basis: root [`AGENTS.md`](../../../AGENTS.md), UI/accessibility responsibilities in [`docs/MODULE_MAP.md`](../../../docs/MODULE_MAP.md), the existing salvage readout vocabulary in [`salvageActions.js`](../../../src/data/salvageActions.js), and check aliases in [`package.json`](../../../package.json).

### 8.5 LOD, collision, asset residency, and performance

- Source LOD facts are not runtime LOD proof. Verify live LOD selection, monotonic transitions, host-transform stability, material count, and no component popping.
- Preserve declared semantic nodes through release optimization; source and release semantic audits must agree.
- Use a bounded compound planar proxy, not triangle-mesh collision and not a single sphere. The proxy must leave a navigable gap matching the reviewed fly-through and must never be renderable/targetable/radar-visible.
- Keep the Atlas/map proxy procedural and under the documented `MAP_PROXY_TRIANGLE_CAP = 512`; never load the hero GLB in the map.
- Measure source-to-release byte change, KTX2 texture residency, meshopt decode, cold-load latency, GPU upload, peak resident memory, draw calls, and garbage-collection/hitch behavior.
- Measure at least: first approach from outside residency; LOD2→LOD1→LOD0 transitions; component action that changes visuals/collision; interior fly-through; sector departure; return; Continue.
- One Cathedral instance is the expected content model. Accidental duplicate materialization must be a hard failure, not a performance “budget.”
- Procedural fallback may preserve playability, but any fallback on the acceptance route fails asset admission.

Repository basis: source metrics in the [`PQ-018 source handoff`](../../../design/graphics-sprints/handoffs/2026-07-20-B-pq018-wreck-cathedral-source.yaml), runtime place loading in [`partsLibrary.js`](../../../src/render/partsLibrary.js), collision limits in [`collisionProxyManifests.js`](../../../src/data/collisionProxyManifests.js), map-proxy rules in [`PLACE_REGISTRATION.md`](../../../src/data/PLACE_REGISTRATION.md), and performance/asset checks in [`package.json`](../../../package.json).

## 9. Adversarial failure modes

| Failure mode | Why it can pass a shallow review | Required detector / stop condition |
|---|---|---|
| Source GLB exists but runtime silently shows procedural fallback | The game remains visually nonblank by design. | Loader diagnostics must name the Cathedral release asset and show successful decode/admission; any fallback stops acceptance. |
| Parts manifest, release manifest, and runtime map disagree | Each file can look locally valid. | `check:runtime-assets`, `check:asset-reachability`, release-hash comparison, and exact ID/path assertions. |
| Release optimization strips semantic markers | Exterior renders may still look correct. | Source-vs-release semantic-node audit; component bindings and fly-through sockets must resolve. |
| Authored LODs never switch live | Blender/GLB inspection shows three LODs. | Headed LOD diagnostics and captures across thresholds; memory/draw metrics must change as expected. |
| Single ball collider seals the Cathedral | Exterior collision “works.” | Collision-debug fly-through route; no hit across the reviewed envelope and no escape through solid hull regions. |
| Compound proxy leaves visual solids noncolliding or corridor pieces colliding | A single approach angle passes. | Multi-angle proxy/silhouette contract plus entry, interior, exit, and reverse traversal. |
| Component IDs depend on entity IDs or array order | One run and one save pass. | Reordered fixture, rematerialization, replay, and Continue must preserve exact IDs/state. |
| Repeating `cut` or loading during payload spawn duplicates reward | Happy-path route only acts once. | Deliberate double input, duplicate event, save-before/after spawn, sector-exit race, and Continue assertions. |
| Extracted payload vanishes on sector transition | Immediate transfer path passes. | Leave without transfer, return, Continue, and verify the landed PQ-017 payload policy. |
| Site owner writes cargo/module/credits directly | Reward appears correct. | Writer audit and event/API spies; direct mutation is a hard failure. |
| Cathedral gets a second save key or serializer | Save/Continue may still work locally. | Save shape assertion: sole PQ-017 owner, one record, no `wreckCathedral` parallel tree. |
| Atlas record uses global coordinates | Helios-like fixtures can hide the error. | Ceres nonzero-origin exact global position assertion and `check:map-frames`. |
| Hero GLB loads in galaxy/local map | Map looks beautiful on a fast machine. | Atlas proxy geometry/load trace; enforce procedural proxy and triangle cap. |
| Ceres placement overlaps `poi_driller`, a zone, gate, field, or spawn corridor | Static screenshot can crop the conflict. | Geometry clearance check across all authored anchors/zones/hazards and a normal route. |
| Io lore and Ceres placement diverge | Players may not read both surfaces in one session. | Data-reference check comparing lore location, Atlas sector, physical site, and route receipt. |
| Black box grants history before power/scan | Final ledger entry looks correct. | Precondition tests and route capture showing blocked/revealed/decoded states. |
| Ledger is rebuilt or directly mutated | New entry appears quickly. | Assert `shipLedger.js` remains projection-only; PQ-018 emits source receipt, PQ-021 projection owns display. |
| Reactor physical and fallback designs both activate | Each branch passes alone. | One-of assertion in manifest/site fixture and route test. |
| Scavenger/hostile presence changes golden RNG before player arrives | Site looks lively. | Passive deterministic sim compare; no `presence` or ambient behavior unless explicitly scoped and isolated. |
| Emissive-only state fails color-blind/reduced-effects users | Standard capture looks readable. | Reduced-motion/flash, low-bloom, grayscale/contrast, keyboard/gamepad route checks. |
| Browser works, Electron resolves a different asset path | Browser route passes. | Same normal route and loader diagnostics in Electron after browser proof. |
| Debug teleport is the only practical route | Focused script reaches the site. | Clean/default player route from Helios through normal navigation and Atlas controls. |
| Evidence script mutates state or injects success | Screenshots look complete. | Route harness may observe/control normal inputs only; state assertions must be read-only except through player actions. |

## 10. Phased implementation plan with stop conditions

### Phase 0 — PQ-017 result intake and rebase

1. Obtain the committed PQ-017 result SHA from its owner/controller.
2. Confirm it is an accepted integration base, not an uncommitted candidate or stale branch head.
3. Rebase a fresh PQ-018 implementation branch onto that exact commit.
4. Read the PQ-017 changed files, exported API, registry/save changes, checks, and handoff before reading unrelated code.
5. Run PQ-017’s own focused checks unchanged.

**Stop if:** no result commit; result not integrated/approved for dependency use; checks fail; owner/API/save contract remains ambiguous; or rebase crosses a protected active mutex.

### Phase 1 — Contract freeze and geography ruling

1. Record the exact site owner module/registry name and sole save path.
2. Record the exact site/component/action/receipt schema and stable-ID rules.
3. Record the physical-payload and sector-transition policy.
4. Decide Ceres versus Io.
5. If Ceres, decide new pocket versus replacement of `poi_driller` / `zone_ceres_derelict`.
6. Decide physical reactor versus fallback; never both.
7. Freeze the exact future write set and owner leases.

**Stop if:** any decision requires a parallel site system, second writer, new save tree, direct Ledger mutation, or unresolved PQ-020/PQ-021 collision.

### Phase 2 — Independent asset admission

1. Review the source captures, source GLB, topology/material/semantic reports, and fly-through evidence independently.
2. Confirm the audited source hash or return the asset to graphics; do not “fix” it during integration.
3. Add the source manifest row under the manifest owner.
4. Generate the release GLB and release manifest.
5. Verify semantic parity, texture/compression contract, source/release hashes, and release size.
6. Add the renderer place mapping under the renderer owner.
7. Prove live authored loading and fallback absence in a minimal fixture before site behavior.

**Stop if:** source review rejects; hash drifts; release generation is nondeterministic; semantic nodes disappear; decode fails; runtime falls back; residency exceeds an agreed budget; or the renderer requires Cathedral-specific parallel loading code.

### Phase 3 — Place, site, collision, interaction, and persistence wiring

1. Add exactly one canonical site definition through the landed PQ-017 data seam.
2. Add exactly one physical placement and one Atlas identity, derived from one source where possible.
3. Add stable components and preconditions using PQ-017’s vocabulary.
4. Bind the source semantic markers to component transforms without LOD-local identity drift.
5. Add bounded collision preserving the fly-through.
6. Project the site through PQ-015 descriptors.
7. Route operations through PQ-016 beam/mining owners.
8. Route rewards to cargo/module owners and history to one durable receipt owner.
9. Persist and rematerialize through PQ-017; no direct save-schema/registry invention.

**Stop if:** duplicate site/Atlas records, ambiguous zones, direct owner writes, unstable IDs, non-idempotent rewards, collision corridor failure, or a protected owner must be modified without a lease.

### Phase 4 — Focused headless proof

1. Run PQ-017 focused checks.
2. Run interaction and beam checks.
3. Run new Cathedral contract/persistence tests.
4. Run deterministic sim compare before and after adding passive placement.
5. Run save-schema/save-resume and provenance/salvage checks.
6. Run Atlas/place/frame/geography checks.
7. Inspect the exact diff and generated artifacts.

**Stop if:** any focused check fails, passive sim changes unexpectedly, save shape duplicates, map coordinates disagree, generated files are dirty after repeat build, or diff includes unowned paths.

### Phase 5 — Browser player route and visual/performance proof

1. Start from a clean/default player route; no debug teleport as primary evidence.
2. Navigate Helios → Ceres normally if Ceres is selected.
3. Find/route to the Cathedral through the normal Atlas/local navigation surface.
4. Capture distant/mid/close/fly-through/readout states.
5. Complete the power → cut → extract → black-box sequence.
6. Leave, save/quit, Continue, return, and verify persistent state/reward/history.
7. Repeat under reduced motion/flash and keyboard/gamepad-equivalent controls.
8. Capture loader, LOD, collision, frame-time, memory/residency, and hitch diagnostics.

**Stop if:** authored asset fallback, unreachable route, inaccessible action, inconsistent cues, collision failure, state duplication, post-load reset, or budget failure.

### Phase 6 — Electron parity and controller integration

1. Repeat the same normal route in Electron, not a special fixture route.
2. Confirm identical asset path, save behavior, input reachability, and visual state.
3. Produce one route-evidence receipt and one exact changed-file/check receipt.
4. Controller reviews owner leases, evidence, unresolved risk, and dependency status.
5. Only the controller may update shared program ledgers/canonical state.

**Stop if:** Electron diverges, evidence is debug-only, unresolved risk remains material, or any completion vocabulary would overstate the proof.

## 11. Focused checks and player-route evidence

### 11.1 Existing checks to run after implementation

The following aliases exist at the audited base in [`package.json`](../../../package.json). They are listed as future gates; this planning task did not execute them.

#### Contract, determinism, and save

```text
npm run check:interactions
npm run check:beam-verbs
npm run check:sim:compare
npm run check:save-schema
npm run check:save-resume-confidence
node --test test/pq018-wreck-cathedral-contract.test.mjs
node --test test/pq018-wreck-cathedral-persistence.test.mjs
```

#### Asset admission and runtime reachability

```text
npm run build:sg04:release-assets
npm run check:runtime-assets
npm run check:asset-reachability
npm run check:assets:live
npm run check:visual-stability
npm run check:art
```

#### Atlas and geography

```text
npm run check:atlas-integrity
npm run check:atlas-place-path
npm run check:map-frames
npm run check:sector-geography
```

#### Salvage, history, and provenance

```text
npm run check:wreck-provenance
npm run check:salvage-actions
npm run check:salvage-anatomy
```

#### Accessibility and launch

```text
npm run check:launch-policy
npm run check:ui-a11y
npm run check:wcag-contrast
npm run check:ui-effects
node scripts/check-input-modalities.mjs
```

#### Performance and headed route

```text
npm run check:perf-budget
npm run check:perf:attribution
npm run check:perf
node scripts/check-pq018-wreck-cathedral-route.mjs
node scripts/capture-pq018-wreck-cathedral.mjs
```

**PROPOSAL:** package aliases for the two proposed PQ-018 scripts may be added later by the package mutex owner, but the scripts must remain directly runnable so proof does not depend on a package edit.

### 11.2 Required normal player route

The minimum acceptance route is:

1. Boot the normal title route on a clean/default save.
2. Start or Continue into normal flight; no injected site-complete state.
3. Use the standard map/navigation path to travel from Helios into the selected Cathedral sector. For the recommended Ceres plan, use the authored Helios↔Ceres route.
4. See the Cathedral as a named Atlas/local-route target at the correct sector-local/global position and with appropriate discovery confidence.
5. Engage a normal course and approach from outside the 700 WU initial-place composition radius.
6. Confirm the authored release asset loads without procedural fallback.
7. Read the silhouette at long range; distinguish bow/stern split, Marker, hangar/fly-through opening, and recoverable zones at closer scales.
8. Traverse the declared opening without collision penetration or false blocking.
9. Select and repair Power Relay A through the existing interaction/beam path.
10. Select and cut the port cargo brace.
11. Extract the cargo/weapon module as one physical payload or the single controller-approved fallback.
12. Transfer/recover it through the existing owner path; prove one grant.
13. Reveal and decode the black box; recover the existing `c1_01`–`c1_05` fragments according to the final progression contract.
14. Observe one durable provenance/history receipt; do not require a direct Ship’s Ledger code change in PQ-018 unless PQ-021 scope is explicitly combined.
15. Leave the site/sector, trigger a legitimate save, quit to title, Continue, return, and verify the exact recovered state, collision, visual removals, fragments, and reward count.
16. Repeat core interaction reachability with keyboard and gamepad-equivalent controls and reduced-motion/reduced-flash settings.
17. Repeat the same route in Electron after browser proof.

### 11.3 Required evidence frames and telemetry

- Atlas marker + route ribbon/context.
- Long silhouette frame outside streaming/preload range.
- Mid-range approach showing orientation and safe opening.
- Close component frame showing relay, brace/module, reactor, and black-box cues without bloom dependence.
- Entry/interior/exit fly-through frames with collision debug.
- Action readout frames for blocked, available, in-progress, and completed operations.
- Physical payload frame before transfer.
- Post-recovery visual/collision frame.
- Post-Continue return frame matching persisted state.
- Loader diagnostics: source ID, release path, decode success, fallback false.
- LOD diagnostics across all three levels.
- Frame-time/hitch, draw-call, texture/GPU residency, decode/upload, and peak memory samples at cold approach, LOD transitions, interior, action mutation, departure, and return.
- Browser/Electron parity table with exact build identity.

No screenshot by itself proves simulation state; no headless test by itself proves player presentation.

## 12. Post-PQ-017 rebase checklist

- [ ] Obtain the exact committed PQ-017 result SHA from the controller/owner.
- [ ] Confirm that result is approved as the PQ-018 dependency base; do not use an uncommitted candidate.
- [ ] Verify the PQ-017 result is descended from or cleanly applicable to `8f1c630f5ebf26f209052b8164f3cdf024ffd06f`.
- [ ] Rebase/create a fresh PQ-018 implementation branch from the approved result SHA.
- [ ] Inspect the PQ-017 changed-file list before opening unrelated code.
- [ ] Identify the sole site owner module and registry name.
- [ ] Identify the exact site save key, schema version, defaults, migration, serializer, and deserializer.
- [ ] Confirm whether `asteroidSites` still owns `state.sites`, is adapted, or is replaced.
- [ ] Record the exact stable site/component/action/receipt ID format.
- [ ] Record the exact component state vocabulary and transition validation API.
- [ ] Record action request/result event or function names and idempotency behavior.
- [ ] Record physical payload creation, anchoring, transfer, sector-transition, destruction, and reload policy.
- [ ] Record collision attachment/update ownership for component-state changes.
- [ ] Record the descriptor adapter path and prove no Cathedral-specific grammar is required.
- [ ] Record the exact PQ-017 focused checks and run them unchanged.
- [ ] Compare PQ-017 paths with active mutexes: registry, save-schema, package, renderer, manifest, HUD/input, world/geography.
- [ ] Resolve the Io-versus-Ceres controller ruling.
- [ ] Resolve new Ceres pocket versus replacement of `poi_driller` / `zone_ceres_derelict`.
- [ ] Coordinate placement with PQ-020 and history projection with PQ-021.
- [ ] Replace every “UNKNOWN UNTIL PQ-017 RESULT” implementation placeholder in this plan with an exact committed path/symbol/check.
- [ ] Freeze the exact implementation write set; any new shared path requires an owner request.
- [ ] Re-run Markdown/data-reference checks if lore location or IDs change.
- [ ] Do not begin asset admission or site wiring until all checklist items above are answered.

## 13. Unresolved questions and controller rulings required

1. **Canonical geography:** Io Reach, as the older Depth plan and existing lore say, or Ceres, as the corrected sequence/PQ-020 plan says?
2. **Ceres topology:** new off-lane pocket, or replacement/migration of the existing Abandoned Driller POI and derelict zone?
3. **PQ-017 contract:** what exact owner, schema, APIs, events, IDs, payload policy, collision seam, and checks land?
4. **Site/Atlas source count:** can one PQ-017 record derive both physical placement and Atlas identity, or must one POI plus one zone be authored without becoming parallel truth?
5. **Discovery:** charted named landmark, hidden site revealed by scan/rumor, or confidence-gated route target?
6. **Hostile ecology:** are scavengers in PQ-018 scope, and if so which existing encounter/world owner schedules them without adding ambient `presence` that perturbs passive determinism?
7. **Salvage legality:** the lore names a Concord military vessel, while existing wreck classification treats military salvage as restricted. Which owner produces legality/reputation consequences, if any?
8. **Reactor design:** physical payload or bounded fallback? Exactly one must be selected.
9. **Recovery completion:** which components are mandatory for `recovered`; are Relay B and reactor optional branches or required?
10. **Fragment progression:** all five existing `c1_01`–`c1_05`, or a controller-selected subset of three to five? If subset, how are stable IDs preserved?
11. **Ledger ownership split:** does PQ-018 stop at a durable history receipt, leaving projection to PQ-021, or does the controller explicitly combine the tasks?
12. **Payload persistence:** may an extracted module remain loose across sector exit/Continue, or must leaving resolve it to an anchored record/consumed receipt?
13. **Collision state:** does cutting the brace alter collision, and can the landed PQ-017/physics seam update a static compound proxy without per-frame rebuilds?
14. **Performance budget:** what are the agreed cold-load, upload, peak texture/GPU memory, draw-call, and frame-time limits for this one hero place on browser and Electron target hardware?
15. **Evidence route:** which clean/default career/save is the canonical route to Ceres/Io without debug shortcuts?
16. **Art review authority:** who may reject the source candidate and invalidate its hashes/evidence before promotion?

Until answered, these are risks—not implementation details to fill with intuition.

## 14. Controller-ready acceptance checklist

### Dependency and scope

- [ ] PQ-017 has an exact approved result commit and is integrated for downstream use.
- [ ] PQ-018 implementation is rebased onto that result.
- [ ] Exact write set and mutex owners are recorded.
- [ ] No protected concurrent work is modified without an owner handoff.
- [ ] Ceres/Io and PQ-020/PQ-021 scope rulings are explicit.

### Asset admission

- [ ] Independent art review accepts the exact source SHA-256.
- [ ] Source manifest row exists with correct landmark class/metrics/semantic contract.
- [ ] Release GLB is generated, not hand-authored.
- [ ] Generated release manifest records exact source/release hashes and compression facts.
- [ ] Runtime place map resolves the release artifact.
- [ ] Live diagnostics prove authored load and no fallback.
- [ ] Release semantic markers match the reviewed source.

### Place, Atlas, and geography

- [ ] Exactly one physical Cathedral exists.
- [ ] Exactly one canonical Atlas identity exists.
- [ ] Coordinates are sector-local and resolve correctly at the nonzero sector origin.
- [ ] No duplicate IDs, ambiguous zones, or overlap with stations, gates, fields, hazards, POIs, or spawn corridors.
- [ ] Existing Ceres Driller or Io Cruiser Graveyard identity is preserved or explicitly migrated.
- [ ] Map proxy is procedural/cheap and does not load the hero GLB.
- [ ] Atlas/place/frame/geography checks pass.

### Site/component contract

- [ ] Site and component IDs are stable across order, rematerialization, replay, and Continue.
- [ ] One PQ-017 owner is the sole writer.
- [ ] Relay, brace, module, reactor, black box, and fragment contracts are explicit.
- [ ] Preconditions and blocked reasons are deterministic and player-readable.
- [ ] Exactly one reactor path is active.
- [ ] Site-level `partially_recovered` / `recovered` semantics derive from component receipts.
- [ ] Duplicate input/events are idempotent.

### Interaction, salvage, and history

- [ ] PQ-015 descriptors expose all required components without a parallel grammar.
- [ ] PQ-016 beam/mining owners execute cut/extract/repair/transfer.
- [ ] Cargo/module/economy/reputation owners receive canonical requests only.
- [ ] Physical payload spawns/transfers once and follows the approved transition policy.
- [ ] Black box and lore fragments obey power/scan preconditions.
- [ ] Existing `wreck_cathedral` and fragment identities are reused.
- [ ] One durable provenance/history receipt exists.
- [ ] Ship’s Ledger remains read-only; projection ownership matches the PQ-021 ruling.
- [ ] Wreck provenance/salvage checks pass.

### Save and recovery

- [ ] One save tree and one serializer own the site.
- [ ] Old saves default safely.
- [ ] Cut/repaired/revealed/extracted/decoded states survive exit and Continue.
- [ ] Removed visuals/collision do not respawn.
- [ ] Payloads, rewards, fragments, and receipts do not duplicate.
- [ ] Save-schema/save-resume and focused persistence tests pass.

### Collision, LOD, and performance

- [ ] Compound proxy preserves the reviewed fly-through and blocks solid hull regions.
- [ ] Proxy remains sim-only, bounded, nonrendered, nontargetable, and non-radar-visible.
- [ ] Component-state collision updates are bounded and owner-routed.
- [ ] All three LODs select live and transition monotonically.
- [ ] Component anchors remain stable across LODs.
- [ ] Source/release bytes, decode/upload, texture residency, draw calls, frame time, and hitches are measured.
- [ ] Agreed browser and Electron budgets pass on the normal route.

### Accessibility and presentation

- [ ] Required route/actions are keyboard and gamepad-equivalent reachable.
- [ ] Readouts expose names, verbs, preconditions, results, and persistence consequences in accessible DOM UI.
- [ ] No critical state is color/emissive-only.
- [ ] Reduced-motion and reduced-flash modes remain clear and safe.
- [ ] Long/mid/close silhouette and components are readable without bloom dependence.
- [ ] Collision/camera through the fly-through is not disorienting.
- [ ] UI accessibility, contrast, effects, and input-modality checks pass.

### Player route and integration evidence

- [ ] Clean/default browser route reaches the Cathedral without debug teleport.
- [ ] Atlas target, approach, fly-through, full interaction sequence, save/Continue, and return are captured.
- [ ] Loader/LOD/collision/performance diagnostics accompany the captures.
- [ ] Electron repeats the same normal route with parity.
- [ ] Evidence is tied to exact build/base/result commits and changed files.
- [ ] Controller reviews the receipt and alone updates canonical program state.

**This packet checks none of these boxes.** It establishes the gate and the evidence required to check them later.

## 15. Audit actions performed for this packet

**VERIFIED during this planning task:**

- Read the required repository files in the controller-specified order from exact base commit `8f1c630f5ebf26f209052b8164f3cdf024ffd06f`.
- Inspected only directly relevant asset, place/Atlas, interaction, beam/mining, site/save, collision, lore/salvage/history, architecture, and package-check surfaces.
- Confirmed the target handoff path did not exist at the base.
- Confirmed `place_landmark_wreck_cathedral` was absent from the parts manifest, release manifest, and runtime `PLACE_FILES` map at the base.
- Confirmed the current base `state.sites`/save ownership and the existing reusable descriptor, beam, salvage, provenance, unique-wreck, and Ship’s Ledger seams.
- Distinguished the base’s historical planning facts from the controller’s only permitted current PQ-017 statement.
- Made no runtime, source, test, script, asset, manifest, package, program-ledger, worldbuilding, registry, save-schema, renderer, HUD, input, combat, AI, Massline, or tether change.

**Not performed or claimed:** runtime checks, asset promotion, browser/Electron execution, focused green status, route acceptance, implementation, or integration.

## 16. Receipt boundary

This document may support a controller receipt of **`planning_complete`** for `SF-PORT-02`. It cannot support any claim that PQ-018 is implemented, focused-green, route-accepted, or integrated. The strongest honest project statement at this point is:

> The Wreck Cathedral source candidate has a documented post-PQ-017 integration plan and audit boundary; runtime admission and acceptance remain blocked.
