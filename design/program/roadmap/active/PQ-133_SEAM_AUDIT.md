# PQ-133 Crucible seam audit

Audit revision: 2026-08-30
Candidate base: `87eb7542ba27e0a66b97fafda00fbb4d776b4c9b`
Scope: PQ-133.00 assimilation and current seam revalidation; no later Crucible gameplay packet is
implemented by this document.

This audit supersedes the 2026-08-21 CRU-001 snapshot. The source plan remains a durable design
proposal and experiment quarry. Current lifecycle and acceptance live in
`design/program/roadmap/program-queue.json`, the active packet, and exact receipts.

## Authority and evidence

The audited source sections are the current headings in
`design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md`:

- §25.0, Combat Lab foothold;
- §27.1–§27.13, flight mode, run/session, combat, fitting, arena, save, and one-path rules;
- §28.1–§28.11, performance boundary and acceptance;
- Phase 0 and Phase 1 in §30;
- §31, the CRU-000–CRU-068 provisional packet map;
- Appendix A, proposed schemas;
- Appendix E, source and ownership map;
- Appendix F, unresolved product decisions.

The current candidate was inspected read-only before this packet’s mutation. The focused entry run
was:

```text
node --test test/crucible-run-state.test.mjs test/crucible-contamination.test.mjs \
  test/combat-lab-setup-schema.test.mjs test/combat-lab-same-seed.test.mjs \
  test/crucible-lab-scenario.test.mjs test/crucible-wave-schema.test.mjs \
  test/crucible-wave-planner.test.mjs test/crucible-wave-materialization.test.mjs
```

Result: **98 passed, 1 failed**. The inherited failure is the catalog test requiring
`lagrange_crucible`’s `(-500, 800)` `spawnPos` to equal an authored `sector_helios_prime` zone
center (`test/combat-lab-setup-schema.test.mjs`). The owner is the Combat Lab catalog/sector-zone
seam, not this documentation packet. The minimum next action is to reconcile that catalog row with
an authored zone center or deliberately change the contract in the next implementation packet.

`node scripts/check-program-docs.mjs` passed at entry. No browser/Electron capture was run in this
documentation slice, so no current route-accepted or visual-fun claim is made here. The historical
`design/program/roadmap/receipts/PQ-133.02.md` remains evidence for its own older candidate, not a
promotion of the current queue rows.

The direct CRU-008 witness was also attempted with `node scripts/check-crucible-lab.mjs`. Its
scenario-file, validation, and compilation steps passed, but the repeat step could not initialize
Rapier because this isolated worktree has no installed `@dimforge/rapier3d-compat` package. That is
an environment/dependency limitation for this audit run, not a product verdict; the combined unit
tests still exercised the scenario and package contracts with their local harnesses.

## Queue disposition at this candidate

The queue, rather than this audit, is the status authority. Before this slice, the relevant rows
were:

| Unit | Queue lifecycle at entry | Current code/history | Honest disposition |
|---|---|---|---|
| `PQ-133.00` | `ready` → `done` | The audit existed but cited the old plan layout and pre-implementation seams. | Done by this docs receipt; acceptance remains `unproven` because this is support work. |
| `PQ-133.01` | `ready` | CRU-002–008 code landed in `fd723b20`, `d2b89618`, `69b008e0`, `2f72eb8e`, `15deb23e`, and `dab1c704`. | Keep queue lifecycle `ready` until its own receipt/promotion settles the inherited catalog failure and route claim. |
| `PQ-133.02` | `ready` | CRU-009–018 code landed; historical route receipt exists. | Keep queue lifecycle `ready`; current queue has no bound receipt for promotion. |
| `PQ-133.03` | `implemented` | AttackSpec and lineage kernel are present and wired to the live gun path. | Implemented kernel; do not call the full Foundry/player outcome complete. |
| `PQ-133.04` | `ready` | Surface receipt/reflection kernel exists in `c1629d1b`; full Foundry slice is not complete. | Ready/partial, with the remaining content and route work named by its row. |
| `PQ-133.05` | `implemented` | Chain/payload/bridge kernel landed in `f010fc3e`. | Implemented kernel; live-shot/UI obligations remain in its queue receipt. |
| `PQ-133.06` | `implemented` | Orbit/Cryo kernel and helm/status seams landed in `424caf2c`. | Implemented kernel; Lab presentation and broader route obligations remain. |
| `PQ-133.07` | `ready` | Thirty-wave systems slice landed in `e948066f`. | Ready/partial; boss/content/UI/perf obligations remain. |
| `PQ-133.08` | `ready` | Two arena-law systems landed in `de5f17cb`. | Ready/partial; authored boss/prop/VFX/route work remains. |
| `PQ-133.09` | `ready` | Five-room/law systems landed in `b49d65a6`. | Ready/partial; queue promotion and route proof remain. |
| `PQ-133.10`–`.12` | `ready` | Systems/factory slices landed in `b223d13e`, `bca4c34e`, and `f4814182`. | Keep queue lifecycle unchanged until each exact receipt is promoted. |
| `PQ-133.13` | `deferred` | Research-only by plan decision. | Deferred; never an engineering blocker. |

The canonical map now mirrors these queue lifecycle labels. Dispatch-unit `done` closes this
bounded support unit; `implemented` on later units means a bounded code slice exists. Neither label
implies `integrated`, `route_accepted`, or milestone acceptance.

## Current live seam map

### 1. New Game, run/session, and save boundary

| Concern | Live owner and reusable seam | Remaining seam or proof |
|---|---|---|
| State envelope | `src/core/gameState.js` exports `createGameState`; it initializes `run` from `src/core/runState.js`. `createRunState`, `validateRunState`, `RUN_PHASES`, `RUN_PHASE_TRANSITIONS`, and campaign-boundary snapshot/assert helpers are live. | No new run-state owner is needed for CRU-002. Future packets must preserve the explicit schema and avoid adding a second mutable envelope. |
| Sole run writer | `src/systems/runSession.js` exports event-only `runSession`. It handles `run:beginRequested`, `run:transitionRequested`, `run:endRequested`, wallet/XP, threat, modifier records, `game:exitToMenu`, and save lifecycle reset. It has no `update` method. | Any future run field or transition must go through this owner; direct `state.run` writes outside sanctioned reset/setup paths are a regression. |
| Registry/order | `src/core/registry.js` imports and registers `runSession`, `survivalWave`, `survivalRun`, `survivalDraft`, `survivalResults`, `survivalArena`, and the HUD. `src/runtime/authoritativeSystemManifest.js` places `runSession` in init only and places the ticking wave/run owners in update order. | Preserve init/update subset and 47A/V3 golden behavior when adding later owners. |
| New Game/reset | `src/main.js` consumes `game:new`, runs the ordinary `startNewGame` path, resets the explicit state boundary, enters flight, and emits `game:started`. `resetRunState` copies a fresh run envelope. `sandboxSetup` applies staged setup only after `game:started`. | Do not create a Crucible bootstrap or second registry. |
| Menu exit | `src/main.js` consumes `game:exitToMenu`; `runSession` aborts and clears a live non-Adventure run. Pause/results screens emit that event rather than mutating `state.mode` directly. | Future UI must use this lifecycle seam, including failure/quit reason receipts. |
| Save/Continue | `src/save/saveSystem.js` deliberately excludes `state.run`, refuses manual save during a live Survival/Lab run, suppresses campaign autosave for those kinds, and resets the ephemeral envelope on `save:restoring`/`save:loaded`. | First release has no mid-run save. A suspend feature requires a separate admitted packet after replay/save equivalence is proven. |
| Contamination check | `snapshotCampaignBoundary`/`assertCampaignBoundaryUnchanged` cover credits, heat, active ship, research, owned ships/fittings, cargo, modules, researched nodes, factions, world, and RNG identity/value. `test/crucible-contamination.test.mjs` exercises value and reference isolation. | The catalog test red at entry is separate from the contamination contract; keep the red named until the Lab owner repairs it. |

### 2. Combat Lab and real launch route

| Concern | Live owner and reusable seam | Remaining seam or proof |
|---|---|---|
| Setup schema | `src/contracts/combatLabSetupSchema.js` exports `COMBAT_LAB_SETUP_SCHEMA`, `validateCombatLabSetup`, `normalizeCombatLabSetup`, and `combatLabSetupDigestInput`. It validates hull, legal ordered fitting entries, enemy package, arena, seed `1..0xffffffff`, and wave `1..999`. | The schema is live. Its catalog-to-zone assertion currently has the inherited `lagrange_crucible` mismatch named above. |
| Catalogs | `src/data/combatLabSetups.js` exports frozen starter, enemy-package, and arena-prototype catalogs. Arena rows map to existing sectors/positions; they are not authored arena geometry. | Reconcile every `spawnPos` against the current authored zone contract before promoting `.01`. |
| Build code | `src/contracts/combatLabBuildCode.js` encodes/decodes normalized setup values with a content digest and reports stale catalog identity. | Keep digest changes explicit; do not accept an old code as current content without the stale-catalog result. |
| Staged launch | `src/ui/sandbox/sandboxSetup.js` exports `buildSandboxLaunchConfig`, `requestSandboxGame`, `installSandboxGameStartedHook`, and `applySandboxSetup`. It emits the ordinary `game:new`, then applies setup on `game:started`; `game:startFailed` clears staging. | This is the one launch route. Do not add a Lab-only game bootstrap. |
| Canonical fitting | `applyCombatLabSetup` uses the ships owner for hull/module grant/fit and recomputes the active ship. | Arbitrary legal loadouts and the named package path are implemented; player-facing route acceptance is still a `.01` obligation. |
| Budgeted enemies | `spawnBudgetedLabPackage` requests, binds, and releases through `ctx.helpers.spawnBudget`; it fails closed when the budget owner is missing and releases a reservation when spawning/binding fails. | Later wave packages use the separate `src/systems/waveMaterialization.js` seam; do not copy the Lab loop into a second materializer. |
| Lab surface | `src/ui/screens/sandbox.js` contains the dev-only Combat Lab form, seed roll/relaunch, setup digest, controls, and telemetry. `src/ui/screens/crucibleLabControls.js` and `crucibleLabTelemetry.js` are owner-routed support surfaces. | `.01` still needs its own route/acceptance receipt. The red catalog assertion must be repaired or explicitly dispositioned there. |
| Main-menu Crucible door | `src/ui/screens/mainMenu.js` routes to `src/ui/screens/crucible.js`; `src/ui/crucibleLaunch.js` builds a validated setup and calls the same Sandbox launch staging. | No alternate renderer or mode is permitted. Current this-turn route evidence is intentionally absent. |

### 3. Deterministic Lab

| Concern | Live owner and reusable seam | Current disposition |
|---|---|---|
| Scenario schema | `src/contracts/simScenarioSchema.js` owns `SIM_SCENARIO_SCHEMA`, validation, compilation, evidence classes, and the allowlisted top-level keys. | Reusable; do not widen `simScenario.v1` to become a Combat Lab form. |
| Runner/repeat/replay | `src/testing/lab/runScenario.js`, `repeat.js`, `replay.js`, `saveLoadCompare.js`, and `scripts/sf-lab.mjs` provide seeded authoritative execution, repeat hashes, failure replay, and save/load comparison. | Reusable; evidence class remains distinct from a human route. |
| Crucible scenario | `src/testing/scenarios/crucible-physics-swarm.scenario.json` validates/compiles. Its entities resolve through the entity profile registry, and `test/crucible-lab-scenario.test.mjs` compares hull, modules, enemy counts, and combat evidence with the Combat Lab package. | CRU-008 is present. The combined unit run passed its scenario assertions; the direct witness reached validation/compile then stopped on the missing Rapier dependency. The catalog-zone assertion is the only product assertion failure in the combined entry command. |
| Ownership boundary | The deterministic runner builds its own headless authoritative runtime for evidence; browser/Electron still use the ordinary game registry. | Never treat the Lab runtime as an alternate player path. |

### 4. Survival state machine, waves, and materialization

| Concern | Live owner and reusable seam | Remaining obligation |
|---|---|---|
| Phase machine | `src/systems/survivalRun.js` is the ticking Survival owner. It requests transitions through `runSession`, does not write `state.run` directly, and does not infer phases from entity counts. | Further phases/rulesets must remain explicit and validated. |
| Pure plan | `src/systems/survivalWavePlanner.js` exports `planWave`, `wavePlanStreamSeed`, `hashSemanticWavePlan`, and plan-mode resolution. It imports no bus, registry, DOM, or spawn budget. | Preserve purity and stable plan hashes; content/future endless changes need their own receipt. |
| Recipe catalog | `src/data/survivalWaves.js` validates frozen recipes, live enemy ids, gate groups, roles, schedule, completion, and peak demand. `survivalActs.js`, `survivalEndless.js`, and `survivalCircuit.js` provide bounded modes. | The current recipe validator allows arbitrary non-empty `arenaPhase`; a canonical phase vocabulary remains a follow-up if later consumers need cross-file validation. |
| Materialization | `src/systems/waveMaterialization.js` is the single plan-batch-to-hostile seam. It uses `spawnBudget`, `makeEnemySpawnSpec`, deterministic gate/batch seeds, and the canonical `spawnEntity` helper; `src/systems/survivalWave.js` owns the wave cohort census and clear receipt. | No cap bypass, direct state.run write, or entity-scan phase inference. |
| Wave player loop | `survivalWave`, `survivalDraft`, `survivalRewards`, `survivalResults`, `survivalAnnounce`, `survivalArena`, and `src/ui/survivalHud.js` are live event/order owners. | Queue `.02` remains ready until its own lifecycle/receipt promotion is done against the current candidate. |
| Arena laws | `src/systems/survivalArena.js` consumes `run:wavePlanned` and delegates to `lagrangeCrucible.js`, `cinderSluiceArena.js`, `cryoDriftArena.js`, and `stormLatticeArena.js`. | Arena system slices exist; authored boss/prop/VFX/player-route proof is not implied by system presence. |

### 5. Weapons, contact, and attack algebra

| Concern | Live owner and reusable seam | Remaining obligation |
|---|---|---|
| Weapon catalog/fire | `src/data/weapons.js` owns definitions. `src/systems/weapons.js` owns energy/heat/cooldown and projectile creation. | Continue using the canonical fire owner; no separate Crucible gun path. |
| AttackSpec | `src/combat/attackSpec.js` exports normalization, stable digest, immutable compile, live-hit detection, and metrics. `weapons._attackSpecFor` compiles cached specs from fitted/run modifiers on the real fire path. | Queue path names saying `attackCompiler.js` are stale; the live owner is `attackSpec.js`. |
| Lineage/propagation | `src/combat/attackLineage.js` owns shared proc budgets, root/descendant identity, generation, visited targets, and metrics. `attackPropagation.js`, `attackChain.js`, and `attackHit.js` handle volley, pierce, split, chain, and live hit resolution. | Full player-visible arena outcomes still require their owning leaves and route evidence. |
| Surface receipt | `src/core/surfaceContact.js` exports receipt creation, material response, normal/velocity normalization, and reflection helpers; `src/combat/attackHit.js` consumes receipts and `surfaceReflection.js` continues eligible attacks. `physicsAuthority.js` re-exports the receipt surface. | The current receipt is live in the traited attack path. Moving-surface/kinematic geometry remains a later physics-owned seam, not a reason to fork contact handling. |
| Damage/kill | `src/combat/damage.js`, `src/systems/combat.js`, and `buildKillPresentationReceipt` remain the single damage/death path. Weapon hits stamp causal tags and live attack metadata before presentation. | Preserve one damage/kill writer; score/result/UI additions consume receipts rather than guessing from VFX. |
| Status/reaction | `src/data/combatDefs.js`, `src/combat/statuses.js`, `cryoLock.js`, and `thermalShock.js` provide status definitions, Cryo Lock, and bounded reaction behavior. | Any new status must use the existing status/subsystem owners and a focused causal receipt. |

### 6. Physics, fields, Massline, enemies, and fitting

| Concern | Live owner and reusable seam | Current gap/guardrail |
|---|---|---|
| Physics authority | `src/core/physicsAuthority.js` owns body schema/backend selection, mass/inertia/radius/material, dirty sync, and illegal-write assertions; `src/core/sg02DynamicBodyOwner.js` is the current Rapier body owner. | Arena machinery must use physics authority; do not teleport fixed geometry as a substitute for moving-surface ownership. |
| Fields | `src/core/fields/fieldKernel.js` and `src/systems/fields.js` own registration, sampling, coupling, and teardown. | Arena fields and orbit nodes must remain bounded and run-scoped. |
| Massline/tether | `src/combat/attachments.js`, `src/systems/tetherGameplay.js`, `src/systems/massSeed.js`, and the fields kernel are the existing physical owners. | Do not mutate Mass Seed into a generic Survival weapon; use a separate bounded orbit/field owner. |
| Enemy definitions | `src/data/enemies.js` exports `ENEMY_TYPES`; `src/systems/combat.js` exports `makeEnemySpawnSpec`, which stamps doctrine/faction/context and real combat stats. | Wave packages may name only catalog ids; no Survival-only enemy constructor. |
| Spawn budget | `src/systems/spawnBudget.js` exports the budget system/API. `DEFAULT_MAX = 24`, `HARD_MAX = 40`, and world ambient headroom `8` remain current. | Measure run-specific scale inside the existing authority; never raise the cap to make a route pass. |
| Encounter materialization | `src/systems/encounterDirector.js` is the campaign encounter owner; it reserves/releases through spawn budget and owns authored encounter records. | Survival wave materialization is separate but must use the same budget and enemy factory; it must not fabricate campaign director state. |
| Ship/fitting | `src/systems/ships.js` owns grants, fitting, active hull, recomputation, and derived stats; `src/systems/adventureMigration.js` projects proven run traits into Adventure fittings without importing run economy. | Refit/loadout operations must call the ship owner. Run modifiers stay in `state.run`. |

### 7. UI, events, and presentation

| Concern | Live owner and reusable seam | Remaining obligation |
|---|---|---|
| Screen navigation | `src/ui/screenManager.js` owns registration/stack/pause aggregation; `src/ui/uiRoot.js` imports/registers screen modules. Main menu, Crucible door/results, and dev Sandbox are registered through this shell. | Keep results/setup screens in the existing pause/navigation contract; no second UI root. |
| Event bus | `src/core/eventBus.js` provides synchronous `on/off/once/emit` plus queued events. The authoritative manifest and registry are the order source. | New events need an owner and a reason; avoid echo chains for local pure logic. |
| Causal presentation | `src/systems/presentationOrchestrator.js` and `src/systems/presentationAdapters.js` map combat/death receipts to semantic cues; `src/presentation/causalVfxGrammar.js` owns direct/bank/chain/collision/terrain/tether/field/reaction classification. | Causal classification consumes explicit attack/contact receipts. Do not add raw duplicate VFX publishers. |
| VFX capacity | Existing pooled/instanced render families and cue arbitration are reusable; `src/render/vfx.js` feeds causal structural effects through bounded admission. | Hero events must survive saturation, while reduced-motion/forced-colors behavior remains intact. |

## Flight and AI prerequisite seam

The plan’s §21A correction is direction, not a reason to silently rewrite PQ-133. The current owners
are:

| Concern | Current source | What the next movement packet must measure |
|---|---|---|
| Player authority | `src/systems/flightV3.js`, `src/core/flight/propulsionCatalog.js`, `src/core/flight/propulsionKernel.js`, and the current Rapier/physics authority | requested versus achieved acceleration/torque, braking, coast flip, and class identity at the shipping camera |
| Tactical AI | `src/systems/tacticalAI.js`, `src/systems/aiPorts.js`, `src/ai/maneuver.js`, `src/ai/combatDoctrine.js`, and `src/ai/engagementAuthority.js` | hull-relative authority, desired position/velocity, overshoot, oscillation, and response cadence |
| Formation/cohort | `src/ai/squad.js`, `src/ai/squadFrame.js`, `src/ai/fodderCohort.js`, `src/data/squadChoreography.js`, and the live formation grouping in `src/systems/ai.js` | wedge/fan/screen integrity, passing-side reservation, and player-force retention |
| Existing checks | `test/professional-enemy-maneuvers.test.mjs`, `scripts/check-m1-combat-doctrines.mjs`, `scripts/check-sg06-rapier-formation-convergence.mjs`, plus current propulsion/AI checks in `package.json` | Capture current failure first; do not label a Survival slice representative until the admitted motion gate is measured. |

This map does not claim that all §21A outcomes are complete. It records the exact live owners so a
later admitted movement packet can reuse them without creating a campaign-AI fork.

## Performance and proof boundary

The current performance contract is:

| Budget | Current authority |
|---|---|
| Primary frame | 16.7 ms / 60 FPS target; p95/p99 and hitches above 32 ms are reported. |
| Compatibility | 33.3 ms / 30 FPS floor. |
| Simulation | Fixed 60 Hz, maximum four catch-up steps, frame-dt clamp `0.25 s`. |
| Phase budgets | Sim `5.0 ms`, render `7.0 ms`, VFX `2.5 ms`, UI `1.2 ms`, headroom `1.0 ms`. |
| Spawn | `DEFAULT_MAX = 24`, `HARD_MAX = 40`; ambient requests are capped at `8`. |
| Lab baseline | Physics-swarm package: 12 hostile ships plus 3 collision anchors, in addition to the ordinary player/world. |
| Strict probe | `check:perf` uses the headed strict profile with 2.5 s warmup, 7 s duration, 32 ms hitch threshold, zero default hitch allowance, and draw-call ceiling 600. |

Expected cost centers for the first two executable leaves are setup-time package admission,
spawn-budget bookkeeping, deterministic scenario construction, and the DOM-guarded Lab telemetry.
There is no approved quality cut. Later run packets must declare live body/projectile/field/descendant
counts, query counts, VFX admission, frame distributions, and visual equivalence when they add
per-frame work.

Required proof remains layered:

- L0: syntax/schema/import and changed-doc validation;
- L1: focused owner tests for run state, setup, planner, materialization, and compiler seams;
- L2: deterministic Lab, save/contamination, and golden comparisons;
- L3: ordinary Browser/Electron route at play size;
- L4: matched performance/release qualification only where the packet makes that claim.

The `.00` support slice requires L0 and the focused seam characterization above. It does not claim
L3/L4. The `lagrange_crucible` catalog-zone failure is a named inherited red, not an external
dependency: it is in-repo repair work for the Combat Lab owner.

## First two executable packets after assimilation

The queue’s first two executable leaves remain `.01` and `.02`; CRU-002 and CRU-003 have already
landed in the candidate and are documented here as current reusable seams rather than re-shaped as
new work.

### `PQ-133.01` — Combat Lab extension (CRU-002–CRU-008)

Player/developer outcome: the real New Game path launches a selected hull/loadout, enemy package,
arena prototype, seed, and wave; the same setup can be repeated and represented by one deterministic
Lab scenario.

Exact implementation surfaces already present or owned by the row:

| Surface | Owner |
|---|---|
| Orthogonal run envelope and contamination | `src/core/runState.js`, `src/systems/runSession.js`, `src/core/gameState.js`, `src/main.js`, `src/save/saveSystem.js` |
| Lab schema/catalog/build code | `src/contracts/combatLabSetupSchema.js`, `src/contracts/combatLabBuildCode.js`, `src/data/combatLabSetups.js` |
| Real launch/setup | `src/ui/sandbox/sandboxSetup.js`, `src/ui/screens/sandbox.js`, `src/ui/screens/crucibleLabControls.js`, `src/ui/screens/crucibleLabTelemetry.js` |
| Deterministic parity | `src/testing/scenarios/crucible-physics-swarm.scenario.json`, `src/testing/lab/`, `test/crucible-lab-scenario.test.mjs` |
| Focused checks | `test/crucible-run-state.test.mjs`, `test/crucible-contamination.test.mjs`, `test/combat-lab-setup-schema.test.mjs`, `test/combat-lab-same-seed.test.mjs`, `test/crucible-lab-scenario.test.mjs`, `test/sandbox-recovery-launcher.test.mjs`, `node scripts/check-crucible-lab.mjs` (direct script; no npm alias), `npm run check:playable` |

Non-goals: scored waves, random drafts, attack modifiers, authored arena geometry, network features,
and run persistence. Before promotion, repair/disposition the inherited catalog-zone test failure,
run the named focused checks, and obtain the packet’s ordinary route receipt. Do not widen this
packet into later Survival implementation.

### `PQ-133.02` — ten-wave shell (CRU-009–CRU-018)

Player outcome: start a seeded ten-wave run, materialize each planned wave through the existing
spawn authority, clear or lose, collect run-owned rewards, draft/refit through canonical fitting,
see a causal result, and restart the same setup without campaign contamination.

Exact implementation surfaces:

| Surface | Owner |
|---|---|
| Recipe/planner | `src/data/survivalWaves.js`, `src/data/survivalActs.js`, `src/systems/survivalWavePlanner.js` |
| Run phase/wave owner | `src/systems/survivalRun.js`, `src/systems/survivalWave.js`, `src/systems/waveMaterialization.js` |
| Run wallet/rewards | `src/systems/runSession.js`, `src/systems/survivalRewards.js`, `src/systems/survivalRecords.js` |
| Draft/refit/results | `src/systems/survivalDraft.js`, `src/systems/survivalResults.js`, `src/ui/screens/crucibleDraft.js`, `src/ui/screens/crucible.js` |
| HUD/voice/arena | `src/ui/survivalHud.js`, `src/systems/survivalAnnounce.js`, `src/systems/survivalArena.js` |
| Focused checks | `test/crucible-wave-schema.test.mjs`, `test/crucible-wave-planner.test.mjs`, `test/crucible-wave-materialization.test.mjs`, `test/crucible-survival-run.test.mjs`, `test/crucible-contamination.test.mjs`, `test/crucible-results.test.mjs`, `npm run check:crucible:route`, `npm run check:playable` |

Non-goals: attack-topology expansion, new arena geometry/boss art, endless/network features, or
Adventure migration. The existing route receipt is historical until bound to a current queue row
and candidate commit; a later finishing agent must not infer acceptance from code presence alone.

## Collision and stop rules

- The exact shared runtime seams above are current at `87eb7542`; re-run symbol checks before editing
  them. A branch name or old lane label does not reserve a file.
- A later packet that needs a path outside its queue row records a shared-change request in its own
  receipt before widening scope.
- A moved 47A/V3 golden is a regression investigation, not a reason to rewrite expected JSON.
- A failed player route is repaired or honestly classified; it is not hidden behind a green headless
  scenario.
- `PQ-133.00` is complete when this current audit, packet/map assimilation, exact receipt, and
  program-doc check are committed. It does not promote `.01` or `.02`, and it does not close the
  overall `PQ-133` outcome.
