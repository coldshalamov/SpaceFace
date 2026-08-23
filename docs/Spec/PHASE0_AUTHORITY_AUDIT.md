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
| `src/audio/bandBeds.js` | cosmetic audio | Owns only cosmetic Web Audio carrier nodes. `createBandBedRuntime` takes an injected RNG (`options.random`) whose ambient default feeds a procedural noise buffer only; the sim's `state.rng` is never read. |
| `src/audio/audioSystem.js` | cosmetic audio | Varies playback rate/gain timing for presentation only. |
| `src/render/camera.js` | cosmetic camera | Applies shake jitter after authoritative camera target/zoom decisions. |
| `src/render/feel.js` | cosmetic render | Varies warp streak presentation; no gameplay state mutation. |
| `src/render/starfield.js` | cosmetic render | Creates decorative background distribution. |
| `src/render/vfx.js` | cosmetic render | Particle variation; no gameplay state mutation. |
| `src/systems/telemetry.js` | local telemetry | Builds a local session id; not read by simulation. |
| `src/testing/lab/runScenario.js` | local lab id | Mints a `runId` for lab/internal-test results that are non-promoting; not read by simulation. |
| `src/ui/floatingText.js` | cosmetic UI | Adds presentation drift to damage/pickup text. |
| `src/ui/screens/drill.js` | cosmetic UI | Varies drill particles, steam, dust, and rover shake inside the local drill screen; authoritative drill yields remain system-driven. |
| `src/ui/screens/stationHub.js` | cosmetic UI | Mints a token to dedupe the station-name acquire CSS transition; presentation only. |
| `src/ui/asteroid/asteroidRenderer3d.js` | cosmetic UI | Scatters the tumbling rock debris when a mining block lets go. Verified renderer-local: `particles` is declared inside the module and feeds instanced additive chips; the only readers outside the file are perf counters and the diagnostics overlay, which count particles and never feed them back into sim state. |
| `src/ui/screens/sandbox.js` | seed mint | The Combat Lab "roll" button. The boot-seed case in miniature: a human presses roll, the value lands in the seed input, and everything downstream runs from that explicit seed — nothing authoritative reads the raw draw. The screen is additionally DEV ONLY (IS_DEV folds false at build time; uiRoot registers it only behind that flag), so it cannot reach a player build. |

Forbidden classes:

- Any `Math.random` under authoritative systems unless it is explicitly in this table and proved cosmetic.
- Any fallback from a named stream to `Math.random`.
- Any test-only duplicate formula used to excuse an authoritative implementation gap.

Classification scope (`check:phase0-slice-contract`):

- The scan flags a `Math.random` **invocation** (`Math.random(`). A bare reference or assignment —
  the capture/restore plumbing of a determinism guard, e.g. `const _MathRandom = Math.random;`,
  `Math.random = () => { throw }`, `Math.random = _MathRandom;` — is the opposite of a draw and is
  not flagged. The career public-route modules (`src/balance/*`) use exactly this guard and so carry
  no allowlist entry here.
- An injected-default RNG seam (`typeof options.random === 'function' ? options.random : Math.random`)
  is classified by the file's actual use. `src/audio/bandBeds.js` is listed because the seam feeds a
  cosmetic noise buffer; an injected-default seam that ever reached an authoritative path would be a
  violation, not a classification.

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
