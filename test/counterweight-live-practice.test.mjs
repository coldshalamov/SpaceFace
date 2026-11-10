import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { economy } from '../src/systems/economy.js';
import { save } from '../src/save/saveSystem.js';
import { scanner } from '../src/systems/scanner.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { createCounterweightCircuitSystem } from '../src/features/counterweightCircuit/runtime.js';
import { venueAnchorGlobal, venueGlobalPos } from '../src/features/counterweightCircuit/physical.js';
import { COUNTERWEIGHT_EVENT_BY_ID, VENUE_SECTOR_ID } from '../src/features/counterweightCircuit/definition.js';
import { ghostPoseAt } from '../src/features/counterweightCircuit/ghost.js';
import { freshEventRecord, applyResultToRecord } from '../src/features/counterweightCircuit/scoring.js';

let previousFlags;
test.before(() => { previousFlags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES); });
test.after(() => restoreFeatureMaps(previousFlags));

const DT = 1 / 60;
const okay = (r) => assert.equal(r?.ok, true, r?.reason || JSON.stringify(r));

async function fixture({ seed = 8206, playerX = 40, withSave = false } = {}) {
  const circuit = createCounterweightCircuitSystem();
  const sim = createSimulation({
    seed,
    systems: [ships, economy, physics, combat, collisionConsequences, scanner, tetherGameplay, ...(withSave ? [save] : []), circuit],
  });
  const s = sim.state;
  s.mode = 'flight';
  s.world.currentSectorId = VENUE_SECTOR_ID;
  s.input.actions ||= {};
  s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  s.ui.docked = false;
  const anchor = venueAnchorGlobal();
  sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, player: s.player,
    pos: { x: anchor.x + playerX, z: anchor.z }, fittings: [],
  }));
  s.playerId = player.id;
  const owner = sim.registry.get('counterweightCircuit');
  const native = sim.registry.get('physics');
  const kernel = getCombatKernel(owner.ctx);
  const offers = [];
  sim.bus.on('counterweightCircuit:offer', (o) => offers.push(o));
  function tick(count = 1, control = null) {
    for (let i = 0; i < count; i++) {
      s.tick++; s.simTime = s.tick * DT;
      if (control) control();
      native.update(DT, s);
      sim.registry.get('combat').update(DT, s);
      sim.registry.get('collisionConsequences').update(DT, s);
      sim.registry.get('tetherGameplay').update(DT, s);
      owner.update(DT, s);
    }
  }
  await native.prepareBackend(s);
  native.update(DT, s);
  tick(3);
  const row = () => s.world.counterweightCircuit;
  const attach = (entity) => {
    const r = kernel.attachments.create({
      defId: 'tether_standard', ownerId: player.id, targetId: entity.id,
      sourceWorld: { ...player.pos }, targetWorld: { ...entity.pos },
    });
    okay(r);
    return r.attachment;
  };
  const near = (entity, dx = 30, dz = 0) => {
    player.pos.set(entity.pos.x + dx, 0, entity.pos.z + dz);
    player.vel.set(0, 0, 0);
    native.update(DT, s);
  };
  const acceptPresentation = () => {
    const attempt = owner._attempt(), admission = s.counterweightCircuitView.admission;
    tick(3);
    sim.bus.emit('counterweightCircuit:presentationReady', { attemptId: attempt.attemptId,
      generation: admission.generation, bodies: admission.bodies.map(({ id, generation }) => ({ id, generation })) });
    tick(1);
    assert.equal(attempt.admissionPending, false, 'fixture supplies a presentation receipt after native admission');
  };
  return { sim, s, owner, native, kernel, player, tick, row, attach, near, offers, anchor, acceptPresentation };
}


function choose(f, action, offer = f.s.counterweightCircuitOffer) {
  f.sim.bus.emit('counterweightCircuit:action', {action, offerId: offer?.id, generation: offer?.generation});
}
async function ready() {
  const f = await fixture();
  assert.equal(f.owner._startAttempt('soft_berth', false), true);
  f.acceptPresentation();
  f.tick(40);
  return f;
}
test('deliberate live conversion keeps native originals, line, hull and resources; no reversal', async () => {
  const f = await ready(), a = f.owner._attempt(), load = a.cohort.get('load');
  f.near(load); const line = f.attach(load); f.tick(2);
  const bodies = [...a.cohort.values()], hull = load.hull, credits = f.s.player.credits;
  const before = { ...load.pos }, time = a.fsm.armedAt;
  choose(f, 'practiceContinue');
  assert.match(f.s.counterweightCircuitOffer.detail, /Times, medals and course unlocks still count/);
  assert.equal(a.practice, false);
  choose(f, 'practiceBack'); assert.equal(a.practice, false);
  choose(f, 'practiceContinue');
  const confirm = f.s.counterweightCircuitOffer;
  let saved;
  f.sim.bus.on('counterweightCircuit:offer', () => {
    if (a.practice && !saved) { saved = f.owner.serialize(); choose(f, 'practiceConfirm', confirm); }
  });
  choose(f, 'practiceConfirm');
  assert.equal(a.practice, true); assert.equal(a.fsm.practice, true);
  assert.equal(saved.attempt.practice, true); assert.equal(saved.attempt.fsm.practice, true);
  assert.equal(f.owner._attempt(), a); assert.equal(a.fsm.armedAt, time);
  assert.deepEqual([...a.cohort.values()], bodies); assert.deepEqual({...load.pos}, before);
  assert.equal(load.hull, hull); assert.equal(f.s.player.credits, credits); assert.equal(line.state, 'active');
  assert.ok(f.native._sg02.records.has(load.id));
  queuePhysicsImpulse(load, {x: 30, y: 0, z: 0}, {source:'practice-conversion-test'});
  f.tick(10); assert.equal(f.owner._attempt(), a); assert.equal(line.state, 'active');
  assert.equal(f.s.counterweightCircuitOffer.choices.some(c=>c.id==='practiceContinue'), false);
  f.owner._cancelAttempt('cancelled'); assert.equal(f.s.world.counterweightCircuit.lastResult.practice, true);
  assert.equal(f.s.player.credits, credits);
});
test('consent expires and lifecycle events invalidate without converting', async () => {
  for (const event of ['mode:changed','sim:pause','dock:docked','save:restoring']) {
    const f = await ready(), a=f.owner._attempt(); choose(f,'practiceContinue'); const offer=f.s.counterweightCircuitOffer;
    f.sim.bus.emit(event, {}); choose(f,'practiceConfirm',offer); assert.equal(a.practice,false,event);
  }
  const f=await ready(), a=f.owner._attempt(); choose(f,'practiceContinue'); const offer=f.s.counterweightCircuitOffer;
  f.s.simTime+=31; choose(f,'practiceConfirm',offer); assert.equal(a.practice,false);
});
test('replaced original or pilot rejects consent; no bypass from direct action', async () => {
  for (const who of ['pilot','load','dead','away','docked']) {
    const f=await ready(), a=f.owner._attempt(); choose(f,'practiceConfirm'); assert.equal(a.practice,false);
    choose(f,'practiceContinue'); const e=who==='pilot'?f.player:a.cohort.get('load');
    if(who==='dead') e.alive=false;
    else if(who==='away') f.s.world.currentSectorId='elsewhere';
    else if(who==='docked') f.s.ui.docked=true;
    else e.occupantGeneration++;
    choose(f,'practiceConfirm'); assert.equal(a.practice,false);
  }
});
test('practice conversion persists existing interruption semantics and cannot request payout', async () => {
  const f=await ready(); choose(f,'practiceContinue'); choose(f,'practiceConfirm');
  const data=JSON.parse(JSON.stringify(f.owner.serialize()));
  const g=await fixture(); g.owner.deserialize(data); g.owner.afterContinue();
  assert.equal(g.s.world.counterweightCircuit.lastResult.practice,true);
  assert.equal(g.s.world.counterweightCircuit.lastResult.outcome,'failed');
  assert.equal(g.owner.payoutAuthorization('soft_berth',data.attempt.attemptId),null);
  const rec=freshEventRecord(), fsm={...data.attempt.fsm,phase:'complete',elapsedS:20,finishedAt:30};
  const scored=applyResultToRecord(rec,COUNTERWEIGHT_EVENT_BY_ID.soft_berth,fsm,1);
  assert.equal(scored.rewardRequested,undefined); assert.equal(rec.completions,1);
  assert.equal(scored.result.practice,true);
});
function drivePilot(body, goal, { speed = 7, accel = 5 } = {}) {
  const dx = goal.x - body.pos.x, dz = goal.z - body.pos.z, distance = Math.hypot(dx, dz);
  const desired = Math.min(speed, distance * 1.2, Math.sqrt(2 * accel * distance));
  const ax = (dx / Math.max(distance, .001) * desired - body.vel.x) * 2;
  const az = (dz / Math.max(distance, .001) * desired - body.vel.z) * 2;
  const scale = Math.min(1, accel / Math.max(.001, Math.hypot(ax, az)));
  writePhysicsControl(body, { source: 'counterweight-integrated-test',
    force: { x: ax * scale * body.mass, y: 0, z: az * scale * body.mass },
    torque: { x: 0, y: -body.angVel * (body.physicsBody?.inertiaY || body.mass) * 4, z: 0 }, maxSpeed: speed });
}


test('matched native pilot tow retains identical physical trajectory after forfeiture', async () => {
  async function run(convert) {
    const f=await fixture({playerX:235}), {s,owner,player,tick,row,attach,acceptPresentation}=f;
    row().settings.ghostEnabled=true; const before=s.player.credits;
    owner._startAttempt('soft_berth',false); acceptPresentation();
    const a=owner._attempt(), load=a.cohort.get('load'), cradle=a.cohort.get('cradle'), line=attach(load);
    const start={...load.pos};
    for(let i=0;i<600;i++) {
      tick(1,()=>drivePilot(player,{x:cradle.pos.x+6,z:cradle.pos.z}));
      if(i===120 && convert) { choose(f,'practiceContinue'); choose(f,'practiceConfirm'); }
    }
    assert.equal(a.practice,convert); assert.equal(line.state,'active');
    assert.ok(Math.hypot(load.pos.x-start.x,load.pos.z-start.z)>20);
    assert.equal(s.player.credits,before);
    const observed={player:{...player.pos},load:{...load.pos},vel:{...load.vel},hull:load.hull,leg:a.fsm.legIndex};
    owner._cancelAttempt('cancelled'); return observed;
  }
  assert.deepEqual(await run(true),await run(false));
});
test('converted completion reaches real result owner without a payout (injected receiver witness)', async () => {
 const f=await ready(), {owner,s,tick}=f, a=owner._attempt();
 const load=a.cohort.get('load'), cradle=a.cohort.get('cradle'); f.near(load,60); tick(2);
 choose(f,'practiceContinue'); choose(f,'practiceConfirm'); assert.equal(a.practice,true);
 const before=s.player.credits; a.fsm.legIndex=1; a.fsm.mem.dwellS['load:cradle']=1.2;
 const physical=owner._physical(), observe=physical.observe;
 physical.observe=(...args)=>{const obs=observe(...args);obs.receivers['load:cradle']={bodyId:load.id,bodyGeneration:load.occupantGeneration,
  receiverId:cradle.id,receiverGeneration:cradle.occupantGeneration,stable:true,relativeSpeed:1};return obs;};
 try{tick(1);}finally{physical.observe=observe;}
 assert.equal(owner._attempt(),null); assert.equal(s.world.counterweightCircuit.lastResult.outcome,'complete');
 assert.equal(s.world.counterweightCircuit.lastResult.practice,true);assert.equal(s.player.credits,before);
 assert.equal(s.world.counterweightCircuit.records.soft_berth.paid,false);
 assert.equal(s.world.counterweightCircuit.ghost.soft_berth,undefined);
});

import { createCounterweightCircuitPromptSystem } from '../src/features/counterweightCircuit/prompts.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
test('ordinary prompt adapter reaches bounded confirmation and Back without converting', async () => {
 const f=await ready(), prompt=createCounterweightCircuitPromptSystem(); let card;
 setPromptDeck({offerDecision(spec){card=spec;return true;},hasDecision(){return false;},resolveDecision(){}});
 try {
  prompt.init({bus:f.sim.bus}); f.sim.bus.emit('counterweightCircuit:offer',f.s.counterweightCircuitOffer);
  assert.ok(card.choices.length<=9); assert.equal(card.onChoose('practiceContinue'),true);
  assert.equal(card.choices.length,2); assert.equal(card.choices.find(c=>c.id==='practiceBack').cancel,true); assert.match(card.detail,/will not save a ghost/); const old=card;
  assert.equal(card.onChoose('practiceBack'),true); assert.equal(f.owner._attempt().practice,false);
  assert.equal(old.onChoose('practiceConfirm'),false);
  assert.equal(card.onChoose('practiceContinue'),true); assert.equal(card.onChoose('practiceConfirm'),true);
  assert.equal(f.owner._attempt().practice,true);
 } finally {prompt.destroy();setPromptDeck(null);}
});
