# Baseline before — hitch-asteroid-cell-key (soft-GPU)

Master `0612d2b9f`. Crucible seed 4242 + offline `queryAsteroidField` microbench.

| Metric | Value |
|---|---|
| hitch callbacks | 232 of 347 (world resumed two ticks on) |
| game speed | 40.2 % |
| frame p50/p95/p99 / worst | 83.3 / 116.7 / 333.3 ms; worst 1250 ms |
| typical (ms) | callback 18.9  sim 7.1  present 11.6  render 6.8  vfx 1.2  ui 3.4  feel 0.1  admission 0.8 |
| microbench queryAsteroidField (20k × 800 rocks) | **111.6 ms**, keyType=string |
