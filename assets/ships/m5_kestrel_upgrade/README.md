# SF-K0 Borrowed Time — isolated M5 upgrade candidate

This lane preserves the strong user-supplied Borrowed Time revamp and repairs the remaining
runtime-facing visual defects without touching the live ship, release tree, manifests, or renderer.

## What changed

- Removed the authored static drive plume; runtime propulsion VFX owns glare and thrust length.
- Preserved a substantive 28 m hull, asymmetric repair/utility story, canopy, gun, mining tool,
  axial drive anatomy, landing gear, rails, decals, and nine gameplay sockets.
- Split paint, decals, glass, lamps, and drive core into explicit semantic materials. Ordinary cyan
  and warm panels no longer inherit emissive output.
- Converted the three planar decal cards into 4 mm chamfered service plates. This preserves the
  authored labels while producing real MikkTSpace tangents instead of accepting fake/constant data.
- Merged static detail per material/role and retained animated/damage roles separately.
- Generated structural LOD0/1/2 geometry and a collision proxy without reducing visible quality.

## Candidate artifacts

- `exports/kestrel_borrowed_time_upgrade.glb` — isolated multi-LOD candidate, not runtime-wired.
- `source/SF_K0_Borrowed_Time_Revamp.blend` — exact user-supplied editable source.
- `source/kestrel_borrowed_time_upgrade.blend` — generated production candidate.
- `scripts/build_kestrel_upgrade.py` — reproducible headless build and contract gate.
- `scripts/render_glb_audit.py` — independent multi-angle and 160 px renderer.
- `scripts/render_game_exposure.py` — identical-camera dark-sky exposure/bloom A/B probe.
- `evidence/candidate/production_metrics.json` — authoritative geometry/material/socket receipt.
- `evidence/heldout/` — independent game/rear/top/side/160 px renders.
- `evidence/exposure/` — current-vs-candidate game-sky images and JSON receipts.

## Status

Isolated candidate only. Promotion requires independent image review, then an exact authoring/live/
release + manifest transaction followed by the repository asset, visual-stability, and performance
checks. The lane deliberately does not weaken any asset loader or boot gate.
