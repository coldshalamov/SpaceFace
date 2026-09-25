import assert from 'node:assert/strict';
import test from 'node:test';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

import {
  isPackagedLiveWholeShipFile,
  wholeShipLodFileForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';

// Comprehensive whole-ship LOD quality and runtime wiring test.
// Verifies across all production whole ships:
// 1. LOD1 and LOD2 are genuine geometric simplifications (LOD1 <= 45%, LOD2 <= 30% of LOD0).
// 2. LOD2 is strictly lighter than LOD1, and retains readable silhouette (>1000 tris, no box collapse).
// 3. Sockets are 100% preserved across all tiers.
// 4. Runtime demotion is packaged-live and resolves correctly for all ships.

const WHOLE_SHIP_STEMS = [
  'wasp_production_v1',
  'pelican_production_v1',
  'mule_production_v1',
  'drifter_production_v1',
  'hornet_production_v1',
  'ironback_production_v1',
  'bastion_production_v1',
  'atlas_production_v1',
  'ranger_production_v1',
  'warden_production_v1',
  'colossus_production_v1',
  'leviathan_production_v1',
  'massline_express_liner_v1',
];

const ROSTER_DEF_IDS = [
  'ship_wasp', 'ship_pelican', 'ship_mule', 'ship_drifter', 'ship_hornet',
  'ship_ironback', 'ship_bastion', 'ship_atlas', 'ship_ranger', 'ship_warden',
  'ship_colossus', 'ship_leviathan',
];

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const inspectCache = new Map();
async function inspect(file) {
  if (inspectCache.has(file)) return inspectCache.get(file);
  const doc = await io.read(`assets/ships/parts/wholeships/${file}`);
  const root = doc.getRoot();
  let triangles = 0;
  const sockets = [];
  for (const node of root.listNodes()) {
    const name = node.getName() || '';
    if (name.startsWith('SOCKET_')) sockets.push(name);
    const mesh = node.getMesh();
    if (!mesh) continue;
    let tris = 0;
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
    if (name !== 'COLLISION_HULL') {
      triangles += tris;
    }
  }
  const result = { triangles, sockets: sockets.sort() };
  inspectCache.set(file, result);
  return result;
}

test('all production whole ships have real geometric simplifications for LOD1 and LOD2', async () => {
  for (const stem of WHOLE_SHIP_STEMS) {
    const lod0 = await inspect(`${stem}.glb`);
    const lod1 = await inspect(`${stem}_lod1.glb`);
    const lod2 = await inspect(`${stem}_lod2.glb`);

    assert.ok(lod0.triangles > 10000, `${stem} LOD0 baseline must be >10k tris (got ${lod0.triangles})`);
    assert.ok(
      lod1.triangles <= lod0.triangles * 0.45,
      `${stem} LOD1 (${lod1.triangles}) must be <= 45% of LOD0 (${lod0.triangles})`,
    );
    assert.ok(
      lod2.triangles <= lod0.triangles * 0.30,
      `${stem} LOD2 (${lod2.triangles}) must be <= 30% of LOD0 (${lod0.triangles})`,
    );
    assert.ok(
      lod2.triangles < lod1.triangles,
      `${stem} LOD2 (${lod2.triangles}) must be lighter than LOD1 (${lod1.triangles})`,
    );
    assert.ok(
      lod2.triangles >= 1000,
      `${stem} LOD2 (${lod2.triangles}) must retain >1000 tris to avoid box/blob collapse`,
    );
  }
});

test('all production whole ships preserve sockets across all LOD levels', async () => {
  for (const stem of WHOLE_SHIP_STEMS) {
    const lod0 = await inspect(`${stem}.glb`);
    const lod1 = await inspect(`${stem}_lod1.glb`);
    const lod2 = await inspect(`${stem}_lod2.glb`);

    assert.deepEqual(
      lod1.sockets,
      lod0.sockets,
      `${stem} LOD1 sockets must exactly match LOD0`,
    );
    assert.deepEqual(
      lod2.sockets,
      lod0.sockets,
      `${stem} LOD2 sockets must exactly match LOD0`,
    );
  }
});

test('all whole-ship roster definitions are registered and packaged-live at all LOD tiers', () => {
  for (const defId of ROSTER_DEF_IDS) {
    const entity = { type: 'ship', data: { defId } };
    const selection = wholeShipVisualForEntity(entity, { requiredWholeShip: true });
    assert.ok(selection, `${defId} must have whole-ship visual selection`);
    assert.ok(selection.lodFamily, `${defId} must have lodFamily`);

    const lod0 = wholeShipLodFileForEntity(entity, 'lod0', { requiredWholeShip: true });
    const lod1 = wholeShipLodFileForEntity(entity, 'lod1', { requiredWholeShip: true });
    const lod2 = wholeShipLodFileForEntity(entity, 'lod2', { requiredWholeShip: true });

    assert.ok(isPackagedLiveWholeShipFile(lod0), `${defId} LOD0 ${lod0} must be packaged-live`);
    assert.ok(isPackagedLiveWholeShipFile(lod1), `${defId} LOD1 ${lod1} must be packaged-live`);
    assert.ok(isPackagedLiveWholeShipFile(lod2), `${defId} LOD2 ${lod2} must be packaged-live`);

    assert.equal(lod0, selection.lodFamily.lod0, `${defId} LOD0 file mismatch`);
    assert.equal(lod1, selection.lodFamily.lod1, `${defId} LOD1 file mismatch`);
    assert.equal(lod2, selection.lodFamily.lod2, `${defId} LOD2 file mismatch`);
  }
});
