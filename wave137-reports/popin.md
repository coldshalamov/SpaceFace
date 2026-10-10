# Wave 137 — popin-admission audit report

Audit lane: W137 popin-admission. Branch audited: `devin/1791504143-perf-w120` @ `e982b5a96`
("docs(perf): wave 136 log + scoreboard"), with code commits `35d35d292` (popin) and `0fa8e060e` (boot).
Method: code-level read of every claim/stamp/retain/request site on the audit ref, plus a live run of
the W136 probe suite (`test/asset-residency-sector-claims.test.mjs`, extracted at `e982b5a96`, node 24
with real `three`): **6/6 pass**, including the posting-class vector and the born-lapsed clamp.

Evidence labels per claim: VERIFIED / MECHANISM_VERIFIED / UNVERIFIED / REVIEW_REQUIRED.

---

## 1. W136 machinery regression verification

### Popin (`35d35d292`) — PRESENT, WORKING (VERIFIED)

- `claimArmClass` (`assetResidency.js:842`) — heuristic
  `/(^|[-_])(warm|prewarm|speculat|prefetch|predict|runway)/` over `role` (fallback
  `residencyRole`) plus the `decodeWarm: true` flag. Covers every arm-side role string in use
  (`sector-prewarm`, `sector-predicted`, `crucible-roster-warm`, `save-envelope-decode-runway`,
  `combat-spawn-decode-runway`, `wave-hull-decode-runway`, `packaged-decode-runway`,
  `warm-sector-arm`, `warm-previous-sector`, ownerless `warm` via `decodeWarm`).
- `sectorClaimStamp(metadata, sid, atMs, armClass)` (`:847`) — arm branch mints `sectorClaimAts`
  (lapse-able) and removes any live member; live branch mints `sectorLiveClaims` and removes the
  ats member; `memberIndex` kept in sync both ways.
- `unionOwnerSector` (`:919`) — stamps `sectorClaimStamp(..., armClass)` at both union points
  (`:927` sectorIds loop, `:941` single sid) with the armClass passed in by the caller.
- `reclaimWarm` — both explicit-`true` stamps restored: racing request (`~:534`) and live row
  (`~:539`), keyed on `metadata.residencyRole === 'warm'`.
- `retain` merge path (`:409-412`) — `postArmClass = claimArmClass(metadata)` applied to every
  unioned sid, posting-class not row class.
- Request-commit seed path — per-sid provenance intact: `sectorClaimAts` prior `priorAt < horizon`
  clamps to horizon (born-live clamp), `sectorLiveClaims` members stay live, unstamped members
  classify on the request's own role.

### Boot (`0fa8e060e`) — PRESENT, WORKING (VERIFIED, diff + code read)

- **F1 deferred-consume gen guard** (`saveSystem.js` `loadAsync`, `~:4910-4922`): after
  `await primaryPromise`, `(specHit || specByteHit) && spec && spec.sig !== 'gen:'+_saveStoreGeneration`
  discards the stale verdict and re-prepares via `_prepareEnvelopeStringAsync(freshRaw)` from a
  fresh `localStorage.getItem`. A generation bump anywhere inside the rollback-capture + worker
  window is caught.
- **F2 `peek_card_data` worker lane** — implemented in all three required places:
  module core `handleSaveWorkerRequestCore` (`saveWorker.js:344`), the `String.raw` ES5 literal
  twin (`:814`), and `PLAYER_CHUNKED_SAVE_WORKER_SOURCE` — which splices the player protocol into
  `SAVE_WORKER_SOURCE` at the `'encode_part'` needle (`saveSystem.js:8124-8125`, built at `:236`,
  blob'd at `:4166`), so the op propagates structurally. `cardDataFromEnvelope` projects exactly
  `{player, story, missions, aceMemory, meta}` — world tables and thumbnail stay off postMessage.
  Client `peekSaveCardData` (`saveSystem.js:5041`) posts with a 2500 ms timeout and settles `null`
  on no-worker/failure; `saveLoad.js` `fillSlotDataLazy` falls back to the byte-identical
  `unwrapSlotDataRaw` sync tail.
- **F3 mount re-arm** (`saveLoad.js ~:1136-1148`): the restored-selection path emits
  `save:loadSpeculationTarget` `{slot, raw, sig}` on mount — a `currentSlot != latest-occupied`
  restore no longer clicks cold. Idempotent via the arm's same-slot+sig early-out.
- **F4 same-slot burst coalescing** (`saveSystem.js ~:391-404`): `_pendingSlotRearm
  {slot, raw, gen, timer}` shares one `setTimeout(0)`; each same-slot bump refreshes `pending.raw`/
  `pending.gen`; the settle dispatches a single `speculateLoadPrepare` carrying the freshest gen
  (deferred — `immediate:true` removed intentionally so the burst collapses).

### W135 machinery — NOT TOUCHED by W136 (VERIFIED)

The W136 hunks to `assetResidency.js` are confined to `claimArmClass`/`sectorClaimStamp` signature,
the two `unionOwnerSector` stamp call sites, `reclaimWarm` (two sites) and the two-line retain-merge
addition. Untouched: per-sid provenance seed loop (incl. the `priorAt < horizon → horizon` born-lapsed
clamp), `exitWarmQualifies` at all four mint sites (`:1960`, `:2014`, `:2059`, `:2118`),
`pruneLapsedSectorClaims`/`sectorClaimFresh` bodies and the `SECTOR_CLAIM_PRUNE_INTERVAL_MS`
amortized trigger, and the suppressed-emit covering-spec re-check. PASS.

---

## 2. Findings (ranked)

### F-1 — HIGH · MECHANISM_VERIFIED · same-sid arm re-post silently revokes a live claim

`sectorClaimStamp`'s arm branch (`assetResidency.js:849-853`) runs
`ats.set(sid, nowMs)` **and** `metadata.sectorLiveClaims.delete(sid)`. Any arm-class post that
lands on a member already live-claimed destroys the immortal claim, replacing it with a +120 s
lapse-able timestamp. The W136 posting-class fix made every post *correctly labeled* — but the
stamp operation itself does not respect liveness dominance, so the last arm post wins over an
earlier live post.

End-to-end effect (all verified in code):

1. Live serve posts `{sectorId:'A', decodeServed:true}` → live member minted.
2. An arm post for the same sid on the same owner row (`unionOwnerSector` `:927`/`:941`) →
   `sectorLiveClaims.delete('A')`, `sectorClaimAts.set('A', now)`.
3. Arm ends; +120 s the member lapses (`SECTOR_CLAIM_STALE_MS`).
4. `pruneLapsedSectorClaims` drops the member → `entryCorridorRank` (`:1085`) now reads `-1` →
   the entry evicts first within its lease class (`sortSoftEvictionCandidates` corridor branch).
   `hasLiveSectorClaim` / `exitWarmQualifies` fail → the file is not warm-carried at the exit seam.
5. Result: cold re-decode on return — exactly the pop-in the claim machinery exists to kill.

Reachability on the real call graph (not hypothetical):

- **`decodeCacheOwner`** — every ownered load posts
  `retain(cacheKey, runtime.decodeCacheOwner, {sectorId, decodeWarm, decodeServed})`
  (`assetLoader.js:860`). A sector-A boundary serve mints the live claim; a *later* ownered warm
  decode carrying `sectorId:'A'` arm-posts the same member: crucible `retainForInstance`
  (`{role:'crucible-roster-warm'}`), and — the cleanest chain — **sector-prewarm on re-approach of a
  previously-served sector**. First-visit prewarm is benign (no prior live member); re-approach
  prewarm of sector A hits live members from the earlier visit and downgrades them. The arm's
  ~0.25 s re-post cadence keeps re-deleting the live claim for the whole approach, so even a
  mid-approach boundary serve is revoked by the next periodic arm tick. After arm end, any file
  not re-served live within 120 s loses its member → corridor rank `-1` → evict-first.
- **`defaultResidencyOwner`** — ownerless non-warm loads with `sectorId` (package consumers at
  `residencyRole 'runtime-cache'`/`'live-boundary'` via `retainConsumer`/`beginRequest`) post live
  on the shared session row; the ownerless-warm reclaim lane stamps arm on the same row. Same
  `options.sectorId` (current sector) is directly contestable.

The W136 report's defense — "every existing live-claim mint site still posts live" — is true as far
as it goes, but it only covers *delivery*; the defect is *revocation*. The posting-class machinery
does exactly what was specified; the gap it leaves is that an arm post overrides a live claim on
the same member. This is also why the bug survived the 6/6 probe: the vectors test same-sid arm→arm
refresh and arm-side correctness, never arm-posts onto a live-claimed member.

**Fix sketch (S effort / H impact / low risk):** in `sectorClaimStamp`'s arm branch, early-out when
`metadata.sectorLiveClaims?.has(sid)` — arm demand on a live-claimed member is strictly implied by
the live claim, so skipping the ats mint is semantics-preserving ("served outranks speculation").
Equivalently, gate at `unionOwnerSector`'s stamp calls on the same predicate. Add a probe vector:
live post → arm post on same sid → assert member still in `sectorLiveClaims`.

### F-2 — MEDIUM · MECHANISM_VERIFIED · `request.commit()` drops stamped metadata when the owner already owns the entry

`beginRequest`'s commit (`assetResidency.js:613-616`):

```js
const retained = active && entry && entry.owners.has(owner)
  ? true
  : (active ? retain(exactKey, owner, request.metadata) : false);
```

When a first request under the same owner has already committed, a second concurrent
`beginRequest` for the same key+owner early-returns `true` **without** calling `retain` — its
`request.metadata` (sectorId / sectorIds, role, decodeWarm) is discarded without unioning.
Non-warm lanes mint unconditionally (`reclaimWarm` dedupes only `ownerlessWarm`), so two
concurrent non-warm `loadAuthoredPart` calls for the same `cacheKey` carrying different
`sectorId`s is reachable today (both mint requests before the asset task dedupe joins them);
whichever commits second silently loses its sector claim. Narrow but real: the lost sid is the
second caller's only live-claim delivery.

**Fix sketch (S–M / M / low):** when `entry.owners.has(owner)`, run the union half of `retain`
over `request.metadata`'s sectorIds with `claimArmClass(request.metadata)` — i.e. reuse the merge
path's union loop rather than skipping it.

### F-3 — LOW · UNVERIFIED (latent) · retain merge path collapses provenance to a single posting class

The merge branch (`:409-412`) applies one `postArmClass` to every unioned sid, ignoring per-sid
`sectorClaimAts`/`sectorLiveClaims` if the *posted* metadata ever carries them — where the seed
path honors per-sid provenance. No live caller passes stamped member maps through `retain()`
today (all post sites use fresh literals; `reclaimWarm` stamps the row/request directly, not via
metadata fields), so this is structurally unreachable — flagged because the asymmetry will bite
the first caller that forwards a pre-stamped metadata through retain. A one-line code comment
naming the contract, or mirroring the seed loop's per-sid provenance in the merge path, closes it.

### F-4 — hunt (b)/(d) verdict · VERIFIED-AS-DESIGNED · live-claim accrual is bounded; no purpose-death prune exists or needs one

Live members accrue ~one `memberIndex` row per distinct served sector per owner row — bounded by
visited-sector count (double-digit worst case), O(1) each; `entryCorridorRank` iterates
owners×members per eviction-sort candidate — trivially small. Live members never union-prune:
`pruneLapsedSectorClaims` only drops stale ats members, and no caller can signal "this claim's
purpose died" — correct by contract, since sectors depart rather than die and a served-sector
claim *is* the intended return-visit insurance. The only live-claim loss mode found runs the
opposite direction: F-1 revokes them early.

### F-5 — hunt (c) verdict · VERIFIED, hole stays closed · live posts on arm-minted shared rows work correctly

The W136 report's residual worry — a non-arm post landing on an arm-minted shared row — is handled:
the merge path classifies by the *posting's* `postArmClass`, never the row's stored role, and the
seed path classifies unstamped members on the request's own role. Concrete reachable sequence,
verified: `decodeWarm:true` retain mints an arm member on `decodeCacheOwner`; a subsequent
`decodeServed` retain on the same entry hits the merge branch with `postArmClass=false` → live
member minted on the arm-minted row. Correct by construction.

### F-6 — hunt (a) sweep verdict · VERIFIED · every sectorId-carrying post site classifies by posting class

Enumerated post sites: `retain` merge (`assetLoader.js:860` decode-cache, `:1474` package),
`retainConsumer`, `createInstance`/`createFlightInstance`, `retainForInstance` (crucible),
bootstrap posts, `reclaimWarm` stamps, `beginRequest` commit (seed/merge), `prepareSectorEntry`
prewarm requests. All carry literals or request metadata that `claimArmClass` maps correctly; no
other mislabel found. Documented asymmetry (not a defect per current contract):
`retainPackageOwner` / the `'render-package-cache'` request carry **no** `sectorId` — package-owner
rows are sector-invisible, so a package held only by its owner with all consumers released reads
"cache-only" and is deliberately evictable. Re-check if package-only residency ever needs
exit-warm carry.

---

## 3. Residual risk statement

W136's posting-class fix is real and verified — the label is right on every post. The remaining
popin risk concentrates in **F-1**: liveness dominance at stamp time. Its window is wide in
practice (continuous arm cadence revokes live claims minted mid-approach), it needs no new code
path to trigger, and its symptom — cold re-decode on sector return — is indistinguishable from an
uncovered sector at the scoreboard level. F-2 is a narrow same-owner same-key race. Everything
else audited holds.

## 4. Recommended fix order

1. **F-1** — `sectorClaimStamp` arm branch: early-out on `sectorLiveClaims.has(sid)` (+ probe
   vector: live→arm same sid keeps live membership). S/H.
2. **F-2** — `request.commit()`: union `request.metadata` sectorIds into the existing owner row
   instead of early-returning. S–M/M.
3. **F-3** — merge-path provenance parity or contract comment. S/L.
