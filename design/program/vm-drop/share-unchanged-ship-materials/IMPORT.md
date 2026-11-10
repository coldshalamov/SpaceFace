# IMPORT — share-unchanged-ship-materials

## What it is

PERF backlog **#6** / PERF_WHAT_MATTERS “fewer program keys / share unchanged ship materials”.

`cloneFlightInstanceMaterials` no longer clones every material per flight-template hit. Unchanged
hull / armor / canopy / secondary materials keep the **template material identity**. Only per-ship
mutables are cloned:

- drive plume (opacity)
- nav light / sensor (emissiveIntensity)
- shield bubble (uFlash / uBase uniforms)
- fitted drive-glow (already clone-on-write)

Owner-local disposal skips `spacefaceSharedAsset` materials so shared template materials are not
freed while other copies still bind them.

## How to apply

```bash
git fetch origin
git checkout -B import/share-unchanged-ship-materials origin/master
git am design/program/vm-drop/share-unchanged-ship-materials/patches/*.patch
node --test test/flight-root-template-cache.test.mjs test/fallback-materials-lazy.test.mjs
```

Clean on bare master **`568d1358e`**.

## Evidence

- Portable census / A/B: unique materials **384 → 196 (~1.96×)** at 48 template copies (textured panels).
- Mutable isolation preserved (plume / nav / sensor / shield distinct across copies).
- Focused tests: **5/5** (`flight-root-template-cache` + `fallback-materials-lazy`).
- Soft-GPU fps not claimed. Node wall of Object3D.clone dominates the microbench (~1.0–1.1×);
  the ship KPI is fewer unique materials / skipped cloneUniforms on later copies of the same hull.

## What this does not wire

- No dummy shader prewarm.
- No picture / bloom / shadow cuts.
- Does not merge to master (importer decides).
