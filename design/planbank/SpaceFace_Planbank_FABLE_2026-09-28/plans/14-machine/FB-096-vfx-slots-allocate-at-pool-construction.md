# FB-096 — VFX slots allocate their vectors when the pool is built, never on the first dense frame

**Kind:** polish · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: vfx.js
**Write-set:** `src/render/vfx.js`, `test/fb-vfx-slot-prealloc.test.mjs`
**Neighbours (extend, never restate):** SFQ-B214

## The gap
In `src/render/vfx.js` the contact slots lazily create `contactVertex`, `contactPoint` and `contactFrom`
vectors and a colour inside a slot-init branch, so the first dense contact frame pays the allocations the
file's own rule forbids ("first live frame must not allocate these").

## Why this direction
GC tuning was rejected; the design law is no per-frame allocation in hot paths. Hoisting into the pool
constructor beside the vectors that are already pre-allocated is the whole fix.

## Mechanism
- Move the three vectors and the colour into pool construction alongside the existing pre-allocated fields; keep
  the slot-init branch to reset values only.
- Add a test hook that counts vector constructions during a scripted 60-contact burst (stub the constructor in
  the test) and asserts zero after warm-up.

## Done when
`test/fb-vfx-slot-prealloc.test.mjs`: zero vector or colour constructions during a 60-contact frame after pool
construction; existing VFX suites stay green; visual output identical (same slot values).

## Do not
Do not shrink pool sizes. Do not remove any authored contact visual to reduce allocations.

## Focus test starting points
- `test/quarks-vfx-system.test.mjs`
- `test/emergent-vfx-materials.test.mjs`
