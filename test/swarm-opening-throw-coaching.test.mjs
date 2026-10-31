// Focused production-owner composition, not a browser/native rope solve.
// Dependency ports below are explicit; cut emission and impact contact/scanning are real owners.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owners = process.env.SPACEFACE_COACHING_OWNER_ROOT || path.join(root, 'src/systems');
const read = file => fs.readFileSync(file, 'utf8');
const source = read(process.env.SPACEFACE_COACHING_SOURCE || path.join(root, 'src/systems/survivalAnnounce.js'));
const tetherSource = read(path.join(owners, 'tetherGameplay.js'));
const impactSource = read(path.join(owners, 'masslineImpacts.js'));
const speechSource = read(process.env.SPACEFACE_COACHING_OWNER_ROOT
  ? path.join(owners, 'verbSpeech.js') : path.join(root, 'src/onboarding/verbSpeech.js'));
function evaluate(text, expression, ports = {}) {
  text = text.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?/g, '')
    .replace(/export\s+default\s+\w+\s*;/g, '').replace(/export\s+/g, '');
  return vm.runInNewContext(text + '\n;' + expression, ports);
}
function method(text, name) {
  const start = text.indexOf(`\n  ${name}(`);
  assert.ok(start >= 0, `${name} production method exists`);
  const tail = text.slice(start + 1);
  const next = /\n  [A-Za-z_$][\w$]*\(/.exec(tail);
  assert.ok(next, `${name} following method exists`);
  const slice = tail.slice(0, next.index);
  return slice.slice(0, slice.lastIndexOf('\n  },') + 5) + '\n';
}
// Execute the existing device resolver, with the input/gamepad label ports isolated from DOM.
const bindingLabel = evaluate(speechSource, 'verbBindingLabel', {
  getPromptDevice: () => 'kbm', GAMEPAD_VERB_ALIASES: { tether: 'massline' },
  resolveActionLabel: (st, action) => (st.settings.controls.bindings[action] || []).map(k=>k.replace(/^Key/,'')).join('/'),
  resolveGamepadBindings: settings => settings.controls.gamepad.bindings,
  gamepadButtonLabels: (action, map) => map[action] || [],
});
const WASP = { id: 'wasp_swarmer', name: 'Wasp Swarmer',
  // Current src/data/enemies.js c452e7dec3617398b9f8cd389d68bfa09d3c492a.
  counterHint: 'Light enough to throw — catch one on the line and whip it into its packmates.' };
function harness({ teach = true, device = 'kbm', hints = true } = {}) {
  const player = { id: 1, alive: true, type: 'ship', team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 24, radius: 16 };
  const rock = { id: 2, alive: true, type: 'asteroid', pos: { x: 78, z: 16 }, vel: { x: 0, z: 0 },
    mass: 220, radius: 6, data: { openingLesson: true, swarmArenaDebris: true, tetherPayload: true } };
  const victim = { id: 3, alive: true, type: 'ship', team: 3, pos: { x: 83, z: 16 }, vel: { x: 0, z: 0 },
    radius: 12, data: { runCohort: 'survival', runWave: 1 } };
  const state = { mode: 'flight', simTime: 0, tick: 0, playerId: 1,
    run: { kind: 'survival', phase: 'wave_intro', ruleset: 'swarm', wave: 1, seed: 4242, arenaId: 'helios_core' },
    entities: new Map([[1, player], [2, rock], [3, victim]]), entityList: [player, rock, victim],
    player: { tether: { active: false } }, input: { promptDevice: device }, ui: { screenStack: [] },
    settings: { gameplay: { tutorialHints: hints }, controls: { bindings: { tether: ['Space', 'KeyF', '3'] },
      gamepad: { bindings: { massline: ['LB'] } } } } };
  const subscribers = new Map(), emitted = [];
  const bus = { on(name, fn) { const rows = subscribers.get(name) || []; rows.push(fn); subscribers.set(name, rows);
      return () => { const at=rows.indexOf(fn); if(at>=0)rows.splice(at,1); }; },
    emit(name, payload) { emitted.push({name,payload}); for (const fn of [...(subscribers.get(name)||[])]) fn(payload); } };
  const ann = evaluate(source, 'survivalAnnounce', { ENEMY_TYPES: [WASP], SURVIVAL_TEMPLATE_BLOCK: 30,
    SWARM_RULESET,
    physicalProblemFromPackages: () => ({question:'Generic physical question.'}), shippedQuestionFor: () => null,
    SWARM_CHAMPION_LEAD_WAVES: 3, swarmNextBossFor: () => null, SWARM_AFFIX_BY_ID: {},
    validateRunState: () => ({ ok: true }), SURVIVAL_ARENA_INTRO_TICKS: 60, SURVIVAL_WAVE_INTRO_TICKS: 60,
    playerBearingName: () => 'east', CRYO_ARENA_ID: 'cryo', GATE_BEARINGS: { east: {x:1,z:0} },
    verbBindingLabel: bindingLabel, isHostileToPlayer: e => e.team === 3,
    occupantGenerationOf: e => !e || e.occupantGeneration == null || e.occupantGeneration === '' ? null : e.occupantGeneration });
  ann.init({state,bus});
  const plan = { packages: [{ enemyId:'wasp_swarmer', role:'mass', count:1, gateGroup:'east', lesson:teach },
    {enemyId:'wasp_swarmer',role:'mass',count:3,gateGroup:'east'}],
    swarm:{wave:1,concurrent:10}, objective:{kind:'kill'}, ...(teach?{openingLesson:{holdTicks:2700}}:{}) };
  bus.emit('run:wavePlanned',{wave:1,plan});
  // runSession may replace the run object on transition; the lesson must survive that.
  state.run={...state.run,phase:'active'};bus.emit('run:waveStarted',{wave:1,tick:0});
  bus.emit('run:waveMaterialized',{wave:1,enemyId:'wasp_swarmer',admitted:1});
  const impacts = evaluate(impactSource, 'masslineImpacts', {
    massline2Flag: () => true, isHostileToPlayer: e => e.team === 3,
    queryNearbyEntities: (_state,_pos,_radius,_scratch, candidates) => candidates,
  });
  impacts.init({state,bus});
  const cutter = evaluate(`const host={${method(tetherSource,'_cutActive')}${method(tetherSource,'_cutPayload')}}`, 'host', {
    finite:(x,f=0)=>Number.isFinite(x)?x:f,positive:(x,f)=>Number.isFinite(x)&&x>0?x:f,
    rateRelease:()=>({rating:'messy'}),SLINGSHOT_SPEED_MULT:1.1,SLINGSHOT_STATE_S:1,CUT_DENIAL_COPY:{},humanizeReasonSlug:x=>x,
    RELATCH_COOLDOWN_S:.25,attachmentDef:()=>null,combatKernel:()=>null,TETHER_DEF_ID:'tether_standard',
  });
  Object.assign(cutter,{bus,_active:null,_emitWhipSnapIfStored(){},_grantSlingshotState(){},_resetPhaseMirror(){},
    _mirror(st){st.player.tether={active:false};}});
  const voices = () => emitted.filter(e=>e.name==='voice:say').map(e=>e.payload);
  const latch = (payload={sourceId:1,targetId:2}) => {
    state.player.tether={active:true,targetId:payload.targetId,attachmentId:'line-1'};
    bus.emit('tether:latched',payload);impacts.update(1/60,state);
  };
  const cut = ({ok=true}={}) => {
    cutter._active={targetId:2,attachmentId:'line-1'};
    const result=cutter._cutActive({cut:()=>ok?{ok:true}:{ok:false,reason:'refused'}},state,player,state.simTime);
    if(result)state.player.tether={active:false}; // production mirror follows _cutActive's events
    return result;
  };
  const hit = ({speed=60,contact=true}={}) => {
    rock.vel={x:speed,z:0};if(!contact)victim.pos={x:1000,z:1000};
    state.simTime+=1/60;state.tick++;impacts.update(1/60,state);
  };
  const finish = () => {
    bus.emit('run:openingLessonReleased',{wave:1,tick:state.tick});
    const arrival={id:4,alive:true,occupantGeneration:1,pos:{x:100,z:0},
      data:{runCohort:'survival',runWave:1,lootTableId:'wasp_swarmer'}};
    state.entities.set(4,arrival);
    bus.emit('run:waveMaterialized',{wave:1,enemyId:'wasp_swarmer',gateGroup:'east',admitted:3,
      openingPack:{lesson:plan.openingLesson,seed:state.run.seed,packageIndex:1,arrivals:[{entityId:4,generation:1}]}});
    bus.emit('run:waveCleared',{wave:1,killed:15,admitted:15});
  };
  return {state,player,rock,victim,bus,ann,impacts,cutter,voices,latch,cut,hit,finish,emitted,plan};
}

test('real cut producer and real sling/contact observer compose the five-line first lesson',()=>{
  const h=harness();assert.equal(h.voices().length,1,'real Wasp counter yields only to actionable lesson opener');
  const runBefore=JSON.stringify(h.state.run);
  h.latch();assert.equal(h.cut(),true);h.hit();assert.equal(JSON.stringify(h.state.run),runBefore,'feedback never advances the run');h.finish();
  assert.deepEqual(h.voices().map(x=>x.id),['survival:w1:open','survival:w1:throw-held','survival:w1:throw-hit','survival:w1:pack','survival:w1:clear']);
  assert.equal(h.state.player.masslineImpacts.latest.slung,true);
  assert.match(h.voices()[1].text,/Space\/F\/3 again/);
  assert.ok(h.voices().every(x=>!x.text.includes('RIGHT MOUSE')));
});
test('refusing the move preserves the ordinary pack and clear, no success',()=>{
  const h=harness();h.finish();assert.equal(h.voices().length,3);assert.ok(!h.voices().some(x=>x.id.includes('throw-hit')));
});
test('veteran/nonlesson plan keeps actual Wasp counter-hint and generic question',()=>{
  const h=harness({teach:false});assert.ok(h.voices().some(x=>x.text.includes('packmates')));
  h.latch();h.cut();h.hit();assert.ok(!h.voices().some(x=>x.id.includes('throw-')));
});
test('binding resolver uses live remap, pad alias, and no fabricated touch button',()=>{
  const h=harness();h.state.settings.controls.bindings.tether=['KeyJ'];h.latch();assert.match(h.voices().at(-1).text,/Tap J again/);
  const p=harness({device:'gamepad'});p.latch();assert.match(p.voices().at(-1).text,/Tap LB again/);
  const t=harness({device:'touch'});t.latch();t.cut();t.hit();assert.ok(!t.voices().some(x=>x.id.includes('throw-')));assert.ok(!t.voices()[0].text.includes('Space'));
});
test('hints-off does not acquire or speak this optional coaching',()=>{
  const h=harness({hints:false});h.latch();h.cut();h.hit();assert.ok(!h.voices().some(x=>x.id.includes('throw-')));
});
test('denied cut, release without cut, slow drop, and no-contact flight never claim hit',()=>{
  for(const mode of ['denied','bareRelease','slow','miss']){
    const h=harness();h.latch();
    if(mode==='denied')h.cut({ok:false});
    else if(mode==='bareRelease'){h.state.player.tether.active=false;h.bus.emit('tether:released',{targetId:2});}
    else h.cut();
    h.hit({speed:mode==='slow'?1:60,contact:mode!=='miss'});
    assert.ok(!h.voices().some(x=>x.id==='survival:w1:throw-hit'),mode);
  }
});
test('foreign latch, arbitrary contact payload, nonhostile scenery and stale body identity cannot earn hit',()=>{
  const foreign=harness();foreign.latch({sourceId:9,targetId:2});foreign.cut();foreign.hit();assert.ok(!foreign.voices().some(x=>x.id.includes('throw-')));
  const fake=harness();fake.latch();fake.cut();fake.bus.emit('tether:whipImpact',{targetId:2,victimId:3,slung:true});assert.ok(!fake.voices().some(x=>x.id==='survival:w1:throw-hit'));
  const scenery=harness();scenery.latch();scenery.cut();scenery.victim.data={};scenery.hit();assert.ok(!scenery.voices().some(x=>x.id==='survival:w1:throw-hit'));
  const friendly=harness();friendly.latch();friendly.cut();friendly.victim.team=1;friendly.hit();assert.ok(!friendly.voices().some(x=>x.id==='survival:w1:throw-hit'));
  const reused=harness();reused.latch();reused.cut();reused.state.entities.set(2,{...reused.rock});reused.hit();assert.ok(!reused.voices().some(x=>x.id==='survival:w1:throw-hit'));
});
test('missing lesson rock produces no-target silence, loss once, never fabricated success',()=>{
  const h=harness();h.state.entities.delete(2);h.latch();assert.equal(h.voices().length,1);
  const lost=harness();lost.latch();lost.rock.alive=false;lost.ann.update();lost.ann.update();
  assert.equal(lost.voices().filter(x=>x.id==='survival:w1:throw-lost').length,1);lost.hit();assert.ok(!lost.voices().some(x=>x.id==='survival:w1:throw-hit'));
});
test('destroyed-owner event diagnoses actual loss without relying on an extra per-frame owner',()=>{
  const h=harness();h.latch();h.rock.alive=false;h.bus.emit('entity:destroyed',{id:2});h.bus.emit('entity:destroyed',{id:2});
  assert.equal(h.voices().filter(x=>x.id==='survival:w1:throw-lost').length,1);
});
test('an already recorded old hit cannot be replayed as the new cut payoff',()=>{
  const h=harness();h.latch();
  const old={targetId:2,victimId:3,slung:true,time:0,tick:0};
  h.state.player.masslineImpacts.latest=old;h.state.player.masslineImpacts.impacts.push(old);
  h.cut();h.bus.emit('tether:whipImpact',old);assert.ok(!h.voices().some(x=>x.id==='survival:w1:throw-hit'));
  h.hit();assert.ok(h.voices().some(x=>x.id==='survival:w1:throw-hit'));
});
test('pause, armory, dead player, hold timeout, new run and new game reject stale coaching',()=>{
  for(const mode of ['pause','overlay','armory','dead','timeout','newRun','newGame']){
    const h=harness();h.latch();h.cut();
    if(mode==='pause')h.state.mode='paused';
    if(mode==='overlay')h.state.ui.screenStack=['pause'];
    if(mode==='armory'){h.state.run.phase='draft';h.bus.emit('run:transitioned',{phase:'draft'});}
    if(mode==='dead')h.player.alive=false;
    if(mode==='timeout')h.state.simTime=45;
    if(mode==='newRun')h.bus.emit('run:started',{});
    if(mode==='newGame')h.ann.newGame();
    h.hit();assert.ok(!h.voices().some(x=>x.id==='survival:w1:throw-hit'),mode);
  }
});
test('coaching yields budget before arrival/clear, denial does not mark hit spoken',()=>{
  const h=harness();h.latch();h.ann._alert('danger','danger','Threat inbound.',3);h.cut();h.hit();
  assert.equal(h.ann._openingThrow.stage,'released');h.finish();assert.equal(h.voices().length,4);
  assert.ok(h.voices().some(x=>x.id==='survival:w1:clear'));assert.equal(h.ann._linesThisWave,5);
});
test('duplicate receipts, reinitialization and repeated same-wave planning do not duplicate coaching',()=>{
  const h=harness();h.latch();h.latch();h.cut();h.hit();const receipt=h.state.player.masslineImpacts.latest;
  h.bus.emit('tether:whipImpact',receipt);h.bus.emit('run:wavePlanned',{wave:1,plan:h.plan});
  assert.equal(h.voices().filter(x=>x.id==='survival:w1:throw-held').length,1);assert.equal(h.voices().filter(x=>x.id==='survival:w1:throw-hit').length,1);
  h.ann.destroy();h.bus.emit('tether:whipImpact',receipt);assert.equal(h.voices().filter(x=>x.id==='survival:w1:throw-hit').length,1);
});
test('newer master stall-release voice remains wired and bounded',()=>{
  const h=harness({teach:false});h.bus.emit('swarm:stallReleased',{wave:1});h.bus.emit('swarm:stallReleased',{wave:1});
  assert.equal(h.voices().filter(x=>x.id==='survival:w1:stall').length,1);assert.ok(h.ann._linesThisWave<=5);
});
test('later waves and foreign rulesets never inherit the opening throw state',()=>{
  for(const change of [{wave:2},{ruleset:'scored'}]){
    const h=harness();Object.assign(h.state.run,change);h.latch();h.cut();h.hit();
    assert.ok(!h.voices().some(x=>x.id.includes('throw-')));
  }
});
test('in-place occupant recycling of the pilot or lesson rock cannot retain the throw',()=>{
  for(const whose of ['rock','player']){
    const h=harness();h.latch();h.cut();h[whose].occupantGeneration=2;h.hit();
    assert.ok(!h.voices().some(x=>x.id==='survival:w1:throw-hit'));
  }
});
