# Baseline before — hitch-shed-floor (soft-GPU)

Master `0612d2b9f`, `npm run probe:smooth-flight:crucible` seed 4242, settle 0, 30 s sample.
GPU: **software** (SwiftShader / soft-GPU). Owner iGPU fps is not claimed.

| Metric | Value |
|---|---|
| hitch callbacks | 232 of 347 (world resumed two ticks on) |
| frames that shed sim | 179 |
| game speed | 40.2 % |
| frame p50/p95/p99 / worst | 83.3 / 116.7 / 333.3 ms; worst 1250 ms |
| typical (ms) | callback 18.9  sim 7.1  present 11.6  render 6.8  vfx 1.2  ui 3.4  feel 0.1  admission 0.8 |
| fps mean | 11.0 (ignore — soft-GPU) |
