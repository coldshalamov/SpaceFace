# CLAIM — seam-markers-quiet-hide-latch

Quiet Grok Bot VM hillclimb package **#105**.

Pole: prepareFrame / vfx seam-marker residual after #104
(`_seamMarkersRelevant` + `_sleepSeamMarkers` every quiet tick).

Prior hold: ~4.6× if skip relevant+sleep but **no safe dirty wake**.
This package ships the latch **with** safe dirty wake (player quantum /
`entityIndexVersion` / drawWu / mining pulse / 0.35s re-probe). Portable
quiet path **~3.6×** median (floor ≥2.59× across rebenches). Soft-GPU fps
not a KPI. Picture ON.
