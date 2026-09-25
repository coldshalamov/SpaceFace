# CLAIM — snapshot-fence-zero-dirty-retain

Quiet `prepareFrame` → `packFence` residual after #51: layout-stable
`packPresentationWorldToFence` still `copyDenseFrom`'d every column into the
write ring when no `PRESENTATION_DIRTY` bits were set. Track O(1) `dirtyCount`
on `presentationWorld` and retain the sealed latest snapshot when
`dirtyCount === 0` and `latestLayoutVersion` matches.

Scratch: `vm-work/hillclimb-20260924h`
Profile cite: `settled-45s-stacked-20260924ac`; packFence under prepareFrame.
