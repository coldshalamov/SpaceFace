import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('cached packages release settled owner-liveness callbacks instead of retaining every prior request', () => {
  const loaderUrl = new URL('../src/render/renderPackageLoader.js', import.meta.url).href;
  const contractUrl = new URL('../src/contracts/renderPackage.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import * as THREE from 'three';
    import { createRenderPackageLoader } from ${JSON.stringify(loaderUrl)};
    import { RENDER_PACKAGE_SCHEMA, renderPackageContentIdentity, stableJsonStringify }
      from ${JSON.stringify(contractUrl)};
    const metadata = {
      schema: RENDER_PACKAGE_SCHEMA, assetId: 'fixture.consumer-retention', kind: 'ship',
      compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
      contentHash: '0'.repeat(64),
      render: { uri: 'render.glb', sha256: '2'.repeat(64), bytes: 256 },
      provenance: {
        sourceGlb: { uri: 'fixture.glb', sha256: '3'.repeat(64), bytes: 512 },
        sourceManifest: null, semantics: { sha256: '4'.repeat(64) },
      },
      nodes: [], anchors: [], dynamicGroups: [], geometry: [], materials: [],
      lods: [], hlods: [], collisions: [], spatialClusters: [],
    };
    metadata.contentHash = createHash('sha256')
      .update(stableJsonStringify(renderPackageContentIdentity(metadata))).digest('hex');
    let decodes = 0;
    const loader = createRenderPackageLoader({ loadGlb: async () => {
      decodes++; return { scene: new THREE.Group() };
    } });
    const refs = [];
    async function requestOne(shared) {
      const ownerState = { alive: true, payload: new Uint8Array(256 * 1024) };
      const ref = new WeakRef(ownerState);
      const options = shared ? {
        getSharedDecodeConsumers: () => [{ isResidencyOwnerActive: () => ownerState.alive }],
      } : { isResidencyOwnerActive: () => ownerState.alive };
      await loader.load(metadata, options);
      return ref;
    }
    for (let i = 0; i < 32; i++) refs.push(await requestOne(i % 2 === 0));
    assert.equal(decodes, 1, 'the real package cache keeps one decoded graph');
    await new Promise(resolve => setImmediate(resolve));
    globalThis.gc();
    const retained = refs.filter(ref => ref.deref() !== undefined).length;
    assert.equal(retained, 0, 'fulfilled cache entries must release every prior owner-liveness closure');
    assert.equal(loader.diagnostics().cacheEntries, 1, 'collection must preserve the decoded cache');
    loader.dispose();
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
});

test('cached packages release completed GLTF parser payloads while keeping the scene usable', () => {
  const loaderUrl = new URL('../src/render/renderPackageLoader.js', import.meta.url).href;
  const contractUrl = new URL('../src/contracts/renderPackage.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import * as THREE from 'three';
    import { createRenderPackageLoader } from ${JSON.stringify(loaderUrl)};
    import { RENDER_PACKAGE_SCHEMA, renderPackageContentIdentity, stableJsonStringify }
      from ${JSON.stringify(contractUrl)};
    const metadata = {
      schema: RENDER_PACKAGE_SCHEMA, assetId: 'fixture.parser-retention', kind: 'ship',
      compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
      contentHash: '0'.repeat(64),
      render: { uri: 'render.glb', sha256: '2'.repeat(64), bytes: 256 },
      provenance: {
        sourceGlb: { uri: 'fixture.glb', sha256: '3'.repeat(64), bytes: 512 },
        sourceManifest: null, semantics: { sha256: '4'.repeat(64) },
      },
      nodes: [], anchors: [], dynamicGroups: [], geometry: [], materials: [],
      lods: [], hlods: [], collisions: [], spatialClusters: [],
    };
    metadata.contentHash = createHash('sha256')
      .update(stableJsonStringify(renderPackageContentIdentity(metadata))).digest('hex');
    let parserRef;
    let decodes = 0;
    const scene = new THREE.Group();
    const loader = createRenderPackageLoader({ loadGlb: async () => {
      decodes++;
      const parser = { bodySource: new Uint8Array(1024 * 1024) };
      parserRef = new WeakRef(parser);
      return { scene, parser };
    } });
    try {
      const loaded = await loader.load(metadata);
      await new Promise(resolve => setImmediate(resolve));
      globalThis.gc();
      await new Promise(resolve => setImmediate(resolve));
      const parserTarget = parserRef.deref();
      if (parserTarget !== undefined) {
        console.error('the completed parser and its binary payload remained reachable');
        loader.dispose();
        process.exit(1);
      }
      assert.strictEqual(await loader.load(metadata), loaded, 'the decoded package must remain cached');
      const instance = loaded.createInstance();
      assert.equal(instance.root instanceof THREE.Group, true, 'the retained scene plan must still instantiate');
      instance.dispose();
      assert.equal(decodes, 1, 'checking the cached package must not decode again');
    } finally {
      loader.dispose();
    }
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
});

test('stale-task subscription does not retain a completed warm owner scope', () => {
  const assetLoaderUrl = new URL('../src/render/assetLoader.js', import.meta.url).href;
  const loaderUrl = new URL('../src/render/renderPackageLoader.js', import.meta.url).href;
  const contractUrl = new URL('../src/contracts/renderPackage.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import * as THREE from 'three';
    import { loadAuthoredRenderPackagePilot } from ${JSON.stringify(assetLoaderUrl)};
    import { createRenderPackageLoader } from ${JSON.stringify(loaderUrl)};
    import { RENDER_PACKAGE_SCHEMA, renderPackageContentIdentity, stableJsonStringify }
      from ${JSON.stringify(contractUrl)};

    const metadata = {
      schema: RENDER_PACKAGE_SCHEMA, assetId: 'fixture.warm-scope-retention', kind: 'ship',
      compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
      contentHash: '0'.repeat(64),
      render: { uri: 'render.glb', sha256: '2'.repeat(64), bytes: 256 },
      provenance: {
        sourceGlb: { uri: 'fixture.glb', sha256: '3'.repeat(64), bytes: 512 },
        sourceManifest: null, semantics: { sha256: '4'.repeat(64) },
      },
      nodes: [], anchors: [], dynamicGroups: [], geometry: [], materials: [],
      lods: [], hlods: [], collisions: [], spatialClusters: [],
    };
    metadata.contentHash = createHash('sha256')
      .update(stableJsonStringify(renderPackageContentIdentity(metadata))).digest('hex');
    const sourceUrl = 'assets/fixture.glb';
    const loader = createRenderPackageLoader({
      loadGlb: async () => ({ scene: new THREE.Group() }),
      prepareDecoded: async () => Object.freeze({ url: sourceUrl }),
    });
    const runtime = { assets: new Map(), failures: new Map(), retiring: false, renderPackages: loader };
    const pilot = { metadataUrl: metadata, expectedContentHash: metadata.contentHash, assetId: metadata.assetId };
    async function completeWarmLoad() {
      const ownerScope = { alive: true, payload: new Uint8Array(256 * 1024) };
      const ownerRef = new WeakRef(ownerScope);
      await loadAuthoredRenderPackagePilot(runtime, pilot, sourceUrl, {
        slot: 'hull', residencyRole: 'opening-warm',
        isResidencyOwnerActive: () => ownerScope.alive,
      });
      return ownerRef;
    }
    try {
      const ownerRef = await completeWarmLoad();
      assert.equal(runtime.assets.size, 1, 'the fulfilled source URL cache remains usable');
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setImmediate(resolve));
        globalThis.gc();
      }
      assert.equal(ownerRef.deref(), undefined,
        'a package stale-listener callback must not retain the completed creator/warm scope');
      process.exit(0);
    } catch (error) {
      console.error(error?.stack || error);
      process.exit(1);
    }
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
});

test('evicting a completed package does not abort its finished decode admission', () => {
  const loaderUrl = new URL('../src/render/renderPackageLoader.js', import.meta.url).href;
  const residencyUrl = new URL('../src/render/assetResidency.js', import.meta.url).href;
  const contractUrl = new URL('../src/contracts/renderPackage.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import * as THREE from 'three';
    const NativeAbortController = globalThis.AbortController;
    const abortedReasons = [];
    globalThis.AbortController = class TrackedAbortController extends NativeAbortController {
      abort(reason) {
        abortedReasons.push(reason);
        return super.abort(reason);
      }
    };
    const { createRenderPackageLoader } = await import(${JSON.stringify(loaderUrl)});
    const { createAssetResidencyRegistry } = await import(${JSON.stringify(residencyUrl)});
    const { RENDER_PACKAGE_SCHEMA, renderPackageContentIdentity, stableJsonStringify }
      = await import(${JSON.stringify(contractUrl)});
    const metadata = {
      schema: RENDER_PACKAGE_SCHEMA, assetId: 'fixture.settled-admission', kind: 'ship',
      compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
      contentHash: '0'.repeat(64),
      render: { uri: 'render.glb', sha256: '2'.repeat(64), bytes: 256 },
      provenance: {
        sourceGlb: { uri: 'fixture.glb', sha256: '3'.repeat(64), bytes: 512 },
        sourceManifest: null, semantics: { sha256: '4'.repeat(64) },
      },
      nodes: [], anchors: [], dynamicGroups: [], geometry: [], materials: [],
      lods: [], hlods: [], collisions: [], spatialClusters: [],
    };
    metadata.contentHash = createHash('sha256')
      .update(stableJsonStringify(renderPackageContentIdentity(metadata))).digest('hex');
    try {
      const residency = createAssetResidencyRegistry();
      const loader = createRenderPackageLoader({ residency, loadGlb: async () => ({ scene: new THREE.Group() }) });
      await loader.load(metadata);
      assert.equal(abortedReasons.length, 0, 'successful decode settles without aborting its admission');
      residency.releaseUnreferencedCacheOwners('completed-package-eviction', { minAgeMs: 0 });
      assert.equal(abortedReasons.length, 0,
        'post-settlement eviction must not attach an abort Error to the retained lifecycle entry');
      process.exit(0);
    } catch (error) {
      console.error(error?.stack || error);
      process.exit(1);
    }
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
});
