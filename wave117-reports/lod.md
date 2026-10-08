# W117 Audit — lane: `lod-in-frame`

`saturated: false` — two real contract-preserving fixes remain (F1, F2 below), both in the stale-serve / mark-semantics space this lane was scoped to.

Audited branch `devin/1791416524-perf-w110` @ HEAD `7f033f1e4` (waves 109–116 on this branch / PR #238; waves 1–108 via PR #220).

---

## Findings (ranked)

### F1 — Stale memo-serve reads dead-sig marks as "staged" at every non-rescue flag consult

**Evidence:** `_shadowCensusForFrame()` (`src/render/renderer.js:29529-29687`) keeps serving `memo.sig` from the previous census epoch while `memo.pendingIter` stepped re-mint is in flight (serves stale for the whole mint window; storm pin can extend it ~1s at `superseded>=4`). Sites consulting that serve to decide withholds: admission flag collect `renderer.js:11886-11892`, policy-lane collect `renderer.js:29131-29132`, coverage collect `renderer.js:29335-29346`, OFF→ON toggle `renderer.js:30674-30686`. Only the rescue consult (`renderer.js:29892-29897`) got the epoch guard W116 added.

**Mechanism:** During the pending-mint window the served sig is the *dead* census. (i) A caster marked under the dead sig reads `mark.l === serve` → treated as staged → keeps `castShadow=true` → the next presented shadow refresh draws it and links the live-census depth program **in-frame** — the cold-link hitch this machinery exists to prevent. (ii) A caster marked under the *new* live sig (fresh-minted via `_depthCollectLightSig` consults or `lightSigFor` re-mints at 30286) reads unmarked under the dead serve → withheld → shadow pops out until the mint lands. Both directions are live during light churn (combat/explosion light adds + drops), which is exactly when the pending-mint window exists.

**Fix sketch:** Epoch-gate the flag consults the same way the rescue consult is gated — when `memo.epoch !== shadowCensusEpoch() || memo.pendingIter`, treat the collect as unprovable this pass (skip the unstaged consult, leave flags untouched, stay dirty) rather than consulting a dead sig. A cheaper variant: serve `null` (unsigned) instead of the dead sig, which makes every mark read unmarked → pure withhold direction (no cold-link leak, only bounded pop-outs) — but epoch-gating is strictly better since it avoids even those.

**Effort:** M | **Impact:** H | **Risk:** M (must not strand roots that re-dirty during long storm pins — the existing `parkedRecheck`/`collectGate` backstops bound the deferral)

### F2 — `casterDepthMarkAnyCurrent` in the leftover eval answers the wrong question → releases casters with unlinked live-census variants

**Evidence:** Leftover eval `renderer.js:30468-30486` — `leftoverMarked` is set by dual-sig `casterDepthMarkCurrent` *or* `casterDepthMarkAnyCurrent` (`shadowDepthAdmission.js:408-412`), which re-proves discriminants under the mark's own stored `mark.l` — i.e. "internally consistent mark under any census". Compare with the deny verdict at `renderer.js:30382` where AnyCurrent is correct because the question there is drawability.

**Mechanism:** A caster that drew under an old census keeps a dead-sig mark with consistent discriminants. Leftover eval counts it `leftoverMarked` → omits it from the requeue set → root's restore leg flips `castShadow=true` → next presented shadow refresh draws the caster whose **live-census** depth program was never linked → in-frame compile. W116's own log note frames the "stale sig witness" fix; the leftover eval inherited the same AnyCurrent treatment without its different semantics being noticed.

**Fix sketch:** In the leftover eval only, drop the `casterDepthMarkAnyCurrent` call (or accept a mark only when `mark.l` equals the live serve — a genuinely-current mark under the live census). Keep AnyCurrent in the deny verdict. Note interplay with F1: if the live serve is itself stale, the strict version under-releases; gate on `memo.epoch === shadowCensusEpoch()` when choosing the compare sig.

**Effort:** S | **Impact:** H | **Risk:** S→M

### F3 — Signed arm's pinned `collectSig` goes stale across a mid-arm census flip

**Evidence:** `renderer.js:30127` — `collectSig = lightSig != null ? lightSig : this._depthCollectLightSig(scene)` pins the sig minted at arm start; per-root consults at 30138-30144 keep comparing under it for the whole (suspended) drive, which can span presents. The drive's own mints re-derive live via `lightSigFor` (30287).

**Mechanism:** Flip lands mid-arm: drive mints new marks under the live census, but cache/membership consults still compare under the pinned dead sig → live-marked casters read unstaged → re-offered next arm (wasted leg) — and dead-sig-marked casters read staged → never re-offered → restored unlinked → cold link (same end-state as F1/F2, narrower window).

**Fix sketch:** Dual-sig the consult (pinned ∪ live serve), mirroring the verdict's `verdictSigs`/`leftoverSigs` pattern already in the same function; or consult under live serve when `collectSig` differs from it.

**Effort:** S | **Impact:** M | **Risk:** S

### F4 (enumerated, no fix needed) — park re-key epoch honesty

All four re-key/mint sites pair sig source with its own epoch honestly (28966-28967 memo-serve ↔ `memo.epoch`, 29018-29020 same, 30206-30207 pinned `armSigEpoch` vs memo epoch, 30413-30414). One residual edge: a park re-keyed under a *stale* memo serve stamps the honest (old) epoch; when the mint lands, epoch differs → release path consults sig-vs-serve — if the serve is *still* stale the sigs match and the park survives under a dead census → casters stay withheld past currency, bounded only by the ~100-1000-sync recheck backstop. Bounded pop-out duration extension only; covered by the F1 fix (epoch-gated serves make this window explicit).

### F5 (enumerated, fine as-is) — membership re-prove cost

`renderer.js:30138-30142` ancestor-walks each cached member to `sliceRoots[collected]` — O(depth) per member per consult, but the consult runs once per root per arm only when `cache.seq === dirtySeq` (i.e. no tree mutation since last collect), under `collectDeadline` pacing. For a >500-member collect it's ~thousands of pointer hops ≈ sub-ms, amortized — not a per-frame hot path. Dead-set reads can't skip the walk: a member re-attached under the same root needs re-collection, and the walk *is* the membership re-prove. No change recommended.

---

## W116 verification (lod lane)

- **F1 VERIFIED** — `casterDepthMarkAnyCurrent` (`shadowDepthAdmission.js:408-412`) reads `mark.l` as its own witness sig and re-proves all discriminants; counted in `allUnmarked` (renderer.js:30382) and `leftoverMarked` (30477). Third-sig marks are witnessed; dead-sig marks still read current if internally consistent — which is correct for the verdict and is exactly what makes finding F2 a real over-release.
- **F2 VERIFIED** — all four park mint/re-key sites stamp the sig's own epoch: 28966-28967 (`liveParkedSig` ↔ `memo.epoch`), 29018-29020 (same), 30206-30207 (`armSigEpoch` when pinned, `memo.epoch` on memo serve), 30413-30414 (same pairing). Lagging-epoch re-keys can't inflate the park map.
- **F3 VERIFIED** — unstagedCache consult re-proves membership by ancestor walk to `sliceRoots[collected]` (30138-30144); consult gated on `cache.seq === dirtySeq`; detached members leave `cache.meshes` permanently until a dirtySeq bump re-collects. Amortized per arm slice, deadline-paced; not a hot path.

## W116 verification (spot checks, other lanes)

- **popin P1/P2 VERIFIED** — `gltfParsePending` split into visible/deadline/ambient lanes (`decodeTaskBudget.js:297`), strict lane drain order (357-359), `regradeGltfParse` moves queued entries to the head of the target lane (429-443), settle tails debit `notePacedFrameSpend`/`noteForcedFrameSpend` incl. same-frame `tail <= 24ms` gate (377-399).
- **popin P4/P5 VERIFIED** — `pruneProbation` records `{root, set}` (renderer.js:29935-29944), dead-member strike loop `continue`s through all dead members rather than breaking (29944-29946), `_withheldDepthUndrawn` generation-keyed prune via `withheldDepthCasterProvablyDead`/`undrawn` (29927-29929), live-but-unmarked still vetoes.
- **boot F1 VERIFIED** — `commitAuthoredPlaceBoundary` post-yield stale re-gate (`partsLibrary.js:4459-4473`: parent/epoch/abort-signal/entity-alive checks between `freezeStaticTransformRootMarked` and the graft, disposing own prepared tree on bail).
- **boot F3 VERIFIED** — three authored paths re-gate: capsule `capsule-build-stale` (`partsLibrary.js:3315-3317`), place `place-build-stale` (4234-4240), ship `ship-compose-stale` (9036-9039), all routed through `staleAuthoredRunVerdict` + `releaseBoundaryResidency`.
- **boot F2/F4/F6/F7 VERIFIED** — `disposeObjectNode` teardown fences present (`stormWarn('teardown:preparedBoundary'|'sitePresentation'|'residency'|'lodRetained'|'authoredMotion'|'ownerInstances')` at renderer.js:32181-32212); stepped twins in use: `attachAuthoredMotionDriverSteps` (partsLibrary.js:3599, 4916, 10884, 11949), `installCeresCradleLayoutGuardSteps` (4917), `cookFlightProductSteps` (10995, 11957); `disposeDetachedPlaceFallback` fenced sync + Steps variants.
- **hitches P1/P3 VERIFIED** — static dedup keys on the encounterDirector warn sites (`dedupWarn('encounterDirector/…', …)` — 8 sites at encounterDirector.js:405, 427, 1153, 1165, 1192, 1200, 2532, 2541); ~15 raw `console.*` sites routed through `dedupWarn`/`laneWarn`/`stormWarn`.
- **hitches P2 VERIFIED** — `_invalidateShadowPolicy` deletes `_policyRootFaults` (renderer.js:28870-28873), and all invalidation sites route through it (10247, 11918, 12523, 29497, 30723, 30763) plus the boundary/mesh teardown sweeps at 23596-23597 and 23885-23886.
- **hitches P4 VERIFIED** — `tryPresentedCall` (renderer.js:2279-2295): `faults >= PRESENTATION_ROW_FAULT_MAX` parks, `retryAt = now + 1000` spacing, epoch-flip resets the latch (2283), first fault warns via `noteLaneFault` + `console.warn`.

## Risk summary

The stale-serve class (F1/F3) is the concentrated residual: W116 epoch-guarded the *rescue* consult but left the *withhold* consults trusting the stale serve, so the machinery can both leak cold links and cause transient withholds precisely during light churn. F2 is a narrower variant of the same pattern inside the leftover eval. All three are fixable without touching authored visuals or sim determinism — the sim worker never reads this code path.
