import test from 'node:test';
import assert from 'node:assert/strict';
import scene, { runtime } from '../src/data/encounters/922-scene-sweep-window.js';
import { SWEEP_WINDOW_LANE as L, SWEEP_WINDOW_ID, sweepWindowGapOpen } from '../src/systems/sweepWindowRuntime.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
function fixture() {
 FIELD_FLAGS.enabled=true;
 const entities=new Map(), effects=[]; let now=0,nextId=1,registered=true;
 const player={id:0,alive:true,pos:{x:L.start.x+100,z:L.start.z},vel:{x:0,z:0}};entities.set(0,player);
 const state={mode:'flight',timeScale:1,simTime:0,playerId:0,player,entities,encounterDirector:{stats:{}},world:{currentSectorId:'sector_eris_margin'}};
 const live={id:'test',shapeId:SWEEP_WINDOW_ID,anchor:{...L.start},ids:[],roles:{},vars:{},plan:{}};
 const d={
 registry:{get:n=>n==='fields'?{hasExternal:()=>registered}:null}, now:()=>now,player:()=>player,entsOf:l=>l.ids.map(id=>entities.get(id)),
 spawnShips(l,rows){return rows.map(row=>{const e={...row,id:nextId++,type:'ship',alive:true,pos:{...row.pos},vel:{x:0,z:0},data:{}};entities.set(e.id,e);l.ids.push(e.id);l.roles[e.id]=row.role;return e.id;});},
 spawnProp(l,row){const e={...row,id:nextId++,alive:true,data:{}};entities.set(e.id,e);return e;},
 say(l,c,text){effects.push(['say',text]);},offerChoices(l,ids){effects.push(['offer',ids]);},
 grant(n){effects.push(['grant',n]);},rep(f,n){effects.push(['rep',f,n]);},
 resolve(l,o){effects.push(['resolve',o]);l.phase='done';},abort(l,r){effects.push(['abort',r]);l.phase='done';}
 };
 // Match the producer's single-consumption contract; native qualification uses
 // the actual director _onChoose rather than this narrow fixture.
 const f={state,live,d,player,effects,entities,tick(t){now=t;state.simTime=t;runtime.tick(d,live,state,t);},choose(c){if(live.offerConsumed)return;live.offerConsumed=true;runtime.choose(d,live,state,c);},
 field(v){registered=v;},runner(){return entities.get(live.ids.find(id=>live.roles[id]==='runner'));},paid(){return effects.filter(e=>e[0]==='grant');},
 begin(){runtime.fire(d,live,state);f.tick(6);f.choose('a');f.tick(6);},
 count(){f.begin();f.tick(14);},
 release(){f.count();for(let t=14;t<22;t+=.05)if(sweepWindowGapOpen(t)){f.tick(t);f.choose('a');return t;}throw Error('no canonical gap');}
 };return f;
}
test('choice alone cannot pay for stationary runner',()=>{const f=fixture();f.begin();assert.equal(f.paid().length,0);assert.notEqual(f.live.phase,'done');});
test('canonical full sweep and actual original arrival pay once',()=>{
 const f=fixture(),t=f.release(),r=f.runner(),before={...r.pos};f.tick(t+1);
 assert.deepEqual(r.pos,before);assert.deepEqual(r.vel,{x:0,z:0});assert.equal(r.data.ai.activity.kind,'transit');assert.equal(f.paid().length,0);
 r.pos={...L.end};f.player.pos={x:L.end.x+100,z:L.end.z};f.tick(t+3);f.tick(t+4);f.choose('a');
 assert.deepEqual(f.paid(),[['grant',30]]);assert.deepEqual(f.effects.filter(e=>e[0]==='rep'),[['rep','faction_quiet',2]]);
 assert.equal(JSON.parse(JSON.stringify(f.state.encounterDirector.stats)).livedSeen[SWEEP_WINDOW_ID],'a');
    assert.ok(scene.receipts.a.includes('far marker'));
    assert.equal(scene.receipts.a.includes('empty lane'),false);
});
test('a parked lookout cannot earn an escorted crossing; catch-up resumes the original without extending time',()=>{
 const f=fixture(),t=f.release(),runner=f.runner(),deadline=f.live.vars.sweepWindow.deadline;
 runner.pos={...L.end};const before={pos:{...runner.pos},vel:{...runner.vel}};
 f.tick(t+1);assert.equal(f.paid().length,0);assert.ok(f.live.vars.sweepWindow.holdAnchor);
 assert.equal(runner.data.ai.activity.kind,'loiter');assert.deepEqual(runner.pos,before.pos);assert.deepEqual(runner.vel,before.vel);
 f.tick(t+9);assert.equal(f.paid().length,0);assert.equal(f.live.vars.sweepWindow.deadline,deadline);
 assert.equal(f.effects.filter(e=>e[0]==='say'&&e[1].includes('Runner holding')).length,1);
 f.player.pos={x:runner.pos.x+100,z:runner.pos.z};f.tick(t+10);
 assert.equal(f.paid().length,1);assert.equal(f.entities.get(runner.id),runner);
 assert.equal(f.effects.filter(e=>e[0]==='say'&&e[1].includes('Count reacquired')).length,1);
});
test('waiting preserves the real deadline and abandonment still refuses reward',()=>{
 for(const cause of ['timeout','abandon']){
  const f=fixture(),t=f.release();f.runner().pos={...L.end};f.tick(t+1);assert.ok(f.live.vars.sweepWindow.holdAnchor);
  if(cause==='timeout')f.tick(121);else {f.player.pos.x+=700;f.tick(t+2);}
  assert.equal(f.paid().length,0);assert.ok(f.effects.some(e=>e[0]==='abort'));
 }
});
test('observation resets when pilot leaves ring',()=>{
 const f=fixture();f.begin();f.tick(12);f.player.pos.x+=300;f.tick(13);f.player.pos.x-=300;f.tick(14);f.tick(21);
 assert.equal(f.live.phase,'sweep_observe');f.tick(22);assert.equal(f.live.phase,'sweep_gap');
});
test('unsafe release cannot pay or move the runner',()=>{
 const f=fixture();f.count();let t=14;while(sweepWindowGapOpen(t))t+=.05;f.tick(t);f.choose('a');assert.equal(f.live.phase,'sweep_gap');assert.equal(f.paid().length,0);
});
for(const kind of ['death','reuse','missing','leave','field'])test(kind+' cannot earn crossing',()=>{
 const f=fixture(),t=f.release(),r=f.runner();
 if(kind==='death')r.alive=false;if(kind==='reuse')f.entities.set(r.id,{...r,pos:{...L.end}});if(kind==='missing')f.entities.delete(r.id);
 if(kind==='leave')f.player.pos.x+=2000;if(kind==='field')f.field(false);
 f.tick(t+1);assert.equal(f.paid().length,0);assert.ok(f.effects.some(e=>e[0]==='abort'));
});
test('elapsed time cannot substitute for travel; timeout pays nothing',()=>{const f=fixture(),t=f.release();f.tick(t+20);assert.equal(f.paid().length,0);f.tick(121);assert.deepEqual(f.effects.filter(e=>e[0]==='abort').at(-1),['abort','sweep_timeout']);});
test('disabled or absent field cannot admit work',()=>{
 for(const disabled of [true,false]){const f=fixture();if(disabled)FIELD_FLAGS.enabled=false;else f.field(false);runtime.fire(f.d,f.live,f.state);assert.equal(f.entities.size,1);assert.equal(f.paid().length,0);}FIELD_FLAGS.enabled=true;
});
test('pause does not consume a call',()=>{const f=fixture();f.begin();f.state.timeScale=0;f.tick(14);f.choose('a');assert.equal(f.live.phase,'sweep_observe');assert.equal(f.paid().length,0);});
test('tip and decline keep authored outcomes, no rescue payment',()=>{
 for(const c of ['b','c']){const f=fixture();runtime.fire(f.d,f.live,f.state);f.tick(6);f.choose(c);assert.deepEqual(f.effects.filter(e=>e[0]==='resolve'),[['resolve',c]]);assert.equal(f.paid().length,0);}
});
test('duplicate choices during counting cannot bypass full sweep',()=>{const f=fixture();f.begin();f.choose('a');f.choose('b');f.choose('c');f.tick(13.99);assert.equal(f.live.phase,'sweep_observe');assert.equal(f.paid().length,0);});
test('dragging runner away cannot count an unrelated crossing',()=>{
 const f=fixture();f.begin();f.runner().pos.x+=100;f.tick(14);f.tick(22);
 assert.equal(f.live.phase,'sweep_observe');assert.equal(f.paid().length,0);
});
test('call must remain beside a runner at the actual near marker',()=>{
 const f=fixture();f.count();f.runner().pos.x+=100;
 for(let t=14;t<22;t+=.05)if(sweepWindowGapOpen(t)){f.tick(t);f.choose('a');break;}
 assert.equal(f.live.phase,'sweep_gap');assert.equal(f.paid().length,0);
});
test('opening hold pins actor navigation to scene markers, not player position',()=>{
 const f=fixture();runtime.fire(f.d,f.live,f.state);f.player.pos.x+=200;f.tick(2);
 assert.deepEqual(f.runner().data.ai.activity.anchor,L.start);
 const c=f.entities.get(f.live.ids.find(id=>f.live.roles[id]==='ship_1'));
 assert.deepEqual(c.data.ai.activity.anchor,c.pos);
});
test('a fresh timing offer and unsafe-call retry survive producer offer consumption',()=>{
 const f=fixture();f.count();assert.equal(f.live.offerConsumed,false);
 let t=14;while(sweepWindowGapOpen(t))t+=.05;f.tick(t);f.choose('a');
 assert.equal(f.live.offerConsumed,false);assert.equal(f.live.phase,'sweep_gap');
 for(;t<30;t+=.05)if(sweepWindowGapOpen(t)){f.tick(t);f.choose('a');break;}
 assert.equal(f.live.phase,'sweep_cross');assert.equal(f.paid().length,0);
});

test('paused fresh gap preserves its unconsumed offer and original deadline',()=>{
 const f=fixture();f.count();const deadline=f.live.vars.sweepWindow.deadline;
 f.state.timeScale=0;f.choose('a');assert.equal(f.live.offerConsumed,false);
 assert.equal(f.live.vars.sweepWindow.deadline,deadline);assert.equal(f.paid().length,0);
 f.state.timeScale=1;for(let t=14;t<22;t+=.05)if(sweepWindowGapOpen(t)){f.tick(t);f.choose('a');break;}
 assert.equal(f.live.phase,'sweep_cross');assert.equal(f.live.vars.sweepWindow.deadline,deadline);assert.equal(f.paid().length,0);
});
test('declining after counting files the declined outcome without payout',()=>{
 const f=fixture();f.count();f.choose('c');assert.equal(f.state.encounterDirector.stats.livedSeen[SWEEP_WINDOW_ID],'c');
 assert.deepEqual(f.effects.filter(e=>e[0]==='resolve'),[['resolve','c']]);assert.equal(f.paid().length,0);
});

// Controlled nearby arrival with actual scheduler, producer, actor factory, navigation
// and Rapier. Not a whole-sector/static-landmark or no-beam-contact assertion.
async function nativeVisit(outcome) {
 const [{bootRealPath,writeRealPathInput},{default:npcJobsRuntime},{fields},{default:environmentalMachinery},{encounterDirector}]=await Promise.all([
 import('../scripts/lib/bench/realPath.mjs'),import('../src/systems/npcJobsRuntime.js'),import('../src/systems/fields.js'),
 import('../src/systems/environmentalMachinery.js'),import('../src/systems/encounterDirector.js')]);
FIELD_FLAGS.enabled=true;
const host=await bootRealPath({seed:113,systems:[environmentalMachinery,fields,'tacticalAI','flightV3','aiPorts',encounterDirector,npcJobsRuntime,'physics'],
 bounds:{center:L.start,radius:4000,hardRadius:4500},
 hulls:[{hullId:'ship_wasp',isPlayer:true,fittings:fittingsFromDefaultModules('ship_wasp',NEW_GAME_STARTERS.find(row=>row.shipId==='ship_wasp').fittedModules),pos:{x:L.start.x+100,z:L.start.z}}],
 prepareState({state}){state.world.currentSectorId='sector_eris_margin';state.story={flags:{}};state.ui.screenStack=[];}
});
try {
 const d=host.runtime.getSystem('encounterDirector');host.step(6*60+2);
 const admitted=Object.values(host.state.encounterDirector.live).find(l=>l.shapeId===SWEEP_WINDOW_ID);
 assert.ok(admitted,'ordinary lived director must admit nearby scene');
 const encounterId=admitted.id;
 let pausedChecked=false; const effects=[];
 const originalEmit=d.emit; d.emit=function(name,payload){effects.push({name,payload});return originalEmit.call(this,name,payload);};
 let releaseAt=null,arrived=null,maxDistance=0,runner=null,lastPhase=null,holdAt=null,waitingTicks=0,hazardTicks=0;
 const playerStart={...host.player.pos};
 const phases=[];const start=host.state.simTime;
 for(let i=0;i<120*60;i++){
  const live=host.state.encounterDirector.live[encounterId];
  if(live){
   if(!runner)runner=host.state.entities.get(live.ids.find(id=>live.roles[id]==='runner'));
   if(live.phase!==lastPhase){phases.push({t:host.state.simTime,phase:live.phase,pos:runner?{...runner.pos}:null});lastPhase=live.phase;}
   if(live.phase==='offer')host.withFeatures(()=>d._onChoose({encounterId:live.id,choiceId:'a'}));
   if(live.phase==='sweep_gap'&&outcome==='c'){host.withFeatures(()=>d._onChoose({encounterId:live.id,choiceId:'c'}));continue;}
   if(live.phase==='sweep_gap'&&!pausedChecked){
    const deadline=live.vars.sweepWindow.deadline;const beforeOffers=effects.filter(e=>e.name==='encounter:choiceOffered').length;host.state.timeScale=0;
    host.withFeatures(()=>d._onChoose({encounterId:live.id,choiceId:'a'}));
    assert.equal(live.offerConsumed,false);assert.equal(live.vars.sweepWindow.deadline,deadline);
    const restoredOffers=effects.filter(e=>e.name==='encounter:choiceOffered');
    assert.equal(restoredOffers.length,beforeOffers+1);
    assert.equal(restoredOffers.at(-1).payload.deadlineAt,deadline);
    assert.deepEqual(restoredOffers.at(-1).payload.options.map(o=>o.id),['a','c']);
    assert.equal(effects.filter(e=>e.name==='economy:grantCredits').length,0);
    host.state.timeScale=1;pausedChecked=true;
   }
   if(live.phase==='sweep_gap'&&sweepWindowGapOpen(host.state.simTime)){host.withFeatures(()=>d._onChoose({encounterId:live.id,choiceId:'a'}));if(live.phase==='sweep_cross')releaseAt=host.state.simTime;}
  }else if(runner){arrived=host.state.encounterDirector.stats.livedSeen?.[SWEEP_WINDOW_ID]??null;break;}
  // The actor now actually accompanies the crossing through the public input packet.
  // No pose/velocity writes or second navigation/physics owner are used.
  const work=live?.vars?.sweepWindow;
  if(work?.holdAnchor){
   if(holdAt==null)holdAt=host.state.simTime;waitingTicks++;
   if(host.state.fields?.telemetry?.affected>0)hazardTicks++;
  }
  if(runner&&lastPhase==='sweep_cross'&&outcome==='a'&&holdAt!=null&&host.state.simTime-holdAt>=8){
   const p=host.player,dx=runner.pos.x+80-p.pos.x,dz=runner.pos.z-p.pos.z,range=Math.hypot(dx,dz);
   const error=Math.atan2(Math.sin(Math.atan2(dz,dx)-p.rot),Math.cos(Math.atan2(dz,dx)-p.rot));
   // S is the deliberate brake. Turn the actual hull, then use forward thrust.
   writeRealPathInput(host.state,{moveZ:range>45&&Math.abs(error)<0.6?1:0,turnIntent:error*2-(p.angVel||0)*0.5,brake:range<45&&Math.hypot(p.vel.x,p.vel.z)>12});
  }
  host.step(1);
  if(runner)maxDistance=Math.max(maxDistance,Math.hypot(runner.pos.x-L.start.x,runner.pos.z-L.start.z));
 }
 host.assertBodies([runner]);
 console.log(JSON.stringify({start,releaseAt,elapsed:host.state.simTime-start,arrived,maxDistance,playerStart,playerEnd:{...host.player.pos},holdAt,waitingTicks,hazardTicks,runner:{id:runner.id,pos:runner.pos,vel:runner.vel,alive:runner.alive},phases,effects:effects.filter(e=>/grantCredits|repDelta/.test(e.name)),receipts:host.state.encounterDirector.receipts,proof:host.proof()}));
 const receipts=host.state.encounterDirector.receipts.filter(r=>r.shape===SWEEP_WINDOW_ID);
 assert.equal(receipts.length,1);assert.equal(receipts[0].outcome,outcome);
 assert.equal(host.state.entities.get(runner.id),runner);assert.equal(runner.alive,true);
 if(outcome==='c'){assert.equal(arrived,'c');assert.equal(effects.filter(e=>/grantCredits|repDelta/.test(e.name)).length,0);return;}
 assert.equal(pausedChecked,true);
 assert.ok(holdAt!=null&&waitingTicks>=8*60,'a parked pilot must physically wait and reacquire');
 assert.deepEqual(effects.filter(e=>e.name==='economy:grantCredits').map(e=>e.payload.amount),[30]);
 assert.deepEqual(effects.filter(e=>e.name==='faction:repDelta').map(e=>[e.payload.factionId,e.payload.delta]),[['faction_quiet',2]]);
 assert.equal(arrived,'a','original ordinary runner must actually arrive before deadline');
 assert.ok(receipts[0].text.includes('far marker'));
 host.withFeatures(()=>d._onChoose({encounterId,choiceId:'a'}));host.step(2);
 assert.equal(effects.filter(e=>e.name==='economy:grantCredits').length,1);
}finally{host.dispose();}


}
test('native ordinary Eris admission and paused-gap resume reach actual far marker once',async()=>nativeVisit('a'));
test('native producer decline after counting records c without reward',async()=>nativeVisit('c'));
