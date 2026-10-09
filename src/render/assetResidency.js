// Ref-counted ownership for decoded authored GPU resources.
//
// This is presentation-only state. It never reads or mutates simulation authority: callers attach
// renderer/scene boundary owners and sector labels solely so decoded Three.js resources can be
// reclaimed without lowering visual quality or racing an in-flight GLB decode.

import {
  createResourceGovernor,
  GOVERNOR_PINNED_ROLES,
  GOVERNOR_RESIDENCY_BYTE_CEILING,
  residencyEvictionCeiling,
  governorEntryBlockReasons,
  isGovernorEntryEvictable,
  isGovernorOwnerEvictable,
  memoryUnitList,
  numericBytes,
} from './resourceGovernor.js';
export { residencyEvictionCeiling };
import * as THREE from 'three';

const PROTECTED_RESOURCE = Symbol('spaceface.protectedGpuResource');
const registriesByRenderer = new WeakMap();
const renderTargetAttachmentIdentities = new WeakMap();
const DEFAULT_EVENT_HISTORY = 256;
const MAX_EVENT_HISTORY = 512;
// Hard cap on entries whose only owner is the decoded-package cache lease. The 30 s idle gate and
// the 10 s sweep cadence leave room for a busy sector to release many hull packages inside one
// window; this bound reclaims the oldest-idle at the moment an entry becomes cache-only, so the
// soft working set can never ride unbounded between sweeps. Matches the 64 MiB residual budget in
// test/asset-residency-refcounts.test.mjs.
const DEFAULT_PACKAGE_CACHE_ONLY_MAX_BYTES = 64 * 1024 * 1024;
const VISIBILITY_OFF_GLASS_PRESENTS = 8;

export function protectSharedGpuResource(resource) {
  if (!resource || typeof resource !== 'object') return resource;
  if (resource[PROTECTED_RESOURCE]) return resource;
  const originalDispose = typeof resource.dispose === 'function' ? resource.dispose : null;
  Object.defineProperty(resource, PROTECTED_RESOURCE, {
    configurable: true,
    value: {
      originalDispose,
      finalized: false,
      abandoned: false,
    },
  });
  resource.userData = { ...(resource.userData || {}), spacefaceSharedAsset: true };
  if (originalDispose) resource.dispose = protectedDispose;
  return resource;
}

function protectedDispose() {}

export function createAssetResidencyRegistry(options = {}) {
  // The renderer is optional because the registry is also used by decoder/unit-test adapters.
  // When present it is the authority for Three's per-target MSAA path; a target's requested
  // `samples` value alone is not enough to know whether a resolve allocation exists.
  const accountingRenderer = options.renderer || null;
  const now = typeof options.now === 'function'
    ? options.now
    : () => (globalThis.performance && typeof globalThis.performance.now === 'function'
      ? globalThis.performance.now()
      : Date.now());
  const maxEvents = Math.min(MAX_EVENT_HISTORY, Math.max(32, Number(options.maxEvents) || DEFAULT_EVENT_HISTORY));
  const assets = new Map();
  const resources = new Map();
  const memoryUnits = new Map();
  // Running byte ledgers — every mutation site funnels through
  // registerAsset/evictIfUnowned/finalizeResource, so the scalars the governor
  // consults (gpuResidentBytes, cpuPackageBytes, unaccountedResources) stay
  // O(1) instead of re-walking their backing maps inside every budget census.
  let gpuResidentBytesTotal = 0;
  let cpuPackageBytesTotal = 0;
  let unaccountedResourceCount = 0;
  const owners = new Map();
  const releasedObjectOwners = new WeakSet();
  const releasedPrimitiveOwners = new Set();
  const pendingRequests = new Set();
  const events = [];
  // Live-maintained active-request key set — every `active` transition funnels
  // through beginRequest/cancel/finishRequest, so the set is maintained
  // incrementally with a per-key refcount (concurrent dup-key requests stay
  // correct) instead of a version-memoized re-mint: a K-pending owner teardown
  // used to re-mint O(P) per cancel, O(K × P) per drain.
  const activePendingRefcounts = new Map();
  const activePendingKeys = new Set();
  // Enforce-plan memo (W125 F2): every input to the budget census is funnelled —
  // asset register/evict, owner-membership index/unindex, and the pending-request
  // set (which also re-keys governorBlockedMembers). When none moved since the
  // last plan and the byte ledgers are identical, the receipt is re-servable
  // verbatim; an evicting call always mutates through a funnel, so a memoized
  // plan can never skip live evictions.
  let residencyMutationSeq = 0;
  let pendingRequestSeq = 0;
  let enforcePlanMemo = null;
  function notePendingRequestActivated(key) {
    const count = (activePendingRefcounts.get(key) || 0) + 1;
    activePendingRefcounts.set(key, count);
    if (count === 1) {
      activePendingKeys.add(key);
      pendingRequestSeq += 1;
      // Going active disqualifies the entry from the soft-budget candidate
      // classes — re-key once per 0->1 transition, same for 1->0 below.
      const entry = assets.get(String(key));
      if (entry) { rekeySoftBudgetClass(entry); rekeyGovernorBlocked(entry); }
    }
  }
  function notePendingRequestDeactivated(key) {
    const count = activePendingRefcounts.get(key);
    if (!count) return;
    if (count <= 1) {
      activePendingRefcounts.delete(key);
      activePendingKeys.delete(key);
      pendingRequestSeq += 1;
      const entry = assets.get(String(key));
      if (entry) { rekeySoftBudgetClass(entry); rekeyGovernorBlocked(entry); }
    } else {
      activePendingRefcounts.set(key, count - 1);
    }
  }
  function deactivateRequest(request) {
    if (request && request.active) {
      request.active = false;
      notePendingRequestDeactivated(request.key);
    }
  }
  function activePendingKeySet() {
    return activePendingKeys;
  }
  // Evictions run inside an active enforce have their demand already served —
  // arming softBudgetPending there just books a redundant next-drain census.
  // Scope: only the release() call itself is wrapped, never held across yields.
  let softBudgetArmSuppressed = 0;
  // Warm-handoff coverage ledger: the live warm owner's asset keys still lacking
  // a non-warm owner, maintained per-mutation so each decode-commit retain
  // consults O(1) instead of re-walking O(warmAssets x owners).
  let warmCoverage = null;
  let eventSequence = 0;
  let assetGeneration = 0;
  let contextGeneration = 0;
  let contextLost = false;
  let currentSectorId = null;
  let warmSectorId = null;
  let warmOwner = null;
  // Rotation sequencing: deferred mints queue behind earlier residency drains, so the
  // live pointer can lag the newest requested target. Call-time decisions consult the
  // newest REQUESTED target; each rotate mints a seq stamp and a queued iterator only
  // repoints the live pointer while it is still the newest APPLIED rotation.
  let hasPendingRotate = false;
  let pendingSectorTarget = null;
  let latestRotateSeq = 0;
  let appliedRotateSeq = 0;
  const effectiveCurrentSectorId = () => (hasPendingRotate ? pendingSectorTarget : currentSectorId);
  // Iterate two member sets as one sequence without minting a concat array per pass.
  function* iterTwoSets(a, b) {
    for (const entry of a) yield entry;
    for (const entry of b) yield entry;
  }
  // Eviction corridor: current sector then predicted legs in approach order, fed by
  // updatePredictedSectorPrewarm. Soft candidates whose owners carry no corridor sector
  // are the least valuable residency — under byte pressure they should die before a
  // warm a nearer leg still needs, regardless of registration (LRU) order.
  let evictionCorridorKey = '';
  let evictionCorridorRanks = null;
  let disposedResources = 0;
  let abandonedResources = 0;
  let evictedAssets = 0;
  let cacheSweepCount = 0;
  // Warm-mint coverage-gap ledger (W125): retains minted without metadata.sectorId
  // never reach sectorOwnerIndex, so an asset pinned only by scopeless owners is
  // invisible to the sector-exit warm mint and can evict+re-cross under pressure.
  // Counted at retain() by role, split by whether the entry still carries
  // sector-scoped owners (covered anyway) or is the entry's only owner (the gap).
  const sectorlessOwnerRetains = { total: 0, onSectorIndexedEntries: 0, soleOwnerUnindexed: 0, byRole: new Map() };
  let diagnosticsEpoch = 0;
  let canonicalDiagnosticsCache = null;
  let canonicalDiagnosticsEpoch = -1;
  // An omitted cap keeps the 64 MiB package-cache default. An explicit null is not
  // "uncapped" — it resolves to the governor residency ceiling so eviction cannot run unbounded.
  const packageCacheOnlyMaxBytes = options.maxPackageCacheOnlyBytes === null
    ? GOVERNOR_RESIDENCY_BYTE_CEILING
    : (Number.isFinite(Number(options.maxPackageCacheOnlyBytes))
      ? Math.max(0, Number(options.maxPackageCacheOnlyBytes))
      : DEFAULT_PACKAGE_CACHE_ONLY_MAX_BYTES);
  const softResidentMaxBytes = options.maxSoftResidentBytes === null
    ? GOVERNOR_RESIDENCY_BYTE_CEILING
    : (Number.isFinite(Number(options.maxSoftResidentBytes))
      ? Math.max(0, Number(options.maxSoftResidentBytes))
      : DEFAULT_PACKAGE_CACHE_ONLY_MAX_BYTES);
  const visibilityHolds = new Map();
  let visibilityPresent = 0;
  // Write counter bumped on every SEMANTIC visibilityHolds mutation (row
  // create, offGlass change, held flip) — never on idempotent present
  // restamps. The noteOwnerVisibility memo keys on it, so a write landing
  // between two same-present consults invalidates the stale verdict.
  let visibilityWriteSeq = 0;
  const ownerVisibilityMemo = new Map();
  // Whether this present's advance pass already ran. Staleness is virtual
  // (row.offGlass + elapsed un-noted presents); the current present counts
  // toward it only once its advance has run — consults before the advance
  // see the same count the old eager tail-walk had materialized, consults
  // after see one more.
  let visibilityAdvancedThisPresent = false;
  // >0 while a sweep/budget pass is already walking the registry; release paths inside it must not
  // re-enter the inline cap or every per-owner release would rescan the whole asset table.
  let packageCacheBudgetDepth = 0;
  const governor = createResourceGovernor({
    maxCpuBytes: options.maxCpuBytes,
    maxGpuBytes: options.maxGpuBytes,
  });

  function emit(type, detail = {}) {
    const event = Object.freeze({ sequence: ++eventSequence, type, atMs: now(), ...detail });
    events.push(event);
    if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
    // Every state mutation that can change a diagnostics snapshot ends in an emit, so this
    // counter is the cache epoch for canonicalDiagnostics below.
    diagnosticsEpoch++;
    if (typeof options.onEvent === 'function') options.onEvent(event);
    return event;
  }

  function ownerState(owner, create = true) {
    if (owner == null) return null;
    if (isOwnerReleased(owner)) return null;
    let state = owners.get(owner);
    if (!state && create) {
      state = { owner, assets: new Set(), requests: new Set(), released: false, removalOff: null, assetsVersion: 0 };
      owners.set(owner, state);
      if (owner && typeof owner.addEventListener === 'function') {
        const onRemoved = () => releaseOwner(owner, 'boundary-removed');
        owner.addEventListener('removed', onRemoved);
        state.removalOff = () => {
          try { owner.removeEventListener('removed', onRemoved); } catch (_) {}
        };
      }
    }
    return state;
  }

  function isOwnerReleased(owner) {
    if (owner == null) return false;
    return (typeof owner === 'object' || typeof owner === 'function')
      ? releasedObjectOwners.has(owner)
      : releasedPrimitiveOwners.has(owner);
  }

  function markOwnerReleased(owner) {
    if (owner == null) return;
    if (typeof owner === 'object' || typeof owner === 'function') releasedObjectOwners.add(owner);
    else releasedPrimitiveOwners.add(owner);
  }

  // Admission intent revives an owner: authored boundaries re-admit after a readmission marker
  // (stall abort, owner-inactive keep) and a permanently-released mark would kill every request
  // the fresh epoch mints. The old state was already torn down by cleanupOwnerState on release,
  // so revival is just letting the next ownerState() rebuild it fresh.
  function reviveOwner(owner) {
    if (owner == null) return;
    if (typeof owner === 'object' || typeof owner === 'function') releasedObjectOwners.delete(owner);
    else releasedPrimitiveOwners.delete(owner);
    const state = owners.get(owner);
    if (state) state.released = false;
  }

  function registerAsset(key, gpuResources, registration = {}) {
    const exactKey = String(key || '');
    if (!exactKey) throw new Error('Asset residency registration requires a stable key.');
    const list = [...new Set((gpuResources || []).filter(Boolean))];
    const prior = assets.get(exactKey);
    if (prior && prior.state === 'resident') {
      const sameGeneration = prior.resources.size === list.length
        && list.every((resource) => [...prior.resources].some((entry) => entry.resource === resource));
      if (sameGeneration) return prior.handle;
      throw new Error(`Asset residency key ${exactKey} already has a live generation.`);
    }

    const entry = {
      key: exactKey,
      generation: ++assetGeneration,
      state: 'resident',
      resources: new Set(),
      owners: new Map(),
      onEvict: typeof registration.onEvict === 'function' ? registration.onEvict : null,
      registeredAtMs: now(),
      lastReleaseAtMs: now(),
      // Demand recency for the warm-class eviction order: a file re-decoding after
      // an eviction cycle must not sort next-evictable just because its previous
      // lease released most recently — claim time outranks release time there.
      lastWarmClaimAtMs: now(),
      // Encoded package bytes are a CPU/cache concern. They are deliberately kept separate from
      // GPU residency: a compressed .glb on disk is not a valid estimate for decoded buffers or
      // driver texture allocations.
      cpuPackageBytes: normalizeNonNegativeBytes(registration.cpuPackageBytes),
      metadata: { ...(registration.metadata || {}) },
      handle: null,
      // Maintained per owner-set mutation by noteOwnerMembership* — the soft
      // budget's per-entry class checks consult O(1) counters instead of
      // re-scanning the owner set inside every census row.
      softOwnerCount: 0,
      rpcOwnerCount: 0,
      // Soft-budget class ledger: 0 = not a candidate, 1 = package-cache-only,
      // 2 = soft-only non-strict. Re-keyed per owner/state/pending mutation so
      // the enforce caps consult O(1) totals instead of an O(assets) walk.
      softBudgetClass: 0,
      softBudgetBytes: 0,
      // Governor row memo: bumped on every owner-membership mutation so a
      // cached governorEntry row stays exact between enforce calls.
      ownersVersion: 0,
      governorRowMemo: null,
      // Diagnostics row memo on the same version — the sync seam publishes
      // re-mint the row set only for entries whose owner set actually moved.
      diagRowMemo: null,
      // Live count of sector-scoped owners (sum of row.total across every
      // sectorOwnerIndex map this entry sits in). 0 = invisible to the
      // sector-exit warm mint regardless of how many live owners pin it.
      sectorOwnerRefs: 0,
    };
    const accountingOptions = {
      renderer: registration.renderer || accountingRenderer,
      renderTargetMultisampleLayout: registration.renderTargetMultisampleLayout
        ?? registration.renderTargetLayout
        ?? registration.gpuAccounting?.renderTargetMultisampleLayout
        ?? registration.metadata?.renderTargetMultisampleLayout,
      renderTargetSampleCount: registration.renderTargetSampleCount
        ?? registration.gpuAccounting?.renderTargetSampleCount
        ?? registration.metadata?.renderTargetSampleCount,
    };
    for (const resource of list) {
      protectSharedGpuResource(resource);
      let resourceEntry = resources.get(resource);
      if (!resourceEntry) {
        const accounting = resourceMemoryAccounting(resource, accountingOptions);
        const units = accounting.units;
        resourceEntry = {
          resource,
          assets: new Set(),
          memoryUnits: new Set(),
          bytes: 0,
          accounting: accounting.known ? 'known' : 'unknown',
          unaccounted: !accounting.known,
          state: 'resident',
        };
        for (const unit of units) {
          let memory = memoryUnits.get(unit.identity);
          if (!memory) {
            memory = { identity: unit.identity, bytes: unit.bytes, resources: new Set() };
            memoryUnits.set(unit.identity, memory);
            gpuResidentBytesTotal += memory.bytes;
          }
          memory.resources.add(resourceEntry);
          resourceEntry.memoryUnits.add(memory);
          resourceEntry.bytes += memory.bytes;
        }
        resources.set(resource, resourceEntry);
        if (resourceEntry.unaccounted) unaccountedResourceCount += 1;
      }
      resourceEntry.assets.add(entry);
      entry.resources.add(resourceEntry);
    }
    entry.handle = Object.freeze({ key: exactKey, generation: entry.generation });
    assets.set(exactKey, entry);
    residencyMutationSeq += 1;
    rekeyGovernorBlocked(entry);
    cpuPackageBytesTotal += entry.cpuPackageBytes;
    emit('asset-registered', {
      key: exactKey,
      generation: entry.generation,
      resourceCount: entry.resources.size,
      bytes: assetResidentBytes(entry),
      gpuResidentBytes: assetResidentBytes(entry),
      cpuPackageBytes: entry.cpuPackageBytes,
      unaccountedResources: assetUnaccountedResources(entry),
    });
    return entry.handle;
  }

  function retain(key, owner, metadata = {}) {
    const entry = assets.get(String(key || ''));
    if (!entry || entry.state !== 'resident' || owner == null) return false;
    const state = ownerState(owner);
    if (!state || state.released) return false;
    const existingMetadata = entry.owners.get(owner);
    if (existingMetadata) {
      // A warm-decode lease upgraded by a later boundary-scoped serve: observed demand outranks
      // untouched speculation in the soft-eviction sort, and merging in place keeps the shared
      // decode/package-cache lease honest without a release/re-retain bounce between sweeps.
      if (existingMetadata.decodeWarm === true && metadata.decodeServed === true) {
        existingMetadata.decodeWarm = false;
        existingMetadata.decodeServed = true;
        // In-place owner-metadata mutation — bump the row version like the
        // funnel does so a memoized governorEntry can't serve the stale clone.
        entry.ownersVersion += 1;
        // A boundary-scoped serve claiming a warm lease is a fresh demand signal.
        entry.lastWarmClaimAtMs = now();
      } else if (metadata.decodeWarm === true || metadata.softLease === true) {
        // A warm re-post on an already-held entry is still a fresh demand signal:
        // the soft-eviction sort reads lastWarmClaimAtMs, so an un-refreshed armed
        // cohort keeps its first-post stamp and deterministically evicts first on
        // every pressure wave. Re-pin it — the W130 "re-post re-pins" intent.
        entry.lastWarmClaimAtMs = now();
      }
      // A second warm arm claiming the same row under a different sector unions
      // its sector into the claim — corridor rank + the sector index must see the
      // newest consumer's sector, or the entry evicts first under pressure while
      // its real consumer sector sits in-corridor (late re-decode pop).
      if (metadata.sectorId != null) unionOwnerSector(entry, existingMetadata, metadata.sectorId);
      if (metadata.sectorIds instanceof Set) {
        for (const sid of metadata.sectorIds) unionOwnerSector(entry, existingMetadata, sid);
      }
      return false;
    }
    const ownerMetadata = { ...metadata };
    {
      // Seed the sector union from both inputs — a request-metadata carrying a
      // pre-unioned sectorIds set must not drop its scalar's sector either.
      const seed = new Set(ownerSectorIds(ownerMetadata));
      if (ownerMetadata.sectorId != null) seed.add(String(ownerMetadata.sectorId));
      if (seed.size) ownerMetadata.sectorIds = seed;
      else delete ownerMetadata.sectorIds;
      if (ownerMetadata.sectorId == null && seed.size) {
        ownerMetadata.sectorId = seed.values().next().value;
      }
    }
    if (ownerMetadata.presentationTier) {
      ownerMetadata.presentationTier = String(ownerMetadata.presentationTier);
    }
    if (!ownerMetadata.role) {
      const tier = ownerMetadata.presentationTier;
      if (tier === 'R0_GLASS') ownerMetadata.role = 'glass';
      else if (tier === 'R1_RUNWAY') ownerMetadata.role = 'runway';
      else if (tier === 'R2_METADATA' || tier === 'R3_UNLOADED') ownerMetadata.role = 'evictable';
    }
    entry.owners.set(owner, ownerMetadata);
    noteOwnerMembershipIndexed(entry, ownerMetadata);
    if (ownerMetadata.sectorId == null) {
      sectorlessOwnerRetains.total += 1;
      if (entry.sectorOwnerRefs > 0) sectorlessOwnerRetains.onSectorIndexedEntries += 1;
      else if (entry.owners.size === 1) sectorlessOwnerRetains.soleOwnerUnindexed += 1;
      const roleKey = String(ownerMetadata.role || '(none)');
      sectorlessOwnerRetains.byRole.set(roleKey, (sectorlessOwnerRetains.byRole.get(roleKey) || 0) + 1);
    }
    entry.lastWarmClaimAtMs = now();
    state.assets.add(entry);
    state.assetsVersion += 1;
    noteWarmCoverageEntryMutation(entry);
    emit('asset-retained', {
      key: entry.key,
      generation: entry.generation,
      refCount: entry.owners.size,
      role: ownerMetadata.role || null,
      presentationTier: ownerMetadata.presentationTier || null,
      sectorId: ownerMetadata.sectorId || null,
    });
    // Save restore destroys every render boundary synchronously and rebuilds the same sector a few
    // frames later. prepareSectorExit() places one temporary hold over that gap. Retire the hold
    // only when every warmed asset has a replacement live owner, so no decode generation is
    // evicted/reloaded between F9 teardown and visual rehydration.
    handoffWarmOwnerWhenCovered(owner);
    // Soft-lease admissions (package cache, decode cache, runtime-cache session pins) grow the
    // bounded soft set — a cache-warming decode that never takes a live owner is exactly how
    // soft residency grows without any release. Bound it at admission, not just at departure.
    // Same demand-flag contract release() runs: K retains in one commit
    // continuation must not pay K x O(assets x owners) census inline — mark
    // demand on a big world and let the paced sweep enforce.
    if (isSoftResidencyOwner(ownerMetadata)) {
      if (assets.size < SOFT_BUDGET_INLINE_MAX) enforceSoftResidencyBudgets();
      else softBudgetPending = true;
    }
    return true;
  }

  // Warm re-post consult for the latch-free arms: an entry this owner already holds
  // needs no request mint — refresh the soft-claim stamp in place so the idle sort
  // keeps the armed cohort young, then let the shared task cache serve the blueprint.
  // An in-flight request under the same owner carries the decode demand already —
  // a sibling mint per poll is pure ledger churn (the task cache dedupes the decode
  // itself), so the consult covers it too. The consult is sector-aware: the shared
  // session owner can carry demand for several sectors on one row, so a re-post
  // under a different sectorId unions it into the claim (resident) or into the
  // pending request's metadata (in-flight → commit→retain unions on settle) —
  // otherwise the first poster's stale sector ranks the entry outside the
  // corridor and pressure evicts the file its real consumer sector still needs.
  function reclaimWarm(key, owner, sectorId = null) {
    if (owner == null) return false;
    const exactKey = String(key || '');
    const entry = assets.get(exactKey);
    if (entry && entry.state === 'resident') {
      const existingMetadata = entry.owners.get(owner);
      if (!existingMetadata) return false;
      unionOwnerSector(entry, existingMetadata, sectorId);
      entry.lastWarmClaimAtMs = now();
      return true;
    }
    const state = owners.get(owner);
    if (!state || state.released) return false;
    for (const request of state.requests) {
      if (request.key === exactKey && request.active) {
        if (sectorId != null) {
          const meta = request.metadata || (request.metadata = {});
          if (!(meta.sectorIds instanceof Set)) {
            meta.sectorIds = new Set(meta.sectorId != null ? [String(meta.sectorId)] : []);
          }
          meta.sectorIds.add(String(sectorId));
        }
        // Re-stamp the entry's warm-claim where one exists — its post-settle idle sort
        // keeps the armed cohort young even while the decode is still landing.
        if (entry) entry.lastWarmClaimAtMs = now();
        return true;
      }
    }
    return false;
  }

  // One O(entry.owners) probe — used by the incremental coverage ledger.
  function warmEntryCovered(entry, owner) {
    for (const candidate of entry.owners.keys()) {
      if (candidate !== owner) return true;
    }
    return false;
  }

  // Full warm-coverage census: mints the uncovered-key set once per warm owner,
  // then noteWarmCoverageEntryMutation keeps it exact per owners-set mutation.
  // O(1) afterwards — the per-retain consult no longer re-walks the warm set.
  function warmCoverageComplete(owner, state) {
    if (!warmCoverage || warmCoverage.owner !== owner) {
      const uncovered = new Set();
      for (const entry of state.assets) {
        if (!warmEntryCovered(entry, owner)) uncovered.add(entry.key);
      }
      warmCoverage = { owner, uncovered };
    }
    return warmCoverage.uncovered.size === 0;
  }

  function noteWarmCoverageEntryMutation(entry) {
    const coverage = warmCoverage;
    if (!coverage || !entry) return;
    const owner = coverage.owner;
    if (owner !== warmOwner) { warmCoverage = null; return; }
    const state = owners.get(owner);
    if (!state || !state.assets.has(entry)) { coverage.uncovered.delete(entry.key); return; }
    if (warmEntryCovered(entry, owner)) coverage.uncovered.delete(entry.key);
    else coverage.uncovered.add(entry.key);
  }

  function handoffWarmOwnerWhenCovered(candidateOwner) {
    const owner = warmOwner;
    if (!owner || candidateOwner === owner) return false;
    const state = owners.get(owner);
    if (!state || state.released || state.assets.size === 0) return false;
    if (!warmCoverageComplete(owner, state)) return false;
    releaseOwner(owner, 'warm-sector-handed-off');
    warmOwner = null;
    warmSectorId = null;
    emit('warm-sector-handed-off', { currentSectorId });
    return true;
  }

  function beginRequest(key, owner, metadata = {}) {
    const exactKey = String(key || '');
    const state = ownerState(owner);
    const request = {
      key: exactKey,
      owner,
      metadata: { ...metadata },
      active: !!state && !state.released,
      startedAtMs: now(),
      shouldDecode() { return request.active && !!state && !state.released; },
      commit() {
        const active = request.shouldDecode();
        finishRequest(request, active ? 'completed' : 'cancelled-after-decode');
        const entry = assets.get(exactKey);
        const retained = active && entry && entry.owners.has(owner)
          ? true
          : (active ? retain(exactKey, owner, request.metadata) : false);
        if (!retained) evictIfUnowned(assets.get(exactKey), active ? 'unclaimed-decode' : 'cancelled-decode');
        return retained;
      },
      cancel(reason = 'cancelled-before-decode') {
        deactivateRequest(request);
        finishRequest(request, reason);
        evictIfUnowned(assets.get(exactKey), reason);
      },
    };
    pendingRequests.add(request);
    if (request.active) notePendingRequestActivated(exactKey);
    if (state) state.requests.add(request);
    emit('request-begun', { key: exactKey, role: metadata.role || null });
    return request;
  }

  function finishRequest(request, status) {
    if (!pendingRequests.has(request)) return;
    deactivateRequest(request);
    pendingRequests.delete(request);
    const state = owners.get(request.owner);
    if (state) {
      state.requests.delete(request);
      cleanupOwnerState(state);
    }
    emit('request-finished', {
      key: request.key,
      status,
      durationMs: Math.max(0, now() - request.startedAtMs),
    });
  }

  function releaseOwner(owner, reason = 'released', deferBudgets = false) {
    const state = owners.get(owner);
    markOwnerReleased(owner);
    if (!state) return 0;
    state.released = true;
    for (const request of [...state.requests]) request.cancel(reason);
    let released = 0;
    for (const entry of [...state.assets]) {
      const releasedMetadata = entry.owners.get(owner);
      if (!entry.owners.delete(owner)) continue;
      noteOwnerMembershipUnindexed(entry, releasedMetadata);
      state.assets.delete(entry);
      state.assetsVersion += 1;
      noteWarmCoverageEntryMutation(entry);
      entry.lastReleaseAtMs = now();
      released++;
      emit('asset-released', {
        key: entry.key,
        generation: entry.generation,
        refCount: entry.owners.size,
        reason,
      });
      evictIfUnowned(entry, reason);
    }
    cleanupOwnerState(state);
    // The census+sort is unconditional here otherwise: a mass boundary
    // teardown drives this through the `boundary-removed` listener once per
    // detach — K x O(assets) synchronously. Big worlds arm the paced flag
    // instead (the sweep's release-detached drains clear and enforce it).
    if (released > 0 && !deferBudgets) {
      if (assets.size < SOFT_BUDGET_INLINE_MAX) enforceSoftResidencyBudgets();
      // Suppressed inside an active evict loop: the demand is already being served.
      else if (softBudgetArmSuppressed === 0) softBudgetPending = true;
    }
    return released;
  }

  // Scene-boundary owners only self-release when their own 'removed' listener fires — an
  // interior detach (a wrapper above the boundary was removed) or a retention that landed
  // while the boundary was already parked never dispatches it, so the registry would pin the
  // dead tree forever. The renderer periodically hands back owners that are detached and
  // claimed by no live binding; parked-but-claimed boundaries (docked player hull, staged
  // admissions) are the caller's claim check to preserve.
  function releaseDetachedBoundaryOwners(options = {}) {
    const isDetached = typeof options.isDetached === 'function'
      ? options.isDetached
      : (owner) => owner && owner.parent == null;
    const isClaimed = typeof options.isClaimed === 'function' ? options.isClaimed : null;
    const reason = options.reason || 'detached-boundary-owner';
    const released = [];
    for (const [owner, state] of [...owners.entries()]) {
      if (state.released || !owner || owner.isObject3D !== true) continue;
      if (!isDetached(owner)) continue;
      if (isClaimed && isClaimed(owner)) continue;
      releaseOwner(owner, reason, true);
      released.push(owner);
    }
    if (released.length || softBudgetPending) {
      softBudgetPending = false;
      enforceSoftResidencyBudgets();
    }
    return Object.freeze(released);
  }

  // Stepped twin: yields per owner examined so the renderer's sweeps can drive
  // the O(owners x ancestor-walk + claim probes) census across their slice
  // clock. The live owners map is iterated directly — releaseOwner only deletes
  // the current entry (safe mid-iteration) and a late-joining owner gets probed
  // fresh, the conservative direction. Row order and verdicts identical.
  function* releaseDetachedBoundaryOwnersSteps(options = {}, batchOwners = 64) {
    const isDetached = typeof options.isDetached === 'function'
      ? options.isDetached
      : (owner) => owner && owner.parent == null;
    const isClaimed = typeof options.isClaimed === 'function' ? options.isClaimed : null;
    // A stepped claim probe lets the caller's own multi-source fallback ride the
    // release leg's slice clock — it runs only when the sync probe misses.
    const isClaimedSteps = typeof options.isClaimedSteps === 'function'
      ? options.isClaimedSteps : null;
    const reason = options.reason || 'detached-boundary-owner';
    const released = [];
    let visited = 0;
    for (const [owner, state] of owners.entries()) {
      if (++visited % batchOwners === 0) yield;
      if (state.released || !owner || owner.isObject3D !== true) continue;
      if (!isDetached(owner)) continue;
      if (isClaimed && isClaimed(owner)) continue;
      if (isClaimedSteps && (yield* isClaimedSteps(owner))) continue;
      // Budget enforce rides once per sweep instead of per release: releases
      // are monotonic, so a mass-detach wave pays one O(assets) census rather
      // than owners x assets inside the batch.
      releaseOwner(owner, reason, true);
      released.push(owner);
    }
    if (released.length || softBudgetPending) {
      softBudgetPending = false;
      yield* enforceSoftResidencyBudgetsSteps();
    }
    return Object.freeze(released);
  }

  function handoffOwnerWhenCovered(owner, reason = 'owner-handed-off') {
    const state = owners.get(owner);
    if (!state || state.released || state.assets.size === 0) return false;
    for (const entry of state.assets) {
      let covered = false;
      for (const candidate of entry.owners.keys()) {
        if (candidate !== owner) { covered = true; break; }
      }
      if (!covered) return false;
    }
    releaseOwner(owner, reason);
    return true;
  }

  function release(key, owner, reason = 'released') {
    const entry = assets.get(String(key || ''));
    const state = owners.get(owner);
    const releasedMetadata = entry && entry.owners.get(owner);
    if (!entry || !state || !entry.owners.delete(owner)) return false;
    noteOwnerMembershipUnindexed(entry, releasedMetadata);
    state.assets.delete(entry);
    state.assetsVersion += 1;
    noteWarmCoverageEntryMutation(entry);
    entry.lastReleaseAtMs = now();
    emit('asset-released', {
      key: entry.key,
      generation: entry.generation,
      refCount: entry.owners.size,
      reason,
    });
    evictIfUnowned(entry, reason);
    cleanupOwnerState(state);
    // K releases in one drain used to pay K x O(assets) census+sort inline —
    // mark demand and let the paced residency service run the stepped
    // enforcement. Small worlds keep the inline path (the census is free).
    if (assets.size < SOFT_BUDGET_INLINE_MAX) enforceSoftResidencyBudgets();
    else if (softBudgetArmSuppressed === 0) softBudgetPending = true;
    return true;
  }

  function cleanupOwnerState(state) {
    if (!state || state.assets.size || state.requests.size) return;
    if (state.removalOff) state.removalOff();
    ownerVisibilityMemo.delete(state.owner);
    owners.delete(state.owner);
  }

  function hasActiveRequestForEntry(entry) {
    return !!entry && activePendingKeySet().has(entry.key);
  }

  // Owner-membership index. Every owner-set mutation funnels through
  // retain/release/releaseOwner, so two indexes stay exact per-mutation:
  // (a) sectorId -> Map<entry, {total, nonPlayer}> — the boundary seams
  //     (prepareSectorExit, rotateSector) iterate O(assets in that sector)
  //     instead of a full O(assets x owners) census inline inside the emit;
  //     `nonPlayer` counts owners whose metadata.role is not 'player',
  //     preserving the player-role filter the seam scans apply.
  // (b) per-entry soft-class counters — isSoftOnlyEntry/isPackageCacheOnlyEntry
  //     turn O(1) consults instead of an O(owners) scan inside every census row.
  const sectorOwnerIndex = new Map();

  // One owner row can carry warm demand for several sectors — the shared session
  // owner serves every ownerless warm, so arm A (sector X) and arm B (sector Y)
  // both claim the same row. `metadata.sectorIds` is the union; `sectorId` stays
  // the first-claimed scalar for back-compat emit/diagnostic reads. Sector-scoped
  // consumers (index, corridor rank, ledger re-derive) read the union.
  function ownerSectorIds(metadata) {
    if (!metadata) return [];
    if (metadata.sectorIds instanceof Set) return [...metadata.sectorIds];
    return metadata.sectorId != null ? [String(metadata.sectorId)] : [];
  }

  // Union a sector into an owner row's claim and index just that delta — the
  // soft/role counters are per-owner and must not double-count, so the sector
  // block alone runs here.
  function unionOwnerSector(entry, metadata, sectorId) {
    if (sectorId == null) return;
    const sid = String(sectorId);
    if (!(metadata.sectorIds instanceof Set)) {
      metadata.sectorIds = new Set(metadata.sectorId != null ? [String(metadata.sectorId)] : []);
    }
    if (metadata.sectorIds.has(sid)) return;
    metadata.sectorIds.add(sid);
    if (metadata.sectorId == null) metadata.sectorId = sid;
    entry.ownersVersion += 1;
    residencyMutationSeq += 1;
    let sectorMap = sectorOwnerIndex.get(sid);
    if (!sectorMap) {
      sectorMap = new Map();
      sectorOwnerIndex.set(sid, sectorMap);
    }
    let row = sectorMap.get(entry);
    if (!row) {
      row = { total: 0, nonPlayer: 0 };
      sectorMap.set(entry, row);
    }
    row.total += 1;
    entry.sectorOwnerRefs += 1;
    if (metadata.role !== 'player') row.nonPlayer += 1;
  }

  function noteOwnerMembershipIndexed(entry, metadata) {
    if (!metadata) return;
    const role = String(metadata.role || '').trim().toLowerCase();
    // One increment per owner — a softLease flag stacked on a soft role still
    // counts once, or the all-soft equality check below would never hold.
    if (metadata.softLease === true
        || role === 'render-package-cache' || role === 'decode-cache' || role === 'runtime-cache') {
      entry.softOwnerCount += 1;
    }
    if (role === 'render-package-cache') entry.rpcOwnerCount += 1;
    entry.ownersVersion += 1;
    residencyMutationSeq += 1;
    for (const sid of ownerSectorIds(metadata)) {
      let sectorMap = sectorOwnerIndex.get(sid);
      if (!sectorMap) {
        sectorMap = new Map();
        sectorOwnerIndex.set(sid, sectorMap);
      }
      let row = sectorMap.get(entry);
      if (!row) {
        row = { total: 0, nonPlayer: 0 };
        sectorMap.set(entry, row);
      }
      row.total += 1;
      entry.sectorOwnerRefs += 1;
      if (metadata.role !== 'player') row.nonPlayer += 1;
    }
    rekeySoftBudgetClass(entry);
    rekeyGovernorBlocked(entry);
  }
  function noteOwnerMembershipUnindexed(entry, metadata) {
    if (!metadata) return;
    const role = String(metadata.role || '').trim().toLowerCase();
    if (metadata.softLease === true
        || role === 'render-package-cache' || role === 'decode-cache' || role === 'runtime-cache') {
      entry.softOwnerCount -= 1;
    }
    if (role === 'render-package-cache') entry.rpcOwnerCount -= 1;
    entry.ownersVersion += 1;
    residencyMutationSeq += 1;
    for (const sid of ownerSectorIds(metadata)) {
      const sectorMap = sectorOwnerIndex.get(sid);
      if (sectorMap) {
        const row = sectorMap.get(entry);
        if (row) {
          row.total -= 1;
          entry.sectorOwnerRefs -= 1;
          if (metadata.role !== 'player') row.nonPlayer -= 1;
          if (row.total <= 0) {
            sectorMap.delete(entry);
            if (sectorMap.size === 0) sectorOwnerIndex.delete(sid);
          }
        }
      }
    }
    rekeySoftBudgetClass(entry);
    rekeyGovernorBlocked(entry);
  }

  // Cache-lease roles: owners that exist only to keep a decoded blueprint/package reusable while
  // no live boundary needs it. `render-package-cache` covers decoded packages; `decode-cache` is
  // the same lease for source-route GLB blueprints (assetLoader's decodeCacheOwner).
  function isRenderPackageCacheOwner(metadata) {
    const role = String(metadata && metadata.role || '').trim().toLowerCase();
    return role === 'render-package-cache' || role === 'decode-cache';
  }

  // `runtime-cache` is the session fallback owner for decodes with no boundary scope (stage props,
  // previews, preloads). It is still a soft lease: it stays out of the idle pass so a disposed
  // stage keeps its decode warm across an undock-to-redock gap, but under byte pressure its
  // oldest-idle entries release like any cache owner — the loader re-decodes on next touch.
  function isSoftResidencyOwner(metadata) {
    if (metadata && metadata.softLease === true) return true;
    return isRenderPackageCacheOwner(metadata)
      || String(metadata && metadata.role || '').trim().toLowerCase() === 'runtime-cache';
  }

  // Strict package-cache-only: every owner is the loader's decoded-package cache lease. This is
  // exactly the residual the traversal budget measures; decode-cache/runtime-cache mixes are the
  // second soft tier below.
  function isPackageCacheOnlyEntry(entry) {
    if (!entry || entry.state !== 'resident' || entry.owners.size === 0) return false;
    return entry.rpcOwnerCount === entry.owners.size;
  }

  // Warm-purpose decode leases speculate on a spawn that has not arrived yet — they read as
  // oldest-idle in the LRU sort and get reclaimed first, which is the pop they exist to prevent.
  // They still count against the byte cap; they just lose it last.
  function hasWarmDecodeLease(entry) {
    for (const metadata of entry.owners.values()) {
      if (metadata && metadata.decodeWarm === true) return true;
    }
    return false;
  }

  // A served lease marks a body a live boundary actually admitted — observed demand. Its
  // cache-only residue earns the same idle-sweep immunity as warm speculation, and under byte
  // pressure it outranks warm: a body that was drawn once is the stronger return-visit signal.
  function hasServedDecodeLease(entry) {
    for (const metadata of entry.owners.values()) {
      if (metadata && metadata.decodeServed === true) return true;
    }
    return false;
  }

  function softEvictionLeaseWeight(entry) {
    if (hasServedDecodeLease(entry)) return 2;
    if (hasWarmDecodeLease(entry)) return 1;
    return 0;
  }

  function setEvictionCorridor(sectorIds) {
    const ids = Array.isArray(sectorIds) ? sectorIds : [];
    let key = '';
    const ranks = new Map();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id == null || id === '') continue;
      const sid = String(id);
      if (ranks.has(sid)) continue;
      key += (key ? '|' : '') + sid;
      ranks.set(sid, ids.length - i);
    }
    if (key === evictionCorridorKey) return false;
    evictionCorridorKey = key;
    evictionCorridorRanks = ranks.size ? ranks : null;
    return true;
  }

  // Best corridor rank across an entry's owners; -1 = outside the corridor (evicts
  // first within its lease-weight class), 0 = no corridor armed (identical to the
  // pre-corridor ordering).
  function entryCorridorRank(entry) {
    if (!evictionCorridorRanks) return 0;
    let best = -1;
    for (const metadata of entry.owners.values()) {
      for (const sectorId of ownerSectorIds(metadata)) {
        const rank = evictionCorridorRanks.get(String(sectorId));
        if (rank != null && rank > best) best = rank;
      }
    }
    return best;
  }

  function sortSoftEvictionCandidates(candidates) {
    candidates.sort((a, b) => (
      softEvictionLeaseWeight(a) - softEvictionLeaseWeight(b)
        || entryCorridorRank(a) - entryCorridorRank(b)
        // Within the warm lease class (weight 1) release recency anti-correlates
        // with demand — an interleaved approach wave's file keeps being the
        // newest release, so newest-first evicts the one file being re-decoded
        // while the genuinely stale cohort never drains. Demand recency is the
        // honest order: oldest last-claimed evicts first; every other class keeps
        // the oldest-idle LRU.
        || (softEvictionLeaseWeight(a) === 1
          ? a.lastWarmClaimAtMs - b.lastWarmClaimAtMs
          : a.lastReleaseAtMs - b.lastReleaseAtMs)
    ));
  }

  // Fully soft: every owner is a cache-lease role (package cache, decode cache, or the scopeless
  // runtime-cache session pin). A live presentation owner of any kind disqualifies the entry.
  function isSoftOnlyEntry(entry) {
    if (!entry || entry.state !== 'resident' || entry.owners.size === 0) return false;
    return entry.softOwnerCount === entry.owners.size;
  }

  // The enforce loop's row predicate as a class id. The byte contribution is
  // stamped once per classing and stays exact: an entry's memory units attach
  // at register (before it can hold owners) and never change while it lives.
  function classifySoftBudgetEntry(entry) {
    if (!entry || entry.state !== 'resident' || entry.owners.size === 0
        || hasActiveRequestForEntry(entry)) return 0;
    if (isPackageCacheOnlyEntry(entry)) return 1;
    if (isSoftOnlyEntry(entry)) return 2;
    return 0;
  }
  function rekeySoftBudgetClass(entry) {
    const prev = entry.softBudgetClass || 0;
    const next = classifySoftBudgetEntry(entry);
    if (next === prev) return;
    if (prev === 1) {
      packageCacheOnlyMembers.delete(entry);
      packageCacheOnlyBytesTotal -= entry.softBudgetBytes;
    } else if (prev === 2) {
      softResidentMembers.delete(entry);
      softResidentBytesTotal -= entry.softBudgetBytes;
    }
    entry.softBudgetClass = next;
    if (next === 0) {
      entry.softBudgetBytes = 0;
      return;
    }
    entry.softBudgetBytes = assetResidentBytes(entry);
    if (next === 1) {
      packageCacheOnlyMembers.add(entry);
      packageCacheOnlyBytesTotal += entry.softBudgetBytes;
    } else {
      softResidentMembers.add(entry);
      softResidentBytesTotal += entry.softBudgetBytes;
    }
  }

  // Demand flag for the amortized release() path — set when the byte census is
  // deferred to the paced service's stepped enforcement; cleared when it runs.
  let softBudgetPending = false;
  // Running byte totals and member sets for the two soft-budget tiers —
  // maintained per-mutation by rekeySoftBudgetClass; the periodic
  // ledger-verify walk re-derives them as drift insurance.
  let packageCacheOnlyBytesTotal = 0;
  let softResidentBytesTotal = 0;
  const packageCacheOnlyMembers = new Set();
  const softResidentMembers = new Set();
  const SOFT_BUDGET_INLINE_MAX = 128;

  // Governor blocked-membership set — entries the enforce census would classify
  // non-evictable (any owner-policy block reason, or an active pending request).
  // The same funnel points that re-key the soft classes re-key membership here,
  // so enforceBudget projects the blocked rows in O(blocked) instead of walking
  // O(assets) — the common under-budget call short-circuits to O(1) when the set
  // is empty. Members are re-qualified at consult (a stale member filters out,
  // never trusted) and the ledger-verify cadence rebuilds the set wholesale as
  // drift insurance, same contract as the soft-class ledgers.
  const governorBlockedMembers = new Set();
  function rekeyGovernorBlocked(entry) {
    if (entry && assets.get(entry.key) === entry
        && (hasActiveRequestForEntry(entry) || !isGovernorEntryEvictable(entry))) {
      governorBlockedMembers.add(entry);
    } else {
      governorBlockedMembers.delete(entry);
    }
  }

  // Inline byte caps on soft residency, enforced at release and soft-retain time: the idle sweep
  // only reclaims entries older than its minAge gate, so a burst of departures or scopeless
  // decodes inside one sweep window would otherwise stack unbounded. Tier A caps strict
  // render-package-cache residency; tier B caps the remaining soft set (runtime-cache session
  // pins, decode-cache leftovers, cache-role mixes). Oldest-idle releases first so hot entries
  // stay warm under the cap; live presentation owners are never candidates.
  function enforceSoftResidencyBudgets() {
    if (packageCacheBudgetDepth > 0) return 0;
    // The class ledgers answer the overage consult in O(1); the candidate
    // arrays mint from the member sets only on a real overage, and the evict
    // loops re-qualify each row so a stale member is filtered, never trusted.
    const strictOver = packageCacheOnlyMaxBytes != null
      && packageCacheOnlyBytesTotal > packageCacheOnlyMaxBytes;
    const softOver = softResidentMaxBytes != null
      && softResidentBytesTotal > softResidentMaxBytes;
    if (!strictOver && !softOver) return 0;
    packageCacheBudgetDepth++;
    try {
      return (strictOver ? evictOldestSoftEntries([...packageCacheOnlyMembers],
          packageCacheOnlyMaxBytes, packageCacheOnlyBytesTotal, isPackageCacheOnlyEntry) : 0)
        + (softOver ? evictOldestSoftEntries([...softResidentMembers],
          softResidentMaxBytes, softResidentBytesTotal,
          (entry) => isSoftOnlyEntry(entry) && !isPackageCacheOnlyEntry(entry)) : 0);
    } finally {
      packageCacheBudgetDepth--;
    }
  }

  // Recompute-and-compare guard for the running ledgers: drift used to stay
  // silent because nothing ever re-derived the scalars from their backing
  // maps. The cheap totals recompute rides inside the enforce sweep's asset
  // walk (O(1) per row); the owner-graph ledgers (soft/rpc counts, sector
  // index) verify every LEDGER_VERIFY_EVERY_ENFORCES sweeps. Drift emits a
  // 'ledger-drift' event and counts into diagnostics().
  const LEDGER_VERIFY_EVERY_ENFORCES = 4;
  let ledgerVerifyCountdown = LEDGER_VERIFY_EVERY_ENFORCES;
  let ledgerDriftEvents = 0;
  function noteLedgerDrift(mismatches) {
    if (!mismatches || mismatches.length === 0) return;
    ledgerDriftEvents += 1;
    emit('ledger-drift', { count: mismatches.length, sample: mismatches.slice(0, 4) });
  }
  function ledgerDriftMismatches(re, includeOwnerGraph) {
    const mismatches = [];
    if (re.gpuResidentBytes !== gpuResidentBytesTotal) {
      mismatches.push({ ledger: 'gpuResidentBytes', expected: re.gpuResidentBytes, actual: gpuResidentBytesTotal });
    }
    if (re.cpuPackageBytes !== cpuPackageBytesTotal) {
      mismatches.push({ ledger: 'cpuPackageBytes', expected: re.cpuPackageBytes, actual: cpuPackageBytesTotal });
    }
    if (re.unaccountedResources !== unaccountedResourceCount) {
      mismatches.push({ ledger: 'unaccountedResources', expected: re.unaccountedResources, actual: unaccountedResourceCount });
    }
    for (const key of re.activePendingKeys) {
      if (!activePendingKeys.has(key)) mismatches.push({ ledger: 'activePendingKeys', expected: key, actual: 'absent' });
    }
    for (const key of activePendingKeys) {
      if (!re.activePendingKeys.has(key)) mismatches.push({ ledger: 'activePendingKeys', expected: 'absent', actual: key });
    }
    if (includeOwnerGraph) {
      for (const [entry, soft] of re.softOwnerCounts) {
        if (soft !== entry.softOwnerCount) {
          mismatches.push({ ledger: 'softOwnerCount', key: entry.key, expected: soft, actual: entry.softOwnerCount });
        }
        const rpc = re.rpcOwnerCounts.get(entry) || 0;
        if (rpc !== entry.rpcOwnerCount) {
          mismatches.push({ ledger: 'rpcOwnerCount', key: entry.key, expected: rpc, actual: entry.rpcOwnerCount });
        }
      }
      for (const [sid, sectorMap] of re.sectorIndex) {
        const liveMap = sectorOwnerIndex.get(sid);
        for (const [entry, row] of sectorMap) {
          const liveRow = liveMap && liveMap.get(entry);
          if (!liveRow || liveRow.total !== row.total || liveRow.nonPlayer !== row.nonPlayer) {
            mismatches.push({ ledger: 'sectorOwnerIndex', sectorId: sid, key: entry.key,
              expected: `${row.total}/${row.nonPlayer}`,
              actual: liveRow ? `${liveRow.total}/${liveRow.nonPlayer}` : 'absent' });
          }
        }
      }
      for (const [sid, liveMap] of sectorOwnerIndex) {
        const reMap = re.sectorIndex.get(sid);
        for (const entry of liveMap.keys()) {
          if (!reMap || !reMap.has(entry)) {
            mismatches.push({ ledger: 'sectorOwnerIndex', sectorId: sid, key: entry.key,
              expected: 'absent', actual: 'stale-row' });
          }
        }
      }
      // The soft-budget class ledgers are per-mutation state like the owner
      // counters — the verify walk re-derives them so a missed re-key (set or
      // byte total) surfaces as drift instead of silently under-evicting.
      if (re.packageCacheOnlyBytes != null && re.packageCacheOnlyBytes !== packageCacheOnlyBytesTotal) {
        mismatches.push({ ledger: 'packageCacheOnlyBytes', expected: re.packageCacheOnlyBytes,
          actual: packageCacheOnlyBytesTotal });
      }
      if (re.softResidentBytes != null && re.softResidentBytes !== softResidentBytesTotal) {
        mismatches.push({ ledger: 'softResidentBytes', expected: re.softResidentBytes,
          actual: softResidentBytesTotal });
      }
      if (re.strictMembers != null && re.strictMembers !== packageCacheOnlyMembers.size) {
        mismatches.push({ ledger: 'packageCacheOnlyMembers', expected: re.strictMembers,
          actual: packageCacheOnlyMembers.size });
      }
      if (re.softMembers != null && re.softMembers !== softResidentMembers.size) {
        mismatches.push({ ledger: 'softResidentMembers', expected: re.softMembers,
          actual: softResidentMembers.size });
      }
    }
    return mismatches;
  }
  // Probe-facing twin: a full recompute-and-compare on demand. Tests and
  // diagnostics assert ledger health without paying the owner-graph walk
  // inside hot paths.
  function verifyLedgerConsistency() {
    let gpuResidentBytes = 0;
    for (const memory of memoryUnits.values()) gpuResidentBytes += memory.bytes;
    let cpuPackageBytes = 0;
    const softOwnerCounts = new Map();
    const rpcOwnerCounts = new Map();
    const sectorIndex = new Map();
    let packageCacheOnlyRe = 0;
    let softResidentRe = 0;
    let strictReCount = 0;
    let softReCount = 0;
    for (const entry of assets.values()) {
      cpuPackageBytes += entry.cpuPackageBytes;
      let soft = 0;
      let rpc = 0;
      for (const metadata of entry.owners.values()) {
        const role = String(metadata.role || '').trim().toLowerCase();
        if (metadata.softLease === true
            || role === 'render-package-cache' || role === 'decode-cache' || role === 'runtime-cache') {
          soft += 1;
        }
        if (role === 'render-package-cache') rpc += 1;
        for (const sid of ownerSectorIds(metadata)) {
          let sectorMap = sectorIndex.get(sid);
          if (!sectorMap) {
            sectorMap = new Map();
            sectorIndex.set(sid, sectorMap);
          }
          let row = sectorMap.get(entry);
          if (!row) {
            row = { total: 0, nonPlayer: 0 };
            sectorMap.set(entry, row);
          }
          row.total += 1;
          if (metadata.role !== 'player') row.nonPlayer += 1;
        }
      }
      softOwnerCounts.set(entry, soft);
      rpcOwnerCounts.set(entry, rpc);
      if (entry.state === 'resident' && entry.owners.size > 0 && !hasActiveRequestForEntry(entry)) {
        if (isPackageCacheOnlyEntry(entry)) {
          packageCacheOnlyRe += assetResidentBytes(entry);
          strictReCount += 1;
        } else if (isSoftOnlyEntry(entry)) {
          softResidentRe += assetResidentBytes(entry);
          softReCount += 1;
        }
      }
    }
    let unaccountedResources = 0;
    for (const resourceEntry of resources.values()) {
      if (resourceEntry.unaccounted) unaccountedResources += 1;
    }
    const activeKeys = new Set();
    for (const request of pendingRequests) {
      if (request && request.active && request.key != null) activeKeys.add(request.key);
    }
    const mismatches = ledgerDriftMismatches({
      gpuResidentBytes, cpuPackageBytes, unaccountedResources,
      softOwnerCounts, rpcOwnerCounts, sectorIndex, activePendingKeys: activeKeys,
      packageCacheOnlyBytes: packageCacheOnlyRe, softResidentBytes: softResidentRe,
      strictMembers: strictReCount, softMembers: softReCount,
    }, true);
    let blockedReCount = 0;
    for (const entry of assets.values()) {
      if (hasActiveRequestForEntry(entry) || !isGovernorEntryEvictable(entry)) blockedReCount += 1;
    }
    if (blockedReCount !== governorBlockedMembers.size) {
      mismatches.push({ ledger: 'governorBlockedMembers',
        expected: blockedReCount, actual: governorBlockedMembers.size });
    }
    return Object.freeze({ ok: mismatches.length === 0, mismatches: Object.freeze(mismatches) });
  }

  // Stepped twin: the O(assets) tally yields per entry batch so the release
  // leg's caller clock bounds it like the walk that produced the releases.
  // The eviction leg yields on the same cadence inside the depth guard — it
  // only runs on a real overage.
  function* enforceSoftResidencyBudgetsSteps(batchEntries = 256) {
    if (packageCacheBudgetDepth > 0) return 0;
    const verifyOwnerGraph = --ledgerVerifyCountdown <= 0;
    if (verifyOwnerGraph) ledgerVerifyCountdown = LEDGER_VERIFY_EVERY_ENFORCES;
    // O(1) consult: when neither ledger is over budget and the verify cadence
    // isn't due, the enforce is a no-op without touching the asset table.
    const strictOverLedger = packageCacheOnlyMaxBytes != null
      && packageCacheOnlyBytesTotal > packageCacheOnlyMaxBytes;
    const softOverLedger = softResidentMaxBytes != null
      && softResidentBytesTotal > softResidentMaxBytes;
    if (!strictOverLedger && !softOverLedger && !verifyOwnerGraph) return 0;
    let strictBytes = packageCacheOnlyBytesTotal;
    let softBytes = softResidentBytesTotal;
    const strictCandidates = [...packageCacheOnlyMembers];
    const softCandidates = [...softResidentMembers];
    if (verifyOwnerGraph) {
      // Verify cadence: the O(assets) walk survives here, re-deriving every
      // ledger — including the new class bytes and member counts — and the
      // freshly recomputed candidate lists supplant the member sets this call.
      strictCandidates.length = 0;
      softCandidates.length = 0;
      strictBytes = 0;
      softBytes = 0;
      let visited = 0;
      let cpuPackageRe = 0;
      const softOwnerRe = new Map();
      const rpcOwnerRe = new Map();
      const sectorIndexRe = new Map();
      const blockedRe = new Set();
      for (const entry of assets.values()) {
        if (++visited % batchEntries === 0) yield;
        cpuPackageRe += entry.cpuPackageBytes;
        let soft = 0;
        let rpc = 0;
        for (const metadata of entry.owners.values()) {
          const role = String(metadata.role || '').trim().toLowerCase();
          if (metadata.softLease === true
              || role === 'render-package-cache' || role === 'decode-cache' || role === 'runtime-cache') {
            soft += 1;
          }
          if (role === 'render-package-cache') rpc += 1;
          for (const sid of ownerSectorIds(metadata)) {
            let sectorMap = sectorIndexRe.get(sid);
            if (!sectorMap) {
              sectorMap = new Map();
              sectorIndexRe.set(sid, sectorMap);
            }
            let row = sectorMap.get(entry);
            if (!row) {
              row = { total: 0, nonPlayer: 0 };
              sectorMap.set(entry, row);
            }
            row.total += 1;
            if (metadata.role !== 'player') row.nonPlayer += 1;
          }
        }
        softOwnerRe.set(entry, soft);
        rpcOwnerRe.set(entry, rpc);
        if (hasActiveRequestForEntry(entry) || !isGovernorEntryEvictable(entry)) blockedRe.add(entry);
        if (entry.state !== 'resident' || entry.owners.size === 0 || hasActiveRequestForEntry(entry)) {
          continue;
        }
        if (isPackageCacheOnlyEntry(entry)) {
          strictBytes += assetResidentBytes(entry);
          strictCandidates.push(entry);
        } else if (isSoftOnlyEntry(entry)) {
          softBytes += assetResidentBytes(entry);
          softCandidates.push(entry);
        }
      }
      let gpuResidentRe = 0;
      for (const memory of memoryUnits.values()) gpuResidentRe += memory.bytes;
      let unaccountedRe = 0;
      for (const resourceEntry of resources.values()) {
        if (resourceEntry.unaccounted) unaccountedRe += 1;
      }
      const activeKeysRe = new Set();
      for (const request of pendingRequests) {
        if (request && request.active && request.key != null) activeKeysRe.add(request.key);
      }
      noteLedgerDrift(ledgerDriftMismatches({
        gpuResidentBytes: gpuResidentRe, cpuPackageBytes: cpuPackageRe,
        unaccountedResources: unaccountedRe, softOwnerCounts: softOwnerRe,
        rpcOwnerCounts: rpcOwnerRe, sectorIndex: sectorIndexRe, activePendingKeys: activeKeysRe,
        packageCacheOnlyBytes: strictBytes, softResidentBytes: softBytes,
        strictMembers: strictCandidates.length, softMembers: softCandidates.length,
      }, true));
      // The governor blocked set rebuilds wholesale on the same cadence: a missed
      // re-key surfaces as drift and the recomputed membership supplants the
      // maintained one — same contract the soft candidate lists get above.
      if (blockedRe.size !== governorBlockedMembers.size
          || [...blockedRe].some((member) => !governorBlockedMembers.has(member))
          || [...governorBlockedMembers].some((member) => !blockedRe.has(member))) {
        noteLedgerDrift([{ ledger: 'governorBlockedMembers',
          expected: blockedRe.size, actual: governorBlockedMembers.size }]);
      }
      governorBlockedMembers.clear();
      for (const member of blockedRe) governorBlockedMembers.add(member);
    }
    const strictOver = strictOverLedger || (verifyOwnerGraph
      && packageCacheOnlyMaxBytes != null && strictBytes > packageCacheOnlyMaxBytes);
    const softOver = softOverLedger || (verifyOwnerGraph
      && softResidentMaxBytes != null && softBytes > softResidentMaxBytes);
    if (!strictOver && !softOver) return 0;
    packageCacheBudgetDepth++;
    try {
      const strictEvicted = strictOver ? yield* evictOldestSoftEntriesSteps(strictCandidates,
        packageCacheOnlyMaxBytes, strictBytes, isPackageCacheOnlyEntry) : 0;
      const softEvicted = softOver ? yield* evictOldestSoftEntriesSteps(softCandidates,
        softResidentMaxBytes, softBytes,
        (entry) => isSoftOnlyEntry(entry) && !isPackageCacheOnlyEntry(entry)) : 0;
      return strictEvicted + softEvicted;
    } finally {
      packageCacheBudgetDepth--;
    }
  }

  // Staleness is virtual: a row's off-glass count is row.offGlass plus the
  // presents elapsed since its last note, materialized on consult instead of
  // by a per-present full-table advance. Boundary matches the old eager
  // sweep: a row noted at present P stays held through P+8's tail and drops
  // at P+9's advance, so consult answers are unchanged; only row lifetime in
  // the table defers to the amortized GC below.
  function visibilityRowOffGlass(row) {
    const elapsed = visibilityPresent - row.present - 1
      + (visibilityAdvancedThisPresent ? 1 : 0);
    return row.offGlass + Math.max(0, elapsed);
  }

  function visibilityHeld(entry) {
    const row = entry && visibilityHolds.get(entry.key);
    return !!(row && row.held && visibilityRowOffGlass(row) < VISIBILITY_OFF_GLASS_PRESENTS);
  }

  function visibilityKeysForOwners(ownerList) {
    const keys = [];
    const seen = new Set();
    const list = ownerList || [];
    for (let i = 0; i < list.length; i++) {
      const state = owners.get(list[i]);
      if (!state || state.released) continue;
      for (const entry of state.assets) {
        if (!entry || seen.has(entry.key)) continue;
        seen.add(entry.key);
        keys.push(entry.key);
      }
    }
    return keys;
  }

  function entryHasPinnedRole(entry) {
    if (!entry) return false;
    for (const metadata of entry.owners.values()) {
      const role = String(metadata && metadata.role || '').trim().toLowerCase();
      if (GOVERNOR_PINNED_ROLES.has(role)) return true;
    }
    return false;
  }

  function beginVisibilityPresent() {
    visibilityPresent += 1;
    visibilityAdvancedThisPresent = false;
    return visibilityPresent;
  }

  // On-glass pins immediately. Off-glass holds for 8 presents, then the pin drops.
  // The key is the asset registry key the glass owner already retains
  // (`render-package:<hash>` or `url::slot`), never an entity id.
  function noteVisibility(key, visible) {
    if (key == null) return false;
    const id = String(key);
    let row = visibilityHolds.get(id);
    if (!row) {
      row = { held: false, offGlass: 0, present: -1 };
      visibilityHolds.set(id, row);
      visibilityWriteSeq += 1;
    }
    const seenThisPresent = row.present === visibilityPresent;
    if (visible) {
      if (!seenThisPresent || !row.held || row.offGlass !== 0) visibilityWriteSeq += 1;
      row.present = visibilityPresent;
      row.held = true;
      row.offGlass = 0;
    } else if (!seenThisPresent && row.held) {
      // Count every un-noted present elapsed since the last note, including
      // this one — the old eager sweep added one per present; folding the
      // whole gap here keeps the count identical without the sweep.
      row.offGlass += Math.max(1,
        visibilityPresent - row.present + (visibilityAdvancedThisPresent ? 1 : 0));
      row.present = visibilityPresent;
      visibilityWriteSeq += 1;
      if (row.offGlass >= VISIBILITY_OFF_GLASS_PRESENTS) row.held = false;
    }
    return row.held;
  }

  // Pin every asset key this glass owner already retains. Eviction looks up
  // entry.key, so the pin has to be that same key.
  // The visible-row consult runs twice per presented frame per entity with
  // frame-stable inputs — memo the verdict on (present, visible, assets
  // version, holds write seq) so the second consult skips the O(owner's
  // whole retained set) walk. Any semantic mutation to the owner's set or
  // the shared holds table bumps its version and re-proves the next consult.
  function noteOwnerVisibility(owner, visible) {
    if (owner == null) return false;
    const state = owners.get(owner);
    if (!state || state.released || state.assets.size === 0) return false;
    const memo = ownerVisibilityMemo.get(owner);
    if (memo
      && memo.present === visibilityPresent
      && memo.visible === visible
      && memo.assetsVersion === state.assetsVersion
      && memo.writeSeq === visibilityWriteSeq) {
      return memo.held;
    }
    let held = false;
    for (const entry of state.assets) {
      if (noteVisibility(entry.key, visible)) held = true;
    }
    ownerVisibilityMemo.set(owner, {
      present: visibilityPresent,
      visible,
      assetsVersion: state.assetsVersion,
      writeSeq: visibilityWriteSeq,
      held,
    });
    return held;
  }

  // Pure GC now: consults expire rows lazily via visibilityRowOffGlass, so
  // this pass only frees dead rows. It sweeps a bounded share per present —
  // enough to complete a full pass of the table within the 8-present expiry
  // horizon — instead of iterating every row every presented frame.
  let visibilityGcIter = null;
  function advanceVisibilityHysteresis() {
    visibilityAdvancedThisPresent = true;
    // Rows cross the expiry boundary when this present's virtual increment
    // lands — re-prove any memoized owner verdicts against it.
    visibilityWriteSeq += 1;
    if (visibilityHolds.size === 0) {
      visibilityGcIter = null;
      return;
    }
    const target = Math.max(256, Math.ceil(visibilityHolds.size / VISIBILITY_OFF_GLASS_PRESENTS));
    if (!visibilityGcIter) visibilityGcIter = visibilityHolds.entries();
    for (let swept = 0; swept < target; swept++) {
      const next = visibilityGcIter.next();
      if (next.done) {
        visibilityGcIter = null;
        break;
      }
      const [key, row] = next.value;
      if (!row.held || visibilityRowOffGlass(row) >= VISIBILITY_OFF_GLASS_PRESENTS) {
        visibilityHolds.delete(key);
      }
    }
  }

  function evictOldestSoftEntries(candidates, maxBytes, totalBytes, matches) {
    const ceiling = residencyEvictionCeiling(maxBytes);
    sortSoftEvictionCandidates(candidates);
    let evicted = 0;
    for (const entry of candidates) {
      if (totalBytes <= ceiling) break;
      if (!assets.has(entry.key) || !matches(entry) || hasActiveRequestForEntry(entry)) continue;
      if (visibilityHeld(entry) || entryHasPinnedRole(entry)) continue;
      const entryBytes = assetResidentBytes(entry);
      for (const owner of [...entry.owners.keys()]) {
        // This release's byte demand is already inside the enforce that owns this
        // loop — suppressing only the arm (never the inline path, already
        // depth-guarded) stops every evicted row booking a redundant next-drain
        // census. The suppress lives only inside the release() call: a foreign
        // retain/release landing mid-park of the Steps twin still arms normally.
        softBudgetArmSuppressed++;
        try { release(entry.key, owner, 'soft-residency-budget'); }
        finally { softBudgetArmSuppressed--; }
      }
      if (!assets.has(entry.key)) {
        evicted++;
        totalBytes -= entryBytes;
      }
    }
    return evicted;
  }

  // Stepped twin: same eviction order and verdicts — the sort stays atomic (it
  // defines that order); the release/dispose tail yields per visited batch so a
  // genuine overage stops paying every eviction inside one step.
  function* evictOldestSoftEntriesSteps(candidates, maxBytes, totalBytes, matches, batchEntries = 64) {
    const ceiling = residencyEvictionCeiling(maxBytes);
    sortSoftEvictionCandidates(candidates);
    let evicted = 0;
    let visited = 0;
    for (const entry of candidates) {
      if (++visited % batchEntries === 0) yield;
      if (totalBytes <= ceiling) break;
      if (!assets.has(entry.key) || !matches(entry) || hasActiveRequestForEntry(entry)) continue;
      if (visibilityHeld(entry) || entryHasPinnedRole(entry)) continue;
      const entryBytes = assetResidentBytes(entry);
      for (const owner of [...entry.owners.keys()]) {
        softBudgetArmSuppressed++;
        try { release(entry.key, owner, 'soft-residency-budget'); }
        finally { softBudgetArmSuppressed--; }
      }
      if (!assets.has(entry.key)) {
        evicted++;
        totalBytes -= entryBytes;
      }
    }
    return evicted;
  }

  /**
   * Release decoded cache owners (render packages and source-route blueprint leases) that no
   * longer have a presentation owner.
   *
   * The package loader keeps one cache owner so content-addressed packages can be reused while a
   * live boundary, warm sector, or preview retains them. That owner is intentionally not part of
   * the ordinary byte-pressure eviction policy: an entry with both a cache owner and a presentation
   * owner is a mixed lifetime and must stay pinned. Once the cache owner is the *only* owner, however,
   * retaining it makes every traversed package permanent even when the total heap is below the global
   * governor budget. This explicit boundary cleanup is the release point for that soft cache lease.
   *
   * `options.minAgeMs` gates in-sector callers: an entry keeps its cache lease until it has been
   * idle at least that long (idle = since registration or its last owner release), so a boundary
   * that pops back inside the residency radius still reuses the warm decode while a package whose
   * content departed for good is reclaimed instead of accumulating for the whole sector.
   *
   * `options.maxCacheOnlyBytes` bounds the soft-held working set: a busy station re-retains hull
   * packages faster than the idle gate can age them out, so without a byte cap every archetype the
   * traffic director ever spawned stays resident for the sector's whole session. When the
   * soft-held total exceeds the budget, the oldest-idle soft-held entries release regardless of
   * idle age — LRU by lastReleaseAtMs keeps hot hulls warm while the cold tail is reclaimed.
   * `runtime-cache` counts as soft for this pass only; mixed live-boundary entries are never
   * candidates.
   */
  function releaseUnreferencedCacheOwners(reason = 'cache-only-residency-cleanup', options = {}) {
    cacheSweepCount++;
    diagnosticsEpoch++;
    packageCacheBudgetDepth++;
    let result;
    try {
      result = releaseUnreferencedCacheOwnersPass(reason, options);
    } finally {
      packageCacheBudgetDepth--;
    }
    // The pass's own release() calls arm the deferred soft-budget flag on big worlds;
    // it used to sit armed until the next 1s prune sweep while the cache lanes that
    // did the releasing never drained it. Depth is already unwound here so the
    // enforce consult actually runs.
    if (softBudgetPending) {
      softBudgetPending = false;
      enforceSoftResidencyBudgets();
    }
    return result;
  }

  // Stepped twin: identical walk, release order, and result shape — the sweep
  // yields per asset batch and inside the budget-evict leg so the 10 s
  // in-sector decay stops paying the whole pass inside one presented frame.
  function* releaseUnreferencedCacheOwnersSteps(reason = 'cache-only-residency-cleanup', options = {}) {
    cacheSweepCount++;
    diagnosticsEpoch++;
    packageCacheBudgetDepth++;
    let result;
    try {
      result = yield* releaseUnreferencedCacheOwnersPassSteps(reason, options);
    } finally {
      packageCacheBudgetDepth--;
    }
    // Same drain as the sync twin: the pass's releases arm softBudgetPending on big
    // worlds; drain it here (paced) so enforcement doesn't wait on the prune sweep.
    if (softBudgetPending) {
      softBudgetPending = false;
      yield* enforceSoftResidencyBudgetsSteps();
    }
    return result;
  }

  function releaseUnreferencedCacheOwnersPass(reason, options) {
    const iterator = releaseUnreferencedCacheOwnersPassSteps(reason, options);
    let step = iterator.next();
    while (!step.done) step = iterator.next();
    return step.value;
  }

  function* releaseUnreferencedCacheOwnersPassSteps(reason, options) {
    const minAgeMs = Number.isFinite(Number(options.minAgeMs)) ? Math.max(0, Number(options.minAgeMs)) : 0;
    const maxCacheOnlyBytes = Number.isFinite(Number(options.maxCacheOnlyBytes))
      ? Math.max(0, Number(options.maxCacheOnlyBytes))
      : null;
    const nowMs = now();
    // Only the GPU byte totals are needed. Building two full diagnostics() tables here (a frozen,
    // sorted row per asset with owner-role sets) was a 445 ms freeze on every jump's sector exit
    // (2026-09-13 profile); the totals are the same sum over memory units diagnostics() reports.
    const bytesBefore = totalGpuResidentBytes();
    const evicted = [];
    let releasedOwners = 0;
    const budgetCandidates = [];

    let visited = 0;
    // The qualifying population is exactly the two class member sets (an entry reaches this
    // pass only as a strict package-cache or soft-only resident) — iterate them directly
    // instead of spreading the whole asset table; per-member re-qualify below handles drift.
    for (const entry of iterTwoSets(packageCacheOnlyMembers, softResidentMembers)) {
      if (++visited % 256 === 0) yield;
      if (assets.get(entry.key) !== entry
          || entry.state !== 'resident' || hasActiveRequestForEntry(entry)) continue;
      // The owner-class counters answer both classifications in O(1) — every owner a
      // package-cache owner ⇔ rpcOwnerCount === owners.size; the soft-only budget
      // candidate check is the same fold — so the two per-asset array mints are gone.
      if (!isPackageCacheOnlyEntry(entry)) {
        if (maxCacheOnlyBytes != null && isSoftOnlyEntry(entry)) {
          budgetCandidates.push(entry);
        }
        continue;
      }
      if (minAgeMs > 0 && nowMs - entry.lastReleaseAtMs < minAgeMs) {
        if (maxCacheOnlyBytes != null) budgetCandidates.push(entry);
        continue;
      }
      // A warm-decode lease still claims this entry for an inbound approach: sweeping it at the
      // idle bound makes the residency poll re-decode the same file every ~30s. A served lease
      // is the same claim with observed demand behind it — the return visit re-decodes inside
      // the admission lane and the body pops late. Both stay byte-capped by the
      // maxCacheOnlyBytes budget path below, so nothing grows unbound.
      if (hasWarmDecodeLease(entry) || hasServedDecodeLease(entry)) {
        if (maxCacheOnlyBytes != null) budgetCandidates.push(entry);
        continue;
      }

      for (const owner of [...entry.owners.keys()]) {
        if (release(entry.key, owner, reason)) releasedOwners++;
      }
      if (!assets.has(entry.key)) evicted.push(entry.key);
    }

    if (maxCacheOnlyBytes != null && budgetCandidates.length > 0) {
      let softBytes = 0;
      for (const entry of budgetCandidates) softBytes += assetResidentBytes(entry);
      if (softBytes > maxCacheOnlyBytes) {
        sortSoftEvictionCandidates(budgetCandidates);
        let evictVisited = 0;
        for (const entry of budgetCandidates) {
          if (++evictVisited % 64 === 0) yield;
          if (softBytes <= maxCacheOnlyBytes) break;
          if (entry.state !== 'resident' || !assets.has(entry.key)) continue;
          if (!isSoftOnlyEntry(entry)) continue;
          if (visibilityHeld(entry) || entryHasPinnedRole(entry)) continue;
          const entryBytes = assetResidentBytes(entry);
          for (const owner of [...entry.owners.keys()]) {
            if (release(entry.key, owner, reason)) releasedOwners++;
          }
          if (!assets.has(entry.key)) {
            evicted.push(entry.key);
            softBytes -= entryBytes;
          }
        }
      }
    }

    const bytesAfter = totalGpuResidentBytes();
    return Object.freeze({
      reason,
      evicted: Object.freeze(evicted),
      releasedOwners,
      evictedBytes: Math.max(0, bytesBefore - bytesAfter),
      remainingBytes: bytesAfter,
    });
  }

  /** The gpuResidentBytes total diagnostics() reports, without building its per-asset rows. */
  function totalGpuResidentBytes() {
    return gpuResidentBytesTotal;
  }

  // The budget governor only consumes three scalar totals — building two full
  // diagnostics() tables inside enforceBudget minted ~2xN frozen rows plus
  // their owner-metadata sets and sort exactly at the boundary crossing.
  function budgetTotals() {
    return {
      cpuPackageBytes: cpuPackageBytesTotal,
      gpuResidentBytes: totalGpuResidentBytes(),
      unaccountedResources: unaccountedResourceCount,
    };
  }

  function evictIfUnowned(entry, reason) {
    if (!entry || entry.state !== 'resident' || entry.owners.size > 0) return false;
    if (activePendingKeySet().has(entry.key)) return false;
    entry.state = 'evicted';
    rekeySoftBudgetClass(entry);
    assets.delete(entry.key);
    residencyMutationSeq += 1;
    governorBlockedMembers.delete(entry);
    cpuPackageBytesTotal -= entry.cpuPackageBytes;
    noteWarmCoverageEntryMutation(entry);
    evictedAssets++;
    const evictionAt = now();
    const ageMs = Math.max(0, evictionAt - entry.lastReleaseAtMs);
    if (entry.onEvict) {
      try { entry.onEvict(entry.handle, reason); } catch (_) {}
    }
    for (const resourceEntry of entry.resources) {
      resourceEntry.assets.delete(entry);
      if (resourceEntry.assets.size === 0) finalizeResource(resourceEntry, reason);
    }
    emit('asset-evicted', {
      key: entry.key,
      generation: entry.generation,
      reason,
      ageMs,
      resourceCount: entry.resources.size,
    });
    return true;
  }

  function finalizeResource(entry, reason) {
    if (!entry || entry.state !== 'resident') return;
    entry.state = contextLost ? 'abandoned' : 'disposed';
    resources.delete(entry.resource);
    if (entry.unaccounted) unaccountedResourceCount -= 1;
    for (const memory of entry.memoryUnits || []) {
      memory.resources.delete(entry);
      if (memory.resources.size === 0) {
        memoryUnits.delete(memory.identity);
        gpuResidentBytesTotal -= memory.bytes;
      }
    }
    const protectedState = entry.resource && entry.resource[PROTECTED_RESOURCE];
    if (contextLost) {
      abandonedResources++;
      if (protectedState) {
        protectedState.abandoned = true;
        protectedState.finalized = true;
      }
      emit('resource-abandoned', { reason, bytes: entry.bytes });
      return;
    }
    if (protectedState && !protectedState.finalized) {
      protectedState.finalized = true;
      const original = protectedState.originalDispose;
      if (original) {
        entry.resource.dispose = original;
        try { original.call(entry.resource); } catch (_) {}
        // The original disposer has run at the exact zero-ref boundary. Keep subsequent graph
        // teardown idempotent so a parent traversal cannot dispatch the same Three.js dispose twice.
        entry.resource.dispose = protectedDispose;
      }
    } else if (!protectedState && entry.resource && typeof entry.resource.dispose === 'function') {
      try { entry.resource.dispose(); } catch (_) {}
    }
    disposedResources++;
    emit('resource-disposed', { reason, bytes: entry.bytes });
  }

  function rotateSector(nextSectorId) {
    const exactNext = nextSectorId == null ? null : String(nextSectorId);
    const effectiveCurrent = effectiveCurrentSectorId();
    if (exactNext === effectiveCurrent) return false;
    // A synchronous rotate applies immediately: consume the pending target and out-seq
    // any queued deferred mints so their end-of-drain repoint cannot regress the pointer.
    const seq = ++latestRotateSeq;
    if (warmOwner && warmSectorId === effectiveCurrent) {
      currentSectorId = exactNext;
      appliedRotateSeq = seq;
      pendingSectorTarget = exactNext;
      hasPendingRotate = true;
      emit('sector-rotated', { currentSectorId, warmSectorId });
      return true;
    }
    if (warmOwner) releaseOwner(warmOwner, 'warm-sector-expired');
    warmOwner = null;
    warmSectorId = null;
    const previousSectorId = effectiveCurrent;
    if (previousSectorId != null) {
      const owner = Object.freeze({ type: 'asset-warm-sector', sectorId: previousSectorId, generation: assetGeneration });
      let retained = 0;
      const previousSectorMap = sectorOwnerIndex.get(previousSectorId);
      if (previousSectorMap) {
        // Snapshot: the warm retain below indexes its own owner into this same
        // sector map, and Map iterators visit entries added mid-walk.
        for (const [entry, row] of [...previousSectorMap]) {
          if (row.nonPlayer <= 0) continue;
          if (retain(entry.key, owner, {
            role: 'warm-previous-sector',
            sectorId: previousSectorId,
          })) retained++;
        }
      }
      if (retained > 0) {
        warmOwner = owner;
        warmSectorId = previousSectorId;
      }
    }
    currentSectorId = exactNext;
    appliedRotateSeq = seq;
    pendingSectorTarget = exactNext;
    hasPendingRotate = true;
    emit('sector-rotated', { currentSectorId, warmSectorId });
    return true;
  }

  function prepareSectorExit(sectorId = currentSectorId, options = {}) {
    const exactSectorId = sectorId == null ? null : String(sectorId);
    if (exactSectorId == null) return 0;
    const includePlayer = options.includePlayer === true;
    const warmRole = includePlayer ? 'save-restore-hold' : 'warm-previous-sector';
    if (warmOwner) releaseOwner(warmOwner, 'warm-sector-expired');
    const owner = Object.freeze({ type: 'asset-warm-sector', sectorId: exactSectorId, generation: assetGeneration });
    let retained = 0;
    const exitSectorMap = sectorOwnerIndex.get(exactSectorId);
    if (exitSectorMap) {
      // Snapshot as above — the warm retain indexes its own owner into this map.
      for (const [entry, row] of [...exitSectorMap]) {
        if (!includePlayer && row.nonPlayer <= 0) continue;
        if (retain(entry.key, owner, { role: warmRole, sectorId: exactSectorId })) retained++;
      }
    }
    warmOwner = retained > 0 ? owner : null;
    warmSectorId = retained > 0 ? exactSectorId : null;
    // Mint the coverage ledger here while the caller still bounds the seam —
    // otherwise the first live retain after the hold pays the O(warmAssets x
    // owners-per-entry) census inside whatever presented frame it lands in.
    if (warmOwner) warmCoverageComplete(warmOwner, owners.get(warmOwner));
    emit('sector-exit-warmed', { sectorId: exactSectorId, retained });
    return retained;
  }

  // Steps twin of the warm-coverage census: same set, minted under a paced
  // iterator. Aborts early if the hold moved on or a lazy mint beat it.
  function* mintWarmCoverageSteps(owner) {
    const warmState = owners.get(owner);
    if (!warmState || (warmCoverage && warmCoverage.owner === owner)) return;
    const assetList = [...warmState.assets];
    const uncovered = new Set();
    for (let i = 0; i < assetList.length; i++) {
      if (warmOwner !== owner || (warmCoverage && warmCoverage.owner === owner)) return;
      if (!warmEntryCovered(assetList[i], owner)) uncovered.add(assetList[i].key);
      if ((i & 255) === 255) yield;
    }
    if (warmOwner === owner && (!warmCoverage || warmCoverage.owner !== owner)) {
      warmCoverage = { owner, uncovered };
    }
  }

  // Deferred twin: snapshots the qualifying rows eagerly (inside the emit,
  // while owner qualification still reflects the departing sector), then hands
  // back an iterator that paces the previous-warm release, the retain loop and
  // the coverage pre-mint across presented frames. Abandon-safe — a mid-mint
  // return() releases the partially retained warm owner via the finally.
  function prepareSectorExitDeferred(sectorId = currentSectorId, options = {}) {
    const exactSectorId = sectorId == null ? null : String(sectorId);
    if (exactSectorId == null) return null;
    const includePlayer = options.includePlayer === true;
    const warmRole = includePlayer ? 'save-restore-hold' : 'warm-previous-sector';
    const exitSectorMap = sectorOwnerIndex.get(exactSectorId);
    const rows = exitSectorMap
      ? [...exitSectorMap]
        .filter(([, row]) => includePlayer || row.nonPlayer > 0)
        .map(([entry]) => entry.key)
      : [];
    const owner = Object.freeze({ type: 'asset-warm-sector', sectorId: exactSectorId, generation: assetGeneration });
    return (function* () {
      if (warmOwner) releaseOwner(warmOwner, 'warm-sector-expired');
      yield;
      let retained = 0;
      let committed = false;
      try {
        for (let i = 0; i < rows.length; i++) {
          if (retain(rows[i], owner, { role: warmRole, sectorId: exactSectorId })) retained++;
          if ((i & 255) === 255) yield;
        }
        committed = true;
      } finally {
        if (!committed && retained > 0) releaseOwner(owner, 'warm-sector-mint-abandoned');
      }
      if (retained > 0) {
        warmOwner = owner;
        warmSectorId = exactSectorId;
        yield* mintWarmCoverageSteps(owner);
      } else {
        warmOwner = null;
        warmSectorId = null;
      }
      emit('sector-exit-warmed', { sectorId: exactSectorId, retained });
      return retained;
    })();
  }

  // Deferred twin of rotateSector: the cheap paths still apply synchronously
  // (returns null when the rotation applied inline — callers should still report
  // rotated=true, and `false` when the sector was already current, mirroring the
  // sync rotate's boolean); a real warm mint snapshots its rows eagerly and
  // returns an iterator that paces the release/retain/coverage work.
  function rotateSectorDeferred(nextSectorId) {
    const exactNext = nextSectorId == null ? null : String(nextSectorId);
    // The pointer lags one rotation while an earlier mint is still queued; the sector
    // this call departs is the newest REQUESTED target, not the stale live one — this
    // also keeps reversal requests (B→A while A→B is queued) from being dropped.
    const effectiveCurrent = effectiveCurrentSectorId();
    if (exactNext === effectiveCurrent) return false;
    const rotateSeq = ++latestRotateSeq;
    if (warmOwner && warmSectorId === effectiveCurrent) {
      currentSectorId = exactNext;
      appliedRotateSeq = rotateSeq;
      pendingSectorTarget = exactNext;
      hasPendingRotate = true;
      emit('sector-rotated', { currentSectorId, warmSectorId });
      return null;
    }
    pendingSectorTarget = exactNext;
    hasPendingRotate = true;
    const previousSectorId = effectiveCurrent;
    const previousSectorMap = previousSectorId != null ? sectorOwnerIndex.get(previousSectorId) : null;
    const rows = previousSectorMap
      ? [...previousSectorMap].filter(([, row]) => row.nonPlayer > 0).map(([entry]) => entry.key)
      : [];
    const owner = previousSectorId != null
      ? Object.freeze({ type: 'asset-warm-sector', sectorId: previousSectorId, generation: assetGeneration })
      : null;
    const mintIterator = (function* () {
      try {
        if (warmOwner) releaseOwner(warmOwner, 'warm-sector-expired');
        yield;
        let retained = 0;
        let committed = false;
        // appliedRotateSeq only advances past this seq via a newer applied rotate
        // or the context repin — either way the queued mint is dead and its retain
        // pass is wasted work. Bail to the marker-clearing finally; the inner
        // committed guard releases any partial mint.
        const superseded = () => appliedRotateSeq >= rotateSeq;
        try {
          for (let i = 0; i < rows.length && !superseded(); i++) {
            if (retain(rows[i], owner, { role: 'warm-previous-sector', sectorId: previousSectorId })) retained++;
            if ((i & 255) === 255) yield;
          }
          committed = !superseded();
        } finally {
          if (!committed && retained > 0) releaseOwner(owner, 'warm-sector-mint-abandoned');
        }
        if (!superseded()) {
          if (retained > 0) {
            warmOwner = owner;
            warmSectorId = previousSectorId;
            yield* mintWarmCoverageSteps(owner);
          } else {
            warmOwner = null;
            warmSectorId = null;
          }
          // A cheap-path or sync rotate that superseded this one already moved the
          // pointer; repoint only while this is still the newest applied rotation.
          if (rotateSeq > appliedRotateSeq) {
            currentSectorId = exactNext;
            appliedRotateSeq = rotateSeq;
          }
          emit('sector-rotated', { currentSectorId, warmSectorId });
        }
        return true;
      } finally {
        // Drain-abandon (.return()) or supersede: drop the stale pending marker so
        // later calls re-derive from the live pointer instead of a dead request.
        if (hasPendingRotate && pendingSectorTarget === exactNext) hasPendingRotate = false;
      }
    })();
    // A queued mint killed before its first .next() never enters the generator,
    // so its finally (and the pending-marker cleanup) never runs. Chain abandon
    // sites call this hook instead: finalize the rotation the requester already
    // observed via effectiveCurrentSectorId() and drop the dead marker.
    mintIterator.onAbandoned = () => {
      if (hasPendingRotate && pendingSectorTarget === exactNext) hasPendingRotate = false;
      if (rotateSeq > appliedRotateSeq) {
        currentSectorId = exactNext;
        appliedRotateSeq = rotateSeq;
      }
    };
    return mintIterator;
  }

  function handleContextLost() {
    if (contextLost) return false;
    contextLost = true;
    emit('context-lost', { contextGeneration });
    return true;
  }

  function handleContextRestored(options = {}) {
    const roster = options && Array.isArray(options.roster) ? options.roster : null;
    const sectorId = options && options.sectorId != null ? String(options.sectorId) : null;
    const repin = () => {
      if (sectorId) {
        currentSectorId = sectorId;
        // The repin is authoritative: consume every queued rotate's seq so a still-
        // draining deferred mint cannot repoint the pointer back across the restore.
        hasPendingRotate = false;
        pendingSectorTarget = null;
        appliedRotateSeq = latestRotateSeq;
      }
      if (!roster) return;
      beginVisibilityPresent();
      for (let i = 0; i < roster.length; i++) noteVisibility(roster[i], true);
    };
    if (!contextLost) {
      repin();
      return false;
    }
    contextLost = false;
    contextGeneration++;
    repin();
    emit('context-restored', { contextGeneration, sectorId });
    return true;
  }

  function disposeAll(reason = 'registry-disposed', disposeResources = true) {
    const wasContextLost = contextLost;
    if (!disposeResources) contextLost = true;
    packageCacheBudgetDepth++;
    try {
      for (const request of [...pendingRequests]) request.cancel(reason);
      for (const owner of [...owners.keys()]) releaseOwner(owner, reason);
      for (const entry of [...assets.values()]) evictIfUnowned(entry, reason);
    } finally {
      packageCacheBudgetDepth--;
    }
    contextLost = wasContextLost;
  }

  // Per-entry diagnostics row memo on ownersVersion + the canonical flag —
  // every field keys off the owner set, refCount/resource/byte totals that are
  // stable while resident, so an unchanged entry serves its frozen row without
  // the O(owners) set/dedup/sort mints inside every seam publish.
  function diagnosticsRow(entry, canonical) {
    const memo = entry.diagRowMemo;
    if (memo && memo.ownersVersion === entry.ownersVersion && memo.canonical === canonical) {
      return memo.row;
    }
    const gpuResidentBytes = assetResidentBytes(entry);
    const unaccountedResources = assetUnaccountedResources(entry);
    const row = {
      key: entry.key,
      refCount: entry.owners.size,
      resourceCount: entry.resources.size,
      // `bytes` remains as the compatibility field consumed by existing diagnostics readers.
      // It is never populated from encoded package size; it aliases authoritative GPU bytes.
      bytes: gpuResidentBytes,
      gpuResidentBytes,
      cpuPackageBytes: entry.cpuPackageBytes,
      unaccountedResources,
      unaccountedBytes: unaccountedResources > 0 ? null : 0,
      gpuAccountingAuthoritative: unaccountedResources === 0,
      roles: Object.freeze([...new Set([...entry.owners.values()].map((metadata) => metadata && metadata.role).filter(Boolean))].sort()),
      presentationTiers: Object.freeze([...new Set([...entry.owners.values()]
        .map((metadata) => metadata && metadata.presentationTier).filter(Boolean))].sort()),
      sectors: Object.freeze([...new Set([...entry.owners.values()].flatMap((metadata) => ownerSectorIds(metadata)))].sort()),
    };
    if (!canonical) row.generation = entry.generation;
    const frozen = Object.freeze(row);
    entry.diagRowMemo = { ownersVersion: entry.ownersVersion, canonical, row: frozen };
    return frozen;
  }

  function diagnostics(diagnosticOptions = {}) {
    const canonical = diagnosticOptions.canonical === true;
    const includeEvents = diagnosticOptions.includeEvents !== false && !canonical;
    const ownerRows = diagnosticOptions.includeOwners === true
      ? [...owners.entries()].map(([owner, state]) => {
        let tag = null;
        if (owner && typeof owner === 'object') {
          tag = owner.type || owner.name || null;
          if (!tag && owner.userData && owner.userData.kind) tag = `boundary:${owner.userData.kind}`;
          if (!tag && owner.constructor && owner.constructor.name) tag = owner.constructor.name;
        }
        if (!tag) tag = typeof owner;
        return Object.freeze({
          owner: String(tag),
          // `.type` wins the tag for Object3D owners, so surface `.name` separately — a boundary
          // owner row must name WHICH boundary still pins assets or the row is unactionable.
          ownerName: owner && typeof owner === 'object' && typeof owner.name === 'string'
            ? owner.name
            : null,
          // Render-package owners carry their content hash; surfaces which package a pending
          // decode request belongs to (the row tag alone collapses every package owner to one).
          contentHash: owner && typeof owner === 'object' && typeof owner.contentHash === 'string'
            ? owner.contentHash
            : null,
          released: state.released === true,
          assets: state.assets.size,
          requests: state.requests.size,
          requestKeys: Object.freeze([...state.requests].map((request) => String(request.key || ''))),
          roles: Object.freeze([...new Set([...state.assets]
            .flatMap((entry) => [...entry.owners.values()])
            .map((metadata) => metadata && metadata.role)
            .filter(Boolean))].sort()),
          bytes: [...state.assets].reduce((sum, entry) => sum + assetResidentBytes(entry), 0),
        });
      }).sort((a, b) => b.bytes - a.bytes || a.owner.localeCompare(b.owner))
      : null;
    const assetRows = [...assets.values()].map((entry) => diagnosticsRow(entry, canonical))
      .sort((a, b) => a.key.localeCompare(b.key));
    let gpuResidentBytes = 0;
    for (const unit of memoryUnits.values()) gpuResidentBytes += unit.bytes;
    let cpuPackageBytes = 0;
    for (const entry of assets.values()) cpuPackageBytes += entry.cpuPackageBytes;
    let unaccountedResources = 0;
    for (const entry of resources.values()) if (entry.unaccounted) unaccountedResources++;
    // The class ledgers carry these totals per-mutation — read them instead of
    // re-walking the table (the verify cadence re-derives them as drift checks).
    const packageCacheOnlyBytes = packageCacheOnlyBytesTotal;
    const softResidentBytes = softResidentBytesTotal;
    return Object.freeze({
      schema: 'spaceface.assetResidency.v2',
      residentAssets: assets.size,
      residentResources: resources.size,
      // Keep the legacy name stable for consumers while making the unit explicit.
      residentBytes: gpuResidentBytes,
      gpuResidentBytes,
      cpuPackageBytes,
      unaccountedResources,
      // Unknown allocations are deliberately not guessed. null is the receipt that the bytes
      // cannot be added to the GPU total until a resource-specific accounting adapter exists.
      unaccountedBytes: unaccountedResources > 0 ? null : 0,
      gpuAccountingAuthoritative: unaccountedResources === 0,
      ownerCount: owners.size,
      ...(ownerRows ? { owners: Object.freeze(ownerRows) } : {}),
      pendingRequests: pendingRequests.size,
      disposedResources,
      abandonedResources,
      evictedAssets,
      ledgerDriftEvents,
      cacheSweepCount,
      packageCacheOnlyBytes,
      packageCacheOnlyMaxBytes,
      softResidentBytes,
      softResidentMaxBytes,
      currentSectorId,
      warmSectorId,
      contextLost,
      contextGeneration,
      // W125 coverage-gap incidence: retains without metadata.sectorId, split by
      // whether the entry is warm-mint-visible anyway (sectorOwnerRefs > 0) or
      // invisible (sole owner, unindexed). byRole names the roles minting them.
      sectorlessOwnerRetains: Object.freeze({
        total: sectorlessOwnerRetains.total,
        onSectorIndexedEntries: sectorlessOwnerRetains.onSectorIndexedEntries,
        soleOwnerUnindexed: sectorlessOwnerRetains.soleOwnerUnindexed,
        byRole: Object.freeze([...sectorlessOwnerRetains.byRole.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 8)
          .map(([role, count]) => Object.freeze({ role, count }))),
      }),
      assets: Object.freeze(assetRows),
      eventHistorySize: events.length,
      events: Object.freeze(includeEvents ? events.slice() : []),
    });
  }

  function canonicalDiagnostics() {
    // The canonical snapshot is rebuilt on every seam call (mesh reconcile, residency service,
    // the 0.25 s readiness poll) — an O(assets) frozen-row sort each time. The registry only
    // changes through emit-bearing mutations, so reuse the frozen snapshot until the next one.
    if (canonicalDiagnosticsEpoch !== diagnosticsEpoch) {
      canonicalDiagnosticsCache = diagnostics({ canonical: true, includeEvents: false });
      canonicalDiagnosticsEpoch = diagnosticsEpoch;
    }
    return canonicalDiagnosticsCache;
  }

  function has(key) {
    const entry = assets.get(String(key || ''));
    return !!entry && entry.state === 'resident';
  }

  // Positive knowledge of a non-resident lifecycle (evicted/disposed/abandoned/in-flight).
  // Distinguishes "tracked and gone" from "never registered" — callers that also trust a
  // record's own residency stamp must not treat an absent key as proof of eviction.
  function knownNonResident(key) {
    const entry = assets.get(String(key || ''));
    return !!entry && entry.state !== 'resident';
  }

  function governorEntry(entry, kind = 'gpu', activePendingKeys = null) {
    const activeRequest = activePendingKeys
      ? activePendingKeys.has(entry.key)
      : activePendingKeySet().has(entry.key);
    // Row memo: owner clones, role/tier dedups and the memoryUnits walk all key
    // off the owner set, which mutates only through the membership funnel
    // (ownersVersion). activeRequest is the one volatile field — it is a Set
    // probe per consult, restamped onto the shared row each call. Consumers
    // only read rows or shallow-copy them (selectEvictions), so sharing is safe.
    const memo = entry.governorRowMemo;
    if (memo && memo.ownersVersion === entry.ownersVersion && memo.kind === kind) {
      memo.row.activeRequest = activeRequest;
      return memo.row;
    }
    const ownerRecords = [...entry.owners.values()].map((metadata) => ({ ...(metadata || {}) }));
    const roles = [...new Set(ownerRecords.map((metadata) => metadata.role).filter(Boolean))];
    const presentationTiers = [...new Set(ownerRecords
      .map((metadata) => metadata.presentationTier).filter(Boolean))];
    const memoryUnits = [];
    if (kind === 'gpu') {
      const seenMemoryUnits = new Set();
      for (const resource of entry.resources) {
        for (const unit of resource.memoryUnits || []) {
          if (!unit || seenMemoryUnits.has(unit.identity)) continue;
          seenMemoryUnits.add(unit.identity);
          memoryUnits.push({ identity: unit.identity, bytes: unit.bytes });
        }
      }
    }
    const gpuResidentBytes = assetResidentBytes(entry);
    const row = {
      key: entry.key,
      // `bytes` is retained as the GPU compatibility alias. CPU planning uses the separate
      // package-byte field and never falls through to this value.
      bytes: gpuResidentBytes,
      gpuBytes: gpuResidentBytes,
      cpuBytes: entry.cpuPackageBytes,
      kind,
      roles,
      presentationTiers,
      ownerRecords,
      activeRequest,
      memoryUnits: kind === 'gpu' ? memoryUnits : null,
      // memoryUnitList()'s output for this row, minted once per memo — the enforce census
      // consults it per pass instead of re-deduping/re-validating the same unit walk.
      validatedUnits: kind === 'gpu'
        ? memoryUnits.filter((unit) => unit && unit.identity != null
            && Number.isFinite(Number(unit.bytes)) && Number(unit.bytes) > 0)
        : null,
    };
    entry.governorRowMemo = { ownersVersion: entry.ownersVersion, kind, row };
    return row;
  }

  function blockedBreakdown(entries, reasonsByRow = null) {
    const kind = entries[0]?.kind === 'cpu' ? 'cpu' : 'gpu';
    const unitsByReason = new Map();
    for (const entry of entries) {
      if (isGovernorEntryEvictable(entry)) continue;
      const reasons = (reasonsByRow && reasonsByRow.get(entry)) || governorEntryBlockReasons(entry);
      const fallback = reasons.length > 0 ? reasons : ['protected'];
      for (const reason of fallback) {
        let units = unitsByReason.get(reason);
        if (!units) {
          units = new Map();
          unitsByReason.set(reason, units);
        }
        if (Array.isArray(entry.memoryUnits) && entry.memoryUnits.length > 0) {
          for (const unit of entry.memoryUnits) {
            if (!unit || unit.identity == null) continue;
            units.set(unit.identity, Math.max(units.get(unit.identity) || 0, Number(unit.bytes) || 0));
          }
        } else {
          const bytes = kind === 'cpu' ? Number(entry.cpuBytes) || 0 : Number(entry.gpuBytes) || 0;
          units.set(entry, bytes);
        }
      }
    }
    const byRole = {};
    const byReason = {};
    for (const [reason, units] of unitsByReason) {
      let bytes = 0;
      for (const value of units.values()) bytes += value;
      const role = reason.startsWith('role:') ? reason.slice(5) : reason;
      byRole[role] = (byRole[role] || 0) + bytes;
      byReason[reason] = (byReason[reason] || 0) + bytes;
    }
    return {
      byRole: Object.freeze(byRole),
      byReason: Object.freeze(byReason),
    };
  }

  function enforceBudget(kind = 'gpu') {
    const before = budgetTotals();
    const initialResidentBytes = kind === 'cpu' ? before.cpuPackageBytes : before.gpuResidentBytes;
    // One pending-request snapshot per call keeps each census map O(assets)+O(requests) —
    // the inline per-entry scan was O(assets x requests) and ran twice (before + after
    // entries). The per-candidate re-check below still consults live requests through the
    // default governorEntry path, so a plan can never outrace a decode completing mid-call.
    const governorCapBytes = kind === 'cpu' ? governor.maxCpuBytes : governor.maxGpuBytes;
    // Every census input is funnelled behind the two mutation seqs; identical
    // seqs + byte ledgers + cap reproduce the last receipt verbatim, so a
    // residency poll that changed nothing serves the frozen plan in O(1)
    // instead of re-walking O(blocked). An evicting call mutates through a
    // funnel, so a memoized plan can never skip live evictions.
    const memo = enforcePlanMemo;
    if (memo
      && memo.kind === kind
      && memo.residencyMutationSeq === residencyMutationSeq
      && memo.pendingRequestSeq === pendingRequestSeq
      && memo.cpuPackageBytes === before.cpuPackageBytes
      && memo.gpuResidentBytes === before.gpuResidentBytes
      && memo.unaccountedResources === before.unaccountedResources
      && memo.governorCapBytes === governorCapBytes) {
      return memo.receipt;
    }
    const overBudgetKnown = initialResidentBytes > governorCapBytes;
    const activePendingKeys = activePendingKeySet();
    const entries = [];
    // Blocked rows are collected inside the same census walk — a planned evict
    // can only remove evictable rows, so the blocked set survives to the
    // after-table unchanged; the membership filter below stays for mutations
    // that raced the census itself. Each blocked row's reasons mint on this pass
    // too: the planner consumes them (plus the unit-owner index) as option
    // projections, and the after-table breakdown reuses them — the blocked set
    // is walked once, not three times. Under the cap the plan can only be
    // evict:[], so the entries list and unit-owner index are skipped outright.
    const blockedRows = [];
    const blockedReasons = new Map();
    const unitOwners = overBudgetKnown ? new Map() : null;
    const entryUnitIds = overBudgetKnown ? [] : null;
    let hasMemoryModel = false;
    if (overBudgetKnown) {
      for (const entry of assets.values()) {
        const row = governorEntry(entry, kind, activePendingKeys);
        const index = entries.length;
        entries.push(row);
        if (Array.isArray(row.memoryUnits)) hasMemoryModel = true;
        const units = row.validatedUnits !== undefined ? row.validatedUnits : memoryUnitList(row);
        const effective = units && units.length > 0
          ? units
          : [{ identity: row, bytes: numericBytes(row, kind) }];
        const ids = [];
        for (const unit of effective) {
          if (!unit || unit.bytes <= 0) continue;
          ids.push(unit.identity);
          let record = unitOwners.get(unit.identity);
          if (!record) {
            record = { bytes: unit.bytes, entryIndexes: new Set() };
            unitOwners.set(unit.identity, record);
          } else {
            record.bytes = Math.max(record.bytes, unit.bytes);
          }
          record.entryIndexes.add(index);
        }
        entryUnitIds[index] = ids;
      }
    }
    // Blocked rows mint off the live member set for both paths — per-member re-qualify
    // on this call's pending snapshot keeps the set exact while the per-row policy
    // check drops out of the census entirely (O(blocked), O(1) when the set is empty).
    for (const entry of governorBlockedMembers) {
      if (assets.get(entry.key) !== entry) continue;
      const row = governorEntry(entry, kind, activePendingKeys);
      if (!isGovernorEntryEvictable(row)) {
        blockedRows.push(row);
        blockedReasons.set(row, governorEntryBlockReasons(row));
      }
    }
    const memoryUnitOwners = hasMemoryModel ? unitOwners : null;
    // Under the named ceiling the planner can only return evict:[] — selectEvictions
    // takes its early-out before touching evictions — so the spread/sort/index build
    // is skipped outright; the receipt still carries the same fields, and the blocked
    // breakdown below reports the real composition from `entries` like before.
    const plan = initialResidentBytes <= governorCapBytes
      ? {
        overBudget: false,
        residentBytes: initialResidentBytes,
        initialResidentBytes,
        remainingBytes: initialResidentBytes,
        evictedBytes: 0,
        plannedEvictedBytes: 0,
        budgetBytes: governorCapBytes,
        budgetSatisfied: true,
        protectedShortfallBytes: 0,
        kind,
        blockedBytesByRole: Object.freeze({}),
        blockedBytesByReason: Object.freeze({}),
        evict: Object.freeze([]),
      }
      : governor.plan(entries, kind, { initialResidentBytes, blockedRows, blockedReasons, memoryUnitOwners, entryUnitIds });
    const evicted = [];
    for (const key of plan.evict) {
      const entry = assets.get(String(key || ''));
      if (!entry) continue;
      const candidate = governorEntry(entry, kind);
      // Re-check against live owners and requests. A plan can race a decode completion or a new
      // presentation retain between planning and execution; releasing only a fully evictable
      // candidate keeps the planner/executor contract fail-closed.
      if (!isGovernorEntryEvictable(candidate)) continue;
      let everyOwnerEvictable = true;
      for (const metadata of entry.owners.values()) {
        if (!isGovernorOwnerEvictable(metadata)) {
          everyOwnerEvictable = false;
          break;
        }
      }
      if (!everyOwnerEvictable) continue;
      if (visibilityHeld(entry)) continue;
      for (const owner of [...entry.owners.keys()]) release(entry.key, owner, 'governor-budget');
      evictIfUnowned(entry, 'governor-budget');
      if (!assets.has(String(key))) evicted.push(key);
    }
    // An empty plan.evict means no release() ran — the blocked rows collected in
    // the census are byte-identical to the after-table's. A non-empty evict plan
    // can only remove evictable rows, so the blocked set needs no filter there;
    // the same filter covers mutations that raced the census itself (mid-flight
    // releases in the stepped twin).
    const afterBlockedRows = plan.evict.length === 0
      ? blockedRows
      : blockedRows.filter((row) => assets.has(row.key));
    const after = budgetTotals();
    const beforeBytes = Number(kind === 'cpu' ? before.cpuPackageBytes : before.gpuResidentBytes) || 0;
    const remainingBytes = Number(kind === 'cpu' ? after.cpuPackageBytes : after.gpuResidentBytes) || 0;
    const evictedBytes = Math.max(0, beforeBytes - remainingBytes);
    const blocked = blockedBreakdown(afterBlockedRows, blockedReasons);
    const budgetBytes = Number(plan.budgetBytes);
    const gpuAccountingAuthoritative = kind !== 'gpu' || after.unaccountedResources === 0;
    const indeterminate = !gpuAccountingAuthoritative;
    const budgetSatisfied = indeterminate
      ? false
      : Number.isFinite(budgetBytes) ? remainingBytes <= budgetBytes : true;
    const receipt = Object.freeze({
      ...plan,
      evicted: Object.freeze(evicted),
      evictedBytes,
      remainingBytes,
      // GPU remains the compatibility receipt. `remainingBytes` is the selected budget kind.
      residentBytes: after.gpuResidentBytes,
      gpuResidentBytes: after.gpuResidentBytes,
      cpuPackageBytes: after.cpuPackageBytes,
      budgetSatisfied,
      overBudget: indeterminate ? null : !budgetSatisfied,
      indeterminate,
      gpuAccountingAuthoritative,
      unaccountedResources: after.unaccountedResources,
      protectedShortfallBytes: indeterminate ? null : budgetSatisfied ? 0 : remainingBytes - budgetBytes,
      blockedBytesByRole: blocked.byRole,
      blockedBytesByReason: blocked.byReason,
    });
    enforcePlanMemo = {
      kind,
      residencyMutationSeq,
      pendingRequestSeq,
      cpuPackageBytes: after.cpuPackageBytes,
      gpuResidentBytes: after.gpuResidentBytes,
      unaccountedResources: after.unaccountedResources,
      governorCapBytes,
      receipt,
    };
    return receipt;
  }

  // Stepped twin of enforceBudget: identical plan/evict/receipt semantics with the
  // O(assets) census and the evict loop batched under the caller's slice clock —
  // the sector:exit seam was the last site paying the whole mint inside one emit.
  function* enforceBudgetSteps(kind = 'gpu', batchEntries = 256) {
    const before = budgetTotals();
    const initialResidentBytes = kind === 'cpu' ? before.cpuPackageBytes : before.gpuResidentBytes;
    const governorCapBytes = kind === 'cpu' ? governor.maxCpuBytes : governor.maxGpuBytes;
    // Same memo as the sync twin — the consult runs at first .next(), so a mint
    // held across frames still re-validates the seqs at drive time.
    const memo = enforcePlanMemo;
    if (memo
      && memo.kind === kind
      && memo.residencyMutationSeq === residencyMutationSeq
      && memo.pendingRequestSeq === pendingRequestSeq
      && memo.cpuPackageBytes === before.cpuPackageBytes
      && memo.gpuResidentBytes === before.gpuResidentBytes
      && memo.unaccountedResources === before.unaccountedResources
      && memo.governorCapBytes === governorCapBytes) {
      return memo.receipt;
    }
    const overBudgetKnown = initialResidentBytes > governorCapBytes;
    const activePendingKeys = activePendingKeySet();
    const entries = [];
    const blockedRows = [];
    // Same single-fold census as the sync twin: blocked reasons mint once off the member
    // set and serve both the planner's blocked loop and the after-table breakdown; the
    // entries list and unit-owner index mint only when the ledger is already over the cap
    // (the plan can only be evict:[] otherwise). Yield cadence keeps its
    // O(assets)/batchEntries contract.
    const blockedReasons = new Map();
    const unitOwners = overBudgetKnown ? new Map() : null;
    const entryUnitIds = overBudgetKnown ? [] : null;
    let hasMemoryModel = false;
    let visited = 0;
    if (overBudgetKnown) {
      for (const entry of assets.values()) {
        const row = governorEntry(entry, kind, activePendingKeys);
        const index = entries.length;
        entries.push(row);
        if (Array.isArray(row.memoryUnits)) hasMemoryModel = true;
        const units = row.validatedUnits !== undefined ? row.validatedUnits : memoryUnitList(row);
        const effective = units && units.length > 0
          ? units
          : [{ identity: row, bytes: numericBytes(row, kind) }];
        const ids = [];
        for (const unit of effective) {
          if (!unit || unit.bytes <= 0) continue;
          ids.push(unit.identity);
          let record = unitOwners.get(unit.identity);
          if (!record) {
            record = { bytes: unit.bytes, entryIndexes: new Set() };
            unitOwners.set(unit.identity, record);
          } else {
            record.bytes = Math.max(record.bytes, unit.bytes);
          }
          record.entryIndexes.add(index);
        }
        entryUnitIds[index] = ids;
        if (++visited % batchEntries === 0) yield;
      }
    }
    for (const entry of governorBlockedMembers) {
      if (assets.get(entry.key) !== entry) continue;
      const row = governorEntry(entry, kind, activePendingKeys);
      if (!isGovernorEntryEvictable(row)) {
        blockedRows.push(row);
        blockedReasons.set(row, governorEntryBlockReasons(row));
      }
      if (++visited % batchEntries === 0) yield;
    }
    const memoryUnitOwners = hasMemoryModel ? unitOwners : null;
    const plan = initialResidentBytes <= governorCapBytes
      ? {
        overBudget: false,
        residentBytes: initialResidentBytes,
        initialResidentBytes,
        remainingBytes: initialResidentBytes,
        evictedBytes: 0,
        plannedEvictedBytes: 0,
        budgetBytes: governorCapBytes,
        budgetSatisfied: true,
        protectedShortfallBytes: 0,
        kind,
        blockedBytesByRole: Object.freeze({}),
        blockedBytesByReason: Object.freeze({}),
        evict: Object.freeze([]),
      }
      : governor.plan(entries, kind, { initialResidentBytes, blockedRows, blockedReasons, memoryUnitOwners, entryUnitIds });
    const evicted = [];
    for (const key of plan.evict) {
      if (++visited % batchEntries === 0) yield;
      const entry = assets.get(String(key || ''));
      if (!entry) continue;
      const candidate = governorEntry(entry, kind);
      // Same live re-check as the sync twin — a plan can race a decode completion
      // or a new presentation retain between steps; only fully evictable
      // candidates release.
      if (!isGovernorEntryEvictable(candidate)) continue;
      let everyOwnerEvictable = true;
      for (const metadata of entry.owners.values()) {
        if (!isGovernorOwnerEvictable(metadata)) {
          everyOwnerEvictable = false;
          break;
        }
      }
      if (!everyOwnerEvictable) continue;
      if (visibilityHeld(entry)) continue;
      for (const owner of [...entry.owners.keys()]) release(entry.key, owner, 'governor-budget');
      evictIfUnowned(entry, 'governor-budget');
      if (!assets.has(String(key))) evicted.push(key);
    }
    const afterBlockedRows = plan.evict.length === 0
      ? blockedRows
      : blockedRows.filter((row) => assets.has(row.key));
    const after = budgetTotals();
    const beforeBytes = Number(kind === 'cpu' ? before.cpuPackageBytes : before.gpuResidentBytes) || 0;
    const remainingBytes = Number(kind === 'cpu' ? after.cpuPackageBytes : after.gpuResidentBytes) || 0;
    const evictedBytes = Math.max(0, beforeBytes - remainingBytes);
    const blocked = blockedBreakdown(afterBlockedRows, blockedReasons);
    const budgetBytes = Number(plan.budgetBytes);
    const gpuAccountingAuthoritative = kind !== 'gpu' || after.unaccountedResources === 0;
    const indeterminate = !gpuAccountingAuthoritative;
    const budgetSatisfied = indeterminate
      ? false
      : Number.isFinite(budgetBytes) ? remainingBytes <= budgetBytes : true;
    const receipt = Object.freeze({
      ...plan,
      evicted: Object.freeze(evicted),
      evictedBytes,
      remainingBytes,
      residentBytes: after.gpuResidentBytes,
      gpuResidentBytes: after.gpuResidentBytes,
      cpuPackageBytes: after.cpuPackageBytes,
      budgetSatisfied,
      overBudget: indeterminate ? null : !budgetSatisfied,
      indeterminate,
      gpuAccountingAuthoritative,
      unaccountedResources: after.unaccountedResources,
      protectedShortfallBytes: indeterminate ? null : budgetSatisfied ? 0 : remainingBytes - budgetBytes,
      blockedBytesByRole: blocked.byRole,
      blockedBytesByReason: blocked.byReason,
    });
    enforcePlanMemo = {
      kind,
      residencyMutationSeq,
      pendingRequestSeq,
      cpuPackageBytes: after.cpuPackageBytes,
      gpuResidentBytes: after.gpuResidentBytes,
      unaccountedResources: after.unaccountedResources,
      governorCapBytes,
      receipt,
    };
    return receipt;
  }

  return Object.freeze({
    registerAsset,
    retain,
    reclaimWarm,
    beginRequest,
    release,
    releaseOwner,
    reviveOwner,
    releaseDetachedBoundaryOwners,
    releaseDetachedBoundaryOwnersSteps,
    releaseUnreferencedCacheOwners,
    releaseUnreferencedCacheOwnersSteps,
    verifyLedgerConsistency,
    handoffOwnerWhenCovered,
    isOwnerReleased,
    rotateSector,
    rotateSectorDeferred,
    prepareSectorExit,
    prepareSectorExitDeferred,
    setEvictionCorridor,
    handleContextLost,
    handleContextRestored,
    beginVisibilityPresent,
    noteVisibility,
    noteOwnerVisibility,
    visibilityKeysForOwners,
    advanceVisibilityHysteresis,
    // Cache-held entries (decoded package templates, warm-sector holds) are not reachable from
    // the live scene, so the context-loss detach pass cannot find them there. Hand the registry's
    // tracked resources to that pass directly: without it, a post-restore eviction dispatches the
    // stale pre-loss dispose listener and deletes dead handles through the new context.
    contextLossResources() { return [...resources.keys()]; },
    disposeAll,
    has,
    knownNonResident,
    enforceBudget,
    enforceBudgetSteps,
    diagnostics,
    canonicalDiagnostics,
  });
}

export function applySectorExitResidency(residency, sectorId, options = {}) {
  if (!residency) return null;
  // A caller that drives the cleanup iterator itself can also take over the
  // warm mint — it rides as leg 0 of the same paced drive instead of paying
  // its O(sector) release+retain loop inside the exit emit.
  let warmMintIter = null;
  if (options.deferWarmMint === true
    && typeof options.driveCacheCleanup === 'function'
    && typeof residency.prepareSectorExitDeferred === 'function') {
    warmMintIter = residency.prepareSectorExitDeferred(sectorId, options);
  } else if (typeof residency.prepareSectorExit === 'function') {
    residency.prepareSectorExit(sectorId, options);
  }
  const primaryReason = options.cacheCleanupReason || 'sector-exit-cache-only';
  const postDispatchReason = options.cacheCleanupReason
    ? `${options.cacheCleanupReason}:post-dispatch`
    : 'sector-exit-cache-only:post-dispatch';
  let cacheCleanup = null;
  // A caller can take over cleanup driving (e.g. the renderer's paced residency
  // poll) — the sync twin + microtask then never run inside the exit frame.
  if (typeof options.driveCacheCleanup === 'function') {
    options.driveCacheCleanup(primaryReason, postDispatchReason, warmMintIter);
  } else {
    cacheCleanup = typeof residency.releaseUnreferencedCacheOwners === 'function'
      ? residency.releaseUnreferencedCacheOwners(primaryReason)
      : null;
    // World emits sector:exit before the caller releases its preview/instance owner. Queue one
    // post-dispatch pass so that just-departed cache-only packages are reclaimed at the same boundary
    // without making arbitrary owner release tear down a reusable package mid-frame.
    if (typeof residency.releaseUnreferencedCacheOwners === 'function'
      && typeof globalThis.queueMicrotask === 'function') {
      globalThis.queueMicrotask(() => {
        residency.releaseUnreferencedCacheOwners(postDispatchReason);
      });
    }
  }
  // deferBudgetEnforce hands the enforce to the caller's paced drive (the
  // renderer chains it as a leg of the sector-exit cleanup iterator): the census
  // then paces across presented beats instead of minting inside the exit emit.
  // The deferred receipt is inherently async — callers that consume the return
  // receipt synchronously must not pass this flag.
  if (typeof residency.enforceBudget === 'function' && options.deferBudgetEnforce !== true) {
    const receipt = residency.enforceBudget(options.kind || 'gpu');
    if (!cacheCleanup) return receipt;
    return Object.freeze({
      ...receipt,
      cacheCleanup,
      cacheEvicted: cacheCleanup.evicted,
      evicted: Object.freeze([
        ...cacheCleanup.evicted,
        ...(Array.isArray(receipt && receipt.evicted) ? receipt.evicted : []),
      ]),
      evictedBytes: (Number(receipt && receipt.evictedBytes) || 0) + cacheCleanup.evictedBytes,
    });
  }
  return cacheCleanup;
}

export function getAssetResidency(renderer, options = {}) {
  if (!renderer || (typeof renderer !== 'object' && typeof renderer !== 'function')) return null;
  let registry = registriesByRenderer.get(renderer);
  if (!registry) {
    registry = createAssetResidencyRegistry({ ...options, renderer });
    registriesByRenderer.set(renderer, registry);
  }
  return registry;
}

export function disposeAssetResidency(renderer, reason = 'renderer-disposed', disposeResources = true) {
  const registry = renderer && registriesByRenderer.get(renderer);
  if (!registry) return false;
  registry.disposeAll(reason, disposeResources);
  registriesByRenderer.delete(renderer);
  return true;
}

function assetResidentBytes(entry) {
  const units = new Set();
  for (const resource of entry.resources) for (const unit of resource.memoryUnits || []) units.add(unit);
  let bytes = 0;
  for (const unit of units) bytes += unit.bytes;
  return bytes;
}

function normalizeNonNegativeBytes(value) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : 0;
}

function isMaterialResource(resource) {
  return !!resource && (
    resource.isMaterial === true
    || (typeof resource.type === 'string' && /material$/i.test(resource.type))
  );
}

function explicitGpuBytes(resource) {
  if (!resource || typeof resource !== 'object') return null;
  for (const field of ['gpuResidentBytes', 'gpuBytes', 'gpuByteSize']) {
    if (Number.isFinite(Number(resource[field])) && Number(resource[field]) >= 0) {
      return Number(resource[field]);
    }
  }
  // byteSize predates the split accounting contract and remains a compatibility escape hatch for
  // non-Three test/runtime adapters. It is intentionally ignored on materials and wrappers: those
  // objects do not allocate a GPU backing store merely because a package has encoded bytes.
  if (!isMaterialResource(resource)
    && Number.isFinite(Number(resource.byteSize))
    && Number(resource.byteSize) >= 0) {
    return Number(resource.byteSize);
  }
  return null;
}

function resourceMemoryAccounting(resource, options = {}) {
  const explicit = explicitGpuBytes(resource);
  if (explicit != null) {
    return { units: explicit > 0 ? [{ identity: resource, bytes: explicit }] : [], known: true };
  }
  if (!resource || typeof resource !== 'object') return { units: [], known: false };

  // A material is a state wrapper. Its shader/program allocation is accounted by renderer
  // program telemetry, not by asset texture/buffer residency. It must never inherit package bytes.
  if (isMaterialResource(resource)) return { units: [], known: true };

  if (resource.isRenderTarget === true) return renderTargetMemoryAccounting(resource, options);
  if (resource.isTexture === true || resource.isRenderTargetTexture === true) {
    return textureMemoryAccounting(resource, new Set(), options);
  }

  const units = new Map();
  const hasBufferShape = resource.isBufferGeometry === true
    || resource.isInstancedBufferGeometry === true
    || resource.isBufferAttribute === true
    || resource.isInterleavedBuffer === true
    || (resource.attributes && typeof resource.attributes === 'object')
    || resource.index != null
    || resource.instanceMatrix != null
    || resource.instanceColor != null
    || resource.morphAttributes != null
    || resource.indirect != null;
  if (hasBufferShape) {
    if (resource.isBufferAttribute === true || resource.isInterleavedBuffer === true) {
      addBufferAttributeUnit(units, resource);
    }
    for (const attribute of Object.values(resource.attributes || {})) addBufferAttributeUnit(units, attribute);
    for (const morphs of Object.values(resource.morphAttributes || {})) {
      for (const attribute of Array.isArray(morphs) ? morphs : [morphs]) addBufferAttributeUnit(units, attribute);
    }
    for (const field of ['index', 'instanceMatrix', 'instanceColor', 'indirect']) {
      addBufferAttributeUnit(units, resource[field]);
    }
    return { units: [...units].map(([identity, bytes]) => ({ identity, bytes })), known: true };
  }

  if (ArrayBuffer.isView(resource) || resource instanceof ArrayBuffer || isSharedArrayBuffer(resource)) {
    const identity = resource.buffer || resource;
    const bytes = byteLengthOf(resource);
    return bytes > 0 ? { units: [{ identity, bytes }], known: true } : { units: [], known: true };
  }
  // A deliberately unknown render resource is retained for lifetime safety but is not allowed to
  // contribute invented bytes to a budget. Its diagnostic is the explicit unaccounted receipt.
  return { units: [], known: false };
}

function assetUnaccountedResources(entry) {
  let count = 0;
  for (const resource of entry.resources) if (resource.unaccounted) count++;
  return count;
}

function isSharedArrayBuffer(value) {
  return typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer;
}

function byteLengthOf(value) {
  if (!value) return 0;
  const direct = Number(value.byteLength);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const buffer = value.buffer;
  const backing = Number(buffer && buffer.byteLength);
  return Number.isFinite(backing) && backing > 0 ? backing : 0;
}

function addUnit(units, identity, bytes) {
  if (!identity || !Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return;
  const prior = units.get(identity) || 0;
  units.set(identity, Math.max(prior, Number(bytes)));
}

function addTextureUnit(units, identity, bytes) {
  if (!identity || !Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return;
  units.set(identity, (units.get(identity) || 0) + Number(bytes));
}

function addBufferAttributeUnit(units, attribute) {
  if (!attribute) return;
  // WebGLAttributes caches ordinary BufferAttributes by attribute identity and uploads only the
  // view's range. Two distinct attributes may share one ArrayBuffer without sharing a GPU VBO.
  if (attribute.isInterleavedBufferAttribute === true || attribute.data?.isInterleavedBuffer === true) {
    const interleaved = attribute.data || attribute;
    const array = interleaved.array;
    if (array) addUnit(units, interleaved, byteLengthOf(array));
    return;
  }
  if (attribute.isInterleavedBuffer === true && attribute.array) {
    addUnit(units, attribute, byteLengthOf(attribute.array));
    return;
  }
  if (attribute.array) {
    addUnit(units, attribute, byteLengthOf(attribute.array));
    return;
  }
  if (attribute.buffer) {
    const bytes = byteLengthOf(attribute.buffer)
      || (Number(attribute.count) > 0 && Number(attribute.elementSize) > 0
        ? Number(attribute.count) * Number(attribute.elementSize)
        : 0);
    addUnit(units, attribute.buffer, bytes);
  }
}

const TYPE_BYTES = new Map([
  [THREE.UnsignedByteType, 1],
  [THREE.ByteType, 1],
  [THREE.UnsignedShortType, 2],
  [THREE.ShortType, 2],
  [THREE.UnsignedIntType, 4],
  [THREE.IntType, 4],
  [THREE.HalfFloatType, 2],
  [THREE.FloatType, 4],
  [THREE.UnsignedInt248Type, 4],
]);

const FORMAT_CHANNELS = new Map([
  [THREE.AlphaFormat, 1],
  [THREE.RedFormat, 1],
  [THREE.RGFormat, 2],
  [THREE.RGBFormat, 3],
  [THREE.RGBAFormat, 4],
  [THREE.RedIntegerFormat, 1],
  [THREE.RGIntegerFormat, 2],
  [THREE.RGBIntegerFormat, 3],
  [THREE.RGBAIntegerFormat, 4],
]);

const COMPRESSED_BLOCKS = new Map([
  [THREE.RGB_S3TC_DXT1_Format, [4, 4, 8]],
  [THREE.RGBA_S3TC_DXT1_Format, [4, 4, 8]],
  [THREE.RGBA_S3TC_DXT3_Format, [4, 4, 16]],
  [THREE.RGBA_S3TC_DXT5_Format, [4, 4, 16]],
  [THREE.RGB_ETC1_Format, [4, 4, 8]],
  [THREE.RGB_ETC2_Format, [4, 4, 8]],
  [THREE.RGBA_ETC2_EAC_Format, [4, 4, 16]],
  [THREE.RED_RGTC1_Format, [4, 4, 8]],
  [THREE.RED_GREEN_RGTC2_Format, [4, 4, 16]],
  [THREE.RGB_BPTC_SIGNED_Format, [4, 4, 16]],
  [THREE.RGB_BPTC_UNSIGNED_Format, [4, 4, 16]],
  [THREE.RGBA_BPTC_Format, [4, 4, 16]],
  [THREE.RGBA_PVRTC_4BPPV1_Format, [4, 4, 8]],
  [THREE.RGB_PVRTC_4BPPV1_Format, [4, 4, 8]],
  [THREE.RGBA_PVRTC_2BPPV1_Format, [8, 4, 8]],
  [THREE.RGB_PVRTC_2BPPV1_Format, [8, 4, 8]],
  [THREE.RGBA_ASTC_4x4_Format, [4, 4, 16]],
  [THREE.RGBA_ASTC_5x4_Format, [5, 4, 16]],
  [THREE.RGBA_ASTC_5x5_Format, [5, 5, 16]],
  [THREE.RGBA_ASTC_6x5_Format, [6, 5, 16]],
  [THREE.RGBA_ASTC_6x6_Format, [6, 6, 16]],
  [THREE.RGBA_ASTC_8x5_Format, [8, 5, 16]],
  [THREE.RGBA_ASTC_8x6_Format, [8, 6, 16]],
  [THREE.RGBA_ASTC_8x8_Format, [8, 8, 16]],
  [THREE.RGBA_ASTC_10x5_Format, [10, 5, 16]],
  [THREE.RGBA_ASTC_10x6_Format, [10, 6, 16]],
  [THREE.RGBA_ASTC_10x8_Format, [10, 8, 16]],
  [THREE.RGBA_ASTC_10x10_Format, [10, 10, 16]],
  [THREE.RGBA_ASTC_12x10_Format, [12, 10, 16]],
  [THREE.RGBA_ASTC_12x12_Format, [12, 12, 16]],
].filter(([format]) => format != null));

function textureFormatInfo(texture) {
  const rawFormat = texture && (texture.internalFormat ?? texture.format ?? texture.gpuFormat);
  const text = String(rawFormat == null ? '' : rawFormat).toLowerCase();
  if (/bc1|dxt1|etc1/.test(text)) return { compressed: true, blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 };
  if (/bc[2-7]|dxt[345]|etc2|eac|astc|pvrtc|rgtc/.test(text)) {
    if (/astc/.test(text)) {
      const match = text.match(/(\d+)x(\d+)/);
      return { compressed: true, blockWidth: match ? Number(match[1]) : 4, blockHeight: match ? Number(match[2]) : 4, bytesPerBlock: 16 };
    }
    if (/pvrtc.*2|2bpp/.test(text)) return { compressed: true, blockWidth: 8, blockHeight: 4, bytesPerBlock: 8 };
    return { compressed: true, blockWidth: 4, blockHeight: 4, bytesPerBlock: /bc1|dxt1|etc1/.test(text) ? 8 : 16 };
  }
  const numeric = Number(rawFormat);
  const compressed = COMPRESSED_BLOCKS.get(numeric);
  if (compressed) {
    return { compressed: true, blockWidth: compressed[0], blockHeight: compressed[1], bytesPerBlock: compressed[2] };
  }
  const channels = FORMAT_CHANNELS.get(numeric)
    ?? (typeof rawFormat === 'string' && /rgba/i.test(rawFormat) ? 4
      : typeof rawFormat === 'string' && /rgb/i.test(rawFormat) ? 3
        : typeof rawFormat === 'string' && /(^|[^a-z])rg([^a-z]|$)/i.test(rawFormat) ? 2
          : typeof rawFormat === 'string' && /red|alpha/i.test(rawFormat) ? 1 : null);
  if (numeric === THREE.DepthFormat) {
    const depthType = Number(texture && texture.type);
    return {
      compressed: false,
      bytesPerPixel: depthType === THREE.UnsignedShortType ? 2 : 4,
    };
  }
  if (numeric === THREE.DepthStencilFormat) {
    return {
      compressed: false,
      bytesPerPixel: Number(texture && texture.type) === THREE.FloatType ? 8 : 4,
    };
  }
  const typeBytes = Number(texture && texture.bytesPerChannel)
    || Number(texture && texture.bytesPerComponent)
    || TYPE_BYTES.get(Number(texture && texture.type))
    || (typeof texture?.type === 'string' && /float/i.test(texture.type) ? 4 : null)
    || (typeof texture?.type === 'string' && /half|short/i.test(texture.type) ? 2 : null)
    || (typeof texture?.type === 'string' ? 1 : null);
  if (channels && typeBytes) return { compressed: false, bytesPerPixel: channels * typeBytes };
  const explicitBytes = Number(texture && texture.bytesPerPixel);
  if (Number.isFinite(explicitBytes) && explicitBytes > 0) return { compressed: false, bytesPerPixel: explicitBytes };
  return null;
}

function textureLayerCount(texture, image) {
  if (Array.isArray(image)) return 1;
  const depth = Number(image && image.depth) || Number(texture && texture.depth) || Number(texture && texture.layers);
  if (texture?.isCubeTexture || texture?.isCubeRenderTarget) return 6;
  return depth > 0 ? Math.max(1, Math.floor(depth)) : 1;
}

function normalizeRenderTargetMultisampleLayout(value) {
  if (value === true) return 'direct';
  if (value === false) return 'resolve';
  if (typeof value !== 'string') return null;
  const token = value.trim().toLowerCase().replace(/[ _]+/g, '-');
  if ([
    'direct',
    'extension',
    'multisampled-texture',
    'multisampled-render-to-texture',
    'render-to-texture',
    'render-to-texture-msaa',
  ].includes(token)) return 'direct';
  if ([
    'resolve',
    'standard',
    'webgl2',
    'multisampled-renderbuffer',
    'renderbuffer',
    'renderbuffer-resolve',
  ].includes(token)) return 'resolve';
  return null;
}

function explicitRenderTargetMultisampleLayout(target, options = {}) {
  const userData = target && target.userData && typeof target.userData === 'object'
    ? target.userData
    : {};
  const residency = userData.spacefaceRenderTargetResidency
    && typeof userData.spacefaceRenderTargetResidency === 'object'
    ? userData.spacefaceRenderTargetResidency
    : {};
  const gpuResidency = userData.gpuResidency
    && typeof userData.gpuResidency === 'object'
    ? userData.gpuResidency
    : {};
  const candidates = [
    [options.renderTargetMultisampleLayout, options.renderTargetMultisampleLayout !== undefined],
    [options.renderTargetLayout, options.renderTargetLayout !== undefined],
    [options.multisampleLayout, options.multisampleLayout !== undefined],
    [residency.multisampleLayout, residency.multisampleLayout !== undefined],
    [residency.layout, residency.layout !== undefined],
    [residency.mode, residency.mode !== undefined],
    [residency.useRenderToTexture, residency.useRenderToTexture !== undefined],
    [gpuResidency.multisampleLayout, gpuResidency.multisampleLayout !== undefined],
    [userData.spacefaceMultisampleLayout, userData.spacefaceMultisampleLayout !== undefined],
    [userData.renderTargetMultisampleLayout, userData.renderTargetMultisampleLayout !== undefined],
    [userData.useRenderToTexture, userData.useRenderToTexture !== undefined],
    [target && target.renderTargetMultisampleLayout, target?.renderTargetMultisampleLayout !== undefined],
    [target && target.multisampleLayout, target?.multisampleLayout !== undefined],
    [target && target.__useRenderToTexture, target?.__useRenderToTexture !== undefined],
  ];
  for (const [value, present] of candidates) {
    if (present) return { present: true, layout: normalizeRenderTargetMultisampleLayout(value) };
  }
  return { present: false, layout: null };
}

function rendererRenderTargetMultisampleLayout(target, options = {}) {
  const renderer = options.renderer;
  if (!renderer || typeof renderer !== 'object') return null;

  // Three stores the final per-target decision here after setupRenderTarget. This takes priority
  // over the extension probe because external framebuffers/depth textures can force the standard
  // resolve path even when WEBGL_multisampled_render_to_texture exists.
  const properties = renderer.properties;
  if (properties && typeof properties.get === 'function' && target) {
    try {
      const renderTargetProperties = properties.get(target);
      if (renderTargetProperties && typeof renderTargetProperties.__useRenderToTexture === 'boolean') {
        return renderTargetProperties.__useRenderToTexture ? 'direct' : 'resolve';
      }
    } catch (_) {
      // A lightweight renderer adapter may expose properties without supporting this target.
    }
  }

  const capabilityLayout = renderer.renderTargetCapabilities?.multisampleLayout
    ?? renderer.capabilities?.renderTargetMultisampleLayout
    ?? renderer.capabilities?.multisampleLayout
    ?? renderer.capabilities?.multisampleRenderToTexture;
  if (capabilityLayout !== undefined) {
    return normalizeRenderTargetMultisampleLayout(capabilityLayout);
  }

  try {
    if (renderer.extensions && typeof renderer.extensions.has === 'function') {
      const hasDirectExtension = renderer.extensions.has('WEBGL_multisampled_render_to_texture');
      if (hasDirectExtension === true) return 'direct';
      if (hasDirectExtension === false && renderer.capabilities?.isWebGL2 === true) return 'resolve';
    }
  } catch (_) {
    // Unknown backend capability is intentionally not converted into a guessed layout.
  }
  return renderer.capabilities?.isWebGL2 === true ? 'resolve' : null;
}

function renderTargetMultisampleLayout(target, options = {}) {
  const explicit = explicitRenderTargetMultisampleLayout(target, options);
  if (explicit.present) return explicit.layout;
  return rendererRenderTargetMultisampleLayout(target, options);
}

function renderTargetSampleCount(target, options = {}) {
  const userData = target && target.userData && typeof target.userData === 'object'
    ? target.userData
    : {};
  const residency = userData.spacefaceRenderTargetResidency
    && typeof userData.spacefaceRenderTargetResidency === 'object'
    ? userData.spacefaceRenderTargetResidency
    : {};
  const requested = Number(
    options.renderTargetSampleCount
      ?? residency.sampleCount
      ?? userData.renderTargetSampleCount
      ?? target?.renderTargetSampleCount
      ?? target?.sampleCount
      ?? target?.samples,
  );
  if (!Number.isFinite(requested) || requested <= 0) return 1;
  const maxSamples = Number(options.renderer?.capabilities?.maxSamples);
  if (Number.isFinite(maxSamples) && maxSamples > 0) {
    return Math.max(1, Math.min(Math.floor(requested), Math.floor(maxSamples)));
  }
  return Math.max(1, Math.floor(requested));
}

function textureSampleCount(texture, options = {}) {
  const targetSamples = Number(texture && texture.renderTarget && texture.renderTarget.samples);
  const ownSamples = Number(texture && texture.samples);
  return Math.max(1, Number.isFinite(targetSamples) && targetSamples > 0 ? targetSamples : 1,
    Number.isFinite(ownSamples) && ownSamples > 0 ? ownSamples : 1);
}

function mipDimensions(texture, mip, baseImage) {
  const width = Number(mip && (mip.width ?? mip.image?.width)) || Number(baseImage && baseImage.width) || Number(texture && texture.width);
  const height = Number(mip && (mip.height ?? mip.image?.height)) || Number(baseImage && baseImage.height) || Number(texture && texture.height);
  return { width: Math.max(0, Math.floor(width)), height: Math.max(0, Math.floor(height)) };
}

function levelBytes(width, height, formatInfo) {
  if (!formatInfo || width <= 0 || height <= 0) return 0;
  if (formatInfo.compressed) {
    return Math.ceil(width / formatInfo.blockWidth)
      * Math.ceil(height / formatInfo.blockHeight)
      * formatInfo.bytesPerBlock;
  }
  return width * height * formatInfo.bytesPerPixel;
}

function generatedMipBytes(width, height, formatInfo) {
  let total = 0;
  let currentWidth = width;
  let currentHeight = height;
  while (currentWidth > 0 && currentHeight > 0) {
    total += levelBytes(currentWidth, currentHeight, formatInfo);
    if (currentWidth === 1 && currentHeight === 1) break;
    currentWidth = Math.max(1, Math.floor(currentWidth / 2));
    currentHeight = Math.max(1, Math.floor(currentHeight / 2));
  }
  return total;
}

function payloadBytes(payload) {
  if (!payload) return 0;
  if (ArrayBuffer.isView(payload) || payload instanceof ArrayBuffer || isSharedArrayBuffer(payload)) {
    return byteLengthOf(payload);
  }
  return byteLengthOf(payload.data) || byteLengthOf(payload.image);
}

function payloadIdentity(payload, fallback) {
  if (payload && payload.data && (ArrayBuffer.isView(payload.data) || payload.data instanceof ArrayBuffer)) {
    return payload.data.buffer || payload.data;
  }
  if (ArrayBuffer.isView(payload) || payload instanceof ArrayBuffer) return payload.buffer || payload;
  return payload || fallback;
}

function renderTargetAttachmentIdentity(target, kind, index = 0) {
  if (!target || typeof target !== 'object') return { target, kind, index };
  let identities = renderTargetAttachmentIdentities.get(target);
  if (!identities) {
    identities = new Map();
    renderTargetAttachmentIdentities.set(target, identities);
  }
  const key = `${kind}:${index}`;
  let identity = identities.get(key);
  if (!identity) {
    identity = { target, kind, index };
    identities.set(key, identity);
  }
  return identity;
}

function textureBytesFromUnits(units) {
  let bytes = 0;
  for (const value of units.values()) bytes += Number(value) || 0;
  return bytes;
}

function finalizeTextureAccounting(texture, units, known, options = {}) {
  const baseBytes = textureBytesFromUnits(units);
  if (baseBytes <= 0) return { units: [], known };
  const result = [{ identity: texture, bytes: baseBytes }];
  const target = texture && texture.renderTarget;
  const targetSamples = target && target.isRenderTarget === true
    ? renderTargetSampleCount(target, options)
    : 1;
  const includeTargetMultisample = options.includeTargetMultisample !== false;
  if (target && target.isRenderTarget === true && targetSamples > 1) {
    const layout = renderTargetMultisampleLayout(target, options);
    if (!layout) return { units: [], known: false };
    if (layout === 'direct') return { units: result, known };
  }
  if (includeTargetMultisample && target && target.isRenderTarget === true && targetSamples > 1) {
    const index = Array.isArray(target.textures) ? target.textures.indexOf(texture) : 0;
    result.push({
      identity: renderTargetAttachmentIdentity(target, 'color-msaa', Math.max(0, index)),
      bytes: baseBytes * targetSamples,
    });
  }
  return { units: result, known };
}

function textureMemoryAccounting(texture, seen = new Set(), options = {}) {
  if (seen.has(texture)) return { units: [], known: true };
  seen.add(texture);
  const units = new Map();
  const image = texture.image ?? texture.source?.data;
  const formatInfo = textureFormatInfo(texture);
  const layers = textureLayerCount(texture, image);
  const target = texture && texture.renderTarget;
  const targetSamples = target && target.isRenderTarget === true
    ? renderTargetSampleCount(target, options)
    : 1;
  const targetLayout = target && target.isRenderTarget === true && targetSamples > 1
    ? renderTargetMultisampleLayout(target, options)
    : null;
  const samples = options.sampleCount != null
    ? Math.max(1, Number(options.sampleCount) || 1)
    : target && target.isRenderTarget === true && targetSamples > 1
      ? targetLayout === 'direct' ? targetSamples : 1
      : textureSampleCount(texture);
  let known = !!formatInfo;
  if (target && target.isRenderTarget === true && targetSamples > 1 && !targetLayout) known = false;
  if (texture.generateMipmaps === true && !formatInfo && (!Array.isArray(texture.mipmaps) || texture.mipmaps.length === 0)) {
    // The base payload may be known while the driver-generated lower levels are not.
    known = false;
  }

  // CompressedCubeTexture stores one CompressedTexture per face. Recurse so each face's exact
  // payload is counted, while shared payload backing stores still dedupe by identity.
  if (Array.isArray(image)) {
    known = image.length > 0;
    for (const face of image) {
      if (face && face.isTexture === true) {
        const nested = textureMemoryAccounting(face, seen, options);
        known = known && nested.known;
        for (const unit of nested.units) addTextureUnit(units, unit.identity, unit.bytes * samples);
      } else {
        const faceBytes = imageBytes(texture, face, formatInfo, 1);
        known = known && faceBytes.known;
        let bytes = faceBytes.bytes;
        if (texture.generateMipmaps === true && !formatInfo?.compressed) {
          const dimensions = mipDimensions(texture, null, face);
          const generated = generatedMipBytes(dimensions.width, dimensions.height, formatInfo);
          if (generated > 0) bytes = generated;
        }
        if (bytes > 0) addTextureUnit(units, faceBytes.identity || face, bytes * samples);
      }
    }
    return finalizeTextureAccounting(texture, units, known, options);
  }

  const mipmaps = Array.isArray(texture.mipmaps) ? texture.mipmaps : [];
  if (mipmaps.length > 0) {
    for (const mip of mipmaps) {
      const raw = payloadBytes(mip && (mip.data ?? mip.image ?? mip));
      const dimensions = mipDimensions(texture, mip, image);
      if (raw > 0) {
        // A compressed payload's byteLength is authoritative even when a driver-specific format
        // enum is unavailable to this layer.
        known = true;
        const singleLayer = levelBytes(dimensions.width, dimensions.height, formatInfo);
        const layerMultiplier = layers > 1 && singleLayer > 0 && raw < singleLayer * layers ? layers : 1;
        addTextureUnit(units, payloadIdentity(mip, texture), raw * layerMultiplier * samples);
      } else {
        const bytes = levelBytes(dimensions.width, dimensions.height, formatInfo);
        if (bytes > 0) addTextureUnit(units, mip || texture, bytes * layers * samples);
        else known = false;
      }
    }
  } else {
    const base = imageBytes(texture, image, formatInfo, layers);
    known = base.known;
    if (base.bytes > 0) addTextureUnit(units, base.identity || image || texture, base.bytes * samples);
    if (texture.generateMipmaps === true && base.bytes > 0 && !formatInfo?.compressed) {
      const dimensions = mipDimensions(texture, null, image);
      const total = generatedMipBytes(dimensions.width, dimensions.height, formatInfo);
      const baseLevel = levelBytes(dimensions.width, dimensions.height, formatInfo) * layers;
      if (total > baseLevel) addTextureUnit(units, texture, (total - baseLevel) * samples);
    }
  }

  return finalizeTextureAccounting(texture, units, known, options);
}

function imageBytes(texture, image, formatInfo, layers = 1) {
  if (!image || typeof image !== 'object') return { bytes: 0, known: false, identity: null };
  const data = image.data;
  const raw = byteLengthOf(data);
  const dimensions = mipDimensions(texture, null, image);
  if (raw > 0) {
    const oneLayer = levelBytes(dimensions.width, dimensions.height, formatInfo);
    const payload = layers > 1 && oneLayer > 0 && raw < oneLayer * layers ? raw * layers : raw;
    return { bytes: payload, known: true, identity: data.buffer || data };
  }
  const bytes = levelBytes(dimensions.width, dimensions.height, formatInfo);
  return { bytes: bytes * layers, known: bytes > 0, identity: image };
}

function renderTargetMemoryAccounting(target, options = {}) {
  const units = new Map();
  let known = true;
  const attachments = Array.isArray(target.textures)
    ? target.textures
    : target.texture ? [target.texture] : [];
  if (attachments.length === 0 && target.colorBuffer !== false) known = false;
  const samples = renderTargetSampleCount(target, options);
  const layout = samples > 1 ? renderTargetMultisampleLayout(target, options) : 'single-sample';
  if (samples > 1 && !layout) {
    // A requested MSAA target with no backend decision is not safe to budget. Three may have a
    // direct multisampled texture or a renderbuffer plus resolve texture; returning neither layout
    // as fact keeps the diagnostic honest and makes the governor fail closed.
    return { units: [], known: false };
  }
  for (let index = 0; index < attachments.length; index++) {
    const texture = attachments[index];
    const sampleCount = layout === 'direct' ? samples : 1;
    const accounting = textureMemoryAccounting(texture, new Set(), {
      ...options,
      sampleCount,
      renderTargetMultisampleLayout: layout === 'single-sample' ? undefined : layout,
      includeTargetMultisample: false,
    });
    known = known && accounting.known;
    let colorBytes = 0;
    for (const unit of accounting.units) {
      addUnit(units, unit.identity, unit.bytes);
      colorBytes += unit.bytes;
    }
    if (layout === 'resolve' && colorBytes > 0) {
      addUnit(
        units,
        renderTargetAttachmentIdentity(target, 'color-msaa', index),
        colorBytes * samples,
      );
    }
  }
  if (target.depthTexture) {
    const sampleCount = layout === 'direct' ? samples : 1;
    const depth = textureMemoryAccounting(target.depthTexture, new Set(), {
      ...options,
      sampleCount,
      renderTargetMultisampleLayout: layout === 'single-sample' ? undefined : layout,
      includeTargetMultisample: false,
    });
    known = known && depth.known;
    let depthBytes = 0;
    for (const unit of depth.units) {
      addUnit(units, unit.identity, unit.bytes);
      depthBytes += unit.bytes;
    }
    if (layout === 'resolve' && depthBytes > 0) {
      addUnit(units, renderTargetAttachmentIdentity(target, 'depth-msaa'), depthBytes * samples);
    }
  } else if (target.depthBuffer === true || target.stencilBuffer === true) {
    // Three's implicit depth/stencil renderbuffer format is deterministic from these options:
    // DEPTH24 (4 bytes) or DEPTH24_STENCIL8 (4 bytes) per pixel, with a second MSAA attachment
    // when samples are enabled. Cube targets allocate one depth attachment per face.
    const width = Math.max(0, Number(target.width) || 0);
    const height = Math.max(0, Number(target.height) || 0);
    const faces = target.isWebGLCubeRenderTarget === true ? 6 : 1;
    const bytesPerPixel = target.stencilBuffer === true
      ? 4
      : Number(target.depthType) === THREE.UnsignedShortType ? 2 : 4;
    const depthBytes = width * height * faces * bytesPerPixel;
    if (depthBytes > 0) {
      if (layout === 'direct') {
        addUnit(units, renderTargetAttachmentIdentity(target, 'depth-msaa'), depthBytes * samples);
      } else {
        addUnit(units, renderTargetAttachmentIdentity(target, 'depth-resolve'), depthBytes);
      }
      if (layout === 'resolve') {
        addUnit(units, renderTargetAttachmentIdentity(target, 'depth-msaa'), depthBytes * samples);
      }
    } else {
      known = false;
    }
  }
  const explicit = explicitGpuBytes(target);
  if (explicit != null && units.size === 0) return { units: explicit > 0 ? [{ identity: target, bytes: explicit }] : [], known: true };
  return { units: [...units].map(([identity, bytes]) => ({ identity, bytes })), known };
}

export function estimateGpuResourceBytes(resource, options = {}) {
  const accounting = resourceMemoryAccounting(resource, options);
  let bytes = 0;
  for (const unit of accounting.units) bytes += unit.bytes;
  return Object.freeze({
    gpuResidentBytes: bytes,
    unaccounted: !accounting.known,
    units: Object.freeze(accounting.units.map((unit) => Object.freeze({ bytes: unit.bytes }))),
  });
}
