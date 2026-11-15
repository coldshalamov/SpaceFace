import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { combat } from '../src/systems/combat.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { buildMissionBoardContract } from '../src/story/campaign47a/embodiedMissions.js';

function boot() {
  // Fresh synthetic fixture only: never a forward player save.
  const sim = createSimulation({ seed: 707, systems: [combat, economy, missions, masslineImpacts], updateOrder: [] });
  const {state,bus}=sim;
  state.mode='flight';
  state.story.beatIndex=7; state.story.branch='patrol';
  Object.assign(state.story.flags,{elroy_outcome:'custody',empire_seed_asset_id:'fixture_trader'});
  state.player.credits=10000;
  const player=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},hull:200,hullMax:200,radius:8});
  state.playerId=player.id;
  state.world.currentSectorId='sector_ashfall_reach';
  const sys=sim.registry.get('missions');
  const offer=buildMissionBoardContract(7,{state,branch:'patrol',assetId:'fixture_trader',elroyOutcome:'custody',seed:707,epoch:1});
  const board=sys.ensureBoard('station_ashcache');
  board.slots.push(offer);
  assert.equal(sys.acceptMission(offer.id),true);
  const m=state.missions.active.find(x=>x.storyOperation==='ashfall_blockade');
  assert.ok(m);sys._ensureMissionTargets(m);
  const actors=m.targetEntityIds.map(id=>state.entities.get(id));
  const hulk=actors.find(e=>e.data.physicalRole==='jam_hulk');
  const wedge=actors.find(e=>e.data.physicalRole==='approach_wedge');
  assert.ok(hulk&&wedge);
  const completed=[];bus.on('mission:completed',p=>completed.push(p));
  return {sim,state,bus,sys,m,hulk,wedge,completed};
}
const receipt=h=>({targetId:h.hulk.id,victimId:h.wedge.id,rating:'solid'});
test('bound hulk through wedge settles once through canonical reward path',()=>{
 const h=boot();try {
  const before=h.state.player.credits;
  h.bus.emit('tether:whipImpact',receipt(h));
  assert.equal(h.m.params.completionMethod,'swing_the_wedge');
  assert.equal(h.completed.length,1);assert.ok(h.state.player.credits>before);
  const paid=h.state.player.credits,history=JSON.stringify(h.state.missions.completed);
  h.bus.emit('tether:whipImpact',receipt(h));
  assert.equal(h.completed.length,1);assert.equal(h.state.player.credits,paid);
  assert.equal(JSON.stringify(h.state.missions.completed),history);
 }finally{h.sim.dispose();}
});
for(const [name,mutate] of [
 ['reverse hit', (h,p)=>Object.assign(p,{targetId:h.wedge.id,victimId:h.hulk.id})],
 ['missing mass identity',(h,p)=>delete p.targetId],
 ['missing rating',(h,p)=>delete p.rating],
 ['glance',(h,p)=>p.rating='glance'],
 ['same body',(h,p)=>p.victimId=h.hulk.id],
 ['unbound victim',(h,p)=>h.m.targetEntityIds=h.m.targetEntityIds.filter(id=>id!==h.wedge.id)],
 ['cross mission',(h,p)=>h.wedge.data.missionTag='another_contract'],
 ['cross mission source',(h,p)=>h.hulk.data.missionTag='another_contract'],
 ['generic wreck',(h,p)=>h.hulk.data.physicalRole='wreck'],
 ['callback ballast',(h,p)=>h.hulk.data.physicalRole='reckoning_trader'],
 ['NPC spoof',(h,p)=>p.actorId='npc'],
 ['missing victim',(h,p)=>p.victimId='absent'],
]) test('rejects '+name,()=>{const h=boot();try{const p=receipt(h);mutate(h,p);h.bus.emit('tether:whipImpact',p);assert.equal(h.completed.length,0);assert.equal(h.m.status,'active');}finally{h.sim.dispose();}});
test('native massline producer accepts lethal contact after combat subscriber',()=>{
 const h=boot();try{
  h.hulk.pos={x:100,z:100};h.hulk.vel={x:120,z:0};
  h.wedge.pos={x:100+h.hulk.radius+h.wedge.radius,z:100};h.wedge.vel={x:0,z:0};
  h.wedge.hull=1;h.wedge.shield=0;
  h.state.player.tether={active:true,targetId:h.hulk.id};
  const emitted=[];h.bus.on('tether:whipImpact',p=>emitted.push(p));
  h.sim.registry.get('masslineImpacts').update(1/60,h.state);
  assert.ok(emitted.some(p=>p.targetId===h.hulk.id&&p.victimId===h.wedge.id));
  assert.equal(h.wedge.alive,false,'combat subscriber kills before missions');
  assert.equal(h.m.params.completionMethod,'swing_the_wedge');assert.equal(h.completed.length,1);
 }finally{h.sim.dispose();}
});
test('canonical dock route is unchanged',()=>{
 const h=boot();try{
  // Isolate only berth geometry; leave authored dispatch and canonical settlement intact.
  h.sys._playerLatchedTo=()=>h.hulk;
  h.sys._usesStoryDestDock=()=>true;
  h.sys._entityAtStoryDestDock=()=>true;
  assert.equal(h.sys._tryPhysicalDockComplete(h.m,h.state.missions.active.indexOf(h.m)),true);
  assert.equal(h.m.params.completionMethod,'park_the_hulk');assert.equal(h.completed.length,1);
 }finally{h.sim.dispose();}
});
test('other authored contracts retain existing whip dispatch',()=>{
 const h=boot();try{
  delete h.m.storyOperation;
  h.bus.emit('tether:whipImpact',{victimId:h.hulk.id,rating:'solid'});
  assert.equal(h.m.params.completionMethod,'swing_the_wedge');assert.equal(h.completed.length,1);
 }finally{h.sim.dispose();}
});
test('already completed historical record is untouched',()=>{
 const h=boot();try{
  h.m.status='completed';h.m.params.completionMethod='park_the_hulk';
  const before=JSON.stringify(h.m);
  h.bus.emit('tether:whipImpact',receipt(h));
  assert.equal(JSON.stringify(h.m),before);assert.equal(h.completed.length,0);
 }finally{h.sim.dispose();}
});
