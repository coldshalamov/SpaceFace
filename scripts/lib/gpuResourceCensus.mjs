// Per-uuid GPU resource census for the PQ-022 H3 corridor capture.
//
// Diagnostic runs of scripts/capture-pq022-h3-performance.mjs recorded the renderer's loaded
// geometry count growing ~310 per corridor cycle (645 -> 955 across cycle ends) while the residency
// ledger (residentAssets/residentResources) and gpuResidentBytes stayed flat: whatever accumulates
// lives outside the registry's accounting, so the receipt can count it but cannot name it.
//
// This module tracks every geometry and texture that reaches the GPU. three.js registers a
// 'dispose' listener on a resource exactly when its buffers are allocated (WebGLGeometries/
// WebGLTextures upload time), so wrapping EventDispatcher.addEventListener/dispatchEvent gives a
// registry whose size matches renderer.info.memory, whose entries carry the SpaceFace batch/shared
// markers, and whose per-uuid diff across cycle ends names the owning builders and exposes
// duplicate generations (same batch key, new uuid) — the direct signature of an undisposed
// generation versus a still-warming bounded cache.
//
// The core is deliberately dependency-free so node tests drive the exact production logic; the
// in-page installer only wires that core to window.SF. The census is installed after boot, so
// boot-time uploads are absent from `registered` (the info.* cross-check in each census documents
// that gap); cycle-end diffs are within-run and unaffected.

const MAX_ROWS_PER_CENSUS = 5000;
const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'];

/** Stable cluster signature for one registered geometry (markers first, size bucket last). */
export function gpuGeometryCensusKey(geometry) {
  if (!geometry) return 'null';
  const userData = geometry.userData || {};
  const parts = [];
  if (userData.spacefaceBatchKey) {
    const tail = String(userData.spacefaceBatchKey).split(/[\\/]/).pop();
    parts.push(`batch:${tail.slice(0, 96)}`);
  }
  if (userData.spacefaceFlightTemplateGeometry) parts.push('flightTemplateGeometry');
  if (userData.spacefaceSharedAsset) parts.push('sharedAsset');
  if (!parts.length) parts.push(geometry.name ? `name:${String(geometry.name).slice(0, 40)}` : 'unmarked');
  const position = typeof geometry.getAttribute === 'function' ? geometry.getAttribute('position') : null;
  parts.push(`v:${position && Number.isFinite(position.count) ? position.count : '?'}`);
  return parts.join('|');
}

/** Stable cluster signature for one registered texture (source tail, dimensions, color space). */
export function gpuTextureCensusKey(texture) {
  if (!texture) return 'null';
  const image = texture.image || (texture.source && texture.source.data) || null;
  const src = image && (image.src || image.currentSrc)
    ? String(image.src || image.currentSrc).split(/[?#]/, 1)[0].split('/').slice(-2).join('/')
    : null;
  const sourceKey = texture.userData && texture.userData.spacefaceSourceKey;
  const dims = image && Number.isFinite(image.width) ? `${image.width}x${image.height}` : '';
  return [
    src || (sourceKey ? `key:${String(sourceKey).slice(0, 64)}` : (texture.name || 'unnamed')),
    dims,
    texture.colorSpace || '',
  ].filter(Boolean).join('|');
}

/**
 * The census registry. `noteUpload` fires when three.js first registers a dispose listener for a
 * resource (GPU allocation); `noteDispose` fires on the dispose event itself.
 */
export function createGpuResourceCensusCore() {
  const geometries = new Map(); // uuid -> { key }
  const textures = new Map(); // uuid -> { key }

  const row = (map, resource, keyFor) => {
    if (!resource || resource.uuid == null || map.has(resource.uuid)) return false;
    map.set(resource.uuid, { key: keyFor(resource) });
    return true;
  };

  return {
    noteUpload(resource) {
      if (resource && resource.isBufferGeometry === true) return row(geometries, resource, gpuGeometryCensusKey);
      if (resource && resource.isTexture === true) return row(textures, resource, gpuTextureCensusKey);
      return false;
    },
    noteDispose(resource) {
      if (!resource || resource.uuid == null) return false;
      return geometries.delete(resource.uuid) || textures.delete(resource.uuid);
    },
    sizes() {
      return { geometries: geometries.size, textures: textures.size };
    },
    /**
     * Snapshot the registry against a scene. `attached` marks resources reachable from the live
     * scene graph; detached-but-registered rows are the cache/leak candidates the diff works on.
     */
    collect({ scene, info = null, sectorId = null, atPerfMs = null } = {}) {
      const attachedGeometries = new Set();
      const attachedTextures = new Set();
      if (scene && typeof scene.traverse === 'function') {
        scene.traverse((object) => {
          if (!object) return;
          if (object.geometry && object.geometry.uuid != null) attachedGeometries.add(object.geometry.uuid);
          const materials = object.material
            ? (Array.isArray(object.material) ? object.material : [object.material])
            : [];
          for (const material of materials) {
            if (!material) continue;
            for (const slot of TEX_SLOTS) {
              const texture = material[slot];
              if (texture && texture.uuid != null) attachedTextures.add(texture.uuid);
            }
          }
        });
      }
      const rows = (map, attached) => {
        const out = [];
        for (const [uuid, entry] of map) {
          out.push({ uuid, key: entry.key, attached: attached.has(uuid) });
          if (out.length >= MAX_ROWS_PER_CENSUS) break;
        }
        return out;
      };
      const geometryRows = rows(geometries, attachedGeometries);
      const textureRows = rows(textures, attachedTextures);
      return {
        schema: 'spaceface.gpuResourceCensus.v1',
        atPerfMs,
        sectorId,
        info,
        registered: { geometries: geometries.size, textures: textures.size },
        truncated: geometryRows.length >= MAX_ROWS_PER_CENSUS || textureRows.length >= MAX_ROWS_PER_CENSUS,
        geometries: geometryRows,
        textures: textureRows,
      };
    },
  };
}

/**
 * Wrap a THREE namespace's EventDispatcher so every GPU registration and disposal passes through
 * the census core. Returns a restore function; the wrapper itself stays out of the hot path for
 * non-dispose listener types.
 */
export function patchEventDispatcherForGpuCensus(THREE, core) {
  const prototype = THREE && THREE.EventDispatcher && THREE.EventDispatcher.prototype;
  if (!prototype || typeof prototype.addEventListener !== 'function') {
    throw new TypeError('gpuResourceCensus requires THREE.EventDispatcher.prototype');
  }
  const originalAdd = prototype.addEventListener;
  const originalDispatch = prototype.dispatchEvent;
  const addEventListenerCensus = function (type, listener) {
    if (type === 'dispose') core.noteUpload(this);
    return originalAdd.call(this, type, listener);
  };
  const dispatchEventCensus = function (event) {
    if (event && event.type === 'dispose') core.noteDispose(this);
    return originalDispatch.call(this, event);
  };
  prototype.addEventListener = addEventListenerCensus;
  prototype.dispatchEvent = dispatchEventCensus;
  return function restoreEventDispatcherForGpuCensus() {
    if (prototype.addEventListener === addEventListenerCensus) prototype.addEventListener = originalAdd;
    if (prototype.dispatchEvent === dispatchEventCensus) prototype.dispatchEvent = originalDispatch;
  };
}

/** In-page entry point (the page dynamic-imports this module from the game server). */
export async function installGpuResourceCensusInPage() {
  const THREE = window.SF && window.SF.THREE;
  if (!THREE) throw new Error('window.SF.THREE unavailable for the GPU resource census');
  if (window.__sfGpuResourceCensus) return { installed: false, alreadyInstalled: true };
  const core = createGpuResourceCensusCore();
  patchEventDispatcherForGpuCensus(THREE, core);
  window.__sfGpuResourceCensus = () => {
    const state = window.SF.state;
    const renderer = state && state.render && state.render.renderer;
    const memory = renderer && renderer.info && renderer.info.memory;
    return core.collect({
      scene: state && state.render && state.render.scene,
      info: memory ? {
        geometries: memory.geometries,
        textures: memory.textures,
        programs: renderer.info.programs ? renderer.info.programs.length : null,
      } : null,
      sectorId: (state && state.world && state.world.currentSectorId) || null,
      atPerfMs: typeof performance !== 'undefined' ? performance.now() : null,
    });
  };
  return { installed: true, alreadyInstalled: false };
}

/** Node-side installer for a Playwright page booted on the game server. */
export async function installGpuResourceCensus(targetPage) {
  return targetPage.evaluate(async () => {
    const module = await import('/scripts/lib/gpuResourceCensus.mjs');
    return module.installGpuResourceCensusInPage();
  });
}

/** Node-side sampler; requires installGpuResourceCensus first. */
export async function collectGpuResourceCensus(targetPage) {
  return targetPage.evaluate(() => {
    if (typeof window.__sfGpuResourceCensus !== 'function') {
      throw new Error('GPU resource census is not installed on this page');
    }
    return window.__sfGpuResourceCensus();
  });
}

function topClusters(counter, limit) {
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function diffRows(previousRows, currentRows) {
  const previous = previousRows || [];
  const current = currentRows || [];
  const previousUuids = new Set(previous.map((entry) => entry.uuid));
  const currentUuids = new Set(current.map((entry) => entry.uuid));
  const added = [];
  for (const entry of current) {
    if (!previousUuids.has(entry.uuid)) added.push(entry);
  }
  const disposedCount = previous.filter((entry) => !currentUuids.has(entry.uuid)).length;
  // Duplicate generations: extra rows sharing one cluster key beyond the first. Two uuids under
  // one batch key after a reload is one undisposed old generation, not cache warmth.
  const byKey = new Map();
  for (const entry of current) byKey.set(entry.key, (byKey.get(entry.key) || 0) + 1);
  let duplicateGenerations = 0;
  const duplicateClusters = new Map();
  for (const [key, count] of byKey) {
    if (count > 1) {
      duplicateGenerations += count - 1;
      duplicateClusters.set(key, count - 1);
    }
  }
  const addedClusters = new Map();
  for (const entry of added) addedClusters.set(entry.key, (addedClusters.get(entry.key) || 0) + 1);
  return {
    kept: current.length - added.length,
    added: added.length,
    disposed: disposedCount,
    net: added.length - disposedCount,
    duplicateGenerations,
    duplicateClusters: topClusters(duplicateClusters, 8),
    addedClusters: topClusters(addedClusters, 8),
  };
}

/** Diff two cycle-end censuses (uuid-level) into the receipt-friendly summary. */
export function diffGpuResourceCensus(previous, current) {
  if (!previous || !current) return null;
  return {
    fromAtPerfMs: previous.atPerfMs ?? null,
    toAtPerfMs: current.atPerfMs ?? null,
    info: { from: previous.info || null, to: current.info || null },
    geometry: diffRows(previous.geometries, current.geometries),
    texture: diffRows(previous.textures, current.textures),
  };
}

/**
 * Classify a series of cycle-end diffs. Judgement, not proof: the receipt lists the clusters, the
 * verdict only says which way the numbers point.
 *  - leak-suspected: the latest net geometry growth stays large AND duplicate generations grow.
 *  - warm-up: net growth is strictly decaying toward zero (each cycle adds visibly less).
 *  - stable: every net is inside the noise band.
 *  - inconclusive: fewer than two diffs.
 */
export function gpuCensusVerdict(diffs, options = {}) {
  const growthBand = Number.isFinite(options.growthBand) ? options.growthBand : 25;
  const decayRatio = Number.isFinite(options.decayRatio) ? options.decayRatio : 0.6;
  const rows = (diffs || []).filter((diff) => diff && diff.geometry);
  if (rows.length < 2) {
    return { verdict: 'inconclusive', reason: 'fewer than two cycle-end diffs', diffs: rows.length };
  }
  const nets = rows.map((diff) => Number(diff.geometry.net) || 0);
  const duplicates = rows.map((diff) => Number(diff.geometry.duplicateGenerations) || 0);
  const lastNet = nets[nets.length - 1];
  const previousNet = nets[nets.length - 2];
  const summary = {
    verdict: null,
    reason: null,
    netGeometryPerCycle: nets,
    duplicateGenerationsPerCycle: duplicates,
    latestDuplicateClusters: rows[rows.length - 1].geometry.duplicateClusters || [],
  };
  if (nets.every((net) => Math.abs(net) <= growthBand)) {
    return { ...summary, verdict: 'stable', reason: `every cycle-end net is within ±${growthBand} geometries` };
  }
  let decaying = true;
  for (let index = 1; index < nets.length; index += 1) {
    const earlier = Math.abs(nets[index - 1]);
    const later = Math.abs(nets[index]);
    if (later > Math.max(growthBand, earlier * decayRatio)) decaying = false;
  }
  if (decaying && Math.abs(lastNet) <= Math.max(growthBand, Math.abs(previousNet))) {
    return {
      ...summary,
      verdict: 'warm-up',
      reason: 'net geometry growth decays cycle over cycle toward the noise band; consistent with a bounded working set still warming',
    };
  }
  if (lastNet > growthBand && duplicates[duplicates.length - 1] > (duplicates[duplicates.length - 2] || 0)) {
    return {
      ...summary,
      verdict: 'leak-suspected',
      reason: 'net geometry growth stays high while duplicate cluster generations grow: the same batch keys are being re-created without the old generation being disposed',
    };
  }
  if (lastNet > growthBand) {
    return {
      ...summary,
      verdict: 'leak-suspected',
      reason: 'net geometry growth stays high without decaying cycle over cycle; a bounded working set must converge — inspect addedClusters for the owning builders',
    };
  }
  return {
    ...summary,
    verdict: 'ambiguous',
    reason: 'growth is outside the noise band but neither grows steadily nor decays; inspect the per-cluster diffs',
  };
}
