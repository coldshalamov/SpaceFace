# DONE — perf-heap-sample-gate (#165)

## Summary

The `presentationRunner` frame boundary read
`perf.tier1?.sampleHeap(globalThis.performance?.memory?.usedJSHeapSize)` on
every frame. `sampleHeap` ignores the value unless Tier-1 counters are enabled,
and they are off in production. The Chromium `performance.memory` getter builds
a MemoryInfo from V8 heap statistics. At one call per frame (cold) it costs
**50.4 / 52.1 / 55.0 / 60.8 / 52.1 µs** across 5 isolated Electron runs of
240 frames each. A tight loop costs ~2.4–2.8 µs because Chromium caches the
value. The bare-master 45 s settled profile shows `get memory` at 0.68 ms/s
(31 ms per 46 s).

Now the read happens only when `tier1.isEnabled()` is true, or when a legacy
tier1 without `isEnabled` is installed.

## Before / after

| capture | before | after |
|---|---:|---:|
| per-frame cadence, 5×240 frames (µs/frame) | median **52.1** (50.4–60.8) | gate only (~0; tight loop 0.000 µs at 0.1 ms timer resolution) |
| live profile `get memory` inclusive | 0.68 ms/s | **0.00 ms/s** in all five patched runs |

This removes a piece of work outright rather than speeding it up, so an
`N×` figure is not meaningful. By construction the ratio for this block is well
above the 1.5× bar. Absolute: about 0.7 ms per second of quiet flight at
soft-GPU frame rates, or about 3 ms/s at 60 fps.

## Risks

None found for gameplay. Tier-1 captures are unchanged because the enabled
path is identical.

## Tests

`test/perf-counters.test.mjs` adds "with Tier-1 counters off the presentation
loop never reads performance.memory". It fails on unpatched master and passes
with the patch; the suite is 38/38. Focused am-verify results are in
`artifacts/focused-tests-am.log`: 455/459, with the same 4 pre-existing
bare-master failures as #164.
