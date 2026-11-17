# ROCK-04 — Dark Swarm rocks still vanish into space; `mergeGeometries() failed` console errors

Evidence: `.devshots/fleet/runs/ACCEPT-07-later-content.hydrogen.*/RECEIPT.md` and crops in `.devshots/fleet/accept07/crops/`
(`live-swarm-dark-r10-open.png`, `live-swarm-dark-r10-late.png`).

1. **Dark rocks.** After ROCK-03 (`1f008113d6`: pigment floor + dim cool limb in `src/render/rockTriplanar.js`
   `ROCK_TRIPLANAR_FAMILIES`), charcoal/slag rocks in Swarm round 10 are still near-black against `#020307` space. Raise
   separation without making them grey: (a) increase the dark families' `rim` (cool limb emission) roughly 2–3× — it should
   read as a thin cool edge at chase zoom, not a glow; (b) raise their `floor` a little; (c) check whether the limb term is
   actually reaching these rocks (are the round-10 rocks on the triplanar family or a procedural stand-in? log the material
   on the specific rock in the crop). Verify with a frozen Swarm frame (look-bench) — the rock silhouette must be readable
   against black and against the nebula; slag veins stay the hot accent.
2. **`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index 1. Make sure all geometries have the same
   number of attributes.`** logs 6–13 times per Swarm run. Find the caller(s) (grep `mergeGeometries` in `src/render/**`), find
   which geometries mismatch (one has uv/color/tangent and the other doesn't), and fix by normalising attributes before the
   merge (add the missing attribute or drop extras) so the merge succeeds — or skip the merge cleanly with no error if it
   must not merge. A failed merge usually means a fallback (more draw calls or a missing mesh); report what was falling
   back. Test with geometries mismatched the same way.
Exact-path commits (`own-commit.sh` where files have others' edits); tests before/after for touched files.
