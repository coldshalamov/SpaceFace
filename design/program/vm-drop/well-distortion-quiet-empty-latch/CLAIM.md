# CLAIM — well-distortion-quiet-empty-latch

Quiet Grok Bot VM hillclimb post-#119. Package #120.

Pole: prepareFrame / WeaponVfxPresenter residual after #119.
Cut: quiet-latch `_syncWellDistortion` when `fields.active` is empty.

Different angle from held well-distortion quiet sync empty ~1.47× / floor ~1.18×:
prior probe omitted DistortionField.update's unconditional uTime write (runs before
the live===0 early-out) and the real a11y resolve on the quiet path. This package
latches that fuller residual. Soft-GPU fps not a KPI. Picture contract ON.
