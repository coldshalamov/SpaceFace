# IMPORT — npc-job-signatures-quiet-sleep-latch

## What

Portable CPU cut for quiet NPC job-signature residual under prepareFrame /
renderUpdate after #118. Two stacked pieces:

1. **Quiet empty-bag latch** — after the first empty `npcJobs.byId` observe +
   12-slot sleep clear while `npcJobs.revision` is trustworthy, skip both the
   existence probe and sleep clear until a wake fires.
2. **Dirty wake** — `npcJobs.revision` bump (from `_invalidateJobIds` on
   membership add/remove/clear/restore) clears `_npcJobSignaturesQuietAsleep`
   so the next frame rebuilds. Empty again re-latches after one sleep.
   Missing revision refuses the latch so untrusted bags stay truthful.

Picture unchanged while no job signatures are live. Soft-GPU fps not claimed.
Live emit path is unchanged.

## Live path (later, by owner)

- `src/render/vfx.js` (`_syncNpcJobSignatures`, init flags, boundary clears)
- `src/systems/npcJobsRuntime.js` (`_invalidateJobIds` revision bump, bag init)
- `test/npc-job-signatures-quiet-sleep-latch.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/npc-job-signatures-quiet-sleep-latch/patches/*.patch
```

Stacks under prepareFrame / renderUpdate / npc-job-signature residual. Clean on
stacked tip through #118. Sibling of #106 status-attached / #117 wreck-wisps /
#118 momentum-sink version-wake latches. Supersedes prior sleep-only hold ~1.56×.

## Did not wire

- No master merge from this VM
- Soft-GPU fps not claimed
- Does not change job-signature look, cadence Hz, or Picture contract
