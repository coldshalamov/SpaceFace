# Cycle 36 — Massline common-envelope and abeam hierarchy correction

Scope: `PQ-049.01` source candidate only. No release, manifest, runtime-map, traffic, Lark, or
player-route mutation.

## Exact candidate

| Export | SHA-256 | Triangles | Draws |
|---|---|---:|---:|
| `source/wholeships/massline_express_liner_v1_lod0.glb` | `AAF714ABF24EF5F7B92AE47818C9CEF2C0512065F405AE9A4BFF0E2D43E1AFEB` | 54,619 | 9 |
| `source/wholeships/massline_express_liner_v1_lod1.glb` | `7FBB3B272962C17D07396CBB90A7594C111CD621431B7955F4AD796A0780158E` | 49,255 | 9 |
| `source/wholeships/massline_express_liner_v1_lod2.glb` | `B201060C52819F9F0B2A9416A8FE4915E41D19D2263BFE32EF76E221D141CA50` | 25,894 | 8 |
| `blender/massline_express_liner_v1.blend` | `A7AB8524935C312F8550ED70DF99593CBDD3C6D74FA87EF69296B2B9A88FAC36` | — | — |

Producer: `scripts/build_massline_express_liner_v1.py`, SHA-256
`AFBE1558FEAAD95ABD9DC421A23D636B3884C1E2A9B415F32B07E428BFF5CC94`, Blender 5.1.2.

## Defect-driven source change

- Exposed aft prongs: a tapered four-station common pressure/load shroud now surrounds both internal
  ±4.55 m drive centerlines from x=-12.50 m through x=-19.72 m. It stays unified until the two
  functional throat openings. The aft end is open and its reinforcing bands are hollow, preserving
  dry liners, hubs, and rooted stators without a pale end-cap disk.
- Crossbar/cross-arrow abeam read: passenger half-width drops from 9.65 m to 8.80 m, while the axial
  crown grows from x=14.35 m to x=-9.45 m. The occupied gallery wells remain, but the longitudinal
  civic pressure vessel dominates all legal and authored-band abeam views.
- Material-record drift: every LOD record uses the actual unsuffixed glTF semantic names. The exported
  `MAT_SF_Massline_Glazing_SmokedSafety` KHR transmission factor is 0.30 for LOD0, LOD1, and LOD2.
- Preserved contracts: Cycle 35 blue-grey recessed glazing, internal drive centerlines, dry bores,
  socket set, collision helper, and legal LOD evidence bands remain intact.

## Evidence and decision

LOD0: `cycles/cycle_36/`; LOD1: `cycles/cycle_36/lod1/`; LOD2: `cycles/cycle_36/lod2/`.
Every folder includes exact-source identity, legal default/abeam/close frames, clay, grazing,
drive-rear, material-ID, ORM, and normal diagnostics. LOD1/2 additionally include authored-band and
matched transition frames.

The implementing worker inspected the final original 1600×900 matched frames and records `KEEP` for
controller review. Residual visual risk is limited to two small dark throat-tip marks at close chase,
the intentionally stepped passenger station, and macro-only detail at the very small LOD2 abeam band.
This is not self-acceptance: whole-asset G1/G2/G4, independent review, runtime evidence, and G7 remain
open. The candidate is not released, promoted, or wired into the live game.
