# SF-PORT-05 — PQ-024 Corridor-Minimal Asteroid Ops Plan

> **NON-AUTHORITATIVE · PLANNING-ONLY · NOT INTEGRATED**
>
> Historical controller handoff. This file changes no runtime behavior, does not implement PQ-024,
> and does not supersede the canonical program ledgers or the future integrated PQ-017 World Site
> contract.

| Field | Value |
|---|---|
| Task | `SF-PORT-05` |
| Queue packet | `PQ-024` |
| Audit base | `8f1c630f5ebf26f209052b8164f3cdf024ffd06f` |
| Source branch requested | `codex/delegation-base-20260723` |
| Result branch requested | `agent/chatgpt-pq024-asteroid-ops-20260723` |
| Allowed output | `docs/handoffs/chatgpt-portfolio-20260723/PQ024_CORRIDOR_MINIMAL_ASTEROID_OPS.md` |
| Prepared | 2026-07-23 |
| Result state | `returned/planning_complete` |

## 0. Evidence language and authority

- **VERIFIED** means observed at the exact base with a path plus symbol, field, or check.
- **SUPPLIED** means provided by the controller/request, not inferred from the repository.
- **INFERENCE** means a bounded conclusion from verified evidence.
- **PROPOSAL** means future work, not present or tested.
- **UNKNOWN** means the answer depends on an unmet dependency or player-route proof.

The audit entered through [`CANONICAL_BUILD_MAP.md`](../../../CANONICAL_BUILD_MAP.md), root
[`AGENTS.md`](../../../AGENTS.md), [`design/program/NOW.md`](../../../design/program/NOW.md),
[`program-queue.json`](../../../design/program/roadmap/program-queue.json), and
[`00_EXECUTION_PROTOCOL.md`](../../../design/program/roadmap/00_EXECUTION_PROTOCOL.md), followed by
only the named task sources and directly relevant implementation.

**SUPPLIED:** PQ-017 is in progress and not yet integrated. This report claims nothing else about its
candidate and does not inspect or characterize its uncommitted state.

**SUPPLIED:** PQ-017 and PQ-022 are unmet dependencies for PQ-024.

**Authority rule:** after PQ-017 lands, its integrated World Site owner, schema, API, lifecycle, save
contract, and tests are authoritative. Base-era site code below is evidence and a reuse candidate only.
No implementation lane may pre-assign durable survey, claim, production, or exterior-consequence truth
to `asteroidSites` before the post-PQ-017 audit.

## 1. Executive decision

**PROPOSAL — approve one narrow corridor:**

1. Prospecting begins before Core commitment. Ordinary Survey pulses select and progressively reveal
   one deterministic interior geological formation in transient drill-session state.
2. Save/Continue before Core may discard that knowledge. The UI says so; no prospect ledger is added.
3. On one valid Core commitment, the integrated PQ-017 World Site owner atomically commits the anchor
   and adopts or deterministically reconstructs the exact transient target and revealed-cell set.
4. The authoritative lifecycle is `cold -> committed/anchored -> producing`.
5. PQ-024 adds no production algorithm. `Producing` begins only when PQ-017 accepts one unique positive
   output receipt from the existing production owner that already performed the real mutation.
6. Exactly one exterior relay/collar derives from `producing`. Entity counts are cold `0`, committed
   `0`, producing `1`, and producing after Continue `1`.
7. The preferred visual comes from integrated PQ-022. The existing generic claim relay is a
   fail-visible fallback, not PQ-022 acceptance.
8. No colony management, second site state, second production model, second save key, additional
   formation, new machine roster, heat/signature/defense, cluster logistics, station assembly,
   renderer fork, or input expansion enters this packet.

**Decision test:** through ordinary controls, the player surveys one formation before Core, commits the
Core without changing that knowledge, causes an existing producer to make real positive output,
observes PQ-017 transition the claim to producing, saves and Continues, and sees exactly one exterior
relay/collar on the same claim.

## 2. Blocking corrections incorporated

### 2.1 Formation reveal starts while cold

The first qualifying Survey pulse may select the one target before Core. The target, complete target
cell list, revealed cells, and effective reveal operations are transient. They become durable only in
the Core transaction. A pre-Core Continue may lose them without violating physical persistence.

### 2.2 Anchoring is not production

A committed/anchored site has durable identity and survey memory but no exterior industrial
consequence yet. The relay/collar appears only after a real, owner-authenticated positive production
receipt establishes the monotonic producing state.

### 2.3 PQ-017, not the base snapshot, owns durable truth

`WorldSiteOwner` is a role name for the exact owner that lands with PQ-017, not a proposed module.
Its exact path and symbols must replace that role name before PQ-024 can be `READY`.
`asteroidSites` is authoritative only if PQ-017 lands there; otherwise it is an adapter or remains
untouched and must not own parallel truth.

## 3. Corridor ceiling

### Included

- One interior same-material connected-component target.
- One transient progressive reveal before Core.
- One exact atomic adoption/reconstruction at Core commitment.
- One PQ-017-owned durable survey record after commitment.
- One lifecycle: cold, committed/anchored, producing.
- One existing-production-owner receipt that establishes producing.
- One exterior relay/collar derived from producing.
- Save/Continue after commitment and explicit permitted pre-Core loss.
- Existing keyboard and pointer routes.
- Browser and Electron proof on `/`.
- Duplicate, reload, missing-asset, invalid-adoption, partial-claim, and committed-not-producing tests.

### Excluded

- Durable pre-Core prospect knowledge or an unclaimed-asteroid database.
- Multiple targets, retargeting, cluster prospecting, or full formation management.
- Formation production bonuses or contact-ring rebalance.
- New production, power, throughput, recipe, export, cargo, economy, credit, or automation algorithms.
- New machines, commodities, tech, heat, signature, raids, defense, freighters, stations, or colonies.
- A second lifecycle, site store, save key, UI-owned state, registered system, or renderer path.
- Input, flight HUD, Blender, manifest, release, package, generated-index, or worldbuilding changes.
- Any implemented, focused-green, route-accepted, or integrated claim.

## 4. Current-state inventory at the exact base

This is a base snapshot, not a future ownership allocation.

| Class | Evidence | Finding |
|---|---|---|
| VERIFIED | [`src/systems/drill.js`](../../../src/systems/drill.js) — `begin`, `pulseScan`, `isTileSurveyed`, `serialize`, `deserialize` | Scan and field state are deterministic during a live session. `pulseScan()` marks tiles and emits `drill:scanPulse`; `serialize()` returns `null`. This is the correct transient pre-Core boundary. |
| VERIFIED | [`src/systems/drill.js`](../../../src/systems/drill.js) — field seed in `begin` | The field uses `ent.data.boreSeed` when present, otherwise asteroid id. PQ-024 must retain the exact seed used by the live session so Core commitment cannot reroll the target. |
| VERIFIED | [`src/systems/asteroidSites.js`](../../../src/systems/asteroidSites.js) — `makeSiteRecord`, `serialize`, `deserialize`, `_normalize` | At the base, `asteroidSites` owns `state.sites` and serializes anchored sites only. This is pattern evidence, not a future owner promise. |
| VERIFIED | [`src/systems/asteroidSites.js`](../../../src/systems/asteroidSites.js) — `installMachine`, `_anchorSite` | The base Core path freezes a bore seed and records an anchor. Integrated PQ-017 may retain, replace, or wrap it. |
| VERIFIED | [`src/systems/asteroidSites.js`](../../../src/systems/asteroidSites.js) — `_tickSite`, `_tryLaunch`, `_resolvePods` | The base already has actual production/export mutations. PQ-024 must consume an authoritative output receipt rather than reproduce these calculations. |
| VERIFIED | [`src/systems/siteProduction.js`](../../../src/systems/siteProduction.js) — production functions | Production math is pure and separate from UI. It is not PQ-024 lifecycle truth. |
| VERIFIED | [`src/systems/siteLogistics.js`](../../../src/systems/siteLogistics.js) — `buildComponents`, `reconcileStores` | Deterministic component and normalization idioms already exist. |
| VERIFIED | [`src/data/sites.js`](../../../src/data/sites.js) — Core, Extractor, recipes, balance | Existing machines can supply the corridor. No new roster or recipe is required. |
| VERIFIED | [`test/asteroid-sites.test.mjs`](../../../test/asteroid-sites.test.mjs) — anchor, loss, production, deterministic, round-trip cases | Existing tests are reuse patterns, not proof of the corrected PQ-017 lifecycle. |
| VERIFIED | [`design/ASTEROID_OPS_VISION.md`](../../../design/ASTEROID_OPS_VISION.md) — Formations and Wave 1 | The desired target is a contiguous same-material interior formation revealed by Survey. Later thermal, signature, cluster, and station waves remain excluded. |
| VERIFIED | [`design/ASTEROID_SITES_BRIEF.md`](../../../design/ASTEROID_SITES_BRIEF.md) — physical persistence and aggregate logistics | The design rejects per-item logistics and requires the inner operation to produce a truthful exterior consequence. |
| VERIFIED | [`src/systems/asteroidFormationModel.js`](../../../src/systems/asteroidFormationModel.js) — contract header | The existing model groups asteroid bodies in flight space and explicitly disclaims interior cell seams. |
| VERIFIED | [`src/systems/asteroidFormations.js`](../../../src/systems/asteroidFormations.js) — durable field-level discovery | Field-level formations have a separate owner and identity domain. |
| VERIFIED | [`test/asteroid-formation-persistence.test.mjs`](../../../test/asteroid-formation-persistence.test.mjs) | The suite supplies useful idempotence patterns but is only a separation regression here. |
| VERIFIED | [`src/ui/asteroid/asteroidScreen.js`](../../../src/ui/asteroid/asteroidScreen.js) — Survey and announcement wiring | The live screen already exposes Survey and a screen-reader status surface. |
| VERIFIED | [`src/ui/asteroid/asteroidController.js`](../../../src/ui/asteroid/asteroidController.js) — DRIVE/BUILD keyboard paths | Survey and Core installation are keyboard reachable without shared input edits. |
| VERIFIED | [`src/ui/asteroid/inspector.js`](../../../src/ui/asteroid/inspector.js) | The context bay can host one formation and lifecycle readout. |
| VERIFIED | [`styles/asteroid-ops.css`](../../../styles/asteroid-ops.css) | Focus, responsive, reduced-motion, and forced-colors hooks already exist. |
| VERIFIED | [`src/ui/asteroid/asteroidRenderer3d.js`](../../../src/ui/asteroid/asteroidRenderer3d.js) — read-only contract | The renderer must not own survey, lifecycle, or production truth. |
| VERIFIED | [`src/save/saveSystem.js`](../../../src/save/saveSystem.js) — save capture plan | The base saves site owners through declared keys. Integrated PQ-017 decides the future site key; PQ-024 must not add a parallel payload. |
| VERIFIED | [`src/core/registry.js`](../../../src/core/registry.js) | Existing owners are registered. A new PQ-024 registered system is unnecessary. |
| VERIFIED | [`src/ui/uiRoot.js`](../../../src/ui/uiRoot.js) — `SCREEN_MODULES` | Asteroid Ops is the live `drill` screen on raw and bundled routes. |
| VERIFIED | [`electron/main.cjs`](../../../electron/main.cjs) — `loadURL` | Electron and browser share the root game route and stable save origin. |
| VERIFIED | [`src/systems/asteroidSites.js`](../../../src/systems/asteroidSites.js) — `_ensureBeacon` | The base has a deterministic exterior relay seam, but it derives from anchoring and therefore must not be copied as the corrected producing predicate. |
| VERIFIED | [`src/render/partsLibrary.js`](../../../src/render/partsLibrary.js) | Generic relay mapping, fallback behavior, and bounded place residency already exist. |
| VERIFIED | [`assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay.json`](../../../assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay.json) | A generic authored relay record exists; this is not integrated PQ-022 acceptance. |
| VERIFIED | [`package.json`](../../../package.json) | Existing commands cover determinism, save, UI, asset, bundle, launch, and foundation proof. No package edit is needed. |

## 5. Reconciliation rules

### Reuse interaction and owner seams, not duplicate state

Survey, Core placement, existing producers, save/Continue, and the place asset boundary should be
reused after rebasing onto integrated PQ-017. All durable writes go through its landed API.

### Keep the two formation domains separate

The PQ-024 target is an interior component. It must not write `state.formations`, call
`asteroidFormations.discover()`, use `af_*` identity, or inherit field-level membership.
Use names such as `interiorFormation` or `corridorSurvey`.

### Never infer producing from capability

PQ-024 does not sum projected rates, inspect configured modes, or call production capability to advance
lifecycle. Only a receipt emitted at the existing owner's completed positive-output mutation counts.
If no receipt exists after PQ-017 lands, add one at that owner boundary; do not add a shadow tick.

## 6. Player route

1. **Cold:** enter Asteroid Ops on an uncommitted asteroid.
2. Pulse Survey. The first qualifying pulse selects one target and reveals a bounded subset.
3. Move and pulse again. The same target progresses; no second target appears.
4. Read the warning that the survey is volatile until Core commitment.
5. Install the existing Core.
6. PQ-017 atomically commits the anchored World Site and adopts or reconstructs the exact target,
   target cell list, and revealed-cell set.
7. **Committed/anchored:** save now persists the site and survey, but exterior entity count remains `0`.
8. Use the existing production route until one non-Core producer commits positive output.
9. The production owner emits one unique receipt; PQ-017 accepts it and records `producing`.
10. **Producing:** exterior entity count becomes exactly `1`.
11. Save, return to menu, Continue, and re-enter.
12. Verify unchanged survey and production receipt, lifecycle still producing, entity count still `1`.
13. Retract and see the same relay/collar at normal flight-camera distance.

A save/Continue between steps 3 and 5 may lose survey knowledge. That is permitted only when the
warning was visible and no durable site record was created.

## 7. Architecture and data flow

### 7.1 Roles to bind after PQ-017 lands

| Role | Owns | Must not own |
|---|---|---|
| `DrillSessionOwner` | Active field seed, transient target/cells/reveal/operations, live scan visibility | Durable site, lifecycle, production, save |
| `WorldSiteOwner` | PQ-017 site id, Core transaction, anchor, adopted survey, lifecycle, accepted production proof, serialization | Production algorithm, UI, renderer assets |
| `ProductionOwner` | Existing power/input/output/throughput/inventory mutation and output receipt | Site lifecycle, exterior count |
| `ExteriorProjection` | Transient exactly-one relay/collar projection from lifecycle | Survey, claim, production, save |
| Asteroid Ops UI | Read-only presentation and existing intents | Durable or production state |
| Render/asset owner | Preferred/fallback visual and residency | Site lifecycle or save |

### 7.2 Transient cold survey

```text
existing Survey input
  -> DrillSessionOwner pulse
     -> record actual field source seed
     -> pure one-target selector/reducer
     -> update transient survey only
     -> emit read-only UI progress
     -> serialize nothing
```

Proposed transient shape:

```js
state.drill.corridorSurvey = {
  version: 1,
  sourceSeed: 0,
  target: null | {
    id: 'isf_<hash>',
    materialKey: 'ore:<id>' | 'gas' | 'rock' | 'matrix',
    seedCell: 0,
    cells: [],
  },
  revealed: [],
  effectiveOps: [
    { ordinal: 1, centerCell: 0, radius: 5, targetId: 'isf_<hash>', addedCells: [] },
  ],
};
```

`effectiveOps` is not a prospect ledger. It is session-only, unsaved, and bounded because each stored
operation adds at least one previously unknown cell and the field has 1,260 cells.

### 7.3 Atomic Core adoption

A valid PQ-017 Core transaction must prove:

- placement, cost, uniqueness, and physical access are valid through existing owners;
- the active session belongs to the body being committed;
- the committed bore seed equals the session `sourceSeed`;
- the transient snapshot is valid, or its effective operations deterministically reconstruct it.

Transaction order:

```text
validate everything
  -> compute site, anchor, and transaction ids
  -> normalize transient snapshot
  -> independently fold effective operations
  -> adopt matching snapshot, or reconstruct from a valid fold
  -> consume materials once through existing owners
  -> commit PQ-017 site + anchor + survey atomically
  -> verify committed/anchored lifecycle
  -> emit one outcome after state is complete
```

If snapshot and fold disagree, or neither is valid, fail before cost, site, anchor, lifecycle, or
exterior writes. Empty survey is valid when no target was ever selected; corrupt earned survey must not
be silently replaced with empty state.

### 7.4 Authoritative lifecycle and production receipt

Semantics, regardless of final PQ-017 names:

```text
cold
  = no committed PQ-017 World Site

committed/anchored
  = Core transaction complete
  + durable anchor valid
  + transient survey adopted/reconstructed
  + no accepted positive production receipt

producing
  = committed/anchored
  + PQ-017 accepted one unique post-commit positive-output receipt
    from the existing ProductionOwner
```

Equivalent receipt fields must identify:

```js
{
  receiptId,
  siteId,
  producerId,
  outputId,
  actualAmount,
  simTick,
  ownerKind,
}
```

Rules:

- `actualAmount` is strictly positive and already reflected in owner state.
- The producer is a non-Core industrial producer.
- Receipt time is after commitment.
- Duplicate id is a no-op.
- Wrong-site, pre-commit, zero, negative, malformed, or unknown-owner receipts fail closed.
- Projected rates, configuration, UI status, and Core presence do not count.
- Producing is monotonic once established; later stalls remain live operational status, not lifecycle rollback.
- The accepted receipt id or equivalent proof is serialized by PQ-017.

### 7.5 Exactly one exterior consequence

```text
WorldSite lifecycle read
  -> cold or committed: desired entity count = 0
  -> producing: desired entity count = 1
       -> search live entities by durable site identity
       -> reuse the existing one, or spawn one when absent
       -> preferred PQ-022 visual when admitted
       -> otherwise generic/procedural fallback
```

The entity is a transient projection, never lifecycle truth. Missing art cannot change lifecycle,
production, save data, or entity count. Repeated receipt, load, sector-enter, and repair paths converge
to exactly one.

## 8. Deterministic reveal contract

### 8.1 Selection before Core

On the first pulse intersecting a qualifying solid component:

- read the active field at that pulse;
- exclude empty, structures, invalid, and out-of-bounds cells;
- normalize material as ore, gas, rock, or matrix;
- build four-neighbor components with fixed traversal `N, E, S, W`;
- rank intersecting candidates by material priority, size descending, then minimum tile index;
- store exactly one target with its complete sorted cell list;
- hash source seed, material, seed cell, and cell-list hash into target id;
- use no site id, wall time, scan serial, locale order, ambient RNG, or array position.

If no target qualifies, a later pulse may select one. Once selected, never retarget.

### 8.2 Progressive reveal

For every later pulse:

- filter target cells inside the pulse footprint;
- sort by squared distance from pulse center, then tile index;
- take fixed integer quantum `K`;
- union into the sorted unique revealed set;
- record an operation only when new cells were added.

A duplicate event or repeated footprint is a no-op. Progress requires moving along the same formation.

Derived stages:

| Stage | Condition | Information ceiling |
|---|---|---|
| `UNKNOWN` | no target/reveal | no formation claim |
| `TRACE` | at least one revealed cell | material and designation |
| `CONTOUR` | middle integer threshold | direction/shape band and approximate extent |
| `ASSAYED` | final threshold or all cells revealed | exact selected count and intact condition |

Thresholds and `K` do not affect production.

### 8.3 Excavation after selection

Original target cells remain knowledge. Current condition derives from target cells and authoritative
cleared geometry:

- `intactCount`: target cells still solid;
- `severed`: seed removed or remaining target cells split;
- `consumed`: intact count zero.

No retarget and no production modification occur.

### 8.4 Exact adoption equivalence

Core commitment proves:

```text
normalize(target + revealed) == fold(sourceSeed, effectiveOps)
```

The equality covers target id, material, seed cell, complete target cells, and revealed cells.

### 8.5 Determinism constraints

- No ambient RNG, wall clock, timers, locale sort, or unstable object enumeration.
- Every cell list is finite, in-range, sorted, and duplicate-free.
- Each effective operation adds disjoint cells and uses a monotonic session ordinal.
- Progress is a spatial set union, never an event counter.
- Same seed, field, pulse route, Core transaction, and production receipt produce the same hashes in
  browser and Electron.

## 9. Save and Continue

### Pre-Core

No PQ-024 durable key exists. Continue may lose transient survey. The screen must state:

> Survey memory is volatile until the Massline Core commits this site.

### After Core

Integrated PQ-017 stores the survey and lifecycle in its own schema, reusing equivalent fields where
present. PQ-024 must not add a parallel save payload. Required semantics are:

```js
{
  target: null | { id, materialKey, seedCell, cells },
  revealed: [],
  lifecycle: 'committed' | 'producing',
  producingReceiptId: null | string,
}
```

The exact key, schema version, normalization, migration policy, and load order come from PQ-017.

### Continue behavior

- same site and anchor;
- same bore/source seed;
- same target and reveal hashes;
- committed without receipt restores zero exterior entities;
- producing with valid receipt restores producing and ensures exactly one entity;
- no production algorithm replays merely to reconstruct lifecycle;
- no stage/producing announcement fires solely because a save loaded.

### Corrupt and partial cases

| Input | Result |
|---|---|
| Cold save, no site | No durable survey; permitted loss as warned. |
| Valid snapshot at Core | Adopt exactly. |
| Invalid snapshot, valid ops | Reconstruct exactly. |
| Snapshot/ops disagreement | Abort Core before cost or durable writes. |
| Source-seed mismatch | Abort; never reroll. |
| Committed, no receipt | Restore committed and entity count `0`. |
| Producing without required valid proof | Follow PQ-017 fail-closed policy; never fabricate relay. |
| Valid producing, missing asset | Preserve lifecycle and show one fallback. |
| Duplicate receipt | No duplicate output, credit, transition, ledger, or entity. |
| Old PQ-017 save | Use PQ-017 default; never infer target or production from machine configuration. |

## 10. Single-writer, accessibility, performance, residency

### Single-writer

- Drill owns transient survey only.
- Integrated PQ-017 owns durable survey, anchor, lifecycle, and accepted receipt.
- Existing production owner performs and receipts actual output.
- Exterior projection owns only transient entity presence.
- UI is read-only over outcomes.
- Economy, cargo, credits, faction, combat, physics, AI, Massline, tether, renderer, and save owners are not bypassed.
- An adapter may not store parallel truth.

### Accessibility

- Reuse existing Survey and Core controls; add no binding.
- Text states: volatile cold survey, committed awaiting first production, producing relay online.
- Formation stage and severed/consumed condition are not color-only.
- Announce only target selection, durable adoption, stage change, producing, and degraded fallback.
- Duplicate/no-op events are silent; focus never moves.
- Reduced motion removes nonessential animation but preserves text and markings.
- Forced colors preserve borders and state labels.

### Performance

- Grid maximum is 1,260 cells.
- Component census occurs on first qualifying pulse, not per frame.
- Reveal runs only on effective pulses.
- Effective operations are bounded by unique revealed cells.
- Adoption runs once in Core commitment.
- Intact/severed derivation runs only on relevant excavation, load, selection, or inspector refresh.
- No per-frame BFS, sort, full-grid allocation, DOM rebuild, production polling, or full-family preload.
- Producing is receipt-driven.
- At most one current-sector consequence entity per producing site.

### Asset fallback and residency

Integrated PQ-022 publishes the preferred id and admission contract. PQ-024 supplies only semantic site
identity. Route receipts classify `preferred_asset`, `generic_asset`, or `procedural_fallback`.
Only preferred admitted art contributes to PQ-022 acceptance; all may preserve truthful PQ-024 state.

## 11. Future write-set and adapter gates

### 11.1 Mandatory post-PQ-017 binding

Because PQ-017 is unintegrated, naming the base-era durable owner as an unconditional write target
would be false. Before `READY`, bind:

- `PQ17_WORLD_SITE_OWNER_PATH` — exact integrated owner of site, Core transaction, anchor, durable
  survey, lifecycle, receipt acceptance, and serialization;
- `PQ17_PRODUCTION_OWNER_PATH` — only if the existing owner lacks an equivalent positive-output receipt;
- the existing or new unregistered pure helper path inside the PQ-017 namespace.

Unresolved role slots mean `BLOCKED`, not `READY`.

### 11.2 Always-proposed bounded paths after rebase

1. `src/systems/drill.js`
   - actual source seed, transient survey/ops, read-only adoption snapshot, durable visibility hydration;
   - no durable/lifecycle writes.
2. `src/ui/asteroid/asteroidScreen.js`
   - lifecycle/formation outcomes and announcements only.
3. `src/ui/asteroid/inspector.js`
   - one formation readout and one lifecycle sentence.
4. `styles/asteroid-ops.css`
   - scoped accessible styling.
5. `test/pq024-asteroid-ops-corridor.test.mjs` — new.
6. `scripts/check-pq024-asteroid-ops-route.mjs` — new, invoked directly.
7. Bound `PQ17_WORLD_SITE_OWNER_PATH`.
8. Optional bound `PQ17_PRODUCTION_OWNER_PATH`, receipt-only.
9. One reuse-first pure helper path.

If PQ-017 changes the drill or screen boundary, stop and revise the list before editing.

### 11.3 Pure helper selection

Use this order:

1. reuse a PQ-017 survey/geology kernel;
2. extend an existing pure helper owned by PQ-017;
3. only if neither exists, add one unregistered pure module in PQ-017's namespace.

No registered PQ-024 system is allowed.

### 11.4 Exact `asteroidSites` adapter rules

`src/systems/asteroidSites.js` is not an unconditional write target.

If PQ-017 lands elsewhere and retains it as an adapter, it may only:

- forward existing Asteroid Ops commands to PQ-017's public API;
- translate read-only PQ-017 projections for the existing screen;
- keep nonserialized identity caches invalidated on load/sector change.

It must not:

- own or serialize target, target cells, reveal, anchor, lifecycle, production receipt, or exterior truth;
- add a second save key or state store;
- calculate production or producing;
- emit a rival authoritative transition;
- keep an independent beacon registry.

Tests/source checks must prove durable reads/writes resolve to PQ-017. If PQ-017 supersedes the file,
leave it untouched. If PQ-017 lands in it, the landed owner symbols—not the base snapshot—are authoritative.

### 11.5 Asset boundary

No PQ-024 asset, Blender, manifest, release, or renderer edit is proposed. If PQ-022 requires one,
return it to the PQ-022 owner. PQ-024 may select the published asset id only at the lifecycle projection boundary.

### 11.6 No-write list

No program ledgers, worldbuilding, registry, top-level save key, migration, field-level formation owner,
shared input, flight HUD, combat, AI, Massline, tether, world, economy, cargo, faction, renderer, assets,
Blender, manifests, releases, package, or generated indexes.

## 12. Mutex, dependency, and collision analysis

| Surface | Risk | Ruling |
|---|---|---|
| PQ-017 | Critical | Do not implement until integrated owner/schema/API/save/lifecycle/tests are bound. Do not inspect its protected candidate. |
| PQ-022 | High visual dependency | Final id/admission/LOD/residency unknown. Generic fallback is provisional. |
| Save schema | High | PQ-017 owner is sole serialized writer; no adapter/PQ-024 key. |
| Production | High semantic mutex | Add at most a receipt at the actual existing mutation seam; no algorithm fork. |
| Drill | Medium | Transient state only; one snapshot crosses the Core transaction. |
| HUD styles | Medium | Asteroid Ops only after owner symbols settle. |
| Renderer/assets | Avoided | Existing projection and place boundary only. |
| Browser GPU | Serialized | One evidence owner; browser then Electron. |
| Registry/package/ledgers | Avoided | Any requested edit is a stop condition. |
| Field formations | Semantic collision | Separate ids, state, save, events, and tests. |
| Relay | Duplicate risk | Derive from lifecycle level state; prove `0/0/1/1`. |
| Git index | High | One integration owner; no parallel commits to shared seams. |

## 13. Adversarial matrix

| Failure | Required behavior |
|---|---|
| First pre-Core pulse | One transient target/reveal, no durable key. |
| Different-position pulse | Same target, deterministic additional cells. |
| Duplicate pulse | No cell, op, announcement, or durable change. |
| Pre-Core Continue | Knowledge may disappear; no orphan site; warning was visible. |
| Valid Core commit | Exact survey adopted atomically. |
| Bad snapshot, valid ops | Exact reconstruction. |
| Snapshot/ops disagree | Abort before cost/site/anchor/lifecycle writes. |
| Retry after abort | One material charge and one site transaction on success. |
| Source-seed mismatch | Abort; no reroll. |
| Target severed pre-Core | Same target adopted; no retarget. |
| Committed, no output | Lifecycle committed; exterior count `0`. |
| Positive projected rate only | Remain committed; count `0`. |
| First valid output receipt | Producing transition; count `1`. |
| Duplicate receipt | No duplicate output, credit, transition, ledger, or entity. |
| Invalid receipt | Reject; remain committed; count `0`. |
| Production later stalls | Lifecycle stays producing; count `1`. |
| Save committed before output | Restore committed and count `0`. |
| Save producing | Restore receipt/lifecycle and count `1`. |
| Repeated load/sector/repair | Count remains `1`. |
| Cache lost, entity remains | Identity search reuses it. |
| Two entities injected | Focused check fails; owner repair converges to one without lifecycle mutation. |
| Preferred art missing | Same producing state and one visible fallback. |
| Preferred art arrives | Controlled one-entity upgrade; never overlap. |
| Old save | PQ-017 defaults; no inferred target/production. |
| Corrupt producing flag | Fail closed; no fabricated relay. |
| Reduced motion/forced colors | All information remains legible. |
| Browser/Electron mismatch | Reject packet; no platform-specific state workaround. |

## 14. Phased plan and stop conditions

### Phase 0 — bind dependencies

Rebase onto integrated PQ-017, read its contract, bind exact owner paths, and read PQ-022's published
asset contract.

**Stop:** PQ-017 unintegrated, owner slots unresolved, lifecycle/atomic Core/save contract absent,
lease collision, or parallel-state requirement.

### Phase 1 — pure reveal reducer

Implement one-target selection, target-cell capture, spatial reveal, op folding, normalization, stages,
and severed/consumed derivation.

**Stop:** need for site id, wall time, ambient RNG, field-level formation state, second target, or production math.

### Phase 2 — cold drill integration

Wire existing Survey to transient state and volatile copy. Prove no pre-Core save record.

**Stop:** durable writes before Core, new input, new screen/mode, or new save key.

### Phase 3 — atomic PQ-017 commitment

Adopt/reconstruct survey in the Core transaction and bind durable bore seed to the active source seed.

**Stop:** best-effort post-commit adoption, silent survey loss, or parallel adapter truth.

### Phase 4 — producing receipt

Reuse or add a receipt at the existing production mutation seam. Only PQ-017 accepts it and advances lifecycle.

**Stop:** new tick/rate/inventory/power/throughput/recipe/export/credit logic or UI/adapter producing state.

### Phase 5 — one consequence

Project `0/0/1` entity presence from lifecycle and consume preferred/fallback art through existing owners.

**Stop:** duplicates, committed-only consequence, hidden fallback, or renderer/manifest/Blender work in PQ-024.

### Phase 6 — save and route proof

Run focused, deterministic, save, UI, asset, bundle, launch, browser, and Electron checks.

**Stop:** unexplained red, hash/count mismatch, silent pre-Core loss, no actual output receipt, or hidden-state acceptance.

## 15. Checks, player-route evidence, and receipts

### Proposed commands

```bash
node --test test/pq024-asteroid-ops-corridor.test.mjs
node --test test/asteroid-sites.test.mjs test/asteroid-formation-persistence.test.mjs
npm run check:sim:compare
npm run check:save-schema
npm run check:ui-a11y
npm run check:wcag-contrast
npm run check:ui:perf
npm run check:asset-reachability
npm run check:visual-stability
npm run check:bundle
npm run check:launch-policy
node scripts/check-pq024-asteroid-ops-route.mjs --browser
node scripts/check-pq024-asteroid-ops-route.mjs --electron
```

Replace/add the integrated PQ-017 focused suite. The field-formation suite is only a separation regression.

### Required machine-readable receipt

- implementation and dependency commits;
- bound owner/helper/adapter/UI/route paths;
- source seed;
- transient target id, target-cell hash, reveal hash, operation hash;
- durable post-Core target/cell/reveal hashes and equality proof;
- Core transaction id and exactly-once material charge;
- lifecycle sequence with no skipped state;
- accepted production receipt id, actual amount, producer, owner, and sim tick;
- proof projected rate did not advance lifecycle;
- entity counts cold `0`, committed `0`, producing `1`, post-Continue `1`;
- asset id and fallback class;
- PQ-017 save key/schema and round-trip hashes;
- browser/Electron route identity, errors, and artifact paths;
- every failed command with attribution.

### Browser route

Use `/` and ordinary controls:

1. pre-Core Survey to TRACE;
2. move and add reveal to same target;
3. capture volatility warning and transient hashes;
4. install Core;
5. capture exact adopted hashes, committed lifecycle, count `0`;
6. produce real positive output through existing owners;
7. capture production receipt and producing transition;
8. capture count `1` and normal-camera relay/collar;
9. save, menu, Continue, re-enter;
10. capture unchanged survey/receipt/lifecycle and count `1`;
11. retract and frame the exterior consequence.

A separate focused route may prove permitted pre-Core loss; it is not the accepted cold-to-producing route.

### Electron route

Repeat the same seed/actions in an isolated Electron profile. Prove `/`, identical hashes and lifecycle,
counts `0/0/1/1`, same fallback class, stable Continue, and no Electron-only preload/save/page errors.

### Route kill criteria

Reject if target starts only after Core; Core changes target/reveal; a prospect ledger persists pre-Core
knowledge; committed-only shows the relay; projected rate establishes producing; duplicate receipt
creates anything; consequence is UI-only; browser/Electron differ; preferred/fallback overlap; or hidden
state is the acceptance route.

### Planning-revision checks

**VERIFIED:** mandatory authorities and named sources were read at the exact base; site, production,
survey, save, UI, registry, Electron, asset, and focused-test seams were inspected; interior and
field-level formations were separated; this revision does not assign unconditional durable ownership
to base-era `asteroidSites`; all Markdown links target base paths; final Git diff must be one added
handoff file only.

**NOT RUN / NOT CLAIMED:** runtime implementation, focused tests, browser/Electron capture, GPU evidence,
visual acceptance, focused green, route acceptance, or integration.

## 16. Unresolved questions and risks

1. **UNKNOWN:** integrated PQ-017 owner path, symbols, lifecycle vocabulary, save key, and migration policy.
2. **UNKNOWN:** whether the production owner already exposes a positive-output receipt.
3. **UNKNOWN:** integrated PQ-022 asset id, admission, LOD/residency, and visual decision.
4. **UNKNOWN:** reveal quantum, stage thresholds, and final player-facing names.
5. **RISK:** source-seed mismatch silently rerolls the target; transaction must fail instead.
6. **RISK:** snapshot/operation ambiguity; complete target cells and disjoint effective ops are required.
7. **RISK:** capability mistaken for production; only actual owner mutation receipt counts.
8. **RISK:** producing-established confused with current running/stalled status; keep them separate.
9. **RISK:** base `_ensureBeacon` derives from anchoring; corrected projection must derive from producing.
10. **RISK:** adapter accretes truth; source/tests must fail parallel state.
11. **RISK:** route cost encourages hidden setup; acceptance still uses real screen, Core, producer, save, and `/`.
12. **RISK:** technically present but unreadable art; normal-camera and independent PQ-022 review remain separate.

## 17. Controller-ready acceptance checklist

### Dependencies and binding

- [ ] Integrated PQ-017 is the implementation base.
- [ ] Exact World Site owner, save key/schema, production owner/receipt, and pure helper paths are bound.
- [ ] `asteroidSites` disposition is authoritative owner, adapter, or untouched.
- [ ] PQ-022 preferred asset contract is bound or fallback evidence is explicitly provisional.
- [ ] No active path/mutex collision.

### Scope and ownership

- [ ] One target, one lifecycle, one production receipt, one visible consequence.
- [ ] Prospecting starts before Core; no durable prospect ledger.
- [ ] Drill transient, PQ-017 durable, production owner actual output, projection entity-only, UI read-only.
- [ ] Adapter contains no parallel survey/claim/production/exterior truth.
- [ ] No production, colony, machine, heat/signature/defense, cluster, station, input, renderer, or save expansion.

### Atomicity and determinism

- [ ] Session source seed equals committed bore seed.
- [ ] Fixed traversal/ranking and stable target-cell identity.
- [ ] Spatial set union, duplicate no-op, no retarget.
- [ ] Snapshot equals operation fold; invalid disagreement aborts before cost/writes.
- [ ] No ambient RNG, wall time, locale sort, or unstable ordering.

### Lifecycle and save

- [ ] Cold -> committed/anchored -> producing, no skipped state.
- [ ] Producing requires unique positive post-commit owner receipt.
- [ ] Projected rate cannot advance lifecycle.
- [ ] Pre-Core Continue may discard with visible warning and no durable key.
- [ ] Committed save restores count `0`; producing save restores count `1`.
- [ ] No replayed production, credits, or duplicate transition on load.
- [ ] Old/corrupt/partial state follows PQ-017 fail-closed policy.

### Exterior, UI, and performance

- [ ] Entity counts are `0/0/1/1` at cold/committed/producing/post-Continue.
- [ ] Repeated receipt/load/sector/repair preserves one.
- [ ] Missing preferred art leaves one fallback and unchanged lifecycle.
- [ ] Existing controls, textual states, no color-only meaning, no focus theft.
- [ ] Reduced motion and forced colors preserve information.
- [ ] No per-frame component scan, sort, DOM rebuild, production poll, or full-family preload.
- [ ] Normal-camera consequence is independently reviewed.

### Proof

- [ ] Focused corridor and integrated PQ-017 suites green.
- [ ] Field-formation separation regression green.
- [ ] Determinism and save-schema green.
- [ ] UI a11y/contrast/perf green.
- [ ] Asset reachability, visual stability, bundle, and launch policy green.
- [ ] Browser and Electron routes prove pre-Core reveal, exact adoption, real production, one consequence, and Continue.
- [ ] Zero page, save, asset, unhandled, and duplicate-entity errors.
- [ ] Controller acceptance precedes any integrated claim.

## 18. SpaceFace receipt

```yaml
schemaVersion: 2
taskId: SF-PORT-05
packetId: PQ-024
title: PQ-024 corridor-minimal Asteroid Ops plan
status: returned/planning_complete
authoritative: false
planningOnly: true
implemented: false
focusedGreen: false
routeAccepted: false
integrated: false
baseCommit: 8f1c630f5ebf26f209052b8164f3cdf024ffd06f
requestedBranch: agent/chatgpt-pq024-asteroid-ops-20260723
corridor:
  formationTargets: 1
  preCoreReveal: transient
  preCoreContinue: may_discard
  coreAdoption: atomic_exact_adopt_or_reconstruct
  lifecycle: [cold, committed_anchored, producing]
  productionAuthority: integrated_PQ017_plus_existing_production_owner
  productionAlgorithmsAdded: 0
  visibleConsequences: 1
ownership:
  durableWorldSite: bind_after_PQ017_integration
  asteroidSites: authoritative_only_if_PQ017_lands_there_else_adapter_or_untouched
  parallelSurveyClaimTruth: false
dependencies:
  PQ-017: in_progress_not_integrated_supplied
  PQ-022: unmet
output: docs/handoffs/chatgpt-portfolio-20260723/PQ024_CORRIDOR_MINIMAL_ASTEROID_OPS.md
```

This receipt means only that the corrected planning handoff was returned. It is not a runtime, test,
route, visual, focused-green, or integration receipt.
