# DONE — dynres-target-pool

## Summary

Backlog **#89** patch series is ready to import. Bloom/post targets pre-allocate at
max size; dyn-res scale changes render into viewport sub-rects with correct UV/texel
remapping; `_dynResAllowed` includes **integrated** (floor 0.5 already plumbed).
Default picture unchanged — `dynamicResolution` stays opt-in.

Focused tests: `npm run check:dynres-target-pool` → **4/4 pass**.

## Before / after realloc proof (soft-GPU functional)

See `realloc-proof.txt` (label: **soft-GPU / software**; integrated shares the pool):

| Step | allocations | delta |
|---|---|---|
| after init (1280×720 pool) | 3 | — |
| after scale sweep 1→0.85→0.75→0.5→0.34→…→1 | same as init | **0** |
| after real max resize to 1600×900 | higher | >0 (expected) |

## Before / after baseline

| | ok | failed | wallMs | notes |
|---|---|---|---|---|
| before (untouched master `0612d2b9f`) | false | sim-v3, sim | 34644 | see note in baseline-before.md |
| after (scratch with patches) | false | save-schema, sim-compare, sim-v3, sim | 31952 | known soft-GPU noise set (matches prior guard-the-wins); **no new reds from our files** |

## Soft-GPU / fps note

This VM is soft-GPU (SwiftShader/llvmpipe). Zero-realloc is proven here via
`recordPostRenderTargetAllocation` counters. **fps / hitch under live dynRes is
owner-verify** on the Intel/ANGLE machine with `dynamicResolution: true`.

## Evidence

- Patches: `patches/0001` … `0003`
- Focused tests: `test/dynres-target-pool.test.mjs` (4 pass); log in `focused-tests.log`
- npm script: `check:dynres-target-pool`
- Scratch branch kept **local only** (not pushed): `vm-work/dynres-target-pool` @ `32456b70ba03591612f4b5b5fe3095f9ba672b30`

## Risks for the importer

- Presentation must be eyeballed when scale < 1 (content packed at origin; composite
  stretches via `uUvScale`).
- Render-graph route does not yet apply content sub-rects (bloom is the default
  integrated path).
- Picture contract: do not ship with `dynamicResolution` defaulted on.
