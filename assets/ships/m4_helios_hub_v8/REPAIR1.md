# REPAIR1 complete (bounded hub/gate only)

**Promote:** false  
**Acceptance claim:** false  

## Candidates (post-repair)

| Asset | Source | Release candidate |
|---|---|---|
| hub | source/places/helios_hub_station.glb (~14.5 MB) | release_candidates/places/helios_hub_station.glb (~11.6 MB, meshopt+ktx2) |
| gate | source/places/helios_gate.glb (~9.8 MB) | release_candidates/places/helios_gate.glb (~8.9 MB, meshopt+ktx2) |
| rocks A/B/C | unchanged from foundation pass | unchanged |

## Evidence regenerated

### Blender (hub+gate)
- `evidence/renders/{id}/` — gamesky_close, gameplay, readability_120px, under45px, LOD continuity, neutral close
- Mirrored into `evidence/devshots/` where writable

### Three.js runtime (hub+gate)
- `evidence/three_repair1/renders/*_three_*.png` — 14/14 ok (fresh path; prior renders/ locked by OS)
- Receipt: `evidence/three_repair1/receipt.json` / `runtime_loader_receipt_repair1.json`

## Kestrel V4 judgment (honest)

- **Hub:** Improved vs pre-repair (denser donor, multi-volume hangar, brighter materials under game-sky, stepped core). Still reads as **ring + stacked core + box modules**, not continuous Destiny/Kestrel-tier industrial hull. **Below Kestrel V4 craft bar.**
- **Gate:** Aperture clearer; structure now readable under game-sky (ivory/graphite separation); emissives reduced to accents. Still **rectilinear slab stack** around ring, not continuous hard-surface frame craft. **Improved, not Kestrel V4.**
- **Rocks:** Left as foundation pass (not part of this repair reject).

## Residual defects
1. Hub silhouette remains ring+core+modules (primitive family language residual)
2. Gate still box-built structural masses around coils
3. OS file locks prevented overwriting some primary evidence paths; three shots live under `evidence/three_repair1/`
4. Not promoted; independent review required

## Locks
Authoring lock released. Live parts/release untouched.
