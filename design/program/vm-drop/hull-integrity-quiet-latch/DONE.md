# DONE — hull-integrity-quiet-latch (#164)

## Summary

The HUD calls `updateShipCondition(schematic, p, frameDt, …)` every presented
frame. After `stepIntegrity`, it ran the full DOM compare pass every time:
about 60 `getAttribute` / `textContent` reads covering 16 laminae, 16 losses,
envelopes, echoes, impact, repair, digits, and two ARIA meters. It did this
even when nothing had moved. In quiet flight the ship is at full hull and shield
(live check: 0 of 300 frames changed any input), so every compare was equal and
wrote nothing.

The DOM pass reads 17 values plus the hull shape:

- model: `hull`, `hullTrail`, `shield`, `shieldTrail`, `hImpact`, `repair`,
  `hullState`, `shieldState`, `motion`, `flashes`, `hullAvailable`,
  `shieldAvailable`, `hMax`, `sMax`, `defId`
- raw `entity.hull` and `entity.shield` (the ARIA valuenow/valuetext use raw)

Production now stores these at the end of each full pass. The next call skips
the pass when all of them are identical (`===`, or `Object.is` for maxima and
raw values) and the retained shape matches. The instrument owns its subtree
exclusively: hud.js mounts it once and only ever calls `updateShipCondition`.
So an equal signature means an equal DOM.

Bench toggle: `setHullIntegrityQuietLatchForBench(bool)`, production default ON.

## Before / after (in-page, Electron, bare master `97c88f92b` + patch)

Probe: `artifacts/probe-164-hud-bench.mjs`, a copy of
`scripts/probe-main-thread-profile.mjs` with a bench `page.evaluate`. It uses
seed 47 and 12 s of held-thrust flight. It builds a second real `.sf-integrity`
instrument in the live HUD bar (real DOM and CSS) using the live player's
values. Warm-up is 6 rounds × 4 cases × 4000 calls. The measurement is
11 alternating ON/OFF rounds of 4000 quiet calls, followed by 600+600
alternating single calls, one per rAF (the production cadence, cold caches).
Each of the 5 runs is a separate Electron launch.

| capture | run medians OFF → ON (µs/call) | median speedup | floor |
|---|---|---:|---:|
| tight quiet, JIT-warmed (5×11) | 4.70/4.95/4.77/6.10/4.65 → 0.225 (all) | **21.2×** (20.7–27.1 per run) | **11.4×** (worst pair) |
| per-frame cadence (5×600 frames) | 62.7/61.2/64.2/59.7/61.7 → 6.2/5.5/7.5/6.8/4.7 | **10.1×** | **8.6×** (worst run) |
| live-change path (hull changes every call → full pass) | 10.0–11.5 both | 1.00–1.06× (no regression) | — |

Live profile cross-check (`artifacts/live-profile-inclusive.txt`):
`updateShipCondition` inclusive time falls from 0.83 ms/s (bare master 45 s
settled profile) to 0.02–0.18 ms/s in the five patched bench-run profiles.

## Dirty-wake / risks

Any change to the values above runs the full pass on that same frame: damage,
repair ticks, recharge, trail decay, impact flash decay, a motion or flash
preference toggle, a hull swap, a capacity change, telemetry loss, or player
disappearance. The latch cannot go stale unless something outside the
instrument writes into its subtree. Nothing does today, and the DONE note above
records that ownership assumption.

## Tests

- `test/hull-integrity.test.mjs` has two new tests: "quiet latch: a settled
  instrument reads no DOM at all across 10,000 frames", and "quiet latch is
  picture-identical to the full compare pass on every frame of a mixed run"
  (6000 random frames of damage, repair, recharge, hull swap, shield capacity
  toggle, NaN telemetry, null entity, dt 0 / 1/60 / 0.5, and reduce-motion /
  flash toggles).
- Focused suites, am-verified on bare master + patch: every test file that
  imports hullIntegrity / flightInstruments / presentationRunner / ui/hud.js,
  plus perf-counters (45 files). Result: **455/459**. The 4 failures fail
  identically on untouched master (452/456) and are pre-existing:
  - `loop-orchestration-perf` (2)
  - `m1-player-tell-hud` off-screen glyph (1)
  - `performance-lifecycle-manifests` paired digests (1)
- hull-integrity + perf-counters + hud-flight-attention + presentation-runner:
  **121/121**.
