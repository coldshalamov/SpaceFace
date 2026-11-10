# Cycle 35 — Massline pincer, abeam, glazing, and LOD-band correction

Scope: `PQ-049.01` source candidate only. No release, manifest, runtime-map, traffic, Lark, or
player-route mutation.

## Exact candidate

| Export | SHA-256 | Triangles | Draws |
|---|---|---:|---:|
| `source/wholeships/massline_express_liner_v1_lod0.glb` | `8D0668D2131B7C27ED2612B052F162C2B573F97FA2E7E7709D2FBD054A5F978C` | 53,134 | 9 |
| `source/wholeships/massline_express_liner_v1_lod1.glb` | `995C086C159FD8E9A16BFDFCC3889A05BFC4B110454783D4D9D2E12F2345434A` | 47,770 | 9 |
| `source/wholeships/massline_express_liner_v1_lod2.glb` | `2C36BB6C50AC00C8FC76FFB46DF45517716796414E681D86665CBC081F52E493` | 24,348 | 8 |
| `blender/massline_express_liner_v1.blend` | `E29D9038EC98CB96C24A589D3DCE4F9768A9382ACDBC93AC23E5884A709F5471` | — | — |

Producer: `scripts/build_massline_express_liner_v1.py`, SHA-256
`DF7A77498EF0FD6BDF26AD1C7F90780D778151EAB2A64A3E5EBBD2EEE8FC9158`, Blender 5.1.2.

## Defect-driven source change

- Pincer/prong: drive centerlines move from ±8.55 m to ±4.55 m inside the aft pressure envelope.
  A three-station central afterbody overlaps both case roots and reaches x=-16.55 m, so the plant
  splits only near its two dry bores.
- Cross/arrow: the bow is blunt instead of spear-pointed and the inhabited belt narrows from
  22.45 m to 20.75 m without deleting the six paired passenger-gallery beats.
- Black-card glazing: blue-grey dielectric response, 0.30 transmission, and recessed galvanized
  interior datum plates preserve reflection and visible depth without emission.
- Invalid LOD proof: LOD1 default/abeam frames are 187.4/98.1 px in the 90–220 px band; LOD2 frames
  are 81.4/42.2 px in the ≤90 px band; the matched LOD1/LOD2 far transition is 89.0 px.

## Evidence and decision

LOD0: `cycles/cycle_35/`; LOD1: `cycles/cycle_35/lod1/`; LOD2: `cycles/cycle_35/lod2/`.
Every folder includes exact-source identity, legal default/abeam/close frames, clay, grazing,
drive-rear, material-ID, ORM, and normal diagnostics. LOD1/2 additionally include authored-band and
matched transition frames.

The implementing worker inspected the original 1600×900 frames and records `KEEP` for this
correction. Residual review risk is limited to the two dark throat tips at very small abeam size and
the intentionally broad passenger drum. This is not self-acceptance: whole-asset G1/G2/G4,
independent review, runtime evidence, and G7 remain open.
