# CLAIM — energy-bolt-quiet-begin-commit

Quiet Grok Bot VM hillclimb package **#102**.

Pole: prepareFrame / WeaponVfxPresenter residual after #101
(`EnergyBoltPool.beginFrame` + `commit` when already empty).

Prior commit-only model held ~1.41× (under bar). Full begin+commit latch
clears ~4.5× median (floor ≥3.82×). Soft-GPU fps not a KPI. Picture ON.
