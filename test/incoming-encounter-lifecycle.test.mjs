// Focused owner integration. Travel poses, clocks and trigger eligibility are fixture staging;
// all choices, original props, save envelopes, docking commits and consequences use real owners.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { combat } from '../src/systems/combat.js';
import { missions } from '../src/systems/missions.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { SECTORS } from '../src/data/sectors.js';
import { CAL_DAY_S } from '../src/data/worldCalendar.js';
import { RING } from '../src/data/encounters/1322-the-shadow-ring.js';
import { TOOL_LEDGER } from '../src/data/encounters/1323-the-tool-ledger.js';
import { TETHER_MEMORIAL_POI_ID, TETHER_MEMORIAL_SCAN_DESCRIPTION } from '../src/data/tetherMemorialPresentation.js';
import { createDockIntent } from '../src/core/dockIntent.js';
import { commitDockedUiState } from '../src/ui/dockStateCommit.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';

function boot(t, sectorId) {
  const sim = createSimulation({ seed: 4343, systems: [ships,cargo,economy,factions,combat,
    missions,world,encounterDirector,save], updateOrder: [] });
  t.after(() => sim.dispose());
  const { state,bus } = sim; state.mode='flight'; state.onboarding={active:false,finished:true};
  state.story.beatIndex=7; state.world.currentSectorId=sectorId; state.simTime=10;
  const owner=sim.registry.get('ships'); owner.newGame();
  const player=sim.spawn(makeShipEntitySpec(state.player.ownedShips[0].defId,{isPlayer:true,
    player:state.player,fittings:state.player.ownedShips[0].fittings,pos:{x:0,z:0}}));
  state.playerId=player.id; owner.recomputeActiveShip();
  return {sim,state,bus,player,d:sim.registry.get('encounterDirector'),saver:sim.registry.get('save')};
}
function fire(h,shapeId,anchor={x:0,z:0},encounterId=shapeId) {
  const receipt=h.d.requestAuthoredEncounter({shapeId,encounterId,sectorId:h.state.world.currentSectorId,
    anchor,zoneType:'derelict_field',zoneRadius:600,force:true});
  assert.equal(receipt.ok,true,JSON.stringify(receipt));
  return h.state.encounterDirector.live[encounterId];
}
function tick(h) { h.d._tickLive(h.state.encounterDirector,h.state,h.state.simTime); }
function envelope(h) { return JSON.parse(JSON.stringify(h.saver.serialize('incoming-lifecycle'))); }

test('Memorial uses its canonical active-sector site, including zero distance, and world rebuild reads the saved line', t => {
  const h=boot(t,'sector_charon_expanse'), owner=h.sim.registry.get('world');
  const sector=SECTORS.find(s=>s.id==='sector_charon_expanse');
  function rebuild() {
    const active={id:sector.id,stations:[],fields:[],gates:[],pois:[],hazards:[]};
    const discovery=h.state.world.discovery[sector.id] ||= {pois:{}};
    owner._spawnPOIs(sector,active,discovery,()=>.5);
    h.state.world.activeSector=active;
    return active.pois.find(p=>p.poiId===TETHER_MEMORIAL_POI_ID);
  }
  const site=rebuild(); assert.ok(site);
  h.state.story.flags['special500.SP2-172']=1; h.player.hull=h.player.hullMax*.09;
  h.player.pos={...site.pos};
  const live=fire(h,'tether_memorial_line',site.pos);
  tick(h);
  assert.equal(live.phase,'done');
  assert.ok(h.state.story.flags.wall_knows!=null);
  assert.equal(site.scanDescription,TETHER_MEMORIAL_SCAN_DESCRIPTION);
  const deliveries=h.state.story.depthProgramEncounters.history.filter(r=>r.shapeId==='tether_memorial_line').length;
  // Rebuild is the same canonical POI reader used by sector admission and restore.
  const next=rebuild();
  assert.equal(next.scanDescription,TETHER_MEMORIAL_SCAN_DESCRIPTION);
  assert.equal(h.state.story.depthProgramEncounters.history.filter(r=>r.shapeId==='tether_memorial_line').length,deliveries);
  const saved=envelope(h), cold=boot(t,sector.id);
  assert.equal(cold.saver.loadEnvelope(saved,'incoming-lifecycle'),true);
  const restored=cold.state.world.activeSector.pois.find(p=>p.poiId===TETHER_MEMORIAL_POI_ID);
  assert.equal(restored.scanDescription,TETHER_MEMORIAL_SCAN_DESCRIPTION);
  assert.equal(cold.state.story.depthProgramEncounters.history.filter(r=>r.shapeId==='tether_memorial_line').length,deliveries);
});

test('Keeper reoffers actionable choices after listening and consumes one physical part once', t => {
  const h=boot(t,'sector_sker_haven'); assert.equal(addCargo(h.state,'cmdty_control_unit',1),1);
  const live=fire(h,'the_keeper');
  h.bus.emit('encounter:choose',{encounterId:live.id,choiceId:'listen'});
  assert.equal(live.offerConsumed,false);
  h.bus.emit('encounter:choose',{encounterId:live.id,choiceId:'donate_part'});
  h.bus.emit('encounter:choose',{encounterId:live.id,choiceId:'donate_part'});
  assert.equal(h.state.player.cargo.items.cmdty_control_unit||0,0);
  assert.ok(h.state.story.flags.keeper_crew_visiting!=null);
  assert.equal(h.state.story.depthProgramEncounters.completed.the_keeper.visits,1);
});

test('Shadow Ring updates one saved day marker, admits one hit per day and paints once at ten', t => {
  const h=boot(t,'sector_eunomia_gulf');
  h.player.pos={x:RING.offset.x+Math.cos(RING.sunBearingRad)*RING.castWu,
    z:RING.offset.z+Math.sin(RING.sunBearingRad)*RING.castWu};
  const paints=[]; h.bus.on('encounter:voice',p=>{if(p.text.includes('STILL GOT IT'))paints.push(p);});
  for(let day=0;day<10;day++) {
    h.state.simTime=CAL_DAY_S*(day+.35);
    const old=Object.values(h.state.encounterDirector.live).find(l=>l.shapeId==='the_shadow_ring');
    if(old) h.d.abort(old,'fixture_next_watch');
    fire(h,'the_shadow_ring',{x:0,z:0},`ring:day:${day}`);
    tick(h); tick(h); tick(h);
    assert.equal(h.state.story.flags.shadow_ring_hits,day+1);
    assert.equal(h.state.story.flags.shadow_ring_lit_day,day);
  }
  assert.equal(paints.length,1);
  const saved=envelope(h), cold=boot(t,'sector_eunomia_gulf');
  assert.equal(cold.saver.loadEnvelope(saved,'incoming-lifecycle'),true);
  cold.player=cold.state.entities.get(cold.state.playerId);
  cold.player.pos={...h.player.pos};
  fire(cold,'the_shadow_ring',{x:0,z:0},'ring:continued'); tick(cold);
  assert.equal(cold.state.story.flags.shadow_ring_hits,10,'Continue cannot count the same saved day again');
  assert.deepEqual(Object.keys(cold.state.story.flags).filter(k=>k.startsWith('shadow_ring_')).sort(),
    ['shadow_ring_hits','shadow_ring_lit_day','shadow_ring_paint']);
});

test('Tool Ledger loss cannot retire a foreign occupant recycled into the original wrench id', t => {
  const h=boot(t,'sector_haumea_rift');
  h.state.world.activeSector.pois=[{poiId:TOOL_LEDGER.mastPoiId,pos:{x:0,z:0}}];
  const live=fire(h,'the_tool_ledger');
  const original=h.state.entities.get(live.vars.wrenchId);
  h.sim.helpers.removeEntity(original.id,{immediate:true});
  const foreign=h.sim.spawn({type:'payload',hull:1,pos:{x:0,z:0},data:{foreignTask:true}});
  assert.equal(foreign.id,original.id);
  assert.notEqual(foreign.occupantGeneration,original.occupantGeneration);
  tick(h);
  assert.equal(live.phase,'done');
  assert.equal(foreign.alive,true);
  assert.equal(foreign.data.despawnAt,undefined);
  assert.equal(h.state.story.flags.tool_returned,undefined);
});

test('default production simHost original-tool Continue reaches the real dock commit owner and grants standing once', async t => {
  const hosts=[]; t.after(()=>{for(const host of hosts)host.shutdown();});
  async function hostBoot() {
    const host=createSimHost(); hosts.push(host);
    await host.init({profile:'production',seed:4242,bridgeAll:true,
      scenarioContract:JSON.parse(readFileSync('src/data/scenarios/47a.scenario.json','utf8'))});
    const {state,registry,runtime,bus}=host.host;
    state.mode='flight';state.run.kind='adventure';state.onboarding={active:false,finished:true};
    state.ui.docked=false;state.ui.dockedStationId=null;state.ui.screenStack=[];
    return {host,state,bus,registry,runtime,d:registry.get('encounterDirector'),saver:registry.get('save')};
  }
  const h=await hostBoot();
  h.registry.get('world').enterSector('sector_haumea_rift');
  const mast=h.state.world.activeSector.pois.find(p=>p.poiId===TOOL_LEDGER.mastPoiId);
  assert.ok(mast,'actual authored fissure exists');
  const owner=h.registry.get('ships'); owner.newGame();
  const player=h.runtime.spawn(makeShipEntitySpec(h.state.player.ownedShips[0].defId,{isPlayer:true,
    player:h.state.player,fittings:h.state.player.ownedShips[0].fittings,pos:{x:mast.pos.x+24,z:mast.pos.z}}));
  h.state.playerId=player.id;owner.recomputeActiveShip();
  const live=fire(h,'the_tool_ledger',mast.pos,'tool:default-host');
  const wrench=h.state.entities.get(live.vars.wrenchId);
  await h.registry.get('physics').prepareBackend(h.state);h.runtime.runTicks(5);
  const attached=h.registry.get('combat').kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:wrench.id});
  assert.equal(attached.ok,true,attached.reason);
  assert.equal(live.vars.toolWasTowed,true,'canonical attachment owner supplies custody evidence');
  const station=h.state.entityList.find(e=>e.alive&&e.type==='station'&&e.data?.stationId===TOOL_LEDGER.claimStationId);
  assert.ok(station);
  // Travel is explicitly staged; the claim tested here is physical identity/save/dock ownership.
  player.pos={x:station.pos.x+20,z:station.pos.z};wrench.pos={x:station.pos.x+30,z:station.pos.z};
  wrench.vel={x:2.25,z:-1.5};wrench.hull=.7;
  const stableId=wrench.data.stableId, originalGeneration=wrench.occupantGeneration;
  const saved=envelope(h);
  assert.ok(saved.data.entities.persistent.some(e=>e.data?.stableId===stableId));
  h.host.shutdown(); hosts.splice(hosts.indexOf(h.host),1);
  const resumed=await hostBoot();
  for(let i=0;i<25;i++)resumed.runtime.spawn({type:'payload',pos:{x:i,z:0},hull:1});
  assert.equal(resumed.saver.loadEnvelope(saved,'incoming-lifecycle'),true);
  resumed.state.mode='flight';resumed.state.ui.screenStack=[];
  const restored=Object.values(resumed.state.encounterDirector.live).find(l=>l.shapeId==='the_tool_ledger');
  assert.ok(restored);
  const originals=resumed.state.entityList.filter(e=>e.alive&&e.data?.stableId===stableId);
  assert.equal(originals.length,1);
  const original=originals[0];
  assert.notEqual(original.occupantGeneration,originalGeneration);
  assert.equal(restored.vars.wrenchGeneration,original.occupantGeneration);
  assert.deepEqual({x:original.pos.x,z:original.pos.z},wrench.pos);
  assert.deepEqual({x:original.vel.x,z:original.vel.z},wrench.vel);assert.equal(original.hull,.7);
  assert.equal(restored.vars.toolWasTowed,true);
  assert.equal(restored.vars.startedAt,live.vars.startedAt);
  assert.ok(MAIN_TO_SIM_BUS_EVENTS.has('dock:committed'),'default worker bridge already admits the producer receipt');
  const receipts=[];resumed.bus.on('faction:repDelta',p=>{if(p.reason==='the_tool_ledger_returned')receipts.push(p);});
  const stale=createDockIntent(resumed.state,{stationId:TOOL_LEDGER.claimStationId});
  const previousId=resumed.state.playerId;
  resumed.state.playerId=-999;
  assert.equal(commitDockedUiState(resumed.state,stale,resumed.bus),false,'stale pilot receipt is rejected by the real UI owner');
  resumed.state.playerId=previousId;
  assert.equal(receipts.length,0);
  const attempt=createDockIntent(resumed.state,{stationId:TOOL_LEDGER.claimStationId});
  const before=resumed.state.factions[TOOL_LEDGER.claimFactionId].rep;
  assert.equal(commitDockedUiState(resumed.state,attempt,resumed.bus),true);
  assert.equal(resumed.state.ui.docked,true);
  assert.equal(restored.phase,'done','completion occurs synchronously at commit, without a docked tick');
  assert.equal(resumed.state.factions[TOOL_LEDGER.claimFactionId].rep,before+TOOL_LEDGER.standingDelta);
  assert.equal(receipts.length,1);
  commitDockedUiState(resumed.state,attempt,resumed.bus);
  assert.equal(receipts.length,1);
  const completed=envelope(resumed);
  assert.equal(resumed.saver.loadEnvelope(completed,'incoming-lifecycle'),true);
  assert.equal(Object.values(resumed.state.encounterDirector.live).some(l=>l.shapeId==='the_tool_ledger'),false);
  assert.equal(resumed.state.factions[TOOL_LEDGER.claimFactionId].rep,before+TOOL_LEDGER.standingDelta);
});
