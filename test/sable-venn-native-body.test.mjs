import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { sableVennPhysicalBody, SABLE_VENN_RADIUS } from '../src/data/sableVennBody.js';

test('Patchwork has five actual source solids with two longitudinal gaps and physical crossbeams', async () => {
  const sim = createSimulation({ seed: 2, systems: [] });
  const e = sim.spawn({ type: 'ship', mass: 68, radius: SABLE_VENN_RADIUS, hull: 300,
    pos: { x: 25, z: -40 }, rot: 0, collides: true, physicsBody: sableVennPhysicalBody(),
    data: { worldRecordId: 'ceres:sable-venn:patchwork', authoredAssetId: 'SF_SHIP_SABLE_PATCHWORK' } });
  const native = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  try {
    native.syncFromEntities(sim.state.entityList); const r = native.records.get(e.id);
    assert.equal(r.colliders.length, 5); assert.ok(r.body.isDynamic());
    const contains = (x,z) => r.colliders.some(c => c.containsPoint({x:25+x,y:0,z:-40+z}));
    assert.equal(contains(0,5),false); assert.equal(contains(0,-5),false);
    assert.equal(contains(-7,5),true); assert.equal(contains(6,-5),true);
    assert.equal(contains(8,0),true); assert.equal(contains(0,9),true);
    assert.ok(r.colliders.every(c => !c.isSensor()));
  } finally { native.dispose(); sim.dispose(); }
});
