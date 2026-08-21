// Ref-counted ownership for decoded authored GPU resources.
//
// This is presentation-only state. It never reads or mutates simulation authority: callers attach
// renderer/scene boundary owners and sector labels solely so decoded Three.js resources can be
// reclaimed without lowering visual quality or racing an in-flight GLB decode.

import { createResourceGovernor } from './resourceGovernor.js';

const PROTECTED_RESOURCE = Symbol('spaceface.protectedGpuResource');
const registriesByRenderer = new WeakMap();
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
      metadata: { ...(registration.metadata || {}) },
      handle: null,
    };
    const fallbackBytes = list.length > 0 && Number.isFinite(Number(registration.byteSize))
      ? Math.max(0, Number(registration.byteSize)) / list.length
      : 0;
    for (const resource of list) {
      protectSharedGpuResource(resource);
      let resourceEntry = resources.get(resource);
      if (!resourceEntry) {
        const units = resourceMemoryUnits(resource, fallbackBytes);
        resourceEntry = {
          resource,
          assets: new Set(),
          memoryUnits: new Set(),
          bytes: 0,
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
    });
    return entry.handle;
  }

  function retain(key, owner, metadata = {}) {
    const entry = assets.get(String(key || ''));
    if (!entry || entry.state !== 'resident' || owner == null) return false;
    const state = ownerState(owner);
    if (!state || state.released || entry.owners.has(owner)) return false;
    const ownerMetadata = { ...metadata };
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
      const row = {
      key: entry.key,
      refCount: entry.owners.size,
      resourceCount: entry.resources.size,
      bytes: assetResidentBytes(entry),
        roles: [...new Set([...entry.owners.values()].map((metadata) => metadata && metadata.role).filter(Boolean))].sort(),
        sectors: [...new Set([...entry.owners.values()].map((metadata) => metadata && metadata.sectorId).filter(Boolean).map(String))].sort(),
      };
      if (!canonical) row.generation = entry.generation;
      return Object.freeze(row);
    }).sort((a, b) => a.key.localeCompare(b.key));
    let residentBytes = 0;
    for (const unit of memoryUnits.values()) residentBytes += unit.bytes;
    return Object.freeze({
      schema: 'spaceface.assetResidency.v1',
      residentAssets: assets.size,
      residentResources: resources.size,
      residentBytes,
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

  function enforceBudget(kind = 'gpu') {
    const snap = diagnostics({ includeEvents: false });
    const entries = (snap.assets || []).map((row) => ({
      key: row.key,
      bytes: row.bytes,
      roles: row.roles,
    }));
    const plan = governor.plan(entries, kind);
    const evicted = [];
    for (const key of plan.evict) {
      const entry = assets.get(String(key || ''));
      if (!entry) continue;
      for (const [owner, metadata] of [...entry.owners]) {
        const role = metadata && metadata.role;
        if (role === 'warm-previous-sector' || role === 'unused') {
          release(entry.key, owner, 'governor-budget');
        }
      }
      evictIfUnowned(entry, 'governor-budget');
      if (!assets.has(String(key))) evicted.push(key);
    }
    return Object.freeze({ ...plan, evicted: Object.freeze(evicted) });
  }

  return Object.freeze({
    registerAsset,
    retain,
    beginRequest,
    release,
    releaseOwner,
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
  if (typeof residency.enforceBudget === 'function') {
    return residency.enforceBudget(options.kind || 'gpu');
  }
  return null;
}

export function getAssetResidency(renderer, options = {}) {
  if (!renderer || (typeof renderer !== 'object' && typeof renderer !== 'function')) return null;
  let registry = registriesByRenderer.get(renderer);
  if (!registry) {
    registry = createAssetResidencyRegistry(options);
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

function resourceMemoryUnits(resource, fallback = 0) {
  const units = new Map();
  const add = (identity, bytes) => {
    if (!identity || !Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return;
    const prior = units.get(identity) || 0;
    units.set(identity, Math.max(prior, Number(bytes)));
  };
  if (Number.isFinite(Number(resource && resource.byteSize))) {
    add(resource, Math.max(0, Number(resource.byteSize)));
    return [...units].map(([identity, bytes]) => ({ identity, bytes }));
  }
  const attributes = resource && resource.attributes;
  if (attributes && typeof attributes === 'object') {
    for (const attribute of Object.values(attributes)) addTypedArrayUnit(units, attribute && attribute.array);
  }
  addTypedArrayUnit(units, resource && resource.index && resource.index.array);
  const image = resource && (resource.image || resource.source && resource.source.data);
  const width = Number(image && image.width);
  const height = Number(image && image.height);
  if (image && image.data && ArrayBuffer.isView(image.data)) addTypedArrayUnit(units, image.data);
  else if (width > 0 && height > 0) add(image, Math.ceil(width * height * 4 * 4 / 3));
  if (units.size === 0 && Number(fallback) > 0) add(resource, Number(fallback));
  return [...units].map(([identity, bytes]) => ({ identity, bytes }));
}

function addTypedArrayUnit(units, array) {
  if (!array) return;
  const identity = array.buffer || array;
  const bytes = Number(identity && identity.byteLength) || Number(array.byteLength) || 0;
  if (!identity || bytes <= 0) return;
  units.set(identity, Math.max(units.get(identity) || 0, bytes));
}
