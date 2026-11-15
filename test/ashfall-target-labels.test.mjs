import test from 'node:test';
import assert from 'node:assert/strict';
import { missionSpawningOps } from '../src/systems/missionSpawningOps.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { spawnReckoning, snapshotReckoning } from '../src/missions/reckoningRuntime.js';
const mission = () => ({id:'ash-label-test',type:'station_door_jam',status:'active',storyTag:'campaign47a:b7:deep_reach',destSectorId:'sector_ashfall_reach',destStationId:'station_ashcache',targetEntityIds:[], params:{authoredSetPieceId:'station_door_jam'}});
const owner = () => ({state:{meta:{seed:8008},world:{currentSectorId:'sector_ashfall_reach'},entityList:[],entities:new Map(),tick:10},...missionSpawningOps});
const annotate = e => salvageActions._annotate.call({_state:{simTime:10}},e);
const wreck = (m, data={}) => ({id:11,type:'wreck',alive:true,hull:140,hullMax:140,pos:{x:10,z:10},data:{missionTag:m.id,physicalRole:'jam_hulk',scanLabel:'DEAD FRIGATE',wreckClass:'debris',...data}});
test('Ashfall hulk retains authored identity through spawn, repeated scan and Continue adoption without stock changes',()=>{
 const m=mission(),o=owner(),e=wreck(m); const pool={cmdty_scrap_metal:2};e.data.salvagePool=pool;
 annotate(e); assert.equal(e.data.scanLabel,'Cut Panels');
 o._stampMissionTargetIdentity(e,m,0);
 assert.equal(e.data.scanLabel,'DEAD FRIGATE');
 annotate(e);assert.equal(e.data.scanLabel,'DEAD FRIGATE');assert.equal(e.data.salvageAction.id,'cut_panel');assert.equal(e.data.wreckClass,'debris');assert.equal(e.data.salvagePool,pool);assert.deepEqual(pool,{cmdty_scrap_metal:2});
 delete pool.cmdty_scrap_metal;annotate(e);assert.deepEqual(pool,{});
 const resumed=structuredClone(e);delete resumed.data.authoredScanLabel;resumed.data.scanLabel='Cut Panels';
 o._stampMissionTargetIdentity(resumed,m,0);annotate(resumed);assert.equal(resumed.data.scanLabel,'DEAD FRIGATE');assert.deepEqual(resumed.data.salvagePool,{});
});
test('unmatched and foreign wreck identities are not promoted to authored encounter names',()=>{
 for(const data of [{physicalRole:'unknown'}, {missionTag:'foreign'}]){
  const m=mission(),o=owner(),e=wreck(m,data);o._stampMissionTargetIdentity(e,m,0);assert.equal(e.data.authoredScanLabel,undefined);annotate(e);assert.equal(e.data.scanLabel,'Cut Panels');
 }
});
test('accepted callback rows retain their labels on spawn, scan, adoption and rematerialization',()=>{
 const m=mission(),o=owner();
 m.params.reckoning={rows:[{id:'b1_cut',label:'Your first cut leaves a loose shield plate',kind:'plate',mass:110},{id:'b3_tow_in',label:'Your yard work leaves a movable ballast mass',kind:'core',mass:48}],bodies:{}};
 o.helpers={spawnEntity(spec){const e={...spec,id:100+o.state.entityList.length,alive:true}; annotate(e);o.state.entityList.push(e);o.state.entities.set(e.id,e);return e;}};
 spawnReckoning(o,m);assert.equal(o.state.entityList.length,2);
 for(const [i,e] of o.state.entityList.entries()){
  const label=m.params.reckoning.rows[i].label.toUpperCase();assert.equal(e.data.scanLabel,label);assert.equal(e.data.salvageAction.id,'cut_panel');
  e.data.salvagePool={};annotate(e);assert.deepEqual(e.data.salvagePool,{});assert.equal(e.data.scanLabel,label);
  delete e.data.authoredScanLabel;e.data.scanLabel='Cut Panels';
 }
 spawnReckoning(o,m);assert.equal(o.state.entityList.length,2);
 for(const [i,e] of o.state.entityList.entries()){annotate(e);assert.equal(e.data.scanLabel,m.params.reckoning.rows[i].label.toUpperCase());assert.deepEqual(e.data.salvagePool,{});}
 snapshotReckoning(o,m);o.state.entityList=[];o.state.entities.clear();m.targetEntityIds=[];spawnReckoning(o,m);
 for(const [i,e] of o.state.entityList.entries()){assert.equal(e.data.scanLabel,m.params.reckoning.rows[i].label.toUpperCase());assert.equal(e.data.salvageAction.id,'cut_panel');}
 m.params.reckoning.bodies.b1_cut={destroyed:true};o.state.entityList=[];o.state.entities.clear();m.targetEntityIds=[];spawnReckoning(o,m);assert.equal(o.state.entityList.length,1);assert.equal(o.state.entityList[0].data.reckoningKey,'b3_tow_in');
});
