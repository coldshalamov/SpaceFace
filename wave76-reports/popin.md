# Wave 76 audit — popin-admission lane

- HEAD audited: `243c889a3` on `devin/1791064509-perf-w60` ("perf: wave 75 — coverage-ledger attribution gaps, ghost drift/transient-hides, unbounded warm legs").
- Lane: coverage-attribution edges in the swarm warm / coverage-ledger machinery.
- **saturated: false** — contract-preserving wins remain (findings 1-4 are all implementable without touching visible quality or sim determinism).

## Findings (ranked)

### 1. Lazy-mint coverage seed over-claims after a mid-run restore — impact M, effort S-M

**Evidence:** `src/render/renderer.js:17283-17289`. When `_swarmWarmCoveredEnemyIds` isn't a Map, `_warmSwarmDeferredRoster` seeds `new Map([...swarmEligibleEnemyIds(run.wave || 1)].map(id => [id, 1]))` — claiming coverage for every wave-N-eligible enemyId.

**Mechanism:** the inline premise — "every hull the cleared waves could field already spawned — and linked — in the rounds played" — fails for three classes:

- weighted-rare roster picks eligible since wave X but never rolled into a spawn;
- schedule/package entries whose `atTick` lands after the saved tick (a mid-wave restore leaves that wave's late packages unspawned);
- hulls that spawned but never linked (killed before their authored attach resolved, or never drawn).

For any of those the seeded row reads `covered=1`, the deferred fresh filter skips it (`covered > claims`, renderer.js:17314-17320), and the id is never warmed again — its first post-restore spawn pays decode + compose + program link inside the round: the exact pop-in class the ledger exists to kill. Trigger is narrow (a restore path that reaches `run:wavePlanned` without a cook — whenever the launch warm runs it seeds the ledger honestly) but real, and the mint is indistinguishable from earned coverage forever after.

**Fix sketch:** seed the lazy ledger only for ids with residency evidence — intersect `swarmEligibleEnemyIds(run.wave)` with enemyIds whose hull files appear among `peekSettledAuthoredEntries(renderer)` settled records (file-level mapping already exists in the exemplar spec table), or with the run's materialization census; leave unproven ids fresh so the next deferred warm covers them. The seeded ledger only needs to suppress ids that genuinely cannot pop in.
**Risk:** low — conservative seeding can only warm more ids, never fewer.

### 2. Deferred-warm tail legs have no watchdog — a never-settling compile/residency leg pins the warm root for the run — impact M, effort S

**Evidence:** the attach settle is deadline-raced (`settleDeadlineAt`, renderer.js:17584-17597) and the draft-gate record flips `pending:false` at that deadline via a wave-guarded timer (17697-17705). But `warm.building` / `root.userData.warmBuilding` clear only in the chain tail (17686-17695), which runs after `_mintDeferredPaletteSubjects` → `compileObjectPipelines` → conditional `prepareAuthoredGpuResidency` all resolve. A leg that neither resolves nor rejects — the same "hung decode/lease" class the attach deadline exists for — leaves `building=true` forever.

**Mechanism:** with `warmBuilding` stuck the root is skipped by every park sweep — an invisible multi-thousand-node subtree pays `updateMatrixWorld` in every presented frame — and `isResidencyOwnerActive: () => warm.building === true` pins the warm's decode leases for the rest of the run. The draft gate already reads `pending:false`, so the debt is silent. Verified safe in the same machinery: wave N+1 minting while wave N legs run detached is handled (wave-guarded record writes, per-warm ref-counted release math at 17370-17400 + 17444-17458) — this is purely the unbounded tail.

**Fix sketch:** extend the deadline to the flag, not just the attach race — at `settleDeadlineAt` force `warm.building=false` / `warmBuilding=false` so the root can park while detached legs finish; late attach drops are already contract-tolerated via `boundaryBelongsToScene`.
**Risk:** low-moderate — forced parking must tolerate in-flight residency legs (already does for deadline-expired attaches).

### 3. Capital-score wing archetypes sit outside the deferred-warm union — defended today, latent guardrail gap — impact L (M as guardrail), effort S

**Evidence:** the union at renderer.js:17296-17305 covers `plan.swarm.roster`, `plan.schedule`, `plan.packages`, `plan.swarm.newcomer`. Crucible boss waves can bind `plan.swarm.bossScoreId` (swarmMode.js:1094-1099; SWARM_BOSS_ROTATION `enemyId`+`scoreId` rows at swamBossFor w20 `capital_boss_foreman`, w30 `capital_boss_regent`, w70 `capital_boss_brood_queen`, w80 `capital_boss_tendril`), which fires `capitalBoss:start` mid-wave (survivalWave.js:463-473) and lets `capitalBossRuntime.spawnWing` mint members via `makeEnemySpawnSpec(member.archetype)` — ids declared only inside the score's wing table (`src/data/encounters/capital-boss/*.js`, `wings: [{ atAct: 1, members: [...] }]`).

**Mechanism:** every crucible-reachable wing member today is a SWARM_ROSTER id whose static `fromWave` is far below its boss wave (foreman w20: warden_escort f9 + wasp_swarmer f1; regent w30: + choir_zealot f4; brood_queen w70: wasp×2; tendril: `wings: []`), so launch/deferred coverage happens to catch them — zero exposure today. The hole fires the moment a score fields a member whose `fromWave` exceeds the boss wave, or a non-roster id: the union can't see it, and `warmCapitalBossWingDecode` is not a reliable backstop — every wing is `atAct: 1` and `wingRequested` runs `spawnCapitalBossWing` synchronously in the same tick, while that lane only sees the fight record on its next residency poll, which can lose the race outright. The result is a pop-in at a scripted drama moment — the maximally visible instance of the class.

**Fix sketch:** when `plan.swarm.bossScoreId` binds, union `capitalBossWingRosterRows(scoreId)` into `eligible` inside `_warmSwarmDeferredRoster` — the helper is already imported for the wing decode runway. Optionally assert at plan-validation time that wing member archetypes are covered.
**Risk:** low — pure additive coverage.

### 4. Launch-lane in-flight first kicks that settle failed after the re-kick window release coverage with no retry — impact L, effort S

**Evidence:** `collectReKicks` skips kicks whose `entry.result` is still `undefined` (renderer.js:16897-16900) — in-flight at the census. The first kick's `.then` (16361-16366) only writes `entry.result` and runs `unmarkOnRetriableOutcome` — releasing coverage on a retriable outcome whenever it lands, with no retry once both collect passes have run.

**Mechanism:** a first kick settling failed after the last `collectReKicks` pass drops its coverage row; the archetype re-enters `fresh` only at the NEXT wave's deferred warm — so it can spawn cold inside wave N (in particular a wave-1 archetype, for which no deferred dwell has run yet) or early in wave N+1 while the dwell warm still builds. This is the same covered>claims read class the wave-75 claims ledger fixed — first kicks simply mint no kickClaims, so the in-flight row reads trusted. Exposure is narrow: the kick must outlive the whole decode window, then fail, then the archetype must spawn before the next dwell lands.

**Fix sketch:** on a late-settled retriable outcome for a launch first kick, dispatch one bounded re-kick immediately (mint `kickClaims` + covered like `makeDeferredWarmKickRetry`), or run one trailing collect pass over still-in-flight `warm.retriableKicks` before `warm.building` clears.
**Risk:** low.

## Hunt results — the four enumerated edges (prompt line 41)

**(a) Launch-lane re-kick claims — closed at HEAD.** `collectReKicks` mints `kickClaims.set(enemyId, +1)` alongside `covered.set(+1)` (renderer.js:16910-16915), guards `entry.reKicked` (two strikes), and settles release via `releaseClaim(enemyId, claimed, kickClaims)` with the claims map captured at mint time (16879-16893). A launch retry outstanding across a wave boundary therefore reads `covered <= claims → fresh` in the deferred filter (17314-17320): the deferred lane takes the row (duplicate-warm, safe direction), and once its exemplar lands the row settles covered — self-healing, no permanent pop-in. Residual: the pre-claims first-kick tail is finding 4.

**(b) Detached-leg shared-key collisions — handled, one watchdog gap (finding 2).** Wave N's detached legs write only wave N's own `root`/`warm` closures; every shared map is ref-counted or guarded: `swarmDeferredWarm` record writes are `record.wave === nextWave`-guarded in BOTH the tail (17691-17695) and the gateTimer (17699-17703) — a superseded record can't be flipped stale; per-warm accounting (`unmarked` + `retryMintCounts`/`retryReleasedCounts`, 17370-17400 and 17444-17458) bounds each warm's decrements to exactly its own mints, so wave N's late `unmark()`/`unmarkEnemy` cannot eat wave N+1's fresh marks; claims releases ride the claims-map instance captured at dispatch, so a `run:ended` re-mint is never touched (15115-15117). `makeDeferredWarmKickRetry` itself is `warm.building`-gated (17417), so wave N can't mint fresh claims after teardown. Unguarded residue: the never-settling tail leg — finding 2.

**(c) Eligibility producers outside the plan union — enumerated; defended today, one latent hole (finding 3).** Producers minting hulls inside a swarm wave: (i) `materializeWaveBatch` — schedule/package ids → unioned; (ii) `_reinforceSwarm` stream — `pickSwarmArchetype(wave, rng(), this._swarm.roster)` honoring plan-declared `fromWave` → unioned via `plan.swarm.roster`, and non-canonical entries drop at pick so the union can't under-cover stream picks; (iii) heavies_only — HEAVIES_ONLY_ROSTER stamps `fromWave:1` on canonical ids the static table only unlocks at 10/18/22 (bruiser_brawler/corsair_raider/field_anchor_controller) → plan.roster union (the real prior hole W75 closed); (iv) boss/champion packages → plan.packages (trickId stamps ride the package body — no extra hulls); (v) swarm-elite splitter — `wasp_swarmer` (f1), covered; (vi) brood mites — procedural `drone` entities, not enemyId hulls (n/a); (vii) swarm events — pickup pods only (n/a); (viii) capital-score wings — score-internal archetypes, NOT in plan → finding 3; (ix) `decorateWeeklyPlan` adds no ids, and `plan.systemEvent` is recipe-path only (planner.js:715) — swarm plans never carry it. `plan=null` on the warm path: the sole `run:wavePlanned` emitter (survivalRun.js:444) always carries a real plan, so plan-null only fires on malformed/custom emits — the static-table fallback is conservative and fine.

**(d) `pendingAttachmentResults` lifecycle — clean.** Minted per `_warmSwarmDeferredRoster` call (17343); each tracked kick writes `pendingAttachmentResults.set(kicked, value)` on settle (17516/17547) keyed by the same tracked-promise object pushed into `warm.pendingAttachments`; read exactly once at 17612 inside the timedOut branch, index-aligned with `pendingAttachmentEnemyIds`/`pendingAttachmentRetries`; never cleared, spliced, or replaced — GC'd with the closure. `pendingAttachments` cannot grow after `buildReady` resolves (all pushes are inside the build leg; re-kicks ride a separate array), so the timedOut bound can't run off the end. Subtlety verified: `track()` wraps in `Promise.resolve(p).catch(() => null)` and the map keys the WRAPPED promise — the identical object the timedOut loop reads.

## Regression notes on landed waves — W67 machinery verified concretely at HEAD

1. **Deadline-bounded arm** (`SHADOW_DEPTH_ARM_COLLECT_MS=4`, `_RESTORE_MS=4`; arm body renderer.js:21961-22300):
   - (a) min-1 progress is real: the collect loop breaks only after ≥2 roots (`collected >= 2 && armNow() >= collectDeadline`, 22061-22066); restores break only after ≥1 restored (`restored >= 1 && restoreIdx + 1 < slice.length && armNow() >= restoreDeadline`, 22265-22268). A fat slice can't starve the drain: slice cap `min(32, max(8, ceil(N/2)))` (22033) bounds the ceremony and un-reached roots requeue still-withheld.
   - (b) requeued roots keep withheld flags and re-collect fresh next arm — skipped roots `pending.set(root, entry)` (22067-22070); `legSet`/`unstagedByRoot` are arm-local.
   - (c) `slice.splice(collected)` requeues the same `{root, entry}` objects — `{lodLevel, entity}` preserved verbatim.
   - (d) `notePacedFrameSpend(armNow() - armStartedAt)` runs in `finally` (22289); `armStartedAt` mints at callback top (21964) so the pending sweep, sort, census traverse, session mint, private render and restore all debit.
2. **Undrawable parking** (`_parkedDepthStageRoots`):
   - (a) parked roots count as queued (`parked` → `queued`, 21777-21778) → `band!==1 && queued` stamps `allowCast:false` (21860-21861) — stays withheld whole-tree; the band-1 cached-reuse branch (21862-21872) only re-stamps withheld flags, never un-withholds.
   - (b) a genuine `dirtySeq` bump (also light-sig / ortho-cell drift, 21762-21775) unparks BEFORE the queued read — park deleted, `sfDepthUndrawableCycles` cleared, `parked` recomputed — so both non-empty and empty collect flows run the normal withhold-or-restore path.
   - (c) parked + fresh empty collect → explicit release at 21849-21855: park entry, withheld set and cycle counter all deleted; the normal sync restores live flags.
   - (d) arm-time parked sweep drops detached roots (22013-22024) including `STAGE_SELF_DIRTY_KEY`/`_withheldDepthCasters` cleanup.
   - (e) leftover with meshes NOT offered to the leg → `pending.set(root, {lodLevel, entity}); continue` (22221-22223) — requeues, never parks; only the all-offered case parks (22189-22220) with geometric recheck backoff `(96+stamp%32) * min(8, 1<<(cycles-1))`.
3. **Paced-ledger routing** — every slicer consults `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` post-step/post-minimum and debits `notePacedFrameSpend`:
   - enumerated sites: reconcile pump post-step (2134), residency poll post-step (2181), hold-exempt collect post-step (2558), commit enqueue/kick pumps `commitBounded && commitSteps > 0` → ≥1 step per beat (2605/2624), remint gates (2641/2655), `drainDeferredEnterSlice` `steps === 0 ||` (src/core/sectorEnterDefer.js:155), `drainEmitSlice` + `drainPresentationTail` post-listener (src/core/eventBus.js:345/398), `_drainMeshBuildQueue` via minItems-before-ledger ordering in `shouldContinueAdmissionSlice` (src/render/admissionSliceBudget.js:34-38 + renderer.js:19201).
   - Wholesale skips exist at exactly two entry gates, both sound: `drainDespawnDisposeQueue` (renderer.js:1817-1821 — `skips < MAX_SKIPS → skips++, return 0`; queue/head untouched so entries can't drop; 2-skip aging cap then a forced bounded slice) and `_armDepthStage`'s paced defer (21980-21985 — re-arms one frame later under `_depthStageLedgerSkips`, queue preserved). Neither loses work.
   - Wallet semantics verified (src/render/decodeTaskBudget.js:54-100): epoch-keyed on the present boundary — a >8ms frame keeps accumulating under one epoch (no under-report on long frames), a slice after a frame boundary reads fresh; headless/stale-pump (>250ms) falls back to the 8ms wall-clock window so a frozen rAF can't read permanently over-budget.
4. **Flag-only OFF→ON collect** (`_stageShadowDepthOnSettingEnable`, renderer.js:22309-22395):
   - (a) withheld-but-already-staged resolves: the arm's per-root signature collect returns `[]` → no leftover → restore clears `_withheldDepthCasters` and full `syncShadowCasterPolicy` re-applies live flags (22154-22250) — no permanent withhold for already-linked casters.
   - (b) over-withhold resolves: the withheld set is a superset of genuinely-unstaged; `leftoverByRoot` re-proves CURRENT mark tuples per mesh (22130-22147) — only still-unmarked meshes re-force; staged siblings restore in the same pass.
   - (c) exclusions identical: `collectUnstagedShadowCastersFlag` and `collectUnstagedShadowCasters` both funnel through `collectPotentialShadowCastSubjects` (src/render/shadowDepthAdmission.js:299-307 / 415-428) — `spacefaceNoShadow`/`sharedContactShadow`/`authoredReadableFallbackLayer`/`materialCanCastShadow` applied once in the shared base.
5. **`reset:true` prepare defer** (src/core/physics.js):
   - (a) `_disableSg02DynamicAuthority` in `!_sg02Init && !_sg02` is a true no-op — the token bump is gated `if (this._sg02 || this._sg02Init) this._sg02Token++` (771-773); the dead-state call touches only diag zeros + null fields.
   - (b) a caller abandoning its wait doesn't cancel the async continuation — the post-sleep continuation completes `prepareBackend` and mints for the next click (386-400).
   - (c) concurrent deferred prepares can't interleave mints: post-sleep `sg02TokenAtDefer !== _sg02Token` → adopts the winner's in-flight init (388-400); `token = ++_sg02Token` at mint (575); stale tails bail `sg02TokenAtPrepare !== _sg02Token → return false` (438-440).
6. **Variant interning** (`_depthVariantCache` WeakMap, src/render/shadowDepthAdmission.js:364-390):
   - (a) alphaTest 0→1 flips bit 0 → `cached.bits.every` fails → re-mints.
   - (b) side/shadowSide feed bits verbatim (`material.side`, `material.shadowSide` numerics — 0/1/2 distinct).
   - (c) needsUpdate-style reuse can't serve stale: any mutation inside the 10-input discriminant set re-mints; mutations outside it legitimately share the variant (they can't change which depth program links — the set mirrors `getDepthMaterial`'s clone rules).

**W67 verdict:** all six mechanisms hold at HEAD — no regressions found.
