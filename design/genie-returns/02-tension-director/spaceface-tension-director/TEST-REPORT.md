# Test report

## Executed here

Environment: Node.js **v22.16.0**, Linux x64. Runtime code is dependency-free ES modules. Tests that
isolate the real campaign source use Node's `--experimental-vm-modules` flag; it is a fixture-only
requirement. The complete output is in `evidence/test-console.log`.

**59 tests passed; 0 failed, skipped or cancelled** in the final behavioral run.

| Area | Behavior exercised |
| --- | --- |
| Controller | Protected opening, observed versus fictional peaks, immediate distress override, recovery hysteresis, sustained-load fatigue, chapter/motif variation, no passive power growth, target/rate/slew bounds |
| Time and storage | 60 Hz/1 Hz parity, repeated-time and modal-flapping protection, large jumps, explicit rewinds, bounded 30-minute histogram and ten-hour trace/dedupe soak |
| Facts and persistence | Player attribution, applied-zero damage, spam saturation, duplicate/empty receipts, immutable inspection, exact JSON continuation, corrupt/sparse snapshots and invalid fields |
| Adapter and lifecycle | Dock/tutorial/survival/disabled guards, fractional-tick undock grace, save boundaries/errors, legacy reset, teardown/reinit, independent worlds, zero shared RNG draws, no cross-owner writes |
| Actual campaign consumer | Original quotas, live caps, cooldowns, pressure gates, admission path, bounded accrual, contextual candidate selection, major reservation, tactical respite propagation, old rhythm fallback |
| Installer | Dry run, all-file preflight, exact context patches, three manifest arrays, idempotence, Windows CRLF handling, unrelated-edit preservation, rollback, concurrent-edit refusal, symlink refusal |
| Integrated focused fixture | Fixed-input policy/world trace equality across midpoint owner save/restore; active legacy A/B arm |

The original packet's `encounterDirector.js` is evaluated with Node VM modules. The tested gate,
selection, accrual and rhythm functions are **the actual delivered source**, not rewritten copies.
Unrelated catalogs/helpers are isolated; world planning, spawn materialization, combat, repairs
and actors are explicit fixture doubles. This is stronger than a disconnected controller-only
test and narrower than a full production-world test.

## Ten-hour experiment

Commands executed:

```sh
npm test
node --experimental-vm-modules fixture/run.mjs --hours 10 --repeat --out evidence/ten-hour
node tools/benchmark.mjs
node tools/render-report.mjs
npm run verify
```

Six directed sessions × ten hours; six original-rhythm A/B arms × ten hours; six repeated directed
sessions with a midpoint controller snapshot/restore × ten hours: **180 simulated fixture-hours**.
All six repeat/checkpoint pairs matched both the complete policy/world-state stream hash and the
recorded receipts/timeline hash. Full traces and hashes are in `evidence/ten-hour/`.

| Archetype | Seed | Directed combat starts | Legacy combat starts | Directed phase changes | Starvation notices | Largest sampled snapshot |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hunter | 4242 | 119 | 157 | 551 | 14 | 66,211 bytes |
| Hunter | 8008 | 119 | 159 | 550 | 16 | 66,222 bytes |
| Prospector | 4242 | 108 | 124 | 490 | 14 | 71,675 bytes |
| Prospector | 8008 | 108 | 124 | 487 | 12 | 71,615 bytes |
| Improviser | 4242 | 140 | 146 | 493 | 19 | 68,790 bytes |
| Improviser | 8008 | 141 | 146 | 496 | 14 | 68,456 bytes |

These values show the controller changes the cadence, keeps release/recovery windows, differentiates
archetype histories and emits honest supply/delivery diagnostics under the fixture conditions.
**A lower combat count is not, by itself, a quality improvement.** Synthetic opponents, damage and
repairs make this an integration/correctness experiment, not a claim about real player enjoyment,
real deaths avoided, or actual ten-hour production-pilot performance.

`maxSnapshotBytes` samples serialized owner state every 600 simulation seconds. The largest sample
was **71,675 bytes (about 70.0 KiB)**. This is not an exhaustive byte maximum over every instant,
heap usage, total game memory, or proof of zero allocations. The data-structure capacities are
separately asserted by tests.

## CPU microbenchmark

The development benchmark drives the maximum bounded sensor path: 16 encounter rosters × 16
far actors, plus 64 pending candidates. It warms 2,000 decisions, measures 10,000 more, and runs
59 extra fixed-tick guards between decisions. No renderer or full campaign consumer is included.

| Path | Median | p95 | p99 | Maximum sample |
| --- | ---: | ---: | ---: | ---: |
| One-second decision, sensors + controller | 6.853 µs | 10.396 µs | 44.720 µs | 8331.050 µs |
| Extra fixed-tick guard, averaged per call | 0.023 µs | 0.074 µs | 0.169 µs | 32.410 µs |

These are measurements in this container, not on the target gaming PC. The sub-microsecond guard
figures are batched averages and sensitive to timing/JIT effects. The final run shared the container with the long-session fixture. These wall-duration
samples include scheduling/GC noise, which is especially visible in the maximum sample; they are
not exclusive CPU-time measurements. Raw environment and exclusions are in `evidence/microbenchmark.json`.
They support a small computational footprint here; they do not certify a frame-time or FPS target.

## Artifact validation

The static session report was rendered in Chromium from its generated HTML content at 1440×1150
and 390×844 viewports. Six charts rendered, no page errors occurred, and neither viewport had
page-level horizontal overflow. This was report-layout validation, **not game browser playtesting**.
The result is recorded in `evidence/report-layout-check.json`.

`npm run verify` checks each delivery hash, parses all JS/MJS files, confirms the two context patches
reproduce the complete integration files, rejects forbidden wall-time/RNG/render calls in the four
new runtime modules, verifies all 12 stored receipt files, and checks that the six checkpoint
repeat results are explicitly recorded. SHA-256 verifies bytes and internal consistency; the
manifest is not an externally signed attestation.

## Not executed or not claimed

The full game was not cloned, built or played here. Its production AI, physics, spawning scripts,
rendering, target-PC performance and real hunter/prospector/improviser policy implementations were
not run. No GitHub commit or PR was created. The uploaded snapshots—not an unverifiable advertised
commit—define this patch baseline.

The host's current save envelope and separate Node-only lookup were not supplied and are not
silently changed. Their required wiring is explicit in `INTEGRATION-NOTES.md`. The component's
snapshot continuity is proven within the fixture; the entire game's save/restore determinism is
not certified by that result.

The production session-shape bars, meaningful decisions per hour, closed economic/causal chains,
content-supply exhaustion, long existing harassment loops, fairness and player-rated fun require
local acceptance under `docs/ACCEPTANCE.md`. This module diagnoses missing delivery; it does not
claim to repair every world system responsible for it.
