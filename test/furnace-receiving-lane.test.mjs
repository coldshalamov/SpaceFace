import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState} from '../src/core/gameState.js';
import {createBus} from '../src/core/eventBus.js';
import {missions} from '../src/systems/missions.js';
import {createFurnaceIntake} from '../src/systems/furnaceIntake.js';
import {buildMissionBoardContract} from '../src/story/campaign47a/embodiedMissions.js';
import {createCampaign47aState} from '../src/story/campaign47a/campaignSchema.js';
import {FURNACE_MITE_KEYS,furnaceLots,furnaceLotSpec,furnaceMouthGlobal} from '../src/missions/furnaceWorksite.js';
import {syncFurnaceWorksite} from '../src/missions/furnaceWorksiteRuntime.js';
import {furnaceShoulderSpec} from '../src/missions/furnaceReceivingLane.js';
const RECEIPT_AT=100;
function authorFurnaceOffer(state) {
  const offer = buildMissionBoardContract(1, {
    seed: 23,
    epoch: 0,
    state: { story: state.story },
  });
  assert.ok(offer);
  assert.equal(offer.storyTag, 'campaign47a:b1:infested');
  assert.equal(offer.params.furnaceWorksiteVersion, 1);
  return offer;
}

function liveWorksite() {
  const state = createGameState(23);
  state.story = {
    beatIndex: 1,
    branch: null,
    flags: {},
    campaign47a: createCampaign47aState(),
  };
  state.story.campaign47a.stepProgress['1'] = {
    completed: ['alloy_run', 'scale_4'],
    updatedAtS: 0,
  };
  state.missions = { active: [], nextId: 1, boards: {}, completedLog: [], receipts: [] };
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.alienEcology = { sites: { closed_refinery: { deadFauna: {} } } };
  state.run = { kind: 'adventure' };
  state.mode = 'flight';
  state.simTime = RECEIPT_AT;

  const bus = createBus();
  const owner = Object.create(missions);
  owner.state = state;
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: `spawn-${state.nextEntityId++}`, alive: true };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      state.entities.delete(id);
      const index = state.entityList.findIndex((entity) => entity.id === id);
      if (index >= 0) state.entityList.splice(index, 1);
    },
  };
  owner.init({ state, bus, helpers, registry: { get: () => null } });
  const mission = owner._instanceFromOffer(authorFurnaceOffer(state));
  state.missions.active.push(mission);
  for (const lot of furnaceLots(mission)) {
    const entity = { ...furnaceLotSpec(mission, lot), id: `ore-pod-${lot.slot}`, alive: true };
    lot.entityId = entity.id;
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }

  const intake = createFurnaceIntake();
  intake.init({ state, bus, helpers });
  return { state, bus, owner, mission, intake };
}

function feedPod(fixture, slot) {
  const lot = fixture.mission.params.furnaceLots[slot];
  const pod = fixture.state.entities.get(lot.entityId);
  assert.ok(pod);
  pod.pos = furnaceMouthGlobal();
  fixture.intake.update();
}

function losePod(fixture, slot) {
  const lot = fixture.mission.params.furnaceLots[slot];
  const pod = fixture.state.entities.get(lot.entityId);
  assert.ok(pod);
  pod.alive = false;
  fixture.bus.emit('entity:killed', { id: pod.id, entity: pod, killerId: 'npc' });
}

function clearMiteSites(fixture) {
  const deadFauna = fixture.state.world.alienEcology.sites.closed_refinery.deadFauna;
  for (const key of FURNACE_MITE_KEYS) deadFauna[key] = true;
  syncFurnaceWorksite(fixture.owner, fixture.mission);
}

const guides=f=>f.state.entityList.filter(e=>e.alive&&e.data?.furnaceReceivingShoulder);
function pilot(f){const e={id:'pilot',alive:true,type:'ship',pos:furnaceShoulderSpec(f.mission).pos,vel:{x:0,z:0}};f.state.entities.set(e.id,e);f.state.entityList.push(e);f.state.playerId=e.id;return e;}
test('ordinary Book1 contract exposes optional shoulder only after actual worksite clearance ledger',()=>{const f=liveWorksite();pilot(f);f.intake.update();assert.equal(guides(f).length,0);clearMiteSites(f);f.intake.update();assert.equal(guides(f).length,1);const g=guides(f)[0];assert.equal(g.physicsBody,false);assert.equal(g.collides,false);assert.equal(g.data.tetherable,false);assert.equal(Math.hypot(g.pos.x-furnaceMouthGlobal().x,g.pos.z-furnaceMouthGlobal().z),180);f.intake.update();assert.equal(guides(f).length,1);assert.equal(f.mission.params.furnaceFeeds||0,0);});
test('brief is local, undocked, once across reinit; invalid or completed jobs lose shoulder',()=>{const f=liveWorksite(),p=pilot(f),lines=[];f.bus.on('comms:popup',x=>lines.push(x));clearMiteSites(f);f.state.ui.docked=true;f.intake.update();assert.equal(lines.filter(x=>x.id==='furnace_receiving_brief').length,0);f.state.ui.docked=false;p.pos={x:0,z:0};f.intake.update();assert.equal(lines.filter(x=>x.id==='furnace_receiving_brief').length,0);p.pos=furnaceShoulderSpec(f.mission).pos;f.intake.update();f.intake.init({state:f.state,bus:f.bus,helpers:f.owner.helpers});f.intake.update();assert.equal(lines.filter(x=>x.id==='furnace_receiving_brief').length,1);f.mission.params.furnaceLedgerInvalid=true;f.intake.update();assert.equal(guides(f).length,0);});
test('intake owns receipt and synchronous final completion; rock keeps generic voice and no mission credit',()=>{const f=liveWorksite(),lines=[];pilot(f);f.bus.on('comms:popup',x=>lines.push(x));clearMiteSites(f);f.intake.update();const rock={id:'rock',alive:true,type:'asteroid',pos:furnaceMouthGlobal(),data:{}};f.state.entities.set(rock.id,rock);f.state.entityList.push(rock);f.intake.update();assert.equal(f.mission.params.furnaceFeeds||0,0);assert.match(lines.find(x=>x.id==='furnace_fed_rock').text,/yard burns/);for(let i=0;i<3;i++)feedPod(f,i);assert.match(lines.find(x=>x.id==='furnace_fed_ore-pod-2').text,/3\/3.*All three/);f.intake.update();assert.equal(guides(f).length,0);assert.equal(f.mission.params.furnaceFeeds,3);assert.equal(lines.filter(x=>x.text?.includes('Quarantine lot')).length,3);});
test('lost lots are named honestly and cancellation/sector change remove only guide',()=>{const f=liveWorksite(),lines=[];pilot(f);f.bus.on('comms:popup',x=>lines.push(x));clearMiteSites(f);losePod(f,0);feedPod(f,1);assert.match(lines.find(x=>x.id==='furnace_fed_ore-pod-1').text,/1\/3.*1 lost/);const survivor=f.state.entities.get(f.mission.params.furnaceLots[2].entityId);f.state.world.currentSectorId='sector_helios_prime';f.bus.emit('sector:enter',{sectorId:'sector_helios_prime'});assert.equal(guides(f).length,0);assert.equal(survivor.alive,true);});

test('native initial-velocity lot crosses open shoulder into actual intake without a fabricated feed receipt',{timeout:120000},async()=>{
 const {bootRealPath}=await import('../scripts/lib/bench/realPath.mjs');const mouth=furnaceMouthGlobal();const h=await bootRealPath({seed:4433,systems:[createFurnaceIntake(),'physics'],hulls:[{hullId:'ship_pelican',isPlayer:true,pos:{x:mouth.x+180,z:mouth.z-80},rot:Math.PI}]});
 try{const s=h.state;s.world.currentSectorId='sector_ceres_belt';s.story={beatIndex:1,flags:{},campaign47a:createCampaign47aState()};s.story.campaign47a.stepProgress['1']={completed:['alloy_run','scale_4'],updatedAtS:0};const offer=authorFurnaceOffer(s);const m={...offer,id:'native-furnace',status:'active',objectiveTarget:4,objectiveProgress:4,params:{...offer.params}};s.missions.active=[m];const lots=furnaceLots(m),shoulder=furnaceShoulderSpec(m);lots[0].pos={...shoulder.pos};lots[0].vel={x:-30,z:0};const body=h.runtime.spawn(furnaceLotSpec(m,lots[0]));lots[0].entityId=body.id;const receipts=[];h.bus.on('furnace:fed',p=>receipts.push(p));h.bus.emit('sector:enter',{sectorId:'sector_ceres_belt'});let ticks=0;while(body.alive&&ticks++<600)h.step(1);assert.equal(receipts.length,1);assert.equal(receipts[0].entityId,body.id);assert.equal(receipts[0].missionId,m.id);assert.ok(Math.hypot(receipts[0].pos.x-mouth.x,receipts[0].pos.z-mouth.z)<=90);const guide=s.entityList.find(e=>e.alive&&e.data?.furnaceReceivingShoulder);assert.ok(guide);assert.equal(guide.physicsBody,false);assert.equal(h.proof().backend,'rapier-dynamic');console.log('FURNACE_LANE_NATIVE',JSON.stringify({time:s.simTime,feed:receipts[0].pos,guide:guide.pos}));
 }finally{h.dispose();}
});
test('malformed lots never receive mission-specific voice, terminal loss names no imaginary next load',()=>{
 for(const key of ['version','type','invalid']){const f=liveWorksite(),lines=[];f.bus.on('comms:popup',p=>lines.push(p));const e=f.state.entities.get(f.mission.params.furnaceLots[0].entityId);if(key==='version')e.data.furnaceLotVersion=9;if(key==='type')e.type='asteroid';if(key==='invalid')f.mission.params.furnaceLedgerInvalid=true;feedPod(f,0);assert.equal(lines.some(p=>p.text?.includes('Quarantine lot')),false);}
 const f=liveWorksite(),lines=[];f.bus.on('comms:popup',p=>lines.push(p));losePod(f,0);feedPod(f,1);feedPod(f,2);assert.match(lines.find(p=>p.id==='furnace_fed_ore-pod-2').text,/2\/3.*1 lost.*No marked lots remain/);
});
test('save boundary retains heard brief; cancel removes shoulder without losing live cargo',async()=>{const {save}=await import('../src/save/saveSystem.js');const f=liveWorksite();pilot(f);clearMiteSites(f);f.intake.update();const snapshot=save._serializeMissions.call({state:f.state});const g=liveWorksite(),lines=[];g.state.story.flags=JSON.parse(JSON.stringify(snapshot.story.flags));pilot(g);clearMiteSites(g);g.bus.on('comms:popup',p=>lines.push(p));g.intake.update();assert.equal(lines.filter(p=>p.id==='furnace_receiving_brief').length,0);const pod=g.state.entities.get(g.mission.params.furnaceLots[0].entityId);g.state.missions.active=[];g.intake.update();assert.equal(guides(g).length,0);assert.equal(pod.alive,true);});
