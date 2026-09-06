# Station information billboard V3 — material-truth preflight

**Status: candidate only.** This record preserves the V3 source and its receipts for controller
review. It does not promote `place_station_billboard`, close G1/G2/G4, or claim Browser/Electron
broker acceptance or performance evidence.

## Identity and provenance

| Field | Record |
|---|---|
| Packet / unit | `PQ-022` / `next10.station-billboard-readable-v3` |
| Runtime identity | `place_station_billboard` / `SF_PLACE_HELIOS_SUPPORT_DOCK_ARM` |
| Root / socket | `SF_M4_HELIOS_DOCK_ARM_ROOT` / `SOCKET_Structure_Core` |
| Source GLB | `assets/ships/parts/places/place_station_billboard.glb` — SHA-256 `9245e7275b36ebed9e7e853a14f1e0315d85d23c14323b6d947ea4cb3a1f2ff6`, 1,314,736 bytes |
| Release GLB | `assets/ships/release/parts/places/place_station_billboard.glb` — SHA-256 `f94ce276f99defb0aa770dd9cc0accd24e828d9b56ecb27d5ea0b3383699a293`, 430,692 bytes |
| Authoring source | `blender/source/material_truth_v3/place_station_billboard_readable_v3.blend` — SHA-256 `03c99e6423e2e14fa3b4f89adf33c83b74603bbc9217b3b21e0e53cb4d7e07ea`, 360,845 bytes |
| Builder | `tools/blender/build_station_billboard_readable_v3.py`; the copied build receipt was produced by the prior builder hash `6f0ff5c2357c00d1c096bdf9cebb2122924ddcb01db3e2efeb488191d3854090` (44,962 bytes). The current source adds honest missing-baseline reporting; it has not been rerun in this records task. |
| Source comparison | The build receipt binds preserved pre-runtime V2 copies (`ccdd548c...`, `1a780be...`). The builder now reports comparison unavailable when those copies are absent and never treats the live V3 path as V2. |

The V3 form is a two-face, back-to-back station information gantry under the retained root and
socket identity. The exported bounds are 14.2200 x 5.7500 x 7.6203 m overall, with LOD0/LOD1/LOD2
render triangle counts of 6,832 / 2,864 / 780 and five semantic draw groups per LOD. The build
receipt records a non-mesh collision helper with 0 collision triangles and a 0.92 minimum per-axis
coverage ratio.

The retained authoring source is the exact Blender file emitted by the V3 builder. The build receipt
is copied unchanged as a historical export receipt; its `generator` hash describes the builder that
actually produced the GLB. The current builder source is recorded separately in the validation
binding so changing the reporting fallback cannot be mistaken for a rebuild.

## Material and construction bill

The builder emits one material family per visible role. Values below are the V3 source tuning values
recorded in the build receipt; all textures are embedded in the GLB/package (`uri: null`). The
ignored `.devshots/next10-billboard-candidate/textures/` files remain build-local regeneration
inputs and are not treated as canonical shipped evidence or copied into this record.

| Visible zone | Construction read | Base colour (linear) | Metallic | Roughness | Emission |
|---|---|---:|---:|---:|---|
| `Display_Frame_Coat` | formed frame rails and cast end shoes | `0.300, 0.345, 0.365` | 0.04 | 0.42 | none |
| `Display_Screen_Glass` | recessed segmented information glass | `0.055, 0.075, 0.090` | 0.02 | 0.16 | cool blue, strength 2.80 |
| `Display_Service_Alloy` | machined service trunks, saddle, and access hardware | `0.440, 0.475, 0.490` | 0.88 | 0.33 | none |
| `Display_Backplate` | folded dark rear backplate | `0.055, 0.065, 0.072` | 0.24 | 0.70 | none |
| `Display_Safety_Marking` | finite amber status/service marks | `0.800, 0.330, 0.030` | 0.01 | 0.46 | amber, strength 2.40 |

The visible construction zones are the paired recessed bays, upper visor and frame rails, central
service bridge, cast end shoes, folded rear backplate, service trunks, finite status cells, and the
structure-core saddle. The ordinary reviewed still shows the chevron and separated flanking readout
strokes as physical authored geometry; it does not establish every zone across every supported view.

## Retained runtime evidence

The controller independently reviewed the following original-resolution headed Browser still and
kept the candidate for further acceptance work:

- Still: `runtime/browser/01-core-station-billboard-ordinary.png`, 471,358 bytes, SHA-256
  `699fe1773733e14b77ff26459cfa3ff83b6dd276fb02947106118dc83b944946`.
- Raw route report: `runtime/browser/report.json`, 6,944 bytes, SHA-256
  `8d20d6600b88fd67b8850e422f10713af08ce2e59fd679a799ac8429895cbe31`.
- Route: fixed seed 47, Browser Chromium headed, 1,440 x 900, shipping chase camera, requested
  LOD1 at distance 144, game-render canvas with HUD excluded.
- Observed result: the central chevron and separated readout lines remain legible, dark spaces
  survive bloom, the perimeter/frame remains visible, and the earlier solid white readout-panel
  glare is absent in this view.

The copied raw report is diagnostic: its broker record says `diagnostic: true`,
`primaryAcceptance: false`, and `noPerformanceEvidence: true`. It also contains the buoy comparison
row because the source capture was a two-subject dossier; this V3 preflight uses only the station
billboard entry as visual evidence.

An additional CPU-only source review opened the durable `.blend` without saving it and retained five
diagnostic views under `renders/`. The review used Blender 5.1.2 Cycles on CPU with four threads,
32 samples, and LOD0 at 1,024 x 768:

| View | Evidence purpose |
|---|---|
| `renders/01-front-oblique.png` | paired bays, chevron, perimeter frame, canted face read |
| `renders/02-rear-service.png` | end-on A-frame, ridge, shoes, and service/load-path read |
| `renders/03-neutral-clay.png` | silhouette, physical openings, recesses, and primitive-stack check |
| `renders/04-hard-grazing.png` | edge highlights, broad-plate flatness, and surface break check |
| `renders/05-emission-off.png` | authored material separation with all emitter strength disabled |

The complete image hashes, camera positions, render settings, and source-write assertions are in
`renders/review_report.json`. These are source-side diagnostics for the parent controller; they do
not promote the asset or replace the headed Browser/Electron route.

`allSupportedViewZonesClassified` is **false**. The CPU review now covers clay, hard-grazing,
emissive-off, front, and end-on service views, but no material-ID, ORM-isolation, normal-isolation,
or far-LOD set was retained. The technique ledger records direct-to-game/no-bake rows as
`not_applicable` where the technique does not apply, records source-established mesh/material/export
facts as implemented, and leaves the remaining evidence-dependent rows blocked.

## Gate disposition

| Gate | Current record |
|---|---|
| G0 identity / export metadata | Evidence recorded; candidate only |
| G1 form and construction | Controller KEEP diagnostic plus CPU clay/grazing views; full supported-view evidence remains open |
| G2 material truth | Controller KEEP diagnostic plus CPU emission-off separation view; channel-isolation evidence remains open |
| G3 export / release | Source, release, package, LOD, socket, axes, and collision receipts are hash-bound |
| G4 runtime presentation | Browser diagnostic only; Browser/Electron broker acceptance remains open |
| G5 performance | Open; no performance evidence in the copied report |
| G6 integration / promotion | Open; runtime package is a candidate write set, not a promotion decision |
| G7 independent review | Controller KEEP diagnostic recorded in `VISUAL_REVIEW.md`; final gate review remains open |

The matching technique ledger is
`TECHNIQUE_LEDGER.json`. The hash-bound route/package record is `validation_binding.json`.
The no-render source command for a future build is:

```text
blender --background --python tools/blender/build_station_billboard_readable_v3.py -- --no-render
```

If the preserved `before-runtime` copies are missing when that command runs, the builder now writes
an explicit unavailable comparison record; it does not label the current live GLB as V2.
