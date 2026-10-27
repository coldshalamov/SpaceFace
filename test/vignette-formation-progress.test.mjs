import test from 'node:test';
import assert from 'node:assert/strict';
import { compileVignette } from '../src/systems/vignetteInterpreter.js';
import { spec as convoy } from '../src/data/encounters/423-lived-refinery-approach-convoy-helix-k1.js';

// Position fixtures isolate observation semantics; native navigation is a separate proof.
function fixture(steps = null) {
  const spec = structuredClone(convoy);
  spec.start = 'offer';
  if (steps) spec.phases.find(p => p.id === 'await_a').steps = steps;
  const runtime = compileVignette(spec);
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 1000, z: 0 }, vel: { x: 0, z: 0 } };
  const lead = { id: 2, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const wing = { id: 3, alive: true, type: 'ship', pos: { x: 0, z: 200 }, vel: { x: 0, z: 0 } };
  const state = { entities: new Map([[1, player], [2, lead], [3, wing]]), playerId: 1, player: { credits: 100 } };
  const live = { ids: [2, 3], roles: { 2: 'hull_0', 3: 'hull_1' }, vars: {}, anchor: { x: 0, z: 0 } };
  let now = 0;
  const receipts = [], feedback = [];
  const d = {
    now: () => now, player: () => player, entsOf: () => [lead, wing],
    offerChoices() {}, say: (_live, channel, text) => feedback.push({ channel, text }),
    grant: (...args) => receipts.push(['grant', ...args]),
    charge: (...args) => receipts.push(['charge', ...args]),
    rep: (...args) => receipts.push(['rep', ...args]),
    resolve: (_, outcome) => { receipts.push(['resolve', outcome]); live.phase = 'done'; },
    abort: (_, reason) => { receipts.push(['abort', reason]); live.phase = 'done'; },
  };
  runtime.fire(d, live, state);
  const choose = (id = 'a') => runtime.choose(d, live, state, id);
  const tick = t => { now = t; runtime.tick(d, live, state, now); };
  const station = (t, x, z = 120) => { lead.pos.x = x; player.pos = { x, z }; tick(t); };
  const restart = () => runtime.fire(d, live, state);
  return { choose, tick, station, restart, receipts, feedback, player, lead, wing, live, state };
}
const formation = { kind: 'formation', of: 'hull_0', min: 60, max: 180, holdS: 8, leaderProgress: 100 };
function assertPaid(f) {
  assert.deepEqual(f.receipts.map(r => r.slice(0, 3)), [
    ['grant', 48, convoy.id], ['rep', 'faction_helix', 2], ['resolve', 'a'],
  ]);
}
test('late stationary join cannot cash travel made after acceptance while absent', () => {
  const f = fixture(); f.choose();
  for (let t = 0; t <= 10; t++) { f.lead.pos.x = 10 * t; f.tick(t); }
  f.player.pos = { x: 0, z: 120 };
  for (let t = 11; t <= 19; t++) f.tick(t);
  assert.deepEqual(f.receipts, []);
});
test('continuous station keeping needs both concurrent time and distance, pays once', () => {
  const f = fixture(); f.choose();
  f.station(0, 0); f.station(8, 99);
  assert.deepEqual(f.receipts, []);
  f.station(9, 100); assertPaid(f);
  f.choose(); f.tick(10); assertPaid(f);
  const fast = fixture(); fast.choose();
  fast.station(0, 0); fast.station(1, 100);
  assert.deepEqual(fast.receipts, []);
  fast.station(7.99, 100); assert.deepEqual(fast.receipts, []);
  fast.station(8, 100); assertPaid(fast);
});
test('range break clears spatial and temporal evidence, including either boundary', () => {
  for (const outside of [59, 181]) {
    const f = fixture(); f.choose();
    f.station(0, 0); f.station(7, 90); f.station(8, 100, outside);
    f.station(9, 100); f.station(17, 199);
    assert.deepEqual(f.receipts, []);
    f.station(18, 200); assertPaid(f);
  }
});
test('gap crossing stays first; travel before it is not formation progress', () => {
  const f = fixture([{ kind: 'gapCross', of: ['hull_0', 'hull_1'], within: 60 }, formation]);
  f.choose();
  f.lead.pos.x = f.wing.pos.x = 200;
  f.player.pos = { x: 190, z: 100 }; f.tick(1);
  assert.equal(f.live.vars.vAwait.stepIndex, 0);
  f.player.pos = { x: 210, z: 100 }; f.tick(2);
  assert.equal(f.live.vars.vAwait.stepIndex, 1);
  f.tick(10); assert.deepEqual(f.receipts, []);
  f.station(11, 300, 100); assertPaid(f);
});
test('a succeeding formation step starts a fresh interval', () => {
  const f = fixture([formation, formation]); f.choose();
  f.station(0, 0); f.station(8, 100);
  assert.equal(f.live.vars.vAwait.stepIndex, 1);
  f.station(16, 100); assert.deepEqual(f.receipts, []);
  f.station(17, 200); assertPaid(f);
});
test('missing and dead leaders abort rather than reward', () => {
  for (const missing of [false, true]) {
    const f = fixture(); f.choose(); f.station(0, 0);
    if (missing) f.state.entities.delete(2); else f.lead.alive = false;
    f.tick(9);
    assert.deepEqual(f.receipts, [['abort', 'physical_subject_gone']]);
  }
});
test('sponsor, decline, and physical timeout preserve their outcomes', () => {
  const sponsor = fixture(); sponsor.choose('b');
  sponsor.player.pos = { x: 0, z: 0 }; sponsor.tick(0); sponsor.tick(2);
  assert.deepEqual(sponsor.receipts.map(r => r.slice(0, 3)), [
    ['charge', 24, convoy.id + ':sponsor'], ['rep', 'faction_helix', 3], ['resolve', 'b'],
  ]);
  const decline = fixture(); decline.choose('c');
  decline.player.pos.x = 1200; decline.tick(1);
  assert.deepEqual(decline.receipts, [['resolve', 'c']]);
  const timeout = fixture(); timeout.choose(); timeout.tick(120);
  assert.deepEqual(timeout.receipts, [['abort', 'physical_timeout']]);
});

test('a range break resets the hold clock even when new travel is fast', () => {
  const f = fixture(); f.choose();
  f.station(0, 0); f.station(7, 90); f.station(8, 100, 181);
  f.station(9, 100); f.station(10, 200);
  assert.deepEqual(f.receipts, []);
  f.station(16.99, 200); assert.deepEqual(f.receipts, []);
  f.station(17, 200); assertPaid(f);
});
test('fresh await entry cannot inherit a prior interval', () => {
  const f = fixture(); f.choose(); f.station(0, 0); f.station(7, 90);
  f.restart(); f.choose(); f.station(8, 90);
  f.station(16, 189); assert.deepEqual(f.receipts, []);
  f.station(17, 190); assertPaid(f);
});

test('formation range boundaries are inclusive', () => {
  for (const range of [60, 180]) {
    const f = fixture(); f.choose();
    f.station(0, 0, range); f.station(8, 100, range); assertPaid(f);
  }
});
test('non-finite leader and player positions fail closed', () => {
  for (const actor of ['lead', 'player']) {
    for (const value of [NaN, Infinity]) {
      const f = fixture(); f.choose(); f.station(0, 0);
      f[actor].pos.x = value; f.tick(8);
      assert.deepEqual(f.receipts, [['abort', 'physical_subject_gone']]);
    }
  }
});


test('formation break explains a fresh hold once without repeating while absent', () => {
 const f=fixture();f.choose();f.tick(0);assert.deepEqual(f.feedback,[],'initial distant approach is quiet');
 f.station(1,0);f.station(4,40);f.station(5,60,181);
 assert.equal(f.feedback.length,1);assert.match(f.feedback[0].text,/Formation lost.*60-180 WU.*hold starts again/);
 f.station(6,80,181);assert.equal(f.feedback.length,1,'continued absence does not repeat');
 f.station(6.1,80);f.station(6.2,80,181);assert.equal(f.feedback.length,1,'rapid band jitter is rate limited');
 f.station(8.1,80);f.station(8.2,80,59);assert.equal(f.feedback.length,2);
 f.station(9,80);f.station(17,180);assertPaid(f);
});


// Configured Ceres start and selected real systems, not a player-flown sector arrival.
// After boot only ordinary player input and the public choice intent are written.
async function nativeConvoyRecovery(mode) {
 const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');
 const {encounterDirector}=await import('../src/systems/encounterDirector.js');
 const {economy}=await import('../src/systems/economy.js');
 const {factions}=await import('../src/systems/factions.js');
 const {save}=await import('../src/save/saveSystem.js');
 const {tickLivedVignettes}=await import('../src/systems/livedWorldDirector.js');
 const {zonesForSector,zoneAt}=await import('../src/data/sectorZones.js');
 const {sectorLocalToGlobalForSector}=await import('../src/data/sectorCoordinates.js');
 const sectorId='sector_ceres_belt',zone=zonesForSector(sectorId).find(z=>z.type==='refinery_approach');
 assert.ok(zone);assert.equal(zoneAt(sectorId,zone.center.x,zone.center.z).type,'refinery_approach');
 const start=sectorLocalToGlobalForSector(zone.center,sectorId);
 const h=await bootRealPath({seed:1,systems:['tacticalAI','flightV3','aiPorts','physics','collisionConsequences',economy,factions,encounterDirector,save],bounds:{center:start,radius:3500,hardRadius:4000},prepareState({state}){state.world.currentSectorId=sectorId;state.story.beatIndex=7;state.simTime=3600;},hulls:[{hullId:'ship_wasp',isPlayer:true,pos:start}]});
 try {
  const state=h.state,d=h.runtime.getSystem('encounterDirector'),lived={state,registry:{get:name=>h.runtime.getSystem(name)}};
  const rows=[];for(const name of ['encounter:voice','encounter:receipt','economy:grantCredits','faction:repDelta','physics:impact'])h.bus.on(name,p=>rows.push({name,p:{...p}}));
  tickLivedVignettes(lived);const live=Object.values(state.encounterDirector.live)[0];assert.ok(live,'ordinary lived picker admitted a scene');
  assert.equal(live.shapeId,convoy.id,'the unchanged seed1 Ceres pool selects the convoy');
  const consumed=state.encounterDirector.stats.livedStarted[convoy.id];assert.notEqual(consumed,undefined);
  const lead=d.entsOf(live,'hull_0')[0],wing=d.entsOf(live,'hull_1')[0];h.step(1);h.assertBodies([lead,wing,h.player]);
  const credits=state.player.credits,rep=state.factions.faction_helix?.rep??0;let chosen=false,broken=false,regained=false,stage='join',firstHold=null,finalHold=null,displacement=null,observedReset=false;
  for(let i=0;i<90*60&&live.phase!=='done';i++) {
   const player=state.entities.get(state.playerId),now=state.simTime,range=Math.hypot(player.pos.x-lead.pos.x,player.pos.z-lead.pos.z),v=live.vars.vAwait;
   if(!chosen&&live.vars.vPhase==='offer'&&range>80&&range<150){h.bus.emit('encounter:choose',{encounterId:live.id,choiceId:'a'});chosen=true;}
   if(chosen&&v?.holdSince!=null&&firstHold==null)firstHold=v.holdSince;
   if(chosen&&!broken&&v?.holdSince!=null&&now-v.holdSince>3)stage='break';
   // The old clock is not the break: wait until the director has actually observed the range loss
   // and cleared the interval, otherwise the first hold can be read again as the new one.
   if(stage==='break'&&range>205&&v?.formationStart==null&&v?.holdSince==null){observedReset=true;broken=true;stage='regain';}
   // Only interval state that began after that observed reset is recovery.
   if(observedReset&&!regained&&v?.formationStart&&v.holdSince!=null&&firstHold!=null&&v.holdSince>firstHold){regained=true;finalHold=v.holdSince;}
   if(regained&&v?.formationStart)displacement=Math.hypot(lead.pos.x-v.formationStart.x,lead.pos.z-v.formationStart.z);
   if(mode==='save'&&regained&&now-finalHold>=3){
    assert.ok(finalHold>firstHold,`the interrupted hold is a genuinely new interval (${finalHold} > ${firstHold})`);
    assert.ok(rows.some(r=>r.name==='encounter:voice'&&r.p.text?.startsWith('Formation lost.')),'the player was told the formation broke before it was interrupted');
    const before={credits:state.player.credits,rep:state.factions.faction_helix?.rep??0,consumed,holdSince:finalHold,formationOrigin:{...v.formationStart}};
    const storage=h.runtime.getSystem('save'),envelope=JSON.parse(JSON.stringify(storage.serialize('convoy-recovery-interruption')));
    assert.equal(envelope.data.encounterDirector.live,undefined);assert.equal(storage.loadEnvelope(envelope),true);writeRealPathInput(state,{});
    assert.equal(await h.runtime.getSystem('physics').prepareBackend(state),true);h.step(3);
    assert.equal(Object.keys(state.encounterDirector.live).length,0);assert.equal(state.encounterDirector.stats.livedStarted[convoy.id],consumed);
    assert.equal(state.player.credits,before.credits);assert.equal(state.factions.faction_helix?.rep??0,before.rep);
    assert.equal(rows.filter(r=>r.name==='encounter:receipt').length,0);assert.equal(rows.filter(r=>r.name==='economy:grantCredits').length,0);
    tickLivedVignettes(lived);assert.ok(!Object.values(state.encounterDirector.live).some(l=>l.shapeId===convoy.id));
    console.log('CONVOY_RECOVERY_NATIVE_SAVE',JSON.stringify({time:state.simTime,before,broken,regained,displacement,feedback:rows.filter(r=>r.name==='encounter:voice'&&r.p.text?.startsWith('Formation lost.')).map(r=>r.p.text)}));return;
   }
   const offset=stage==='break'?360:120,goal={x:lead.pos.x,z:lead.pos.z-offset};
   let vx=lead.vel.x+(goal.x-player.pos.x)*.55,vz=lead.vel.z+(goal.z-player.pos.z)*.55;
   const speed=Math.hypot(vx,vz);if(speed>130){vx*=130/speed;vz*=130/speed;}
   const ax=(vx-player.vel.x)*.04,az=(vz-player.vel.z)*.04,c=Math.cos(player.rot),sn=Math.sin(player.rot),heading=Math.atan2(lead.vel.z||0,lead.vel.x||1),turn=Math.atan2(Math.sin(heading-player.rot),Math.cos(heading-player.rot));
   writeRealPathInput(state,{moveZ:ax*c+az*sn,moveX:-ax*sn+az*c,turnIntent:turn*2});h.step(1);
  }
  assert.equal(live.outcome,'a',JSON.stringify({time:state.simTime,phase:live.vars.vPhase,chosen,broken,observedReset,regained,stage,await:live.vars.vAwait}));
  assert.equal(mode,'complete');assert.equal(broken,true);assert.equal(observedReset,true);assert.equal(regained,true);
  assert.ok(finalHold>firstHold,`recovery begins a new hold (${finalHold} > ${firstHold})`);
  assert.ok(state.simTime-finalHold>=8);assert.ok(displacement>=100);
  assert.equal(state.player.credits,credits+48);assert.equal(state.factions.faction_helix.rep,rep+2);
  assert.equal(rows.filter(r=>r.name==='encounter:receipt').length,1);assert.equal(rows.filter(r=>r.name==='economy:grantCredits').length,1);
  const feedback=rows.filter(r=>r.name==='encounter:voice'&&r.p.text?.startsWith('Formation lost.'));assert.ok(feedback.length>=1);
  console.log('CONVOY_RECOVERY_NATIVE_COMPLETE',JSON.stringify({time:state.simTime,firstHold,finalHold,displacement,credits:state.player.credits,rep:state.factions.faction_helix.rep,impacts:rows.filter(r=>r.name==='physics:impact').length,hull:state.entities.get(state.playerId).hull,feedback:feedback.map(r=>r.p.text)}));
 } finally {h.dispose();}
}
test('ordinary Ceres convoy permits a physical break/rejoin and abandons partial recovery on actual Continue',async()=>{
 for(const mode of ['complete','save'])await nativeConvoyRecovery(mode);
});
