import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourney, restoreJourney, stepJourney, command, targetFor, clone, consequenceFor } from '../src/features/wayfarer-house/core.mjs';
import { createWayfarerHouse } from '../src/features/wayfarer-house/adapter.mjs';
import { PODS, ROLES, at, DESTINATIONS } from '../src/features/wayfarer-house/data.mjs';
import { corridorSpecs } from '../src/features/wayfarer-house/corridor.mjs';
import { readout } from '../src/features/wayfarer-house/presentation.mjs';

const spec = {id:'test_house',sectorId:'sector_helios_prime',origin:{x:700,z:-300}};
const create = () => createJourney(spec,0);
function observation(s) {
  const pos=targetFor(s)||s.origin;
  return {present:true,bodies:Object.fromEntries(ROLES.map(id=>[id,{alive:true,pos:{...pos},vel:{x:0,z:0}}])),
    linked:{hearth:true,clinic:true,garden:true},available:{commons:true,compact:true},
    threatCleared:true,playerTowingGarden:true};
}
function runCore(resumeAt = -1, omit = null) {
  let s=create(),time=0;command(s,'depart');const trace=[];
  const pos={...s.origin};
  for(let tick=1;tick<80000 && s.phase!=='settled';tick++) {
    time=tick/60;
    const goal=targetFor(s);
    if(goal && s.separation!=='requested') {
      const dx=goal.x-pos.x,dz=goal.z-pos.z,d=Math.hypot(dx,dz),delta=Math.min(d,18/60);
      if(d){pos.x+=dx/d*delta;pos.z+=dz/d*delta;}
    }
    const v=observation(s);for(const id of ROLES)v.bodies[id].pos={...pos};
    if(s.phase==='recovery')v.bodies.garden.pos={...pos};
    if(omit)v.bodies[omit].alive=false;
    const before=s.phase+':'+s.leg;
    for(const e of stepJourney(s,time,v)){
      if(e.kind==='separate')command(s,'separated');
      if(e.kind==='reconnect')command(s,'reconnected');
      if(e.kind==='defense'){s.threat='active';s.revision++;}
    }
    if(s.phase==='choosing')command(s,'choose','commons');
    if(before!==s.phase+':'+s.leg)trace.push([tick,s.phase,s.leg]);
    if(tick===resumeAt)s=restoreJourney(clone(s));
  }
  return {s,time,trace};
}

test('authored relocation lasts 10–15 minutes with real-distance travel at authored speed',()=>{
  const {s,time}=runCore();assert.equal(s.phase,'settled');assert.equal(s.separation,'recovered');
  assert.ok(time>=600&&time<=900,`duration ${time}`);assert.equal(s.consequence.rewardCr,540);
});
test('fixed-seed/no-randomness replay and mid-relocation restore preserve the entire trace',()=>{
  assert.deepEqual(runCore(),runCore());assert.deepEqual(runCore(18000),runCore());
});
test('elapsed time never substitutes for physical arrival or connected pods',()=>{
  const s=create();command(s,'depart');const v=observation(s);v.bodies.tug.pos={x:-50000,z:0};
  for(let i=1;i<40000;i++)stepJourney(s,i/60,v);
  assert.equal(s.leg,0);v.bodies.tug.pos=targetFor(s);v.linked.clinic=false;
  stepJourney(s,40000/60,v);assert.equal(s.leg,0);
});
test('leaving freezes objective progress and rejoining does not aggregate the gap',()=>{
  const s=create();command(s,'depart');const v=observation(s);v.present=false;
  for(let i=1;i<=600;i++)stepJourney(s,i/60,v);
  assert.equal(s.elapsed,0);v.present=true;stepJourney(s,10000,v);assert.equal(s.elapsed,0);
  stepJourney(s,10000+1/60,v);assert.ok(s.elapsed>0&&s.elapsed<0.02);
});
test('separation requires owner receipt, sustained recovery envelope and owner reconnect receipt',()=>{
  const s=create();command(s,'depart');s.leg=2;
  let v=observation(s);assert.deepEqual(stepJourney(s,1/60,v),[{kind:'separate'}]);
  assert.equal(s.separation,'requested');assert.equal(command(s,'reconnected'),false);
  command(s,'separated');v=observation(s);v.playerTowingGarden=false;
  for(let i=2;i<602;i++)stepJourney(s,i/60,v);assert.equal(s.captureTime,0);
  v.playerTowingGarden=true;
  for(let i=602;i<1100;i++)stepJourney(s,i/60,v);
  assert.equal(s.phase,'recovery');assert.equal(s.captureTime,8);
  assert.equal(command(s,'reconnected'),true);assert.equal(command(s,'reconnected'),false);
});
test('a fast catch resets the recovery dwell; abandoning is explicit and recoverable episode continues',()=>{
  const s=create();command(s,'depart');s.separation='requested';command(s,'separated');
  const v=observation(s);s.captureTime=7;v.bodies.garden.vel={x:30,z:0};
  stepJourney(s,1/60,v);assert.equal(s.captureTime,0);
  assert.equal(command(s,'abandon'),true);assert.equal(s.phase,'moving');
  assert.equal(s.pods.garden.disposition,'abandoned');assert.equal(s.civilians.sen,'alive');
});
test('pod and crew loss reduces consequences and never deadlocks the relocation',()=>{
  const {s}=runCore(-1,'clinic');assert.equal(s.phase,'settled');
  assert.equal(s.civilians.ivo,'lost');assert.equal(s.consequence.rewardCr,360);
  assert.ok(!s.consequence.services.includes('triage'));
});
test('loss of tug/all pods is terminal without completion or minted reward',()=>{
  for(const ids of [['tug'],['hearth','clinic','garden']]){
    const s=create();command(s,'depart');const v=observation(s);for(const id of ids)v.bodies[id].alive=false;
    stepJourney(s,1/60,v);assert.equal(s.phase,'lost');assert.equal(s.consequence,null);
  }
});
test('unavailable destination cancels the berth and requires a fresh available choice',()=>{
  const s=create();s.phase='choosing';s.leg=5;command(s,'choose','compact');
  const v=observation(s);v.available.compact=false;stepJourney(s,1/60,v);
  assert.equal(s.phase,'choosing');assert.equal(s.destination,null);assert.equal(s.berthTime,0);
});
test('services require both survival and finite supplies, with distinct persistent destinations',()=>{
  const s=create();s.destination='commons';s.pods.hearth.supplied=true;s.pods.clinic.supplied=true;
  s.pods.clinic.disposition='lost';s.civilians.ivo='lost';
  assert.deepEqual(consequenceFor(s).services,['refuge']);
  const a=consequenceFor(s);s.destination='compact';const b=consequenceFor(s);
  assert.notEqual(a.factionId,b.factionId);
});
test('restore is closed, bounded, detached and rejects invalid versions/numbers/pod states',()=>{
  const s=create(),r=restoreJourney(clone(s));r.pods.hearth.supplied=true;assert.equal(s.pods.hearth.supplied,false);
  for(const change of [x=>x.version=2,x=>x.leg=999,x=>x.elapsed=NaN,x=>x.pods.garden.disposition='teleported']){
    const bad=clone(s);change(bad);assert.throws(()=>restoreJourney(bad));
  }
  const extra=clone(s);extra.evil=Array(10000).fill('junk');assert.equal(restoreJourney(extra).evil,undefined);
});

function harness() {
  const entities=new Map(),events=[],jobBook=new Map(),lines=new Map(),commands=[];
  const state={simTime:0,tick:0,mode:'flight',world:{currentSectorId:spec.sectorId},entities,playerId:99,
    player:{credits:0,cargo:{items:{cmdty_ice_water:20,cmdty_medical:5}}}};
  let seq=0,cashCalls=0,repCalls=0,navClaims=0;
  const pilot={id:99,occupantGeneration:999,alive:true,hull:100,pos:{...spec.origin},vel:{x:0,z:0},data:{}};entities.set(99,pilot);
  const spawnEntity=s=>{const e={...s,id:++seq,occupantGeneration:seq+100,alive:true,vel:s.vel||{x:0,z:0},hull:s.hull||500};entities.set(e.id,e);return e;};
  const service={get:id=>lines.get(id),listForEntity:id=>[...lines.values()].filter(a=>a.ownerId===id||a.targetId===id),
    create:s=>{const owner=entities.get(s.ownerId),target=entities.get(s.targetId);
      const a={...s,id:`att_${lines.size+1}`,ownerGeneration:owner.occupantGeneration,targetGeneration:target.occupantGeneration,state:'active'};
      lines.set(a.id,a);return {ok:true,attachment:a};},
    cut:(id,actor,reason)=>{const a=lines.get(id);if(!a||a.ownerId!==actor)return {ok:false};a.state='broken';return {ok:true};}};
  const helpers={spawnEntity,npcJobs:{get:id=>jobBook.get(id),assign:(e,s)=>{const id=`job:${e.data.worldRecordId}`;jobBook.set(id,{worldRecordId:e.data.worldRecordId,entityId:e.id,spec:s});return id;},
    release:id=>jobBook.delete(id),releaseControl:()=>({released:true}),claimControl:()=>{navClaims++;return {granted:true};}},
    aiManeuver:{claimActivity:()=>({}),cancelActivity:()=>true,request:r=>{commands.push(r);return true;}}};
  const owners={combat:{kernel:{attachments:service}},economy:{grantCredits:(n)=>{cashCalls++;state.player.credits+=n;}},factions:{applyRep:()=>{repCalls++;}}};
  let closed=new Set();
  const api=createWayfarerHouse({state,helpers,bus:{emit:(...e)=>events.push(e)},registry:{get:id=>owners[id]},
    makeShipEntitySpec:(shipId,o)=>({type:'ship',...o,hull:500,vel:{x:0,z:0},rot:0,data:{shipId,ai:o.ai}}),
    sellableCargoQuantity:(s,id)=>s.player.cargo.items[id]||0,
    removeCargo:(s,id,n)=>{const taken=Math.min(n,s.player.cargo.items[id]||0);s.player.cargo.items[id]-=taken;return taken;},
    destinationAvailable:id=>!closed.has(id),destinationStationId:id=>`station_wayfarer_${id}`});
  const activate=()=>api.activate(spec);
  const body=role=>[...entities.values()].find(e=>e.data?.wayfarerKey===`${spec.id}:${role}`);
  const tick=()=>{state.simTime+=1/60;state.tick++;api.update();};
  return {api,state,entities,lines,jobBook,events,helpers,owners,pilot,activate,body,tick,closed,
    counts:()=>({cashCalls,repCalls,navClaims,entities:entities.size})};
}

test('adapter creates one tug, three pods and six finite physical corridor fragments through factory',()=>{
  const h=harness();assert.equal(h.activate(),true);assert.equal(h.activate(),true);
  assert.equal(h.counts().entities,11);assert.equal(h.lines.size,3);
  const specs=corridorSpecs(create());assert.equal(specs.length,6);assert.ok(specs.every(s=>s.physicsBody.dynamic===false));
});
test('revision guard and owner debit make repeated supply/depart callbacks harmless',()=>{
  const h=harness();h.activate();const request={revision:0,kind:'supply',pod:'hearth'};
  assert.equal(h.api.act(request),true);assert.equal(h.api.act(request),false);
  assert.equal(h.state.player.cargo.items.cmdty_ice_water,16);
  const r=h.api.read().revision;assert.equal(h.api.act({revision:r,kind:'depart'}),true);
  assert.equal(h.api.act({revision:r,kind:'depart'}),false);h.tick();assert.equal(h.jobBook.size,1);
});
test('recycled body ids cannot authorize supply, movement, link adoption or loss of the new occupant',()=>{
  const h=harness();h.activate();const old=h.body('hearth');
  h.entities.set(old.id,{...old,occupantGeneration:old.occupantGeneration+1000});
  assert.equal(h.api.act({revision:0,kind:'supply',pod:'hearth'}),false);h.tick();
  assert.equal(h.api.read().pods.hearth.disposition,'aboard');assert.equal(h.state.player.cargo.items.cmdty_ice_water,20);
});
test('retained dead exact occupant reports pod loss after removal, and does not kill a recycled body',()=>{
  const h=harness();h.activate();const old=h.body('clinic');old.alive=false;h.entities.delete(old.id);
  h.entities.set(old.id,{...old,alive:true,occupantGeneration:8000});h.tick();
  assert.equal(h.api.read().pods.clinic.disposition,'lost');assert.equal(h.entities.get(old.id).alive,true);
});
test('save restore requires canonical stable-record rebinding before any navigation',()=>{
  const h=harness();h.activate();h.api.act({revision:0,kind:'depart'});h.tick();const saved=h.api.serialize();
  h.api.deserialize(saved);h.tick();assert.equal(h.jobBook.size,0);
  for(const role of ROLES){const e=h.body(role);e.occupantGeneration+=100;assert.equal(h.api.bind(role,e),true);}
  assert.equal(h.api.finishRestore(),true);h.tick();assert.equal(h.jobBook.size,1);
  assert.equal(h.api.serialize().journey.phase,'moving');
});
test('settlement cash and faction effects occur once across reentry, duplicate ticks and restore',()=>{
  const h=harness();h.activate();const saved=h.api.serialize(),s=runCore().s;
  saved.journey=s;h.api.deserialize(saved);for(const role of ROLES)h.api.bind(role,h.body(role));
  h.api.finishRestore();h.tick();h.tick();assert.equal(h.state.player.credits,540);
  assert.deepEqual([h.counts().cashCalls,h.counts().repCalls],[1,1]);
  const settled=h.api.serialize();h.api.deserialize(settled);for(const role of ROLES)h.api.bind(role,h.body(role));
  h.api.finishRestore();h.tick();assert.equal(h.state.player.credits,540);assert.equal(h.counts().repCalls,1);
  assert.equal(h.api.missionProof('m_test').complete,true);assert.equal(h.api.serviceProfile('compact'),null);
  assert.equal(h.api.dockedServiceProfile(),null);
  h.state.ui={docked:true,dockedStationId:'station_wrong'};assert.equal(h.api.dockedServiceProfile(),null);
  h.state.ui.dockedStationId='station_wayfarer_commons';assert.equal(h.api.dockedServiceProfile().destination,'commons');
});
test('destination adapter refuses closed choice; retired instance releases its navigation and refuses input',()=>{
  const h=harness();h.activate();h.closed.add('commons');assert.equal(h.api.routeToHarbour('commons'),false);
  assert.equal(h.api.routeToHarbour('compact'),true);assert.equal(h.events.at(-1)[0],'ui:setCourse');
  h.api.act({revision:0,kind:'depart'});h.tick();
  assert.equal(h.api.act({revision:h.api.read().revision,kind:'retire'}),true);h.tick();
  assert.equal(h.jobBook.size,0);assert.equal(h.api.act({revision:h.api.read().revision,kind:'depart'}),false);
});
test('readout exposes named needs, unavailable choices and textual recovery status without rendering dependencies',()=>{
  const s=create();s.phase='recovery';s.available={commons:false,compact:true};
  const r=readout(s);assert.equal(r.civilians.length,3);assert.equal(r.destinations[0].available,false);
  assert.match(r.recovery,/8 s/);assert.match(r.pods[0].text,/water/i);
});

test('loss sampling still terminates when the dead tug makes player presence false',()=>{
  const h=harness();h.activate();const tug=h.body('tug');tug.alive=false;h.entities.delete(tug.id);
  h.tick();assert.equal(h.api.read().phase,'lost');assert.equal(h.api.missionProof('m').complete,false);
});
test('save capture records a removed casualty without advancing live feature clocks or objectives',()=>{
  const h=harness();h.activate();const clinic=h.body('clinic');clinic.alive=false;h.entities.delete(clinic.id);
  const before=h.api.read();const saved=h.api.serialize();
  assert.equal(saved.journey.pods.clinic.disposition,'lost');assert.equal(h.api.read().pods.clinic.disposition,'aboard');
  assert.equal(h.api.read().lastSimTime,before.lastSimTime);
});
test('recovery after clinic loss uses the surviving hearth rather than a dead receiver',()=>{
  const s=create();command(s,'depart');s.separation='requested';command(s,'separated');
  const v=observation(s);v.bodies.clinic.alive=false;v.bodies.clinic.pos={x:-9000,z:0};
  for(let i=1;i<=490;i++)stepJourney(s,i/60,v);
  assert.equal(s.captureTime,8);assert.equal(command(s,'reconnected'),true);
});

test('adapter cuts through owner, requires a physical player tow, reconnects once, and bounds defense spawns',()=>{
  const h=harness();h.activate();let saved=h.api.serialize();saved.journey.phase='moving';saved.journey.leg=2;
  h.api.deserialize(saved);for(const role of ROLES)h.api.bind(role,h.body(role));h.api.finishRestore();
  h.tick();assert.equal(h.api.read().phase,'recovery');
  assert.equal([...h.lines.values()].filter(a=>a.state==='broken').length,1);
  for(let i=0;i<600;i++)h.tick();assert.equal(h.api.read().captureTime,0);
  const garden=h.body('garden');garden.pos={...h.body('clinic').pos};
  h.lines.set('player_line',{id:'player_line',ownerId:99,ownerGeneration:999,targetId:garden.id,
    targetGeneration:garden.occupantGeneration,state:'active'});
  for(let i=0;i<490;i++)h.tick();assert.equal(h.api.read().separation,'recovered');
  assert.equal(h.api.read().phase,'moving');h.tick();
  const count=h.counts().entities;assert.equal(count,13);
  for(let i=0;i<10;i++)h.tick();assert.equal(h.counts().entities,count);
  for(const role of ['raider_0','raider_1'])h.body(role).alive=false;
  h.tick();assert.equal(h.api.read().threat,'cleared');assert.equal(h.counts().entities,count);
});
test('owner refusal cannot complete physical separation',()=>{
  const h=harness();h.activate();const saved=h.api.serialize();saved.journey.phase='moving';saved.journey.leg=2;
  h.api.deserialize(saved);for(const role of ROLES)h.api.bind(role,h.body(role));h.api.finishRestore();
  h.owners.combat.kernel.attachments.cut=()=>({ok:false,reason:'physics_refused'});
  h.tick();assert.equal(h.api.read().separation,'requested');assert.equal(h.api.read().phase,'moving');
  assert.equal(h.api.read().lastError,'physics_refused');
});
test('invalid restore leaves the active instance intact',()=>{
  const h=harness();h.activate();const saved=h.api.serialize();saved.journey.version=999;
  assert.throws(()=>h.api.deserialize(saved));assert.equal(h.api.read().phase,'preparing');assert.equal(h.counts().entities,11);
});
test('helm/custody transfer retires feature authority instead of piloting the captured tug',()=>{
  const h=harness();h.activate();h.api.act({revision:0,kind:'depart'});h.tick();
  const tug=h.body('tug');tug.isPlayer=true;h.state.playerId=tug.id;h.tick();
  assert.equal(h.api.read().phase,'retired');assert.equal(h.api.read().retiredReason,'tug_custody_changed');
  assert.equal(h.jobBook.size,0);assert.equal(h.api.missionProof('m').complete,false);
});
test('restoring missing active defense blocks until exact lifecycle retirement, rejecting stale receipts',()=>{
  const h=harness();h.activate();const initial=h.api.serialize();initial.journey.phase='moving';initial.journey.leg=1;
  h.api.deserialize(initial);for(const role of ROLES)h.api.bind(role,h.body(role));h.api.finishRestore();h.tick();
  const saved=h.api.serialize();assert.equal(saved.journey.threat,'active');
  const actors=[h.body('raider_0'),h.body('raider_1')];for(const e of actors)h.entities.delete(e.id);
  h.api.deserialize(saved);for(const role of ROLES)h.api.bind(role,h.body(role));
  assert.equal(h.api.finishRestore(),false);
  assert.equal(h.api.recordRaiderRetirement(0,actors[0].id,99999),false);
  for(const [i,e] of actors.entries())assert.equal(h.api.recordRaiderRetirement(i,e.id,e.occupantGeneration),true);
  assert.equal(h.api.recordRaiderRetirement(0,actors[0].id,actors[0].occupantGeneration),false);
  assert.equal(h.api.finishRestore(),true);h.tick();assert.equal(h.api.read().threat,'cleared');
});
