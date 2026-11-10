# DONE — event-trace-thrust-sanitize

## Summary

Held-thrust quiet flight pays `sanitizePayload` on every `ship:thrust` bus
record. The sorted `Object.keys` walk dominated that self time (~71 src samples
on `settled-45s-stacked-20260924w`).

Production now takes a **typed fast path** for the flightV3 thrust envelope
(7 keys + 3-key nozzles). JSON key order matches legacy
`Object.keys(...).sort()`; other shapes fall back. Bench-only
`setThrustTraceSanitizeFastForBench(false)` restores always-legacy for A/B.

## Before / after

### Offline microbench (primary — portable CPU)

30k thrust envelopes × median of 7; before = legacy sanitizePayload; after =
sanitizeThrustPayload.

| | Before | After | |
|---|---:|---:|---|
| wall (median) | 27.67 ms | 3.87 ms | **~7.15×** |
| min/max speedup band | — | — | ~3.18×–8.77× |
| JSON mismatches | — | **0** | identical tapes |

Primary: **~7.15×** (median). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924w`
(Picture ON, post-#57): idle **62.4%**, long tasks **17**; `sanitizePayload`
under always-on eventTrace / held-thrust residual after #55–#57.

### Focused tests

`governor-weave` + `vfx-settings-runtime-truth` → **pass**.
`chain-reaction-determinism` red on untouched tip (pre-existing; not caused here).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-core-typed-ship-thrust-event-trace-sanitize.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/event-trace-thrust-sanitize-microbench.json`
- Tests: `artifacts/focused-tests-event-trace-thrust-sanitize.log`

## Apply order

Independent. Prefer after #57. Stacks under registry.step / eventTrace residual.

## Risks

- Fast path requires the exact 7-key thrust envelope and 3-key nozzles; any
  extra field silently falls back to legacy (correct, slower).
- Non-string nozzle `role` goes through legacy sanitize at depth 2.
- Bench toggle must stay default-on in production.
