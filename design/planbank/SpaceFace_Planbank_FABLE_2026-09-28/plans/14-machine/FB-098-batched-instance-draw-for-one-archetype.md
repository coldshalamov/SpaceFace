# FB-098 — One populous archetype draws through the parity-proven batched instance path

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: batchedInstanceRenderer.js, seam: renderer.js, seam: presentationSnapshot.js
**Write-set:** `src/render/batchedInstanceRenderer.js`, `src/render/renderer.js`, `src/render/presentationSnapshot.js`, `test/fb-batched-instance-one-archetype.test.mjs`
**Neighbours (extend, never restate):** SFQ-B215, NXB-058

## The gap
`createBatchedInstanceRenderer` draws one instanced call per archetype straight off the packed presentation
snapshot, and two check scripts prove parity with the per-entity path. No `src/` file calls it: production
still draws per entity while the snapshot it needs is packed live every frame at the fence.

## Why this direction
A second renderer is forbidden and this is not one: it is a draw path inside the same renderer, fed by the
same snapshot. Switching everything at once was rejected; one archetype (pickups or debris fragments,
whichever has the highest live count in a seed-4242 Ceres fight) proves the route with a measurable draw-call
drop.

## Mechanism
- Select the archetype by counting live entities per type in the seed-4242 Ceres fight; route only that type
  through the batched renderer, leaving the per-entity path for the rest.
- Keep `scripts/check-render-path-parity.mjs` green for the migrated archetype (same pose, same visibility rules
  including `shouldSubmitEntityMesh`).
- Publish draw calls per archetype in the witness so the delta is a number, not an impression.

## Done when
Draw calls for the chosen archetype fall to ≤2 per frame in the seed-4242 Ceres fight (baseline recorded),
parity script green, `probe-frame-solid` longest frame not worse;
`test/fb-batched-instance-one-archetype.test.mjs` pins the snapshot→instance mapping.

## Do not
Do not create a second scene graph or a second GL context. Do not bypass entity mesh visibility gating. Do not
migrate the player hull.

## Focus test starting points
- `test/perf-submit-lod-archetype.test.mjs`
- `test/asset-residency-accounting.test.mjs`
- Run `node scripts/check-batched-instance-renderer.mjs` and `node scripts/check-render-path-parity.mjs`.
