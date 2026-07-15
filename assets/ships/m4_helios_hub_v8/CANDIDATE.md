# Helios Hub V8 — Candidate Classification (NEW FOUNDATION)

**Classification:** `CANDIDATE` (isolated, not ACCEPTED, not live-wired)  
**Packet:** `M4-HELIOS-V8-NEW-FOUNDATION-GROK-001`  
**Family identity:** `helios_hub_env_v8`  
**Acceptance claim:** **false** — independent taste-review required; controller decides promotion.

## Foundation (not a V7 repair)

| Asset | Foundation |
|---|---|
| helios_hub_station | Licensed BlenderKit CC0 continuous Sci-Fi Station macro donor + asymmetric hangar/pier/hab/truss/solar/radiator anatomy |
| helios_gate | Structural octagon portal frame, nested field coils/emitters, attached power/cooling, controlled cyan/amber channels |
| helios_rock_a/b/c | Poly Haven boulder_01 / rock_09 (CC0) scan → reshape → multi-pass displace → fracture → voxel remesh → embedded ore (mesa / shard / cluster) |

## Delivered candidates

| Asset | Source GLB | Release candidate | Materials (release) |
|---|---|---|---|
| helios_hub_station | `source/places/helios_hub_station.glb` | `release_candidates/places/helios_hub_station.glb` | Hull/Mech/Accent/Warm/Glass |
| helios_gate | `source/places/helios_gate.glb` | `release_candidates/places/helios_gate.glb` | Hull/Mech/Accent |
| helios_rock_a | `source/places/helios_rock_a.glb` | `release_candidates/places/helios_rock_a.glb` | Rock/Warm |
| helios_rock_b | `source/places/helios_rock_b.glb` | `release_candidates/places/helios_rock_b.glb` | Rock/Warm |
| helios_rock_c | `source/places/helios_rock_c.glb` | `release_candidates/places/helios_rock_c.glb` | Rock/Warm/Mech |

Exact hashes/sizes: `evidence/candidate_manifest.json`, `evidence/finalize_report.json`.

## Evidence (mandatory, no skipped shots)

Per asset (all five):

- Blender neutral close, gamesky close, 120px, under45px, gameplay, LOD continuity lod0/1/2  
  → `evidence/renders/{id}/` and mirrored `evidence/devshots/`
- Three.js game-sky path close/gameplay/mid/far + LOD0/1/2  
  → `evidence/renders/*_three_*.png`, `evidence/devshots/*_three_*.png`
- Family composition  
  → `evidence/renders/family_composition.png`

Receipts: `runtime_loader_receipt.json`, `material_draw_call_report.json`, `SOURCE_ADAPTATION.json`, `self_review.json`.

## Contract

All five candidates: `SOCKET_Structure_Core`, `COLLISION_HULL`, LOD0/1/2 material-merged meshes, `EXT_meshopt_compression`, full KTX2/BasisU images.

## Wiring status

**isolated_candidate_no_promote** — live `parts/` and `release/` not modified.  
No commit, no self-promotion, no acceptance claim.

## Residual defects (not acceptance)

1. Soft residual framing margins on some hero Blender shots (shots written; not empty).
2. Gate release material set lacks standalone `Material_Warm` (warm functional bands may have been absorbed in merge).
3. Nested gate emitter coils remain torus secondaries inside a non-hoop structural frame.
