# DONE — assign-flight-frame-ref

## Summary

`assignFlightFrame` attaches `result.telemetry` by reference and stamps `mode` / `driveId` / `family`, instead of `Object.assign` into a retained `_flightFrame`. Removes per-craft-step key copies and clears stale optional telemetry keys (travelDrive / vectoring) that `Object.assign` left behind.

Focused: flightV3 + actuator telemetry + vp220 propulsion + thruster vocabulary + propulsion spawned authority + dead-player flight → **78/78** pass.

## Before / after

### Offline microbench (primary — portable CPU)

800k iterations with player-path post-mutations (autopursuit / autopilot / orbitAssist):

| | Before (`Object.assign`) | After (ref attach) | Speedup |
|---|---:|---:|---:|
| wall | **214.0 ms** | **63.6 ms** | **~3.36×** |

Correctness probe: after travel-on then travel-off telemetry, `Object.assign` leaves `travelDrive` (**lingerAssign: true**); ref attach does not (**lingerRef: false**).

Phase A cite: hitch-hillclimb-fresh-20260923 — `assignFlightFrame` **135 hits** self (above `normalizeCraftInput` / `makeResult` leftovers). Prior hot-scalars miss was only ~1.20× — not shipped.

### Quiet soft-GPU crucible

Not required; primary signal is the offline microbench. GPU tier: **software**. Picture defaults ON (untouched).

## Evidence

- Patch: `patches/0001-perf-flight-attach-telemetry-by-reference-in-assignF.patch`
- Scratch: `vm-work/assign-flight-frame-ref` @ `397d70741076cba87876354a216132026404a405`
- Microbench: `artifacts/assign-flight-frame-ref-microbench.json` + `.mjs`
- Tests: `artifacts/assign-flight-frame-ref-focused-tests.log`
- Measured against master `35e519ebd`

## Apply order

Independent. Complements `flight-propulsion-scratch` (kernel still allocates telemetry; this drops the copy onto `_flightFrame`).

## Risks

- Anything that cached `_flightFrame` object identity across ticks would see a new object each step. Live consumers re-read `entity._flightFrame` each frame (vfx / feel / input / micro-motion).
- Player path still mutates the attached telemetry object for autopilot / orbitAssist after assign — same as before, on the retained frame.
