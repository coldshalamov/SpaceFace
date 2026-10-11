# Wave 138 — Global Audit Report

Lane: `global` | Branch audited: `devin/1791504143-perf-w120` @ `e982b5a96` (HEAD unchanged through audit) | Prior: `wave121`, `wave136`

**saturated: true**

Within this lane's scope — the presented path (prepareFrame → syncEntityViews → render route → present), the boot path (index.html → main.js → first frame), and the new-class areas no lane owns — no unaddressed, material, evidence-supported optimization remains. Every open lever found is either owned by an active lane, explicitly deferred, or in-flight repair. All GPU/frame-time magnitudes below are hardware-unverified on this box; CPU-side mechanism evidence is what the tags certify.

---

## Prior items — ownership/closure status

| Item | Status |
|---|---|
| B1 whole-scene traversal (~11 ms/frame owner-measured, 16.5k mounted nodes) | **Owned — render-diet lane.** W137 produced the T1–T14 traversal census and six implementation-ready specs (F1 triple-walk dedup, F2 flat drawable registry, F3 dirty-root updateMatrixWorld, F4 blit fast-path, F5 caster-ancestor memo, F6 hidden-freeze/park widening); W138 prompt scopes them again. Not re-audited. |
| B5 shader-program diversity (~26 unique/frame, 36 first-draw links) | **Owned — render-diet scope item 3.** In flight. |
| B9 heap floor 485 MB | **Owned — heap-floor lane** (cache-bucket audit + detached liveness, first wave). Not re-audited. |
| B2 triple-copy (fence pack → syncEntityViews → applySnapshotPoseToMesh) | **Partially landed.** `packPresentationWorldToFence` dirty-column copyRow elision is in (snapshotFence.js:240-459 — clean rows copy verbatim, packedSlotGens identity coverage). The second copy (fence→mesh pose apply) persists but is bounded per-visible-entity, lerp only on x/z/qy/qw + bank/pitch. Direct-bind remains an architectural idea, not a wave item. |
| B3 sim-atomic bursts (econTick p50 2.7 / p95 3.9 ms) | **Persists.** Relief path is PR #260 — see below; it never merged. Golden-hash constraint unchanged (`0b33dde1…`, scenario 47a). |
| B4 physics FFI allocs | **Persists** — same relief path as B3. |
| B6 boot/save atomic legs | **Landed progressively** (speculative prepares, worker verdicts, cardEnv projection, lazy fills). Three verified defects are in-flight repairs by the parent (F1 gen-guard saveSystem.js:4916, F2 _pendingSlotRearm :394-404, F3 peek-fill stale stamp saveLoad.js:861-868) — confirmed present at this HEAD, all inside the exclusion list. |
| B7 per-frame instanced submission sync | **Landed.** |
| B8 drain machinery | **Working as designed.** emitSlice paced ledger (entity:destroyed once-only floor, COSMETIC_OVERFLOW_FLOOR=16, MAX_QUEUED_SLICED_EMITS=8, drain budget 8/frame, scaled tailFloorMs) verified again at presentationRunner.js:1150-1289 + eventBus.js. |
| B10 vfx/ui frame cost | **Bounded.** vfx is event-driven with small live sets; uiRoot.frame gates every deck on visibility (uiRoot.js:1643-1705). |

## PR #260 follow-through — correction required

The brief states it merged. **It did not.** PR #260 (`devin/s1-sim-worker-spike`, head `875e103fc`) is OPEN: `git merge-base --is-ancestor` fails, `git branch -r --contains` lists only its own branch, and the PR page shows State: open. It is 45 commits ahead of master and master is 195 commits ahead of its merge-base — the branch is now substantially stale. The scoreboard's `stageA.mergeCommit 8fad14efe` is a merge of origin/master *into* the spike branch, not a landing.

On master, the Phase-14 seam it builds on (`src/core/simWorker{,Host,Protocol}.js`) is present but **dormant**: `phase14OptedIn` requires `state.__simWorkerPhase14 === true`, which no production code sets (only `test/performance-worker-save-ui-audio.test.mjs` touches it). The postMessage transport is never auto-selected — "retained only as an explicit lab seam." So nothing in its machinery pushed render-adjacent work onto the sim tick or added clone costs to the presented path; the lane simply never shipped.

Consequence: the wave-136 verdict stands unexecuted — PR #260 remains the largest single lever for B3+B4 (whole-sim worker lane: SAB envelope rings ~8.75 MB arena, v8.serialize codec, `?simLane=main` escape hatch), but it now needs a re-merge against 195 commits of drift before it can be pursued to merge.

## Ranked findings

### G1 — Sim-worker lane never landed; B3/B4 relief is stalled, not spent
- **Evidence:** PR #260 open @ `875e103fc` (verified above); dormant seam src/core/simWorkerHost.js (`phase14OptedIn`, zero production callers); sim-atomic bursts persist (wave-136 B3 evidence).
- **Mechanism:** every tick-paced O(world) burst still runs on the presented thread's budget — econTick, spawn sweeps, physics FFI marshaling all contend with prepareFrame inside the same rAF. The paced-emit machinery bounds the *blast radius* but cannot move the *atomic unit*; only the worker lane does that.
- **Fix sketch:** re-merge `devin/s1-sim-worker-spike` onto master (195-commit drift — Stage B's facade-miss census is the conflict surface), keep `simLane=main` escape, land behind the existing flag, verify golden hash `0b33dde1…` bit-identical before defaulting.
- **Effort:** L (conflict surface is large; the design work is done). **Impact:** H — this is the only remaining lever that removes work from the presented thread rather than pacing it. **Risk:** medium — 47a golden hash is the gate; SAB codec is already proven on the branch.
- **Evidence:** MECHANISM_VERIFIED (status verified; mechanism per wave-136 measurement).

### G2 — `peekSaveCardData` ships the full multi-MB envelope per lazy row fill
- **Evidence:** saveSystem.js:5041-5042 posts `{raw}` (the whole slot string) to the worker for a 5-field card projection; saveLoad.js:857-868 fires it per memo-miss row mount.
- **Mechanism:** on save/load screen scroll, each uncached visible row costs a multi-MB structured clone on the presented thread (the parse itself is correctly off-thread). Bounded by `_slotDataMemo` LRU and by consult-time `cardEnv` short-circuit (saveSystem.js:5016-5018, 2797), so it fires only for rows the index-validation walk hasn't covered — a scroll-through worst case of one clone per row.
- **Fix sketch:** prefer `cardEnvs[slot]` from the already-landed validation verdicts before dispatching the peek (the verdicts carry cardEnv at saveSystem.js:2449); when a peek must run, ship a slot-keyed cardEnv reference where the worker already parsed the same blob rather than re-posting `raw`.
- **Effort:** S. **Impact:** M on the save/load screen only (not the presented path). **Risk:** low.
- **Evidence:** MECHANISM_VERIFIED.

### No other new-class findings
- **Audio synthesis graph/frame:** `_startFrameLoop` posts one bounded background task per rAF (audioSystem.js:6996-7225); `_frame` is ~25 cadence-gated calls — `_syncRemoteEngines` runs at 10 Hz on version-latched buckets with pooled rows, `_recomputeMusic` on its own clock, `_tickAlarms` gated. Clean.
- **UI DOM writes/frame:** uiRoot gates every deck on visibility; hud.frame runs multi-clock cadences (numeric/target/overlay/radar/contactRoster all on `consumeHudClock` signatures); forced-layout reads are event-driven (offsetWidth restart sites :2519/:2817/:2896/:3074/:4466) and `getBoundingClientRect` at :6047 is behind a resize-staled memo (`objectiveEdgeBoxes.stale`). Clean.
- **Event-bus payload clones:** pooled payloadSnapshots on hot events, listenerSnapshots dirty-flag arrays, deferredPool. Clean.
- **Decode-byte duplication:** whole-ship GLB fetch-once (`loadGltfDocument` assetLoader.js:2310+, `cache:'no-cache'` once, same buffer through parse); `dedupeGltfTextureSources` paced through scheduleGltfCompile; authored task machinery has residency-owner accounting + ownerlessWarm reclaim. Retained-heap duplication is heap-floor lane scope — not deep-audited.
- **Always-on polling → evented:** no unbounded pollers found; remaining intervals are self-clearing or cadence-bounded (station broadcast, loading-gate pulse, claim-lapse sweeps amortized inside `unionOwnerSector` at assetResidency.js:926-935).
- **Structured-clone sizes on worker boundaries:** save-worker posts carry full `raw` (above); the restore path's multi-MB clone on `save:restoring` is deferred BOOT-F7.
- **GC-visible allocs on presented path:** `syncEntityViewsSteps` allocates only on spawn/opening rows (`spawnedSlots.slice`, opening concat); `_entityViewCullBounds` reuses `this._entityViewBounds`; queryOptions mutated in place. Clean.
- **Per-frame O(scene)/O(entity) walks:** none remain on the render side — all entityList scans found are cold paths (cook/opening arms, newGame/persistence sweeps) or sim-side ticks (B3 class). GL sync reads (`readPixels`/`getError`/FBO status): none outside lab/diagnostics. Ungated console writes on hot paths: none.

## Regression notes (verified at HEAD `e982b5a96`)

- **Sector-claim machinery (W136/W137):** `claimArmClass` (assetResidency.js:842-845 — arm role OR decodeWarm), `unionOwnerSector` threading per-POST with arm class (:919-941), reclaimWarm resident+request branches posting explicit `true` (:521), retain merge path calling `claimArmClass(postMeta)` (:409-412), `sectorLiveClaims` immortal/live-claim dual book (:853-858, :871-876), amortized same-sid prune (:930-935). Probe `test/asset-residency-sector-claims.test.mjs` on node24: **6/6 pass** (warm-arm lapse on all four exit-warm mints; posting-class lapse-ability; request-clamp). The F-1 defect (arm branch deletes live claims unconditionally at :853) is confirmed still present — inside the in-flight exclusion, parent's repair pending.
- **Save machinery:** deferred-consume gen guard at saveSystem.js:4916 present (with F-1 defect — specByteHit verdicts discarded on sig mismatch, in-flight); `peek_card_data` worker op at :5041 present; `_pendingSlotRearm` coalescing at :394 present (with F-2 defect, in-flight). All three named defects verified real on the code read; none re-reported.
- **W134/W135 machinery spot-check:** emitSlice paced ledger, dirty-column fence pack, listenerSnapshot dirty-flag arrays, presentation-tier drain — all present and consistent with their landing notes.

## Excluded/deferred (not findings)

In-flight: saveSystem F1/F2/F3 (above), popin claim F-1/F-2/F-3. Deferred/WONTFIX: BatchedMesh specimen gap, loading GL pause, ambient compile-tail, LOD-F2/F3/F5, LOD-N4, world-store machinery absent, BOOT-F3a, BOOT-F7, F4/F5/F9 tick-paced emit slicing, F6 combat:damage intern, nxb-059 stale source-scan, all preexisting test failures. Preexisting failures were not re-run.
