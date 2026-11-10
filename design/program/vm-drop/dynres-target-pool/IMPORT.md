# IMPORT — dynres-target-pool (PERF backlog #89)

## What it is

A patch series that lands **opt-in dynamic resolution for the integrated GPU tier**
only after a **pre-allocated bloom/post render-target pool** exists, from
`design/perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md` item **#89**:

1. **Target pool** — bloom HDR scene + downsample pyramid allocate once at max
   drawing-buffer size. `setContentScale(s)` changes the active origin-aligned
   viewport/scissor sub-rect; it never calls `setSize` / realloc.
2. **Correct sampling under a sub-rect** — downsample bright-pass and composite
   remap UVs via `uUvScale` / `uUvOffset`; texel offsets stay one allocated pixel
   (equal to one content pixel when packed at the origin).
3. **Integrated enablement** — `_dynResAllowed` becomes
   `software || integrated` (floor 0.5 already plumbed). Drawing buffer no longer
   multiplies `dynResScale` into `pixelRatio`; `_applySize` forwards the multiplier
   to `bloom.setContentScale`. Default picture / quality preset unchanged —
   `settings.video.dynamicResolution` remains opt-in (default false).

## How to apply

From a clean master tip (or a throwaway import branch cut from master):

```bash
git fetch origin
git checkout -B import/dynres-target-pool origin/master
git am design/program/vm-drop/dynres-target-pool/patches/*.patch
npm run check:dynres-target-pool
npm run check:baseline -- --json   # expect no worse than baseline-before.md noise
```

To abort a bad apply: `git am --abort`.

## PERF backlog items claimed

- **#89** Opt-in dynamic resolution after a pre-allocated render-target pool.

Does **not** claim other picture-cost items (#86–#88, #90–#94). Does not invent a
second resolution policy — extends `dynResScale` / `adaptiveQuality` / bloom.

## What still needs owner-GPU verification

- Live fps / hitch with `dynamicResolution: true` on the Intel/ANGLE integrated
  machine (this VM is soft-GPU; zero-realloc is proven here, fps is owner-verify).
- Confirm presentation looks correct when the adaptive controller steps 1.0 → 0.5
  and recovers (no UV fringe / garbage outside the content rect).
- Optional: render-graph path still ignores dyn content scale (graph owns its own
  `renderScale`); bloom is the default integrated route.

## What this does **not** wire

- Does not merge to master (importer decides).
- Does not turn `dynamicResolution` on by default (picture contract: default
  picture stays on; this only *allows* the integrated tier to opt in).
- Does not change bloom strength, shadows, or quality preset defaults.
- Does not push the scratch branch `vm-work/dynres-target-pool`.
