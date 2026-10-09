import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { redKitePhysicalBody, RED_KITE_RADIUS } from '../src/data/redKiteBody.js';

test('nine source-aligned native assemblies preserve the empty stern and remain solid at the real prongs', async () => {
  const sim=createSimulation({seed:8,systems:[]});
  const body=redKitePhysicalBody();
  const entity=sim.spawn({type:'ship',mass:32,radius:RED_KITE_RADIUS,hull:220,pos:{x:40,z:30},
    rot:0,vel:{x:0,z:0},angVel:0,collides:true,physicsBody:body,
    data:{authoredCharacter:'red_kite',redKiteActorId:'red-kite:ceres:courier:v1',authoredAssetId:'SF_SHIP_RED_KITE'}});
  const owner=await createSg02DynamicBodyOwner({mode:'rapier-dynamic'});
  try {
    owner.syncFromEntities(sim.state.entityList);
    const rec=owner.records.get(entity.id);
    assert.equal(rec.colliders.length,9);assert.equal(rec.body.isDynamic(),true);
    assert(rec.colliders.every(c=>!c.isSensor()));
    const touches=(x,z)=>rec.colliders.some(c=>c.containsPoint({x:40+x,y:0,z:30+z}));
    assert.equal(touches(-9,0),false,'the fork slot is real empty space');
    assert.equal(touches(-9,-1.3),true);assert.equal(touches(-9,1.3),true);
    assert.equal(touches(8,0),true,'pressure spine is solid');
    assert.equal(body.collisionProxyManifest.convexParts.length,9);
    assert.deepEqual(redKitePhysicalBody(),body,'body construction preserves source geometry');
  } finally { owner.dispose();sim.dispose(); }
});
