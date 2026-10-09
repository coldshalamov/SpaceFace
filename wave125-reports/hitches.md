# Wave 125 — in-flight-hitches audit report

**Lane:** in-flight-hitches (long frames during flight)
**Audit head:** `664985df7` on `devin/1791504143-perf-w120` (floor `767089340` satisfied)
**saturated: false** — one unaddressed, evidence-supported optimization remains in scope (F1: the classifyWorld discovery-authority walk's shelved-index avenue, probed and refined per lane item (d)).

---

## Ranked findings

### F1 — classifyWorld discovery-authority full-list walk: shelved entities are NOT enumerable under any existing index; the cheap structure is an incremental shelved-tier spatial hash, not a new index class

- **Evidence:** `src/world/activityRuntime.js:943-961` (the `for (let i = 0; i < list.length; i++)` discovery-authority walk inside `selectClassifyEntities`, reached via `ensureActivityClassified` at `:1908`); `src/core/coreSystem.js:603-663` (`ensureEntityIndex` lane inventory); `src/world/farActorTable.js:5-6` ("They are not GameState combat entities while shelved").
- **Mechanism:** The spatial hash is rebuilt each tick from the previous pass's physics lanes (`physicsStatics`/`physicsDynamics`), so any entity that dropped to S3/R3 when the player flew past reach is invisible to `queryRadiusCoherent` forever. The full-entityList walk is therefore the sole re-discovery authority for shelved in-list members — documented in the code comment at `:946-954`. This wave's probe (lane item d) settled what W124-F2 left open:
  - `state.entityIndex` lanes are **type-keyed only** (`shipLike`, `asteroids`, `wrecks`, `statics`, `collidables`, `spatialStatics`/`spatialDynamics`, etc.) — no tier/shelved lane exists. `laneVersions` is the same set.
  - Far-actor records are already enumerable (`world.farActors.rows`, cell-bucketed, `queryFarActors`) but they are *not* entityList members, so they are outside the walk entirely.
  - `runtime.signaturesById` knows the last stamp per visited id but iterating it is O(stamped) — it is an output of the walk, not an index over the unvisited.
  - **Conclusion: shelved in-list entities are not enumerable under any existing index. A new structure is required — but it is a small one, not an index class.**
- **Fix sketch (refined vs W124's L-effort estimate):** shelved in-list members are position-frozen between tier transitions (rocks/stations shelved to S3/R3 do not integrate; the farActorTable owns anything that still moves). Maintain a coarse cell map — `Map<cellKey, Set<id>>` at classify's discovery granularity — updated only inside the visit republish loop where a stamp *changes* tier (the runtime already computes every transition there) plus sanctioned membership moves (the entityIndex `version`/`laneVersions` bumps already enumerate add/remove). The discovery authority then becomes `hash candidates ∪ shelvedHash.query(disc ∪ presenceRadius pad)` — the O(entityList) branch walk only runs on the fallback when the structure is cold. Effort **M** (piggybacks `queryRadiusCoherent`/layered-hash conventions; the hazard is enumerated in Risk).
- **Magic-frame impact: M.** The walk only runs on classify-invalidating ticks — during flight that is membership bumps and retain-miss passes, not every frame — but on a fat sector (1–3K entityList) each pass pays the full O(N) branch walk; `poseTableDiscoveryScan` already vectorizes it when the packed pose table covers the whole list, so the residual is the worst-case object walk plus the unavoidable per-pass cost floor during flight.
- **Risk: M.** A missed shelf/unshelf transition strands an entity out of re-discovery — the exact failure the walk exists to prevent. Mitigation is structural: every transition is produced either inside the visit republish (in-scope hook) or by a sanctioned index membership move (existing version bump gate); raw entityList edits remain unsanctioned and already force fresh classifies. Correctness does not depend on the hash being authoritative — the old full walk can remain as a periodic audit sweep (e.g. every Nth classify) at negligible cost, making the index purely an accelerator.
- **Evidence level:** MECHANISM_VERIFIED for the non-enumerability verdict (index inventories read at `664985df7`) and the transition-hook availability; PERFORMANCE_UNVERIFIED for the magnitude (CPU-side estimate only on this box; hardware-verification item H1 below).

*All other lane items resolved to "no actionable residue" — their enumerations and verified-pacing results are in Lane results below.*

---

## Lane results

### (a) bus.flush listener fan-out — presentation-tier retag is NOT provable for any current listener (enumeration complete)

**Method:** `git grep` at `664985df7` for `on('entity:killed'|'entity:destroyed')` produced 118 registrations; a 60-line closing-window check showed 13 already carry `{ presentation: true }` (audioSystem :2442-3, shipMicroMotion :1290, barkDirector :614-5, presentationOrchestrator :176-7, floatingText :240/:283, galaxyMap :4896, bulkHaulTag :148, uiRoot :742/:750, feel.js :1257 — the last was a >25-line handler, initially misread). **104 inline listeners remained, and every body was read.** Result by category:

| Category | Count (approx) | Why not retaggable |
|---|---|---|
| Sim record-keepers (missions kill/objective/contract/bounty/yardWork listeners, careers, aceMemory, lossLedger, survivalResults, titles, uniqueWrecks, provenanceLedger, bountyHunt, pirateRumor, borrowedVoice recorder outcomes, tethysSwitchyard, surrenderRecovery, nemesis, capitalBossEncounters, recoveryEncounter, survivorPod, traffic kill census, sectorSim, mining, economy `_openCargoKillChain`, spawnBudget, claims, factions truth consumers) | ~70 | Write state.xxx ledgers/records/counters that are serialized and drive later sim/UI; a dropped or frame-delayed slice changes persisted sim state and same-tick ordering. |
| Sim-mutating responders (kernel threat cleanup, ai `_threat`/`_onEntityKilled`, aiEncounter quiet-wake, combatOutcome `_onKilled`, cloak, lootShards pod spawn, impulseCharges, weapons `observeProjectileDeath`, aftermathWrecks wreck/loose-impact records, asteroidSites site kills, gateControlDirector, heistFacilities, livingPoiBehaviors, stationSideEventDirector, encounterDirector, swarmArena/Chain/Elites/Juice/Supply, survivalWave, ambient singletons — borrowedSun/Voice, ilexArk, kilnback, lastShift, mothlight, morrow, palletJack, ravel, rubric, ruckus, ruud, sableVenn, secondRinse, solstice, tallyThree, tensionDirector, towlineTable, vesper, redKite `_captureCourierLoss`, npcJobsRuntime, onboarding, bracket, latchNine, wingMorale, world, lawSecurity `_onKilledAdjudication`/`_onKilled`) | ~34 | Emit sim events, spawn/despawn entities, arm wake latches that recompute sim on next tick, or write entity/alive/threat state other systems read this same tick. |
| Provable presentation-pure | **0** | — |

**Named near-misses (checked individually):**
- `killReplay` (systems/killReplay.js:278): writes only the adventureTape journal — but that journal is sim-recorded state, `entity:killed` is cosmetic-tier (droppable under overflow), and a dropped slice is a permanently missing kill mark exactly on the K-corpse bursts the tape exists to capture. Retag fails the once-only record contract.
- Wake latches (`_wakeAiEncounterQuiet`, `_wakeCombatOutcomeQuiet`, `witnessTargets`/`ambientPredation` already latch-converted in W9): the wake flag *is* a sim input — moving the listener body to a frame-paced drain changes *when* sim work runs → not provably presentation-pure under the determinism contract.
- `titleAttract` (sim/titleAttract.js:166) and `simSnapshot` (core/simSnapshot.js:528): headless sims; the presentation drain is unclaimed there so a retag is a literal no-op. Mechanical but worthless.
- Ordering couplings observed while reading: `missions` registers three killed listeners and `contractClauses` is documented to observe the same emit *after* missions; `lawSecurity._onKilledAdjudication` mints the truth `factions._takeLawKillTruth` consumes on the same emit; `lootShards`' kill listener spawns the pod whose `loot:manifestPayload` missions' handler reads. Any retag breaks same-flush ordering these rely on.

**Verdict:** the retag lever is exhausted — the ~20K inline invocations on K-corpse ticks (W124 measurement, ~1–3ms at K=60, CPU-side on this box) are sim-authority by current design. The only remaining reduction is a dispatch-gate/needs-declaration mechanism — which *is* the listener-classification surgery already adjudicated-deferred under W122, so it is deliberately not re-listed as a finding. No new mechanism evidence moves it out of that boundary.

### (b) `_emitSg02ContactImpacts` pile-up — no presentation-only consumer remains inside the receipt fan-out

`src/core/physics.js:784-820` drains the SG-02 contact buffer and calls `emitPhysicsImpact` per receipt; a K-receipt tick fans out ~27 listeners per receipt. Enumeration at `664985df7`:

- **Already `presentation: true` (7):** audioSystem `_onCollision` :2402, asteroidMotionPresentation `onImpact` :484, feel `_onPhysicsImpact` :1386, shipMicroMotion `onImpact` :1298, gamepad rumble :833, barkDirector `_onBodyImpact` :665, hud reduced-motion cue :2303. Pooled payloads are snapshot-cloned at emit for queued tails (`payloadSnapshots` machinery) — these drain at 8/frame already.
- **Remaining ~20 inline — all sim-authority:** ships `_recordContactScar` (:1708, writes scar records), collisionConsequences `_onImpact` (:93), asteroidSites `_onWorldSiteImpact` (:560), aftermathWrecks `_onLooseImpact` (:998), fields `_onClusterReceipt` (:504), fragileCargo `onImpact` (:284), heistFacilities `_onPhysicsImpact` (:325), ilexArk `_impact` (:34), impulseCharges (:275), lootShards `_onPodImpact` (:591), masslineImpactDamage `_onPhysicsImpact` (:49), redKite run-flag (:74), ruud `_impact` (:172), survivalResults `_onCollisionTaken` (:488), swarmArena `_onDebrisImpact` (:525), swarmElites `_onImpact` (:137), vesper `_impact` (:54), volatileExposure `_onPhysicsImpact` (:215 — explosive shock loads), weapons inertial-shunt (:374 — applies impulse + emits `weapons:inertialShunt`), motionScenarios test handler (:1676). Every one mutates sim state or applies sim impulses/damage.

**Verdict:** the presentation side is already paced; the atomic remainder is sim-contracted fan-out. The only spike lever left is emit slicing, which is the adjudicated-deferred tick-paced emit item (crossing sim ticks changes when sim writes land). No new finding.

### (c) deferred-enter materialization drain — PACED on every presented path (verified, no finding)

- **Seam (continuous) path:** `renderer.js:2958-2984` — the hold's exempt collect beat (`HOLD_EXEMPT_COLLECT_SECONDS` ≈ 100ms) drives `drainDeferredEnterSlice(state, sector, 4ms, holdEpoch)`. At hold end (`:3013-3044`) a live queue re-arms the hold in ≤0.25s beats under a 2s `_seamDeferredExtendS` budget; past that, `_seamDeferredDrain` retires the tail at 4ms/frame (`:3046-3071`). Foreign-epoch heads are never stepped by a stale owner (double-checked at both sites).
- **Slice drain itself** (`sectorEnterDefer.js:127+`): steps entries under `budgetMs` **and** the shared `pacedFrameSpend() < PACED_FRAME_BUDGET_MS` ledger, holds each provider's iterator across beats, min-1-step progress guarantee, dead-epoch sweep first, clock/tick pinning so deferred providers stamp the emit's own time.
- **Hard-enter path:** `prepareLiveSectorAfterJump` census splice (`renderer.js:17045+`) runs the FIFO under `SECTOR_ENTER_LISTENER_BUDGET`; providers are all `*Steps()` generators (enumerated: aceMemory, aftermathWrecks, asteroidSites, automation, factionPresence, heistFacilities, intervention, latchNine, missions, morrow, ravel, recoveryEncounter, rubric, ruckus, ruud, salvage, solstice, survivorPod, traffic, uniqueWrecks, vesper, wingmen — every one returns a chunked iterator).
- **Atomic path exists but is unreachable during presented flight:** `drainDeferredEnterMaterializers` (whole-queue inline) fires only when `state.mode !== 'flight'` or `sectorShellAdmission !== true` (`renderer.js:16882-16891`) — i.e., exactly when no drain owner can run and no frame is being presented into the transition. It restores pre-deferral semantics where hitches are unobservable.
- **Residual observation (not a finding):** the min-1-step guarantee means a single fat `iterator.next()` could brick a slice — but every provider is a chunked generator and no evidence of a monolithic step exists. Watch only if a future provider returns a non-generator body.

### (d) classifyWorld shelved-index probe — see finding F1

Probe answered: **no existing index enumerates shelved in-list entities** (entityIndex lanes are type-keyed; farActorTable rows are non-entityList records; `signaturesById` is the walk's own output). The avenue is confirmed as the only one, and refined from W124's "L-effort new structure" to an **M-effort incremental cell-map over position-frozen shelved members, maintained at stamp transitions inside the visit republish** — details in F1.

---

## Regression notes (wave-124 machinery at `664985df7`)

All verified PASS:

1. **`frame()` post-finally tail quarantine** — `presentationRunner.js:1297-1346`: perf calls + tier1 samplers wrapped in own try/catch with `frame._tailErrs` 20-cap ledger; post-finally `checkGraphicsRecovery`→`mustRescheduleAfterFrame`→restore-block in own try; `schedule()` unconditional at :1346, no-ops on destroyed/suspended/live handle. `frameLiveness.js:127-130` `mustRescheduleAfterFrame` returns false only on `destroyed === true`.
2. **saveSystem paced chain** (re-verified per W123 spot-check requirement — saveSystem touched by W124): `_queueSharedStoreMirror` (:573) patch-merge + setTimeout flush, generation-bracketed `_collectSharedStoreKeysChunked` (:492) with 3-attempt then sync fallback; `_writeSlot` mirrorPatch shape (:1870-1873) preserves recoveryKey/backout semantics; `_publishSaveResult` (:1981); `deleteSlot` mirror patch (:2663-2666); `_encodeEnvelopeViaWorker` (:3363-3437) sliced under `AUTOSAVE_TARGET_SLICE_MS`, superseded-runEpoch bail, verbatim named-verdict propagation, sync-fallback arms for infra reasons; `_runPacedSaveChain` (:1484-1673) abort ladder + `endFocusLossSaveWrite` in `finally`. All intact.
3. **resourceGovernor `selectEvictions`** (:306-407): stamped-row skip, consumable `memoryUnitOwners`/`blockedRows`/`blockedReasons` via options, lazy `initialResidentBytes`, decorate-once `evictionPriority`, `unitIdsByIndex` injectable, last-holder unit-byte release. Intact.
4. **assetResidency rotate-deferral** (:1791-1874): `effectiveCurrentSectorId` prefers `pendingSectorTarget`, `appliedRotateSeq` repoint gate, `repin()` consumes queued seqs, `hasPendingRotate` cleared only on `pendingSectorTarget === exactNext`. Intact.
5. **eventBus presentation machinery** (:186-568): `presentationSets`/queue, `PRESENTATION_LISTENER_DRAIN_BUDGET = 8` under `claimPresentationDrain()` (unclaimed = inline identical), `PRESENTATION_PRIORITY_EVENTS` entity:destroyed interleave-8, `PRESENTATION_ONCE_ONLY_EVENTS` entity:spawned shed floors, `payloadSnapshots` for pooled payloads, `pendingSlicedEmits` cap 8, `busErrorRows` storm dedup. Intact.
6. **W123 corpse gating + diag quarantine** — untouched by W124 (verified W124 touched none of those hunks); spot-check satisfied.

No W124 self-defects found.

---

## Hardware-unverified items (owner: verify via `design/perf/scoreboard.json` commands)

- **H1 (F1 magnitude):** classify-pass wall time on a fat sector during flight — measure `classifyWorld`/selectClassify span with a large entityList (K-class rock field + stations) on real GPU hardware; the probe proves the structure deficiency, not the ms. Compare before/after a shelved-hash prototype if attempted.
- **H2:** SG-02 contact-burst fan-out cost on real hardware (`_diag.rapierContacts` spike ticks × ~20 sim listeners) — enumeration proves no retaggable consumer, not that the sim-side burst is below budget.
- **H3:** Seam-beat drain pacing on real GPU (`drainDeferredEnterSlice` 4ms beats during continuous enter) — verified paced in code; confirm the beats don't overrun `PACED_FRAME_BUDGET_MS` under a fat cohort on hardware.

## Deferred/WONTFIX honored

Not re-reported: F4/F5/F9 tick-paced emit slicing (determinism contract — listener classification surgery); F6 combat:damage payload intern; preexisting clean-master test failures per prompt list; deliberately-atomic items (on-glass residency prepareBatch, shadow-depth session slice, vf.build single-row, urgent single-root whole-batch compile).
