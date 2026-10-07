# Wave 103 — in-flight-hitches audit

Audited `devin/1791064509-perf-w60` @ `87c75829a` (W102 machinery landed). Read-only audit; no code changed, no app run.

`saturated: false` — four contract-preserving residuals remain: one correctness-direction defect the landed W102 note machinery still carries, two bounded-cost wins, one rare-window enumeration.

## Findings (ranked)

### F1 — `noteRemoved` treats "visited" as "fully measured": a root popped but mid-descent over-retracts its whole subtree and under-counts

**Evidence:**
- `src/render/shadowReceiverTally.js:71-74` — `visits` stamps each live-popped node individually; the node itself counts at 67 but its children only push at 76 — a subtree's receivers accumulate incrementally across paced beats.
- `src/render/shadowReceiverTally.js:163-168` — the landed W102 gate: `visits.get(root) !== undefined` → write `{delta:-δ, seq}`, where `δ` is the FULL subtree measurement taken at note time (144).
- `src/render/shadowReceiverTally.js:151, 58-65` — `detached.add(root)` ghosts the root's still-pending descendants: they pop later and skip without ever counting.
- `src/render/shadowReceiverTally.js:50-66, 231-235` — the walk parks only at 512-multiples; notes land between resolve beats; `stamped = walked + Σnote.delta` for visited-prior-to-note roots.

**Mechanism:** root R pops at seq N (counts itself if a receiver) and pushes its children; the walk parks at a 512-boundary mid-subtree. Between beats R is removed: `detached.add(R)` (151), `visits.get(R)` returns N → `-δ_full` written (163-168). The walk resumes, skips R's remaining descendants via the ghost check, finishes. `walked` measured only R's popped prefix; the stamp retracts `δ_full` → `stamped = correct − (δ_full − prefix_δ)` — **under-count** by the receivers still on the stack. W102-F1's fix moved the under-count from unvisited roots to *partially-visited* ones: the visit gate answers "did the walk reach this root", not "did it finish it". Consumers make under-count the bad direction — `_shadowReceiverCount > 0` gates `scheduleRealtimeShadowRefresh` (renderer.js:24277-24288, 24818-24845): a stamped under-count can drop `shadowMapActive` (frozen stale map / skipped instance submissions) or under-scale `prepareActiveShadowCamera` while receivers exist, persisting until the next dirty heals (seq-matched stamps clear `dirty`; notes don't bump `dirtySeq`).

**Fix sketch:** write `-δ` only when the walk has *finished* `root`'s subtree. Track `notedWalk.lastPopped` beside the stamp (one field write at 73); a removed root is finished iff `lastPopped` is no longer inside it — pre-order DFS pops a subtree contiguously, so an ancestor-walk of `lastPopped` for `root` is O(depth) per note. Mid-descent removals write no note: the popped prefix keeps `stamped` over-count, the contract's legal direction (95-96). Same gate on the `note.delta = -δ` upgrade at 157-162. Effort **S–M**. Magic-frame impact **M**. Risk **low–medium** — note-path bookkeeping only; every miss direction stays conservative-on.

### F2 — unconditional `visits` Map stamps tax every live node of every stepped recount for coverage almost never consulted

**Evidence:**
- `src/render/shadowReceiverTally.js:71-74` — `notedWalk.seq += 1; notedWalk.visits.set(object, seq)` on EVERY live pop, unconditionally.
- `src/render/shadowReceiverTally.js:153,163,233` — `visits` is consulted only via `.get(root)` for roots a note names (never iterated wholesale). A clean walk — no mid-walk add/remove, the common case — stamps tens of thousands of Map entries and consults zero of them.
- `src/render/shadowReceiverTally.js:66-74` — the stamp sits inside the paced loop: every beat pays ~one Map insert per visited node on top of the `receiveShadow` test, inside the `RECOUNT_SLICE_MS` budget that decides how much real work fits.

**Mechanism (lane (d) enumeration):** `visits` has subscribers only while `notedWalk.notes.size > 0 || notedWalk.detached.size > 0`. A no-notes walk can skip stamping entirely: a root popped pre-arm carries no `visits` entry, so a later note treats it as *unvisited* — an add note absorbs (`visitSeq === undefined → stamped += delta`, 234) and a remove note skips the `-δ` write (163-167 gate). Every lazy-arm miss errs over-count — the contract's legal direction (95-96, "over-counting errs conservative-on"). Keep `notedWalk.seq` incrementing unconditionally (it backs `note.seq` ordering); gate only the Map write. Once armed the walk stays armed — `detached` membership persists until `resetNotedWalk` — so coverage degrades monotonically into the safe direction.

**Fix sketch:** `if (notedWalk.notes.size > 0 || notedWalk.detached.size > 0) notedWalk.visits.set(object, notedWalk.seq);` Effort **S**. Magic-frame impact **M** — recounts fire on every shadow-relevant dirty resolve, and on live scenes ~15-30% of each paced beat is pure Map write that no consumer will read. Risk **low**.

### F3 — hidden-freeze mints have no queue-age gate: first-cycle cull→show flaps pay the full mint+restore pair the dwell was built to prevent

**Evidence:**
- `src/render/renderer.js:23366, 23418` — freeze queue sites run inside `syncEntityViews`' hidden loop; the drain runs at `23427` — a freshly queued head entry mints **the same pass**, zero passes culled.
- `src/render/renderer.js:21201-21205` — the flap dwell defers only when `sfHiddenFreezeLastShowSeq != null && viewSeq - lastShow < HIDDEN_FREEZE_FLAP_DWELL`.
- `src/render/renderer.js:23461-23471` — `sfHiddenFreezeLastShowSeq` is stamped only inside the `sfHiddenFrozen === true` branch — only on re-shows of roots that were *minted*. A never-frozen root's entry carries `lastShow === undefined` → dwell never engages on its first cycle.
- `src/render/renderer.js:21209-21210` — the `mesh.visible === true` drop reads last pass's flag: the drain (23427) runs before this pass's visible loop flips it, so a root re-shown this pass still mints if it was queued hidden last pass.

**Mechanism (lane (c) enumeration):** the two queues have INDEPENDENT budgets — `minted`/`scanned` are per-drain locals, each ≤6 mints + ≤256 scans per pass — so there is no literal queue-vs-queue starvation. The real churn cost is the flap cycle itself: cull → queue → mint (0-1 pass old, dwell cannot engage first cycle) → show → unfreeze-queue → restore → repeat. A root oscillating at period ≤ ~4 passes pays ~2 subtree traverses per cycle for ~1 compose-frame saved — sustained net-negative amortization, exactly the waste class `HIDDEN_FREEZE_FLAP_DWELL` exists to prevent, gated one cycle too late to cover it. Dwell-deferred entries keep head position and re-consume scans each pass, but expire within the dwell — bounded, not starving.

**Fix sketch:** stamp `ud.sfHiddenFreezeQueuedSeq = this._viewSyncSeq` at queue time (21174) and extend the dwell predicate to `viewSeq - Math.max(lastShow || 0, queuedSeq) < HIDDEN_FREEZE_FLAP_DWELL` — a root must stay culled ≥3 consecutive passes before paying its mint. Steady-culled roots lose ≤2 passes of compose savings (deferral is benefit-only per the machinery contract); flapping cohorts never mint. Effort **S**. Magic-frame impact **L–M**. Risk **low**.

### F4 — remount-abandoned mid-teardown corpse leaves a partially-disposed subtree live; `_corpse` mismatch guard unreachable in-tree

**Evidence (lane (a) enumeration — every abandon path):**
- `src/render/renderer.js:2049-2055` — `m.parent != null` (remounted) → `iter = null`, advance, no note. Correct for the tally (alive), but the parked `disposeObjectSteps` already fired per-node hooks on visited nodes — `disposeObjectNode` releases owner instances, detaches authored motion, fires residency/boundary hooks, conditionally disposes geometry/materials (`28429-28518`). The remounted subtree draws partially-released state until its new mount re-prepares.
- `src/render/renderer.js:2060` — `iter._corpse !== m` re-mint: `head` advances only at `iterDone` (2100), so `queue[head]` IS the parked corpse; the reset at 2113-2117 runs only on a fully-drained queue where `iter` is already null — unreachable through any in-tree path, purely defensive.
- `src/render/renderer.js:18084-18098, 21774-21786` — `destroy()`/`clearAllMeshes()` flush twins synchronously dispose+note EVERY queued corpse — the parked iter's corpse included (head never advanced past it) — then null the iter → covered.
- `src/render/renderer.js:2070-2080` — mint-fail → advance with NO note and no `sfDespawnNoted` → corpse receivers stay counted (over-count; conservative-on, self-heals on next dirty recount).
- `src/render/renderer.js:2091-2096` — torn iter → `_measure = null` → `noteShadowMeshRemoved(m, null)` → dirty recount → exact heal.
- Sweep twins (leftover 12792-12809, sector-departure 15586-15597) walk `_meshes`, which never contains queued corpses — no overlap.

**Mechanism:** the only uncovered cost is remount: a corpse mid-teardown that gets re-parented keeps a partially-torn subtree — owner-instance slots released, motion detached, hooks fired — and the remount path must re-arm everything a fresh mount would. Cost = wasted partial teardown plus a possible one-frame GL re-upload burst / released-instance draw. Rare: every push site detaches before queueing, so it needs a pool/remount path re-adding the queued mesh.

**Fix sketch:** mark abandoned corpses `ud.sfDespawnPartialTeardown = true` so a remount path can re-run its prepare arm (or let the new owner complete the teardown — the contract already forbids disposing live content). Effort **M**. Magic-frame impact **L**. Risk **medium** — touches remount contracts.

## Regression block — W102 machinery (verified concrete)

| Item | Verdict | Evidence |
|---|---|---|
| hidden freeze/unfreeze queues: mints + drops | **Sound** | `renderer.js:21170-21263`: flag-gated enqueue (21171-21176, 21230-21235); ≤6 mints AND ≤256 scans, w-pointer compaction (21188-21192, 21246-21250); drops on unflagged/re-frozen/re-queued/`matrixAutoUpdate!==true`/`visible===true`/`!parent` (21197-21210, 21252-21258); flags deleted at unbind (21434-21445). |
| flap dwell | **Sound + first-cycle gap (F3)** | `21201-21204` vs `23471` stamp — `_viewSyncSeq`-based, not wall clock; covers minted cycles only (F3 enumerates the gap). |
| notedWalk detached-set + visit-gated notes | **Sound + residuals (F1, F2)** | unconditional live-pop stamp 71-74; detached-skip precedes stamp 58-65; `-δ` write gated on visited 163-167; `{+δ→-δ}` upgrade 157-162; unvisited-note pair delete 153-156; absorb `visitSeq===undefined || <= note.seq` 232-235; `resetNotedWalk` demotes seqs + clears detached 99-111; `noteAdded` deletes `detached` 138. |
| measured corpse notes | **Sound** | `disposeObjectSteps(m, corpseMeasure)` mint 2066-2069; iterDone note `measure.receivers` 2102-2108; `sfDespawnNoted` skip+delete 2107; torn-iter `_measure=null`→dirty recount 2091-2096; remount skip 2049-2055; all push sites un-noted (2174-2178, 16644, 22043, 22218, 23034); roster-prewarm note+flag contextLost-only 20739-20741. |
| stepped sweeps share leg clock | **Sound** | 12792-12809 (`>=8 \|\| pacedFrameSpend() >= PACED_FRAME_BUDGET_MS`), 15586-15597 (`providerSliceDue()`); superseded mid-teardown = scene-removed half-disposed corpse (contract); measure feeds `noteShadowMeshRemoved` exactly. |
| drawnCull LRU | **Sound** | `visualCullRadius.js:89-117` — consulted only on `keyMoved`; hit halves cadence (`calls = 600>>1`, 104); outgoing-key stash + ≤3 FIFO eviction; served radius is the key's own measurement. |
| retire-burst generation validation | **Sound** | `presentationWorld.js:1317` mints `{slot,gen,resident}` re-checked at 1339-1340; `1354` mints `{id,gen}` honored by `retire(id,gen)` at 747-751 — recycled slot/resurrected id not retired. |
| cook census session key | **Sound** | `renderer.js:10765-10788` — census keyed `{scene, _liveSectorCookGeneration}`; the four legs share `census.drawables`; session mints fresh `keep` per call. |
| per-call keep set | **Sound** | `openingGpuAdmission.js:506` — fresh `keep` Set per `withOnlySubjectsDrawable`; ancestors+descendants join (510-514); `session.drawables` iterated, `session.keep` never read (517-522). |
| presented-frame `next()` guards | **Sound** | `renderer.js:24956-24976` arm-time guarded (throw → `{done:true}`); 25320-25331 in-frame drain guarded; 25389-25397 timer-gap drain guarded; 25333-25339 declared sync fallback. |
| paced roster prewarm | **Sound** | needsWork early-out 18272-18295; cohortOwed sync-lap check 18323-18327; mounts call `_markShadowReceiversDirty` not added-notes (18359, 18451, 18476); per-spec settled promises join `_rosterPrewarmPending` via observePipelineAdmission (18305-18309, 18400-18404, 18456-18460, 18481-18485); attempt stamps `_rosterPrewarmLeafWarmed` (18471) / `_rosterPrewarmCatalogAttempted` (18500); drain-end bare-rock upgrade pass 18493-18499. |
| scene.updateMatrixWorld dispatch | **Sound** | `renderer.js:27594-27600` — one explicit no-force walk per presented frame replaces the per-pass repeats; vendored skip intact (`vendor/three.module.js:137-142`: `!force && mWNU===false && sfMatrixFrozen`); the Steps twin mirrors every early-out including the frozen elision (`staticChildMatrices.js:249-253`). |

## Lane residuals

**(a) despawn-iterator abandon coverage — enumerated in F4.** Every in-tree path either lands its note or correctly skips it (remount = live content, note unsent by design). Enumerated missed-note costs: remount → none for the tally, but the half-disposed live subtree is the residual (F4); mint-fail → over-count until the next dirty recount (conservative-on, bounded); the `_corpse` mismatch re-mint → unreachable in-tree (head freezes at the parked corpse; the only queue reset nulls the iter).

**(b) `sfDespawnNoted` survival — SAFE.** Flagged roots are unreachable post-release: the roster-prewarm flag mints only on the contextLost path (20739-20746) which `continue`s past the push (20751), and the release array is cleared at 20716 first. Every other push site unbinds first — `releaseRebuildBridge` (2174-2178), destroy-bridge (16644), `releaseRebuildBridge`/`destroyBridge` (22043, 22218), `rebuildShipMesh` (23005 before 23034) — and `_unbindPresentationMesh` deletes `sfDespawnNoted` (21434-21445). No push path skips unbind; a flagged mesh reaches a queue only through an out-of-band remount, and the worst case is one skipped removal note → over-count → conservative-on. No defect.

**(c) unfreeze vs freeze backlog — independent budgets; flap-cycle waste is F3.** The queues do NOT share the 6-mint cap — `minted`/`scanned` are per-drain locals, so each drains ≤6 mints + ≤256 scans per pass (≤12 mints + ≤512 scans combined). Both drains run inside the same `syncEntityViews` pass (freeze 23427, unfreeze 23825). A cull→show→cull cycle mints the freeze one pass and the unfreeze the next: no starvation between queues, but sustained period-≤4 flaps are net-negative — ~2 subtree traverses spent vs ~1 compose-frame saved per cycle. Dwell-deferred entries re-consume scan slots each pass (kept via `pending[w++]`) but expire within the dwell window — bounded.

**(e) remaining presented-frame walks, ranked by worst-case node count:**

1. `scene.updateMatrixWorld()` — O(live-unfrozen + dirty-forced descents) every presented frame (`renderer.js:27600`) — atomic irreducible floor; `sfMatrixFrozen`/`sfCullFrozen` prune culled hulls; coverage extensions are F3-adjacent.
2. `renderer.render`'s projectObject — O(visible subtree nodes) per pass — native `visible`-flag prune; irreducible.
3. `syncEntityViews` query + hidden/visible row loops — O(candidates + hidden+visible) of O(1) work (`23324-23847`); retain-cache skips the spatial collect on quiet frames.
4. `scanPresentedDrawables(scene)` — O(visible-scene) but gated to every 30th pending frame or uninstrumented growth.
5. `lightCensusSignatureSteps` re-mint — O(scene) amortized ≤4 ms per resolve while the stale signature serves; storm-pinned after 4 supersedes.
6. Despawn drain corpse teardowns — `disposeObjectSteps` under `≥8 || pacedFrameSpend()` deadline + backlog-scaled count cap (2030-2111).
7. notedWalk stepped recount — ≤4 ms/resolve slice + per-pop Map stamp (F2) (`shadowReceiverTally.js:202-253`).
8. Hidden freeze/unfreeze drains — ≤12 subtree mints (O(subtree) each, ~50-200 nodes packaged) + ≤512 flag scans (`21179-21263`).
9. Program readiness poll — O(programs ~hundreds)/frame while `unreadyProgramsPending`.
10. `_rebindPresentationMeshesSteps` / `packPresentationWorldToFenceSteps` / `updateFromEntitiesSteps` — parked iterators ≤4 ms/frame.
11. `_flushMeshReleasePending` — O(pending ∪ 5 registry member sets) once/frame (21348-21357).
12. `settleRebuildBridges` ≤32 rows (2185-2225); `endRenderEntityFrame` ≤256 visits (`renderEntityFrame.js:150-172`); `_sweepDetachedDepthStageRoots` O(parked+pending maps) inside a measured arm (26558-26581); `_syncShadowMapEnabled` non-tally `scene.traverse` fallback only when the tally is absent (27261).
13. Bloom brick diagnostics (`describeUnstampedVisibleGeometries` et al.) — O(scene) only on frames that already blew the threshold, by design.

Everything heavier — residency reconcile/reattach/lease drains, admission legs, emits, cooks — rides stepped iterators under `PACED_FRAME_BUDGET_MS`/4 ms bounds. No remaining legal O(scene)-per-presented-frame walk outside the bounded failsafes and the atomic compose at 27600.

## Prior-wave adjudication notes

- Lane (a): W102-F2's stale-retire mechanism is fully landed (`{slot,gen,resident}` and `{id,gen}` both validate at retire); remaining abandon-path coverage enumerated in F4 — no note-loss path in-tree.
- Lane (b): clean — the flag cannot reach a queue through any in-tree push.
- Lane (c): W102-F1's visit-gated `-δ` closed the unvisited-remove under-count; the same note shape still over-retracts partially-visited roots — F1. Queue-side, the flap dwell covers minted-cycle roots only — F3.
- Lane (d): visit stamps are contract-required only while notes/detached are non-empty — F2.
- Sim determinism untouched — every finding is render-side bookkeeping; golden `0b33dde18752ca52ee6b6be25ded38ab6e86899dc6444a7e47842a2bb785b2d1` unaffected.
