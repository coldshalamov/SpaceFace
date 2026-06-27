# Phase 0 Authority Audit

Source of truth: `docs/Spec/MASTER_MAKEOVER_PLAN.md`.

This audit separates authoritative simulation sources from presentation, tooling, and telemetry
sources. Phase 0 does not require removing every browser timer or cosmetic random draw; it requires
that replay-relevant gameplay state does not depend on unscoped randomness, wall-clock time, DOM, or
renderer state.

## Math.random Catalogue

Allowed current call sites:

| File | Classification | Rationale |
|---|---|---|
| `src/main.js` | boot seed source | Used only to create an ad hoc seed when no explicit seed is supplied. Once `state.meta.seed` exists, simulation streams must derive from that seed. |
| `src/audio/synth.js` | cosmetic audio | Generates non-authoritative white-noise buffers. |
| `src/audio/audioSystem.js` | cosmetic audio | Varies playback rate/gain timing for presentation only. |
| `src/render/camera.js` | cosmetic camera | Applies shake jitter after authoritative camera target/zoom decisions. |
| `src/render/feel.js` | cosmetic render | Varies warp streak presentation; no gameplay state mutation. |
| `src/render/starfield.js` | cosmetic render | Creates decorative background distribution. |
| `src/render/vfx.js` | cosmetic render | Particle variation; no gameplay state mutation. |
| `src/systems/telemetry.js` | local telemetry | Builds a local session id; not read by simulation. |
| `src/ui/floatingText.js` | cosmetic UI | Adds presentation drift to damage/pickup text. |

Forbidden classes:

- Any `Math.random` under authoritative systems unless it is explicitly in this table and proved cosmetic.
- Any fallback from a named stream to `Math.random`.
- Any test-only duplicate formula used to excuse an authoritative implementation gap.

## Wall-Clock Catalogue

Authoritative sim code must use `dt`, `state.tick`, or `state.simTime`.

Current tolerated wall-clock owners:

| Owner | Classification | Rationale |
|---|---|---|
| `src/core/loop.js` | frame driver | Measures elapsed real time only to feed the fixed-step accumulator. |
| `src/core/perfRuntime.js` | diagnostics | Measures performance budgets and exposes dev diagnostics. |
| `src/core/physics.js` / `src/systems/flight.js` | profiling helpers | Timing is diagnostic, not part of state evolution. |
| `src/systems/telemetry.js` | local analytics | Human-readable session timestamps and debounced local persistence. |
| UI, audio, capture, and probe scripts | presentation/tooling | DOM animation, media scheduling, browser capture, watchdogs, and visual probes. |

Known Phase 0 risk to resolve before full SG-01 exit:

- `src/systems/automation.js` and `src/systems/sectorSim.js` still use wall-clock timestamps for offline catch-up baselines. That is acceptable for current save UX, but 47-A replay/policy runs must disable or virtualize offline catch-up so load/continue parity is driven by sim-time evidence, not machine time.
