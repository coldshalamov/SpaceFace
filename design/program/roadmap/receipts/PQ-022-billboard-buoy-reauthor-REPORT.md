<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.billboard-buoy-reauthor
acceptance: route_review_pass
disposition: PASS
candidateCommit: dab9199a
-->

# PQ-022 leaf — navigation-infrastructure identity split

```yaml
packet: PQ-022
dispatchUnit: PQ-022.billboard-buoy-reauthor
candidateCommit: dab9199a0df618c95d3844b74cde2590c8d6bc2f
repairCandidateSha256: cbaed85c003e24da2bb0088c41db005f484ba6b3541bf6c2e32cf1b2ef0a4ed7
lifecycleClaim: integrated
acceptanceClaim: route_review_pass
disposition: PASS
exactSourceVisualBinding: true
routeEvidenceClaimed: true
routeEvidenceNote: ordinary + diagnostic-close stills, broker-authorized acceptance cells, browser and electron
performanceEvidenceClaimed: false
```

## Verdict

PASS for the production leaf already integrated by `dab9199a`. The ordinary core-station display is
now a neutral information structure, the Helios Candle Fleet memorial has one dedicated 24-light
identity, and the broadly reused buoy reads as faction-neutral navigation infrastructure. The new
memorial uses the normal place registry and existing POI anchor; there is no special renderer path.

This receipt reconciles live code and retained evidence with the stale claimed state. It does not
claim Browser/Electron presentation, route-causal review, representative performance, or independent
G7 art acceptance.

## Exact integrated artifacts

| Asset | KEEP-reviewed candidate | Canonical source | Optimized release |
|---|---|---|---|
| `place_station_billboard` | `d86365e3...29ad`, 444,256 bytes | `ccdd548c...cac9`, 444,680 bytes | `1a780be0...d0c5`, 193,736 bytes |
| `place_memorial_array` | `fd18cf66...43b9`, 526,208 bytes | `9cb774d8...45f4`, 526,636 bytes | `7bb0c770...8667`, 238,788 bytes |
| `place_nav_buoy` | `c5dbebc1...3ac4`, 409,376 bytes | `eb4a57b6...f39a`, 409,808 bytes | `5f7c43a6...86e6`, 199,176 bytes |

The guarded promotion changed lifecycle JSON metadata but preserved each candidate's BIN payload
byte-for-byte. The exact-source render manifest `5e76b01a...df5` binds 27 original-resolution views;
the evidence-bound solo-integrator promotion review records KEEP for G1, G2, G4, and emissive
behavior on all three candidates. Canonical source/release rows are present in both manifests.

## Live player-path proof at reconciliation

| Check | Result |
|---|---|
| `node --test test/pq022-navigation-infrastructure-runtime-split.test.mjs` | **3/3 PASS**: dedicated memorial, six ordinary shared billboards, and shared neutral buoys resolve through the normal place owner |
| `npm run check:atlas-integrity` | **PASS**: 280 authored nodes resolve, including the new memorial place; no bespoke renderer art path |
| Candidate-to-live GLB BIN comparison | **PASS** for all three assets; exact binary payload equality |

No production file was changed during reconciliation, and no Browser or Electron launch was spent.

## Honest residuals

1. `PQ-022.h3-performance` owns representative matched corridor performance.
2. The portfolio parent `PQ-022` remains open for its other named families and milestone promotion.

---

# REOPEN REPAIR — 2026-09-10 (buoy only; billboard disposition unchanged)

The 2026-09-10 causal review returned the buoy only (`PQ-022-reauthor-causal-review-2026-09-10.md`):
post-and-cap head, sub-pixel signal, and a service panel dressed in the asteroid palette. The
billboard PASSED and was not touched or recaptured. The repair is integrated and route-reviewed.

## Repair artifact identity

| Artifact | SHA-256 | Bytes |
|---|---|---|
| Repair candidate `source_candidates/material_truth_v2/places/place_nav_buoy.glb` | `cbaed85c003e24da2bb0088c41db005f484ba6b3541bf6c2e32cf1b2ef0a4ed7` | 430,060 |
| Live source `assets/ships/parts/places/place_nav_buoy.glb` | `edcfd2779a4248c32d71a3f8984644be8fadbeedac9493e13d869955ad9e0780` | 430,492 |
| Live release `assets/ships/release/parts/places/place_nav_buoy.glb` | `e7d41985b76e4c02394dd39e84997e478cc3b9f8016eb93cbd1d74206cc226f2` | 205,660 |
| Authored Blend `assets/ships/parts/blender/place_nav_buoy_authored.blend` | `2d7422948ba6e9aa3bcc1322ac2d30479b23d1684ba069ba6902f02e44390efb` | 253,032 |

Billboard and memorial live files are hash-guarded untouched by the buoy-only promotion
transaction; their rebuilt candidates were re-proven BIN-payload identical to the committed
promoted-era candidates. LOD0/1/2 = 1876/972/288 render triangles (envelope, collision helper,
socket, and five semantic material roles unchanged).

## Repair content

Wide faceted lantern with hazard waist and framed emissive panes on all four cardinal faces
(emission 6.0) at the scale the billboard's display face carries, hooded mast lantern drum beacon,
overhanging dark cap plus offset service gantry for outline asymmetry, bright bone mast and hull
(0.88/0.82/0.70 warm enamel), true-orange marking (0.98/0.50/0.06), tilted gold-anodized radiator
wings on pylons. Head silhouette defect was closed in the first repair round and preserved.

## Root causes found while repairing (owner handoffs)

1. **Render-package freshness (release-pipeline owner):** the runtime renders this part through
   `assets/ships/release/render-packages/nav-buoy/`, which still snapshotted the pre-repair asset —
   the original promotion never rebuilt it, so the first two capture rounds rendered stale art.
   The package was recompiled from the promoted release and the `pilots.json` binding refreshed in
   this repair; the promotion flow itself needs the package rebuild as a step.
2. **POI dressing lifecycle (world owner):** quiet POI markers shelved off the entity list (world
   commit `b8cce1567`) are dropped on sector eviction while the stale sector bag suppresses
   re-materialization in `_ensureSectorMaterialized`, hiding lane furniture on re-entry. The
   repair cell resets the destination's residency records so `enterSector` performs the owner's own
   fresh first-visit materialization; the hole itself remains open for the world owner.

## Route evidence and verdict

- Browser and Electron broker-authorized acceptance cells (`pq022-nav-buoy-repair-browser` /
  `-electron`): **PASS**, fixed seed 47, ordinary + diagnostic-close stills, identity admission,
  authored release binding, zero unexplained page issues, browser↔electron parity.
- Independent vision-agent causal re-review over the retained stills, with serving-chain
  verification (release hash match, package recompiled after publish, captures postdate it):
  **PASS** — all three recorded defects and both reviewer findings closed at ordinary framing in
  both runtimes; two non-gating notes recorded (dim mast stub tip; the dark service trunk slab
  reads near-neutral and survives by adjacency — look at both next time the package is opened).
- Full evidence, gate records, and lineage: `assets/ships/m5_navigation_infrastructure/reports/
  material_truth_v2/VISUAL_REVIEW.md` and the validation binding.

---

# CONTROLLER RE-RUN — 2026-09-10 fleet 01a08d61

Queue row closed to `done`. No production files changed in this close.

| Check | Run 1 | Run 2 |
|---|---|---|
| `npm run check:pq022:corridor-assets` | PASS (4 allowed wasp LOD gaps) | PASS (same) |
| `node --test test/pq022-navigation-infrastructure-runtime-split.test.mjs` | 3/3 PASS | 3/3 PASS |
| `npm run check:atlas-integrity` | PASS (292 nodes) | not repeated; same committed atlas |
| `npm run check:graphics:asset-receipts` | CRASH ENOENT `helios_rock_a.glb` | unrelated missing source; not this leaf |

Honest residual: `PQ-022.h3-performance` still owns matched corridor performance. Parent PQ-022 stays open.
