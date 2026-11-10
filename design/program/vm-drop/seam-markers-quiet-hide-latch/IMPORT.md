# IMPORT — seam-markers-quiet-hide-latch

## What

Portable CPU cut for quiet `vfx` seam markers under prepareFrame residual
after #104. After the first quiet `_sleepSeamMarkers`, latch
`_seamMarkersQuietHidden` and skip the full `_seamMarkersRelevant`
asteroid walk + zero-commit until a cheap dirty wake:

- player position quantum (`max(16, drawWu*0.1)`)
- `entityIndexVersion` membership change
- `drawWu` change
- mining seam pulse id/until change
- periodic re-probe every 0.35s simTime (rock-drift safety)

False-wake falls through to full relevant; sleep latch re-arms when still
irrelevant. Picture unchanged while no seams in range. Soft-GPU fps not
claimed.

## Live path (later, by owner)

- `src/render/vfx.js`

## Apply

```bash
git am design/program/vm-drop/seam-markers-quiet-hide-latch/patches/*.patch
```

Stacks under prepareFrame / vfx seam residual. Clean on stacked tip through #104.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
