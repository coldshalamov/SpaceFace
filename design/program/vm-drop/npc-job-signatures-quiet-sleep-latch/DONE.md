# DONE — npc-job-signatures-quiet-sleep-latch

## Summary

Quiet settled flight still paid `npcJobs` existence probe + 12-slot sleep clear
every tick with an empty job bag. Production now remembers
`_npcJobSignaturesQuietAsleep` after the first empty sleep and returns until
`npcJobs.revision` bumps (from `_invalidateJobIds` on membership change).
Missing revision refuses the latch. Soft-GPU fps not claimed. Picture contract
ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Empty npcJobs bag relevant+sleep × 400k; before = existence probe + 12-slot
clear every tick; after = latch skip after first empty sleep (revision wake).

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-npc-job-signatures-relevant-sleep-composite (primary, 13 pairs) | **~2.51×** | **≥2.07×** |

Package floor capture (4×13-pair runs @ 400k): medians 2.68 / 2.55 / 2.73 / 2.61;
mins 2.17 / 2.26 / 2.56 / 2.43. Floor across package runs **≥2.07×** (clears ≥1.5×
bar). Dirty-wake proved: latch quiet → revision bump + live job → update resumes
→ re-latch after drain (`ok: true`). Soft-GPU fps not claimed.

Phase A cite: prepareFrame / VFX residual after #118 momentum-sink; supersedes
prior sleep-only hold ~1.56× / floor ~1.40× by including the existence probe in
the latched residual and wiring `npcJobs.revision` dirty wake.

### Focused tests

`node --test test/npc-job-signatures-quiet-sleep-latch.test.mjs
test/npc-job-signature-vfx.test.mjs test/npc-jobs-runtime-wiring.test.mjs
test/npc-jobs-kernel.test.mjs test/inactive-vfx-plan.test.mjs
test/momentum-sink-quiet-empty-latch.test.mjs
test/wreck-wisps-quiet-irrelevant-latch.test.mjs`
→ **81/81** pass (wiring+kernel+latch suite) / latch+signature 25/25 /
expanded latch suite 60/60.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-npc-job-signatures-empt.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
