# Wave 75 audit report — lane: boot

- **Lane:** boot (frozen/stalled loading screens + the W74 crucibleGhost clone seams)
- **Audit head:** `origin/devin/1791064509-perf-w60` @ `9659573ef41585417bcd666c63b9fbc97914cfc1` (74 waves landed; W60–W74 on PR #220)
- **saturated: false** — three contract-preserving mechanism-level residuals remain (all in the ghost clone; none block the magic-frame bar hard, each is a latent divergence/hazard rather than a live stall).
- **Contract posture:** every finding below is implementable without touching authored visuals, default quality, or the sim path — none threatens golden `892f88c9`.

---

## Findings (ranked)

### F1 — Ghost snapshot can freeze a transient `visible=false` mid-admission

**Evidence:** `src/render/crucibleGhost.js:103-121` — `ensureClone` mints once per live mesh (`clonedFrom === playerMesh` early-out at :106); `Object3D.copy` carries `.visible` verbatim into the clone. Transient-hide machinery exists and is exercised on hulls: resolving markers are added hidden (`src/render/visualOverrides.js:464` — `marker.visible = false`), pending-admission flags live beside them (`visualOverrides.js:461,:727` `admissionStandInPending`; swap/resolve at `:649-695` `upgradeAdmissionStandIn` / `releaseAdmissionStandInFallback`), the renderer polls them per frame (`src/render/renderer.js:3434`), and `authoredPendingFallbackDrawn`/`authoredReadableFallbackLayer` pair with `visible=false` (`src/render/partsLibrary.js:2762,3707`; `src/render/renderer.js:11556`).

**Mechanism:** the ghost mints at first tape replay (`renderer.js:19936-19937` — `sync` runs inside the presented-frame entity view pass; `ensureClone` on first call). If that mint lands while any player-hull node sits inside the hidden-but-resolving window (stand-in pending, resolving marker hidden, admission substrate not yet committed), the clone keeps `visible=false` permanently — nothing on the ghost re-evaluates it. The player sees a translucent ghost missing a part the live hull shows one beat later. Deliberate hides are handled correctly (fallback layer pairing stays hidden — desired; prepass `layers.mask` restrictions carry over — desired); only *transient* hides are the hole.

**Fix sketch:** gate the mint on a bounded pending probe — at `ensureClone`, walk `playerMesh` once counting `admissionStandInPending === true` / hidden resolving markers; defer the clone while >0, capped (e.g. ~60 presented frames) so the ghost always appears. Alternative: post-mint traverse refreshing `visible` from the live source — heavier and reintroduces live-hull coupling; prefer the deferred mint.

**Effort:** S. **Magic-frame impact:** M (real missing-geometry ghost when it fires; window is narrow — hulls are usually settled before a tape exists). **Risk:** low — worst case the ghost appears a bounded few frames later.

### F2 — One-shot clone never re-mints on mid-run hull content swaps

**Evidence:** `src/render/crucibleGhost.js:106` — refresh check is pure identity (`clonedFrom === playerMesh`). Subtree swaps inside the same root don't change identity: `refreshWholeShipLodFamily` and the authored-swap paths detach/attach children in place (per W71 notes — `notes.removed(prev)` per detach inside `swapTo` attach guards; `partsLibrary.js` authored-commit family). `sync`'s early-out means the clone is minted exactly once.

**Mechanism:** if the player hull's authored subtree is rebuilt mid-crucible while a tape is live (upgrade landing mid-run, LOD family refresh, packaged swap), the ghost renders the old hull for the entire replay — a visibly divergent translucent hull. Probability unknown from code alone — depends whether crucible allows mid-run authored rebuilds — but the machinery that would trigger it exists and runs during presented frames.

**Fix sketch:** stamp a content epoch on the live root's `userData` at the partsLibrary attach/detach choke points (one counter, already funnelled), keep that key out of `GHOST_CLONE_USERDATA_DROP`, and have `ensureClone` re-mint when the live epoch drifts from the ghost's recorded epoch. Re-mint cost is the same bounded clone, rare-event.

**Effort:** S–M. **Magic-frame impact:** M (visible divergence when it fires; possibly unreachable in crucible — needs a gameplay-path confirmation, cheap to bound). **Risk:** low–moderate — re-mint repeats the bounded clone; no shared state mutated.

### F3 — Stale inherited bookkeeping marks on ghost descendants (dead-but-lying config)

**Evidence:** `src/render/crucibleGhost.js:19-31` — the drop set covers 11 keys but not `sfMatrixFrozen`, `animated`, `hlod`, `spacefaceSocket`, `spacefaceSharedAsset`, `keepSeparate`, `admissionStandInPending`, `authoredAdmissionSubstrate`, `resolvingMarker`, `weapons`, `turretHead`, `shieldBubble` — all survive the projection as plain data. `sfMatrixFrozen` is live config on the source (`src/render/staticChildMatrices.js`; honored by the vendored `updateMatrixWorld` at `vendor/three.module.js:90-160`).

**Mechanism:** the clone carries marks whose semantics died at mint — `sfMatrixFrozen === true` on a node under a `matrixAutoUpdate=true` ghost root, `animated: true` with no update function, socket/hlod marks with no subsystem owning them. Today they are neutralized only *incidentally*: the forced root flag pushes `force=true` down the traverse, and `spacefaceUnfreezeStaticAncestors` clears only the root's own stamp on add — descendant stamps persist on the ghost forever. Hazard-shaped: any future pass that trusts these marks per-node (a matrix-bake, a static cull fast-path, an animated-subtree sweep over the live scene — the ghost is attached to the live scene at `renderer.js:8898`) would misclassify or skip ghost nodes.

**Fix sketch:** extend `GHOST_CLONE_USERDATA_DROP` to cover the remaining non-render keys (or invert the projection to an allowlist of render-meaningful keys — `hull`, `visualBounds`, `name`-like fields). The projection is already the choke point; this is a list edit.

**Effort:** S. **Magic-frame impact:** L (nothing today misbehaves — it removes a trap for the next wave). **Risk:** low.

### F4 — `material.userData` still pays a JSON round-trip on the ghost's material clones (latent)

**Evidence:** `src/render/materialClone.js:7` — `cloneMaterialPreservingShaderHooks` = `base.clone()` (which JSON-round-trips `material.userData` inside `Material.copy`) + own-prop carry of `onBeforeCompile`/`customProgramCacheKey`. Verified per prompt (a): shader hooks do survive (carried as own properties, not through userData), and receipt-style material.userData survives as plain data.

**Mechanism:** node userData was scrubbed by the projection, but material userData was not — a non-JSON-serializable value on a hull material (a live uniforms dict, an object ref) would mangle or drop silently on the ghost's material clones. Hull materials today carry only plain receipt flags (audited — `userData.uniforms` appears only in `emergentPrimitivePools.js` VFX materials, not hull materials), so this is latent, not live.

**Fix sketch:** if the list in F3 becomes an allowlist, apply the same projection to material userData inside the ghost's `cloneMaterialPreservingShaderHooks` call site (or leave as-is and document the assumption).

**Effort:** S. **Magic-frame impact:** L. **Risk:** low.

### Clone-seam sub-question results (prompt's explicit asks)

- **(a)** No live userData the ghost *needs* is dropped: at render time the clone uses geometry/material refs (shared by clone, not via userData), `name`, transforms, `visible`/flags/`layers` (Object3D fields), plus the `crucibleGhost` stamp set post-clone at :126-128. Every dropped key is live-hull bookkeeping the ghost must *not* inherit (`sfBoundEntityId`/`presentationEntityId` — resolves ghost to live entity; `__spacefaceShadowCasterPolicyV1`/`__spacefaceDepthStageSelfDirty`/`sfDepthMark`/`sfDepthUndrawableCycles`/`shadowMeshNotes` — live shadow bookkeeping; `renderPackageInstance` — live package ref; `sfHiddenFrozen`/`lod` — live residency keys). Material shader-hook keys survive via `cloneMaterialPreservingShaderHooks` own-prop carry — verified.
- **(b)** No other live-hull `clone(true)` dump sites remain. Exhaustive sweep: `crucibleGhost.js:115` (projected — this lane), `partsLibrary.js:10545` flight-template root (same projection trick — `flightTemplateCloneUserData` + finally-restore, pre-existing) and `:10949` instance clone of the *already-sanitized* template, `killcamStage.js:196` + `titleAttractStage.js` (fresh protos holding bare `Mesh`es from `record.primitives` — clean userData, cheap), `renderPackageLoader.js:780` flat `clone(false)` per node (replaced SkeletonUtils), `shadowDepthAdmission.js:731` `Light.clone()` (shallow, tiny userData). Ship previews / wreck displays / orrery thumbnails: no live-hull clone sites.
- **(c)** Projection can't alias: `clone(true)` is synchronous, so no node can enter or leave the subtree mid-swap; originals restore in `finally` (`crucibleGhost.js:108-113`), the projection is per-node fresh objects, and the ghost receives a JSON-copy of the projection — no shared references back into live userData in either direction.
- **(d)** Other inherited state: castShadow/receiveShadow stripped post-clone (:123-125); `layers.mask` and `frustumCulled` carry correctly or are dead; `morphTargetInfluences` dead (authored parts reject morphs — `assetLoader.js:1512`); `visible` carries — deliberate hides correct, transient hides are F1; stale marker keys are F3.

---

## Regression notes — W67 verification (commits 6e5c09f54, 4c68b642a, eaff5ff34, 1719da55a, a14902fba)

All six items verified against the audited head. No regressions found; one bounded nuance noted (N1).

### 1. Deadline-bounded arm — verified

- **(a) min-1 progress is real:** collect loop breaks only when `collected >= 2 && armNow() >= collectDeadline` (`renderer.js:21946` — a single fat root is always collected); restore loop breaks only when `restored >= 1 && restoreIdx + 1 < slice.length && armNow() >= restoreDeadline` (`:22145`) — one restore guaranteed before the deadline check can fire. Neither check can starve the drain at min progress.
- **(b) requeued roots keep withheld flags + fresh collect:** the pending-Map requeue in `finally` stores the same `[root, entry]` tuple back (`:22154-22161`), the withheld set is untouched, and the next arm re-runs `collectUnstagedShadowCasters` — no stale `legSet` can leak because legs are rebuilt per arm; roots that detached during the withheld window get `STAGE_SELF_DIRTY_KEY=false` + unwithheld in the same branch (`:22158-22163`).
- **(c) `pending.set(root, entry)` preserves `{lodLevel, entity}` verbatim** — same entry object re-inserted, no field reconstruction (`:22158`).
- **(d) `notePacedFrameSpend(armNow() - armStartedAt)` debits the whole arm** — census signature mint, per-root collects, subject render task, and restore all fall inside the debited window (`finally` at `:22170`); runs on throw, so a mid-slice exception can't skip the debit or wedge `_depthStageScheduled` (re-arm/kill-session also in `finally`, `:22172-22178`).

### 2. Undrawable parking — verified

- **(a) parked roots count as queued:** parked entries stay in the withheld set and are covered by the checked-sync queued branch — a parked root carries `castBand === 1` (set by the arm's restore-path sync), so it takes the `band === 1 && selfDirty && queued && cached` re-stamp path, **not** the `band !== 1 && queued` un-withhold path — parked roots stay withheld. Verified at `renderer.js:21637` + the checked-sync branch (:21632-21793).
- **(b) dirtySeq bump deletes the park in both flows:** `parked && this._parkedDepthStageRoots.delete(root)` fires at `:21786` (empty-collect flow) and `:21793` (non-empty collect → withhold-or-restore flow) — a genuine dirty on a parked root re-runs the normal collect and the park entry cannot survive it.
- **(c) parked root whose collect returns `[]` unparks AND restores:** the leftover-less restore stamps the dirty key, deletes the withheld entry, and runs full `syncShadowCasterPolicy` with live flags — the stale withheld Set entry is released (`:22051-22064` + `:21786`).
- **(d) arm-time parked sweep drops detached roots:** `:21893-21897` — parked roots with `!root.parent` are deleted before the collect slice builds.
- **(e) partial leftover requeues, never parks:** park creation requires the leftover set to be entirely leg-resident (`:22051-22090` — leftoverByRoot non-empty routes to park-or-requeue by leg membership; meshes beyond the leg → requeue to pending with the same entry).

### 3. Paced-ledger routing — verified

- **(a) no site breaks min-1:** enumerated all paced consumers — `shouldContinueAdmissionSlice` returns `itemsDone < minItems` true *before* the ledger check (`admissionSliceBudget.js:38-45`); `drainDeferredEnterSlice` has the `steps === 0` clause (`sectorEnterDefer.js:130-190`); `drainEmitSlice`/`drainPresentationTail` check post-listener with `ran > 0` debit (`eventBus.js:349,416`); hold-exempt collect/commit/kick/remint all debit `notePacedFrameSpend(now() - started)` and each step runs before its budget check (`renderer.js:2540-2662`); `_drainMeshBuildQueue` via `usePacedLedger` keeps min-1; `driveOpeningPublicationResume` resolves ≥1/arm then debits (`partsLibrary.js:6313-6394`, MAX_SKIPS=2); `buildComposedShipAsync` step-before-check (`partsLibrary.js:10317`); `drainDespawnDisposeQueue` entry-gate + loop min-1 (`renderer.js:1800-1843`).
- **(b) despawn entry-gate defers, never drops:** `pacedFrameSpend() >= BUDGET && skips < MAX(2)` → `return 0` with the queue intact (`renderer.js:1800-1843`) — the one wholesale-skip site is a defer; entries survive.
- **(c) 8ms window can't under-report long frames:** `paceFrameEpoch` is bumped by a lazy rAF pump; `PACE_EPOCH_STALE_MS = 250` marks a starved/headless pump stale → epoch = −1 → the `PACE_FRAME_WINDOW_MS` 8ms wall-clock fallback engages (`decodeTaskBudget.js:40-115`). `notePacedFrameSpend` debits measured wall time, so a slicer exceeding 8ms debits the full spend against the same epoch — a long frame can't hide spend from later slicers.
- **N1 (nuance, not a bug):** the hold-exempt kick pump shares `commitSteps` with the enqueue path — a saturated beat can yield a 0-step kick. This defers the kick to the next beat (bounded by the enqueue drain + MAX_SKIPS on the ledger defer), consistent with defer-not-drop — flagging because it's the only paced site where a downstream stage inherits another stage's counter.

### 4. Flag-only OFF→ON collect — verified

- **(a) already-staged withheld mesh restores correctly:** the toggle collect (`collectUnstagedShadowCastersFlag` — flag-only, no signature mints) can withhold a mesh that the arm's signature collect later reports staged; in the arm that root lands in `unstagedByRoot` → offered to the leg → drawn → marked under the fresh census → empty leftover → restore unsets `castShadow=false`. No permanent withhold for already-linked casters.
- **(b) over-withhold resolves:** when the arm's collect returns `[]` the root skips `leftoverByRoot` entirely → the leftover-less restore stamps dirty, `_withheldDepthCasters.delete(root)`, and `syncShadowCasterPolicy` runs the full traverse (the toggle path invalidated the policy → early-out can't fire) → live flags restored (`renderer.js:22051-22064`).
- **(c) exclusion parity holds:** both collectors share `collectPotentialShadowCastSubjects` — `spacefaceNoShadow`, `sharedContactShadow`, `authoredReadableFallbackLayer`, `materialCanCastShadow`, geometry-less exclusions identical (`shadowDepthAdmission.js:160-500`); matching cast-side exclusions in `syncShadowCasterPolicy` (`shadowCasterPolicy.js:292`).

### 5. `reset:true` prepare defer — verified (`src/core/physics.js:352-453`)

- **(a) post-sleep `_disableSg02DynamicAuthority` is a true no-op in `!_sg02Init && !_sg02`:** token bump guarded by `this._sg02 || this._sg02Init` (`:772`), dispose guarded by `_sg02`, remaining writes re-assign already-null/zero values — no token bump, no teardown, nothing for a later minted authority to fight.
- **(b) 20s caller abandon still mints for the next click:** the defer's `await setTimeout` continuation proceeds to `_updateSg02DynamicAuthority` independently of the caller's wait — the init is minted into `_sg02Init`, and the next prepare adopts it through the settle race rather than repaying the mint (`:383-409`, `:415-422`).
- **(c) concurrent deferred prepares can't interleave mints:** after the sleep, the first resumer mints inside the synchronous `_updateSg02DynamicAuthority` body (guard `!_sg02Init && !_sg02` then `++this._sg02Token` atomically, `:569-620`); the second resumer sees `_sg02Init` non-null and joins the same init via `Promise.resolve(this._sg02Init)`, or returns `false` on token drift (`:388-409`, `:429-440`) — one mint survives, losers get a retryable bounce.

### 6. Variant interning — verified (`src/render/shadowDepthAdmission.js` `_depthVariantCache`)

- **(a) alphaTest 0→1 re-mints:** bits recomputed per call and compared via `cached.bits.every` — the flip changes bits[0] → variant re-minted and re-cached.
- **(b) side/shadowSide verbatim:** `material.side == null ? 0 : material.side` feeds the discriminant — values 0/1/2 stay distinct; same for `shadowSide`.
- **(c) no stale variant after needsUpdate-style reuse:** the WeakMap keys per material object and bits are recomputed every call — any covered mutation re-mints; uncovered mutations (color/roughness) don't enter the depth-variant program key, so serving the same variant is correct. The `!==` reference compare in `casterDepthMarkCurrent` is sound because interning returns the same string instance per (material, bits) — a bits change yields a different instance → mark invalidates.

---

## Scope notes

- Adjudicated items (KEEP/DOCUMENTED/REJECTED/GATED in `design/perf/PERF_W4_CLOSURE_2026-09-29.md`), the waves 1–74 landed list, and KNOWN DEFERRED/WONTFIX items were read and not re-reported — F1–F4 are new mechanism residuals exposed by the W74 machinery itself.
- Wall-clock conclusions avoided per SwiftShader rule; all mechanisms above are structural.
