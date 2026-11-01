// Executes production announcer and dispatch/release methods; materializer and runtime ports explicit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const base=new URL('../src/systems/',import.meta.url);
const read=n=>fs.readFileSync(process.env[n==='survivalAnnounce.js'?'SPACEFACE_ARRIVAL_ANNOUNCER':'SPACEFACE_ARRIVAL_WAVE'] || new URL(n,base),'utf8');
const clean=s=>s.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?/g,'').replace(/export\s+default\s+\w+\s*;/g,'').replace(/export\s+/g,'');
const compass=vm.runInNewContext(clean(fs.readFileSync(process.env.SPACEFACE_COMPASS_SOURCE || new URL('../src/core/playerCompass.js',import.meta.url),'utf8'))+';playerBearingName');
const gen=e=>e?.occupantGeneration??null;
function method(s,n){const start=s.indexOf(`\n  ${n}(`);assert.ok(start>=0);const tail=s.slice(start+1);const end=/\n  [A-Za-z_$][\w$]*\(/.exec(tail);return tail.slice(0,end.index).slice(0,tail.slice(0,end.index).lastIndexOf('\n  },')+5);}
function harness({hints=true,wave=1,lesson=true}={}){
 const player={id:1,alive:true,pos:{x:20,z:30},occupantGeneration:2};
 const state={mode:'flight',playerId:1,entities:new Map([[1,player]]),simTime:0,ui:{screenStack:[]},settings:{gameplay:{tutorialHints:hints}},run:{kind:'survival',phase:'wave_intro',ruleset:'swarm',wave,seed:4242}};
 const listeners=new Map(),events=[];const bus={on(k,f){const a=listeners.get(k)||[];a.push(f);listeners.set(k,a);return()=>{}},emit(k,p){events.push({k,p});for(const f of listeners.get(k)||[])f(p)}};
 const ann=vm.runInNewContext(clean(read('survivalAnnounce.js'))+';survivalAnnounce',{
 ENEMY_TYPES:[{id:'wasp_swarmer',name:'Wasp Swarmer',counterHint:'Light enough to throw.'}],SURVIVAL_TEMPLATE_BLOCK:30,physicalProblemFromPackages:()=>null,shippedQuestionFor:()=>null,SWARM_CHAMPION_LEAD_WAVES:3,swarmNextBossFor:()=>null,SWARM_AFFIX_BY_ID:{},validateRunState:()=>({ok:true}),SURVIVAL_ARENA_INTRO_TICKS:60,SURVIVAL_WAVE_INTRO_TICKS:60,playerBearingName:compass,CRYO_ARENA_ID:'cryo',GATE_BEARINGS:{east:{x:1,z:0}},verbBindingLabel:(_s,a)=>a==='fire'?'Mouse 1':'J',isHostileToPlayer:()=>true,occupantGenerationOf:gen});
 const packages=[{enemyId:'wasp_swarmer',count:1,role:'mass',gateGroup:'east',lesson:true},{enemyId:'wasp_swarmer',count:3,role:'mass',gateGroup:'east'}];
 const plan={packages,swarm:{killTarget:4},...(lesson?{openingLesson:{holdTicks:2700}}:{})};ann.init({state,bus});bus.emit('run:wavePlanned',{wave,plan});state.run.phase='active';bus.emit('run:waveStarted',{wave});
 let admitted=1,actor=2;const receipts=[];
 const waveSource=read('survivalWave.js');const owner=vm.runInNewContext('({'+method(waveSource,'_dispatchDue')+method(waveSource,'_maybeReleaseOpeningLesson')+'})',{
 liveSurvivalRun:s=>s.run,swarmLevel:()=>1,levelForWave:()=>1,waveOwnerId:w=>`survival-wave:${w}`,swarmPressureSuppressing:()=>false,SWARM_SPAWN_RETRY_TICKS:30,SWARM_BOSS_ENEMY_ID:'boss',OPENING_LESSON_RELEASE_TICKS:180,occupantGenerationOf:gen,
 materializeWaveBatch:(_ctx,req)=>{const ids=[];for(let i=0;i<admitted;i++){const e={id:actor++,alive:true,occupantGeneration:3,pos:{x:20,z:-100},data:{runCohort:'survival',runWave:wave,lootTableId:req.enemyId}};state.entities.set(e.id,e);ids.push(e.id)}return {requested:req.count,admitted:ids.length,rejected:req.count-ids.length,deferred:req.count-ids.length,spawnedIds:ids}},});
 Object.assign(owner,{state,ctx:{state},_plan:{...plan},_sourcePlan:plan,_swarm:plan.swarm,_wave:wave,_owners:[],_cursor:0,_cohort:new Map(),_bossIds:new Set(),_concurrent:10,_requestedTotal:0,_admittedTotal:0,_pending:[],_markCircuitMember(){},_publishThreat(){},_emit(k,p){receipts.push({k,p});bus.emit(k,p)},_actionableCohortCount:()=>0,_spaceOpeningArrivals(){},_durationTicks:6300});
 function dispatch({scout=false,at=2700,count=3,admit=1}={}){admitted=admit;owner._cursor=at;owner._pending=[{index:scout?0:1,entry:{...packages[scout?0:1],packageIndex:scout?0:1,atTick:at,count}}];owner._dispatchDue();return receipts.at(-1).p;}
 return {state,player,plan,ann,bus,owner,dispatch,receipts,events,setAdmission:n=>{admitted=n},pack:()=>events.filter(x=>x.k==='voice:say'&&x.p.id==='survival:w1:pack')};
}
test('early scout release is silent until real held admission; actual south overrides scheduled east',()=>{const h=harness();h.dispatch({scout:true,at:0,count:1});h.owner._cursor=110;h.owner._maybeReleaseOpeningLesson();assert.equal(h.pack().length,0);const before=JSON.stringify(h.state.run);const r=h.dispatch({at:290});assert.equal(r.openingPack.lesson,h.plan.openingLesson);assert.equal(h.pack().length,1);assert.match(h.pack()[0].p.text,/Wasp Swarmer from the south/);assert.match(h.pack()[0].p.text,/fitted guns or swing debris.*Break the pack/);assert.equal(h.pack()[0].p.ttl,6);assert.equal(JSON.stringify(h.state.run),before);h.dispatch({at:370});assert.equal(h.pack().length,1)});
test('timeout requires no release callback or announcer timer and still names actual admitted pack',()=>{const h=harness();h.owner._cursor=2700;h.owner._maybeReleaseOpeningLesson();assert.equal(h.pack().length,0);h.dispatch();assert.equal(h.pack().length,1)});
test('refusal is silent and retry keeps actual held membership',()=>{const h=harness();h.dispatch({admit:0});assert.equal(h.pack().length,0);assert.equal(h.owner._pending.length,1);h.setAdmission(1);h.owner._cursor=2730;h.owner._dispatchDue();assert.equal(h.pack().length,1);assert.equal(h.receipts.at(-1).p.openingPack.packageIndex,1)});
test('retried scout, ordinary/later waves and generic materialization do not get pack provenance',()=>{for(const options of [{},{wave:2},{lesson:false}]){const h=harness(options);const r=h.dispatch({scout:!options.wave&&!Object.hasOwn(options,'lesson'),at:2800});assert.equal(r.openingPack,undefined);assert.equal(h.pack().length,0)}const h=harness();h.bus.emit('run:waveMaterialized',{wave:1,enemyId:'wasp_swarmer',admitted:1});assert.equal(h.pack().length,0)});
test('hints-off still gets same encounter direction and choices',()=>{const h=harness({hints:false});h.dispatch();assert.equal(h.pack().length,1)});
test('stale run, lesson, package, actor or player receipts cannot claim arrival',()=>{for(const mutate of [
(h,r)=>r.wave=2,(h,r)=>r.openingPack.seed=8,(h,r)=>h.state.run.seed=8,(h,r)=>r.openingPack.lesson={},(h,r)=>r.openingPack.packageIndex=0,(h,r)=>r.enemyId='other',(h,r)=>r.gateGroup='west',(h,r)=>r.admitted=0,
(h,r)=>h.state.entities.get(r.openingPack.arrivals[0].entityId).data.lootTableId='other',(h,r)=>h.state.entities.delete(h.state.entities.get(r.openingPack.arrivals[0].entityId).id),(h,r)=>h.state.entities.get(r.openingPack.arrivals[0].entityId).occupantGeneration++,
(h,r)=>h.state.entities.set(h.state.entities.get(r.openingPack.arrivals[0].entityId).id,{...h.state.entities.get(r.openingPack.arrivals[0].entityId),occupantGeneration:4}),
(h,r)=>h.state.entities.set(1,{...h.player}),(h,r)=>h.player.occupantGeneration++,(h,r)=>h.player.alive=false,(h,r)=>h.state.run.phase='cleanup',
]){const h=harness();h.ann._linesThisWave=5;const r=h.dispatch();h.ann._linesThisWave=1;mutate(h,r);h.bus.emit('run:waveMaterialized',r);assert.equal(h.pack().length,0)}});
test('budget refusal does not mark spoken; successful retry coalesces within original five-line ceiling',()=>{const h=harness();h.ann._linesThisWave=5;const r=h.dispatch();assert.equal(h.ann._openingPack.spoken,false);h.ann._linesThisWave=4;h.bus.emit('run:waveMaterialized',r);assert.equal(h.pack().length,1);assert.equal(h.ann._linesThisWave,5);h.bus.emit('run:waveMaterialized',r);assert.equal(h.pack().length,1)});
test('new run resets watch and stale prior lesson receipt cannot announce after replanning',()=>{const h=harness();h.ann._linesThisWave=5;const r=h.dispatch();h.bus.emit('run:started',{});assert.equal(h.ann._openingPack,null);h.bus.emit('run:wavePlanned',{wave:1,plan:{...h.plan,openingLesson:{holdTicks:2700}}});h.bus.emit('run:waveMaterialized',r);assert.equal(h.pack().length,0);h.ann.newGame();assert.equal(h.ann._openingPack,null)});

test('real voice queue surfaces one coherent arrival when refused scout left a counter untaught',()=>{
 const voiceSource=fs.readFileSync(process.env.SPACEFACE_VOICE_SOURCE || new URL('../src/ui/voiceArbiter.js',import.meta.url),'utf8');
 // This probe executes the real queue, not the unrelated Maera narrative observer.
 // Current arbiter declares narrative lookup maps at module scope, so provide its explicit data port.
 const VoiceQueue=vm.runInNewContext(clean(voiceSource)+';VoiceQueue',{MAERA_FLIGHT_LINES:[]});
 for(const hints of [true,false]){
  const h=harness({hints});h.dispatch({scout:true,at:0,count:1,admit:0});
  const before=h.events.length;h.dispatch();
  const lines=h.events.slice(before).filter(x=>x.k==='voice:say').map(x=>x.p);
  assert.equal(lines.length,1);assert.equal(lines[0].channel,'objective');
  assert.match(lines[0].text,hints?/from the south.*fitted guns or swing debris.*Break the pack/:/from the south.*Light enough to throw.*Break the pack/);
  assert.equal(h.ann._hintsThisWave,hints?0:1);
  const q=new VoiceQueue();for(const line of lines)q.enqueue(line,0);
  assert.equal(q.step(0).id,'survival:w1:pack');assert.equal(q.step(5999),null);
  h.dispatch({at:2780});assert.equal(h.events.filter(x=>x.k==='voice:say'&&x.p.id==='survival:hint:wasp_swarmer').length,0);
 }
});

test('fortify rerouting preserves planned provenance while speaking actual admitted position',()=>{
 const h=harness();h.ann._linesThisWave=5;const r=h.dispatch();
 h.ann._linesThisWave=1;r.sourceGateGroup='east';r.gateGroup='north';r.ingressPose={x:20,z:-100};
 h.bus.emit('run:waveMaterialized',r);
 assert.equal(h.pack().length,1);assert.match(h.pack()[0].p.text,/from the south/);
});

test('whole-sim owners share the authoritative realm and admission/voice payloads survive the real bridge',async()=>{
 const {getAuthoritativeInitOrder}=await import('../src/runtime/authoritativeSystemManifest.js');
 const {projectBridgeEvent}=await import('../scripts/lib/simEventBridge.mjs');
 const ids=getAuthoritativeInitOrder('production',{nodeSafeOnly:true,includeCore:true});
 for(const id of ['survivalWave','survivalAnnounce'])assert.ok(ids.includes(id),`${id} remains inside authoritative worker`);
 const h=harness();const receipt=h.dispatch();assert.equal(h.pack().length,1);
 // VM fixtures are cross-realm objects; normalize to the worker's own ordinary object realm first.
 const p=structuredClone(receipt);const projected=projectBridgeEvent('run:waveMaterialized',p);
 assert.equal(projected.dropped,false);assert.equal(projected.unintentional,false);
 const wire=structuredClone(projected.flat);assert.deepEqual(wire.openingPack,p.openingPack);
 assert.equal(wire.openingPack.arrivals[0].generation,3);
 const voice=projectBridgeEvent('voice:say',structuredClone(h.pack()[0].p));
 assert.equal(voice.dropped,false);assert.deepEqual(structuredClone(voice.flat),structuredClone(h.pack()[0].p));
});
