# PQ-038 — PERF-04 dense PresentationWorld implementation receipt

```yaml
packet: PQ-038
scope: generation-safe dense presentation mirror, retained visibility queries, and one-pass renderer publication
implementationBranch: claude/perf00-20260727
implementationParent: 9f614b9d07afbe84b073a53d139aabfc2f28fce4
implementationCommit: this_receipt_commit
routeClaim: integrated_structural_green
acceptanceClaim: focused_deterministic_green_native_broker_pending
disposition: PARTIAL
qualityInvariant: preserved
```

## What this receipt claims

PERF-04's production architecture is implemented on the ordinary renderer route. `GameState` remains the
only simulation authority. The renderer consumes the bounded PERF-02 presentation journal into a disposable,
generation-safe, dense `PresentationWorld`, queries retained visibility candidates, and traverses visible and
visibility-transition handles instead of scanning every registered mesh root each frame.

The accepted growth target is now represented directly in production code:

```text
O(changes + visibility candidates + visible handles)
```

Static visible roots skip redundant pose writes once interpolation settles. Far-culled roots receive one final
current-pose synchronization when leaving the visible set and then receive no repeated transform writes. A
newly visible root receives a full pose synchronization. Stable diagnostics are mutated in place, and the former
second broad HLOD mesh traversal is gone.

This is an **implementation and focused deterministic claim**, not terminal PQ-038 acceptance. It does not claim
measured 1x/5x publication improvement, image or temporal parity, native Browser/Electron acceptance, context-
recovery soak, or a GPU/compositor/resource improvement. Those claims remain owned by the broker-managed
`performance-presentation-world` matrix on an uncontended evidence machine.

No FPS or frame-time result is inferred from this workstation because concurrent coding agents made it a
non-static performance baseline.

## Implemented architecture

### Dense disposable world

`src/render/presentationWorld.js` owns derived presentation records in structure-of-arrays storage:

- typed arrays for alive state, stable entity IDs, slot/source generations, previous/current pose, visual radius,
  flags, visibility, dirty masks, type codes, dense active positions, free slots, and spatial-list links;
- compact side tables only for entity and Three.js mesh references;
- a stable entity-ID-to-slot map and dense active-slot list;
- free-list reuse with monotonically advanced slot generations;
- handles validated by slot plus slot generation, with source generation retained separately;
- duplicate stable-ID rejection and stale-handle rejection;
- explicit bind/unbind, retire, clear, rebuild, and dispose ownership;
- retained diagnostics for capacity, active/bound counts, high-water state, rebuilds, generation rejects, and
  spatial behavior.

The world is rebuildable from current alive entities and is never read by simulation systems. Destroy/reuse
cannot make a stale handle refer to a new entity generation.

### Complete previous/current pose publication

`src/core/presentationJournal.js` now publishes previous and current scalar pose values:

```text
prevX / prevY / prevZ / x / y / z
prevRot / prevBank / prevPitch / rot / bank / pitch
```

Missing previous values safely fall back to the current pose. This preserves the existing fixed-step
interpolation contract without retaining gameplay objects inside the journal.

`PresentationWorld` consumes those scalars without allocating a temporary pose object per visible entity.
Visible live records can settle interpolation from current `GameState` while the journal remains the ordered
spawn/destroy/transform/visual publication boundary.

### Idempotent journal publisher

`src/render/presentationPublisher.js` consumes exclusive-start/inclusive-end journal ranges `(start, end]` and:

- applies spawn, destroy, transform, and visual records in journal order;
- advances only its private applied-sequence cursor;
- never acknowledges or discards journal records;
- clears and rebuilds when the journal rebuild generation changes;
- requests a journal rebuild and derives a temporary mirror from current `GameState` after an invalid range,
  missing retained range, identity mismatch, or record-application failure;
- returns retained result and spawn-slot buffers instead of allocating a new publication result each frame;
- publishes only newly spawned dense slots for targeted binding of mesh roots that existed before their spawn
  record was consumed.

Publication is consumed before the renderer's context-loss early return. This keeps the derived mirror aligned
with the same range that `PresentationRunner` may acknowledge after an accepted presentation callback, even
while GPU work is unavailable.

### Render-owned spatial query

`src/render/presentationQueries.js` retains candidate, visible, newly-visible, and newly-hidden buffers plus typed
epoch marks. It:

- converts frame-local camera bounds to global bounds through `global = local + frameOrigin`;
- queries a render-owned two-dimensional cell index rather than the simulation collider index;
- covers all bound presentation records, including non-collider presentation roots;
- includes `forceRender`, `neverCull`, and player records explicitly;
- deduplicates candidates and orders them by stable entity ID;
- applies the existing rectangle-plus-visual-radius visibility rule;
- snapshots slot generations alongside visible handles;
- emits exact visible/hidden transitions without allocating a result object per query.

The spatial index uses per-slot linked-list arrays and `Map<cellX, Map<cellZ, head>>` columns. Its maximum visual
radius is conservative and monotonic between clears, so candidate expansion cannot omit a previously admitted
large root.

### Ordinary renderer cutover

`src/render/renderer.js` now:

1. consumes dense publication;
2. rebinds all existing roots only after a full/fallback world rebuild, or binds only newly published spawn slots
   during ordinary incremental publication;
3. keeps mesh construction, replacement, destroy, eviction, clear, and context-recovery ownership paired with
   PresentationWorld bind/unbind operations;
4. queries dense visibility and final-syncs newly hidden roots;
5. traverses visible handles in stable entity-ID order;
6. refreshes live pose only for visible or transitional records;
7. writes a root transform only when transform/binding/visibility state is dirty or interpolation still has a
   previous/current delta;
8. preserves floating-origin projection as `local = global - state.world.frameOrigin`;
9. preserves the legacy conditional hull bank/pitch behavior instead of overwriting authored hull rotation when
   those fields are absent;
10. runs existing LOD, World Site presentation, damage, drive, shield, classification, authored closure, contact
    shadow, ship auxiliary, and authored/asteroid pool publication from the same retained visible entity frame;
11. accumulates HLOD counts during that traversal instead of performing a second `_meshes` scan; and
12. mutates retained entity-view and HLOD diagnostics rather than replacing them with fresh objects each frame.

The low-frequency mesh reconciliation route remains responsible for constructing and removing roots. It is not
a second per-frame presentation authority.

### Dense asteroid dirty signal

`PresentationWorld` retains an explicit asteroid-record dirty bit. `src/render/asteroidInstancePool.js` accepts
`recordsDirty` as the authoritative dense signal when supplied, avoiding a broad classified-record dirty scan on
stable frames. Existing fallback behavior remains available when the option is absent.

Camera changes, pool membership changes, release, explicit invalidation, and floating-origin rebase still force
re-evaluation. The exact normal-camera plus shadow-camera submission union remains unchanged.

## Concrete reread repairs

One direct reread of the completed implementation found and repaired four concrete production issues:

1. Replaced a per-visible-entity temporary pose object with scalar writes into dense arrays.
2. Replaced a per-query spatial-column closure with a stable helper.
3. Restored the legacy conditional hull bank/pitch contract so absent fields do not zero authored rotation.
4. Added retained newly-spawned slot publication and targeted mesh binding for roots created before their regular
   spawn record was first consumed, avoiding both a missed bind and a broad rebind scan.

No additional broad review or validation loop was opened after those repairs.

## Focused deterministic verification

| Gate | Result |
|---|---|
| `node --check` on `presentationWorld`, `presentationPublisher`, `presentationQueries`, `renderer`, `asteroidInstancePool`, and `presentationJournal` | **PASS** |
| `node --test test/presentation-world.test.mjs test/presentation-journal.test.mjs test/render-entity-frame.test.mjs` | **19 pass / 0 fail** |
| `git diff --check` on tracked PERF-04 paths | **PASS** — line-ending conversion warnings only; no whitespace errors |

The focused suite covers:

- dense slot reuse and stale-generation rejection;
- retained previous/current pose and interpolation settling;
- ordered/idempotent journal publication, transform, destroy, and rebuild behavior;
- retained targeted spawn-slot publication;
- deterministic visibility ordering and visible/hidden transitions;
- retained render-entity records and omitted-owner cleanup;
- authored instance bounded-frame behavior; and
- asteroid static matrix reuse, explicit dense dirty bypass, transform/rebase invalidation, camera union,
  visibility, detach, release, and membership ownership.

Per the architecture-first execution direction, no broad baseline matrix, test-of-test expansion, or repeated
adversarial loop was run for this coherent unit after the focused suite passed.

## Preserved boundaries

- `GameState`, the fixed-step registry, simulation order, 60 Hz behavior, four-step catch-up cap, fractional
  accumulator remainder, and whole-step shedding are unchanged.
- The journal remains a derived publication channel; `PresentationRunner` still owns acknowledgement.
- Content, authored population, effects, draw distance, cull bounds, LOD thresholds, materials, lighting, render
  quality, and default visual quality were not reduced.
- Browser and Electron retain the same ordinary WebGL2 renderer route.
- Cinematic intro/menu, compact third-person HUD, Massline behavior, gameplay systems, saves, assets, package
  dependencies, and source/release manifests were not modified.
- No production GLB or texture was touched.

## Residual acceptance gap

PQ-038 remains `acceptance: unproven`. Broker-managed evidence is still required for:

1. matched legacy/dense image and temporal behavior on quiet flight, dense combat, travel/rebase, damage/effects,
   authored admission, save/Continue, churn, and context recovery;
2. exact normal-camera visibility, LOD hysteresis, attachments, dynamic closures, stable authored roots, contact
   shadows, ship auxiliary output, authored instances, asteroid normal/shadow union, trails, and lights;
3. Browser and packaged Electron route parity;
4. repeated rebuild, slot-reuse, rebase, and context-loss soak with bounded resources and no stale generation;
5. current-population and five-times-population publication measurements bound to one admitted route digest; and
6. proof on an uncontended machine that five-times-population dense publication is no slower than the legacy
   current-population path without reducing content or quality.

The implementation is dependency-ready for PERF-05. It is not claim-ready for terminal PERF-04 acceptance:
**dependency-ready is not claim-ready**.
