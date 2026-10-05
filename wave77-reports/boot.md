# Wave 77 audit — boot-loading lane

Audited HEAD: `275668d3d` on `devin/1791064509-perf-w60` (W76 head). Lane: frozen or stalled loading screens. Contract: zero visible quality degradation; sim determinism bit-identical (golden `892f88c9...`). Probe measurements are CPU-only JS on this Windows box — per the SwiftShader caveat, no GPU-cost conclusions drawn from wall timings.

`saturated: false`

## Ranked findings

### F1 — `begin()`'s exemplar build block is one ~120–250 ms synchronous task inside the launch path

- **Evidence**: `src/render/renderer.js:16259–16279` (spawnable 19 + wreck 8 `this.vf.build` loop), `16354–16405` (shipSpecs builds + kicks), `16411+` (hulk builds). Callers: `_beginEarlyCrucibleRosterWarm` at `16689` (synchronous inside the `game:scenePrepared` listener — blocks sibling emit listeners and the shell's rAF paint), `_beginMenuCrucibleRosterWarm` at `16731` (menu dwell), cook's own begin at `12797`, and `_topUpEarlyCrucibleWarmPlayerSpec` at `16762` (one whole-ship build when reusing a staged warm).
- **Measured** (node probe, `vf.build` per spec): cold total **120.1 ms** across 27 procedural exemplars — `wreck:0` 41.8 ms, `spawnable:vectormine` 29.9 ms, `wreck:reactor` 18.6 ms; warm-cache repeat 27.6 ms. Plus ~2–4 whole-ship exemplar builds (`shipSpecs` + `hulkExemplarSpecsForShips`) at ~5–40 ms each → realistic single block **~150–250 ms**; on the owner's iGPU-class CPU plausibly ~0.3–0.6 s — a visible dead task in the boot chain (progress shell stalls; the emit's later listeners and the load chain's next leg all wait).
- **Mechanism**: the deferred lane `_warmSwarmDeferredRoster`'s `buildReady` continuation (`17570+`) paces the *identical* `vf.build` work on `buildTick - sliceStartedAt > 4 || pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` with per-slice `notePacedFrameSpend` — but `begin()` never adopted it. `options.yieldToMain` is already plumbed into every call site (`16690`, `16732`, `12798`) and never read by `begin()` — the pacing seam exists unused.
- **Fix sketch**: keep `begin()` synchronous for the shell contract (root mounts at `16229` before any build — all callers only need `warm.root`), mint `warm.buildsReady` = a paced async continuation driving the three spec loops on the deferred lane's exact pattern (slice-or-ledger → `notePacedFrameSpend` → `yieldStep`), kicking `requestAuthoredUpgrade` per iteration as today. `finish()` joins `warm.buildsReady` inside its existing bounded decode wait (budgetLeft already caps); `_armCrucibleWarmBuildingSettle` already tolerates post-snapshot `pendingAttachments` pushes (re-arms at `16851`).
- **Effort** M · **Magic-frame impact** H (the only remaining >100 ms monotask in the launch path; directly the "frozen loading screen" class this lane hunts) · **Risk** M — ordering: a cook reaching `finish()` while builds are queued must join them before the compile census or the late-mounted exemplars link in flight; the join is bounded by `budgetLeft()` but must be added, not assumed.

### F2 — One unsliced collect+dedupe block between awaits in the cook tail, plus a per-material skipReady-before-dedupe defect

- **Evidence**: `src/render/renderer.js:13004` `collectInstancePoolCompileRoots(scene)` (whole-scene traverse); `13018–13023` `cookCompileRoots.flatMap(collectCompileSubjects)` + `collectCompileSubjects(scene)` (a *second* whole-scene traverse); `13031–13034` `uniqueAdmissionUnits(subjects, { skipReadyMaterial: materialAlreadyLinked })`. The ordering defect: `src/render/openingGpuAdmission.js:278` calls `skipReady(material)` **before** the `seenMaterials` dedupe at `279` — on a survival cook with thousands of palette subjects sharing ~hundreds of unique materials, `materialHasCompiledProgram` (`renderer.properties.get` per call) runs per subject×material instead of per unique material.
- **Measured** (synthetic 21k-node scene): `collectInstancePoolCompileRoots` 7.7 ms, `collectCompileSubjects(warmRoot)` 2.8 ms, `collectCompileSubjects(scene)` 3.4 ms, `uniqueAdmissionUnits` w/ skipReady **18.2 ms** → **~32 ms** in one block. The unique pass dominates and scales with subject×material count, not unique materials.
- **Fix sketch**: (a) reorder `uniqueAdmissionUnits` — `seenMaterials.has(material)` check before `skipReady(material)`; `skipReady` is a pure read-only predicate (`properties.get` + currentProgram check) so the reorder is output-identical; (b) fuse `collectInstancePoolCompileRoots` + `collectCompileSubjects(scene)` into one traverse collecting both (both read-only walks of the same scene, back-to-back); (c) optionally wrap the whole unit-construction block in the same 4 ms/ledger slice pattern if profiling shows the fused cost still bites on real sector scenes.
- **Effort** S · **Impact** M (~32 ms measured on synthetic scene; real cooks carry more subjects) · **Risk** L.

### F3 — Census skip-continues bypass the slice/ledger check; row-internal awaits over-debit the census

- **Evidence**: `src/render/renderer.js:17119` (`if (!record) continue`) and the non-launch-eligible-hull `continue` at ~`17130` both bypass the pacing check at `17271–17277` — a `records` array dominated by skipped rows runs an unsliced prefix. Bounded: skipped rows are ~µs each (cacheKey split + `normalizeFile` regex + Set lookups), so ~200–500 skipped records ≈ 1–3 ms — minor.
- Also: the debit `notePacedFrameSpend(censusTick - censusLastDebitAt)` at `17273` measures the whole span since the last debit, **including** row-internal `await`s (`retainForInstance`, `warmRenderPackageShipPool`) where *other* tasks ran — an over-debit. Direction is conservative (the census yields sooner, not later), so it costs the cook a few extra yields rather than causing a stall — note, not a defect.
- **Fix sketch**: hoist a cheap `skippedRows++` accumulator and pay the pacing check every ~32 skipped rows, or run the pacing check before the continues.
- **Effort** S · **Impact** L · **Risk** L.

## Lane hunts — verdicts

**(a) Census slice resumption — correct.** The `for (const { cacheKey, record } of records)` loop at `17117` persists iterator state across `await yieldStep()` — no row is processed twice or skipped on resume. `censusLastDebitAt` resets at `17276` after each yield, so the residual debit at `17282` (`censusNow() - censusLastDebitAt`) measures only the un-debited tail — no double-count; the yield gap itself is excluded. Skipped rows are evaluated-and-skipped (processed), not dropped unseen — see F3 for the residual.

**(b) Next unsliced leg after the census — enumerated.** Inside `finish()` post-census: `crucibleWarmProgress` mint (`17295–17318`, ~22 kicks × string ops — trivial); `releaseAuthoredAssetResidency` closure (trivial). The re-kick collect the prompt names (`collectReKicks` at `16969–16978`) is ≤ ~22 rows of O(1) Map ops + async dispatch via `_mintWarmReKick` (`16873–16921` — covered/kickClaims mints + `retryFailedAuthoredAdmission` + `reKick(1)` promise dispatch; sub-ms/row) — not a finding. Pre-census legs: `peekSettledAuthoredEntries` (~µs/row O(registry) walk, `assetLoader.js:1172`), `poolWitnessPalettesForState`/`rosterPoolWitnessFilePalettes`/`spawnableShipArchetypePrewarmUrls` — all trivial. **The real next unsliced legs are F2** (cook caller) and **F1** (begin, upstream of finish).

**(c) Dead-probe class — clean.** Enumerated every `userData.KEY === true` read repo-wide (28 keys): all trace to literal-boolean writers (via `data.`/`ud.`/object-literal aliases). `resolvingMarker` was the only dead leg — W76's `crucibleGhost.js:155` now reads `authoredResolvingMarker === true`, whose writers store `true` (`visualOverrides.js:230,304,337,352,468,746`). Spot-verified the named suspects: `admissionStandInPending` (`= true/false` at `visualOverrides.js:461,673,676,690,695,727,735`), `authoredAdmissionSubstrate` (`= true` at `706`), `precompileProbe`, `decodeWarm`, `legacyPart`, `nonRender`, `playerOwned`, `playerCollectOnly`, `ceresActivityAmbush` (entity.data boolean at `encounterDirector.js:2908`), `ceresActivityJobOwned` (`= !service` booleans). Zero remaining instances.

**(d) crucibleGhost defer — sound.** Probe tick = per-presented-frame player-mesh sync at `renderer.js:20178–20179` (inside renderEntityFrame's player branch) — it advances only while the player hull presents; under `mode !== 'flight'` there are no ticks *and* no ghost presentation, so a frozen counter can't wedge anything visible. `GHOST_MINT_DEFER_MAX = 60` (`crucibleGhost.js:51`) closes the `mintDefers < MAX` gate after ~1 s of presented frames → the clone mints regardless — permanently bounded. Probe clears when the marker detaches (`detachBoundaryResolvingMarker`, `visualOverrides.js:602–630` — removes node + purges `authoredResolvingMarker` stragglers) or `admissionStandInPending` clears (`upgradeAdmissionStandIn` :649). Self-heal: the authored commit changes `playerMesh.children` membership → drift re-mint (139–148). Residual: a host whose admission-hidden window outlives 60 presented frames mints mid-window (clone captures a transient `visible=false` subtree); recovery then relies on the commit's top-level child change — holds for authored commits (`boundary.add`), unproven only for deeper-only mutations (none found).

## W67 machinery — regression verification (all items verified present and correct)

**Deadline-bounded arm** (`renderer.js:22080–22436`, `SHADOW_DEPTH_ARM_COLLECT_MS=4`/`SHADOW_DEPTH_ARM_RESTORE_MS=4` at `6030–6031`):
- (a) min-1 real: collect loop breaks only when `collected >= 2` past deadline (`22199`) → ≥2 roots/arm; restore breaks only `restored >= 1` past deadline (`22398`) → ≥1 restore/arm. Over-cover escalates `entry.depthNodeScale` ×2 (cap 8, `22193`) — a permanently-fat root grows its own budget rather than starving the drain.
- (b) Requeued roots keep `_withheldDepthCasters` untouched (`22203`); `legSet`/`leftoverByRoot` are per-arm locals — no stale-set leak.
- (c) `slice.splice(collected)` carries `[root, entry]` tuples into `pending.set(root, entry)` (`22202–22203`, `22348`) — `{lodLevel, entity}` preserved verbatim.
- (d) `notePacedFrameSpend(armNow() - armStartedAt)` at `22423` in `finally` — `armStartedAt` stamped at callback top (`22086`), so the debit covers pending sweep + parked sweep + sort + census + private render + restore + requeue.

**`_parkedDepthStageRoots` parking**:
- (a) parked counts as queued: `queued = pending.has(root) || parked` (`21901`); the `band!==1 && queued` branch forces `allowCast:false` (`21986`) — re-stamps withheld flags, cannot un-withhold; band-1+selfDirty+queued takes the cached re-stamp (`castShadow=false` per cached mesh, early return `21997–22000`).
- (b) dirtySeq bump → `parkedRelease` deletes the park at `21897` before the collect; non-empty collect deletes again defensively at `22028` and withholds fresh; empty collect deletes at `21977`.
- (c) parked root collecting `[]` → `21973–21979`: park deleted, `_withheldDepthCasters` released, `sfDepthUndrawableCycles` cleared — live flags restored by the ordinary sync below.
- (d) arm-time parked sweep `22135–22146` drops detached roots and clears `STAGE_SELF_DIRTY_KEY`/`sfDepthUndrawableCycles`/`_withheldDepthCasters` — same bookkeeping as the pending sweep.
- (e) leftover root with some meshes beyond the leg → `!allOffered` → `pending.set(root, {lodLevel, entity}); continue` (`22347–22349`) — requeues to pending, never parks.

**Paced-ledger routing** — min-1 enumeration (all post-step or minItems-gated):
- reconcile loop `2133` (post-`iterator.next()`), residency poll `2180`, hold-exempt collect `2557`, commit enqueue `2604` + kick `2623` (pre-step but gated `commitSteps > 0` → ≥1 per beat; `commitSteps` is shared across the two pumps so the second pump can take 0 on a spent beat — its owner-held iterator resumes next beat with `commitSteps=0` → min-1 across beats), remint gates `2640`/`2654` (post-work, defer remint only), `drainDeferredEnterSlice` (`sectorEnterDefer.js:154`, `steps === 0 ||`), `drainEmitSlice` (`eventBus.js:349`, post-listener), `drainPresentationTail` (`416`, post-listener), `_drainPendingMeshBuilds` (`19316` via `shouldContinueAdmissionSlice` — `itemsDone < minItems` checked *before* the ledger at `admissionSliceBudget.js:37–38`), depth-arm pre-check `22103` (a second wholesale-skip site alongside despawn — but self-rescheduling and `SHADOW_DEPTH_LEDGER_MAX_SKIPS=2`-capped at `6037`).
- (b) despawn entry-gate `1817–1822`: returns 0 without touching the queue (queue only truncates on full drain at `1844`); after `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS=2` (`1806`) it drains anyway — bounded defer, no drops.
- (c) 8ms-window semantics: browser hosts key the wallet on the lazily-armed rAF epoch (`decodeTaskBudget.js:65–82`) — spend minted under an older epoch is invisible to a new frame, and all slicers within one presented frame share it (no under-report on long frames). The wall-clock fallback engages only when the pump is >`PACE_EPOCH_STALE_MS`=250 ms stale (`80`) — i.e., headless/occluded hosts with no presented frames to protect; the >8ms re-key there is the documented legacy behavior.

**Flag-only OFF→ON collect** (`_stageShadowDepthOnSettingEnable` `22448–22553`; `collectPotentialShadowCastSubjects` `shadowDepthAdmission.js:178`):
- (a) an already-staged mesh re-collected-unstaged-empty in its arm takes the normal restore (`syncShadowCasterPolicy` at `22373–22387`, withheld set deleted `22363`) — no permanent withhold.
- (b) withheld set containing still-staged casters → arm collect returns `[]` → `leftover` undefined → same restore — resolves.
- (c) exclusions identical by construction: both collectors call `collectPotentialShadowCastSubjects` (`:302` and `:430`), which owns `spacefaceNoShadow`/`sharedContactShadow`/`authoredReadableFallbackLayer`/`geometry==null`/`materialCanCastShadow`. W71's twin (`collectUnstagedShadowCastersFlag` at `22477`) keeps already-staged casters out of the withhold entirely — mark-current meshes never enter `unstaged`.

**reset:true prepare defer** (`physics.js:383–425`):
- (a) `_disableSg02DynamicAuthority` (`771–785`) bumps `_sg02Token` only `if (this._sg02 || this._sg02Init)` — in the `!_sg02Init && !_sg02` defer state it is a true no-op (diag field resets only) — nothing for a later minted authority to fight.
- (b) a caller abandoning its ~20 s wait still mints the backend: the prepare's own continuation reaches `_updateSg02DynamicAuthority` (`426`) which mints `_sg02Init` synchronously (`575–620`) regardless of the caller's await — the next click joins at `427`.
- (c) concurrent deferred prepares can't interleave mints: the defer captures `sg02TokenAtDefer` (`386`); a winner minting during the sleep bumps the token → losers adopt the winner's `_sg02Init` via the bounded race (`394–406`) or return false. Two prepares both surviving the token check serialize at `426`'s synchronous mint — the second sees `_sg02Init` non-null and joins instead of minting.

**Variant interning** (`shadowDepthAdmission.js:364–391`):
- (a) `alphaTest` 0→1 flips `bits[0]` → `cached.bits.every` mismatch → re-mints.
- (b) `side`/`shadowSide` feed verbatim numerics (`null`→0 normalizes to three's FrontSide default — same variant, correct); W73's 10-bit form adds `alphaHash`/`vertexColors`.
- (c) WeakMap keyed on the material object — `needsUpdate`-style in-place reuse recomputes bits at read → mismatch → fresh mint; a stale variant can't be served.

## Notes

- No new instances of adjudicated/KNOWN-DEFERRED classes were found; F1–F3 are mechanism-level residuals exposed by W74–W76's own pacing pattern (the deferred lane proves the fix shape works for identical work).
- Node probe scripts used for the measurements were removed before this commit; the audit working tree is clean.
