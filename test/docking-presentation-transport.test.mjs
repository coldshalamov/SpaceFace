import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { buildDockApproachLayout } from '../src/render/dockApproachBeacons.js';
import { vfx } from '../src/render/vfx.js';
import { dockingCorridor } from '../src/systems/dockingCorridor.js';
import { DOCK_APPROACH_MAX_RANGE_WU, DOCK_APPROACH_STATION_CAP } from '../src/render/dockApproachBeacons.js';
import * as THREE from '../vendor/three.module.js';

test('canonical docking owner reaches default worker view and clears across replacement and sector exit', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    const { state, registry, runtime } = lane.host;
    state.mode = 'flight'; state.ui.docked = false; state.world.currentSectorId = 'test-sector';
    const player = runtime.spawn({type:'ship', alive:true, pos:{x:0,z:0}, vel:{x:0,z:0}, radius:8, mass:12, hull:100, hullMax:100});
    state.playerId = player.id;
    const station = runtime.spawn({type:'station',alive:true,pos:{x:90,z:0},vel:{x:0,z:0},rot:0,radius:90,mass:1000,hull:1000,hullMax:1000,
      data:{stationId:'dock-projection-test',dockRadius:90,collisionProxy:'helios_trade_hub'}});
    const owner = registry.get('dockingCorridor');
    assert.ok(owner);
    owner.update(1/60,state);
    const domains = new Map(); let sequence=0, ackEnd=init.initRebuild?.end ?? 0;
    async function transport() {
      const reply=structuredClone(await lane.tick({tick:++sequence,steps:0,commands:[],ackEnd}));
      ackEnd=reply.journalEnd;
      for (const u of reply.domainUpdates) applyDomainPathUpdate(domains,u,new Set());
      return domains.get('dockingPresentation');
    }
    let view=await transport();
    assert.ok(view?.rows.some(r=>r.stationId==='dock-projection-test'));
    const row=view.rows.find(r=>r.stationId==='dock-projection-test');
    assert.equal('primitives' in row,false);
    assert.equal(buildDockApproachLayout(row,{}).live,true);
    const scene = new THREE.Scene(), reader = Object.create(vfx);
    const main = { dockingPresentation:view, playerId:player.id, entities:new Map([[player.id,player],[station.id,station]]),
      world:{currentSectorId:view.sectorId}, settings:{}, simTime:state.simTime };
    Object.assign(reader,{state:main,_scene:scene,_spawnLocalXZ:{},_toLocalXZ(x,z,out){out.x=x;out.z=z;return out;}});
    reader._initDockApproach();
    assert.equal(reader._updateDockApproach(),true);
    const firstBar=reader._dockApproach.layouts.get(row.stationId).data.barX;
    row.pos.x += 25; row.berth.x += 25;
    assert.equal(reader._updateDockApproach(),true);
    assert.equal(reader._dockApproach.layouts.get(row.stationId).data.barX,firstBar+25,
      'in-place worker mirror changes invalidate the cached layout');
    main.world.currentSectorId='other-sector';
    assert.equal(reader._updateDockApproach(),false);
    main.world.currentSectorId=view.sectorId;
    station.alive=false;
    owner.update(1/60,state);
    view=await transport();
    assert.ok(!view.rows.some(r=>r.stationId==='dock-projection-test'));
    lane.host.bus.emit('sector:exit',{});
    view=await transport();
    assert.equal(view,null);
  } finally { lane.host?.registry?.dispose?.(); lane.dispose?.(); }
});

test('bounded projection retains the engaged station when it follows four nearby rows', () => {
  const player={id:1,alive:true,pos:{x:0,z:0}};
  const stations=Array.from({length:5},(_,i)=>({id:i+2,type:'station',alive:true,pos:{x:100+i,z:0},rot:0,radius:90,
    data:{stationId:`station-${i}`,dockRadius:90,collisionProxy:'helios_trade_hub'}}));
  const state={mode:'flight',playerId:1,entities:new Map([[1,player]]),entityList:stations,world:{currentSectorId:'a'},
    dockingCorridor:{stationId:'station-4',phase:'capture',berth:{x:0,z:0}}};
  const owner=Object.create(dockingCorridor); owner.init({state});
  try {
    owner._publishProxyDiagnostics(state);
    assert.equal(DOCK_APPROACH_MAX_RANGE_WU,1400);
    assert.equal(state.dockingPresentation.rows.length,DOCK_APPROACH_STATION_CAP);
    assert.ok(state.dockingPresentation.rows.some(row=>row.stationId==='station-4'));
  } finally {owner.destroy();}
});

test('cradle rejects stale sector, lost life, and cleared projection without native fallback', () => {
  const scene = new THREE.Scene();
  const station = {id:2,alive:true,occupantGeneration:3};
  const row = {entityId:2,generation:3,stationId:'dock',proxyId:'proxy',pos:{x:0,z:0},rot:0,
    corridorBearingDeg:0,berth:{x:5,z:0},corridor:{captureHalfWidth:10}};
  const readout = {stationId:'dock',phase:'capture',berth:row.berth};
  const state = {entities:new Map([[2,station]]),world:{currentSectorId:'sector-a'},settings:{},
    dockingPresentation:{sectorId:'sector-a',rows:[row],readout},dockingCorridor:readout,
    physicsRuntime:{collisionProxies:[row]}};
  const owner=Object.create(vfx);
  Object.assign(owner,{state,_scene:scene,_spawnLocalXZ:{},_emitJuiceCue(){},
    _toLocalXZ(x,z,out){out.x=x;out.z=z;return out;}});
  owner._initDockingCradle();
  const show=()=>{assert.equal(owner._updateDockingCradle(1),true);assert.equal(owner._dockingCradle.mesh.visible,true);};
  const hidden=()=>{assert.equal(owner._updateDockingCradle(1),false);assert.equal(owner._dockingCradle.mesh.visible,false);};
  show(); state.world.currentSectorId='sector-b'; hidden();
  state.world.currentSectorId='sector-a'; show(); station.alive=false; hidden();
  station.alive=true; show(); state.entities.set(2,{...station,occupantGeneration:4}); hidden();
  state.entities.set(2,station); show(); state.dockingPresentation=null; hidden();
});

test('real wash adapter requires a visible same-life NPC and refuses docked hulls', () => {
  const scene=new THREE.Scene(), mesh=new THREE.Group(); scene.add(mesh);
  const npc={id:2,type:'ship',alive:true,pos:{x:0,z:0},rot:0,radius:8,flags:{},mesh};
  const rock={id:3,type:'asteroid',alive:true,pos:{x:-60,z:0},radius:40};
  const state={playerId:1,entities:new Map([[2,npc]]),entityList:[npc,rock],render:{scene},ui:{},simTime:1};
  let emissions=0;
  const owner=Object.create(vfx);
  Object.assign(owner,{state,_scene:scene,_gas:{emitFractureDust(){emissions++;}},_engineDriveFor(){return {drive:1};}});
  assert.equal(owner._updateEngineWash(),true);
  assert.equal(emissions,1);
  state.simTime=2; mesh.visible=false;
  assert.equal(owner._updateEngineWash(),false);
  mesh.visible=true; npc.flags.docked=true;
  assert.equal(owner._updateEngineWash(),false);
  npc.flags.docked=false; state.entities.set(2,{...npc});
  assert.equal(owner._updateEngineWash(),false);
  assert.equal(emissions,1);
});
