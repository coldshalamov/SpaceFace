# W102 — boot-loading lane audit

Branch audited: `devin/1791064509-perf-w60` @ `52c74cd89` (worktree `C:/Users/Administrator/repos/SpaceFace-w60`).
Audit-only; no code changed, nothing run. All line numbers verified at this HEAD.

`saturated: false`

---

## Regression notes — W101 machinery (landed as 230b88e42), verified at HEAD

1. **compile-reveal invariant restore** — HOLDS.
   (a) `await stampSubjectEnvAsync(subject)` runs before the reveal at all six compileOne sites: `:11898-11903` (opening), `:12957-12965` (materialSettle — uses the ancestor-aware reveal), `:13385-13387` (pool seal), `:15009-15021` (rock pools — stamped only when the material is not already linked), `:16063-16065` (late), `:16231-16233` (rescan). Sync `whileRevealed` at `:11889-11892` and ancestor-aware variant at `:16012-16023`; async `whileRevealedGroup` at `:16027-16048`.
   (b) `_compilePostRoute` (`:27617-27666`) invokes `compileScenePipelinesForRenderTarget` / `capturedPass.compileScenePipelines` synchronously — the work expression is evaluated before `Promise.resolve`, so traverseVisible's light census runs inside the reveal.
   (c) `whileRevealedGroup` `await`s `run()` inside `try` and restores LIFO in `finally` — reveals genuinely hold across suspension.
   (d) No sync `whileRevealed` site wraps a suspending call (all six wrap the sync `_compilePostRoute`).

2. **touchScenePipelines drawableSession forward + scopedPendingWindow** — HOLDS.
   (a) `bloom.js:2203-2205` forwards `options` (incl. `drawableSession`) into `touchSubjectOnExactTarget` — the bloom branch now carries the session at `renderer.js:10755` (`touchExactTargetSubjects`, always-taken bloom branch). (b) `bloom.js:1275-1283` `pendingOnlyWindow` at `:1275-1276` OR'd into `scopedPendingWindow` with `unreadyProgramsPending === true`. (c) `UNREADY_PENDING_SWEEP_FRAMES = 30` (`:1147`) failsafe full-traverse still fires every 30 frames (`:1294-1296`).

3. **packedSlotGens generation-keyed dedup** — HOLDS.
   (a) `snapshotFence.js:414` Map; `packRow` identity guard `:415-420` reads `world.slotGenerations[slot] >>> 0` (entityIds fallback), skips only same-identity. (b) `copyRow` fast path `:422-433` re-checks generation equality; `setGeneration` stamped `:463-468`; retire+realloc bumps defeat the skip. (c) post-append identity scan `:492-505` gated on `worldChurned` walks `world.liveSlotValues()` — covers removeActive swap-move and retire+realloc. `mintedSlots` frozen prefix `:477-481`.

4. **notedWalk detached-set + negative-delta notes** — HOLDS (with one residual gap — see F5).
   (a) pop-time ancestor-liveness check `shadowReceiverTally.js:58-64` breaks on `notedWalk.detached` and requires the chain to reach the scene. (b) `noteRemoved` `:139-165`: `detached.add(root)` unconditional `:147`; deletes the add-note only if unvisited `:149-152`, else stamps `note.delta = -delta` `:153-160` — add→remove nets to zero. (c) `resetNotedWalk` demotes `note.seq → 0` `:99-111`.

5. **unfreezeHiddenSubtreeMatrices re-mark** — HOLDS.
   `staticChildMatrices.js:177-202`: restores `sfCullFrozen` roots (matrixAutoUpdate=true, deletes stamp, clears their `sfMatrixFrozen`), clears ancestor marks `:190-193`, then `markStaticMatrixSubtrees(root)` `:199` re-marks only still-frozen interiors; `matrixWorldNeedsUpdate = true` `:200`. A restored-live descendant cannot carry `sfMatrixFrozen`.

6. **describeOpeningInstancedPbrLeaves deferred reads** — HOLDS.
   Both O(scene) reads at `renderer.js:25398-25408` and `:25554-25564` run inside `_rendererLifecycle.setTimeout(lifecycle.guard(stampLatePbr), 0)` with plain-setTimeout fallback; `armedPlanForPbr` staleness guard inside the callback drops the stamp when `openingSubmissionPlan` rotated. Sync readers read only the committed snapshot.

7. **_queueHiddenSubtreeFreeze / _drainHiddenFreezeQueue** — HOLDS.
   Queue `renderer.js:21074-21081`, drain `:21083-21124`; mint legs at `:21222` (bind), `:23270` (doomed), `:23322` (hidden) — all three enqueue instead of minting inline. Drain mints ≤ `HIDDEN_FREEZE_MINT_ROOTS_PER_PASS = 6` (`:889`), scans ≤ 256 (`:893`), `HIDDEN_FREEZE_FLAP_DWELL = 3` hysteresis (`:897`), compose-then-freeze preserved `:21117-21120`. Stale entries drop on `visible === true` / detached / re-frozen `:21110-21114`; unbind clears queue flags `:21338-21344` and restores `sfHiddenFrozen` `:21345-21349`. Single drain site `:23331` inside syncEntityViews. The W102-lod unfreeze twin `_queueHiddenSubtreeUnfreeze`/`_drainHiddenUnfreezeQueue` `:21134-21167` drains at `:23729` in the same pass. Deferred = benefit-only confirmed.

8. **paced admit collects** — HOLDS.
   (a) All four session mints run BEFORE their reveal loops: `poolSealTouchSession` `:13404`, `rockTouchSession` `:15037`, `lateTouchSession` `:16074`, `rescanTouchSession` `:16239`, each `session = session || (await mintTouchDrawableSession(scene))` — minted ahead of the `withOnlySubjectsDrawable` consumers. `mintTouchDrawableSession` `:10757-10770` drives `drawableHideSessionSteps` under `admissionPaceYield`. (b) `reattachDetachedAdmissionTextures` `openingGpuAdmission.js:33-62` drives `collectStartupTexturesSteps` under `yieldToMain` `:39-45`; the sync fallback sits only behind a `typeof` guard `:46-48`. (c) `drawableHideSessionSteps` `:483-497` is an iterative pre-order twin visiting identical nodes (membership-only semantics, order cosmetic).

---

## Ranked findings

### F1 — Per-leg drawable-session mints re-pay the O(scene) census up to 4× per cook — impact M / effort S

**Evidence:** `renderer.js:13404`, `:15037`, `:16074`, `:16239` — four independent lazy session variables (`poolSealTouchSession`, `rockTouchSession`, `lateTouchSession`, `rescanTouchSession`), each `session || (await mintTouchDrawableSession(scene))` → `drawableHideSessionSteps` at `openingGpuAdmission.js:483-497`, an iterative O(scene) `isDrawable` census.

**Mechanism:** each leg mints its own session on first use, so a cook that reaches all four legs runs the identical whole-scene drawable enumeration four times. The mints are paced (yields at 4096-stride) so no single mint bricks a frame, but 3 of the 4 enumerations are pure re-work — the drawable set barely changes within one cook — and every paced walk still burns cook wall-clock and paced-ledger slots that real admission work could use. On a large sector scene (tens of thousands of nodes, ~5k drawables) the triple re-census is the largest remaining repeated boot-time walk.

**Legality of sharing (hunt (a) verdict):** legal, and the contract already contemplates it — `drawableHideSession`'s own header (`openingGpuAdmission.js:459-466`) says "mint it once per cohort" and "under-hiding is safe by contract — a drawable the session under-covers just draws inside the absorbed touch pass, never inside a presented frame." A drawable minted between the shared census and a later leg is simply absent from `session.drawables` → never hidden → draws inside that leg's absorbed pass (overdraw in the safe direction). Detached-stale entries hide+restore harmlessly per the same contract. What must NOT be shared is `keep` — it is per-consumer visibility state (see F2), so share `drawables` and give each leg a fresh `keep`.

**Fix sketch:** mint the census once per cook generation (e.g. `this._cookDrawableCensus = { scene, serial, drawables }` built inside the first leg's mint, or a small `getCookDrawableCensus()` invalidated on cook serial / scene identity), then construct per-leg sessions as `{ scene, drawables: census.drawables, keep: new Set() }`. Same contract, one enumeration per cook instead of ≤4. `mintTouchDrawableSession` keeps its paced implementation; only the drawables array is shared.

**Risk:** low — the staleness direction is contract-safe, `keep` stays leg-scoped, and the census is invalidated by nothing short of a whole scene rebuild (a new scene object = new cook generation).

### F2 — session `keep` union makes absorbed-pass draw count quadratic in cohort size — impact M / effort M

*(boot F6 — re-ranked per hunt (b): pre-W101 the reveal was synchronous and re-hid before the render ran, so kept members never actually drew and the union was bookkeeping-only; `whileRevealedGroup` now genuinely awaits `run()` while subjects stay revealed, so the quadratic is live work.)*

**Evidence:** `openingGpuAdmission.js:505-511` — with a session, `keep` is the session's own Set, unioned across every `withOnlySubjectsDrawable` call: each call adds its subjects + ancestors (`:510`, early-exiting at an already-kept ancestor) + full descendant traverse (`:511`). `touchSubjectOnExactTarget` routes through it at `:688-693`, so all four cook legs pay this.

**Mechanism:** the hide pass `for (const object of session.drawables)` at `:515-519` skips `keep` members — every subject kept from earlier batches stays `visible` and is **drawn by `renderer.render`** in every later batch. For N admitted units in batches of ~24, batch k draws ~k·24 subjects ⇒ total absorbed subject-draws ≈ N²/48 — quadratic GPU+JS work inside the absorbed passes, growing the cook's wall-clock tail super-linearly on big cohorts (Crucible rosters, full-asteroid-field cooks). Off-present, but it directly stretches the loading shell and competes for the paced ledger.

**Fix sketch:** scope `keep` per call — mint `keep` fresh from the batch's own subjects (identical marginal mint cost to today's union-add) and let prior-batch members (already touched in their own batches) be hidden by the scan at `:515`. They restore in `finally`, their programs are already linked, and the absorbed pass only needs the current batch drawable anyway — the union's "keep them visible" property was a byproduct of sharing the Set, not a requirement. Trade: the `:510` shared-ancestor early-exit is lost across batches (re-walks ~O(depth) per subject — small vs. the removed draws). Alternative cheaper guard: cap-and-remint — when `keep.size` crosses a bound, rebuild it from the current batch only.

**Risk:** medium — must confirm no absorbed-pass semantic depends on earlier subjects drawing again (none found: each unit belongs to exactly one batch; a subject that is an ancestor of a later batch's subject would be hidden for that render then restored — its own program already linked in its own batch). The `keep`-as-Set contract and restore bookkeeping are untouched.

### F3 — `captureOpeningAdmissionIdentity` sync fallbacks are dead code on the live path; the armed iterator's `next()` is unguarded — impact L / effort S

*(hunt (c) re-evaluation — verdict: machinery already armed; fallback unreachable.)*

**Evidence:** `renderer.js:24860-24872` arms `_openingFirstDrawIdentityIter` on every `openingFirstDraw` frame where it is missing, and steps it once (`:24868-24871`) before the bounded drain at `:25216-25223` (`OPENING_FIRST_DRAW_CENSUS_DRAIN_MS = 4`, `:874`). The sync fallback `captureOpeningAdmissionIdentity(scene)` at `:25224-25230` requires `_openingFirstDrawIdentityIter == null && _openingFirstDrawIdentityResult === undefined` — unreachable within the synchronous block (the iter is always armed frames earlier; it goes null only on `done`, which also sets the result). The only clears are generation teardown `:17998` and the drain-close `:25268`/`:25290`. The deferred timer-gap drain `:25278-25302` has a defensive sync fallback at `:25294` that fires only inside a `setTimeout` — not a presented frame.

**Mechanism / residual:** no atomic presented-frame census remains on this path — hunt (c) resolves clean. The one residual seam: `iter.next()` at `:24868` runs inside the presented `openingFirstDraw` frame with no try/catch — a throw inside `captureOpeningAdmissionIdentitySteps` (traverse/material read) propagates out of the draw call and aborts the presented frame entirely. Rare and defensive, but it is a worst-case-presented-frame mechanism: wrap the first `next()` (and the timer-gap steps) in try/catch — on throw, drop the iterator and either take the sync fallback (it is the identity's own declared fallback) or skip the stamp for the frame.

### F4 — `onboarding:rosterPrewarm` exemplar cohort: synchronous `vf.build` + mount storm inside one bus task during 'loading' — impact M / effort M

*(hunt (d) — the bind-time storm the deferred-freeze queue does not cover.)*

**Evidence:** `renderer.js:18231-18329` — `_admitSurvivalRosterPrewarm` runs `for (const spec of exemplarSpecs)` synchronously: `vf.build(spec)` + `scene.add(boundary)` + `_noteShadowMeshAdded(boundary)` (`:18278`) per exemplar, ×2 witness builds for ship specs (`:18263-18264`). `exemplarSpecs` = emitted specs + `wreckVisualExemplarSpecs()` (visualFactory.js:3481 — one per `WRECK_PACKAGED_FILES` member +2) + `combatSpawnableExemplarSpecs()` (:3749 — ~17 rows incl. 8 freighter variants) + `asteroidVisualExemplarSpecs()` (:3596 — one per `AST_TYPE`). Emitted from `onboarding.js:1858` inside `prepareStartingScene` (`:1821-1839`), which is gated to `mode === 'loading'` — so the whole cohort (≈40-60 whole-boundary builds + mounts) lands inside the emit task with no yield. The survival variant (`survivalArena:rosterPrewarm`) is deliberately unwired — dead path, `survivalArena.js:970-999` + `:1099`.

**Mechanism:** worst-case node count ≈ Σ exemplar subtrees — procedural hulls, wreck bases, asteroid leaves, freighter variants; low-thousands of nodes minted plus, per mount, `_noteShadowMeshAdded` with no `measuredReceivers` → `countShadowReceivers(root)` O(subtree) inside `noteAdded` (shadowReceiverTally.js:130-138; renderer.js:27099-27106). During 'loading' there are no presented frames to hitch — the brick freezes the loading shell's rAF animation and inflates cook time directly (this lane's domain). The deferred-freeze queue doesn't help: it only defers the freeze mints, and it drains solely inside syncEntityViews (`:23331`), which does not run mid-emit anyway — everything else in this loop is synchronous by construction.

**Fix sketch:** drive the exemplar loop through the render side's existing pacing: make the handler enqueue `specs` into a cook-scoped drain (yield per spec via `yieldToBrowser`/`admissionPaceYield`, mirroring the reskin continuation at `renderer.js:9774-9806`), and batch the shadow-tally side by marking receivers dirty once for the cohort instead of paying one synchronous `countShadowReceivers` per mount (or pass a measured count where the builder already walked the subtree). `_rosterPrewarmIds`/`_rosterPrewarmPending` machinery already tolerates async settle, so ordering/dedup contracts are preserved. Sibling `warmMount`-style additions could reuse the same drain.

**Risk:** medium — the roots must land in `_rosterPrewarmRoots` before the bare→PBR sweep (`:9779`) and the cohort wait (`:13050+`) read them; pacing the loop must keep the push-at-begin ordering and the `_rosterPrewarmPending` settle tracking intact. Also requires the emit-time-vs-drain-time boundary respected (specs are plain data — safe to stage).

### F5 — `shadowReceiverTally`: `detached` stamp survives remove→re-add inside one pendingRecount — impact L / effort S

**Evidence:** `shadowReceiverTally.js:147` — `noteRemoved` adds `root` to `notedWalk.detached` unconditionally. The pop-time liveness check `:58-64` skips any subtree under a `detached` mark during `recountShadowReceiversSteps` (`:47-79`). A root that is removed then re-added while a paced recount is still parked keeps its `detached` entry — the walk passes over it unmeasured even though it is live in the scene again.

**Mechanism:** the removed→re-added subtree's receivers were debit-ed by the remove note but never re-counted → `count` under-reads until the next `markDirty` recount heals it. Bounded to pendingRecount windows (the paced walk's suspension span) and to the remove-then-add ordering — the add→remove direction is already handled (`:149-160`).

**Fix sketch:** in `noteAdded`, `detached.delete(root)` (and on re-add, keep the +delta note so the accounting still nets); the liveness check then treats a re-attached root as live.

**Risk:** low — one-line set bookkeeping change inside an already delta-accounted structure.

---

## Residual-hunt verdicts (a)–(d)

- **(a) per-leg session mints** → F1: sharing the `drawables` census across legs is contract-legal (the session's own docblock endorses cohort-scoping); `keep` must stay per-consumer. Cleanest cheap fix = shared census + per-leg keep.
- **(b) session keep quadratic growth** → F2: now that reveals hold across suspension, the union genuinely re-draws all prior-batch subjects every batch — re-ranked from deferred to a real finding (M/M).
- **(c) captureOpeningAdmissionIdentity fallbacks** → F3: fallbacks are effectively dead code — the iterator is always armed before the draw path; nothing to un-atomic. Residual = unguarded `next()` throw aborting a presented frame (L).
- **(d) atomic boot stretches by worst-case node count**:
  1. roster-prewarm exemplar cohort — Σ exemplar subtrees (~thousands), synchronous inside one 'loading'-mode emit → F4.
  2. per-bind gated subtree traverses — `canonicalizeObjectSurfaceProgramKeys` (`renderer.js:21199` → `illustratedSurface.js:180-196`, once per authoredVisualRoot) and `collectPresentationTextures` (`:21230` → `:9051`, once per entity id via `syncPooledPresentationIdentity:9039-9063`) — O(subtree) each, ~hundreds of nodes worst-case per bind; **all mass-bind drivers verified paced**: `reattachResidentGpuMeshesSteps` `:1896-1978` (64-stride), `_rebindPresentationMeshesSteps` `:21600-21633` (256-stride), `_bindPublishedPresentationMeshesSteps` `:21649-21668` (256-stride), spawn mount `:22783` inside the admission-sliced build drain (`:22661-22711`), reconcile re-bind `:21999` inside a per-row-yield generator, appearance-change `:22961` single-entity. `world.bindMesh` is O(1) slot work (`presentationWorld.js:794-818`). No storm surface remains here.
  3. cook-time freeze-queue mints — enqueued at bind/doomed/hidden legs but drain only inside syncEntityViews (`:23331`, `:23729`); during cook they simply wait — benefit-only, non-atomic by design. No action.
  4. per-mount `countShadowReceivers` — O(subtree) at every `_noteShadowMeshAdded` site that passes no measured value (`:9311`, `:11442`, `:14621`, `:14672`, `:18278`, `:18368`, `:18391`, `:18452`, `:18675`, `:19249`, `:19281`, `:20058`, `:21208` `added:` hook); individually bounded, becomes a storm only inside F4's cohort — folded into F4's fix sketch.

## Not re-reported (per brief — adjudicated/landed/deferred lists)

W4-closure adjudicated items (KEEP/DOCUMENTED verdicts) and the full WHAT-ALREADY-LANDED ledger; W101-implemented boot F1–F5+F7 (reveal invariants, session forwards, paced mints, deferred census, freeze queue); preexisting test failures; `survivalArena:rosterPrewarm` live-route wiring (deliberately unwired — measured regression documented at survivalArena.js:970-999); SwiftShader wall-time conclusions (no GPU-cost claims in this report — all findings are mechanism/node-count based).
