# W107 audit — lane: boot-loading

Target: `devin/1791064509-perf-w60` @ `876e9b312` (W106 code tip `0fc3ff53c` + `e72e3ce13`, log `876e9b312`). Golden sim hash contract `0b33dde18752ca52ee6b6be25ded38ab6e86899dc6444a7e47842a2bb785b2d1` — nothing below touches sim; all findings are presentation/loading-side. AUDIT-ONLY: no code written, no PRs, no app run.

## saturated: false

Four contract-preserving improvements remain in this lane. F1 is the foundry arm gate's mode residue: `_loadFoundryIbl` arms `_foundryEnvPending` only when `state.mode === 'flight'`, so a resolve during the one other non-loading mode ('menu') still pays the inline PMREM brick, and — worse — no flight-mode drain point exists, so an armed bake waits for a transition that may never come (the foundry env simply never lands in a jump-free session; ships keep the matte fallback). F2 is a partial-stamp window inside `_bakeEnv` where a mid-bake throw pins the same-source guard to a source the env never reached. F3 is two silent swallows (`_bakeEnv` catch-all, `_foundryIblPromise.catch`) that make every env-bake failure invisible — the only un-logged failure class left in the cook machinery. F4 is 13 drive sites still wrapping the whole `for...of` (await inside catch scope), so `yieldLiveSectorGpu`'s context-loss throw is misclassified as a drive failure and swallowed under dead GL. Axis (d)'s ranking keeps `syncEntityViews(1)` on top — still ~665 atomic lines × up to 9 settle legs.

---

## Findings (ranked)

### F1 — Foundry arm gate misses 'menu' (inline convolve brick) and has no flight-reachable drain (armed env can never land)

**Evidence:** `src/render/renderer.js:22916-22933` — `.then` banks `this._foundryEnvTexture = texture` (`:22920`), then arms `this._foundryEnvPending = true` only under `(this.state && this.state.mode) === 'flight'` (`:22926-22930`); every other mode takes `else { this._bakeEnv(); }` (`:22929`). Drains exist only at cook seams (`:12401` opening cook, `:15727` jump cook) and at `preparePostOpeningPipelines` head (`:16964-16967` — runs inside the gpu-resources wait while still 'loading', `pipelineReadiness.js:904-913`). `state.mode` values are `'menu'` | `'loading'` | `'flight'` (`src/main.js:350/:1175/:1198/:1212`, `titleAttract.js:157`); sector jumps pass through `enterLoadingMode` so a jump resolves as 'loading' → inline `_bakeEnv()` behind the veil — correct.

**Mechanism.** Two defects share one gate. (i) A resolve during mode `'menu'` (return-to-menu `:1212`, boot menu `:350`) takes the `else` branch → `_bakeEnv()` runs `pmrem.fromScene` inline (`:22985-22994`) — the exact monolithic convolve the arm exists to keep out of presented surfaces — bricking menu rAF/UI for its duration. The gate says "flight" when the hazard class is "anything not behind the loading veil". (ii) The armed flag drains only inside cooks/'loading'-adjacent passes; a plain flight session has no drain point, so a texture that arrives mid-flight is banked but never baked — the env stays the flat-fallback card rig for the rest of the session (directly undoes the foundry IBL's material separation until the next transition). A new session's opening seam does drain it (flag persists on the renderer), so the loss is intra-session only.

**Fix sketch.** (i) Gate on `this.state.mode !== 'loading'` instead of `=== 'flight'` — every non-veiled mode defers. (ii) Add one drain reachable from flight without a presented-frame convolve: the honest options are a drain at the next `enterLoadingMode`/menu-transition head (free behind whatever veil/menu-dim already masks), or accept the bounded single-frame convolve once at first-flight idle — e.g. a `postPresent`-scheduled drain gated on `spendGate`-style headroom, explicitly documented as a one-shot sanctioned hitch. The first option preserves today's no-presented-frame-bake contract absolutely; the second is a policy call.

**Effort:** S (gate) / M (drain point). **Impact:** M — (i) one ~50-200 ms brick on menu surfaces per mid-menu arrival; (ii) foundry env never lands in a jump-free flight session (latent quality deficit — chrome/paint stay matte-flat). **Risk:** L for the gate change; the drain-point choice needs the owner's policy call on the one-shot hitch.

### F2 — `_bakeEnv` stamps `_envMapSource` before committing the target — a mid-bake throw pins the same-source guard to a source the env never got

**Evidence:** `src/render/renderer.js:22996` — `this._envMapSource = iblSource` is assigned immediately after `pmrem.fromScene` (`:22985-22994`) but *before* `this._envMapTarget = envTarget`, `this._envMap = envMap`, `state.render.envMap`, `setEnvMapForShips`, and `scene.environment` at `:23015-23019`. Between the two commits sit `pmrem.dispose()` (`:22998`), `reflectionEnv.dispose()` (`:22999`) and the deferred-dispose bookkeeping (`:23006-23013`), all inside the same `try` whose tail is `catch (_) {}` (`:23025`). The same-source early-out at `:22959-22961` (`earlyIblSource === this._envMapSource` → `return`) compares against `_envMapSource` while `previousEnvMap`/`_envMapTarget` still describe the old env.

**Mechanism.** A throw in the `:22998-23014` window (a dispose throwing under a dying GL context is the realistic case) leaves `_envMapSource` claiming the new source while `_envMapTarget`/`_envMap`/`scene.environment` still serve the old. Every subsequent non-force `_bakeEnv()` then early-outs — the armed drain, menu/loading bakes, all of them — and the env is pinned stale until a `force: true` bake arrives (only the opening-unfreeze promotion `:18689-18691` and context-restore paths force). Failed-bake state is indistinguishable from baked state.

**Fix sketch.** Move `this._envMapSource = iblSource` below the target/env commits (`:23016`+), or set it together with `_envMapTarget` in one statement; alternatively `catch` clears `_envMapSource` only when it diverges from the actually-committed target. Either way the guard can never claim a source the env didn't reach.

**Effort:** S. **Impact:** M — narrow probability window, permanent-stale consequence until a forced bake; interacts with F1(ii) (the only armed-drain path for a flight-armed flag also early-outs). **Risk:** L — pure ordering change.

### F3 — The two env-bake failure paths are the only un-logged failure class left in the cook machinery

**Evidence:** `src/render/renderer.js:23025` — `_bakeEnv`'s whole body ends in `catch (_) { /* env-map optional — chrome falls back to high-metalness matte */ }` with no console or ledger signal; `:22932` — `this._foundryIblPromise.catch(() => {})` swallows HDRI load failure identically. Every other cook-path failure goes through `console.warn` + `runCookSyncTwin` per the W106 belt (`:2053-2058` and ~75 sites).

**Mechanism.** A PMREM/OOM/context-lost bake or a failed/empty HDRI fetch leaves the env on the card-rig fallback with zero telemetry — invisible in field reports and indistinguishable from "foundry arrived and baked" from the outside. This is the lane's (b) axis answered fully: `_drainFoundryEnvPending` clears the flag before `_bakeEnv()` (`:22938-22940`) so a throwing drain can't wedge the flag — but `_bakeEnv` can't throw at all because it swallows internally, which is precisely why the failure is invisible. The swallow also covers the F2 window, compounding it: a partial-stamp wedge produces no log.

**Fix sketch.** One `console.warn('[render] env bake failed', err)` in the `_bakeEnv` catch and a warn-or-breadcrumb in the promise catch. Zero perf cost; matches the belt's logging contract.

**Effort:** S. **Impact:** L-M — no frame benefit, but converts a silent quality deficit into an actionable signal; also the only way F2's wedge would ever be observed. **Risk:** L.

### F4 — 13 drive sites still wrap the whole `for...of`; a yield-side context-loss throw is misclassified as a drive failure and swallowed

**Evidence:** Tight-try pattern (correct) at `src/render/renderer.js:9959` — `try` wraps only `censusIter.next()` inside the loop, so `await` rejections propagate. Wide-try sites (try wraps the whole `for (const _ of xSteps(...))` including its `await`s): `:10214`, `:10899`, `:12023`, `:12575`, `:12954`, `:13177`, `:14476`, `:14486`, `:14497`, `:14509`, `:15753`, `:16192`, `:16384`. The yields in these bodies call `envBindYield`/`postPace`/`yieldToBrowser`, which route to `yieldLiveSectorGpu` — the seam that throws `'webgl-context-lost-during-live-sector-cook'` on context loss (`:12390` region).

**Mechanism.** In a wide-try drive, a yield-side throw lands in `catch (driveError)` → `console.warn('... steps drive failed; running the sync twin', driveError)` → `runCookSyncTwin` runs the sync twin under a dead GL context (which itself swallows its own throws) → the cook proceeds to its next section. The context-loss error is thus delayed, mislabeled ("env-bind steps drive failed" for a context loss), and partially hidden until the next unguarded yield propagates it. Bounded-delay abort + one O(scene) wasted sync pass + misleading telemetry — not a hang, but the diagnosis signal is wrong on exactly the failure the seams exist to surface. The deliberately-unguarded prefix at `:12500-12504` is the correct contrast: there the same throw propagates cleanly.

**Fix sketch.** Re-shape the 13 sites to the `:9959` pattern: `try { step = iter.next(); } catch (driveError) { warn; runCookSyncTwin(...); break; }` inside the loop, with `if (cookStale()) return cookSuperseded; await yield...` outside the try. Mechanical, identical per site.

**Effort:** S-M (13 mechanical edits). **Impact:** L-M — no happy-path change; removes dead-GL wasted work and restores correct abort ordering/log labels on context loss inside loading cooks. **Risk:** L — the tight pattern is already the majority idiom.

---

## Axis (d) — biggest remaining atomic boot stretches, ranked

**d1 — `this.syncEntityViews(1)` inside `_publishOpeningFirstPictureSteps` (`:25355`).** ~665-line atomic function (`:24364-~25029`): hidden sweep `:24444-24520` (per-slot `refreshVisibleEntity` + pose + classify + freeze-queue push, liveness-gated `:24447/:24551`), `_drainHiddenFreezeQueue` `:24527`, liveViewFrustum build `:24539-24546`, visible sweep `:24548+`. Runs once per publish × up to 9 settle legs (`:25529-25551` loop + re-publish tails) — the largest remaining frozen-bar leg by an order of magnitude. Still atomic at HEAD. **Fix sketch:** split at the natural leg boundaries (hidden sweep / frustum build / visible sweep / freeze drain) behind a per-leg `yieldToBrowser` + a world-mutation-sequence invalidation check so a mid-leg spawn/despawn restarts only the affected leg; the hidden sweep's slot loop is the sliceable mass (same per-slot liveness guard already in place). **Effort:** M-L. **Impact:** H on frozen-loading-screen time — the only remaining multi-hundred-line atomic in the boot path. **Risk:** M — mid-sweep world mutation re-verification is the whole complexity; mirrors the settled recount machinery's approach.

**d2 — `_bakeEnv` `pmrem.fromScene` convolve (`:22985`/`:22991`).** Monolithic GPU-side convolve, ~50-200 ms on real hardware, cannot be sliced without vendored PMREM surgery. Its once-per-boot occurrence behind the veil is correct and required for the opening picture; the defects are where late arrivals land (F1) and silent failure (F3), not the convolve itself.

**d3 — `keys.sort` oversize-disc guard (`src/world/asteroidField.js:222`).** Fires only when `cellSpan > grid.size` (degenerate query box), O(K log K) atomic between the last scan yield (`:220`) and the chunked inspect loop (`:223-226`). Bounded by `grid.size`; adjudicated F6 last wave — verified still present, same bounded shape.

**d4 — `asteroids.sort` tail (`src/render/partsLibrary.js:1129`).** Inside the last stepped leg of `collectFirstFlightCookEntitiesSteps`, over the radius-filtered subset; bounded. F6 adjudicated — verified still present.

**d5 — `collectFirstFlightCookEntities` sync path.** Dead in practice: invoked only via `runCookSyncTwin` fallback (`:12828`, `:16023`) or when `collectFirstFlightCookEntitiesSteps` is not a function (`:12843`, `:14420` — defensive `typeof` guards). Doc note only.

---

## W106 regression verification (on `876e9b312`)

All seven items verified line-by-line; no reversion found. One shared deviation already reported by the lod lane: `drainMeshBuildsBehindShell`'s bare `_drainMeshBuildQueue(1)` fallback at `renderer.js:12471-12472` — confirmed independently, cited not re-reported (lod F1).

1. **Per-step drive guards + `runCookSyncTwin` belt.** `closeCookStepsIter` guarded `iter.return()` inside try (`:2046-2048`), `runCookSyncTwin` try→warn→fallback (`:2053-2058`); ~75 driven sites belted. Degrade shapes honest: pool census `{roots: runCookSyncTwin(...), subjects: []}` (`:15396-15400`), drawables → `[]` (`:10959`), startup-texture → `[]` (`:10999`), settle sweep → `pendingBoundaryCount = 1` (`:14067`), stragglers → `stragglersDone = true` (`:14125`). Prefix env-bind at `:12492-12504` deliberately unguarded — verified still unguarded and no other preflight site accidentally reverted (`:10900`, `:14476-14505`, `:15753-15760` all belted). ✓

2. **Recount prefix-any-shift + `seededTotal` cap.** `shadowReceiverTally.js`: detected `children[idx]` shift seeds both the forward gap `[idx, shifted)` (`:150-153`) and the consumed-prefix rescan `[0, min(shifted, idx))` (`:161-170`), openSet-filtered (`:189`); `parentFrame.idx = shifted` (`:171`). `seededTotal += 1 > every * 4` (`:198-203`, every = `RECOUNT_NODES_PER_SLICE` = 512 → 2048 cap) sets `notedWalk.abandon`; resolve treats abandon as supersede under `RECOUNT_SUPERSEDE_CAP = 4` (`:438-447`), cooldown `RECOUNT_STORM_QUIET_RESOLVES = 8` (`:465`). Same-length swap of two unvisited rows below the cursor: covered (walk is order-insensitive — both still visited). Consumed↔unvisited swap preserving `children[idx]`: undetectable by the prefix probe, but a pure in-place `children` reorder with no reparent (`.parent` unchanged → ancestry check silent) is required, and no in-repo code performs one — reparents always move `.parent` and splice moves displace `children[idx]`. Honestly out of scope. ✓

3. **Jittered defer cap.** `visualCullRadius.js`: cap `2 + (mesh.id & 3)` at both serve sites (`:161`, `:168`); `drawnCullDefers = 0` on LRU hit (`:129`), record write (`:196`), prime (`:236`); `drawnCullRadiusMax` fully removed — key-moved serves take `max(cached.radius, max(LRU)) * 1.15` (`:144-161`) so an envelope larger than the 8-entry LRU window decays instead of stranding; the streak cap forces an honest walk within 2-5 defers regardless. ✓

4. **Bound re-unbind re-queue.** `owedBoundRestore` captured pre-clear (`:22478`); frozen-path re-push of bound entries (`:22521-22524`); non-frozen bound rows re-stamp `sfHiddenUnfreezeBound` + `sfHiddenUnfreezeQueued` and re-push (`:22527-22535`) — no inline `unfreezeHiddenSubtreeMatrices`; bound drain tier skips detach/invisible abandons, drops only `sfHiddenFrozen === true` (`:22253-22281`). ✓

5. **Warm-lane floor + payload hoist.** `if (backlog > 32) budgetMs = Math.max(budgetMs * 2, DESPAWN_DISPOSE_BUDGET_MS)` (`:2112-2116`); merged emit hoist `emit = { specs: mergedSpecs, compilePipelines: mergedCompile, exemplarSpecs: mergedSpecs.concat(mergedExemplars.filter(...)) }` (`:19038-19068`). ✓

6. **Foundry pending arm + drain.** Arm at `:22926-22930` (texture banked `:22920` before the gate); `_drainFoundryEnvPending` clears the flag before `_bakeEnv()` (`:22937-22941`) — a throwing drain cannot wedge it; drains at `:12401`, `:15727`, `preparePostOpeningPipelines` head `:16964-16967` (fires even on the already-released early-out); `_bakeEnv` swallows internally. Idempotent on null flag. Armed flag + `_openingEnvFrozen` → drain consumes flag while bake early-outs (`:22944`) → unfreeze force-bake `:18686-18691` still promotes — self-heals. Mechanism intact; mode-gate + silent-failure residues are F1-F3. ✓

7. **restoreReveal + spendGate + note cap.** `revealMint` catch checks `err.message === 'cook-superseded'` first (`:14536`) so staleness still propagates before degrade (`:14540-14545`); `restoreRevealSteps` throw → `console.warn` + sync `restoreReveal()` tail (`:14604-14610`); restore re-assigns recorded per-entry values → idempotent double-invocation. `resolve()` parks on `spendGate()` at walk top (`:421`), `debit` posts exactly once via `finally` (`:477-479`). `countShadowReceivers` cap → `COUNT_CAP_ABORT` → `-1` sentinel → `markDirty()` at both note sites (`:28342`, `:28363`); `-1` never reaches noteAdded/Removed as a delta. ✓

## Lane answers

**(a) Foundry pending across loading→flight.** Resolution landing enumerated: `'loading'` pre-freeze → inline `_bakeEnv()` (same convolve the opening needs anyway, earlier — fine); `'loading'` frozen → `_bakeEnv()` early-outs at `:22944`, banked, promoted at unfreeze force-bake `:18686-18691`; `'flight'` → arm → drains only at next cook seam or `preparePostOpeningPipelines` head — none exist in steady flight → F1(ii); `'menu'` → inline `_bakeEnv()` → F1(i). Nothing else stamps env between arm and drain (force-bakes at `:12492`/`:14432`/`:15747` consult `resolveIblSource` live and stay consistent).

**(b) Drain-throw wedge.** Flag cleared before `_bakeEnv()` → cannot wedge; `_bakeEnv` cannot throw out of the drain because it swallows internally — which is the actual defect class (F3 silent swallow + F2 partial-stamp inside the same try).

**(c) Band-yield mutation safety.** The pool/shadow band (`:25365-25397`: `syncContactShadowPool`, `ensureShipAuxPoolCapacityForFrame`, `tickShieldShellClock`, `syncShipAuxPools`, `liveShadowCastRadius`, `_syncAuthoredInstanceSubmission`, `_syncShadowMapEnabled`, `_syncKeyLightShadowFrustum`, `_updateShadowFollow`, `prepareActiveShadowCamera`, `_syncAsteroidInstanceSubmission`) yields only at call boundaries; each call re-reads live state at call time, so a mount/unmount in a yield lands between calls and is seen by the next one; the ≤8-pass settle re-runs anyway. `updateMatrixWorldSteps` (`staticChildMatrices.js:310-348`) enumerates `object.children` live at pop-time — a mount under an already-popped parent misses this pass (self-heals next compose; render recomputes every frame); a detached node on the stack does dead compose work, no crash; a reparent mid-walk composes against the new parent's possibly-stale matrixWorld for one pass — bounded nit. New-root mounts are suppressed during settle by `_deferNoncriticalMeshStreaming` (`:25496` region) + `freezeOpeningGraphPublication`; boundary-job swaps are exactly what the loop re-verifies. Near-benign — no finding beyond the documentation above.

**(d) Atomic stretches.** Ranked in the section above: d1 `syncEntityViews(1)` ~665 lines × ≤9 legs (top, still open — previously F2-deferred, brief now asks to re-rank it) > d2 `_bakeEnv` PMREM (correct behind veil; residues are F1/F3) > d3 `keys.sort` (bounded, oversize branch only) > d4 `asteroids.sort` tail (bounded) > d5 dead sync fallback (doc note).

## Contract check

Audit-only; no code touched. All proposed fixes preserve: zero visible quality degradation (F1 keeps the convolve out of presented surfaces — the drain-point choice gates on it; F2/F3 fix state/log ordering only; F4 re-shapes try scopes), sim determinism (all presentation-side), and ledger discipline (no new un-ledgered lanes).
