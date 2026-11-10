# T01–T18 and A01–A20 — Signature Systems

## Goal

Make SpaceFace identifiable through two systemic verbs rather than content volume alone:

- **Massline/tether:** capture, orbit, reel, redirect, release, rescue, tow, and counterplay with direct
  granular player intent and semantic telemetry.
- **Asteroid Ops:** sculpt geology into productive formations whose contact, heat, signature, logistics,
  and settlement growth create durable strategic consequences.

Both systems begin as deterministic pure contracts, cross existing ownership membranes, then earn UI,
content, and public-route acceptance. Neither may bypass Rapier authority, save semantics, or player
input accessibility.

## T01 ready brief — orbit telemetry kernel

### Outcome

Given host/target transforms, velocities, masses, line length, and player reel/release intent, compute a
pure semantic observation: radial distance/rate, tangent direction/speed, angular rate, orbit sign,
tension/load bands, stable-orbit window, and suggested release vector. This packet observes; it does not
write transforms or auto-fly the ship.

### Path budget and non-goals

- Expected new files are `src/combat/masslineOrbitTelemetry.js` and
  `test/massline-orbit-telemetry.test.mjs`. If either is occupied, return the collision rather than
  moving the interface casually.
- Read `src/combat/AGENTS.md`, `test/AGENTS.md`, `src/systems/masslineTelemetry.js`,
  `src/systems/tetherGameplay.js`, and existing `check:massline:*` commands before defining terms.
- No edits to `src/systems/input.js`, Flight V3, physics authority, `tetherGameplay.js`, HUD, camera, or
  registry in T01.
- XZ plane, finite-value fail-closed behavior, deterministic outputs, no Three.js types.
- Do not choose “fun” thresholds from prose alone; expose named parameters and characterize invariants.

### Required proof

- Circular clockwise/counter-clockwise, radial approach/departure, zero distance, zero mass, slack line,
  overloaded line, and NaN/Infinity fixtures.
- Rotational symmetry and time-step-independent observation.
- Machine-readable values that downstream checks can assert without screenshot interpretation.
- Focused command: `node --test test/massline-orbit-telemetry.test.mjs`; characterization broadening:
  `npm run check:massline:telemetry` and `npm run check:sim:compare` after runtime wiring, not in pure T01.

Terminal state: `FOCUSED_GREEN`; runtime wiring begins at T03/T04 after interface review.

## Massline/tether packets

| ID | Depends | Outcome | Primary paths / mutex requests | Required proof |
|---|---|---|---|---|
| `T01` | `F14,F16` | Pure orbit/load/release telemetry observation described above. | New pure kernel/test only. | Semantic invariant matrix; finite deterministic output. |
| `T02` | `T01` | Define invariant vocabulary and tolerances for capture, stable orbit, pump gain, release quality, break, and escape. | New contracts/check helper; no gameplay writes. | Property/fixture tests and machine-readable schema. |
| `T03` | `T01,T02` | Score eligible Massline targets by player intent, range, closing geometry, obstruction, and ownership. | Fire-control/target helper; auto-target and input are mutexes. | Exact-target clutter cases, immediate reversal, no locked-weapon aim coupling. |
| `T04` | `T03,F16` | Capture/attach through existing physics command and attachment authority with readable failure reasons. | `tetherGameplay`, physics membrane request; no direct Rapier-body transform write. | Attach eligibility, duplicate attach, save/load, sim compare. |
| `T05` | `T04` | Stable orbit assist damps destructive radial error while preserving player-controlled tangent/reversal intent. | Flight V3/physics integration lease. | Invariants over mass ratios and frame rates; assist-off baseline; no cursor chasing. |
| `T06` | `T05` | Reel and pump convert deliberate timing/geometry into bounded energy transfer and line load. | Tether gameplay + input action request. | Pump-gain budget, non-stacking spool, fatigue/load telemetry, replay equality. |
| `T07` | `T05,T06` | Release/cut produces predictable target/host vectors and a legible quality grade. | Attachment command + feedback; combat trace request. | Release vector/grade contracts, no double impulse, sim compare. |
| `T08` | `T07` | Whip impact routes momentum through physics/combat ownership into damage, stagger, and receipts. | Massline impact/damage systems; physics/health writers via ports. | Momentum/damage bounds, friendly/station policy, trace digest, visual feedback. |
| `T09` | `T04` | Counter-tether threats telegraph, latch, contest, and create player-readable response windows. | Threat/AI system; encounter content separate. | Threat intent/feedback checks, held-out survive/escape routes. |
| `T10` | `T06,T09` | Break, cut, overload, obstruction, and escape rules are consistent for player and AI. | Tether/break systems; no UI-only resolution. | Every terminal reason once, no orphan attachment, recovery and save/load. |
| `T11` | `T04,T05` | Noncombat tow/rescue supports disabled craft without converting the system into autopilot. | Mission/tether intent, AI disabled state; faction/economy via events. | Accept/tow/deliver/fail route, ownership and collision safety. |
| `T12` | `T07,T11` | Salvage/cargo utility retrieves physical objects with mass, capacity, and lawful/illegal consequences. | Loot/cargo/tether ports; cargo writer mutex. | Capacity/receipt/crime tests and public salvage route. |
| `T13` | `T04,T10` | Terrain/station anchors obey explicit permissions, line-of-sight, load, and safe detach rules. | Terrain anchors/world/physics; station collision policy. | Static/dynamic anchor matrix, no dock/gate softlock. |
| `T14` | `T08–T13` | AI doctrines use Massline for distinct intent—hunter, denial, rescue, salvage—without perfect execution. | Tactical AI ports/doctrine data; no legacy AI edit. | Doctrine differentiation, counterplay, deterministic cohort runs. |
| `T15` | `T01–T14` | Camera/HUD show target, line state, orbit/load, immediate action, and release result without cockpit framing. | Camera/HUD lease after external HUD lane; shared UI mutex. | UI/a11y/perf, reduced motion, representative browser/Electron media. |
| `T16` | `T03,T06,T10,T15` | Keyboard/mouse/trackpad/gamepad input preserves relative joystick-like intent, granular reel/release, and rebinds. | `input.js` exclusive lease + settings/rebind UI. | Focused input/rebind/sim validation; immediate reversal; aim independence. |
| `T17` | `T04–T16` | Tether state, telemetry, AI intent, and receipts survive save/replay; crowded use stays inside measured budgets. | Save schema/migration and perf through integrator. | Save/reload, sim compare, long run, crowded perf/memory. |
| `T18` | `T01–T17,G18` | Public browser/Electron acceptance across combat, rescue, salvage, failure, and reduced-motion routes. | Evidence owner only after features land. | Held-out routes, semantic traces, current media, clean teardown. |

## A01 ready brief — formation model

### Outcome

Create a pure deterministic geology model that groups asteroids into readable formation archetypes and
produces strategic properties—mass distribution, resource continuity, gas/thermal risk, sensor
signature, approach corridors, and site-affinity—without creating render objects or mutating sector
state.

### Path budget and non-goals

- Expected new files are `src/systems/asteroidFormationModel.js` and
  `test/asteroid-formation-model.test.mjs`; no edit to the occupied render/map lane or Asteroid Ops UI
  shell. If these paths are occupied, return the collision.
- Read `src/systems/AGENTS.md`, `test/AGENTS.md`, `design/ASTEROID_OPS_VISION.md`,
  `src/systems/asteroidSites.js`, `src/data/sites.js`, and the current asteroid/site tests.
- Seed comes from serializable state; no ambient randomness or wall time.
- Formations describe authored/systemic identity, not fixed asteroid-count or triangle budgets.
- Do not integrate visuals until A02 determinism/save contract is accepted.

### Required proof

- Same seed/input equals byte-stable formation records; different seeds vary within authored constraints.
- Sparse, normal, dense, degenerate, overlapping, and empty inputs.
- Translation/rotation invariants where the formation contract should be coordinate-independent.
- IDs remain stable through save/restore and do not depend on array iteration accidents.
- Focused command: `node --test test/asteroid-formation-model.test.mjs`; after persistence wiring,
  broaden with `npm run check:sim:compare` and the owning asteroid/site aggregate.

Terminal state: `FOCUSED_GREEN`; render and gameplay consumers follow.

## Asteroid Ops packets

| ID | Depends | Outcome | Primary paths / mutex requests | Required proof |
|---|---|---|---|---|
| `A01` | `F10,F14` | Pure deterministic formation/geology model described above. | New kernel/data test; no UI/render edits. | Seed, identity, geometry, degenerate-input contracts. |
| `A02` | `A01,F13` | Formation IDs and geology persist/reconstruct without bloating saves or rerolling discoveries. | Save adapter/migration request through integrator. | Save/load/migration/replay equality and `asteroid-entry` contract. |
| `A03` | `A01,A02` | Render formations as spatially readable silhouettes/lanes at navigation and operation distances. | Render/asset lease after visual agent; manifests through integrator. | Visual stability, sparse/normal/dense perf, current captures. |
| `A04` | `A03` | Survey reveals formation structure and uncertainty progressively, not a binary resource overlay. | Asteroid survey/UI lease; sensor integration request. | Fog/save semantics, input/a11y, player comprehension route. |
| `A05` | `A02` | Preserve the sacred contact-ring rule: hollowing permanently removes geological contact and yield potential. | Site data/production tests; UI only later. | Contact max/access invariant, irreversible loss, save/reload. |
| `A06` | `A01,A05` | Thermal model derives heat generation, conduction, cooling surfaces, and machine operating bands. | New pure site-thermal kernel/test. | Conservation/bounds, order independence, degenerate networks. |
| `A07` | `A06` | Heat creates visible derating, faults, shutdown, damage risk, and recoverable operator decisions. | Site production/state; effects/UI mutex. | Deterministic transitions, no hidden loss, save/offline semantics. |
| `A08` | `A01,A05` | Signature model derives emissions from exposed geology, power, machinery, transport, and masking. | New PURE signature kernel over plain-data snapshots ONLY (design ruling 2026-07-18: A08 adds no `state.sites` field and no save-schema change; A09 owns live wiring/consequences, A18 owns persistence/offline continuity). | Monotonic/exception contracts, deterministic aggregation. |
| `A09` | `A08,W05` | Sensor signature changes discovery, hostile attention, contracts, and concealment counterplay. | Sensor/encounter/economy ports; no direct reputation write. | Natural occurrence matrix, threat telegraph, lawful recovery. |
| `A10` | `A05` | Power and material lanes remain topology-driven networks with explicit ownership and storage semantics. | `siteLogistics` tests/implementation. | Split/merge/rebuild, duplicate init, save order, no item-sim drift. |
| `A11` | `A06,A08,A10` | Operator diagnostics identify the real bottleneck—contact, power, input, export, heat, or signature constraint. | Presenter model first; UI shell later. | Cause ordering, stale-data handling, localization/a11y labels. |
| `A12` | `A05–A11` | Six machines and recipes form viable but nontrivial loops across geology/formation archetypes. | Site data/balance simulation; economy intents. | Seed cohort, exploit/cap checks, no gross-vs-granted receipt mismatch. |
| `A13` | `A10,A12` | Physical transport links productive asteroids into a cluster without per-item simulation. | New cluster/logistics kernel; world carrier request. | Capacity/latency/failure contracts, deterministic aggregation. |
| `A14` | `A03,A13` | Cluster selection/map communicates flows, risks, and dependencies across several asteroids. | Asteroid UI/map lease after active lanes. | Keyboard/gamepad reachability, legibility, UI perf, public task route. |
| `A15` | `A13,A14` | Productive cluster can assemble a station/outpost through authored stages and visible investment. | Ownership/station/economy interfaces; registry/assets mutex. | Stage prerequisites/receipts, save continuity, public construction. |
| `A16` | `A07,A09,A13,A15` | Fault, raid, depletion, severed transport, and abandonment have repair/recovery options and lasting receipts. | Site/encounter/mission systems. | Failure matrix, no softlock/duplication, route-loss fixture link. |
| `A17` | `A04,A11,A14` | Asteroid console supports keyboard, mouse/trackpad, gamepad, contrast, reduced motion/flash, and readable zoom. | Asteroid UI/styles exclusive lease. | Focused UI/a11y/perf and representative current capture. |
| `A18` | `A02,A05–A17,F07` | Sites and clusters survive save/offline progression with capped exact grants and no topology reroll. | Save/automation/economy through ownership ports. | Productive-site fixture, offline caps/receipts, Continue. |
| `A19` | `A03,A14,A17,A18` | Dense formations/sites meet frame, memory, asset residency, and visual-quality targets without reducing defaults. | Render/perf/assets lease. | Measured sparse/normal/dense profiles, visual stability, cleanup. |
| `A20` | `A01–A19,G08` | Public browser/Electron acceptance from discovery through productive cluster, fault, recovery, and sale. | Evidence owner; no feature changes in gate. | Held-out routes, semantic fixture/receipts, current media and perf. |

## Parallelization and collision rules

- `T01/T02` and `A01/A02` are separate pure lanes and may run with `G01/W01`.
- Runtime Massline physics packets serialize around `tetherGameplay`, Flight V3, physics authority, and
  input. Asteroid thermal/signature/logistics kernels remain parallel until shared site state wiring.
- HUD, render, asset, UI shell, map, registry, save, and package changes are integration requests while
  another lease occupies them.
- Run one current visual/evidence owner per route. Kernel agents do not claim player-visible acceptance.

## Signature-system exit rule

The system is not complete because it has many mechanics. It exits when player intent is direct,
counterplay is readable, state persists, machine traces explain outcomes, public routes demonstrate both
success and recovery, and the authored presentation survives measured normal and crowded play.
