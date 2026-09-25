# DONE — share-unchanged-ship-materials

## Summary

Share unchanged flight-template materials across ship copies (PERF backlog #6). Clone only
plume / nav / sensor / shield (and drive-glow) mutables. Hull/armor/canopy/secondary keep the
template identity. Picture contract untouched; no dummy prewarm.

## Before / after

### Portable census (primary KPI)

48 flight-template copies, crowded textured hull (48 panels + mutable roles):

| | Always-clone (legacy) | Share unchanged |
|---|---|---|
| unique materials | 384 | **196** |
| reduction | — | **~1.96×** |
| hull shared across copies | no | **yes** |
| plume / nav / shield distinct | yes | **yes** |

Soft-GPU fps not claimed. Instantiate wall in Node is ~flat (Object3D.clone dominates);
the hitch-relevant win is fewer material identities → less cloneUniforms / program bookkeeping
when the same loadout materializes again.

### Focused tests

`test/flight-root-template-cache.test.mjs` + `test/fallback-materials-lazy.test.mjs` — **5/5 pass**.

## Evidence

- Patch: `patches/0001-perf-render-share-unchanged-flight-template-materials.patch`
- Scratch: `vm-work/share-unchanged-ship-materials-master` @ `889e44f49`
- Bench: `artifacts/share-unchanged-ship-materials-bench.json`
- Tests: `artifacts/focused-tests.log`
- Measured against master `568d1358e`

## Apply order

Independent of membership / emergent packages. Clean on bare master.

## Risks

- Sharing must never cover materials that damage/drive/shield mutate every frame — covered by
  `flightInstanceMaterialNeedsClone` + Kestrel mutable isolation probe.
- Instance disposal must skip `spacefaceSharedAsset` (done); template refcount still owns lifetime.
