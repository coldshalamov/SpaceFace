# CLAIM — stunt-projectile-evidence-quiet-iter

Quiet `registry.step` → `sampleProjectileEvidence` residual after #36+#35:
surfaceHistory still walked `state.entities.values()` every tick and aged four
bags via `Object.entries` (fresh array allocs even when empty).

Production now:
1. Walks the entity-index `collidables` lane when ready (same `collides` gate).
2. Ages shots/contacts/surfaceHistory/surfaceTorques with `for…in` (no entries alloc).
3. Cadences surfaceHistory sampling on even ticks only while shots, contacts,
   and surfaceHistory are all empty (cold). Once a plate is tracked, frames
   keep warming every tick.

Scratch: `vm-work/hillclimb-20260924h`
Profile cite: `settled-45s-stacked-20260924ac`; `sampleProjectileEvidence` under
`registry.step` (~56 self samples).
