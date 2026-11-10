# PQ-018 leaf — Wreck Cathedral asset admission

```yaml
packet: PQ-018
leaf: PQ-018.asset-admission
scope: packet Phase 0 (source reconcile/review) + Phase 1 (release and admission)
baseCommit: 106629c4
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - assets/ships/parts/parts_manifest.json
  - assets/ships/release/parts/places/place_landmark_wreck_cathedral.glb
  - assets/ships/release/release_manifest.json
  - src/render/assetLoader.js
  - src/render/partsLibrary.js
  - test/pq018-wreck-cathedral-admission.test.mjs
  - design/program/roadmap/active/PQ-018.md
  - design/program/NOW.md
  - design/program/roadmap/receipts/PQ-018-asset-admission-REPORT.md
review:
  discovery: self-review + adversarial gate replay
  causalRereview: APPROVE
```

## What this leaf claims

The preserved Wreck Cathedral source candidate is admitted to the release and runtime asset chain and
loads through the ordinary authored-place path in a live browser. Nothing else about PQ-018 is
claimed: there is no World Site manifest, no Ceres placement, no component/operation wiring, no
evidence receipts, no map identity, and no Browser/Electron route acceptance. Those remain Phases 2–4.

This is the gate the source handoff itself named — `forbidden_for_thread_c_until: RELEASE_BUILT`
in `design/graphics-sprints/handoffs/2026-07-20-B-pq018-wreck-cathedral-source.yaml`.

## Exact source identity (frozen)

| Fact | Value |
|---|---|
| Source GLB | `assets/ships/parts/places/place_landmark_wreck_cathedral.glb` |
| Source SHA-256 | `f335935f9658bad0e721aceb5d66bb4c2f0457fe411442819b4a3455a00af704` |
| Source bytes | 11,155,156 |
| Blend SHA-256 | `1bc08169c13b76c9caf2273c50d07be51a6ce84bacd8dca8831c4f9bec48ac13` |

Both hashes match the source handoff byte for byte. The source was **not** modified: the packet
freezes the reviewed candidate, and any edit would invalidate the committed evidence set under
`assets/ships/parts/revamp-evidence/place_landmark_wreck_cathedral/`.

## Release artifact

| Fact | Value |
|---|---|
| Release GLB | `assets/ships/release/parts/places/place_landmark_wreck_cathedral.glb` |
| Release SHA-256 | `dc5510f88b128d9a40e427700fe4b0b212987db152f60757ef5035bda270a49a` |
| Bytes | 11,155,156 → 6,160,084 (44.8% smaller) |
| Textures | 26 → 26 KTX2/BasisU (0 PNG reach the runtime) |
| Geometry | `EXT_meshopt_compression` + `KHR_mesh_quantization`, 97 meshopt buffer views |
| Contract nodes | 30 preserved |
| Reproducible | rebuild produced the identical SHA-256 |

Built with existing tooling only:
`node scripts/build-sg04-release-assets.mjs --no-clean --only place_landmark_wreck_cathedral`.

Source→release parity measured directly: 40 nodes before and after with no additions or drops,
134,436 triangles unchanged (no silent decimation), the same eight semantic materials, and all
twelve semantic markers — `SOCKET_Flythrough_Entry/Exit`, `SOCKET_TheMarker`, `ZONE_Bridge`,
`ZONE_BrokenKeel`, `ZONE_Propulsion`, `ZONE_Service_Port/Starboard`, `SALVAGE_ConduitBank`,
`SALVAGE_EngineMachinery`, `SALVAGE_ServiceRack`, `INTERACTION_HangarCavity` — preserved with exact
local transforms and `spaceface.semanticRole` extras. Phase 2/3 can anchor components on these
offsets without re-measuring the asset.

## Manifest and runtime registration

`parts_manifest.json` gains one `places` row: `budgetClass: landmark` (134,436 tris and 11.16 MB both
exceed the modular-part budget), measured bounds `609.268 × 239.598 × 252.414`, three declared
sockets, and the file wired into `runtimeSlots.place`. `partsLibrary.js` adds the file to the shared
`PLACE_FILES` whitelist — the same resolution path as every other place, no Cathedral-specific
loader branch. The bootstrap plan still pins only `wholeships/kestrel.glb`, so admission adds **zero**
startup decode or residency cost; the landmark streams on demand and nothing references it yet.

## Product defect found and repaired

The live probe rejected the release artifact:

```
place_landmark_wreck_cathedral.glb violates the authored-part contract:
- mesh "LOD0_InteriorExposedAlloy" contains shear; apply parent transforms before export
- mesh "LOD1_InteriorExposedAlloy" contains shear
- mesh "LOD2_InteriorExposedAlloy" contains shear
```

No shear exists. Measured over all 24 release mesh nodes, the largest relative basis
non-orthogonality is `4.58e-8`. The defect was in `validateNodeTransform` in
`src/render/assetLoader.js`: it compared a node matrix against its decompose→recompose round trip
with a fixed `1e-5` **element** epsilon. Those elements carry the node scale, so the epsilon is an
angular tolerance divided by that scale. Release quantization folds a dequantization scale into node
TRS — this asset's largest draw group lands at ~265× — where float32 quaternion round-off alone
produces a `1.79e-5` element residual on a perfectly orthogonal basis. A unit-scale node was checked
at 1e-5 rad; a 265× node was checked at 3.8e-8 rad.

Repair: the tolerance now scales with the node's transform, with the historical absolute epsilon as
the floor (`1e-5 × max(1, |scale|)`), so shear is measured as the same angular skew at every node
size and no unit-scale node becomes more permissive. The classification logic was extracted into the
exported pure predicate `authoredTransformIssue(matrix)` so the invariant is testable in
milliseconds instead of only through a browser probe.

This is a shared-owner change to the renderer's asset boundary, made because the packet's own gate
could not otherwise be satisfied and because the check was measurably wrong rather than merely
inconvenient. It is behaviour-preserving for every asset already shipping: verdicts are unchanged
across the whole release corpus (see gates below).

## Gates

| Gate | Result |
|---|---|
| `node --check` on both changed modules, `git diff --check` | pass |
| `node --test test/pq018-wreck-cathedral-admission.test.mjs` | **7/7 pass** |
| `test/world-site-assets.test.mjs` | 4/4 pass |
| `test/asset-loader-technique-policy.test.mjs`, `asset-validation-technique-policy`, `asset-runtime-disposal`, `asset-startup-structural-preload`, `authored-assets-probe-evidence`, `runtime-asset-lod-policy` | pass |
| `npm run check:asset-reachability` | pass |
| `node scripts/check-asset-status.mjs` | pass — 81 parts tracked, 0 ambiguous |
| `node scripts/check-runtime-asset-contract.mjs` | 5 required failures, **all pre-existing**; Cathedral contributes 0 required and 0 advisory |
| `validateReleaseAssetPairs` on the Cathedral pair | `ok: true`, 0 issues |
| `npm run check:sim:compare` | `ok: true`, `hashEqual: true`, `firstDivergentTick: null` |
| `npm run check:bundle` | pass — 48% JS reduction |
| `npm run check:launch-policy` | pass |
| `node scripts/check-atlas-integrity.mjs`, `check-data.mjs`, `check-data-refs.mjs`, `check-asset-classifications.mjs` | pass |
| `node scripts/check-program-docs.mjs` | PASS, 0 warnings |
| `npm run check:assets:live` (headless Chromium) | **the Cathedral loads with no fallback and no contract violation.** Suite still red on one pre-existing asset (below) |
| `npm run check:visual-stability` | **BLOCKED** by the same pre-existing asset (below) |

Release build reproducibility verified by a second build producing an identical SHA-256.

### `check-parts-manifest.mjs` delta, stated honestly

Baseline at `106629c4`: `2926 ok, 267 fail`. After this change: `2954 ok, 273 fail`.

Every computable assertion for the new row passes — bytes, triangles, world bounds, sockets,
undeclared-socket audit, materials, embedded textures, runtime-slot wiring, and
`hasRuntimeAssetMetadata` (satisfied via `spacefaceAsset.contractVersion: 1`). The row also clears
the pre-existing `committed GLB ... is declared in manifest` failure.

It adds seven failures in the legacy flat-`asset.extras` family (`extras part id`, `category`,
`priority`, `triangleCount`, `textureSize`, coordinate contract, `boundsDimensionsM`). **Every place
asset in the repository already fails that same family** — `place_claim_outpost_relay`,
`place_station_research`, `place_lane_beacon` and 24 others. Adding the stamp requires rewriting the
source GLB's JSON chunk, which the packet forbids (frozen candidate) and which would invalidate the
source evidence manifest. Recorded as a follow-up, not silently absorbed.

## Pre-existing blockers found (not caused by this leaf, not repaired here)

Commit `ede16953 chore(assets): checkpoint completed place remasters` replaced five place source
GLBs without regenerating their release artifacts or manifest rows. The consequences are live:

1. **`place_debris_chunk.glb` blocks the default route.** Its *source* now has empty `asset.extras`
   and **zero embedded images** (9 materials, 83 meshes, no textures). The runtime rejects it, so
   `check:visual-stability` never reaches playable flight — every ship stays `meshState: "loading"`
   with `loaderDiagnostics.failureCount: 1` naming only this asset. This is a source-authoring
   defect: a release rebuild cannot fix missing extras, UV0, or maps. It is the only remaining
   failure in `check:assets:live` (76/77 assets load).
2. `check-sg04-release-assets.mjs` fails on exactly six stale release pairs — `place_debris_chunk`,
   `place_dead_hulk`, `place_asteroid_rock_a/b/c`, `place_dock_interior`. The Cathedral is not among
   them.
3. `check-graphics-asset-receipts.mjs` fails on `place_asteroid_rock_a` byte drift.
4. `test/visual-asset-remaster-sources.test.mjs` fails three cases, all on `place_dock_interior`.
5. `check-asset-pipeline-contract.mjs` fails its own gate-wiring assertion: `check:ci` does not reach
   the asset-pipeline contract through `check:art` (`0 !== 1`).

These sit inside the visual-production lane's protected surface and require Blender re-authoring, so
they were left untouched. They are the reason `npm run check:art` and `npm run check` are red at
`106629c4` independently of this work.

## Residuals

- No Browser/Electron **route** acceptance, no visual review at the game camera, and no measured
  performance profile. The landmark is not placed in the world, so there is no route to walk yet.
- `check:visual-stability` — one of the packet's three named gates — is unproven, blocked by (1).
- The independent art review the packet requires on the exact source candidate has not been
  performed by a second party. Only structural/technical validation is claimed here.
- The release GLB inherits the source's `spacefaceAsset.lifecycle: "SOURCE_GLB"`,
  `runtimeWired: false`, `routeAccepted: false`, and `textureCompression: "PNG-source; release
  compression intentionally deferred"` extras, which are now stale for the release artifact. No check
  reads them; correcting them requires a source re-export.

## Follow-ups (deliberately excluded)

1. Repair `place_debris_chunk` and the four other `ede16953` remasters at source, then rebuild their
   release artifacts and resync their manifest rows. This unblocks `check:visual-stability`,
   `check:assets:live`, `check:art`, and `npm run check`.
2. Resync the legacy flat `asset.extras` stamp across the place corpus, or teach
   `check-parts-manifest.mjs` to accept `spacefaceAsset` for the facts it already carries.
3. Re-wire `check:ci` to reach the asset-pipeline contract exactly once through `check:art`.
4. `probe-ship-visual-stability.mjs` and `test/asset-residency-refcounts.test.mjs` prefer a system
   Chrome/Edge install with no GPU flags. Both booted here (~13 s), but the residency test still
   exceeded its 120 s budget under software GL; a probe-level GPU-flag or timeout policy would make
   these gates portable.

## Next PQ-018 phase

Phase 2/3 may now consume the admitted asset. `RELEASE_BUILT` is reached, so the source handoff's
`forbidden_for_thread_c_until` gate is cleared. Before wiring a World Site, note that
`src/data/worldSiteAssetBindings.js` binds sockets by `spaceface.socketRole`, while this asset's
markers carry `spaceface.semanticRole`; the binding contract needs one narrow extension (or a
socket-role re-export) and `test/world-site-assets.test.mjs` asserts the binding key set equals the
Helios site's stage `placeId` set, which must generalise across manifests when a second site lands.
