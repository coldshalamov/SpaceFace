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
