import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
import { wholeShipVisualForEntity, requiresProductionWholeShipForEntity } from '../src/render/partsLibrary.js';

test('customs uses its packaged hull while patrol and Swarm retain theirs', () => {
  const cases = [
    ['customs_cutter', 'wholeships/hornet_scn_customs_cutter.glb', 'SF_HORNET_SCN_CUSTOMS_CUTTER'],
    ['patrol_lawman', 'wholeships/hornet_scn_interdictor.glb', 'SF_HORNET_SCN_INTERDICTOR'],
    ['warden_escort', 'wholeships/swarm_warden.glb', 'SF_SWARM_WARDEN'],
    ['field_anchor_controller', 'wholeships/swarm_anchor.glb', 'SF_SWARM_ANCHOR'],
    ['mine_layer_jackal', 'wholeships/swarm_jackal.glb', 'SF_SWARM_JACKAL'],
  ];
  for (const [id, file, assetId] of cases) {
    for (const team of [0, 1]) {
      const entity = makeEnemySpawnSpec(id, 5, { x: 0, z: 0 });
      entity.team = team;
      assert.equal(requiresProductionWholeShipForEntity(entity), true, `${id} requires authored admission`);
      const selection = wholeShipVisualForEntity(entity);
      assert.equal(selection?.file, file, `${id} team ${team} file`);
      assert.equal(selection?.assetId, assetId, `${id} team ${team} identity`);
    }
  }
});
