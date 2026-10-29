// Focused observations use real director dispatch; the native case also uses scanner input.
import test from 'node:test';
import assert from 'node:assert/strict';
import encounter,{runtime,spec} from '../src/data/encounters/916-scene-archive-record-tail.js';
import {createSimulation} from '../src/core/sim.js';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {scanner} from '../src/systems/scanner.js';
import {economy} from '../src/systems/economy.js';
import {ENCOUNTERS} from '../src/data/encounters.js';
import {zonesForSector,zoneAt} from '../src/data/sectorZones.js';
import {sectorLocalToGlobalForSector} from '../src/data/sectorCoordinates.js';
import {tickLivedVignettes,pickLivedVignette} from '../src/systems/livedWorldDirector.js';
import {save} from '../src/save/saveSystem.js';

function boot(){
 const sim=createSimulation({seed:916,systems:[economy,scanner,encounterDirector]});
 const {state,bus}=sim;state.mode='flight';state.world.currentSectorId='sector_orcus_shadow';
 state.world.activeSector={id:'sector_orcus_shadow',pois:[]};
 const player=sim.spawn({type:'ship',team:0,pos:{x:-250,z:0},vel:{x:0,z:0},rot:0,radius:14,mass:16,hull:150,hullMax:150,data:{}});state.playerId=player.id;
 const d=sim.registry.get('encounterDirector'),s=sim.registry.get('scanner');
 const fired=d.requestAuthoredEncounter({shapeId:encounter.id,encounterId:'archive-test',sectorId:state.world.currentSectorId,anchor:{x:0,z:0},force:true,data:{sceneAxis:{ux:1,uz:0}}});assert.equal(fired.ok,true,JSON.stringify(fired));
 const live=state.encounterDirector.live['archive-test'];assert.equal(live.shape,encounter);
 const grants=[],reps=[],pulses=[];bus.on('economy:grantCredits',p=>grants.push(p.amount));bus.on('faction:repDelta',p=>reps.push(p));bus.on('scan:pulse',p=>pulses.push(p));
 const role=r=>state.entities.get(live.ids.find(id=>live.roles[id]===r));
 const tick=at=>{state.simTime=at;runtime.tick(d,live,state,at);};
 const choose=c=>bus.emit('encounter:choose',{encounterId:live.id,choiceId:c});
 const pulse=()=>{state.input.actions={...(state.input.actions||{}),scanPulse:true};s.update(1/60,state);};
 tick(6);assert.equal(live.phase,'offer');
 return {sim,state,bus,player,d,s,live,grants,reps,pulses,role,tick,choose,pulse};
}
function send(h,overrides={}){
 h.s._pulseSeq=(h.s._pulseSeq||0)+1;
 const p={source:'player-scanner',scannerId:h.player.id,seq:h.s._pulseSeq,simTime:h.state.simTime,pos:{...h.player.pos},radius:1200,...overrides};
 h.bus.emit('scan:pulse',p);return p;
}
function empty(h){assert.deepEqual(h.grants,[]);assert.deepEqual(h.reps,[]);}

test('original two hulls, rewards and Orcus-only selection stay authored',()=>{
 assert.deepEqual(spec.cast.map(x=>[x.role,x.archetype,x.factionId]),[['runner','quiet_ghost','faction_quiet'],['ship_1','choir_zealot','faction_archive']]);
 assert.deepEqual(encounter.sectorIds,['sector_orcus_shadow']);assert.equal(spec.phases.find(x=>x.id==='grant_a').amount,30);
 assert.match(spec.choices[0].label,/Scan/);assert.doesNotMatch(JSON.stringify(encounter.receipts),/escape|recover|rescued|cover/i);
});
test('A choice alone pays nothing; ordinary scanner input earns a bearing exactly once',()=>{
 const h=boot();h.choose('a');empty(h);assert.equal(h.live.phase,'await_bearing');h.pulse();assert.equal(h.pulses.length,1);assert.equal(h.live.outcome,'a');assert.deepEqual(h.grants,[30]);assert.equal(h.state.player.credits,30);assert.equal(h.reps.length,1);assert.equal(h.reps[0].delta,2);
 h.bus.emit('scan:pulse',h.pulses[0]);h.choose('a');h.tick(7);assert.deepEqual(h.grants,[30]);assert.equal(h.state.encounterDirector.stats.livedSeen[encounter.id],'a');
});
test('pre-choice covered scan prevents later unread withdrawal and gives no advance A credit',()=>{
 for(const choice of ['a','b']){const h=boot();h.pulse();empty(h);h.choose(choice);empty(h);
  if(choice==='b'){assert.equal(h.live.phase,'done');assert.notEqual(h.live.outcome,'b');}
  else{assert.equal(h.live.phase,'await_bearing');h.bus.emit('scan:pulse',h.pulses[0]);empty(h);h.tick(15);h.pulse();assert.equal(h.live.outcome,'a');}}
});
test('a pre-choice uncovered pulse does not fabricate a read',()=>{const h=boot();send(h,{radius:1});h.choose('b');h.player.pos={x:-900,z:0};h.tick(7);assert.equal(h.live.outcome,'b');});
for(const [name,overrides] of [
 ['wrong source',{source:'npc'}],['wrong scanner',{scannerId:999}],['old time',{simTime:5}],['future time',{simTime:7}],['wrong origin',{pos:{x:0,z:0}}],['invalid origin',{pos:{x:NaN,z:0}}],['negative radius',{radius:-1}],['infinite radius',{radius:Infinity}],['missing radius',{radius:undefined}],['outside radius',{radius:249}],['wrong sequence',{seq:999}],['fractional sequence',{seq:1.5}],
])test('reject '+name,()=>{const h=boot();h.choose('a');send(h,overrides);empty(h);assert.equal(h.live.phase,'await_bearing');});
test('a scan exactly reaching the original runner qualifies',()=>{const h=boot();h.choose('a');send(h,{radius:250});assert.equal(h.live.outcome,'a');});
test('scanner owner must belong to this state',()=>{const h=boot();h.choose('a');h.s.state={};send(h);empty(h);});
test('B requires measured departure, not accepting or waiting at the perimeter',()=>{
 const h=boot();h.choose('b');h.tick(7);empty(h);h.player.pos={x:-599,z:0};h.tick(8);empty(h);h.player.pos={x:-650,z:0};h.tick(9);assert.equal(h.live.outcome,'b');assert.deepEqual(h.grants,[]);assert.deepEqual(h.reps.map(x=>x.delta),[1,-1]);h.tick(10);h.choose('b');assert.equal(h.reps.length,2);
});
test('late B accepts existing stopped actors without fabricating escape progress',()=>{
 const h=boot();h.tick(25);h.choose('b');h.player.pos={x:-900,z:0};h.tick(26);assert.equal(h.live.outcome,'b');assert.equal(h.role('runner').pos.x,0);
});
test('B must leave both original hulls clear',()=>{const h=boot();h.choose('b');h.player.pos={x:-900,z:0};h.role('ship_1').pos={x:-650,z:0};h.tick(7);empty(h);assert.equal(h.live.phase,'await_discretion');});
test('B covering scan breaks discretion, including exactly at the range boundary',()=>{const h=boot();h.choose('b');send(h,{radius:250});h.player.pos={x:-900,z:0};h.tick(7);empty(h);assert.equal(h.live.phase,'done');assert.notEqual(h.live.outcome,'b');});
for(const who of ['runner','ship_1','player'])for(const kind of ['dead','replacement'])test(who+' '+kind+' cannot settle',()=>{
 const h=boot();h.choose('a');const e=who==='player'?h.player:h.role(who);if(kind==='dead')e.alive=false;else h.state.entities.set(e.id,{...e,pos:{...e.pos}});send(h);empty(h);assert.equal(h.live.phase,'done');
});
test('sector departure, exact deadline and backward clock abort unpaid',()=>{for(const change of ['sector','deadline','clock']){const h=boot();h.choose('a');if(change==='sector')h.state.world.currentSectorId='sector_phoebe_echo';h.tick(change==='deadline'?96:change==='clock'?5:7);send(h);empty(h);assert.equal(h.live.phase,'done');}});
test('late input cannot claim the original offer',()=>{const h=boot();h.state.simTime=h.live.deadlineAt;h.choose('a');send(h);empty(h);});
test('repeated choices cannot switch the committed action',()=>{const h=boot();h.choose('b');h.choose('a');h.pulse();empty(h);assert.equal(h.live.phase,'done');assert.notEqual(h.live.outcome,'a');});
test('C and unanswered offer are neutral',()=>{for(const choice of [true,false]){const h=boot();if(choice)h.choose('c');else h.tick(29);empty(h);assert.equal(h.live.outcome,'c');}});

for(const branch of ['a','b']) test('native original hulls + real input + actual director dispatch '+branch, {timeout:120000},async()=>{
 const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');
 const h=await bootRealPath({seed:916,systems:['tacticalAI','flightV3','aiPorts','physics',economy,scanner,encounterDirector],hulls:[{hullId:'ship_wasp',isPlayer:true,rot:0,pos:{x:-250,z:0}}]});
 try{
  h.state.world.currentSectorId='sector_orcus_shadow';h.state.world.activeSector={id:'sector_orcus_shadow',pois:[]};
  const d=h.runtime.getSystem('encounterDirector');assert.equal(d.requestAuthoredEncounter({shapeId:encounter.id,encounterId:'native-archive',sectorId:'sector_orcus_shadow',anchor:{x:0,z:0},force:true,data:{sceneAxis:{ux:1,uz:0}}}).ok,true);
  const l=h.state.encounterDirector.live['native-archive'],original=l.ids.map(id=>h.state.entities.get(id));assert.equal(l.shape,encounter);
  const pulses=[],grants=[],reps=[];let contacts=0;h.bus.on('faction:repDelta',p=>reps.push(p.delta));h.bus.on('scan:pulse',p=>pulses.push(p));h.bus.on('economy:grantCredits',p=>grants.push(p.amount));h.bus.on('physics:impact',()=>contacts++);
  for(let n=0;n<1200&&l.phase!=='done';n++){
   writeRealPathInput(h.state,{moveZ:branch==='b'&&l.phase==='await_discretion'?-.5:0,moveX:0,turnIntent:0});
   if(l.phase==='offer'){h.bus.emit('encounter:choose',{encounterId:l.id,choiceId:branch});assert.deepEqual(grants,[]);assert.deepEqual(reps,[]);if(branch==='a')h.state.input.actions={...(h.state.input.actions||{}),scanPulse:true};}
   h.step(1);
  }
  if(l.outcome!==branch)console.log('NATIVE_PENDING',JSON.stringify({branch,phase:l.phase,now:h.state.simTime,player:h.player.pos,vel:h.player.vel,actors:original.map(e=>({id:e.id,pos:e.pos,alive:e.alive})),deadline:l.deadlineAt}));
  assert.equal(l.outcome,branch);assert.deepEqual(reps,branch==='a'?[2]:[1,-1]);if(branch==='b'){assert.ok(Math.hypot(h.player.pos.x+250,h.player.pos.z)>=400);assert.ok(Math.hypot(h.player.pos.x,h.player.pos.z)>=600);assert.ok(original.every(e=>Math.hypot(e.pos.x-h.player.pos.x,e.pos.z-h.player.pos.z)>=400));}assert.deepEqual(grants,branch==='a'?[30]:[]);assert.equal(pulses.length,branch==='a'?1:0);assert.equal(h.state.player.credits,branch==='a'?30:0);assert.ok(original.every(e=>h.state.entities.get(e.id)===e&&e.alive));h.assertBodies(original);assert.equal(h.proof().backend,'rapier-dynamic');assert.equal(contacts,0);
  console.log('ORCUS_NATIVE_BEARING',JSON.stringify({at:h.state.simTime,branch,seq:pulses[0]?.seq,radius:pulses[0]?.radius,scanner:pulses[0]?.scannerId,playerX:h.player.pos.x,runner:original[0].id,range:Math.hypot(original[0].pos.x-h.player.pos.x,original[0].pos.z-h.player.pos.z),contacts,credits:h.state.player.credits}));
 }finally{h.dispose();}
});

test('save projection keeps only completed bearing/discretion receipts, not transient action',()=>{
 for(const branch of ['a','b'])for(const complete of [false,true]){const h=boot();h.choose(branch);if(complete){if(branch==='a')h.pulse();else{h.player.pos={x:-900,z:0};h.tick(7);}}
 const projected=save._serializeEncounterDirector.call({state:h.state}),player=save._serializePlayer.call({state:h.state});assert.equal(player.credits,complete&&branch==='a'?30:0);assert.equal(Object.hasOwn(projected,'live'),false);assert.equal(JSON.stringify(projected).includes('await_bearing'),false);assert.equal(projected.receipts.filter(r=>r.shape===encounter.id&&r.outcome===branch).length,complete?1:0);
 const restored=boot();restored.state.encounterDirector=JSON.parse(JSON.stringify(projected));restored.d._onSaveLoaded();assert.deepEqual(restored.state.encounterDirector.live,{});assert.deepEqual(restored.state.encounterDirector.receipts,projected.receipts);empty(restored);
 }
});

test('settlement and neutral refusal ignore synchronous tick reentry',()=>{for(const branch of ['a','b','c']){const h=boot();const orig=h.d.say;h.d.say=function(...args){runtime.tick(h.d,h.live,h.state,h.state.simTime);return orig.apply(this,args);};h.bus.on('economy:grantCredits',()=>runtime.tick(h.d,h.live,h.state,h.state.simTime));h.bus.on('faction:repDelta',()=>runtime.tick(h.d,h.live,h.state,h.state.simTime));h.choose(branch);if(branch==='a')h.pulse();if(branch==='b'){h.player.pos={x:-900,z:0};h.tick(7);}assert.equal(h.live.outcome,branch);assert.equal(h.state.encounterDirector.stats.livedSeen[encounter.id],branch);}});


// Isolate this entry from competition by consuming other entries, not by bypassing the
// real scheduler. This proves admission gates, not the probability of a natural first visit.
// Row 459 retired ambient scenes from the unsolicited rotation — livedRotation marks only
// the thirty curated encounters — so the unsolicited tick never fires this scene; the
// authored-request seam remains its real admission path (the picker tests below still
// exercise the ambient lane directly with explicit candidates).
function schedulerBoot(){
 const sim=createSimulation({seed:916,systems:[economy,scanner,encounterDirector]});
 const {state}=sim,sector='sector_orcus_shadow';state.mode='flight';state.simTime=3600;
 state.world.currentSectorId=sector;state.world.activeSector={id:sector,pois:[]};
 const zone=zonesForSector(sector).find(z=>encounter.zoneTypes.includes(z.type));assert.ok(zone);
 const local=zone.center;assert.ok(local);const actualZone=zoneAt(sector,local.x,local.z);assert.ok(actualZone);
 const pos=sectorLocalToGlobalForSector(local,sector);
 const p=sim.spawn({type:'ship',team:0,pos,vel:{x:0,z:0},rot:0,radius:14,mass:16,hull:150,hullMax:150,data:{}});state.playerId=p.id;
 const stats=state.encounterDirector.stats;stats.livedSeen={};stats.livedStarted={};stats.ambientLastAt={};
 for(const e of Object.values(ENCOUNTERS))if(e.id!==encounter.id)stats.livedSeen[e.id]='fixture_consumed';
 const args={candidates:[encounter],sectorId:sector,zoneKey:actualZone.id||actualZone.type,day:6,now:3600};
 const seed=Array.from({length:100},(_,i)=>i+1).find(seed=>pickLivedVignette({...args,seed})===encounter);assert.ok(seed);state.meta.seed=seed;
 const r={state,registry:sim.registry};return {sim,state,r,stats,args,seed};
}
test('ambient scenes stay out of the unsolicited tick; the authored request still admits Archive',()=>{
 assert.equal(encounter.gates.externalOnly,true);
 assert.notEqual(encounter.livedRotation,true,'ambient scenes carry no rotation mark (row 459)');
 const h=schedulerBoot();tickLivedVignettes(h.r);assert.equal(h.state.encounterDirector.live['lived:'+encounter.id],undefined,'the unsolicited tick stays quiet');assert.equal(h.stats.fired,0);
 const fired=h.sim.registry.get('encounterDirector').requestAuthoredEncounter({shapeId:encounter.id,encounterId:'archive-admission',sectorId:'sector_orcus_shadow',anchor:{x:0,z:0},force:true,data:{sceneAxis:{ux:1,uz:0}}});
 assert.equal(fired.ok,true,JSON.stringify(fired));
 const l=h.state.encounterDirector.live['archive-admission'];assert.ok(l);assert.equal(l.shape,encounter);assert.equal(l.ids.length,2);
});
test('consumed seen/started stamps change nothing for an out-of-rotation scene',()=>{
 for(const key of ['livedSeen','livedStarted']){const h=schedulerBoot();h.stats[key][encounter.id]=0;tickLivedVignettes(h.r);assert.equal(Object.keys(h.state.encounterDirector.live).length,0);assert.equal(h.stats.fired,0);}
});
test('actual picker preserves Orcus sector and exact per-scene cooldown boundary',()=>{
 const h=schedulerBoot();assert.equal(pickLivedVignette({...h.args,seed:h.seed,sectorId:'sector_phoebe_echo'}),null);
 assert.equal(pickLivedVignette({...h.args,seed:h.seed,ambientLastAt:{[encounter.id]:2400.001}}),null);
 assert.equal(pickLivedVignette({...h.args,seed:h.seed,ambientLastAt:{[encounter.id]:2400}}),encounter);
});
test('the unsolicited tick stays closed for ambient scenes, pacing cleared or not',()=>{
 for(const gate of ['scan','gap','live','sector','clear']){const h=schedulerBoot();if(gate==='scan')h.r._livedScanAt=3601;if(gate==='gap')h.stats.livedNextAt=3601;if(gate==='live')h.state.encounterDirector.live.other={id:'other'};if(gate==='sector')h.state.world.currentSectorId='sector_phoebe_echo';if(gate==='clear'){h.r._livedScanAt=3600;h.stats.livedNextAt=3600;}tickLivedVignettes(h.r);assert.equal(h.state.encounterDirector.live['lived:'+encounter.id],undefined);assert.equal(h.stats.fired,0);}
});
