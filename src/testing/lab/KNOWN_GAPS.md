<!-- LIFETIME: VOLATILE -->
# Deterministic lab known gaps

These are claim boundaries, not reasons to bypass the lab. Reproduce a gap before changing it, then
update this file in the same reviewed slice that closes or materially changes the limitation.

- **Refresh base:** current validation working tree based on repository revision `106629c4`,
  verified 2026-07-25.
- **Expires:** any change to the authoritative runtime manifest, lab CLI/runtime/evidence code,
  committed scenarios, Chromium host, checkpoint surface, or relevant lab/broker tests.

## G1 — `sf lab` cannot yet produce `production-fixture`

`src/runtime/authoritativeSystemManifest.js` can identify the Node-safe production manifest, but
`runScenario.js` always supplies an explicit focused system list resolved by `systemBundles.js`.
Evidence is therefore derived as `focused-fixture` (or a narrower honest class).

Do not claim whole-game or full-production behavior from the current CLI.

Relevant proof:

```powershell
node --test test/authoritative-manifest.test.mjs test/lab-runner.test.mjs
```

Closure requires a public lab/profile path that materializes the Node-safe production manifest,
preserves scenario/fixture control, derives `production-fixture`, and has fail-closed coverage.

## G2 — flight save/load continuation diverges at tick 43

The committed `flight-save-load.scenario.json` currently restores at tick 39 and first diverges at
tick 43 on `playerVelX`. Final deterministic-covered hashes match, but the trace-tick-by-tick
contract correctly returns `parity-fail` / exit class `5`.

Reproduce:

```powershell
npm run sf -- lab compare src/testing/scenarios/flight-save-load.scenario.json --verbosity 2
```

Do not report save/load continuation green for this scenario until the owning state restoration
defect is understood, a focused regression observes fail then pass, and the comparison command is
green without weakening its intermediate contract.

## G3 — Chromium parity V1 supports focused flight only

`browserScenarioHost.js` accepts the exact ordered focused flight bundle:

```text
actions -> flightV3 -> weapons -> physics
```

It rejects non-flight fixtures, attachments/Massline, save/load equivalence, non-empty parameter
overlays, tape frame commands, and different/reordered explicit system lists. The broker-managed
acceptance manifest currently binds `flight-fixed-input.scenario.json`.

Direct runtime comparison is diagnostic:

```powershell
npm run sf -- lab compare src/testing/scenarios/flight-fixed-input.scenario.json --runtimes node,chromium
```

Broker-managed acceptance is:

```powershell
node scripts/validation-broker-cli.mjs --manifest lab-chromium-parity
```

Do not describe focused detached Chromium parity as rendered or public-route acceptance.

## G4 — deterministic checkpoints are coverage-bounded

The `deterministic-covered` surface:

- quantizes covered numeric fields to six decimals;
- maps non-finite values according to the surface policy;
- includes the explicitly covered gameplay/RNG continuation fields;
- omits renderer/DOM/audio/VFX state, engine-private caches, object identity, exact IEEE-754
  values, unlisted RNG streams, and system-private state.

`checkpointCompare.js` preserves raw divergent values for reports, but hash equality is not
byte-exact whole-state identity.

Currently uncovered RNG/private continuation includes system-owned streams outside the explicit
surface, such as automation, claims, sector simulation, intervention, and future private streams.
Do not claim complete multi-stream save identity from checkpoint equality.

Relevant proof:

```powershell
node --test test/lab-checkpoint.test.mjs test/lab-checkpoint-compare.test.mjs
```

## G5 — `run` does not own multi-arm equivalence

A scenario declaring `run-eq-repeat`, save/load equivalence, or Node/Chromium equivalence cannot
receive a certifying result from one plain `sf lab run` arm. The run is intentionally incomplete
until the fixed parent executor performs all arms.

Use:

```powershell
npm run sf -- lab repeat <scenario>
npm run sf -- lab compare <scenario>
npm run sf -- lab compare <scenario> --runtimes node,chromium
```

This is a deliberate false-positive defense. It should not be “fixed” by allowing callers to inject
equivalence or skip the declared assertion.

## G6 — process-control wall-clock test is load-sensitive in broad concurrent runs

At the refresh base, `test/validation-process-control.test.mjs` passed all eight cases when run
alone, but its long-child cleanup case exceeded the test's elapsed-time margin when nine unrelated
test files were launched in the same `node --test` process (`3493 ms` aggregate versus `1438 ms`
isolated).

Use the owning proof:

```powershell
node --test test/validation-process-control.test.mjs
```

An aggregate-only timing failure is a harness/environment signal only after this isolated proof is
green. Do not repeatedly rerun the broad suite, weaken production cleanup, or increase acceptance
launch budgets to hide it. Closure requires making the timing assertion load-tolerant while
retaining proof that the exact child process tree is cleaned up within its real contract.

## G7 — World Site public-route discovery is still fail-fast and packet-named on `master`

`scripts/lib/pq017WorldSitePublicRoute.mjs` is approximately 11.5k lines on the refresh base and
throws on blocking route/assertion failures. One recoverable defect can therefore hide later
independent defects until another expensive diagnostic run.

A packet-neutral `WORLD_SITE_PUBLIC_ROUTE_DRIVER` export and a PQ-018 consumer exist on an
unintegrated candidate branch, not on `master`. Do not duplicate or extract that surface while the
candidate is active. After integration/ownership reconciliation, closure should:

1. move the shared verbs to `scripts/lib/routeDriver/`;
2. leave the PQ-017 module re-exporting for compatibility;
3. document each verb's guarantees and assumptions;
4. add a diagnostic-only collector for recoverable phase/expected/actual failures;
5. retain fail-fast behavior for certification and unrecoverable boot/reachability/observer faults;
6. prove three independent injected defects are reported by one bounded diagnostic run.

Do not delete either bespoke route until a declarative scenario reproduces its phases and evidence.

## G8 — no seeded lab soak/fuzz executor or production World Site scenario

All 96 production update-order systems are currently marked Node-safe, while five presentation
initializers are intentionally browser-only. That makes a broad headless physics soak plausible, but
the public CLI still exposes only `validate`, `run`, `repeat`, `compare`, `replay`, and `trace`; its
scenario/compiler/fixture surfaces do not yet express the full World Site route.

Closure requires a public, certifying `sf lab soak` parent executor with:

- fixed seed and tick budget;
- generated tick-indexed public input plus exact replay from seed;
- invariant oracles for impact causality, monotonic operation history except declared failure,
  save/load continuation, duplicate roots/payloads/listeners/materials, and bounded entities/resources;
- production-fixture execution or an honestly narrower evidence class;
- shrinking/localization to a seconds-scale reproduction;
- adversarial false-positive tests and stable exit/fingerprint artifacts.

A soak run is a coverage mode, not by itself a new evidence class. Smoke-on-master for a complete
World Site golden path should wait until the production-fixture/scenario gap is closed; CI should not
silently substitute a focused fixture and call it whole-game proof.
