# FB-095 — The determinism guard bans wall time in sim owners, not only Math.random

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: check-phase0-slice-contract.mjs
**Write-set:** `scripts/check-phase0-slice-contract.mjs`, `src/systems/flightV3.js`, `src/core/physics.js`, `test/fb-determinism-wall-time-guard.test.mjs`
**Neighbours (extend, never restate):** NXI-012

## The gap
`scripts/check-phase0-slice-contract.mjs` enforces `MATH_RANDOM_INVOCATION` against an `allowedRandomFiles`
map with written justifications, but never checks `performance.now` or `Date.now`. Authoritative owners hold
wall-clock helpers today: `src/systems/flightV3.js` has a `nowMs()` helper and `src/core/physics.js` reads
`performance.now()`. `src/systems/automation.js` reads `Date.now()` on purpose for offline progress and has no
guard entry.

## Why this direction
A runtime trap on `performance.now` was rejected (presentation legitimately uses it). The existing static
guard already has the right shape: a regex, a classified allowlist, a fail on unclassified and a fail on stale
entries. Extending it is one file.

## Mechanism
- Add a second regex for `performance.now(` and `Date.now(` over `src/systems/`, `src/core/`, `src/ai/`,
  `src/combat/`, `src/world/`; classify the presentation-side and instrumentation files with one-line
  justifications.
- Classify `src/systems/automation.js` explicitly as the sanctioned offline-progress exception, gated behind the
  existing settings key.
- Remove or relocate the wall-clock reads in `flightV3.js` and `physics.js` to `state.simTime` or to the perf
  runtime, so the sim files pass with no allow entry.

## Done when
The check passes on the tree with zero unclassified wall-time sites in sim owners; the chain-reaction and
throw determinism tests stay green on seed 4242; `test/fb-determinism-wall-time-guard.test.mjs` proves the
guard fails on a planted `Date.now()` in a sim file.

## Do not
Do not allow-list a sim owner to make the check green. Do not touch presentation timers (`perfRuntime.js`,
`presentationRunner.js`, `runtimeWitness.js`).

## Focus test starting points
- `test/chain-reaction-determinism.test.mjs`
- `test/wave-b10-throw-determinism.test.mjs`
