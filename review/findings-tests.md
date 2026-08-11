# Thermonuclear Review — `test/` (693 `.test.mjs`, ~61.5k lines)
Source: read-only Explore subagent.

## 🟠🟠 HEADLINE — ~355 of 693 test files (~51%) NEVER EXECUTE IN CI
CI runs `check:ci:report` → expands `['precheck','check']`. Every `node --test` in package.json uses **explicit filenames** (69 invocations, 157 distinct files). **No glob anywhere** (`node --test test/` or `test/*.test.mjs` does not exist). Only **~338 distinct test files** are reachable via any executable path. The remaining **~355 are dead weight** — they compile intent but enforce nothing. Spot-checked across the whole repo, these returned **zero** invocations:
- `ai-behavior-stability.test.mjs` (AI determinism)
- `massline-invariants.test.mjs` (massline contract)
- `freight-cargo-custody.test.mjs` (cargo custody)
- `bounded-autosave.test.mjs` (~1000 lines, autosave robustness)
- `world-site-kernel.test.mjs`, `lab-runner.test.mjs`, `rep-gated-docking.test.mjs`, `combat-ecology-roles.test.mjs`, `asteroid-formation-persistence.test.mjs` (determinism grep)

Caveat: a few initially-suspected turned out **live via helpers** (`story-campaign47a` via check-m5-story-progression; `weapon-impulse-consequence` via check-impulse-authority; `m2-continuous-handoff` via check-m2-continuous-handoff). So the precise dead-count needs a per-file pass, but the ~355 estimate is robust and 6/6 spot-checks confirmed dead. **This is the root structural defect: every test must be hand-wired into a `check:*` script or it is invisible.** Fix: add a `node --test test/*.test.mjs` discovery step.

## 🟢 Goldens are NOT stale (earlier premise refined)
`test/47a.telemetry.expected.json` + `v3` both **re-recorded 2026-08-09 at HEAD f66f6768**. `notes` arrays are exemplary (full field-level diff evidence, explicit re-record procedure, honest self-warnings). The "stale golden" risk is in the `:compare` tolerance path (sf-sim.mjs:718) NOT the data — and that's documented in-repo. **The earlier audit's "stale golden" framing was about the :compare lane, not the golden files themselves.**

## 🟠 Goldens gated by npm SCRIPTS, not by any .test.mjs
`grep "47a.telemetry.expected|authoritativeHash|telemetryEnvelope" test/*.test.mjs` → **zero**. Hash asserted only in `scripts/sf-sim.mjs:666-667`. **Consequence: `node --test test/` validates NOTHING about the golden.** A dev running node:test directly gets zero determinism coverage.

## 🟠 Event-name `:` conformance (§0.3/§4.4) NOT enforced by any test
No test validates emitted events match `namespace:name`. Convention followed everywhere in practice but a malformed event name would not be caught. Total blind spot. (Pairs with the systems-tail finding that §4.4 is missing ~120 events.)

## Single-writer coverage (§0.6)
- 🟢 **Credits:** well covered (distributed): `civilian-freighter-recovery:497`, `economy-automation-offline:313`, `economy-contract-risk:449`, `economy-professional-anti-exploit:609`, `ending-choice-a-station-surcharge:105`, `poi-causal-contracts:239`, `seam-depletion:131`, `depth-program-sp1-setpieces:1177`, + `story-campaign47a:575` source-grep.
- 🟢 **Cargo:** covered (`first-trade-contract:301-385` instruments the writer path; `ceres-causal-chain:345`, `planet-vertical:271`).
- 🟡 **Reputation: thin** — only 2 tests (`claim-specializations:811`, `npc-jobs-kernel:624`). The §0.6 triple's weak leg.
- 🟢 **Heat:** strong idempotency contract (`pq019-heat-incident-listener` boots real createSimulation with [lawSecurity, heat], asserts heat moves once across duplicate deliveries, save-reload survives replay).
- 🟡 `physics-writer-audit.test.mjs` tests the SCANNER, not physics — asserts the audit utility classifies candidates, not that physics is actually single-writer in sim.

## 🟢 No silent skips
Precise grep `\b(it|test|describe)\.skip\(|\.todo\(|\bxit\(\b|xtest\(|xdescribe\(` → **no matches**. (62 initial false positives all `process.exit`/`prepareSectorExit`.) No silently-skipped tests.

## 🟡 Tests-that-test-nothing — audit flags re-verified
- 🟢 **`weapon-impulse-consequence.test.mjs` — earlier audit claim "mocks the kernel" is INACCURATE.** It imports the REAL createCombatKernel/createCombatCatalog/createBus + real impulseKernel/collisionConsequences, asserts real computed physics (damage ratios 0.6/1.8 at 1e-12, deltaV mass-scaling, zero-momentum→null). No mocking. **Audit was wrong; this is a real test.**
- 🟡 `combat-ecology-roles.test.mjs` — partly authored-data-shape but DOES exercise `makeEnemySpawnSpec`/`planEncounterShape`. Lighter than behavioral but legitimate content-consistency. **And orphaned** — moot in CI.
- 🟡 `pq019-heat-incident-listener` — hand-constructs the law receipt and emits `law:reportIncidentReceipt` directly. So "only law can sign a receipt, a mission cannot" is **assumed, not tested** (the signature seam is fabricated, not driven by a real lawSecurity conviction). Idempotency/denial/save-reload are real and valuable.
- 🟡 `m2-continuous-handoff:155` — ONE test of nine is a source-grep (`/sector:exit/`); the other 8+ are substantial behavioral (spawnBudget ledger continuity, reinforcement slots, saturation blocking). Flag fair for one test, unfair for the file.
- 🟡 `encounter-barks.test.mjs:2` imports `assert` and never uses it (custom `fail()`/`process.exit(1)` validator). Dead import.
- 🟡 ~11 files use `process.exit(1/0)` validator pattern not node:test (`commodity-flavor`, `encounter-barks`, `sector-geography`, `station-archetype-wiring`, `hauler-origin-chain`, `prospector-origin`, `m2b-frontier-west`, `story-campaign47a`, `story-endings`, `settings-controller-label-truth`, `first-hour-alert-dedupe/voice-priority`, `economy-professional-anti-exploit`). Exit-code-gated (CI catches them) but invisible to node:test discovery/reporting; pollute "0 asserts" metrics.
- 🟢 No `assert.ok(true)` tautologies; no file-exists-only tests (23 existsSync all bundled with deeper content checks).

## 🟡 Flaky
- `bounded-autosave.test.mjs` — `performance.now()` busy-waits (timing-dependent under CI load). Moot while orphaned.
- `asset-residency-refcounts.test.mjs:443-462` — real Playwright Chromium + 2000ms hard cap on asset eviction; potential false-pass/fail under contention.
- `career-ladders-live-integration.test.mjs:66-71` — busy-waits on build-artifact existence with `Date.now()` deadline; racy if build slow.

## 🟢 Clean / strong
- `rng-contract.test.mjs` — real determinism anchor (seed-47 vector pinned to 12 sig figs, hash32 vectors, serializable stepping, named-stream isolation). One of the few rng files wired live.
- `authoritative-manifest.test.mjs` — pins init/update lengths (132/100), `update⊆init`, ordering constraints (titles<wingMorale, environmentalMachinery<fields, world<heistFacilities<regionalEcology). Note: manifest comment still says "98 entries" (stale comment, not a bug).
- `physics-hud-dom-writes.test.mjs` — DOM-write Proxy counter asserts HUDs don't rewrite stable attrs per frame (real perf contract).
- `mass-seed-findings`/`mass-seed-forensic` — real red-before/green-after regression pins driving createSimulation with [massSeed, combat, tetherGameplay], assert exact event-reason sequences.
- `47a.presentation.expected.json` is a 3rd golden (presentation-cue-level), same script-gated characteristic.
- No unseeded Math.random in sim paths from tests (207 hits all in fixtures/timing-shims/forbid-greps).

## RECOMMENDED PRIORITY
1. **Add `node --test test/*.test.mjs` glob discovery** so ~355 orphaned files run or get explicitly deleted. Half the suite is currently theatrical.
2. **Re-wire orphaned contract tests** enforcing real invariants: `ai-behavior-stability`, `massline-invariants`, `freight-cargo-custody`, `asteroid-formation-persistence` (determinism), `bounded-autosave`.
3. **Add event-name `:` conformance test** (§0.3/§4.4) — total blind spot.
4. **Add reputation single-writer test** to match credits/cargo.
5. Convert `process.exit` validators to node:test (or keep exit-gated) so failures produce real diagnostics.
6. Drive `pq019-heat` from a real lawSecurity conviction to actually prove "a mission cannot sign."
