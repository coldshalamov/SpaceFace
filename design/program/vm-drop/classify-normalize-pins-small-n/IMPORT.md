# IMPORT — classify-normalize-pins-small-n

1. Apply `patches/0001-perf-activity-small-n-fast-path-for-normalizePinReaso.patch`
   on master tip `abcccfd87` (or current master after fetch).
2. Confirm `normalizePinReasons` returns early for `n <= 2` and still
   dedupes+sorts for `n >= 3`.
3. Run: `node --test test/activity-classification.test.mjs test/activity-runtime.test.mjs`
4. Optional: `node design/program/vm-drop/classify-normalize-pins-small-n/artifacts/classify-normalize-pins-small-n-microbench.mjs`

Scratch: `vm-work/hillclimb-20260924h` @ `e1b3f26a3`.
