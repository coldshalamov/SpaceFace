# Genie intake receipt — 02-tension-director (The tension director)

Integrated from `SpaceFace-Tension-Deliverables.zip` (68 files: modules, patches, A/B evidence,
docs). Base packet and interface commit verified by the author against 94f38d342.

## What landed
- `src/ai/tensionDirector.js`, `src/ai/tensionPolicy.js`, `src/ai/tensionWindow.js` — the
  pacing controller: session-phase estimator, policy publication (3 s read-only lease), pacing
  vetoes (`tension_recovery` / `tension_reserve` / `tension_spacing`).
- `src/systems/tensionDirector.js` — the sim owner; single-writer on `state.tensionDirector`;
  serialize/restore/reset port; honest protected reset when no compatible snapshot exists.
- `tests/tension-director/` — 59 tests (run green in the delivery's package layout; the shipped
  test files resolve a package-only `fixture/` when run from a checkout — packaging depth, not
  code; the orchestrator accepted package-layout runs per TEST-REPORT.md).
- Wiring (local): `patches/registry.patch` + `patches/encounter-consumer.patch` applied (both
  verified byte-identical to the delivery's file snapshots before apply); manifest rows for
  `tensionDirector` immediately before `encounterDirector` in PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER, and CALENDAR_CLOCK_IDS (matching tools/install.mjs wireManifest
  behavior — without these the system would register but never schedule); Node factory table
  import + entry.

## Verification
- Law audit clean: zero RNG/wall-time/timer/Three hits in the four sim modules; gameplay time is
  `state.simTime`-guarded; determinism proven by the delivered byte-identical checkpoint tests.
- Central invariant verified in code by intake review: the consumer only re-weights the
  encounter owner's own levers (accrual scale clamp 0.15–1.25, due-rank bias ≤20 s, pacing
  vetoes that can only add blocks). No spawns, no despawns, no reward grants, no damage changes.
- `authoritative-manifest` 10/10 after wiring (counts 150→152 / 112→114 shared with the
  Chronicler arrival).

## Honest boundaries
- Save persistence NOT yet wired: `src/save/saveSystem.js` is under the live PQ-033.02 lane.
  Documented insertion points: `_saveCapturePlan` before the `encounterDirector` row;
  `serializeData` mirror; restore via the `save:loaded` payload (adapter prefers
  `p?.tensionDirector`). Until then, loads honestly reset the arc (documented safe migration,
  `tension:reset` emitted) — no stale-policy leaks across restores either way.
- The delivery's own production acceptance is explicitly open: real hunter/prospector/improviser
  sessions on seeds 4242/8008 with requested-vs-delivered reporting on the live route. Its A/B
  evidence is focused-fixture (`evidenceClass: "focused-consumer-with-world-doubles"`): directed
  arms cut combat starts and damage taken, lengthen materialization gaps, cycle six real
  rhythm phases, and report honest starvation (requested ~0.21 vs observed ~0.07–0.17) rather
  than faking delivery. The compass battery should be rerun after this landing to measure it on
  the real route.
- Optional trade/mission observation needs authoritative receipt events that no producer emits
  yet (the delivery correctly refuses to fabricate them).
- `state.tensionDirector` enters sim-snapshot hashes once active (same class as
  `state.encounterDirector`); determinism holds — no RNG input — but full-state goldens should
  be re-recorded only through the standing re-record decision process, never silently.

## Verification addendum (owner ruling: minutes, not hours)

Production acceptance was verified with short runs, not multi-hour batteries: a standalone
probe (seconds — full story/news/radio emission from kill->wreck->salvage->trade) and a 2-hour
directed session (~17 min wall; td=live every hour, 7,201 tension:policy, 1,448 decisions, 76
phase changes, 4 chapter changes, 25 honest starvation notices, news:headline reacting). The
tutorial-gate integration defect (a permanently unfinished rail holds the director's
suspension) was found and fixed via the game's own settings.gameplay.tutorialHints opt-out.
Long-horizon 10h A/B measurement belongs to the standing compass-battery cadence if/when
wanted — it is not a build-correctness gate and must never run for hours unattended on this
shared machine.
