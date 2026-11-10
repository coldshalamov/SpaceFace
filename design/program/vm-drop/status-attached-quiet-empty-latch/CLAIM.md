# CLAIM — status-attached-quiet-empty-latch

Quiet Grok Bot VM hillclimb package **#106**.

Pole: prepareFrame / vfx status-attached residual after #105
(`collectStatusAttachedVictims` via `Object.keys(combat.entities)` + Set/Map
housekeeping every quiet presented frame with zero burn/goo victims).

Alloc-free collect (`for...in` + frozen `STATUS_ROW_IDS`) plus quiet latch
after first empty collect+empty cooldown; dirty wake on
`combat.statusNextPendingSeq`. Portable quiet path **~134×** median
(floor ≥126× across rebenches). Soft-GPU fps not a KPI. Picture ON.
