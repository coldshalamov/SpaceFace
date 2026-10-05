# wave98 audit — boot-loading lane (coldshalamov/SpaceFace @ 95f1aca01, devin/1791064509-perf-w60)

saturated: false

## Ranked findings

### 1. Survival-pool seal admit pays one whole-scene hide/restore per unit — its call site never got `touchMany`

- **Evidence:** `src/render/renderer.js:13244-13253` — the seal-path `admitOpeningUnitsAcrossSlices` passes `touchOne` only: no `touchMany`, no `touchBatchSize`, no `deadlineMs`. `touchBatchSize` defaults to 1 (`src/render/openingGpuAdmission.js:827`), so the loop takes the per-unit else-branch (`openingGpuAdmission.js:855-871`). Every unit's `touchOne` → `touchExactTargetSubject` (`renderer.js:10687-10691`) → `touchSubjectOnExactTarget` (`openingGpuAdmission.js:479-559`) → `withOnlySubjectsDrawable` (`openingGpuAdmission.js:446-468`), whose hide pass is a full `scene.traverse` over every node.
- **Mechanism:** on a survival cook (`survivalRunHoldsArena` gate, `renderer.js:13118`), the sealed-pool cohort pays `units × O(whole-scene traverse)` inside the loading window — the exact per-unit whole-scene hide/render/restore cost the campaign already eliminated at both other admit sites (the code's own accounting at `renderer.js:15782-15784`: "one touch each was ~6 ms of whole-scene hide/render/restore — ~20 s of the launch"). The main cook admit batches 24 subjects per traverse (`renderer.js:14809-14823`); the rescan admit batches under loading (`renderer.js:15785-15788`). The seal site was simply never armed — its cohort still eats one whole-scene traverse per unit.
- **Fix sketch:** pass `touchMany` + `touchBatchSize: 24` at `:13244`, replicating `renderer.js:14809-14822` (drawable filter → `revealSubjectForCompile` per subject → `touchExactTargetSubjects` → LIFO restore). `touchCanDraw` (:14756) and the grouped-touch closure are `const`s declared later in the same body — hoist them (or a shared `makeTouchMany`) above `:13164` to clear TDZ, or mint a seal-local equivalent beside `whileRevealed` (:13164).
- **Effort:** S. **Magic-frame impact:** M — survival cooks only, but pool cohort × scene nodes is the largest repeated boot-path traverse left. **Risk:** low — same grouped-touch primitive proven at two sites; the never-straddle-`issued` batch rule is enforced inside `admitOpeningUnitsAcrossSlices` (`openingGpuAdmission.js:835-838`).

### 2. `lightCensusSignature` re-mint is still an atomic O(scene) traverse inside whatever leg asked

- **Evidence:** `src/render/shadowDepthAdmission.js:401-424` — synchronous `scene.traverse` + per-light ancestor-visibility walk (:412-414). Reached through `renderer.js:25587-25597` (`_shadowCensusForFrame` epoch memo) from `freshDepthLightSig` (`renderer.js:15809`, minted into `depthOpts.lightSigOverride` at `:15825`) and the `lightSigFor` drive/arm sites. Any `noteShadowCensusLightMutation` between memo epochs makes the next read pay the whole traverse inline.
- **Mechanism:** W94/W96 killed every *repeat* payer (epoch memo, sig piggyback on park compares, per-`_viewSyncSeq` latch); the re-mint itself remains the largest single unstepped O(scene) block reachable from boot/rescan legs. A paced leg yields *around* it, never within it — one mutation batch = one atomic whole-scene walk inside a presented-frame leg.
- **Fix sketch:** a `lightCensusSignatureSteps` generator (stack DFS emitting lights in identical order to the sync traverse, same ancestor-vis fold), driven under the caller's pace contract, with the memo holding `{pendingIter, epoch}` — a mid-walk `noteShadowCensusLightMutation` must abandon and re-mint rather than stamp a signature mixed across a mutation (mirror `dirtySeq`, `shadowReceiverTally.js:57-60` and the re-mint at `:118-120`).
- **Effort:** M. **Magic-frame impact:** M — once per mutation batch, not per frame. **Risk:** low-moderate — the stepped DFS must emit lights in the sync walk's exact order or epoch comparisons flap (spurious re-collects, never wrong results).

### 3. Three paced cook/seal loops still lack a per-iteration `cookStale` bail

- **Evidence:**
  - `renderer.js:14727-14736` — `unitSubjects` 1024-window dedupe loop: `await paceCookStretch()` at :14735, no `cookStale()`. Sibling windowed loops carry the guard (:14041-14045, :14118, :14687/:14697); the next bail after it is :14826 — *after* `admitOpeningUnitsAcrossSlices` (:14776).
  - `renderer.js:13186-13193` — seal `perRootSubjects` bucket loop: `await sealPace()` per census subject, no stale check (`sealPace` is budget-only, :13133-13140). Nearest guards: :13152 upstream, :13195 downstream.
  - `renderer.js:13225-13235` — seal `sealSubjects` dedupe loop: `await sealPace()` per window (:13234), no stale. Next bail :13243.
- **Mechanism:** a superseded cook (fresh `enterSector`, save-load interrupt) keeps grinding dead dedupe windows — and past :14727 it *enters* `admitOpeningUnitsAcrossSlices`, which is deadline-bounded (`overBudget()` consults `deadlineMs` only, `openingGpuAdmission.js:698-699, :834, :856`), not stale-aware: it burns the remaining cook deadline issuing/touching a cohort nobody consumes before the next `cookStale()` at :14826. Post-W97 the three longest legs bail per iteration; these three residual loops don't.
- **Fix sketch:** `if (cookStale()) return cookSuperseded;` beside each existing pace await — verbatim W97 convention.
- **Effort:** S. **Magic-frame impact:** M — dead wall-clock + dead GL issue on supersede paths only; bounded per iteration, unbounded count. **Risk:** trivial — the bail shape is already proven at 10+ sites.

### 4. Residual un-noted census-mutation vectors: ancestor-visibility flips and light-bearing subtree detaches

- **Evidence:** `noteShadowCensusLightMutation` fires on light mount/release (`vfx.js:14976`, `precompile.js:235`/:248, `renderer.js:26338`, held-light dispose paths) — but `lightCensusSignature` folds **per-light ancestor visibility** (`shadowDepthAdmission.js:412-414`), and nothing notes an `object.visible` flip on a light's ancestor chain, nor a subtree detach carrying a light that doesn't route through a light-aware release.
- **Mechanism:** latent. Today every runtime light is a direct scene child (`_keyLight`; the event-light pool mounts at `vfx.js:14947-14972`) → no flippable ancestors exist, and light-bearing detaches mostly flow through `disposeObject`'s `isLight` probe. An authored light nested under a visibility-toggled holder (powered-down station, blackout wreck) would silently serve a stale signature → depth-staging verdicts computed on ghost lights.
- **Fix sketch:** piggyback an isLight-ancestor probe inside the existing visibility-mutation feeds (`applyEntityMeshVisibility`/`syncShadowCasterPolicy` already traverse), or version a `visibleChain` counter into the epoch where the flips are written.
- **Effort:** M. **Magic-frame impact:** L-M — no reachable consumer today; fires the moment authored lights nest under toggled holders. **Risk:** low.

### 5. Steps twin's staging search is visible-subtree-only vs sync `getObjectByName` full DFS (latent parity hinge)

- **Evidence:** `src/render/precompile.js:209-249` — `if (object.visible !== true) continue` (:220) precedes the `name === POINT_LIGHT_BUDGET_STAGING_NAME` check (:221), so the fused walk never finds a staging group nested under an invisible ancestor; the sync path's `getObjectByName` DFS would.
- **Mechanism / reachability (hunt item a):** **unreachable on this build.** Enumerated every vector: the group is always minted via `scene.add(lightStaging)` as a direct scene child (:239-241); zero `.visible` writes in precompile.js; zero `scene.visible` writers anywhere in `src/`; `this.scene` is assigned once (`renderer.js:9666`; the only `new THREE.Scene()` is :9175, pre-assignment) and never swapped; the group is never re-parented; nothing outside precompile.js references `POINT_LIGHT_BUDGET_STAGING_NAME`. The divergence fires only if a future change re-parents the group or toggles a chain ancestor — then the Steps twin keeps the hidden group counted as live where the sync path would have released it: stale budget + leaked stand-ins.
- **Fix sketch:** carry an `ancestorVisible` flag on the DFS stack — still *descend* into invisible subtrees for the name search (`getObjectByName` parity) while keeping them out of the light count (`traverseVisible` parity). Stack-shape change only.
- **Effort:** S. **Magic-frame impact:** L (latent). **Risk:** trivial.

### 6. Dead `_rebindPresentationMeshes()` sync wrapper

- **Evidence:** `renderer.js:21165-21168` — zero call sites in `src/`; all live paths drive `_rebindPresentationMeshesSteps` (drain `:23978-24001`) or `_bindPublishedPresentationMeshes`.
- **Mechanism:** none — dead code only, same class as W97's deleted `collectNeverLinkedSceneRoots` sync twin.
- **Fix sketch:** delete (or keep as a debug helper). **Effort:** S. **Impact:** L. **Risk:** trivial.

## Regression notes — listed machinery, verified at 95f1aca01

1. **`syncVisiblePointLightBudgetSteps`** (precompile.js:209-250; drives ~:10046, ~:11727, ~:13873, ~:15527): **PASS.**
   (a) one iterative stack-DFS (:214-230) covers staging search + visible-light count; `continue` at :225 skips the staging subtree for counting — release-before-count parity; yield cadence :219.
   (b) every drive site keeps a `typeof === 'function'` eval guard + sync fallback.
   (c) both `noteShadowCensusLightMutation()` notes verbatim — release :235, mint :248.
   (d) each drive uses its caller's pace contract (paceBootQueue / yieldToBrowser / envBindYield+cookStale / postPace→`postSupersededResult`).
2. **`shadowReceiverTally` paced recount** (shadowReceiverTally.js:31-125): **PASS.**
   (a) `resolve()`-while-dirty mints/drives `recountShadowReceiversSteps` inside a ≤4 ms slice (`RECOUNT_SLICE_MS=4`, :31) and serves the last `count` in flight — `dirty` stays true until a clean walk settles.
   (b) `dirtySeq` (:59) bumps per `markDirty()`; a walk minted on an older seq re-mints instead of stamping a mixed count (:118-120).
   (c) `options.force` routes to atomic `recount()` (:98); `recount()` full-drains synchronously (:84-96).
   (d) the yield fires on `++sinceYield % every === 0` (:46) — a <512-node scene completes the generator in a single `.next()` → settles inside one `resolve()` call.
3. **`_rebindPresentationMeshesSteps`** (renderer.js:21174-21188; drain :23978-24001; yield* :23622): **PASS.**
   (a) yields per 256 visited rows (:21180); binds via the identical `_bindPresentationMesh` (:21183).
   (b) the presented drain breaks on `rebindNow - rebindStart >= 4` (:23997-23999); parked remainder in `_presentationRebindIter` resumes next present.
   (c) `publication.rebuilt` closes a parked walk via `priorRebind.return()` + fresh mint (:23970-23976).
   (d) `_publishOpeningFirstPictureSteps` `yield*`s the twin (:23622).
4. **`censusHolderSet` / lateRoots gap join** (renderer.js:14018-14063): **PASS.**
   (a) `enclosingMeshRoot(subject)` resolves for every census subject at :14046, *before* the `openingSet.has(subject)` skip at :14048.
   (b) the gap join :14056-14058 appends `meshRootSet − censusHolderSet` into `lateRootSet`.
   (c) opening-covered roots are excluded correctly: their subjects resolve a holder into `censusHolderSet` at :14047 — before the skip — so the gap join cannot re-add them. Emit preserves `_meshes` insertion order (:14061-14062).
5. **`cookStale` guards in the 3 long cook loops**: **PASS.** `if (cookStale()) return cookSuperseded` verified inside the lateRoots census-subject walk (:14043), the cohortSubjects-1024 windows (:14118) and the firstFlightRoots/shadowSensitiveLeftovers legs (:14096/:14128 region). Three residual uncovered loops are Finding 3.
6. **`deniedAllowCast` park stamp + release** (mint :25956-25960; re-key :25223-25258; release clause :25202-25203): **PASS.**
   (a) denied park mints stamp `deniedAllowCast: true` (:25960); the `allowCast === false` re-key stamps `false` (:25256).
   (b) the release clause is exactly `denied === true && opts.allowCast === true && parkedEntry.deniedAllowCast !== true` (:25202-25203).
   (c) `!== true` preserves `undefined` legacy entries → old denied-release behavior.
7. **`retireSuppressed` doomed-first ordering** (presentationWorld.js:1023-1075): **PASS.**
   (a) `doomed[slot] === 1` `continue` (:1037) runs before the `resident.alive === false` dead-resident free (:1038-1044).
   (b) non-doomed dead residents still `retireSlot` under the `byId` owner guard (:1043, applied :1054).
   (c) doomed dead rows keep their VISIBILITY mark and are not freed by the dead-resident path — they retire via the absent sweep (:1060-1074), which correctly runs only on non-suppressed feeds (`!retireSuppressed`), where their record's absence lands them in `absent`.
8. **`_initEventLights` census bump** (vfx.js:14940-14976): **PASS.** `noteShadowCensusLightMutation()` runs at :14976 after the pool mount loop + `freeLights` init (:14947-14972) — the epoch memo can't serve pre-mount sigs.
9. **Dead-code deletion**: **PASS.** `collectNeverLinkedSceneRoots` (sync twin) is gone — only `collectNeverLinkedSceneRootsSteps` exists (:8226) and is driven at the settle site (:13534) under the 4 ms wall + `cookStale`.

## Lane enumeration residuals

**(a) Staging group under an invisible parent — reachable?** No. Enumerated exhaustively: mint is always `scene.add(lightStaging)` direct-child (precompile.js:239-241); no `.visible` writer ever touches the group or `scene` (zero hits in `src/`); `this.scene` never reassigned after :9666; no re-parenting; no external name references. The Steps-vs-sync divergence is a latent parity hinge only → Finding 5.

**(b) PostPace-superseded pass — half-removed staging state?** No. In `syncVisiblePointLightBudgetSteps` the only `yield` is inside the walk loop (:219); every mutation — release (:233-235), budget compute (:237), mint (:239-247), both census notes (:235, :248) — sits in the synchronous tail after the walk's last yield. Abandoning the generator mid-walk mutates *nothing*; the release+mint pair cannot be split; a superseded pass leaves the stale group in place and the next epoch's pass re-walks fresh and releases it then. Atomic enough: PASS.

**(c) `cookStale` coverage:** post-W97 the three longest loops bail per iteration (verified above); residual uncovered paced loops = `unitSubjects` dedupe (:14727-14736), seal `perRootSubjects` bucket (:13186-13193), seal `sealSubjects` dedupe (:13225-13235) → Finding 3.

**(d) Remaining atomic boot stretches, ranked by worst-case node count:**
1. `withOnlySubjectsDrawable` whole-scene hide+restore — O(all scene nodes) per call; once per ≤24-subject batch on loading admits, once per unit on the seal admit and flight-mode rescan path (deliberate `touchMany: null` outside loading, :15785). → Finding 1 for the seal-site gap; the per-unit flight cadence is documented and load-bearing (batched flight touches would hide across presented frames differently) — the legal shrink is a maintained drawable ledger, not pacing (a yield inside the hide walk exposes half-hidden state to presented frames).
2. `lightCensusSignature` re-mint — O(scene) once per mutation batch → Finding 2.
3. `touchSubjectOnExactTarget` per-call subject walks — geometryless census (:528-532), `drawableSubjects` (:555-561), cullable set, `updateMatrixWorld(true)` per drawable — O(subject subtree + ancestors) × ~4; bounded by subject scale.
4. Bounded O(cohort) loops — `ordered` dedupe (openingGpuAdmission.js:702-706), `reattachDetachedAdmissionTextures`, the Finding-3 loops — paced; node count capped by cohort, not scene.
5. Verified unreachable/dead on this build — `collectInstancePoolCompileRoots`/`collectLateAdmittedCompileRoots`/`collectUncompiledSceneDrawables` sync fallbacks (all callers Steps-gated), `captureOpeningAdmissionIdentity` sync mint (:24641/:24710 — precollected inputs always supplied), session-mint traverse (shadowDepthAdmission.js:825 — stagedLights always injected by the stepped census), `compileShadowDepthPipelines` (:553 → Steps at :15829-15831), tally-less `scene.traverse` (:26324 — `_shadowReceiverTally` minted unconditionally :9898; the :8814 null is inside `clearRendererStateReferences`, teardown-only), `_rebindPresentationMeshes` (:21165 — zero callers → Finding 6).
6. Everything else on the boot path is already paced/chunked: census stepped twins (7 `collectCompileSubjectsPaced` sites), `enterSector`/`_restoreChunks`/`serializeDataSteps`/`_clearEntitiesChunked`, `buildOpeningSubmissionPlanSteps`/`createOpeningSubmissionReceiptSteps`, `_publishOpeningFirstPictureSteps`, settle stragglers (:13534), post-opening rescan legs under `postPace`.

**Parity note:** the rescan's `collectLateAdmissionCensus` (`renderer.js:15551-15603`) deliberately lacks the `censusHolderSet` gap join the cook got in W97 — a `_meshes` root registered mid-pass re-arms `_postOpeningRescanRequested` at the mount sites (:22135/:22314) and is caught by the next pass; post-settle attaches mint a fresh pass. Designed coverage, not a gap.

**Verdict:** `saturated: false` — Findings 1-3 are concrete contract-preserving wins (S/M effort); Findings 4-5 are latent correctness hinges worth fixing cheaply before an authored-light-under-holder or re-parented-staging change detonates them.
