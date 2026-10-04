# Wave-74 audit report — lane: boot-loading

Audit HEAD: `devin/1791064509-perf-w60` @ `308c205ca` (W73 tip). Read code only; nothing run, written, or PR'd.

## 1. `saturated: false`

One legal contract-preserving improvement remains (F1). Hunt 2 enumerated clean — detail below.

## 2. Ranked findings

### F1 — crucibleGhost clones the live player root; three's `Object3D.copy` runs `JSON.parse(JSON.stringify(userData))` per node → presented-frame scene-graph dump + mangled shadow/entity keys on a second root

- **Evidence:** `src/render/crucibleGhost.js:53` — `root = playerMesh.clone(true)` inside `ensureClone`, called from `sync` on the player's bound mesh at `src/render/renderer.js:19817-19818`. Vendor behavior: `vendor/three.core.js:13306` (`Object3D.copy` → JSON round-trip of userData), same pattern at `:7724` (Texture) and `:21369` (Material).
- **Mechanism:** The player boundary subtree at clone time is depth-staged, packaged, and LOD-bound. Per node the copy serializes:
  - `sfDepthMark` (`shadowDepthAdmission.js:230-251` — `{g: geometry, ma: morphAttributes, c: customDepthMaterial, ...}`): `g` is a BufferGeometry → `BufferGeometry.toJSON()` dumps every attribute array; `c` is a Material → `Material.toJSON()` walks its texture graph; `ma` serializes morph BufferAttributes. One marked caster = hundreds of KB of JSON; a hull subtree with N staged casters pays N dumps.
  - `renderPackageInstance` (`partsLibrary.js:12624` — `{root, planNodes, ...}`): `root` is an Object3D → `Object3D.toJSON()` serializes the whole package subtree; `planNodes` is an Object3D array → each element's `toJSON()` re-serializes its own subtree → quadratic dump over the package.
  - `__spacefaceShadowCasterPolicyV1` (stale dirty/castBand seq), `presentationEntityId`/`sfBoundEntityId`/`sfStableEntityKey` (ghost meshes resolve to the *live player entity* in the `shadowPolicyEntityOf` ancestor-walk), `shadowMeshNotes` (functions JSON-dropped → dead `{}`), `sfHiddenFrozen` + `matrixAutoUpdate` (Object3D.copy clones the flag verbatim — a hidden-frozen source mints a permanently unposeable ghost).
  - Post-clone, mangled `sfDepthMark` (`mark.g` is parsed JSON, `!== geometry`) makes `casterDepthMarkCurrent` false on every ghost mesh → the ghost root reads permanently unstaged under the flagged/unstaged collectors.
  - Fires inside `syncEntityViews`/bind on a presented frame the first time a ghost tape is active → one hard hitch per clone mint, inside the crucible replay's measured playback.
- **Fix sketch:** reuse the W72 flight-template pattern (`partsLibrary.js:10540-10548` + `dropFlightTemplateDynamicUserData` 9-key list, `:10752-10778`): traverse the source subtree, swap `userData` for a scrubbed projection dropping `sfDepthMark`, `renderPackageInstance`, `__spacefaceShadowCasterPolicyV1`, `presentationEntityId`, `sfBoundEntityId`, `sfStableEntityKey`, `shadowMeshNotes`, `sfDepthUndrawableCycles`, `lod`, `sfHiddenFrozen`, function-valued keys; `clone(true)`; restore. Also force `matrixAutoUpdate = true` on the cloned root (or at least clear `sfHiddenFrozen`) so a hidden-frozen source can't mint a frozen ghost.
- **Effort:** S. **Magic-frame impact:** M (crucible-replay scoped; a real presented-frame hitch plus permanent policy/mark pollution on the ghost root). **Risk:** low — identical scrub pattern is already landed and exercised.

## Hunt 1 — clone-seam inventory (all other paths verified clean)

- `renderPackageLoader.js:808` `entry.source.clone(false)` — plan template nodes are decode-time objects, never synced/marked; JSON carries authored `spacefaceTags`/extras only. Cost is bounded per node (authored records, no THREE refs).
- `killcamStage.js:196`, `titleAttractStage.js:212` `proto.clone(true)` — protos are fresh stage-built `THREE.Group`s (`:125`/`:115`), never bound or marked.
- `partsLibrary.js:12538` marker spread → new Object3D — source is the authored package marker record, not a live root.
- `partsLibrary.js:13258` `restoreDirectPackageMesh` — self-copy onto the same node; not cross-root.
- `assetLoader.js:1551/1745/1759/1764`, `GLTFLoader.js:276`, `embeddedKtx2Textures.js:154` — decode-time authored extras merges and frozen descriptors.
- `imageSourceDedupe.js:192/315` — `Texture.clone()` (Texture.copy JSON-copies texture userData — authored extras; not an object root).
- `cloneMaterialPreservingShaderHooks`, geometry.userData spreads at template mint — material/geometry userData; none of the eight tracked keys are ever written there.
- Boundary `Object.assign` wraps ×3 (`partsLibrary.js:2773/3553/3709`), flight-template clone + instance path (`:10545`, `:10949`) — all W72/W73-scrubbed and verified present.
- Systems-level `JSON.parse(JSON.stringify(...))` sites — sim save records, not object roots.

## Hunt 2 — `[scene]`-in-subjects legs behind closed windows

All 10 `compileShadowDepthPipelines` call sites + sector/handoff legs enumerated:

- `renderer.js:8788` `[scene]` — context-restore depth compile. Unconditional by design: runs after TDR inside `recovery.pending` so nothing presents until the relink finishes; a partial pass there would leave cold variants on the next presented frame. **Intentional, not a leak.**
- `renderer.js:12209` — survival post-settle sweep: `prepareNow() < settleDeadline` gates the scene leg (the W73 fix); `livingHullRoot` still primes. ✓
- `renderer.js:13085` — rock-pool cook: `[scene]` appended only under `survivalCook && !cookOverBudget()`. ✓
- `renderer.js:13774`, `:13859` — post-opening/rescan legs run `collectUnstagedShadowCasters` deltas only. ✓
- `renderer.js:8989`, `:9798`, `:11889`, `:10748`, `:21872` — bounded subject lists (roster prewarm + pool roots, flight batch roots, late pool roots, opening plan, arm's own deadline-sliced legs). No scene.
- Sector handoff: continuous enters skip the sector pipeline precompile entirely (`renderer.js:15221` `continuous-sector-handoff-defers-pipeline-precompile`); `prepareLiveSectorAfterJump`'s census runs under `sectorShellAdmission` + `cookStale` gates with `providerYield` slicing.
- `precompile.js:341/401`, `liveSceneCook.js:31` `compileScenePipelinesSafely(scene)` — boot/menu-phase color compiles behind the loading shell, not post-settle.

**Verdict: no unconditional `[scene]` leg remains behind an already-closed window.** The survival sweep's W73 window gate generalizes correctly; the only unconditional scene-wide compile is the exceptional context-restore path where it is the required behavior.

## 3. W67 regression notes — all lettered sub-checks verified HEALTHY at `308c205ca`

- **Deadline-bounded arm (~renderer.js:21716-22061):** collect breaks at `armStartedAt + SHADOW_DEPTH_ARM_COLLECT_MS` but only after `collected >= 2` (:21814-21830); restore runs min-1 under `SHADOW_DEPTH_ARM_RESTORE_MS` (:21912-22027); pending Map preserves `{lodLevel, entity}` entries; `finally` requeues remaining roots, `notePacedFrameSpend(armNow() - armStartedAt)` debits the whole arm, re-arms `_depthStageScheduled` (:22028-22058).
- **`_parkedDepthStageRoots`:** parked counts toward `queued` (:21540); `band !== 1 && queued` can't un-withhold; dirtySeq bump, lightCensusSignature drift, and ortho-cell drift each unpark into fresh collect (:21951-21967 recheck `(96 + stamp%32) * min(8, 2^(cycles-1))`); empty collect unparks + releases; arm sweep drops detached roots clearing `STAGE_SELF_DIRTY_KEY`/`_withheldDepthCasters` (:21756-21782); partial-offer leftovers requeue, never park.
- **Paced-ledger routing:** every site enumerated post-step/min-1 — `shouldContinueAdmissionSlice` checks `itemsDone < minItems` before `pacedFrameSpend()` (`admissionSliceBudget.js:33-43`); `drainDespawnDisposeQueue` entry-gate skip bounded `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS=2` (:1815-1819) + debit :1841; residency reconcile poll `:2131-2182`; hold-exempt collect/commit/kick pumps `:2555-2661`; `_drainPendingMeshBuilds` `:18955-19167`; `drainEmitSlice`/`drainPresentationTail` post-listener checks (`eventBus.js:349/416`, restart shares `max(0.001, deadline-now)`); `drainDeferredEnterSlice` `steps===0 || ...` min-1 (`sectorEnterDefer.js:154-189`); gltfCompile `while (ran===0 || now()<MS)` + skip cap 2 (`decodeTaskBudget.js:332-349`); 8ms window is a headless fallback behind `PACE_EPOCH_STALE_MS=250` rAF-epoch (`:48-107`) — long frames can't under-report.
- **Flag-only OFF→ON collect:** `collectUnstagedShadowCastersFlag` (`shadowDepthAdmission.js:299-322`) delegates to the same potential-subjects collector as `collectUnstagedShadowCasters` (:415-428) — identical exclusions (geometry-null :196, noShadow/sharedContactShadow/authoredReadableFallbackLayer :198-200, `materialCanCastShadow` :202, node-budget abort :186); already-staged withheld resolves via mark filter.
- **physics.js `reset:true` defer (~352-455):** post-sleep `_disable` no-ops when nothing owns/inits (:416-424); post-wait token guard adopts the winner's `_sg02Init` (:429-440); concurrent prepares token-guarded (:386-408); 20s race still mints for the next click.
- **`_depthVariantCache` (shadowDepthAdmission.js:352-380):** WeakMap interned 10-bit discriminant incl. side/shadowSide verbatim; alphaTest 0→1 flips the bit → re-mints; no stale variant on material reuse.

Report complete — F1 is the only fresh item; lane is otherwise clean against the magic-frame bar.
