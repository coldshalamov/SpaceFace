# ROCK-02 — Every Swarm rock asks for its authored body (fracture pieces + the big arena rocks)

Evidence: `.devshots/fleet/runs/INV-16-big-rocks-never-admit.grok.*/RECEIPT.md`. All 24 `place_rock_*` GLBs exist and load; only
rocks that carry a matching `placeId` + `placeTargetRadius` + `authoredGeologySkin` are admitted.

1. **Fracture pieces.** `environmentMaterials._fracture` (`src/systems/environmentMaterials.js` ~262–313) copies the parent's
   data (`{ ...d }`) and sets the child radius, but keeps the parent's `placeId` (`place_rock_*_pebble`) and
   `placeTargetRadius` (9) — so `presentationAdmission.js:42`'s equality fails and the pieces stay procedural. Set the child's
   `placeTargetRadius = childRadius` and `placeId = authoredRockPlaceId(substance, childRadius)` (the same helper the spawner
   uses), so each piece admits as the size class it actually is.
2. **The big on-glass rocks.** In a Swarm round-3 fight, nine monoliths (r 24.6–46, 163–345 u from the player) have no
   `placeId` and no `authoredGeologySkin` — they come from a spawn path other than `_spawnDebrisRock`
   (`src/systems/swarmArena.js` ~1954–1974). Find that path (arena terrain / opening court / bank recipe / mutator) and give
   those rocks the same authored geology stamp (`placeId` from `authoredRockPlaceId(substance, radius)`, `placeTargetRadius`,
   `authoredGeologySkin`) so they admit through the same queue. Keep their masses/colliders as they are (ROCK-01 bands
   apply only to pebble/boulder debris).
3. Tests (node): a fractured pebble's pieces carry a `placeId`/`placeTargetRadius` matching their own radius; every rock
   the Swarm arena fields in rounds 1–5 has a `placeId` that resolves to a manifest id. `npm run check:sim` green.
Exact-path commits; tests before/after for touched files.
