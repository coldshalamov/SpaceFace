# Phase 0 Authority Audit

Source of truth: `design/_ARCHIVE/MASTER_MAKEOVER_PLAN.md` (archived 2026-09-08).

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
| `src/render/vfx.js` | cosmetic render | Particle variation; no gameplay state mutation. |
| `src/render/infrastructureMotion.js` | cosmetic render | Retimes the wreck electrical-arc discharge. Verified renderer-local: the draw lands in `rec.arcTimer` / `rec.arcIntensity` inside the tracker's module-local `infrastructureStates` map, which drives mesh rotation/arc presentation only and never feeds back into sim state. |
| `src/render/shipMicroMotion.js` | cosmetic render | Varies hit-flinch recoil direction. Verified renderer-local: every draw lands in a `craftMotion` module-local record (`flinchVelRoll/Pitch`, `flinchShudder`) that offsets mesh pose only and never feeds back into sim state. |
| `src/systems/telemetry.js` | local telemetry | Builds a local session id; not read by simulation. |
| `src/testing/lab/runScenario.js` | local lab id | Mints a `runId` for lab/internal-test results that are non-promoting; not read by simulation. |
| `src/ui/floatingText.js` | cosmetic UI | Adds presentation drift to damage/pickup text. |
| `src/ui/screens/drill.js` | cosmetic UI | Varies drill particles, steam, dust, and rover shake inside the local drill screen; authoritative drill yields remain system-driven. |
| `src/ui/screens/stationHub.js` | cosmetic UI | Mints a token to dedupe the station-name acquire CSS transition; presentation only. |
| `src/ui/asteroid/asteroidRenderer3d.js` | cosmetic UI | Scatters the tumbling rock debris when a mining block lets go. Verified renderer-local: `particles` is declared inside the module and feeds instanced additive chips; the only readers outside the file are perf counters and the diagnostics overlay, which count particles and never feed them back into sim state. |
| `src/ui/orrery/text.js` | cosmetic UI | ORRERY decrypt/scramble text reveal: draws only pick NOISE glyphs for a display string written to `element.textContent`; nothing authoritative reads them. |
| `src/ui/orrery/waveform.js` | cosmetic UI | ORRERY station waveform bars: draws land in `--orr-wave-*` CSS custom properties (rest offset, animation duration/delay/spread, opacity range) on the bar element — presentation variance only. |
| `src/ui/screens/sandbox.js` | seed mint | The Combat Lab "roll" button. The boot-seed case in miniature: a human presses roll, the value lands in the seed input, and everything downstream runs from that explicit seed — nothing authoritative reads the raw draw. The screen is additionally DEV ONLY (IS_DEV folds false at build time; uiRoot registers it only behind that flag), so it cannot reach a player build. |
| `src/ui/screens/crucible.js` | cosmetic UI | Crucible seed "Counter" roll animation: draws pick transient scramble digits written to `seedInput.value` while the real seed tumbles into place, then the interval restores `freeSeed`. Programmatic `.value` writes fire no `input` event, so the explicit run seed never picks up an ambient draw. |
| `src/ui/screens/newGame.js` | seed mint | `randomSeedText()` fills the seed field with a fresh suggestion. Same boot-seed case as `src/main.js`: the draw lands in a text input, and the run's seed is whatever the field says when Launch is pressed — everything downstream runs from that explicit seed. |

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

Authoritative sim code must use `dt`, `state.tick`, or `state.simTime`. FB-095 makes this a
scanned guard: `check:phase0-slice-contract` rejects any unclassified `performance.now(` /
`Date.now(` invocation under the simulation-owner directories (`src/systems/`, `src/core/`,
`src/ai/`, `src/combat/`, `src/world/`). Diagnostics that genuinely need wall time read it
through `perfNow()` in `src/core/perfRuntime.js` — the single classified instrumentation seam.

Current classified wall-clock owners:

| Owner | Classification | Rationale |
|---|---|---|
| `src/core/loop.js` | frame driver | Measures elapsed real time only to feed the fixed-step accumulator (receives RAF/host stamps; no direct read today). |
| `src/core/eventBus.js` | frame driver | `flush(maxMs)` bounds how long a queued emit slice may hold the frame — wall stamps set a delivery deadline, never a sim outcome. Stays dependency-free, so it does not route through `perfNow()`. |
| `src/core/sectorEnterDefer.js` | frame driver | The chunked deferred-enter drain runs until a millisecond work budget expires — wall stamps bound per-tick work. Sim stamps ride separately on `_deferredEnterClock`/`_deferredEnterTick`. |
| `src/core/perfRuntime.js` | diagnostics | The instrumentation clock. `perfNow()` is the exported seam; per-tick `tickMs` diagnostics in `src/core/physics.js`, `src/systems/flightV3.js`, and `src/systems/flight.js` call it instead of reading wall time locally (FB-095). |
| `src/core/presentationRunner.js` | presentation | Cue/presentation pacing over wall time; owns no sim outcomes. |
| `src/core/runtimeWitness.js` | diagnostics | 1 Hz flight recorder (`window.__SF_WITNESS__`); wall stamps label human-facing reports. |
| `src/core/renderUpdatePhase.js` | diagnostics | Render-phase timing instrumentation. |
| `src/core/bootScheduler.js` | diagnostics | Boot scheduling measurements; no sim ownership. |
| `src/systems/input.js` | input adapter (diagnostic stamp) | Input→photon latency stamp; measurement-only, kept off serialized `state.input` — device arbitration uses the `(tick, seq)` pair. |
| `src/systems/gamepad.js` | input adapter (diagnostic stamp) | `lastActiveMs` device diagnostic plus an idle-skip self-benchmark that measures its own cost. |
| `src/systems/touch.js` | input adapter (diagnostic stamp) | Prefers `ev.timeStamp`; wall clock is only the diagnostic fallback. |
| `src/systems/telemetry.js` | local analytics | Human-readable session id/timestamps and debounced local persistence; not read by simulation. |
| `src/systems/automation.js` | offline-progress exception | The single sanctioned sim-adjacent read: `resolveAutomationOfflineNow` uses `Date.now()` only when `settings.gameplay.wallClockOfflineProgress === true` (explicit host opt-in). Lab and deterministic runs leave it off — "now" resolves to `simTimeMs(state)` or an injected `opts.nowMs`/`offlineElapsedSec`, so identical runs produce identical saves. |
| UI, audio, capture, and probe scripts | presentation/tooling | DOM animation, media scheduling, browser capture, watchdogs, and visual probes. |

Resolved Phase 0 risk (FB-095):

- `src/systems/automation.js` offline catch-up is now explicitly gated behind
  `wallClockOfflineProgress === true`; deterministic runs resolve "now" from sim time.
- `src/systems/sectorSim.js` carries no wall-clock read — its catch-up bookkeeping serializes
  sim-time stamps only (F2 comments).
- `src/core/physics.js`, `src/systems/flightV3.js`, and `src/systems/flight.js` no longer read
  wall clocks; their `tickMs` diagnostics go through `perfNow()`.
