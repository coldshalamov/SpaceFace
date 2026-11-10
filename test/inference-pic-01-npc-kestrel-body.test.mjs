import assert from 'node:assert/strict';
import test from 'node:test';

import {
  requiresProductionWholeShipForEntity,
  wholeShipVisualForEntity,
  authoredPreloadPlanForEntity,
  wholeShipLodFileForEntity,
  isPackagedLiveWholeShipFile,
} from '../src/render/partsLibrary.js';

test('PIC-01: An NPC Kestrel resolves through the packaged whole-ship allowlist as a complete body', () => {
  const npcKestrel = {
    id: 'npc-kestrel-test',
    type: 'ship',
    isPlayer: false,
    data: { defId: 'ship_kestrel' },
  };

  assert.equal(requiresProductionWholeShipForEntity(npcKestrel), true, 'NPC kestrel must require production whole ship');

  const visual = wholeShipVisualForEntity(npcKestrel);
  assert.ok(visual, 'NPC kestrel must resolve a whole ship visual');
  assert.equal(visual.file, 'wholeships/kestrel.glb', 'NPC kestrel must resolve wholeships/kestrel.glb');
  assert.equal(isPackagedLiveWholeShipFile(visual.file), true, 'resolved body must be packaged live');

  const plan = authoredPreloadPlanForEntity(npcKestrel);
  assert.deepEqual(plan, { hull: ['wholeships/kestrel.glb'] }, 'preload plan must only contain the complete whole ship hull');

  const lod1 = wholeShipLodFileForEntity(npcKestrel, 'lod1');
  assert.equal(lod1, 'wholeships/kestrel_lod1.glb');
  assert.equal(isPackagedLiveWholeShipFile(lod1), true);

  const lod2 = wholeShipLodFileForEntity(npcKestrel, 'lod2');
  assert.equal(lod2, 'wholeships/kestrel_lod2.glb');
  assert.equal(isPackagedLiveWholeShipFile(lod2), true);
});
