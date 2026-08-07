import { clone as cloneObjectGraph } from 'three/addons/utils/SkeletonUtils.js';

import {
  assertValidRenderPackage,
  computeRenderPackageContentHash,
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

  const createOwner = (role, contentHash) => Object.freeze({
    type: 'render-package',
    role,
    contentHash,
    sequence: ++ownerSequence,
  });

  async function load(metadataOrUrl, loadOptions = {}) {
    if (disposed) throw new Error('Render package loader has been disposed.');
    const resolved = await resolveMetadata(metadataOrUrl, loadOptions, fetchImpl);
    return loadResolved(
      resolved.metadata,
      resolved.baseUrl,
      loadOptions.expectedContentHash ?? options.expectedContentHash ?? null,
    );
  }

  async function loadResolved(metadataValue, baseUrl, expectedContentHash) {
    if (disposed) throw new Error('Render package loader has been disposed.');
    assertValidRenderPackage(metadataValue);
    const expectedHash = normalizeExpectedContentHash(expectedContentHash);
    const metadata = deepFreeze(stableJsonValue(metadataValue));
    const computedHash = await computeRenderPackageContentHash(metadata, {
      ...(contentDigest ? { digest: contentDigest } : {}),
    });
    if (disposed) throw new Error('Render package loader has been disposed.');
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

    const signature = runtimePackageSignature(metadata);
    const contentHash = metadata.contentHash;
    const existing = cache.get(contentHash);
    if (existing) {
      if (existing.signature !== signature) {
        throw new Error(`Render package content hash collision for ${contentHash}.`);
      }
      const loaded = await existing.promise;
      if (existing.evicted) {
        if (cache.get(contentHash) === existing) cache.delete(contentHash);
        return loadResolved(metadata, baseUrl, expectedHash);
      }
      if (!existing.packageOwner && !retainPackageOwner(existing)) {
        throw new Error(`Render package ${metadata.assetId} could not reacquire residency.`);
      }
      return loaded;
    }

    const renderUrl = resolveRenderUrl(metadata.render.uri, baseUrl);
    const entry = {
      key: `render-package:${contentHash}`,
      signature,
      metadata,
      renderUrl,
      promise: null,
      loaded: null,
      packageOwner: createOwner('package-cache', contentHash),
      request: null,
      evicted: false,
    };
    entry.request = residency.beginRequest(entry.key, entry.packageOwner, {
      role: 'render-package-cache',
    });
    entry.promise = Promise.resolve()
      .then(() => {
        if (counters && counters.isEnabled()) counters.countPackageDecode(metadata.assetId);
        return decodeGlb(renderUrl, metadata);
      })
      .then(async (decoded) => {
        let prepared = null;
        try {
          prepared = prepareDecoded
            ? await prepareDecoded(decoded, metadata, renderUrl)
            : null;
        } catch (error) {
          disposeDecodedResources(decoded);
          throw error;
        }
        const loaded = createLoadedPackage(metadata, decoded, renderUrl, {
          residency,
          entry,
          createOwner,
          releasePackageOwner,
        }, prepared, counters);
        entry.loaded = loaded;
        try {
          residency.registerAsset(entry.key, loaded.resources, {
            byteSize: metadata.render.bytes,
            metadata: {
              assetId: metadata.assetId,
              contentHash,
            },
            onEvict() {
              entry.evicted = true;
              loaded.markEvicted();
              if (cache.get(contentHash) === entry) cache.delete(contentHash);
            },
          });
        } catch (error) {
          disposeUnregisteredResources(loaded.resources);
          throw error;
        }
        const retained = entry.request.commit();
        entry.request = null;
        if (!retained) {
          throw new Error(`Render package ${metadata.assetId} load was released before decode completed.`);
        }
        return loaded;
      });
    cache.set(contentHash, entry);
    entry.promise.catch(() => {
      if (entry.request) entry.request.cancel('render-package-decode-failed');
      entry.request = null;
      if (cache.get(contentHash) === entry) cache.delete(contentHash);
    });
    return entry.promise;
  }

  function retainPackageOwner(entry) {
    if (disposed || entry.evicted) return false;
    const owner = createOwner('package-cache', entry.metadata.contentHash);
    if (!residency.retain(entry.key, owner, { role: 'render-package-cache' })) return false;
    entry.packageOwner = owner;
    entry.loaded?.markRetained();
    return true;
  }

  function releasePackageOwner(entry, reason = 'render-package-released') {
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
    for (const entry of cache.values()) releasePackageOwner(entry, reason);
    return true;
  }

  function diagnostics() {
    return Object.freeze({
      schema: 'spaceface.renderPackageLoader.v1',
      disposed,
      cacheEntries: cache.size,
      residency: residency.canonicalDiagnostics(),
    });
  }

  return Object.freeze({
    load,
    loadWithSourceFallback,
    release,
    dispose,
    diagnostics,
  });
}

function createLoadedPackage(metadata, decoded, renderUrl, lifecycle, prepared = null, counters = null) {
  const template = decoded?.scene || decoded;
  if (
    !template
    || typeof template.clone !== 'function'
    || typeof template.traverse !== 'function'
    || !Array.isArray(template.children)
  ) {
    throw new Error(`Render package ${metadata.assetId} decoder did not return a Three.js scene root.`);
  }
  const counting = counters && counters.isEnabled() ? counters : null;
  const resourceStats = { nodes: 0 };
  const resources = collectImmutableResources(template, resourceStats);
  if (counting) counting.countGraphTraversal(resourceStats.nodes, 'package-resource-index');
  try {
    const semanticStats = { nodes: 0 };
    indexSemanticNodes(template, metadata, semanticStats);
    if (counting) {
      counting.countRuntimeSemanticCompile('package-load-semantic-index', semanticStats.nodes);
      counting.countGraphTraversal(semanticStats.nodes, 'package-load-semantic-index');
    }
    return new LoadedRenderPackage(
      metadata,
      template,
      renderUrl,
      resources,
      lifecycle,
      prepared,
      counters,
    );
  } catch (error) {
    disposeUnregisteredResources(resources);
    throw error;
  }
}

class LoadedRenderPackage {
  #template;
  #lifecycle;
  #counters;

  constructor(metadata, template, renderUrl, resources, lifecycle, prepared, counters = null) {
    Object.defineProperties(this, {
      assetId: { value: metadata.assetId, enumerable: true },
      contentHash: { value: metadata.contentHash, enumerable: true },
      metadata: { value: metadata, enumerable: true },
      renderUrl: { value: renderUrl, enumerable: true },
      residencyKey: { value: lifecycle.entry.key, enumerable: true },
      resources: { value: Object.freeze([...resources]), enumerable: true },
      prepared: { value: prepared, enumerable: true },
    });
    this.#template = template;
    this.#lifecycle = lifecycle;
    this.#counters = counters;
    this.released = false;
    this.evicted = false;
  }

  markReleased() {
    this.released = true;
  }

  markRetained() {
    this.released = false;
  }

  markEvicted() {
    this.released = true;
    this.evicted = true;
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
      const root = cloneObjectGraph(this.#template);
      if (instanceOptions.name != null) root.name = String(instanceOptions.name);
      root.userData = {
        ...(root.userData || {}),
        ...(instanceOptions.userData || {}),
        spacefaceRenderPackage: {
          assetId: metadata.assetId,
          contentHash: metadata.contentHash,
        },
      };

      const semanticStats = { nodes: 0 };
      const semanticObjects = indexSemanticNodes(root, metadata, semanticStats);
      if (counters) {
        // The recursive clone reconstructed every node the re-index just visited.
        counters.countGraphClone(semanticStats.nodes, 'package-instance');
        counters.countRuntimeSemanticCompile('package-instance-reindex', semanticStats.nodes);
        counters.countGraphTraversal(semanticStats.nodes, 'package-instance-reindex');
      }
      const nodes = new Map(
        metadata.nodes.map((record) => [record.id, semanticObjects.get(record.id)]),
      );
      const anchors = new Map(
        metadata.anchors.map((record) => [record.id, semanticObjects.get(record.id)]),
      );
      const dynamicGroups = new Map();
      for (const record of metadata.dynamicGroups) {
        const node = nodes.get(record.nodeId);
        if (!node) throw new Error(`Render package ${metadata.assetId} dynamic group ${record.id} has no instance node.`);
        dynamicGroups.set(record.id, node);
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

function runtimePackageSignature(metadata) {
  return stableJsonStringify(renderPackageContentIdentity(metadata));
}

async function resolveMetadata(metadataOrUrl, options, fetchImpl) {
  if (metadataOrUrl && typeof metadataOrUrl === 'object') {
    return { metadata: metadataOrUrl, baseUrl: options.baseUrl || '' };
  }
  if (typeof metadataOrUrl !== 'string' || !metadataOrUrl) {
    throw new Error('Render package loader requires metadata or a render-package.json URL.');
  }
  if (typeof fetchImpl !== 'function') throw new Error('Render package loader requires fetch to load metadata URLs.');
  const response = await fetchImpl(metadataOrUrl, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Render package metadata fetch failed: HTTP ${response.status} ${metadataOrUrl}`);
  const metadata = await response.json();
  const responseUrl = typeof response.url === 'string' && response.url
    ? response.url
    : metadataOrUrl;
  return { metadata, baseUrl: resourceBaseUrl(responseUrl) };
}

function createDefaultGlbDecoder({ fetchImpl, configureGltfLoader }) {
  return async (url, metadata) => {
    if (typeof fetchImpl !== 'function') throw new Error('Render package loader requires fetch to load render.glb.');
    const response = await fetchImpl(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Render package GLB fetch failed: HTTP ${response.status} ${url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== metadata.render.bytes) {
      throw new Error(`Render package byte length mismatch for ${metadata.assetId}: ${bytes.byteLength} != ${metadata.render.bytes}.`);
    }
    const digest = await sha256Hex(bytes);
    if (digest !== metadata.render.sha256) {
      throw new Error(`Render package SHA-256 mismatch for ${metadata.assetId}: ${digest} != ${metadata.render.sha256}.`);
    }

    defaultDecoderModules ||= Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
    ]);
    const [{ GLTFLoader }, { MeshoptDecoder }] = await defaultDecoderModules;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    if (typeof configureGltfLoader === 'function') await configureGltfLoader(loader, metadata);
    return loader.parseAsync(bytes.buffer, resourceBaseUrl(url));
  };
}

function indexSemanticNodes(root, metadata, stats = null) {
  const records = new Map(
    [...metadata.nodes, ...metadata.anchors].map((record) => [record.id, record]),
  );
  const objects = new Map();

  root.traverse((object) => {
    if (stats) stats.nodes++;
    const payload = object.userData?.[RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY];
    if (payload == null) return;
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
      if (localIds.has(recordId) || objects.has(recordId)) {
        throw new Error(`Render package semantic locator ${recordId} is duplicated in decoded render.glb.`);
      }
      localIds.add(recordId);
      const record = records.get(recordId);
      if (payload.rawNodeName !== record.nodeName) {
        throw new Error(
          `Render package semantic locator ${recordId} names ${payload.rawNodeName || '(unnamed)'} instead of ${record.nodeName}.`,
        );
      }
      objects.set(recordId, object);
    }
  });

  for (const recordId of records.keys()) {
    if (!objects.has(recordId)) {
      throw new Error(`Render package semantic locator ${recordId} is missing from decoded render.glb.`);
    }
  }
  return objects;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectImmutableResources(root, stats = null) {
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

function disposeDecodedResources(decoded) {
  const template = decoded?.scene || decoded;
  if (!template || typeof template.traverse !== 'function') return;
  disposeUnregisteredResources(collectImmutableResources(template));
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

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is required to verify render packages.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
