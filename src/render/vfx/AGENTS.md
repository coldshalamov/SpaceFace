# src/render/vfx/

Cue recipes beside `vfx.js`. `vfx.js` is the pool. This folder is the named picture and the world-cue admit.

- Do not write `entity.data`. `snapshotEntity` hashes that object, so a glint or rupture latch there changes the replay and the wreck save. Use `state.presentation` or `state.render`.
- `effectsCause` and `worldCueRecipes` do not apply impulses.
- `Math.random` is allowed in cosmetic spawns inside `vfx.js`, not in these pure recipes.
- A recipe that needs a latch across save must emit a bus fact the sim already owns.
- No second particle pool. Ask `vfx.js` or `forceLanguage/` for a slot.
- `runtime/` owns the shared closed-volume event carrier and its branch-light shader
  (`eventGeometry.js`, `eventMaterial.glsl.js`) plus the pure deployed-field picture compiler
  (`forceRecipe.js`). `ExplosionRupture`, the transient sprite buckets and `SweptSurfaceBatch` consume
  these; keep the geometry closed and substantial, the contours designed (no hash-noise final art),
  and the per-event triangle/parcel budget bounded. Focused proof: `test/vfx-modern-runtime.test.mjs`.
