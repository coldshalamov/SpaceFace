// Executes the real announcer with explicit data/validation/binding ports.
// Real binding resolver, cut and impact composition remain in swarm-opening-throw-coaching.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(process.env.SPACEFACE_COACHING_SOURCE || new URL('../src/systems/survivalAnnounce.js', import.meta.url), 'utf8');
const code = source.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?/g, '')
  .replace(/export\s+default\s+\w+\s*;/g, '').replace(/export\s+/g, '');
function harness({hints=true, device='kbm', lesson=true, fire='Mouse 1', tether='J'}={}) {
  const player={id:1,alive:true,pos:{x:0,z:0}};
  const rock={id:2,alive:true,type:'asteroid',data:{openingLesson:true,swarmArenaDebris:true}};
  const state={mode:'flight',simTime:0,playerId:1,entities:new Map([[1,player],[2,rock]]),
    player:{tether:{active:false}},ui:{screenStack:[]},
    run:{kind:'survival',phase:'wave_intro',ruleset:'swarm',wave:1,seed:4242},
    settings:{gameplay:{tutorialHints:hints}},labels:{fire,tether},device};
  const listeners=new Map(), emitted=[];
  const bus={on(k,f){const a=listeners.get(k)||[];a.push(f);listeners.set(k,a);return ()=>{};},
    emit(k,p){emitted.push({k,p});for(const f of listeners.get(k)||[])f(p);}};
  const host=vm.runInNewContext(code+';({survivalAnnounce,waveOpeningLine})',{
    ENEMY_TYPES:[{id:'wasp_swarmer',name:'Wasp',counterHint:'An ordinary counter.'}],SURVIVAL_TEMPLATE_BLOCK:30,
    physicalProblemFromPackages:()=>null,shippedQuestionFor:()=>null,SWARM_CHAMPION_LEAD_WAVES:3,
    swarmNextBossFor:()=>null,SWARM_AFFIX_BY_ID:{},validateRunState:()=>({ok:true}),
    SURVIVAL_ARENA_INTRO_TICKS:60,SURVIVAL_WAVE_INTRO_TICKS:60,playerBearingName:()=> 'east',
    CRYO_ARENA_ID:'cryo',GATE_BEARINGS:{east:{x:1,z:0}},
    verbBindingLabel:(s,a)=>s.device==='touch'?'':s.labels[a]||'',
    isHostileToPlayer:()=>true,occupantGenerationOf:e=>e?.occupantGeneration??null});
  const plan={packages:[{enemyId:'wasp_swarmer',role:'mass',count:1,gateGroup:'east',lesson},
    {enemyId:'wasp_swarmer',role:'mass',count:3,gateGroup:'east'}],swarm:{},
    ...(lesson?{openingLesson:{holdTicks:2700}}:{})};
  host.survivalAnnounce.init({state,bus});
  bus.emit('run:wavePlanned',{wave:1,plan});state.run.phase='active';bus.emit('run:waveStarted',{wave:1});
  return {state,bus,plan,...host,voices:()=>emitted.filter(x=>x.k==='voice:say').map(x=>x.p)};
}
test('first opening offers fitted primary fire and rock with live labels, not a physics-only objective',()=>{
  const h=harness();const line=h.voices()[0].text;
  assert.match(line,/One hostile.*pack is holding/);
  assert.match(line,/Fire fitted primary guns with Mouse 1, or/);assert.match(line,/tap J to latch/);
  assert.doesNotMatch(line,/must|only|guaranteed|one.hit/i);
  assert.equal(h.voices().length,1);assert.equal(h.voices()[0].ttl,6);
});
test('held cue teaches contact without mandatory cut; live rebind reaches optional sling',()=>{
  const h=harness();h.state.labels.tether='K';const before=JSON.stringify(h.state.run);
  h.bus.emit('tether:latched',{sourceId:1,targetId:2});
  const line=h.voices().at(-1).text;assert.match(line,/swing the held rock into the hostile/);
  assert.match(line,/Tap K again if you want to sling it free/);
  assert.equal(JSON.stringify(h.state.run),before);
  h.bus.emit('tether:latched',{sourceId:1,targetId:2});assert.equal(h.voices().length,2);
});
test('held impact does not fabricate sling acknowledgement or advance the run',()=>{
  const h=harness();h.bus.emit('tether:latched',{sourceId:1,targetId:2});
  const before=JSON.stringify(h.state.run);h.bus.emit('tether:whipImpact',{targetId:2,slung:false,time:0});
  assert.equal(h.voices().length,2);assert.equal(JSON.stringify(h.state.run),before);
  h.bus.emit('run:openingLessonReleased',{wave:1});
  const arrival={id:3,alive:true,occupantGeneration:1,pos:{x:100,z:0},data:{runCohort:'survival',runWave:1,lootTableId:'wasp_swarmer'}};
  h.state.entities.set(3,arrival);
  h.bus.emit('run:waveMaterialized',{wave:1,enemyId:'wasp_swarmer',gateGroup:'east',admitted:3,
    openingPack:{lesson:h.plan.openingLesson,seed:h.state.run.seed,packageIndex:1,arrivals:[{entityId:3,generation:1}]}});
  h.bus.emit('run:waveCleared',{wave:1,killed:1});
  assert.deepEqual(h.voices().slice(-2).map(x=>x.id),['survival:w1:pack','survival:w1:clear']);
});
test('touch and missing bindings never invent a fire or tether button',()=>{
  for(const options of [{device:'touch'},{fire:'',tether:''}]) {
    const h=harness(options);assert.match(h.voices()[0].text,/Fire fitted primary guns\./);
    assert.doesNotMatch(h.voices()[0].text,/Mouse|tap|undefined|with \./);
  }
});
test('gamepad labels are the provided live resolver result, not hardcoded keyboard controls',()=>{
  const h=harness({device:'gamepad',fire:'RT',tether:'LB'});
  assert.match(h.voices()[0].text,/guns with RT/);assert.match(h.voices()[0].text,/tap LB/);
});
test('hints-off pure fallback offers both routes without prescribing release',()=>{
  const h=harness({hints:false});const line=h.voices()[0].text;
  assert.match(line,/fitted guns or swing debris/);assert.match(line,/releasing the line is optional/);
  h.bus.emit('tether:latched',{sourceId:1,targetId:2});assert.equal(h.voices().length,1);
});
test('ordinary nonlesson wave is not rewritten into the optional first encounter',()=>{
  const h=harness({lesson:false});assert.doesNotMatch(h.voices()[0].text,/fitted guns|small rock|One hostile/);
});
