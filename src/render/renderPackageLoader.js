import {
  assertValidRenderPackage,
  computeRenderPackageContentHash,
  computeRenderPackageRuntimeHash,
  renderPackageContentIdentity,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
  stableJsonStringify,
  stableJsonValue,
} from '../contracts/renderPackage.js';
import {
  createAssetResidencyRegistry,
  getAssetResidency,
} from './assetResidency.js';
import * as THREE from 'three';
import { activeDecodeClass, regradeGltfCompile, scheduleGltfCompile, scheduleGltfParse, sharedDecodeTaskBudget } from './decodeTaskBudget.js';
import { createAsyncAdmission } from './asyncAdmission.js';
import { createRenderPackageDigester } from './renderPackageDigest.js';
import { sharedGlbPrepasser } from './glbPrepass.js';
import {
  createPackageDetachManifest,
  dropPackageDetachManifest,
  packageDetachDiagnostics,
} from './packageCpuDetach.js';
import { dedupeGltfTextureSources } from './imageSourceDedupe.js';

const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:/i;
const SHA256_RE = /^[a-f0-9]{64}$/;

let defaultDecoderModules = null;

export function createRenderPackageLoader(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const decodeGlb = typeof options.loadGlb === 'function'
    ? options.loadGlb
    : createDefaultGlbDecoder({
      fetchImpl,
      configureGltfLoader: options.configureGltfLoader,
    });
  const residency = options.residency
    || options.registry
    || (options.renderer ? getAssetResidency(options.renderer) : null)
    || createAssetResidencyRegistry(options.residencyOptions);
  const sourceFallback = typeof options.loadSourceFallback === 'function'
    ? options.loadSourceFallback
    : null;
  const contentDigest = typeof options.contentDigest === 'function'
    ? options.contentDigest
    : null;
  const prepareDecoded = typeof options.prepareDecoded === 'function'
    ? options.prepareDecoded
    : null;
  // Tier-1 causal counter sink (default null). All counting is guarded by the counter set's own
  // enabled flag, so a present-but-disabled set costs one boolean read per recorded unit of work.
  const counters = options.counters && typeof options.counters.isEnabled === 'function'
    ? options.counters
    : null;
  const cache = new Map();
  let ownerSequence = 0;
  let disposed = false;

  // Admission ledger: each decode generation rides one async-admission token. An evicted or
  // superseded generation's token aborts so a late decode fails its assertActive instead of
  // resurrecting private resources into a replaced package; dispose aborts every live token.
  const activeAdmissions = new Set();
  const newAdmission = (label, signal = null) => {
    const admission = createAsyncAdmission({ label, ...options.admissionTimers, signal });
    activeAdmissions.add(admission);
    return admission;
  };

  const createOwner = (role, contentHash) => Object.freeze({
    type: 'render-package',
    role,
    contentHash,
    sequence: ++ownerSequence,
  });

  async function load(metadataOrUrl, loadOptions = {}) {
    if (disposed) throw new Error('Render package loader has been disposed.');
    const admission = newAdmission('render-package-request', loadOptions.signal || loadOptions.asyncAdmission?.signal);
    const expectedContentHash = loadOptions.expectedContentHash ?? options.expectedContentHash ?? null;
    const expectedRuntimeHash = loadOptions.expectedRuntimeHash ?? options.expectedRuntimeHash ?? null;
    try {
      const resolved = await admission.wait(resolveMetadata(metadataOrUrl, loadOptions, fetchImpl, 'no-cache'));
      try {
        return await admission.wait(loadResolved(resolved.metadata, resolved.baseUrl, expectedContentHash, expectedRuntimeHash, loadOptions, admission, metadataOrUrl));
      } catch (error) {
        // A stale immutable cache may win once at Electron's persistent origin.
        if (!isStalePackageCacheError(error) || typeof metadataOrUrl !== 'string') throw error;
        admission.assertActive();
        const reloaded = await admission.wait(resolveMetadata(metadataOrUrl, loadOptions, fetchImpl, 'reload'));
        return await admission.wait(loadResolved(reloaded.metadata, reloaded.baseUrl, expectedContentHash, expectedRuntimeHash, loadOptions, admission, metadataOrUrl));
      }
    } finally {
      admission.finish();
      activeAdmissions.delete(admission);
    }
  }

  async function loadResolved(metadataValue, baseUrl, expectedContentHash, expectedRuntimeHash, loadOptions = {}, requestAdmission, metadataUrl = null) {
    requestAdmission.assertActive();
    if (disposed) throw new Error('Render package loader has been disposed.');
    assertValidRenderPackage(metadataValue);
    const expectedHash = normalizeExpectedContentHash(expectedContentHash);
    const expectedRuntime = normalizeExpectedRuntimeHash(expectedRuntimeHash);
    const metadata = deepFreeze(stableJsonValue(metadataValue));
    const computedHash = await computeRenderPackageContentHash(metadata, {
      ...(contentDigest ? { digest: contentDigest } : {}),
    });
    requestAdmission.assertActive();
    if (computedHash !== metadata.contentHash) {
      throw new Error(
        `Render package content hash mismatch for ${metadata.assetId}: ${computedHash} != ${metadata.contentHash}.`,
      );
    }
    if (expectedHash && computedHash !== expectedHash) {
      throw new Error(
        `Render package trust-anchor mismatch for ${metadata.assetId}: ${computedHash} != ${expectedHash}.`,
      );
    }
    if (metadata.runtimeHash || expectedRuntime) {
      if (!metadata.runtimeHash || !metadata.runtime) {
        throw new Error(`Render package runtime trust anchor is missing for ${metadata.assetId}.`);
      }
      const computedRuntimeHash = await computeRenderPackageRuntimeHash(metadata, {
        ...(contentDigest ? { digest: contentDigest } : {}),
      });
      requestAdmission.assertActive();
      if (computedRuntimeHash !== metadata.runtimeHash) {
        throw new Error(
          `Render package runtime hash mismatch for ${metadata.assetId}: `
          + `${computedRuntimeHash} != ${metadata.runtimeHash}.`,
        );
      }
      if (expectedRuntime && computedRuntimeHash !== expectedRuntime) {
        throw new Error(
          `Render package runtime trust-anchor mismatch for ${metadata.assetId}: `
          + `${computedRuntimeHash} != ${expectedRuntime}.`,
        );
      }
    }

    const signature = runtimePackageSignature(metadata);
    const contentHash = metadata.contentHash;
    // The consumer's presentation owner lands on the entry synchronously — at commit for fresh
    // decodes, before resolve on cache hits. Without it a just-decoded package sits strictly
    // cache-owned until the caller's async retain continuation runs, and a byte-pressure eviction
    // inside that gap sends the loader into a decode→evict→retry livelock (the PQ-033.02
    // save/load station-shell hang: the gate-required package was always the eviction victim).
    const consumerOwner = loadOptions.residencyOwner || null;
    // Warm-purpose decodes must carry the flag through this route too — a retracted prewarm or
    // runway residue otherwise reads identical to ambient package-cache residue and loses the
    // soft-eviction LRU race first, exactly the pop the flag exists to prevent.
    const decodeWarm = /warm|runway|prewarm|armory|predicted/i.test(String(loadOptions.residencyRole || ''));
    // A package a boundary actually served outranks speculative residue the same way the decode
    // cache's served flag does — on departure it keeps sweep immunity and loses the byte-pressure
    // sort last instead of first. Without a consumer owner the load is ambient, not served.
    const decodeServed = !decodeWarm && !!consumerOwner;
    const retainConsumer = (key) => {
      if (!consumerOwner || requestAdmission.signal.aborted
        || (typeof loadOptions.isResidencyOwnerActive === 'function'
          && loadOptions.isResidencyOwnerActive() !== true)) return;
      residency.retain(key, consumerOwner, {
        role: loadOptions.residencyRole || 'live-boundary',
        sectorId: loadOptions.residencySectorId || null,
        decodeWarm,
        decodeServed,
        // Ownerless warms carry the same soft lease the GLB lane gives them — without it the
        // session fallback owner makes this package immune to every soft-eviction pass.
        ...(loadOptions.residencySoftLease === true ? { softLease: true } : {}),
      });
    };
    const existing = cache.get(contentHash);
    if (existing) {
      if (existing.signature !== signature) {
        throw new Error(`Render package content hash collision for ${contentHash}.`);
      }
      const loaded = await existing.promise;
      requestAdmission.assertActive();
      if (existing.evicted) {
        if (cache.get(contentHash) === existing) cache.delete(contentHash);
        return loadResolved(metadata, baseUrl, expectedHash, expectedRuntime, loadOptions, requestAdmission, metadataUrl);
      }
      retainConsumer(existing.key);
      // retainPackageOwner owns both cases: an entry still held bumps its lease count, an
      // evicted-owner entry reacquires residency — with the decodeWarm flag threaded so a warm
      // re-decode keeps its soft-eviction protection (and a failed reacquire still throws).
      if (!retainPackageOwner(existing, decodeWarm, decodeServed)) {
        throw new Error(`Render package ${metadata.assetId} could not reacquire residency.`);
      }
      return loaded;
    }

    const renderUrl = resolveRenderUrl(metadata.render.uri, baseUrl);
    const entry = {
      key: `render-package:${contentHash}`,
      signature,
      metadata,
      metadataUrl: typeof metadataUrl === 'string' ? metadataUrl : null,
      renderUrl,
      promise: null,
      loaded: null,
      packageOwner: createOwner('package-cache', contentHash),
      request: null,
      evicted: false,
      admission: newAdmission(`render-package:${metadata.assetId || contentHash}`),
      refCount: 1,
    };
    entry.request = residency.beginRequest(entry.key, entry.packageOwner, {
      role: 'render-package-cache',
      decodeWarm,
      decodeServed,
    });
    const decodeWork = Promise.resolve()
      .then(() => {
        if (counters && counters.isEnabled()) counters.countPackageDecode(metadata.assetId);
        return decodeGlb(renderUrl, metadata);
      })
      // Package decodes resolve in clusters exactly like source-GLB parses, and this path is the
      // dominant decode route — an unpaced tail stacks K plan+bind continuations (traverse,
      // per-vertex layout rebake, canonicalize) inside one microtask drain. Pace it through the
      // same class lanes; the class travels by the caller's decode-class flag window, which a
      // joiner's wrap holds through settle — so joined tasks classify at the joiner's class too.
      .then((decoded) => scheduleGltfCompile(() => {
        // Same owner-activity re-check the source-GLB tail runs at drain time: an owner that
        // departed while the tail queued skips the compile — but the pending residency
        // request and the decoded payload must be released by hand, mirroring the GLB lane's
        // 'owner-departed-during-decode' cancel (a commit or a promise rejection would do the
        // teardown; a plain null settle does neither).
        if (typeof loadOptions.isResidencyOwnerActive === 'function'
          && !loadOptions.isResidencyOwnerActive()) {
          disposeDecodedResources(decoded);
          if (entry.request) {
            entry.request.cancel('owner-departed-during-compile');
            entry.request = null;
          }
          return null;
        }
        return preparePackageTail(decoded);
      }, activeDecodeClass(), entry.promise));

  function preparePackageTail(decoded) {
    return (async () => {
        try { entry.admission.assertActive(); } catch (error) {
          disposeDecodedResources(decoded);
          throw error;
        }
        // The instance plan is compiled BEFORE prepareDecoded so the preparation step can be handed
        // the plan: it is the seam through which package-carried semantics eventually replace
        // source recompilation (render-package v2). Compiling it first also means a structurally
        // invalid package fails before any blueprint work is spent on it.
        const template = decoded?.scene || decoded;
        let plan = null;
        try {
          plan = buildInstancePlan(template, metadata, counters);
        } catch (error) {
          disposeDecodedResources(decoded);
          throw error;
        }
        let prepared = null;
        try {
          prepared = prepareDecoded
            ? await prepareDecoded(decoded, metadata, renderUrl, plan)
            : null;
        } catch (error) {
          disposeDecodedResources(decoded, plan.resources);
          throw error;
        }
        try {
          entry.admission.assertActive();
        } catch (error) {
          disposeDecodedResources(decoded, plan.resources);
          throw error;
        }
        // NXI-230: Superseded old-generation check releases only this decode's private resources
        if (cache.get(contentHash) !== entry || entry.evicted) {
          disposeDecodedResources(decoded, plan.resources);
          if (entry.request) entry.request.cancel('superseded-old-generation');
          entry.request = null;
          entry.admission.abort(new Error(`Render package decode for ${metadata.assetId} was superseded.`));
          throw new Error(`Render package decode for ${metadata.assetId} was superseded.`);
        }
        const loaded = createLoadedPackage(metadata, decoded, renderUrl, {
          residency,
          entry,
          createOwner,
          releasePackageOwner,
        }, prepared, counters, plan);
        entry.loaded = loaded;
        try {
          residency.registerAsset(entry.key, loaded.resources, {
            // The encoded .glb size is CPU/cache residency. Decoded GPU bytes are measured from
            // each geometry buffer/texture resource by assetResidency; never spread package bytes
            // across materials or unknown wrappers as a GPU fallback.
            cpuPackageBytes: metadata.render.bytes,
            metadata: {
              assetId: metadata.assetId,
              contentHash,
            },
            onEvict() {
              entry.evicted = true;
              loaded.markEvicted();
              if (cache.get(contentHash) === entry) cache.delete(contentHash);
              dropPackageDetachManifest(contentHash);
              entry.admission.abort(new Error(`Render package ${metadata.assetId} was evicted mid-decode.`));
            },
          });
        } catch (error) {
          disposeDecodedResources(decoded, loaded.resources);
          throw error;
        }
        retainConsumer(entry.key);
        const retained = entry.request.commit();
        entry.request = null;
        if (!retained) {
          throw new Error(`Render package ${metadata.assetId} load was released before decode completed.`);
        }
        // Mark the package's textures for post-upload CPU-payload detach. The manifest pairs each
        // texture with its ordinal in the deterministic resource walk so a context restore can
        // re-decode the immutable render.glb and refill the same texture objects. Detach is
        // opportunistic: a manifest failure must not fail an otherwise-good package load.
        try {
          entry.detachManifest = createPackageDetachManifest(loaded, {
            redecode: () => decodeGlb(renderUrl, metadata),
            collectResources: collectImmutableResources,
          });
        } catch (error) {
          if (typeof console !== 'undefined') console.warn('[renderPackageLoader] cpu detach manifest failed', error);
        }
        return loaded;
      })();
  }
    entry.promise = entry.admission.wait(decodeWork);
    cache.set(contentHash, entry);
    const admissionSettled = () => {
      entry.admission.finish();
      activeAdmissions.delete(entry.admission);
    };
    entry.promise.then(admissionSettled, admissionSettled);
    entry.promise.catch(() => {
      if (entry.request) entry.request.cancel('render-package-decode-failed');
      entry.request = null;
      if (cache.get(contentHash) === entry) cache.delete(contentHash);
    });
    return entry.promise;
  }

  function retainPackageOwner(entry, decodeWarm = false, decodeServed = false) {
    if (disposed || entry.evicted) return false;
    if (entry.packageOwner) {
      entry.refCount = (entry.refCount || 1) + 1;
      // A live-boundary serve upgrades a speculation-warm package lease in place —
      // residency .retain merges decodeServed onto the existing owner record.
      if (decodeServed === true) {
        residency.retain(entry.key, entry.packageOwner,
          { role: 'render-package-cache', decodeWarm, decodeServed });
      }
      return true;
    }
    const owner = createOwner('package-cache', entry.metadata.contentHash);
    if (!residency.retain(entry.key, owner, { role: 'render-package-cache', decodeWarm, decodeServed })) return false;
    entry.packageOwner = owner;
    entry.loaded?.markRetained();
    entry.refCount = 1;
    return true;
  }

  function releasePackageOwner(entry, reason = 'render-package-released') {
    if (!entry) return false;
    if (entry.refCount > 1) {
      entry.refCount--;
      return true;
    }
    entry.refCount = 0;
    const owner = entry.packageOwner;
    if (!owner) return false;
    entry.packageOwner = null;
    entry.loaded?.markReleased();
    residency.releaseOwner(owner, reason);
    return true;
  }

  async function loadWithSourceFallback(metadataOrUrl, loadOptions = {}) {
    try {
      const renderPackage = await load(metadataOrUrl, loadOptions);
      return Object.freeze({
        route: 'render-package',
        value: renderPackage,
        renderPackage,
        source: null,
        packageError: null,
      });
    } catch (packageError) {
      if (disposed || packageError?.name === 'AbortError') throw packageError;
      const fallback = typeof loadOptions.loadSourceFallback === 'function'
        ? loadOptions.loadSourceFallback
        : sourceFallback;
      if (!fallback) throw packageError;
      const source = await fallback(Object.freeze({
        metadataOrUrl,
        packageError,
      }));
      if (source == null) {
        throw new Error(`Render package source fallback returned no value after: ${packageError.message}`);
      }
      return Object.freeze({
        route: 'source-fallback',
        value: source,
        renderPackage: null,
        source,
        packageError,
      });
    }
  }

  function release(contentHash, reason = 'render-package-released') {
    const entry = cache.get(String(contentHash || ''));
    return entry ? releasePackageOwner(entry, reason) : false;
  }

  function dispose(reason = 'render-package-loader-disposed') {
    if (disposed) return false;
    disposed = true;
    for (const entry of cache.values()) {
      releasePackageOwner(entry, reason);
      dropPackageDetachManifest(entry.metadata.contentHash);
    }
    for (const admission of [...activeAdmissions]) {
      admission.abort(new Error('Render package loader has been disposed.'));
    }
    return true;
  }

  function diagnostics() {
    return Object.freeze({
      schema: 'spaceface.renderPackageLoader.v1',
      disposed,
      cacheEntries: cache.size,
      residency: residency.canonicalDiagnostics(),
      cpuDetach: packageDetachDiagnostics(),
    });
  }

  /**
   * Re-grade a queued package compile tail to `joinClass` for the package loaded from
   * `metadataUrl`. The dominant decode route's tail enqueues under the class that was active
   * when its decode resolved — a deadline/visible joiner landing after the enqueue would
   * otherwise sit behind every queued ambient compile. Returns true when a queued entry was
   * re-graded; a settled or unstarted tail resolves false and the caller's flag window
   * covers anything still to enqueue.
   */
  function regradeCompileFor(metadataUrl, joinClass) {
    if (typeof metadataUrl !== 'string' || !metadataUrl) return false;
    for (const entry of cache.values()) {
      if (entry.metadataUrl === metadataUrl) {
        return entry.promise ? regradeGltfCompile(entry.promise, joinClass) : false;
      }
    }
    return false;
  }

  return Object.freeze({
    load,
    loadWithSourceFallback,
    regradeCompileFor,
    release,
    dispose,
    diagnostics,
  });
}

function createLoadedPackage(metadata, decoded, renderUrl, lifecycle, prepared = null, counters = null, plan = null) {
  const template = decoded?.scene || decoded;
  assertSceneRoot(template, metadata);
  const instancePlan = plan || buildInstancePlan(template, metadata, counters);
  try {
    return new LoadedRenderPackage(
      metadata,
      template,
      renderUrl,
      instancePlan.resources,
      lifecycle,
      prepared,
      counters,
      instancePlan,
    );
  } catch (error) {
    disposeUnregisteredResources(instancePlan.resources);
    throw error;
  }
}

/**
 * Compile the decoded package template into a FLAT instance plan, in exactly one traversal.
 *
 * This is the load-time half of removing per-instance scene-graph work. The traversal does, once:
 *
 *   - assigns every node a plan index in depth-first pre-order and records its parent's index, so
 *     an instance can be rebuilt by iterating an array instead of recursing a graph;
 *   - marks and collects the immutable geometry/material/texture resources (previously its own
 *     separate full traversal);
 *   - validates every semantic locator payload and resolves it to a plan index (previously redone
 *     from scratch on every single instance);
 *   - resolves the dynamic-group records to plan indices, so a bad package fails here rather than
 *     once per instance forever;
 *   - rejects node kinds a rigid flat plan cannot faithfully reconstruct.
 *
 * Rejecting rather than falling back is deliberate. Silently reverting to a recursive clone for
 * skinned content would reintroduce exactly the per-instance cost this exists to remove, and would
 * do it invisibly. All 26 shipping packages are rigid (no skins, animations, cameras or lights),
 * so anything else is a pipeline change that should announce itself.
 */
function buildInstancePlan(template, metadata, counters = null) {
  assertSceneRoot(template, metadata);
  const counting = counters && counters.isEnabled() ? counters : null;
  const records = new Map(
    [...metadata.nodes, ...metadata.anchors].map((record) => [record.id, record]),
  );
  const entries = [];
  const resources = new Set();
  const indexByRecordId = new Map();
  const seenTextures = new Set();

  const visit = (object, parentIndex) => {
    assertRigidPlanNode(object, metadata);
    const planIndex = entries.length;
    entries.push({
      source: object,
      parentIndex,
      name: object.name || '',
      isMesh: object.isMesh === true,
      recordIds: null,
    });

    if (object.geometry) markImmutableResource(object.geometry, resources);
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];
    for (const material of materials) {
      markImmutableResource(material, resources);
      collectTextures(material, resources, seenTextures);
    }

    const recordIds = readSemanticRecordIds(object, records, indexByRecordId, planIndex);
    if (recordIds) entries[planIndex].recordIds = recordIds;

    for (const child of object.children) visit(child, planIndex);
  };
  visit(template, -1);

  for (const recordId of records.keys()) {
    if (!indexByRecordId.has(recordId)) {
      throw new Error(`Render package semantic locator ${recordId} is missing from decoded render.glb.`);
    }
  }

  // Resolve the three lookup tables to plan indices once. createInstance then materialises them
  // by array index with no name matching, no userData reads and no validation.
  const nodePlanIndices = metadata.nodes.map((record) => indexByRecordId.get(record.id));
  const anchorPlanIndices = metadata.anchors.map((record) => indexByRecordId.get(record.id));
  const dynamicGroupPlanIndices = metadata.dynamicGroups.map((record) => {
    const planIndex = indexByRecordId.get(record.nodeId);
    if (planIndex === undefined) {
      throw new Error(`Render package ${metadata.assetId} dynamic group ${record.id} has no instance node.`);
    }
    return planIndex;
  });

  if (counting) {
    // One traversal, one semantic compile, for the whole package. Both are load-time by
    // construction now; the per-instance path records neither.
    counting.countGraphTraversal(entries.length, 'package-plan-compile');
    counting.countRuntimeSemanticCompile('package-plan-compile', entries.length);
  }

  return Object.freeze({
    entries,
    templateNodes: new Set(entries.map((entry) => entry.source)),
    resources,
    nodePlanIndices,
    anchorPlanIndices,
    dynamicGroupPlanIndices,
    nodeCount: entries.length,
  });
}

/**
 * A flat rigid plan reconstructs nodes with `source.clone(false)`, which copies the transform,
 * visibility, shadow flags, layers and userData but shares geometry and materials. That is exact
 * for Object3D/Group/Mesh and wrong for anything carrying rebindable structure (skeletons, LOD
 * level tables, per-instance matrices) or scene-level state (lights, cameras).
 */
function assertSceneRoot(template, metadata) {
  if (
    !template
    || typeof template.clone !== 'function'
    || typeof template.traverse !== 'function'
    || !Array.isArray(template.children)
  ) {
    throw new Error(`Render package ${metadata.assetId} decoder did not return a Three.js scene root.`);
  }
}

function assertRigidPlanNode(object, metadata) {
  const unsupported = object.isSkinnedMesh ? 'a skinned mesh'
    : object.isBone ? 'a bone'
      : object.isInstancedMesh ? 'an instanced mesh'
        : object.isLOD ? 'an LOD group'
          : object.isLight ? 'a light'
            : object.isCamera ? 'a camera'
              : null;
  if (unsupported) {
    throw new Error(
      `Render package ${metadata.assetId} node ${object.name || '(unnamed)'} is ${unsupported}; `
      + 'render packages must contain only rigid Object3D/Group/Mesh nodes.',
    );
  }
}

/** Validate one node's semantic locator payload and bind its record ids to this plan index. */
function readSemanticRecordIds(object, records, indexByRecordId, planIndex) {
  const payload = object.userData?.[RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY];
  if (payload == null) return null;
  if (!isPlainObject(payload)) {
    throw new Error(`Render package semantic locator on ${object.name || '(unnamed)'} must be an object.`);
  }
  const unknownKeys = Object.keys(payload).filter(
    (key) => !['schema', 'recordIds', 'rawNodeName'].includes(key),
  );
  if (unknownKeys.length > 0 || payload.schema !== RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA) {
    throw new Error(`Render package semantic locator on ${object.name || '(unnamed)'} has an unsupported schema.`);
  }
  if (!Array.isArray(payload.recordIds) || payload.recordIds.length === 0) {
    throw new Error(`Render package semantic locator on ${object.name || '(unnamed)'} has no record IDs.`);
  }
  if (typeof payload.rawNodeName !== 'string') {
    throw new Error(`Render package semantic locator on ${object.name || '(unnamed)'} has no raw node name.`);
  }

  const localIds = new Set();
  for (const recordId of payload.recordIds) {
    if (typeof recordId !== 'string' || !records.has(recordId)) {
      throw new Error(`Render package semantic locator references unknown record ${String(recordId)}.`);
    }
    if (localIds.has(recordId) || indexByRecordId.has(recordId)) {
      throw new Error(`Render package semantic locator ${recordId} is duplicated in decoded render.glb.`);
    }
    localIds.add(recordId);
    const record = records.get(recordId);
    if (payload.rawNodeName !== record.nodeName) {
      throw new Error(
        `Render package semantic locator ${recordId} names ${payload.rawNodeName || '(unnamed)'} instead of ${record.nodeName}.`,
      );
    }
    indexByRecordId.set(recordId, planIndex);
  }
  return [...localIds];
}

class LoadedRenderPackage {
  #template;
  #lifecycle;
  #counters;
  #staleListeners;

  #plan;

  constructor(metadata, template, renderUrl, resources, lifecycle, prepared, counters = null, plan = null) {
    Object.defineProperties(this, {
      assetId: { value: metadata.assetId, enumerable: true },
      contentHash: { value: metadata.contentHash, enumerable: true },
      metadata: { value: metadata, enumerable: true },
      renderUrl: { value: renderUrl, enumerable: true },
      residencyKey: { value: lifecycle.entry.key, enumerable: true },
      resources: { value: Object.freeze([...resources]), enumerable: true },
      prepared: { value: prepared, enumerable: true },
      /** Node count of the load-time instance plan; the per-instance work is exactly this many. */
      planNodeCount: { value: plan ? plan.nodeCount : 0, enumerable: true },
    });
    this.#template = template;
    this.#lifecycle = lifecycle;
    this.#counters = counters;
    this.#plan = plan;
    this.#staleListeners = null;
    this.released = false;
    this.evicted = false;
  }

  /**
   * Subscribe to the moment this package generation stops being mountable — the package-cache
   * lease released (the entry may be reacquired through the loader) or the residency entry
   * evicted (a permanently dead generation). Outer caches such as assetLoader's runtime.assets
   * hold assembled records, so their fulfilled tasks pin this entire decoded graph; without
   * this signal a stale task only cleared when the same source URL was requested again, which
   * kept every generation evicted between requests resident for the session (D24 heap slope).
   * Listeners run synchronously; each fires at most once per stale transition. Returns an
   * unsubscribe function.
   */
  onStale(listener) {
    if (typeof listener !== 'function') return () => {};
    const listeners = this.#staleListeners || (this.#staleListeners = new Set());
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  #notifyStale() {
    const listeners = this.#staleListeners;
    this.#staleListeners = null;
    if (!listeners) return;
    for (const listener of listeners) {
      try { listener(this); } catch (_) {}
    }
  }

  markReleased() {
    if (this.released) return;
    this.released = true;
    this.#notifyStale();
  }

  markRetained() {
    this.released = false;
  }

  markEvicted() {
    this.released = true;
    this.evicted = true;
    this.#notifyStale();
  }

  release(reason = 'render-package-released') {
    return this.#lifecycle.releasePackageOwner(this.#lifecycle.entry, reason);
  }

  dispose(reason = 'render-package-disposed') {
    return this.release(reason);
  }

  retain(owner, metadata = {}) {
    if (this.released || this.evicted || !this.#lifecycle.entry.packageOwner) return false;
    return this.#lifecycle.residency.retain(this.#lifecycle.entry.key, owner, metadata);
  }

  createInstance(instanceOptions = {}) {
    if (this.released || this.evicted || !this.#lifecycle.entry.packageOwner) {
      throw new Error(`Render package ${this.assetId} must be retained before creating an instance.`);
    }
    const externalOwner = instanceOptions.residencyOwner || null;
    const owner = externalOwner || this.#lifecycle.createOwner('render-instance', this.contentHash);
    const retained = this.#lifecycle.residency.retain(this.#lifecycle.entry.key, owner, {
      role: instanceOptions.residencyRole || 'render-package-instance',
      sectorId: instanceOptions.sectorId || null,
    });
    if (!retained && !externalOwner) {
      throw new Error(`Render package ${this.assetId} could not retain instance residency.`);
    }

    try {
      const { metadata } = this;
      const counters = this.#counters && this.#counters.isEnabled() ? this.#counters : null;
      const plan = this.#plan;
      const { entries } = plan;
      const count = entries.length;
      const createNode = typeof instanceOptions.createNode === 'function'
        ? instanceOptions.createNode
        : null;
      const templateNodes = createNode ? plan.templateNodes : null;
      const instanceNodes = createNode ? new Set() : null;

      // ONE flat pass. Every node is reconstructed rigidly with clone(false) — transform,
      // visibility, shadow flags, layers and userData copied; geometry and materials SHARED with
      // the template — and attached by its recorded parent index. Depth-first pre-order means a
      // parent is always built before its children, so no fixup pass is needed.
      //
      // This replaces a recursive SkeletonUtils graph clone plus a full re-traversal that
      // revalidated every semantic locator payload from scratch, per instance. The validation and
      // the record->node resolution now happened once, at load, in buildInstancePlan.
      const objects = new Array(count);
      for (let i = 0; i < count; i++) {
        const entry = entries[i];
        const created = createNode ? createNode({
          source: entry.source,
          planIndex: i,
          parentIndex: entry.parentIndex,
        }) : null;
        const object = created == null ? entry.source.clone(false) : created;
        if (!object?.isObject3D) {
          throw new TypeError(
            `Render package ${this.assetId} createNode() must return an Object3D or null for plan index ${i}.`,
          );
        }
        if (templateNodes?.has(object)) {
          throw new TypeError(
            `Render package ${this.assetId} createNode() cannot return a template node at plan index ${i}.`,
          );
        }
        if (instanceNodes?.has(object)) {
          throw new TypeError(
            `Render package ${this.assetId} createNode() must return a unique Object3D for plan index ${i}.`,
          );
        }
        if (created != null && object.children.length > 0) {
          throw new TypeError(
            `Render package ${this.assetId} createNode() must return an Object3D without children at plan index ${i}.`,
          );
        }
        if (object.parent) {
          throw new TypeError(
            `Render package ${this.assetId} createNode() must return an unattached Object3D at plan index ${i}.`,
          );
        }
        instanceNodes?.add(object);
        objects[i] = object;
        if (entry.parentIndex >= 0) objects[entry.parentIndex].add(object);
      }

      const root = objects[0];
      if (instanceOptions.name != null) root.name = String(instanceOptions.name);
      root.userData = {
        ...(root.userData || {}),
        ...(instanceOptions.userData || {}),
        spacefaceRenderPackage: {
          assetId: metadata.assetId,
          contentHash: metadata.contentHash,
        },
      };

      if (counters) {
        // Honest accounting for what replaced the clone+traverse: a flat plan iteration over
        // `count` nodes. Recording it as its own family is the point — a silent drop of
        // graphClone/graphTraversal to zero would read as elimination when it was relabelling.
        counters.countPlanInstantiation(count, 'package-instance');
        counters.countObject3dConstructed(count, 'package-instance-plan');
      }

      // Semantic maps are materialised by array index: no name matching, no userData reads, no
      // validation, and no Map built from a spread of the metadata record arrays.
      const nodes = new Map();
      const metaNodes = metadata.nodes;
      for (let i = 0; i < metaNodes.length; i++) {
        nodes.set(metaNodes[i].id, objects[plan.nodePlanIndices[i]]);
      }
      const anchors = new Map();
      const metaAnchors = metadata.anchors;
      for (let i = 0; i < metaAnchors.length; i++) {
        anchors.set(metaAnchors[i].id, objects[plan.anchorPlanIndices[i]]);
      }
      const dynamicGroups = new Map();
      const metaGroups = metadata.dynamicGroups;
      for (let i = 0; i < metaGroups.length; i++) {
        dynamicGroups.set(metaGroups[i].id, objects[plan.dynamicGroupPlanIndices[i]]);
      }

      let disposed = false;
      return Object.freeze({
        route: 'render-package',
        assetId: metadata.assetId,
        contentHash: metadata.contentHash,
        root,
        nodes,
        anchors,
        dynamicGroups,
        /**
         * The instance's nodes in plan order, root first. Consumers that need to touch every node
         * (partsLibrary's tag/material specialisation) iterate this instead of calling
         * root.traverse(), which is what keeps per-instance recursive traversal at zero.
         */
        planNodes: objects,
        planEntries: entries,
        get disposed() {
          return disposed;
        },
        dispose: (reason = 'render-package-instance-disposed') => {
          if (disposed) return false;
          disposed = true;
          if (!externalOwner) this.#lifecycle.residency.releaseOwner(owner, reason);
          return true;
        },
      });
    } catch (error) {
      if (!externalOwner) this.#lifecycle.residency.releaseOwner(owner, 'render-package-instance-create-failed');
      throw error;
    }
  }

  /**
   * Instantiate a rigid, package-prepared flight asset without rebuilding the decoded GLB graph.
   *
   * The ordinary v2 route clones every node in the flat plan so arbitrary authored hierarchy and
   * semantic records remain available. A flight-static v3 package has already baked that hierarchy
   * into root-relative primitive and marker matrices offline. Replaying only those declared records
   * deletes the empty carrier/group objects from the live opening scene while sharing the exact same
   * immutable geometry, materials, and textures as the decoded package.
   */
  createFlightInstance(instanceOptions = {}) {
    if (this.released || this.evicted || !this.#lifecycle.entry.packageOwner) {
      throw new Error(`Render package ${this.assetId} must be retained before creating a flight instance.`);
    }
    if ((this.metadata.dynamicGroups || []).length > 0) {
      throw new Error(`Render package ${this.assetId} has dynamic groups and cannot use the flight-static route.`);
    }
    const prepared = this.prepared;
    if (!prepared || !Array.isArray(prepared.primitives) || !Array.isArray(prepared.markers)) {
      throw new Error(`Render package ${this.assetId} has no prepared flight records.`);
    }

    const externalOwner = instanceOptions.residencyOwner || null;
    const owner = externalOwner || this.#lifecycle.createOwner('flight-render-instance', this.contentHash);
    const retained = this.#lifecycle.residency.retain(this.#lifecycle.entry.key, owner, {
      role: instanceOptions.residencyRole || 'flight-render-package-instance',
      sectorId: instanceOptions.sectorId || null,
    });
    if (!retained && !externalOwner) {
      throw new Error(`Render package ${this.assetId} could not retain flight instance residency.`);
    }

    try {
      const root = new THREE.Group();
      root.name = instanceOptions.name == null
        ? `FlightRenderPackage_${this.assetId}`
        : String(instanceOptions.name);
      root.userData = {
        ...(instanceOptions.userData || {}),
        spacefaceRenderPackage: {
          assetId: this.assetId,
          contentHash: this.contentHash,
        },
        spacefaceFlightRenderPackage: {
          schema: 'spaceface.flightRenderPackage.v1',
          route: 'flight-static-v3',
          fallback: false,
          primitiveCount: prepared.primitives.length,
          markerCount: prepared.markers.length,
        },
      };

      const planNodes = [root];
      for (const primitive of prepared.primitives) {
        const object = new THREE.Mesh(primitive.geometry, primitive.material);
        object.name = primitive.name || `FlightPrimitive_${planNodes.length}`;
        primitive.matrix.decompose(object.position, object.quaternion, object.scale);
        object.userData = {
          spacefacePartUrl: prepared.url,
          spacefaceTags: primitive.tags || {},
          spacefaceFlightStaticLane: true,
        };
        root.add(object);
        planNodes.push(object);
      }

      const markerNodes = new Map();
      for (const marker of prepared.markers) {
        const object = new THREE.Object3D();
        object.name = marker.name || `FlightMarker_${planNodes.length}`;
        marker.matrix.decompose(object.position, object.quaternion, object.scale);
        object.userData = {
          ...(marker.userData || {}),
          spacefacePartUrl: prepared.url,
          spacefaceTags: marker.tags || {},
        };
        root.add(object);
        planNodes.push(object);
        markerNodes.set(object.name, object);
      }

      const nodes = new Map();
      const anchors = new Map();
      for (const record of this.metadata.anchors || []) {
        const object = markerNodes.get(record.nodeName);
        if (object) anchors.set(record.id, object);
      }

      const counters = this.#counters && this.#counters.isEnabled() ? this.#counters : null;
      if (counters) {
        counters.countPlanInstantiation(planNodes.length, 'flight-static-v3');
        counters.countObject3dConstructed(planNodes.length, 'flight-static-v3');
      }

      let disposed = false;
      return Object.freeze({
        route: 'flight-static-v3',
        assetId: this.assetId,
        contentHash: this.contentHash,
        root,
        nodes,
        anchors,
        dynamicGroups: new Map(),
        planNodes,
        planEntries: null,
        get disposed() {
          return disposed;
        },
        dispose: (reason = 'flight-render-package-instance-disposed') => {
          if (disposed) return false;
          disposed = true;
          if (!externalOwner) this.#lifecycle.residency.releaseOwner(owner, reason);
          return true;
        },
      });
    } catch (error) {
      if (!externalOwner) {
        this.#lifecycle.residency.releaseOwner(owner, 'flight-render-package-instance-create-failed');
      }
      throw error;
    }
  }
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function normalizeExpectedContentHash(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new Error('Render package expectedContentHash must be lowercase SHA-256 hex.');
  }
  return value;
}

function normalizeExpectedRuntimeHash(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new Error('Render package expectedRuntimeHash must be lowercase SHA-256 hex.');
  }
  return value;
}

function runtimePackageSignature(metadata) {
  return stableJsonStringify({
    content: renderPackageContentIdentity(metadata),
    runtimeHash: metadata.runtimeHash || null,
  });
}

async function resolveMetadata(metadataOrUrl, options, fetchImpl, cacheMode = 'no-cache') {
  if (metadataOrUrl && typeof metadataOrUrl === 'object') {
    return { metadata: metadataOrUrl, baseUrl: options.baseUrl || '' };
  }
  if (typeof metadataOrUrl !== 'string' || !metadataOrUrl) {
    throw new Error('Render package loader requires metadata or a render-package.json URL.');
  }
  if (typeof fetchImpl !== 'function') throw new Error('Render package loader requires fetch to load metadata URLs.');
  const response = await fetchImpl(metadataOrUrl, { cache: cacheMode });
  if (!response.ok) throw new Error(`Render package metadata fetch failed: HTTP ${response.status} ${metadataOrUrl}`);
  const metadata = await response.json();
  const responseUrl = typeof response.url === 'string' && response.url
    ? response.url
    : metadataOrUrl;
  return { metadata, baseUrl: resourceBaseUrl(responseUrl) };
}

function isStalePackageCacheError(error) {
  const message = String(error && error.message || error);
  return /trust-anchor mismatch|content hash mismatch|SHA-256 mismatch|byte length mismatch/i.test(message);
}

// A hung fetch would wedge the package task forever: the cache entry only evicts on settle,
// so an unsettled corpse pins every later request to the same dead promise. AbortSignal.timeout
// makes the task reject — a normal failure that self-evicts and retries on re-request.
const RENDER_PACKAGE_FETCH_TIMEOUT_MS = 90000;

async function fetchVerifiedRenderBytes(fetchImpl, url, metadata) {
  const read = async (cache) => {
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(RENDER_PACKAGE_FETCH_TIMEOUT_MS) : null;
    const response = await fetchImpl(url, signal ? { cache, signal } : { cache });
    if (!response.ok) throw new Error(`Render package GLB fetch failed: HTTP ${response.status} ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  // Hash each read ONCE. The first-pass `matches()` helper hashed the bytes to decide whether to
  // re-read, and the verification below then hashed the very same bytes again — two full SHA-256
  // passes over every render package on the happy path, and the packages are ~125 MB of GLB per
  // boot. Both checks are preserved exactly; only the duplicate pass is gone.
  const digestOf = async (candidate) => (
    candidate.byteLength === metadata.render.bytes ? sha256Hex(candidate) : null
  );
  // First read: zero-copy worker hash. The bytes come back on the same buffer, so the only main-thread
  // copy of each streamed package (the worker's private copy) is gone. A worker lost mid-hash takes
  // the buffer with it; that read is then treated like a stale read and re-fetched below. Package URLs
  // are content-hash immutable, so force-cache skips the ETag revalidation round-trip 'no-cache' paid
  // per fetch; a stale or corrupted body still fails the SHA-256 check and re-reads via 'reload' below.
  let bytes = await read('force-cache');
  let digest = null;
  if (bytes.byteLength === metadata.render.bytes) {
    const kept = await sha256HexKeepingBytes(bytes);
    bytes = kept.bytes;
    digest = kept.hex;
  }
  if (!bytes || digest !== metadata.render.sha256) {
    bytes = await read('reload');
    digest = await digestOf(bytes);
  }
  if (bytes.byteLength !== metadata.render.bytes) {
    throw new Error(`Render package byte length mismatch for ${metadata.assetId}: ${bytes.byteLength} != ${metadata.render.bytes}.`);
  }
  if (digest !== metadata.render.sha256) {
    throw new Error(`Render package SHA-256 mismatch for ${metadata.assetId}: ${digest} != ${metadata.render.sha256}.`);
  }
  return bytes;
}

// Meshopt decode runs on the decoder's own blob-URL WASM worker pool rather than the present
// thread: decode is the dominant synchronous stage inside an authored admission job, so every
// meshopt buffer decoded on the glass thread is a frame hitch while a model arrives. The vendored
// pool is CSP-legal (worker-src allows blob:), uses transferable buffers both directions, and
// GLTFLoader already prefers decodeGltfBufferAsync, which falls back to the main thread whenever
// the pool is empty — so a failed spawn (or a Worker-less host such as node --test) keeps the
// old behaviour with no caller changes.
let meshoptWorkerPoolStarted = false;
export function startMeshoptWorkerPool(MeshoptDecoder, options = {}) {
  if (meshoptWorkerPoolStarted) return;
  try {
    if (typeof Worker !== 'function' || typeof Blob !== 'function'
        || !MeshoptDecoder || typeof MeshoptDecoder.useWorkers !== 'function') return;
    const cores = (typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency))
      ? navigator.hardwareConcurrency : 4;
    // The KTX2 transcoder already owns a 4-worker pool; keep this lane capped so decode bursts
    // cannot evict the present thread's neighbours on small hosts.
    MeshoptDecoder.useWorkers(Math.max(1, Math.min(4, cores - 1)));
    // The per-decoder cap alone still lets a meshopt burst plus a KTX2 burst oversubscribe
    // cores; route worker decodes through the shared cross-decoder budget (FIFO, so the
    // decoder's own least-pending dispatch order is unchanged). decodeGltfBufferAsync is the
    // pool's only intake — the sync decoders and the no-worker fallback stay main-thread.
    const decodeGltfBufferAsync = MeshoptDecoder.decodeGltfBufferAsync;
    if (typeof decodeGltfBufferAsync === 'function' && decodeGltfBufferAsync.spacefaceDecodeBudgetGated !== true) {
      const gated = async function gatedMeshoptDecodeGltfBufferAsync(count, size, source, mode, filter) {
        const admission = createAsyncAdmission({ label: 'meshopt-decode', ...options.admissionTimers });
        let release = null;
        try {
          release = await sharedDecodeTaskBudget().acquire({
            decodeClass: activeDecodeClass(), signal: admission.signal,
          });
          admission.assertActive();
          return await admission.wait(decodeGltfBufferAsync.call(this, count, size, source, mode, filter));
        } finally {
          release?.();
          admission.finish();
        }
      };
      gated.spacefaceDecodeBudgetGated = true;
      MeshoptDecoder.decodeGltfBufferAsync = gated;
    }
    meshoptWorkerPoolStarted = true;
  } catch (error) {
    console.warn('[renderPackageLoader] meshopt worker decode unavailable; decoding on the present thread', error);
  }
}

function createDefaultGlbDecoder({ fetchImpl, configureGltfLoader }) {
  return async (url, metadata) => {
    if (typeof fetchImpl !== 'function') throw new Error('Render package loader requires fetch to load render.glb.');
    let bytes = await fetchVerifiedRenderBytes(fetchImpl, url, metadata);

    // Structural pre-pass (glbPrepass.js): the verified GLB goes to a worker by transfer, which
    // batch-decodes every meshopt bufferView and slices embedded image bytes, then transfers it all
    // back in one reply — replacing ~200 per-bufferView worker round trips plus one main-thread
    // memcpy per texture. The stock parse below then serves identical bytes from parser maps; when
    // the worker declines or is unavailable, `buffer` is simply the GLB as fetched.
    let buffer = bytes.buffer;
    let predecodedBufferViews = null;
    let preslicedSourceBytes = null;
    if (bytes.byteOffset === 0 && bytes.byteLength === buffer.byteLength) {
      const prepared = await sharedGlbPrepasser().prepass(buffer);
      if (prepared === null) {
        // The worker died holding the buffer; re-read (packages are content-hash immutable).
        bytes = await fetchVerifiedRenderBytes(fetchImpl, url, metadata);
        buffer = bytes.buffer;
      } else {
        buffer = prepared.glb;
        predecodedBufferViews = prepared.bufferViews;
        preslicedSourceBytes = prepared.sourceBytes;
      }
    }

    defaultDecoderModules ||= Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
    ]);
    const [{ GLTFLoader }, { MeshoptDecoder }] = await defaultDecoderModules;
    startMeshoptWorkerPool(MeshoptDecoder);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    if ((predecodedBufferViews && predecodedBufferViews.size) || (preslicedSourceBytes && preslicedSourceBytes.size)) {
      loader.register((parser) => {
        parser.predecodedBufferViews = predecodedBufferViews;
        parser.preslicedSourceBytes = preslicedSourceBytes;
        return { name: 'SpaceFaceGlbPrepass' };
      });
    }
    if (typeof configureGltfLoader === 'function') await configureGltfLoader(loader, metadata);
    const gltf = await scheduleGltfParse(() => loader.parseAsync(buffer, resourceBaseUrl(url)));
    // Cross-package image-source dedupe: embedded PNG/JPEG copies collapse onto one THREE.Source
    // per distinct byte payload; embedded KTX2 sources already dedupe inside the texture plugin.
    // Paced through the class lanes so clustered parse replies can't stack the sync walk.
    await scheduleGltfCompile(() => dedupeGltfTextureSources(gltf), activeDecodeClass());
    return gltf;
  };
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function collectImmutableResources(root, stats = null) {
  const resources = new Set();
  root.traverse((object) => {
    if (stats) stats.nodes++;
    if (object.geometry) markImmutableResource(object.geometry, resources);
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      markImmutableResource(material, resources);
      collectTextures(material, resources, new Set());
    }
  });
  return resources;
}

function markImmutableResource(resource, resources) {
  if (!resource || typeof resource !== 'object' || resources.has(resource)) return;
  resource.userData = { ...(resource.userData || {}), spacefaceRenderPackageImmutable: true };
  resources.add(resource);
}

function collectTextures(value, resources, seen) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value.isTexture) {
    markImmutableResource(value, resources);
    return;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
  for (const child of Object.values(value)) collectTextures(child, resources, seen);
}

function disposeUnregisteredResources(resources) {
  for (const resource of resources) {
    if (resource && typeof resource.dispose === 'function') {
      try { resource.dispose(); } catch (_) {}
    }
  }
}

export function disposeDecodedResources(decoded, extraResources = null) {
  const template = decoded?.scene || decoded;
  if (!template || typeof template.traverse !== 'function') return;
  const resources = collectImmutableResources(template);
  if (extraResources) for (const resource of extraResources) resources.add(resource);
  disposeUnregisteredResources(resources);
}

function resolveRenderUrl(uri, baseUrl) {
  const target = String(uri || '');
  const base = String(baseUrl || '');
  if (!base || ABSOLUTE_URL_RE.test(target)) return target;

  if (target.startsWith('//')) {
    if (!ABSOLUTE_URL_RE.test(base)) return target;
    return new URL(target, base).href;
  }

  if (target.startsWith('/')) {
    if (!ABSOLUTE_URL_RE.test(base)) return target;
    return new URL(target, base).href;
  }

  if (ABSOLUTE_URL_RE.test(base)) return new URL(target, base).href;
  if (base.startsWith('//')) {
    const absolute = new URL(target, `https:${base}`);
    return `//${absolute.host}${absolute.pathname}${absolute.search}${absolute.hash}`;
  }

  return resolvePathReference(target, base);
}

function resolvePathReference(target, base) {
  const { path: targetPath, suffix } = splitUrlReference(target);
  const { path: basePath } = splitUrlReference(base);
  if (!targetPath) return `${basePath}${suffix}`;

  const lastSlash = basePath.lastIndexOf('/');
  const baseDirectory = basePath.endsWith('/')
    ? basePath
    : lastSlash >= 0
      ? basePath.slice(0, lastSlash + 1)
      : '';
  const rooted = baseDirectory.startsWith('/');
  const segments = [];
  for (const segment of `${baseDirectory}${targetPath}`.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length && segments.at(-1) !== '..') segments.pop();
      else if (!rooted) segments.push(segment);
      continue;
    }
    segments.push(segment);
  }

  let path = `${rooted ? '/' : ''}${segments.join('/')}`;
  if (targetPath.endsWith('/') && path && !path.endsWith('/')) path += '/';
  return `${path}${suffix}`;
}

function splitUrlReference(value) {
  const text = String(value || '');
  const queryIndex = text.indexOf('?');
  const hashIndex = text.indexOf('#');
  const suffixIndex = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((first, index) => Math.min(first, index), text.length);
  return {
    path: text.slice(0, suffixIndex),
    suffix: text.slice(suffixIndex),
  };
}

function resourceBaseUrl(url) {
  try {
    return new URL('.', url).href;
  } catch (_) {
    const slash = String(url).lastIndexOf('/');
    return slash >= 0 ? String(url).slice(0, slash + 1) : '';
  }
}

// GLB bytes are hashed in a worker so verification never runs on the main thread; the calling thread is
// the fallback (renderPackageDigest.js).
let renderPackageDigester = null;
function sha256Hex(bytes) {
  renderPackageDigester ||= createRenderPackageDigester();
  return renderPackageDigester.sha256Hex(bytes);
}

function sha256HexKeepingBytes(bytes) {
  renderPackageDigester ||= createRenderPackageDigester();
  return renderPackageDigester.sha256HexKeepingBytes(bytes);
}
