# CLAIM — trail-emit-idle-drive-walk

Quiet Grok Bot VM hillclimb package **#108**.

Pole: prepareFrame / vfx trail emit residual after #107
(`_emitTrails` walked all shipLike candidates through `_engineDriveFor`
every emit tick even when every drive was below the idle band).

Quiet latch after first empty emit; dirty wake on cheap
throttle/speed/actuator/input proxy (+ `entityIndexVersion`). Empty
`_updateRibbonTrails` shares the latch when the ribbon map is empty.
Portable quiet path **~7×** median (floor minSpeedup ≥4.0× across package
runs; typical pair floor ≥6.0×). Soft-GPU fps not a KPI. Picture ON.
