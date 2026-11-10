# Baseline after — hitch-asteroid-cell-key (soft-GPU)

Scratch `5f84208e3`. Same probes.

| Metric | Value |
|---|---|
| hitch callbacks | 227 of 368 (world resumed two ticks on) |
| game speed | 48.7 % |
| frame p50/p95/p99 / worst | 83.3 / 100.1 / 183.4 ms; worst 1083 ms |
| typical (ms) | callback 18.6  sim 8.0  present 10.5  render 5.7  vfx 1.1  ui 3.5  feel 0.1  admission 0.6 |
| microbench queryAsteroidField (20k × 800 rocks) | **84.0 ms**, keyType=number (~25% faster) |
