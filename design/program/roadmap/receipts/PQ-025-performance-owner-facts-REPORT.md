<!-- LIFETIME: EVIDENCE -->
# PQ-025 performance-owner-facts report

```yaml
packet: PQ-025
dispatchUnit: PQ-025.perf-owner-facts
claimBase: 68c65edca2f64fd00b07a55dbc7d078c9cf955e4
initialImplementationCommit: 3accec2dc32b2b67c3561380c6764d922b01ae74
acceptedImplementationCommit: 4df373477a828b03c4e6ac0c5deafd020357124d
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
qualificationLaunched: false
performanceEvidenceClaimed: false
browserElectronEvidenceClaimed: false
mutexReleased: performance-control
```

## Scope and result

This exact pre-qualification unit closes the five read-only owner facts that were absent from the
PQ-025 semantic map. It does not register a validation manifest, launch a calibration or held-out
cell, change gameplay, or claim a live performance result.

1. `perfRuntime` publishes p50 and p99 from an explicit default-off, fixed-capacity full-window
   callback-interval capture. The ordinary 180-sample overlay ring remains diagnostic only.
2. The same monotonic callback intervals produce missed-vsync counts only after the adapter supplies
   a positive calibrated display interval. Timing must be reset before calibration.
3. Tier-1 heap sampling records optional baseline/peak/end JS heap residency.
4. Tier-1 completed-presentation sampling records cross-route baseline/peak/end renderer resources
   plus draw-call and triangle totals, peaks, and final-frame values.
5. The PQ-025 compositor recomputes percentiles and raw threshold counts, joins current particle and
   light counts, and rejects disabled, uncalibrated, overflowed, incomplete, or frame-mismatched
   capture windows.

The full-window capture is capped by a predeclared caller capacity (hard maximum 2,000,000 callback
intervals), records overflow explicitly, and has an owner cleanup method that releases its typed
buffer and calibration state. Ordinary play allocates no qualification buffer.

## Characterization and audit correction

Before implementation, the focused counter suite stayed green on its 29 existing tests and failed
the four new facts exactly: missing raw/p50/p99, cadence, renderer sampling, and heap residency. The
PQ-025 contract suite failed at module import because no performance-owner normalizer existed.

The first pushed candidate, `3accec2d`, exposed the final 180-sample timing ring as raw owner truth.
Review against the already-accepted `PQ-034.candidate-audit` receipt caught that this repeated the
specific rejected `fb44ceb8` design: a final ring cannot represent a 30- or 90-minute attempt. The
accepted correction `4df37347` separates the small overlay ring from a default-off, full-window,
bounded qualification capture. A regression proves 185 chronological intervals remain available
after the 180-sample overlay wraps, and another proves overflow is explicit rather than truncated.

## Focused evidence

- `npm run check:perf-counters` — PASS, 35/35.
- `node --test test/pq025-acceptance-contracts.test.mjs` — PASS, 62/62.
- Frame-loop and related performance-runtime contracts — PASS, 47/47.
- `node scripts/check-program-docs.mjs` — PASS, 0 warnings.
- `node --test test/program-control-tools.test.mjs` — PASS, 9/9.
- `npm run check:baseline` — PASS, 10/10 in 45.224 seconds with 44.776 seconds headroom.
- Post-release `node scripts/program-dispatch.mjs --ready` — `[]`.
- Git candidate and `origin/master` both resolved to
  `4df373477a828b03c4e6ac0c5deafd020357124d` before control-plane closure.

A voluntarily widened `test/bounded-autosave.test.mjs` run reported six canonical-save mismatches
because the current worker fixture omits the already-expected `entropy` block. This unit changes no
save path or fixture, and every performance-runtime test in that combined invocation passed. The
unrelated stale autosave test was preserved and not used to widen this unit into save ownership.

## Residuals and release

`PQ-025.calibration-qualification` remains blocked. Its exact dependency units are
`PQ-019.promote`, `PQ-020.promote`, `PQ-021.promote`, `PQ-022.promote-corridor-assets`,
`PQ-023.promote-corridor-cues`, and `PQ-024.promote`; their human, controller/art, route, and matched
performance blockers remain recorded in the queue. No PQ-025 manifest is registered and no held-out
seed, Browser/Electron claim, GPU window, performance sample, or human verdict was spent.

`performance-control` is released. No Browser/GPU/broker/evidence/human mutex was held by this unit.
