# wave75 audit — lane: lod (lod-in-frame)

- audit head: `9659573ef` on `devin/1791064509-perf-w60`
- saturated: **false** — one latent contract-level defect with a clear fix remains (Finding 1). Its
  magic-frame consequence is dormant today (no `sfEvictWhenEmpty` writer exists), so the lane is
  near-saturated rather than empty; it is not true saturation because a legal contract-preserving
  improvement with a concrete implementation path does exist.

## Findings (ranked)

### 1. Pooled-texture release keys the wrong binding: unbind releases under the caller's id before the mark-match test

- **Evidence**: `renderer.js:18220-18231` — `_unbindPresentationMesh` runs
  `releasePooledPresentationTextures(mesh, entityId, this)` unconditionally, then deletes
  `sfBoundEntityId` only when `entityId == null || mark === entityId` ("Preserve a mismatched
  mark — it belongs to a different binding's lifecycle"). `renderer.js:8250-8256` —
  `releasePooledPresentationTextures` releases the note list under the *passed* id and then
  unconditionally nulls `sfSharedTextureNotes` + resets `sfSharedTexturesNoted`.
  `pooledPresentationMarks.js:31-44` — `releaseSharedTextureConsumer` removes the passed
  consumerId only (`consumerId == null` early-returns false).
- **Mechanism**: the noted consumers are keyed by the mesh's own mark — `syncPooledPresentationIdentity`
  notes every shared texture under the id that `clearPooledTransientMarks` just stamped into
  `sfBoundEntityId`. When a `(id, mesh)` unbind carries a caller id ≠ the mark — the exact case the
  preserve-comment exists for — three things go wrong in one call: (a) the caller id's claims are
  released (usually a no-op: that id is not a consumer — but when the stale id is live elsewhere,
  e.g. a recycled entity id sharing a texture through a different mesh, it strips a *live* claim);
  (b) `sfSharedTextureNotes` is nulled anyway, so the true binding's consumer entries can never be
  released — every shared texture keeps a permanently dead consumer; (c) the mark survives, so the
  mismatch is invisible to the next `syncPooledPresentationIdentity` (`previousId` reads the mark —
  under a stale-but-preserved mark, `previousId != null && previousId !== nextEntityId` fires the
  stale-owner release, which is then correct by accident). Reachability of mark≠caller-id: the
  rekey flow at `renderer.js:1746-1762` is matched (mark == oldId by construction); the exposed
  channel is a mesh stranded under a second stale `_meshes` key — "Anything still unmatched stays
  keyed by its dead id; reconcileMeshes releases it" — i.e. a map carrying {A:mesh, B:mesh} after a
  save-restore id reissue, then `unbind(A, mesh)` on a mesh bound under B. Rare, but the
  preserve-comment shows the author knows the state exists.
- **What the player sees**: nothing today. `sfEvictWhenEmpty` has zero writers in `src/` (the only
  hit is the read at `pooledPresentationMarks.js:35`), so over-counted consumers are inert Set
  bookkeeping — a slow consumer-id leak, no visual or timing effect. It activates the moment any
  eviction lane mints the flag: the wrong-id release then disposes shared textures still drawn
  elsewhere → GL re-upload inside presented frames (hitch) plus a possible one-frame missing
  texture — a genuine lod-in-frame-class artifact.
- **Fix sketch**: release under the mark's owner: `const releaseId = mesh.userData?.sfBoundEntityId
  ?? entityId;` then `releasePooledPresentationTextures(mesh, releaseId, this)`; or gate the release
  on the same `entityId == null || mark === entityId` test the mark-clear uses, so a different
  binding's lifecycle keeps its notes. (`entityId == null` is already safe — the early return
  preserves the notes.)
- **Effort**: S (one-line keying change + a pooledPresentationMarks unit test for the
  stale-key/mismatched-id case). **Magic-frame impact**: L today — dormant while no evictor writes
  `sfEvictWhenEmpty`; would be M if a texture-eviction lane ever lands. **Risk**: low — matched-id
  behavior is identical; only the mismatched path changes, and releasing under the mark is strictly
  closer to the binding's real lifecycle.

## Regression notes — W67 machinery verified at 9659573ef

### 1. Deadline-bounded arm (`_armDepthStage`, renderer.js ~21830-22185) — VERIFIED

- (a) min-1 is real: the collect loop's break requires `collected >= 2 &&
  armNow() >= collectDeadline` — a slice of 32 fat roots always yields ≥2 collected per arm; the
  restore loop's break requires `restored >= 1` — ≥1 restore per arm. Wholesale arm skips are
  capped by `SHADOW_DEPTH_LEDGER_MAX_SKIPS=2` (renderer.js:6034), so no state starves the drain.
- (b) a mid-slice-requeued root keeps withheld flags and re-collects fresh: `pending.set(root,
  entry)` preserves the withheld Set + `STAGE_SELF_DIRTY_KEY`; `legSet`/`unstagedByRoot` are
  arm-locals discarded at arm end — next arm runs a fresh `collectUnstagedShadowCasters` under a
  fresh `lightCensusSignature(scene)` mint (not the memo). No stale legSet can leak across arms.
- (c) `pending`-Map requeue preserves `{lodLevel, entity}`: `slice.splice(collected)` leftovers go
  back via `pending.set(root, entry)` (same object); explicit requeues write `{lodLevel, entity}`
  from the entry's destructured locals; the `finally` tail requeues `slice[restoreIdx..]` —
  `restoreIdx` is incremented before the deadline break so it points at the next *unrestored* root.
  One asymmetry verified harmless: leftover-only roots hit `pending.set + continue` and skip the
  `restored++`/deadline check — bounded by slice size ≤ 32, each iteration O(1).
- (d) `notePacedFrameSpend(armNow() - armStartedAt)` in `finally` debits the whole arm:
  census mint + `session.slice` render task + collects + restores + requeue work, not just collect.

### 2. Undrawable parking (`_parkedDepthStageRoots`, `_syncShadowCasterPolicyChecked` ~21633-21800) — VERIFIED

- (a) parked counts as queued: `queued = pending.has(root) || parked`; for a parked band<1 root the
  collect gate reads `parkedRecheck || !queued` → `!queued` false → no collect → falls to
  `band !== 1 && queued` → `allowCast:false` — that branch can only ever force castShadow off, so a
  parked root's withheld flags cannot be un-withheld by it.
- (b) a genuine dirtySeq bump unparks in both flows: upfront `dirtySeq > parkedEntry.seq` (or
  lightSig/ortho-cell drift) → `parkedMap.delete` + `parkedRecheck` → re-collect → non-empty → the
  withhold branch deletes the park again + requeues; empty → `parkedMap.delete` +
  `_withheldDepthCasters.delete` + `sfDepthUndrawableCycles` delete → normal sync restores.
- (c) parked + fresh empty collect → park released AND live flags restored (stale withheld Set
  dropped, `syncOpts` unmodified → `syncShadowCasterPolicy` re-derives under current policy).
- (d) arm-time parked sweep drops detached roots and clears STAGE_SELF_DIRTY/withheld bookkeeping
  (W68 parity with the pending sweep).
- (e) a leftover root with meshes beyond the 128-caster leg requeues to `pending` (`allOffered`
  false → `pending.set`, never parks).

### 3. Paced-ledger routing — VERIFIED

- (a) every ledger consult sits post-step or behind minItems; enumerated: reconcile + poll
  staged-iterator pumps (renderer.js ~2134/2181 — `iterator.next()` first, post-step break),
  hold-exempt collect/commit/kick/remint (~2540-2662 — `commitBounded && commitSteps>0` gate keeps
  ≥1 commit step per pump), `drainDeferredEnterSlice` (sectorEnterDefer.js:155 — `steps === 0 ||`
  guard), `drainEmitSlice`/`drainPresentationTail` (eventBus.js:349/416 — post-listener check, ≥1
  listener always), `_drainMeshBuildQueue` (renderer.js:19074-19081 — `usePacedLedger` and the
  shared predicate checks `itemsDone < minItems` *before* the ledger consult,
  admissionSliceBudget.js:36-38), `driveOpeningPublicationResume` (partsLibrary.js:6313,
  delta-brake + max-skips 2), depth arm (entry gate, skip cap 2), gltf compile drain
  (`GLTF_COMPILE_MAX_SKIPPED_FRAMES=2`, decodeTaskBudget.js:317).
- (b) `drainDespawnDisposeQueue` (renderer.js:1806-1845) is the one wholesale-skip site: it returns
  0 with the queue untouched (defer only) and `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS=2` forces a bounded
  min slice (`max(8, ceil(remaining/4))`) — entries cannot be dropped.
- (c) epoch semantics: `paceFrameEpoch` buckets spend per present, so same-frame slicers see each
  other's debits. The 8ms wall window only engages when `paceEpochNow() < 0` (headless, or pump
  stale > `PACE_EPOCH_STALE_MS=250`): there, two paced drains >8ms apart in one task can open
  separate windows → cross-slicer under-report inside a pathological single task. Bounded — every
  slicer still self-bounds by its private clock, and W70 widened 64→250ms precisely so ordinary
  slow frames stay on the epoch path. Noted as a residual, previously adjudicated.

### 4. Flag-only OFF→ON collect — VERIFIED

- (a) already-staged meshes: `_stageShadowDepthOnSettingEnable` uses
  `collectUnstagedShadowCastersFlag` (W71) — staged meshes excluded at mint → an already-linked
  caster is never withheld; the over-cover exception restores via the arm's empty/partial
  re-derive + `restorableCastShadow`.
- (b) withheld-set-includes-later-staged: over-cover withholds the whole subtree (staged included)
  → the arm re-derives genuinely-unstaged → non-leftover casters get
  `restorableCastShadow`-restore → over-withhold resolves at the arm. No permanent withhold.
- (c) exclusion parity: `collectShadowCastSubjects`, `collectUnstagedShadowCastersFlag`, and
  `collectUnstagedShadowCasters` all share `collectPotentialShadowCastSubjects`
  (shadowDepthAdmission.js:178-205) — spacefaceNoShadow / sharedContactShadow /
  authoredReadableFallbackLayer exclusions hold identically in all three.

### 5. reset:true prepare defer (physics.js ~370-455) — VERIFIED

- (a) post-sleep `_disableSg02DynamicAuthority` in `!_sg02Init && !_sg02` is a true no-op:
  `if (this._sg02 || this._sg02Init) this._sg02Token++` (physics.js:772) — no token bump, no
  teardown, only diag-field zeroes — nothing for a later mint to fight.
- (b) a caller abandoning the wait can't cancel the continuation: after the `setTimeout(remainingMs+1)`
  sleep, `_updateSg02DynamicAuthority` sees the backoff expired and mints `createSg02DynamicBodyOwner`
  → `_sg02` installs on settle → the next click finds a ready backend.
- (c) concurrent deferred prepares don't interleave mints: each snapshots `sg02TokenAtDefer`; the
  winner mints under `++_sg02Token`; losers' token compare fails → they adopt the winner's
  `_sg02Init` under `sg02InitJoinMs()` rather than minting; the stale tail is fenced by
  `sg02TokenAtPrepare !== this._sg02Token → return false`.

### 6. Variant interning (`_depthVariantCache`, shadowDepthAdmission.js:357-390) — VERIFIED

- (a) `alphaTest 0→1` re-mints: `{bits, variant}` is compared against live-derived bits every call —
  the alphaTest bit flips → new variant string minted and re-cached.
- (b) `side`/`shadowSide` feed `bits` verbatim (null→0; 0/1/2 distinct) — no normalization.
- (c) the cache cannot serve a stale variant under `material.needsUpdate`-style reuse: bits are
  recomputed from material state per call; the WeakMap only memoizes the last (bits → string)
  projection. Discriminant is 10 bits post-W73 (+alphaHash +vertexColors), string `a m x d c p s h
  z v` — prompt's "9-bit" phrasing superseded by W73's two additions.

## Lane hunts

### Hunt 1 — remaining same-seq staleness beyond `shadowCensusMutationEpoch`: no live channel remains

Every mutation channel that can flip the rendered light set, classified against the three bump
sites (precompile.js:180, precompile.js:198, disposeObject's isLight probe renderer.js:23439):

- **Un-bumped but unreachable mid-run**: `WeaponLightPool.dispose()` (`parent.remove` per light +
  group, weaponLights.js ~50-60) — reachable only via presenter `dispose()` (presenter.js:1061) at
  renderer teardown, where the scene is discarded anyway. `flightOverheadPresentation.dispose()`
  (un-bumped `light.parent.remove`) — zero call sites. The lazy `_overheadCues` re-mount seam
  (renderer.js:19987 `createFlightOverheadPresentation(this.scene)` adds a light un-bumped) —
  `_overheadCues` is only ever assigned (:8903 eager, :19987 lazy-guard) and never nulled, so the
  seam fires once pre-first-arm and can't recur mid-run.
- **Structurally excluded by design**: authored GLB/pool parts cannot carry lights — rejected at
  load (assetLoader.js:1493-1494). The vfx event pool is visible-forever intensity-only
  (vfx.js:14940-14980, "count must never change at runtime"); the weapon pool is identical
  (weaponLights.js:19-30); sector lights mount once (renderer.js:8418-8421); the nozzle light was
  made eager (:8899-8903) precisely because a lazy mount relinked mid-flight. `livingHullPresentation`
  attach/detach carries no lights (its meshes pin `castShadow = false`, livingHullPresentation.js:207,375).
- **Not channels**: `scene.environment` writes (graphicsLab.js:414/635/646, renderer.js:7999/8630)
  — env is not a `lightCensusSignature` input and depth variants don't consume it. `.layers` writes
  on light objects — none exist. `scene.clear()` — absent. `removeFromParent`/`remove` on
  light-bearing owners — none beyond the teardown paths above (light parents are the scene and the
  pool groups; the pools never remove mid-run). Packaged-body swaps — authored content, no lights.
  `light.color`/intensity writes — not signature inputs (deliberately: `applySectorLighting` lerps
  in place, fleetLook.js:70-90).
- **Residual memo-sig drift within a seq** (e.g. an invisible-ancestor flip on a light-bearing
  subtree): `lightCensusSignature` walks invisible ancestors, so a flip changes the live sig without
  an epoch bump — but there is no light-bearing subtree that gets hidden mid-run (verified above),
  and the arm always mints `lightCensusSignature(scene)` fresh, so the memo's ~1-frame staleness
  only ever narrows the parked-release compare to a 1-seq lag. Safe direction, bounded.

Net: the epoch reaches every channel that can fire mid-run. The design holds the live light set
count-static so the signature's membership keys cannot drift outside the three bumped seams.

### Hunt 2 — `sfBoundEntityId` clear at `_unbindPresentationMesh`: all readers verified

- **`clearPooledTransientMarks` / `syncPooledPresentationIdentity`** (pooledPresentationMarks.js:9-16,
  renderer.js:8224-8247): after the clear, `previousId` is null on any previously-unbound mesh —
  the `previousId` release now fires only for bind-without-unbind (direct A→B rebind), where it is
  still the correct release. For every `(id, mesh)` unbind, `releasePooledPresentationTextures`
  runs first — the sync path is redundant backup except under mismatch → Finding 1.
- **`shadowPolicyEntityOf`** (renderer.js:2798-2810): `sfBoundEntityId` is a fallback behind
  `presentationEntityId`, which is kept at unbind — boundary meshes resolve identically. A detached
  mesh whose only key was the cleared mark now resolves `entity=null` → `_shadowPolicyOptions(null)`
  → `allowCast=true` + `lodLevel=null` (over-cast + forced traverse for one frame) — but detached
  meshes aren't reached by the top-level collect walk, so reachability is ~0.
- **`presenter.js:867 _foreignMarkBinding`**: the cleared mark skips the first check; the
  `sfStableEntityKey` check (survives unbind — cleared only on template clones) still catches
  foreign bindings for every slot with `boundKey`. Slots minted with `boundKey: null`
  (contactMarks.js:230) lose foreign detection in the unbind→re-stamp window — the mesh is off-scene
  there, and `clearPooledTransientMarks` strips the transient marks at re-bind, so a stale decal
  can't draw on the new owner. Bounded, invisible.
- **`partsLibrary.js:10775` template scrub** (deletes sfBoundEntityId + sfStableEntityKey + all
  shadow keys + sfDepthMark) and **`crucibleGhost.js:27`** clone projection — both correct: clones
  must not inherit the template/ source binding.
- `sfSharedTextureNotes`/`sfSharedTexturesNoted` are not in the template scrub — dead data on a
  clone, overwritten at its first `syncPooledPresentationIdentity`; the live notes stay on the
  source mesh for its own release. Harmless.

## Audit notes / limitations

- All reads via `git show`/`git grep` against `origin/devin/1791064509-perf-w60 @9659573ef` —
  `git worktree`/`checkout` of that branch on this host exceeded 8 minutes and was abandoned; the
  report branch checkout was used only for the report file. Same objects, read-only.
- SwiftShader GL — no GPU-cost conclusions from timings; all findings are mechanism-level.
- The "silent attach dodges re-collect" assumption the code itself flags (renderer.js:21758
  comment) was spot-checked across the named covers: `swapTo` invalidates (W70), authored
  readmission re-queues through `queueOrRequestAuthoredUpgrade` → `onAuthoredAssetSwap` exact
  bookkeeping, livingHull attach is caster-free, template clones scrub shadow keys. Residual is the
  withheld-union cheap re-stamp only — the arm's own `collectUnstagedShadowCasters` re-derive
  catches any missed mesh at arm-time, so a missed invalidate means one caster draws unstaged for
  ≤1 arm latency, self-healing. Watch item, not a confirmed hole.
