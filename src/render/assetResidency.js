// Ref-counted ownership for decoded authored GPU resources.
//
// This is presentation-only state. It never reads or mutates simulation authority: callers attach
// renderer/scene boundary owners and sector labels solely so decoded Three.js resources can be
// reclaimed without lowering visual quality or racing an in-flight GLB decode.

import {
  createResourceGovernor,
  governorEntryBlockReasons,
  isGovernorEntryEvictable,
  isGovernorOwnerEvictable,
} from './resourceGovernor.js';
import * as THREE from 'three';

const PROTECTED_RESOURCE = Symbol('spaceface.protectedGpuResource');
const registriesByRenderer = new WeakMap();
const renderTargetAttachmentIdentities = new WeakMap();
const DEFAULT_EVENT_HISTORY = 256;
const MAX_EVENT_HISTORY = 512;

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
  const owners = new Map();
  const releasedObjectOwners = new WeakSet();
  const releasedPrimitiveOwners = new Set();
  const pendingRequests = new Set();
  const events = [];
  let eventSequence = 0;
  let assetGeneration = 0;
  let contextGeneration = 0;
  let contextLost = false;
  let currentSectorId = null;
  let warmSectorId = null;
  let warmOwner = null;
  let disposedResources = 0;
  let abandonedResources = 0;
  let evictedAssets = 0;
  const governor = createResourceGovernor({
    maxCpuBytes: options.maxCpuBytes,
    maxGpuBytes: options.maxGpuBytes,
  });

  function emit(type, detail = {}) {
    const event = Object.freeze({ sequence: ++eventSequence, type, atMs: now(), ...detail });
    events.push(event);
    if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
    if (typeof options.onEvent === 'function') options.onEvent(event);
    return event;
  }

  function ownerState(owner, create = true) {
    if (owner == null) return null;
    if (isOwnerReleased(owner)) return null;
    let state = owners.get(owner);
    if (!state && create) {
      state = { owner, assets: new Set(), requests: new Set(), released: false, removalOff: null };
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
      // Encoded package bytes are a CPU/cache concern. They are deliberately kept separate from
      // GPU residency: a compressed .glb on disk is not a valid estimate for decoded buffers or
      // driver texture allocations.
      cpuPackageBytes: normalizeNonNegativeBytes(registration.cpuPackageBytes),
      metadata: { ...(registration.metadata || {}) },
      handle: null,
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
          }
          memory.resources.add(resourceEntry);
          resourceEntry.memoryUnits.add(memory);
          resourceEntry.bytes += memory.bytes;
        }
        resources.set(resource, resourceEntry);
      }
      resourceEntry.assets.add(entry);
      entry.resources.add(resourceEntry);
    }
    entry.handle = Object.freeze({ key: exactKey, generation: entry.generation });
    assets.set(exactKey, entry);
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
    if (!state || state.released || entry.owners.has(owner)) return false;
    const ownerMetadata = { ...metadata };
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
    state.assets.add(entry);
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
    return true;
  }

  function handoffWarmOwnerWhenCovered(candidateOwner) {
    const owner = warmOwner;
    if (!owner || candidateOwner === owner) return false;
    const state = owners.get(owner);
    if (!state || state.released || state.assets.size === 0) return false;
    for (const entry of state.assets) {
      if (![...entry.owners.keys()].some((candidate) => candidate !== owner)) return false;
    }
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
        request.active = false;
        finishRequest(request, reason);
        evictIfUnowned(assets.get(exactKey), reason);
      },
    };
    pendingRequests.add(request);
    if (state) state.requests.add(request);
    emit('request-begun', { key: exactKey, role: metadata.role || null });
    return request;
  }

  function finishRequest(request, status) {
    if (!pendingRequests.has(request)) return;
    request.active = false;
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

  function releaseOwner(owner, reason = 'released') {
    const state = owners.get(owner);
    markOwnerReleased(owner);
    if (!state) return 0;
    state.released = true;
    for (const request of [...state.requests]) request.cancel(reason);
    let released = 0;
    for (const entry of [...state.assets]) {
      if (!entry.owners.delete(owner)) continue;
      state.assets.delete(entry);
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
    return released;
  }

  function handoffOwnerWhenCovered(owner, reason = 'owner-handed-off') {
    const state = owners.get(owner);
    if (!state || state.released || state.assets.size === 0) return false;
    for (const entry of state.assets) {
      if (![...entry.owners.keys()].some((candidate) => candidate !== owner)) return false;
    }
    releaseOwner(owner, reason);
    return true;
  }

  function release(key, owner, reason = 'released') {
    const entry = assets.get(String(key || ''));
    const state = owners.get(owner);
    if (!entry || !state || !entry.owners.delete(owner)) return false;
    state.assets.delete(entry);
    entry.lastReleaseAtMs = now();
    emit('asset-released', {
      key: entry.key,
      generation: entry.generation,
      refCount: entry.owners.size,
      reason,
    });
    evictIfUnowned(entry, reason);
    cleanupOwnerState(state);
    return true;
  }

  function cleanupOwnerState(state) {
    if (!state || state.assets.size || state.requests.size) return;
    if (state.removalOff) state.removalOff();
    owners.delete(state.owner);
  }

  function hasActiveRequestForEntry(entry) {
    if (!entry) return false;
    for (const request of pendingRequests) {
      if (request.active && request.key === entry.key) return true;
    }
    return false;
  }

  function isRenderPackageCacheOwner(metadata) {
    return String(metadata && metadata.role || '').trim().toLowerCase() === 'render-package-cache';
  }

  /**
   * Release decoded render-package cache owners that no longer have a presentation owner.
   *
   * The package loader keeps one cache owner so content-addressed packages can be reused while a
   * live boundary, warm sector, or preview retains them. That owner is intentionally not part of
   * the ordinary byte-pressure eviction policy: an entry with both a cache owner and a presentation
   * owner is a mixed lifetime and must stay pinned. Once the cache owner is the *only* owner, however,
   * retaining it makes every traversed package permanent even when the total heap is below the global
   * governor budget. This explicit boundary cleanup is the release point for that soft cache lease.
   */
  function releaseUnreferencedCacheOwners(reason = 'cache-only-residency-cleanup') {
    const before = diagnostics({ includeEvents: false });
    const evicted = [];
    let releasedOwners = 0;

    for (const entry of [...assets.values()]) {
      if (entry.state !== 'resident' || hasActiveRequestForEntry(entry)) continue;
      const ownerRecords = [...entry.owners.entries()];
      const cacheOwners = ownerRecords.filter(([, metadata]) => isRenderPackageCacheOwner(metadata));
      if (cacheOwners.length === 0 || cacheOwners.length !== ownerRecords.length) continue;

      for (const [owner] of cacheOwners) {
        if (release(entry.key, owner, reason)) releasedOwners++;
      }
      if (!assets.has(entry.key)) evicted.push(entry.key);
    }

    const after = diagnostics({ includeEvents: false });
    return Object.freeze({
      reason,
      evicted: Object.freeze(evicted),
      releasedOwners,
      evictedBytes: Math.max(0, Number(before.gpuResidentBytes) - Number(after.gpuResidentBytes)),
      remainingBytes: after.gpuResidentBytes,
    });
  }

  function evictIfUnowned(entry, reason) {
    if (!entry || entry.state !== 'resident' || entry.owners.size > 0) return false;
    for (const request of pendingRequests) {
      if (request.active && request.key === entry.key) return false;
    }
    entry.state = 'evicted';
    assets.delete(entry.key);
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
    for (const memory of entry.memoryUnits || []) {
      memory.resources.delete(entry);
      if (memory.resources.size === 0) memoryUnits.delete(memory.identity);
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
    if (exactNext === currentSectorId) return false;
    if (warmOwner && warmSectorId === currentSectorId) {
      currentSectorId = exactNext;
      emit('sector-rotated', { currentSectorId, warmSectorId });
      return true;
    }
    if (warmOwner) releaseOwner(warmOwner, 'warm-sector-expired');
    warmOwner = null;
    warmSectorId = null;
    const previousSectorId = currentSectorId;
    if (previousSectorId != null) {
      const owner = Object.freeze({ type: 'asset-warm-sector', sectorId: previousSectorId, generation: assetGeneration });
      let retained = 0;
      for (const entry of assets.values()) {
        let belongsToPrevious = false;
        for (const metadata of entry.owners.values()) {
          if (String(metadata && metadata.sectorId || '') !== previousSectorId) continue;
          if (metadata && metadata.role === 'player') continue;
          belongsToPrevious = true;
          break;
        }
        if (belongsToPrevious && retain(entry.key, owner, {
          role: 'warm-previous-sector',
          sectorId: previousSectorId,
        })) retained++;
      }
      if (retained > 0) {
        warmOwner = owner;
        warmSectorId = previousSectorId;
      }
    }
    currentSectorId = exactNext;
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
    for (const entry of assets.values()) {
      let belongs = false;
      for (const metadata of entry.owners.values()) {
        if (String(metadata && metadata.sectorId || '') !== exactSectorId) continue;
        if (!includePlayer && metadata && metadata.role === 'player') continue;
        belongs = true;
        break;
      }
      if (belongs && retain(entry.key, owner, { role: warmRole, sectorId: exactSectorId })) retained++;
    }
    warmOwner = retained > 0 ? owner : null;
    warmSectorId = retained > 0 ? exactSectorId : null;
    emit('sector-exit-warmed', { sectorId: exactSectorId, retained });
    return retained;
  }

  function handleContextLost() {
    if (contextLost) return false;
    contextLost = true;
    emit('context-lost', { contextGeneration });
    return true;
  }

  function handleContextRestored() {
    if (!contextLost) return false;
    contextLost = false;
    contextGeneration++;
    emit('context-restored', { contextGeneration });
    return true;
  }

  function disposeAll(reason = 'registry-disposed', disposeResources = true) {
    const wasContextLost = contextLost;
    if (!disposeResources) contextLost = true;
    for (const request of [...pendingRequests]) request.cancel(reason);
    for (const owner of [...owners.keys()]) releaseOwner(owner, reason);
    for (const entry of [...assets.values()]) evictIfUnowned(entry, reason);
    contextLost = wasContextLost;
  }

  function diagnostics(diagnosticOptions = {}) {
    const canonical = diagnosticOptions.canonical === true;
    const includeEvents = diagnosticOptions.includeEvents !== false && !canonical;
    const assetRows = [...assets.values()].map((entry) => {
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
        roles: [...new Set([...entry.owners.values()].map((metadata) => metadata && metadata.role).filter(Boolean))].sort(),
        presentationTiers: [...new Set([...entry.owners.values()]
          .map((metadata) => metadata && metadata.presentationTier).filter(Boolean))].sort(),
        sectors: [...new Set([...entry.owners.values()].map((metadata) => metadata && metadata.sectorId).filter(Boolean).map(String))].sort(),
      };
      if (!canonical) row.generation = entry.generation;
      return Object.freeze(row);
    }).sort((a, b) => a.key.localeCompare(b.key));
    let gpuResidentBytes = 0;
    for (const unit of memoryUnits.values()) gpuResidentBytes += unit.bytes;
    let cpuPackageBytes = 0;
    for (const entry of assets.values()) cpuPackageBytes += entry.cpuPackageBytes;
    let unaccountedResources = 0;
    for (const entry of resources.values()) if (entry.unaccounted) unaccountedResources++;
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
      pendingRequests: pendingRequests.size,
      disposedResources,
      abandonedResources,
      evictedAssets,
      currentSectorId,
      warmSectorId,
      contextLost,
      contextGeneration,
      assets: Object.freeze(assetRows),
      eventHistorySize: events.length,
      events: Object.freeze(includeEvents ? events.slice() : []),
    });
  }

  function canonicalDiagnostics() {
    return diagnostics({ canonical: true, includeEvents: false });
  }

  function has(key) {
    const entry = assets.get(String(key || ''));
    return !!entry && entry.state === 'resident';
  }

  function governorEntry(entry, kind = 'gpu') {
    const activeRequest = [...pendingRequests].some((request) => (
      request.active && request.key === entry.key
    ));
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
    return {
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
    };
  }

  function blockedBreakdown(entries) {
    const kind = entries[0]?.kind === 'cpu' ? 'cpu' : 'gpu';
    const unitsByReason = new Map();
    for (const entry of entries) {
      if (isGovernorEntryEvictable(entry)) continue;
      const reasons = governorEntryBlockReasons(entry);
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
    const before = diagnostics({ includeEvents: false });
    const entries = [...assets.values()].map((entry) => governorEntry(entry, kind));
    const initialResidentBytes = kind === 'cpu' ? before.cpuPackageBytes : before.gpuResidentBytes;
    const plan = governor.plan(entries, kind, { initialResidentBytes });
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
      for (const owner of [...entry.owners.keys()]) release(entry.key, owner, 'governor-budget');
      evictIfUnowned(entry, 'governor-budget');
      if (!assets.has(String(key))) evicted.push(key);
    }
    const afterEntries = [...assets.values()].map((entry) => governorEntry(entry, kind));
    const after = diagnostics({ includeEvents: false });
    const beforeBytes = Number(kind === 'cpu' ? before.cpuPackageBytes : before.gpuResidentBytes) || 0;
    const remainingBytes = Number(kind === 'cpu' ? after.cpuPackageBytes : after.gpuResidentBytes) || 0;
    const evictedBytes = Math.max(0, beforeBytes - remainingBytes);
    const blocked = blockedBreakdown(afterEntries);
    const budgetBytes = Number(plan.budgetBytes);
    const gpuAccountingAuthoritative = kind !== 'gpu' || after.unaccountedResources === 0;
    const indeterminate = !gpuAccountingAuthoritative;
    const budgetSatisfied = indeterminate
      ? false
      : Number.isFinite(budgetBytes) ? remainingBytes <= budgetBytes : true;
    return Object.freeze({
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
  }

  return Object.freeze({
    registerAsset,
    retain,
    beginRequest,
    release,
    releaseOwner,
    releaseUnreferencedCacheOwners,
    handoffOwnerWhenCovered,
    isOwnerReleased,
    rotateSector,
    prepareSectorExit,
    handleContextLost,
    handleContextRestored,
    disposeAll,
    has,
    enforceBudget,
    diagnostics,
    canonicalDiagnostics,
  });
}

export function applySectorExitResidency(residency, sectorId, options = {}) {
  if (!residency) return null;
  if (typeof residency.prepareSectorExit === 'function') {
    residency.prepareSectorExit(sectorId, options);
  }
  const cacheCleanup = typeof residency.releaseUnreferencedCacheOwners === 'function'
    ? residency.releaseUnreferencedCacheOwners(options.cacheCleanupReason || 'sector-exit-cache-only')
    : null;
  // World emits sector:exit before the caller releases its preview/instance owner. Queue one
  // post-dispatch pass so that just-departed cache-only packages are reclaimed at the same boundary
  // without making arbitrary owner release tear down a reusable package mid-frame.
  if (typeof residency.releaseUnreferencedCacheOwners === 'function'
    && typeof globalThis.queueMicrotask === 'function') {
    globalThis.queueMicrotask(() => {
      residency.releaseUnreferencedCacheOwners(
        options.cacheCleanupReason ? `${options.cacheCleanupReason}:post-dispatch` : 'sector-exit-cache-only:post-dispatch',
      );
    });
  }
  if (typeof residency.enforceBudget === 'function') {
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
