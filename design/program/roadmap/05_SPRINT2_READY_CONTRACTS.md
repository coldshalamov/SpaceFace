# Sprint 2 — READY Contracts for the Corridor Contract Wave

**Status:** active, 2026-07-18. Base `bfb23570`; reconciliation commit `2a355195`.

`00_EXECUTION_PROTOCOL.md` forbids implementing a packet whose row has not been expanded into a READY
contract with exact paths, mutex requests, research anchors, focused commands, public-route proof,
non-goals, and terminal state. The family tables in `02_GOLD_CORRIDOR.md`, `03_SIGNATURE_SYSTEMS.md`,
and `04_WORLD_CONTENT_RELEASE.md` own scope and dependency; this file owns the executable contract for
the 23 packets in this sprint only. It does not promote any packet.

## Sprint denominator

`G01–G08`, `T01–T04`, `A01–A05`, `W01–W06` = 23 of 113 packets (20.35%). With `F01–F17` that would be
40/113 (35.40%) if all 23 reached terminal state. Packet count is a scope denominator, not an estimate
of remaining engineering hours.

## Standing constraints for every packet in this sprint

1. **Occupied leases.** `NOW.md` records `MAP-`, `HUD-ASSETS-`, `MISSION-`, `CONTENT-`, and
   `SCREENS-2026-07-18` as `EXTERNAL / OCCUPIED`, covering 29 dirty paths. No Sprint 2 packet may write
   to any of them. A packet whose write-set intersects them is returned `BLOCKED_BY_LEASE`, never
   rearchitected onto a substitute path.
2. **Golden safety.** Both sim compares are `ok`/`hashEqual` at base but carry stale expected envelopes.
   The gate is the **actual** column (v3 `7e3e114e…`, legacy trace counts 4/15/15/4). Moving an actual
   value is a regression; editing an expected value is a forbidden re-record.
3. **Evidence contamination.** `src/systems/asteroidSites.js` imports the dirty `src/data/sectors.js`,
   and `src/systems/e1EncounterRuntime.js` imports the flavor index generated from four dirty
   `src/data/flavor/*.js` files. Contract tests in the `A` and `W` families therefore must assert on
   their own fixtures and on the model/dispatch contract — never on live catalog counts, IDs, or prose.
4. **Environment.** `node_modules` must contain `three`, `@dimforge/rapier3d-compat`, and `playwright`
   before any physics/flight/route conclusion is drawn. A missing Rapier package makes
   `check:autopilot` fail with "Helios terminal fixture must use the production Rapier authority",
   which is indistinguishable from the real `M1-ROUTE` defect. Verify deps before diagnosing.

## Wave 1 — independent foundations

| Packet | Expected new paths | Mutex requests | Focused command | Terminal |
|---|---|---|---|---|
| `G01` | `scripts/lib/goldCorridorPublicPilot.mjs`, `scripts/check-gold-corridor-public-pilot.mjs`, `test/gold-corridor-public-pilot-contract.test.mjs` | browser/Electron profile + evidence port (exclusive) | `node --test test/gold-corridor-public-pilot-contract.test.mjs`; `npm run check:launch-policy` | `FOCUSED_GREEN` |
| `T01` | `src/combat/masslineOrbitTelemetry.js`, `test/massline-orbit-telemetry.test.mjs` | none | `node --test test/massline-orbit-telemetry.test.mjs` | `FOCUSED_GREEN` |
| `A01` | `src/systems/asteroidFormationModel.js`, `test/asteroid-formation-model.test.mjs` | none | `node --test test/asteroid-formation-model.test.mjs` | `FOCUSED_GREEN` |
| `W01` | `test/e1-encounter-phase-dispatch.test.mjs`; provisional `src/systems/e1EncounterPhases.js` | none | `node --test test/e1-encounter-phase-dispatch.test.mjs`; `npm run check:encounter-index`; `npm run check:encounter-director` | `FOCUSED_GREEN` |

Non-goals shared by all four: no registry/update-order wiring, no `package.json` edit, no save-schema
change, no HUD/map/render edit, no encounter or flavor prose. Nothing may import the new kernels in
Wave 1 — staying unwired is what keeps them provably hash-inert.

`W01` may return `coverage_only: true`. If current dispatch behavior is already correct, saying so is
the honest result; the protocol explicitly forbids pretending a characterization test exposed a defect.

## G04 — re-scoped by evidence

The row in `02_GOLD_CORRIDOR.md` reads "repair ordinary Flight V3/autopilot approach so Helios dock
prompt is reached and held", and `02_REMAINING_WORK.md` carries `M1-ROUTE` as RED with "best 294.777 WU,
final 324.520 WU".

Re-proved at `2a355195` with dependencies present: **`npm run check:autopilot` exits 0 and prints
`--- ALL V3 AUTOPILOT CHECKS PASSED ---`**, including the live V3 + Rapier corridor case
(`completionTick` 1197–1210, `maxLateral` 345–354, `finalDistance` 37.84–37.87 WU), reverse-burn
timing, obstacle avoidance commit/lifecycle, assisted/drift/newtonian modes, and
`ui:setCourse → nav.autopilot`.

The autopilot acceptance surface is therefore **not** the defect. G04's contract is re-scoped to
*locate* the actual blocker in the composed public route (New Game → objective → map → flight → dock
prompt held) and repair only the owner the evidence names. Any repair still may not touch
`src/core/gameState.js`, `src/systems/world.js`, or `src/systems/missions.js` while those leases are
occupied; if the evidence names one of them, G04 returns `BLOCKED_BY_LEASE` with the measurement.

Non-goals: no edits to `src/systems/flight.js` or `flightDynamics.js` (compatibility paths, not live).

## Wave 2–5 contract status

| Packet | Contract state | Reason |
|---|---|---|
| `T02` | READY — new contracts/check helper beside `T01`, no gameplay writes | depends only on the `T01` interface |
| `A02` | READY-PENDING — save adapter/migration is an integration mutex | must be requested from the lead, not written by the packet agent |
| `W02` | READY — `src/combat/trace.js` (111 lines) is clean and unleased | focused contract test on append/order/reset/save |
| `G02`, `G03` | READY-PENDING — deep-state fixture ladder reports 13 contracts / 0 captured | fixture manifest update is an integrator path |
| `T03` | READY — fire-control/target helper; auto-target and input remain mutexes | consumes `T01`/`T02` |
| `A05` | READY — site data/production tests; the contact-ring irreversibility law | UI explicitly deferred |
| `W03`, `W04` | READY-PENDING — require separate semantic claims even though files differ | encounter/combat/effects/physics contracts collide by meaning |
| `A03`, `G07` | `BLOCKED_BY_LEASE` — write-set requires `src/render/renderer.js` / `src/render/bloom.js` | both dirty under `MAP-2026-07-18`; the lease has no identified owner to hand off |
| `W05` | `BLOCKED_BY_LEASE` — sensor-ghost requires HUD/map | `src/ui/galaxyMap.js`, `src/ui/navigation/localSpaceMapModel.js`, `src/ui/uiRoot.js` dirty |
| `T04`, `A04`, `G05`, `G06`, `W06` | PLANNED — gated on their Wave 1–3 dependencies landing | expand before implementation |
| `G08` | `NOT_STARTED (dependency)` — depends on `G07`, `A04`, `A05` | at least `G07` is lease-blocked |

`READY-PENDING` means the outcome and paths are agreed but one named mutex must be resolved by the
integration owner before an agent may implement it. It is not a promotion.

## Receipt and integration rule

Workers hold no Git authority beyond `git add -N` on their own new files. They return an uncommitted
diff and the protocol receipt. The lead reviews the full diff, stages only the declared packet paths,
re-runs the focused proof and the golden-safety gate in the primary tree, and commits atomically. The
foreign diff digest is checked before and after every stage; a change means a lease owner is live and
the lead re-reviews before proceeding.
