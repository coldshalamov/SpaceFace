# PERF-89 sim hitch attribution — lane `simattr` report (PQ-129.19)

Lane contract (PERF_OPTION_SPACE.md §1): every `sim`-classified hitch frame carries a named
per-frame owner; measurement only — no cadence change, no quality knob, no new system.

## What shipped

New opt-in flag `perf.simAttributionEnabled` in `src/core/perfRuntime.js`
(default off; armed alongside `hitchAttributionEnabled`):

- `shouldMeasureSystemsThisStep` now resolves two bits instead of one:
  `currentStepMeasured` — this step may write p95 rings (stratified 8-of-31 sampler,
  fullCoverage, or an armed follow-up frame), and `currentStepInstrumented` — this step
  wraps its systems in clocks at all. With `hitchAttribution + simAttribution` on, every
  sim step takes the existing instrumented registry path.
- `recordSystem` is gated on `currentStepInstrumented`: it always accumulates the frame's
  `max + argmax + total` (the hitch-verdict inputs), but writes the p95 ring only on
  `currentStepMeasured` ticks — the sampler's basis is unchanged.
- `recordStepTotal` marks a step measured iff at least one system actually reported
  (`frameStepSystemsRecorded > 0`), so a frozen step that skipped its systems is honestly
  unmeasured rather than inheriting a stale query flag.
- `hitchVerdicts` entries now carry `simSystem` (null for non-sim owners), so a probe can
  bind the named owner to a specific rAF-measured gap, not just the aggregate histogram.
- `getReport().simAttributionEnabled` surfaces the mode for probe summaries.
- `scripts/probe-runtime-witness.mjs` `armProbeInstrumentation` arms the flag
  (feature-detected `typeof === 'function'`, so the probe still runs against builds that
  predate it) and restores it on cleanup. Next sweep gets per-frame sim owners
  automatically.

Effect: a sim-owned hitch on an *unsampled* tick still names its real max system and
lands in `bySimSystem` instead of `simUnmeasuredFrames`/`bySimSystemPartial` with
`simSystem: null`. The `simFollowupMeasure` echo arm becomes a no-op while the flag is on
(every step is already instrumented, so `simFullyMeasured` is always true).

Overhead: disarmed, the whole feature is one extra `&&` chain in
`shouldMeasureSystemsThisStep` plus one branch + counter in `recordSystem` — nothing
allocates. Armed, each sim step pays two `performance.now()` calls per system
(~90 systems ⇒ ~180 clocks/step ≈ single-digit µs on this box). It works with
`systemTimingEnabled` off entirely — the cheapest full-attribution mode possible.

## Which systems CAN spike — walk of PRODUCTION_UPDATE_ORDER

Clocks: **T** = table (every primary tick + catch-up extra steps), **N** = near
(primary ticks, skipped on catch-up extras), **C** = calendar (2 Hz, straddled
~1–2 owners/tick across three cohorts). Spike marks cite per-entity iteration evidence
(`entityList` refs counted in the system's file).

| Order | System | Clock | Can spike? | Mechanism |
|---|---|---|---|---|
| 0 | input | T | low | input snapshot only |
| 1 | autoTargetAssist | T | med | scans candidate targets |
| 2 | flybyFocus | N | low | focus bookkeeping |
| 3–4 | bulletTime, cloak | T | low | scalar state |
| 5 | lawSecurity | N | med | patrol/heat scans |
| 6–7 | scanner, scanReveal | N | **yes** | asteroid-field queries, reveal sweeps |
| 8–13 | buildIdentity, pirateDisguise/Parley/Disengage, aceMemory, factionPresence | C/N | low–med | cohort-spread |
| 14–16 | nemesis, nemesisEncounter, capitalBossEncounters | T | **yes** | encounter materialization, capital score over subsystems |
| 17 | aiSlot (tacticalAI) | N | **yes** | sensor acquisition + intent over contacts; 23 loop constructs in ai.js — the top sampled suspect historically |
| 18 | barkDirector | C | med | cohort anchor, bark queues |
| 19–20 | aiEncounter, actions | N/T | med | encounter state |
| 21–22 | beacons, travelLanes | C | low | cohort-spread |
| 23–25 | flightSlot, cruise, aiPorts | T/N | low–med | flight integration |
| 26 | tumbleStates | T | low | |
| 27 | collisionConsequences | T | **yes** | iterates the tick's collision-event list — burst-correlated with combat density |
| 28–36 | stuntGrammar, weapons, countermeasures, bombs, emergentPrimitives, impulseCharges, mines, massSeed | T | **yes** | weapons iterates entityList (9 refs); projectile/mine/charge passes scale with live ordnance |
| 37–39 | uniqueLootAbilities, dockingCorridor, environmentalMachinery | T | med | |
| 40 | survivalArena | T | med | arena toys intercept shots |
| 41 | fields | T | **yes** | per-entity field strength/effect application (4 refs) |
| 42 | planetRuntime | N | med | |
| 43 | physics | T | **yes** — prime suspect | Rapier step + `hash.rebuild(state.entityList)` + body sync (14 refs); cost scales with live body count, not sampled list length |
| 44 | combat | T | **yes** | per-entity fire/damage passes (5 refs) |
| 45 | combatOutcome | N | med | receipt scan |
| 46–47 | aftermathWrecks, titles | C/N | low | |
| 48–49 | wingMorale, tetherGameplay | C/T | low | |
| 50–51 | surrenderRecovery, custodyConsequences | T | low | |
| 52–57 | massline family (telemetry/threats/impacts/snares/throw/impactDamage) | T/C | med | massline entity scans |
| 58 | lootShards | T | **yes** | per-shard iteration (4 refs), scales with field clutter |
| 59–60 | terrainAnchors, jettisonImpulse | C | low | empty registry placeholders |
| 61–62 | mining, fieldDepletion | T | **yes** | mining iterates entities/sites (4 refs) |
| 63–64 | cargo, fragileCargo | N/T | low–med | dirty-flag recompute |
| 65–69 | automation, asteroidSites, asteroidFormations, crafting, economy, intervention | C | med | cohort-spread; each can still scan on its cohort tick |
| 70 | wingmen | T | med | per-wingman pass |
| 71 | world | T | **yes** — prime suspect | sector residency/census; 12 entityList refs; materialization bursts on sector transitions |
| 72–85 | heistFacilities … gateControlDirector (director/regional block) | C | med | each lands 1–2/tick via cohort straddle, but any one can sweep on its firing tick |
| 86–97 | salvage … scenarioRuntime | C | med | same — salvage/factions/sectorSim/missions family is calendar-cheap individually, but cohort ticks can still stack a scan |
| — | npcJobsRuntime | N | **yes** | NPC job/crew scans (5 refs) |
| 98–100 | swarmArena, survivalWave, survivalRun | T | **yes** | wave boundary materializes spawns via spawnBudget in one step |
| 101–103 | swarmChain, killReplay, killcamRecorder | T | low–med | ring-buffer recorders |
| 104 | heat | T | med | |
| 105 | traffic | N | **yes** | freighter iteration + far-tier probes (5+ refs, entityIndex fallback scans) |
| 106–110 | drill, claims, chronicler, bandRadio, onboarding | C/T | low–med | |
| 111–120 | HUD/voice observers (masslineHud, massSeedHud, fieldHud, planetHud, survivalHud, crucibleFocus, noFireAdvisory, voiceArbiter) | T | low | domGuarded observers |
| 121 | save | C | med | persistence on its cohort tick (autosave has its own owner bucket anyway) |

### Reading

- The 2026-08-21 sweep's "largest sampled sim system max 2.90 ms" is consistent with a
  spiky owner that is *not* in the sampled list: `physics` (Rapier step + spatial hash
  rebuild over entityList), `world` (residency/census bursts), `traffic`, `aiSlot`
  (tacticalAI sensor frames), and the ordnance cluster (weapons/collisionConsequences/
  fields/lootShards) all scale with live entity counts and run every primary tick — any
  can produce a >3 ms slice on an unsampled tick.
- Calendar owners are already spread ~1–2 per tick by the cohort straddle, so a calendar
  system can only spike a frame on its own firing tick — but each one can still sweep
  (economy, sectorSim, salvage, encounterDirector are the plausible ones).
- Frozen steps (`shouldSkipFullTickSystems`, e.g. docked/menu freeze) never instrument;
  they are counted as steps but honestly unmeasured, so a sim hitch in a mixed frame
  lands in `bySimSystemPartial`, not the fully-measured bucket.

## Verification

- `node --check src/core/perfRuntime.js scripts/probe-runtime-witness.mjs` — clean.
- `node --test test/render-hitch-attribution.test.mjs` — 32/35 pass. The 3 failures are
  the pre-existing `probe host load` source-extraction tests, red identically on the base
  commit `fb17f3573` (verified in a clean worktree); they read `readCpuTimes` et al. out
  of probe-runtime-witness.mjs source text and are unrelated to this leaf.
- New tests: armed attribution names the frame's max owner on unsampled ticks with the
  p95 sampler entirely off; sampled ticks still write rings (attribution is additive);
  a frozen step that ran no systems stays unmeasured.

Expected gain: measurement only — `unknown`/unmeasured sim hitch share should collapse
toward the <0.1 acceptance target in the next armed sweep, naming the real spiky owner
instead of '(none)'.
