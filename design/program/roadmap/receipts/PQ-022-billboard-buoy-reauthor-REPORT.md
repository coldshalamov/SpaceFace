<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.billboard-buoy-reauthor
acceptance: focused_green
disposition: PASS
candidateCommit: dab9199a
-->

# PQ-022 leaf — navigation-infrastructure identity split

```yaml
packet: PQ-022
dispatchUnit: PQ-022.billboard-buoy-reauthor
candidateCommit: dab9199a0df618c95d3844b74cde2590c8d6bc2f
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
exactSourceVisualBinding: true
routeEvidenceClaimed: false
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

1. `PQ-022.billboard-buoy-reauthor-h1` owns any targeted Browser/Electron presentation capture.
2. `PQ-022.billboard-buoy-reauthor-review` owns causal review of that route evidence.
3. `PQ-022.h3-performance` owns representative matched corridor performance.
4. The portfolio parent `PQ-022` remains open for its other named families and milestone promotion.
