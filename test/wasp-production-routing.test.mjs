import assert from 'node:assert/strict';

import {
  authoredBootstrapPreloadPlan,
  authoredPreloadPlanForEntity,
  resolveRequiredWholeShipRecord,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const wasp = makeShipEntitySpec('ship_wasp', { isPlayer: true, team: 0 });
const record = {
  url: '/assets/ships/release/parts/wholeships/wasp_production_v1.glb',
  assetId: 'SF_WASP_PRODUCTION_V1',
};

const visual = wholeShipVisualForEntity(wasp, { requiredWholeShip: true });
assert.deepEqual(visual, {
  file: 'wholeships/wasp_production_v1.glb',
  assetId: 'SF_WASP_PRODUCTION_V1',
  lodFamily: {
    lod0: 'wholeships/wasp_production_v1.glb',
    lod1: 'wholeships/wasp_production_v1_lod1.glb',
    lod2: 'wholeships/wasp_production_v1_lod2.glb',
  },
  roleId: 'ship_wasp',
  required: true,
}, 'the player Wasp must resolve only the new production body and its authored LOD family');
assert.deepEqual(authoredPreloadPlanForEntity(wasp, { requiredWholeShip: true }), {
  hull: ['wholeships/wasp_production_v1.glb'],
}, 'the live entity must decode only Wasp LOD0 instead of pinning all three levels');
assert.deepEqual(authoredBootstrapPreloadPlan().hull, ['wholeships/kestrel.glb'],
  'the Wasp trial must not expand first-frame bootstrap residency');
assert.equal(resolveRequiredWholeShipRecord(wasp, [record], {
  releaseMode: true,
  requiredWholeShip: true,
}), record, 'the production asset id and release URL must satisfy required whole-ship resolution');
assert.throws(() => resolveRequiredWholeShipRecord(wasp, [{ ...record, assetId: 'OLD_BLOCKED_WASP' }], {
  releaseMode: true,
  requiredWholeShip: true,
}), /did not pass the live authored-asset loader/,
'the accessory-only or wrong-id Wasp must never silently replace the production body');

console.log('Wasp production whole-ship routing: PASS');
