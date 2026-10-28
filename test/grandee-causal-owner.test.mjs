import test from 'node:test';

import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {combat} from '../src/systems/combat.js';
import {stationContacts} from '../src/systems/stationContacts.js';
import {save} from '../src/save/saveSystem.js';
const SECTOR='sector_helios_prime';
function boot(name) {
 const sim=createSimulation({seed:4242,systems:[combat,encounterDirector,stationContacts,save],updateOrder:[encounterDirector]});
 const state=sim.state, bus=sim.bus, d=sim.registry.get('encounterDirector'), c=sim.registry.get('combat');
 const p=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},vel:{x:0,z:0},radius:8,mass:100,hull:100,hullMax:100,data:{intent:{},ai:{}}});
 state.playerId=p.id;state.mode='flight';state.world.currentSectorId=SECTOR;state.story.beatIndex=7;
 const rows=[];for(const n of ['combat:damage','entity:killed','encounter:voice','encounter:receipt','encounter:resolved','news:publish','faction:repDelta'])bus.on(n,p=>rows.push({n,p}));
 const r=d.requestAuthoredEncounter({shapeId:'the_grandee_transit',encounterId:'grandee:qualification:'+name,sectorId:SECTOR,anchor:{x:0,z:0},force:true});assert.equal(r.ok,true);
 const live=state.encounterDirector.live[r.encounterId],g=d.entsOf(live,'squad')[0],esc=d.entsOf(live,'escort')[0];
 const npc=sim.spawn({type:'ship',team:1,pos:{x:100,z:0},hull:100,hullMax:100,data:{ai:{}}});
 const count=(n,match)=>rows.filter(r=>r.n===n&&(!match||JSON.stringify(r.p).includes(match))).length;
 return {sim,state,bus,d,c,p,npc,live,g,esc,rows,count};
}
const hit=(t,owner,target,damage)=>t.c.onHit({targetId:target.id,ownerId:owner,damage,damageType:'kinetic',pos:target.pos});

test('Grandee consequences follow combat ownership and survive Save/Continue neutrally', () => {
for(const kind of ['player-direct','player-projectile','npc','environment']) {
 const t=boot(kind);const owner=kind.startsWith('player')?t.p.id:kind==='npc'?t.npc.id:null;
 if(kind==='player-projectile')t.bus.emit('projectile:hit',{targetId:t.g.id,ownerId:owner,damage:1e8,damageType:'kinetic',pos:t.g.pos});
 else assert.equal(hit(t,owner,t.g,1e8).ok,true);
 assert.equal(t.count('entity:killed'),1);assert.equal(t.count('encounter:resolved','grandee_lost'),1);
 assert.equal(t.count('news:publish','THE GRANDEE IS GONE'),1);
 assert.equal(t.count('faction:repDelta','grandee_lost'),kind.startsWith('player')?1:0);
 assert.equal(t.count('encounter:voice','harassing'),kind.startsWith('player')?1:0);
 assert.equal(t.count('encounter:receipt','Whatever your reason'),0);
 const damageAt=t.rows.findIndex(r=>r.n==='combat:damage'), killAt=t.rows.findIndex(r=>r.n==='entity:killed');
 assert.ok(damageAt>=0&&killAt>damageAt);
 const deed=t.state.stationLife.deeds[SECTOR];assert.equal(deed.text,'The Grandee of Helion did not clear this pocket.');
 if(kind==='environment'){
  const s=t.sim.registry.get('save'), before=t.count('faction:repDelta');
  const json=JSON.stringify(s.serialize('grandee-qualified'));assert.equal(s.loadEnvelope(JSON.parse(json),'grandee-qualified'),true);
  assert.equal(t.state.stationLife.deeds[SECTOR].text,deed.text);assert.equal(t.count('faction:repDelta'),before);
  assert.equal(Object.keys(t.state.encounterDirector.live).length,0);
  const contacts=t.sim.registry.get('stationContacts');t.state.simTime=deed.simTime+1800;contacts._normalizeDeeds();assert.ok(t.state.stationLife.deeds[SECTOR]);
  t.state.simTime=deed.simTime+1800.01;contacts._normalizeDeeds();assert.equal(t.state.stationLife.deeds[SECTOR],undefined);
  console.log('SAVE_JSON_LOAD_PASS neutral deed preserved; no penalty replay; TTL inclusive1800 expires1800.01');
 }
 console.log('KILL_PASS',kind,JSON.stringify({damage:t.rows.find(r=>r.n==='combat:damage')?.p.applied,penalties:t.count('faction:repDelta','grandee_lost'),warnings:t.count('encounter:voice','harassing')}));
 t.sim.dispose();
}
{
 const t=boot('zero-escort');const zero=hit(t,t.p.id,t.g,0);assert.equal(t.count('encounter:voice','harassing'),0);
 hit(t,t.p.id,t.esc,20);assert.equal(t.count('encounter:voice','harassing'),0);assert.equal(t.live.data.grandee.hitSeen,false);
 hit(t,t.p.id,t.g,20);hit(t,t.p.id,t.g,20);assert.equal(t.count('encounter:voice','harassing'),1);
 console.log('HIT_PASS positive player once; zero and escort excluded',zero.reason);t.sim.dispose();
}
for(const kind of ['missing','virtualize']) {
 const t=boot(kind);if(kind==='missing')t.sim.helpers.removeEntity(t.g.id);else t.bus.emit('entity:destroyed',{id:t.g.id,entity:t.g,reason:'virtualize'});
 for(let i=0;i<120;i++)t.sim.step();
 assert.equal(t.count('news:publish','THE GRANDEE IS GONE'),0);assert.equal(t.count('faction:repDelta','grandee_lost'),0);
 assert.equal(t.count('encounter:receipt'),0);assert.equal(t.state.stationLife.deeds[SECTOR],undefined);
 assert.equal(t.count('encounter:resolved','aborted:grandee_missing'),1);console.log('ABSENCE_PASS',kind);t.sim.dispose();
}

for(const kind of ['npc','environment']) {
 const t=boot('nonlethal-'+kind), owner=kind==='npc'?t.npc.id:null;
 const result=hit(t,owner,t.g,500);assert.equal(result.ok,true);assert.equal(t.g.alive,true);
 for(let i=0;i<7800&&t.state.encounterDirector.live[t.live.id];i++)t.sim.step();
 assert.equal(t.count('encounter:voice','harassing'),0);assert.equal(t.count('faction:repDelta','grandee_lost'),0);
 assert.equal(t.count('encounter:resolved','transit_harried'),1);
 assert.equal(t.state.stationLife.deeds[SECTOR].text,'The Grandee cleared the pocket after taking damage.');
 console.log('NONLETHAL_PASS',kind,JSON.stringify({applied:result.totalApplied,hull:result.hullDamage}));t.sim.dispose();
}
{
 const t=boot('zero-applied');
 const r=t.c.onHit({targetId:t.g.id,ownerId:t.p.id,damage:0,heat:1,damageType:'kinetic',pos:t.g.pos});
 assert.equal(r.ok,true);assert.equal(r.totalApplied,0);assert.equal(t.count('combat:damage'),1);
 assert.equal(t.rows.find(r=>r.n==='combat:damage').p.applied,0);
 assert.equal(t.count('encounter:voice','harassing'),0);
 console.log('ZERO_APPLIED_PASS accepted heat packet applied0 emits real combat:damage without warning');t.sim.dispose();
}

});
