import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSimulation,SIM_DT} from '../src/core/sim.js';
import {createBus} from '../src/core/eventBus.js';
import {physics} from '../src/core/physics.js';
async function boot(payload){const sim=createSimulation({seed:260926,bus:createBus(),systems:[physics]});const state=sim.state;state.mode='flight';state.settings.gameplay.physicsBackend='rapier-dynamic';const player=sim.spawn({type:'ship',alive:true,isPlayer:true,radius:16,mass:41.0031,pos:{x:0,z:0},vel:{x:4,z:1},rot:.3,angVel:0,hull:100,hullMax:100,collides:true,data:{defId:'ship_hornet'},physicsBody:{schemaVersion:1,radius:16,mass:41.0031,inertiaY:16.4450935828877,dynamic:true,ccd:true,revision:0}});state.playerId=player.id;const phys=sim.registry.get('physics');if(payload)phys.deserialize(payload);assert.equal(await phys.prepareBackend(state,{reset:true}),true);return{sim,phys};}
function shapeState(phys){return [...phys._sg02.records.values()].map(r=>({id:r.entity.id,mass:r.body.mass(),inertia:r.body.principalInertia(),pose:r.body.translation(),v:r.body.linvel(),colliders:r.colliders.map(c=>({type:c.shapeType(),vertices:c.shape.vertices?[...c.shape.vertices]:null,density:c.density(),friction:c.friction(),restitution:c.restitution(),groups:c.collisionGroups()}))}));}
for(const name of ['legacy-base','legacy-next'])test(`physics adapter rejects ${name} native bytes and reconstructs identically to ordinary fresh candidate`,async()=>{
 const payload=JSON.parse(readFileSync(new URL(`./fixtures/planar-prism/${name}-snapshot.json`,import.meta.url)));const fresh=await boot(),restored=await boot(payload);assert.equal(restored.phys._pendingSg02Snapshot,null);assert.deepEqual(shapeState(restored.phys),shapeState(fresh.phys));assert.equal(restored.phys.serialize().nativeGeometryRevision,'xz-support-prism-v2');
 for(let i=0;i<5;i++){fresh.sim.step(SIM_DT);restored.sim.step(SIM_DT);assert.deepEqual(shapeState(restored.phys),shapeState(fresh.phys));}fresh.phys._sg02.dispose();restored.phys._sg02.dispose();
});
