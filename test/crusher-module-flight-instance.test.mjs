import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { readGlbJson, sceneFromGlbJson } from '../scripts/lib/renderPackageRuntimeTable.mjs';
import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';
import { prepareRenderPackageBlueprint } from '../src/render/assetLoader.js';
import { renderPackagePilotForAssetId } from '../src/render/renderPackageManifest.js';

test('crusher flight instance retains the authored socket anchors and static primitives', async () => {
  const dir = 'assets/ships/release/render-packages/crusher-module';
  const metadata = JSON.parse(await readFile(`${dir}/render-package.json`, 'utf8'));
  const glb = readGlbJson(await readFile(`${dir}/render.glb`));
  const pilot = renderPackagePilotForAssetId(metadata.assetId);
  assert.equal(pilot.flightStaticV3, true);
  const loader = createRenderPackageLoader({
    loadGlb: async () => ({ scene: sceneFromGlbJson(glb), asset: glb.asset || {} }),
    residency: createAssetResidencyRegistry(),
    prepareDecoded(decoded, pkg, _url, plan) {
      return prepareRenderPackageBlueprint(pilot, decoded, pkg, { plan });
    },
  });
  try {
    const loaded = await loader.load(metadata, { baseUrl: 'file:///packages/' });
    const generic = loaded.createInstance();
    const flight = loaded.createFlightInstance();
    try {
      assert.equal(flight.route, 'flight-static-v3');
      assert.equal(loaded.prepared.primitives.length, 9);
      const meshes = flight.planNodes.filter((node) => node.isMesh);
      assert.equal(meshes.length, 9);
      for (const [index, mesh] of meshes.entries()) {
        assert.equal(mesh.geometry, loaded.prepared.primitives[index].geometry);
        assert.equal(mesh.material, loaded.prepared.primitives[index].material);
      }
      for (const [name, id] of [
        ['SOCKET_Feed', 'sf.render.crusher-module.anchor.socket-feed'],
        ['SOCKET_Discharge', 'sf.render.crusher-module.anchor.socket-discharge'],
      ]) {
        const anchor = flight.anchors.get(id);
        const genericAnchor = generic.anchors.get(id);
        assert.ok(anchor, `${id} resolves on the flight instance`);
        assert.ok(genericAnchor, `${id} resolves on the generic instance`);
        assert.equal(anchor.name, name);
        assert.equal(anchor.userData.spacefaceTags.socket, true);
        flight.root.updateMatrixWorld(true);
        generic.root.updateMatrixWorld(true);
        assert.deepEqual(anchor.matrixWorld.toArray(), genericAnchor.matrixWorld.toArray());
      }
      assert.deepEqual(metadata.dynamicGroups, []);
      assert.equal(flight.dynamicGroups.size, 0);
      const parts = metadata.nodes.filter((node) => !['crusher_module', 'COLLISION_HULL', 'SOCKET_Feed', 'SOCKET_Discharge'].includes(node.nodeName));
      assert.equal(parts.length, 19);
      for (const part of parts) {
        assert.equal(part.role, 'immutable');
        assert.ok(generic.nodes.get(part.id), `${part.nodeName} remains a resolvable semantic record`);
      }
    } finally {
      generic.dispose();
      flight.dispose();
    }
  } finally {
    loader.dispose();
  }
});
