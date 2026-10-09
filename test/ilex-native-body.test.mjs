import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { ilexArkPhysicalBody, ilexVaultPhysicalBody, ilexVaultSocket,
  ILEX_ARK_RADIUS, ILEX_VAULT_RADIUS } from '../src/data/ilexArkBody.js';

test('the seven native source parts preserve vault gaps and removal reduces mass before loose admission', async()=>{
  const sim=createSimulation({seed:4,systems:[]});
  const ids=Array.from({length:6},(_,i)=>`vault_${i+1}`);
  const e=sim.spawn({type:'ship',radius:ILEX_ARK_RADIUS,mass:420,hull:800,
    pos:{x:0,z:0},vel:{x:0,z:0},rot:0,angVel:0,collides:true,physicsBody:ilexArkPhysicalBody(ids),
    data:{authoredAssetId:'SF_SHIP_ILEX_ARK',persistenceOwner:'ilexArk'}});
  const native=await createSg02DynamicBodyOwner({mode:'rapier-dynamic'});
  const at=(record,x,z)=>record.colliders.some(c=>c.containsPoint({x,y:0,z}));
  const mass=(actual,expected)=>assert(Math.abs(actual-expected)<.001,'native f32 mass matches the conserved source mass');
  try{
    native.syncFromEntities(sim.state.entityList);
    let rec=native.records.get(e.id);
    assert.equal(rec.colliders.length,7);mass(rec.body.mass(),420);
    assert.equal(at(rec,0,-10),true);assert.equal(at(rec,0,5),false);
    assert.equal(at(rec,18,0),true);
    e.physicsBody=ilexArkPhysicalBody(ids.filter(id=>id!=='vault_3'),1);e.mass=e.physicsBody.mass;
    native.syncFromEntities(sim.state.entityList);
    rec=native.records.get(e.id);
    assert.equal(rec.colliders.length,6);mass(rec.body.mass(),402);
    assert.equal(at(rec,0,-10),false);assert.equal(at(rec,0,10),true);
    const loose=sim.spawn({type:'prop',radius:ILEX_VAULT_RADIUS,mass:18,hull:60,
      pos:{x:100,z:20},vel:{x:0,z:0},rot:0,angVel:0,collides:true,
      physicsBody:ilexVaultPhysicalBody('vault_3'),data:{ilexVaultId:'vault_3'}});
    native.syncFromEntities(sim.state.entityList);
    const detached=native.records.get(loose.id);
    assert.equal(detached.colliders.length,1);mass(detached.body.mass(),18);
    assert.equal(at(detached,100,20),true);assert.equal(at(detached,100,24),false);
    mass(rec.body.mass()+detached.body.mass(),420);
    assert.deepEqual(ilexVaultSocket('vault_3'),{x:0,z:-10});
    assert.throws(()=>ilexArkPhysicalBody(['invented']));
  }finally{native.dispose();sim.dispose();}
});
