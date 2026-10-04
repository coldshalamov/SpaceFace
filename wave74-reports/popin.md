# Wave-74 audit — lane: popin-admission

Audited `devin/1791064509-perf-w60` @ `308c205ca` (W73 HEAD, verified via `git rev-parse`). Audit-only: no code edited, no PR, no app run.

**saturated: false**

## Ranked findings

### 1. Claimed re-kick settles leave stale `_swarmWarmReKickClaims` positives — the deferred fresh filter double-warms genuinely covered archetypes

`src/render/renderer.js:16855-16859` (settle handler), mints at 16844-16848, `releaseClaim` at 16818-16828, filter at 17241-17243.

`releaseClaim` decrements BOTH `covered` and `claims` — but the settle handler only calls it on **non-claimed** outcomes:

```js
reKickResult.then((result) => {
  entry.result = result;
  const settled = result && typeof result === 'object' ? result.status : result;
  if (enemyId != null && !swarmWarmOutcomeClaims(settled)) releaseClaim(enemyId);
});
```

Keeping `covered+1` on a claimed settle is correct (the archetype did warm). Keeping `claims+1` is not — the claims entry means "outstanding provisional strike", and nothing is outstanding after settle. `releaseClaim` is the only claims decrementer, so the row goes stale until `run:ended` nulls the map (15087).

Mechanism: at the next `run:transitioned`/`run:wavePlanned` dwell, the deferred fresh filter `(covered.get(id)||0) <= (claims.get(id)||0)` sees `1 <= 1` and takes the row as fresh — a successful strike-2 reads exactly like an in-flight strike. Since `swarmEligibleEnemyIds` is cumulative, the row stays eligible until the deferred warm actually duplicates it: 2 ship-witness exemplars + hulk/frag specs + kicks + palette subjects + compile + residency — a full per-archetype warm cohort rebuilt inside the 10s-bounded draft gate (`crucibleDraft.js:775`); excess spills into the round. Then `covered=2 > claims=1` — permanent inflation, one duplicate cohort per successfully-re-kicked enemyId per run.

Fix sketch: decrement the claims row on **every** settle, not just non-claimed — i.e. split `releaseClaim` so the claims decrement is unconditional while the covered decrement stays claimed-gated. ~5 lines.

Effort: S. Magic-frame impact: M (dwell-gate budget theft → in-round compile/upload work; no visual hole). Risk: L.

### 2. A synchronous throw in `reKick(1)` aborts the entire two-strike pass and leaks the just-minted claims

`src/render/renderer.js:16850`, inside `collectReKicks` (plain sync code invoked at 16872 and tail re-scan 16873).

`reKick(1)` evaluates `track(requestAuthoredUpgrade(ship, …))` eagerly; `requestAuthoredUpgrade` calls `enqueueBoundaryUpgrade` synchronously (partsLibrary.js:5531 — object construction can throw). A sync throw propagates out of `collectReKicks` → aborts every remaining entry's strike → skips the race AND the tail pass → `finish()` rejects → cook's `catch` at 12954 only warns → `warm.building`/`root.userData.warmBuilding` never cleared (16910 unreachable) → root never parks and stays in `_rosterPrewarmRoots` getting re-collected every rescan; the entry's covered+1/claims+1 mints leak with no settle handler attached. The neighboring `kickAuthoredBoundaryUpgrade` already wraps its identical call in try/catch (3527-3533) — this new code missed the same guard. The deferred lane is exception-safe (its retry dispatch sits inside a `.then` chain feeding the `.catch` at 17487-17495).

Fix sketch: `try { reKickResult = reKick(1); } catch { if (enemyId != null) releaseClaim(enemyId); continue; }`.

Effort: S. Magic-frame impact: L–M (low trigger probability, disproportionate blast: whole pass + stuck warm-building). Risk: L.

## Regression notes — all verified in code

**W73 items (the hunt list):**

- **Order-of-settles race (filter read → mark write):** not reachable as a literal interleave — the fresh filter and the +1 marks are a synchronous block (17241-17249). The deterministic equivalent IS finding #1.
- **Two-strike bound across passes:** holds. `entry.reKicked = true` (16843) is set before dispatch and gates both `collectReKicks` passes; tail kicks push into `warm.pendingAttachments` before `settleWarmBuilding`'s snapshot re-arms on growth (16895-16904); `warm.building` clears at 16910 after the records await.
- **Player-hull retriable entry:** works — W73 removed the `enemyId == null` early-continue so `enemyId: null` entries (16731-16732) now re-kick; mints stay correctly guarded by `enemyId != null`.
- **`retryReleasedCounts` netting in `unmark`:** correct — `mine = fresh(∈{0,1}) + retryMintCounts − retryReleasedCounts` (17304-17319); `allSettled` ordering guarantees retry settle handlers ran before the catch can run, so no in-flight mint is double-released.
- **`retryFailedAuthoredAdmission` guard:** consistent — the warm calls it with no `nowMs` → `now=0`, and `now < nextRetryAt` (partsLibrary.js:2730) can never pass once a real-now poll (renderer.js:2674) has consumed a retry (all `nextRetryAt` values >0). So warm-time marks only mint for never-poll-retried boundaries; already-retried ones stay owned by the live poll. Deliberate, not a hole.
- **Deferred-retry claims asymmetry (enumerated, unreachable):** `makeDeferredWarmKickRetry` mints `coveredMap`+`retryMintCounts` but not `_swarmWarmReKickClaims` (17336-17337) — an in-flight deferred retry would read covered rather than provisional to the next filter. Dropped as a finding: `done` awaits `Promise.allSettled(reKicks)` unbounded before `pending:false`, so retries can't be outstanding when a different-wave trigger filters — only a >10s `done` chain past the bounded draft gate leaves a window, and same-wave triggers are record-wave-guarded. If you fix #1 by minting/releasing claims symmetrically, attributing deferred retries the same way is free.

**W67 machinery (six items, all healthy):**

1. **Deadline arm** (`_armDepthStage` 21716-22061): per-root collect loop breaks only at `collected>=2 && deadline` (21818-21825), skipped roots requeue via `pending.set` (21826-21830), detached pending+parked sweeps (21757-21782), session reuse keyed on `lightSig` (21844-21862), restore loop min-1 (21915-22027), whole-arm `notePacedFrameSpend` + re-arm/kill in `finally` (22028-22058).
2. **Parking** (`_parkBoundedWarmRoots` 17595-17633): skips `warmBuilding` roots, debits paced ledger (17628-17631).
3. **Paced ledger:** every slicer checks `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` post-step or pre-conditioned on ≥1 completed step (reconcile 2131-2136, poll 2178-2182, hold-exempt collect 2555/commit 2601-2622, `drainDeferredEnterSlice` `steps===0||` at sectorEnterDefer.js:154-155, `drainEmitSlice` 349-351, `drainPresentationTail` 416-418, `_drainMeshBuildQueue` via `itemsDone>=minItems` in `shouldContinueAdmissionSlice` 33-42); all debit `notePacedFrameSpend`; epoch-keyed window with 8ms wall-clock fallback and 250ms stale-pump fallback (decodeTaskBudget.js:63-107); despawn's wholesale-skip entry gate is bounded by `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS=2` and returns 0 without dropping the queue (1806-1846).
4. **OFF→ON collect:** `collectUnstagedShadowCastersFlag` (shadowDepthAdmission.js:299-322) shares the base collector → identical exclusions (null geometry, spacefaceNoShadow, sharedContactShadow, authoredReadableFallbackLayer, materialCanCastShadow). W73's per-top-level-root walk (22086-22120) confines a node-budget abort to the in-flight root + unvisited siblings; over-cover enqueue pays `invalidateShadowCasterPolicy`+`STAGE_SELF_DIRTY_KEY` (22127-22132); `_syncShadowMapEnabled` kills `_shadowCensusMemo` on both edges (22213, 22243) before the stage's own null+re-collect (22089-22090).
5. **SG-02 reset defer** (`prepareBackend`, physics.js:352-455 + 771-776): `!_sg02Init && !_sg02` → `_disableSg02DynamicAuthority` no-ops token-guarded; `sg02InitJoinMs` join envelope; token-mismatch adoption (394-406); reset awaits pending init settle (416-424).
6. **Variant interning:** `_depthVariantCache` keyed on the 10-bit discriminant including verbatim side/shadowSide plus W73's alphaHash+vertexColors bits (shadowDepthAdmission.js:352-380).

**Cross-checked clean:** `_discardEarlyCrucibleWarm` honors `failedCoverageMarks` and can't leak claims (its warm never ran `collectReKicks`); hulk/frag kicks share the ship's `lootTableId` → same covered row → idempotent unmark (visualFactory.js:3533, renderer.js:17418-17425); rejected/`null` kick results classify non-claimed → retriable; menu/door-staged warm lifecycle discards on screen change/`game:startFailed`/wrong-ruleset launch; `run:ended` nulls both ledgers (15084-15088); mesh-build drain hoists deadline-glass rows once per drain (18951, 18968-18971).

**Verdict:** two legal contract-preserving fixes remain — primarily the stale-claims release (S, M), secondarily the sync-throw guard (S, L-M). Not saturated.
