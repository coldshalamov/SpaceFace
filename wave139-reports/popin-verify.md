# wave-139 audit — lane `popin-verify`

**Audit SHA:** `63516afffd9102613580a510531ac109960d4c9b` — tip of `origin/devin/1791504143-perf-w120` (perf(wave138): captured render-list replay + transform-signature memo + dead decode-class read).
**Working-tree note:** the checkout had drifted to `master` (`9ca0d10dbc6f…`, then `512b69609cbe…` mid-audit — another lane is committing). None of the claimed prior-wave work exists on master (`msg.spacefaceDecodeClass` still read at assetLoader.js:421 there; no sector-claims test file). All findings below are at the pinned perf-branch tip, read via `git show`.

## 1. Verify the landed work — PASS on all three items

### V1 — dead `msg.spacefaceDecodeClass` read removed — MECHANISM_VERIFIED
- `src/render/assetLoader.js:421-424`: the `decodeClass:` field is now `activeDecodeClass()` outright, with a comment documenting that the field was written nowhere. Repo-wide grep at the pinned SHA finds `spacefaceDecodeClass` only in that comment — no writer, no other reader. The pooled KTX2 post can only ever have read the ambient class, so removing the dead field read costs nothing and deletes a misleading override surface. Correct.

### V2 — `unionOwnerSector` merge + arm early-out — MECHANISM_VERIFIED
- **Cross-owner impossible by construction**: every callsite passes `entry.owners.get(owner)` / `entry.owners.get(request.owner)` — the merge target is always the *same owner key's* row (`assetResidency.js:382-417` retain-merge, `:619-633` commit-merge, `:520-527` reclaimWarm consult). A `sectorId` can only travel into the row of the owner that posted it.
- **Stale-member handling**: `unionOwnerSector` (`:948-987`) prunes lapsed members before adding a new sid (`:968`) and amortizes a prune sweep on same-sid re-posts at `SECTOR_CLAIM_PRUNE_INTERVAL_MS = 30000` (`:959-964`). `pruneLapsedSectorClaims` (`:908-927`) drops the dead member from `sectorIds`, both stamp containers, the `sectorOwnerIndex` row (`unindexOwnerSectorRow`), re-points the `sectorId` scalar to a survivor, and bumps `ownersVersion`/`residencyMutationSeq` so memoized governor/diagnostics rows can't serve the dead union.
- **Arm early-out preserves the arm contract**: `sectorClaimStamp` (`:870-889`) early-outs at `:878` when the sid already holds a *live* claim — an arm-class re-post (re-approach prewarm) can no longer demote an immortal live claim to a lapse-able ats stamp (the W137 F-1 mechanism). First arm posts still mint `sectorClaimAts` at `:881`; concurrent same-owner requests still deliver their sector claims via the commit-path union (`:619-633`, W137 F-2). `claimArmClass` classifies by *posting*, not stored row role (`:865-868`, includes `decodeWarm`), so an arm post onto a shared non-arm row mints a lapse-able claim exactly as intended.
- Tests: `test/asset-residency-sector-claims.test.mjs` (220 lines, 7 tests) covers all four exit-warm mint sites, posting-class vectors (reclaim onto runtime-cache row, `decodeWarm` retain, racing-request propagation), the W137 F-1 liveness-dominance vectors, the F-2 concurrent-commit union, and the horizon-clamp propagation for long-pending requests.

### V3 — sector-claim dominance/liveness guards on save/asset paths — MECHANISM_VERIFIED
- `exitWarmQualifies` (`:2025-2028`) → `hasLiveSectorClaim` (`:2012-2020`) → `sectorClaimFresh` (`:900-906`): a member qualifies for the exit-warm cohort only while at least one owner's claim to the departing sector is live or un-lapsed. Player-role owners are excluded unless `includePlayer` (save-restore-hold mode) — and even then the claim must still be fresh.
- All four mint sites run the same predicate: `rotateSector` `:1989`, `prepareSectorExit` `:2043`, `prepareSectorExitDeferred` `:2088` (filtered eagerly at snapshot time), `rotateSectorDeferred` `:2147`. The deferred twins filter at iterator *mint* — owner qualification still reflects the departing sector — matching the comment at `:2074-2078`.
- Save path (`prepareSectorExit({includePlayer:true})` → role `save-restore-hold`, `:2030-2034`) uses the identical gate; a lapsed arm claim cannot ride a save hold either.

### Correctness notes (verified, NOT material — reported for the next wave)
- `assetResidency.js:882`: `metadata.sectorLiveClaims.delete(sid)` after the `:878` early-out is unreachable — if `live.has(sid)` the function already returned. Harmless defensive no-op.
- `retain()` merge path (`:387-401`): `entry.lastWarmClaimAtMs` refresh is gated on `decodeWarm`/`decodeServed`/`softLease` flags in the incoming metadata. A flagless arm-role re-post through `retain()` unions sectors without refreshing warm-recency. Latent only — every live re-post lane (`reclaimWarm`, ownerless-warm posts) carries a flag or the consult path refreshes it directly at `:526/:550`.
- Provenance contract is an assumption, not enforced: the merge path applies *this posting's* arm class to every unioned sid (`:409-417`). If a future caller forwards pre-stamped `sectorClaimAts`/`sectorLiveClaims` maps in request metadata, an arm-class merge would re-stamp foreign live claims as lapse-able. The seed path (`:420-455`) handles stamped provenance correctly (clamps prior ats to the horizon, preserves live set); the merge path explicitly documents the gap at `:410-413`. Every live caller posts fresh literals today — flag as contract fragility, not a live bug.

## 2. Re-audit — remaining material defects in scope

Scope covered: `assetLoader.js`, `assetResidency.js`, the sector-claim machinery, and the visibility-deciding callsites (`_reconcileMeshResidencySteps` poll in `renderer.js`, the ~19 `warm*Decode` arm evaluators, `kickDecodeRunwayAssetsSteps`, `updatePredictedSectorPrewarmSteps`, `queueOrRequestAuthoredUpgrade`, `prepareSectorEntry`).

Evaluated and rejected (each traced, none material):

| Candidate | Verdict | Why |
|---|---|---|
| `emit()` events `splice(0, overflow)` head-shift (`assetResidency.js:214`) | not material | O(maxEvents≤512) per emit past cap — but emits are per request-mint/retain, not per frame; a ~300-emit repost wave costs sub-ms. No `onEvent` consumer exists outside the registry (grep at SHA). |
| Warm repost pays `await runtimeFor` before the `reclaimWarm` consult (`assetLoader.js:628` vs `:723`) | not material | One microtask hop + resolved-promise machinery per repost (~172 chains/s worst-case modular pool). `getAssetResidency(renderer)` needs no runtime, so the consult could hoist pre-await — saves µs-scale work, not a presented-frame cost. |
| `warmEnemyRosterDecode` rebuilds stub + hull keys per archetype per poll (`renderer.js:5692-5725`) | not material | Rosters are ≤~12; stub build is a small literal + map lookups. The file-level dedupe (`reclaimWarm`/`admitAuthoredAssetTask`) absorbs the repeated posts by design. |
| `entryCorridorRank` inside `sortSoftEvictionCandidates` comparator (`assetResidency.js:1110-1137`) | not material | O(candidates·log·owners·sids) only on a *real* byte overage, inside the paced steps or the `assets.size<128` inline path. Sorting is deliberately atomic for ordering correctness. |
| `hasLiveSectorClaim` per exit-sweep row (`:2012`) | not material | O(owners×sids) per indexed row at a sector transition — bounded, amortized, deferred-twins slice it. |
| `_reconcileMeshResidencySteps` full mesh+presentation sweep per 0.25 s poll (`renderer.js:24876+`) | not material | Paced generator (4 ms / pacedFrameSpend-budgeted slices), per-poll `tGlassCache`, scan-context hoisted player/camera/env terms, live-shell latch elides off-sector classification. Already the heavily-optimized shape. |
| `kickDecodeRunwayAssetsSteps` env/memo mints (`renderer.js:5298+`) | not material | Snapshot refresh is beat-stamped, pick loop delegates with beat re-checks, starts are decode-cap-bounded. |
| Owner-scoped warm posts mint `beginRequest`→`commit` per post | not material | Predicted/deep warms early-out when the prediction is stable (`renderer.js:6975`); `sectorPrewarmRecordOwns` absorption prevents repost storms. The ~19 per-poll arm evaluators all post *ownerless* warm → the O(1) `reclaimWarm` consult, not a request mint. |
| `visibilityHolds`/`noteOwnerVisibility` per-frame consults (`:1608-1661`) | not material | Verdict memoed on (present, visible, assetsVersion, writeSeq); GC is a bounded-share iterator per present. |

No pop-in vector found: arm re-post cadence refreshes `lastWarmClaimAtMs` and claim stamps on every poll; evictions re-decode through the same posts; `deadlineJoin`+`promote` re-grades shared tails when a real deadline joins an ambient task; `admissionVisible` jumps the whole queue for at-glass work.

### Rejected levers (quality-degrading — out of scope)
- Raising `SECTOR_CLAIM_STALE_MS` / pruning less often: would keep dead sectors' claims alive longer → bigger unions and index rows per entry, but stale claims are exactly what the W137 machinery exists to kill — a longer horizon re-admits the lapsed-claim exit-warm bug the tests now pin.
- Dropping the amortized 30 s prune on same-sid re-posts: saves an occasional O(union) sweep but lets dead members accumulate index rows forever — the exact "live re-post keeps a dead remainder indexed forever" hazard the code comments call out.

## Verdict

`saturated: true` — verification passes on all three landed items with no correctness gap that rises to material; the remaining candidates in scope are all traced sub-material costs or deliberate design trades.
