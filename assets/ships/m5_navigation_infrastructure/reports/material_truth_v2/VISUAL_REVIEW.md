# PQ-022 Navigation Infrastructure Exact-Source Visual Review

Review date: 2026-08-04  
Dispatch unit: `PQ-022.billboard-buoy-reauthor`  
Candidate set: `pq022-navigation-infrastructure-material-truth-v2`  
Disposition vocabulary: `keep | revise | revert | blocked`

## Bound evidence

This review covers all 27 final-epoch exact-source images at their original `1600x900` resolution,
including the buoy's four-panel azimuth contact sheet assembled from exact-source views. The complete
per-image path, SHA-256, camera, lens, distance, LOD, and purpose ledger is:

- `render_manifest.json`: SHA-256
  `5e76b01aba531d31077ffac4b17c924b30e550e0087b7cf982122f54b23f7df5`, 33,235 bytes.
- `build_report.json`: SHA-256
  `1799e9a8ff8856593ae0788db31825f7e4ecf7d94608c1ec3275d6b79db05c9e`, 102,298 bytes.

| Asset | Exact candidate identity | Images reviewed | Result |
|---|---|---:|---|
| `place_station_billboard` | `d86365e3129b638c1c985c482fe3c5834d9769d8cb9211dee2e68bc06ee529ad`, 444,256 bytes | 7 | `keep` |
| `place_memorial_array` | `fd18cf6619f9847d2afa898929f73bdbb682b5a1d61e507eaf0866b6471b43b9`, 526,208 bytes | 10 | `keep` |
| `place_nav_buoy` | `c5dbebc188329dd35c15613aef864d20293e54c24537f356b3c78e8e5d1e3ac4`, 409,376 bytes | 10 | `keep` |

The source candidate and release-candidate mirror for each asset are byte-identical. Reimported
validation measured zero mesh triangles on every collision helper and preserved the frozen roots,
sockets, axes, and exact envelopes.

## Whole-asset review

### Shared station display — `keep`

- Supported views: front three-quarter, rear three-quarter, matched emissive-off, five-zone
  material ID, hard grazing light, LOD1 at `26.5 m`, and far LOD2.
- G1: the paired dark information bays, split frame, cast end shoes, and rear service trunks read as
  generic core-station traffic infrastructure rather than the donor beam or a memorial.
- G2: screen glass, frame coat, folded backplate, service alloy, and restrained amber markings occupy
  distinct manufactured zones; the dark glass and structural hierarchy survive emission-off.
- G4: front/back purpose, load path, service access, asymmetry, and LOD silhouette remain legible
  across the supported views. No dominant visible zone is outside review.

### Candle Fleet memorial — `keep`

- Supported views: direct face count, front three-quarter, rear service three-quarter, end load path,
  top, matched emissive-off, five-zone material ID, hard grazing light, LOD1 at `26.5 m`, and far LOD2.
- G1: all 24 physical candle cassettes are individually countable in a `6 x 4` arrangement, carried
  by a maintained lattice over a dark recovered-hull plinth. The object no longer reads as the shared
  billboard.
- G2: recovered hull, maintained frame, recessed candle optics, service alloy, and bronze registry
  rails remain separate and materially plausible; every candle retains a bezel and dark physical
  cavity when emission is disabled.
- G4: the plinth crown, end shoes, rear trunks, repair asymmetry, frame load path, and count survive
  the supported angles and LOD reductions. No dominant inherited zone is omitted.

### Faction-neutral navigation buoy — `keep`

- Supported views: full three-quarter, service side, top/head, four-azimuth head contact sheet,
  stabilizer close, matched emissive-off, five-zone material ID, hard grazing light, LOD1 at exactly
  `27.2 m`, and far LOD2.
- G1: the final silhouette clearly separates a broad open inertial-control base, narrow power/service
  spine, and widened four-face navigation head. Both ends remain in frame in the whole-asset and LOD1
  views.
- G2: pressure shell, stabilizer frame, hooded optics, photovoltaic surfaces, and service marking are
  independently visible. The optic apertures retain hood/cavity structure in the emission-off view.
- G4: exact-source inspection rejected the earlier closed stabilizer sleeve because it completely hid
  the authored mechanics. The final open cruciform yoke and four-strut cage exposes the orthogonal
  reaction-wheel, gimbal, and damper assembly while preserving the bottom boss, cardinal extrema,
  upper collar, envelope, collision helper, socket, and head. LOD2 retains the cage/spine/head rhythm.

## Rerender identity note

Before the final correction build, the 17 accepted billboard and memorial PNG identities were
snapshotted. Blender regenerated those files with different SHA-256 values, including many files with
unchanged byte counts, so this review does not claim byte-identical PNG output. Because the prior
hash binding no longer described the final files, all 17 current billboard/memorial images were opened
again at original resolution and received the `keep` dispositions above. Their geometry, cameras,
triangle counts, envelopes, and visible-zone results remained unchanged.

## Gate boundary

This is candidate-side exact-source visual evidence for G1, G2, G4, and matched emissive behavior.
It does not claim live runtime wiring, Browser/Electron route acceptance, representative performance,
promotion, or independent G7 qualification. Those decisions belong to the integration/acceptance lane.
