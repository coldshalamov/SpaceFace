import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { redKite, redKitePresentation } from '../src/systems/redKite.js';
import { RED_KITE as C, RED_KITE_START, RED_KITE_GATES, normalizeRedKiteMemory } from '../src/data/redKite.js';
import { redKiteGateFrame, redKiteGateCrossing } from '../src/characters/redKiteRules.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { physics } from '../src/core/physics.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { resolveFlightProfile } from '../src/core/flightDynamics.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { save } from '../src/save/saveSystem.js';
import { redKitePrompt } from '../src/ui/redKitePrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { world } from '../src/systems/world.js';
import { resetFreshRunSystems } from '../src/core/runReset.js';

function fixture({ native = false, payment = false } = {}) {
  const systems = [world, ...(native ? [physics, aiPorts] : []), spawnBudget, redKite, ...(payment ? [economy, missions] : [])];
  const sim = createSimulation({ seed: 5, systems, helpers: native ? {} : {
    combatPhysics: { createAttachment: row => ({ id: row.attachmentId }), cutAttachment: () => true },
  } });
  const s = sim.state; s.mode = 'flight'; s.world.currentSectorId = C.sectorId;
  if (!native) s.settings.gameplay.physicsBackend = 'legacy';
  const player = sim.spawn(makeShipEntitySpec('ship_hornet', { isPlayer: true, player: s.player, pos: RED_KITE_START, fittings: [] }));
  s.playerId = player.id; const system = sim.registry.get('redKite'); system.update(1 / 60, s);
  function tick(n = 1) { for (let i = 0; i < n; i++) {
    s.tick++; s.simTime = s.tick / 60; system.update(1 / 60, s);
    if (native) { sim.registry.get('aiPorts').update(1 / 60, s); sim.registry.get('physics').update(1 / 60, s); }
  } }
  function unlock() {
    const rock = sim.spawn({ type: 'wreck', team: 0, pos: { x: player.pos.x - 100, z: player.pos.z },
      radius: 4, mass: 5, hull: 100, hullMax: 100, data: {} });
    if (native) sim.registry.get('physics').update(1 / 60, s);
    const result = getCombatKernel(system.ctx).attachments.create({ defId: 'tether_standard', ownerId: player.id,
      targetId: rock.id, sourceWorld: player.pos, targetWorld: rock.pos });
    assert.equal(result.ok, true, result.reason); tick();
    getCombatKernel(system.ctx).attachments.cut(result.attachment.id, player.id); return rock;
  }
  function start() { const r = system.start(); assert.equal(r.ok, true, r.reason); tick(C.countdownTicks); assert.equal(system._phase, 'race'); }
  function cross(index, e = player) {
    const g = redKiteGateFrame(index);
    e.pos.set(g.pos.x - g.nx * 10, 0, g.pos.z - g.nz * 10); tick();
    e.pos.set(g.pos.x + g.nx * 10, 0, g.pos.z + g.nz * 10); tick();
  }
  return { sim, s, system, player, tick, unlock, start, cross };
}

test('an off-sector scanner pulse without a materialized courier or selected body stays inert', () => {
  const sim = createSimulation({ seed: 5, systems: [spawnBudget, redKite] });
  try {
    const s = sim.state; s.mode = 'flight'; s.world.currentSectorId = 'sector_io_reach';
    const player = sim.spawn(makeShipEntitySpec('ship_hornet', { isPlayer: true, player: s.player, pos: { x: 0, z: 0 }, fittings: [] }));
    s.playerId = player.id; s.player.targetId = null;
    const offers = []; sim.bus.on('redKite:offer', p => offers.push(p));
    assert.doesNotThrow(() => sim.bus.emit('scan:pulse', { source: 'player-scanner', scannerId: player.id, pos: { ...player.pos } }));
    assert.equal(offers.length, 0);
  } finally { sim.dispose(); }
});

test('ordered swept gate planes reject reverse, repeated and out-of-aperture crossings', () => {
  const g = redKiteGateFrame(0), before = { x: g.pos.x - g.nx * 20, z: g.pos.z - g.nz * 20 };
  const after = { x: g.pos.x + g.nx * 20, z: g.pos.z + g.nz * 20 };
  assert.equal(redKiteGateCrossing(before, after, 0, 70), true);
  assert.equal(redKiteGateCrossing(after, before, 0, 70), false);
  assert.equal(redKiteGateCrossing(after, after, 0, 70), false);
  const shifted = p => ({ x: p.x - g.nz * 80, z: p.z + g.nx * 80 });
  assert.equal(redKiteGateCrossing(shifted(before), shifted(after), 0, 70), false);
  const h = fixture();
  try { h.unlock(); h.start(); h.cross(1); assert.equal(h.system._run.playerGate, 0);
    h.cross(0); h.cross(0); assert.equal(h.system._run.playerGate, 1);
    h.cross(1); h.cross(2); assert.equal(h.system._memory.lastResult.gates.length, 3);
  } finally { h.sim.dispose(); }
});
test('fixed sim inputs finish at the same tick under 30, 60 and 144 presentation batches', () => {
  const finishes = [];
  for (const fps of [30, 60, 144]) {
    const h = fixture();
    try {
      h.unlock(); h.start(); const run = h.system._run;
      let accumulator = 0, frames = 0;
      while (h.system._phase === 'race' && frames++ < 400) {
        accumulator += 60 / fps;
        while (accumulator >= 1 && h.system._phase === 'race') {
          accumulator--;
          const local = h.s.tick - run.startedTick + 1, gate = Math.min(2, Math.floor((local - 1) / 20));
          const g = redKiteGateFrame(gate), d = ((local - 1) % 20) - 10;
          h.player.pos.set(g.pos.x + g.nx * d, 0, g.pos.z + g.nz * d); h.tick();
        }
      }
      finishes.push(h.system._memory.lastResult.ticks);
    } finally { h.sim.dispose(); }
  }
  assert.deepEqual(finishes, [52, 52, 52]);
});
test('voluntary MassLine use gates a real budgeted courier; early departure and heavy blockage abort without a reward', () => {
  const h = fixture();
  try {
    assert.equal(h.system.readiness().reason, 'try your MassLine first'); assert.equal(h.s.spawnBudget.used, 1);
    assert.equal([...h.system._marks.values()].every(e => e.collides === false && e.physicsBody === false), true);
    h.unlock(); assert.equal(h.system.start().ok, true);
    h.player.pos.x += 200; h.tick(); assert.equal(h.system._phase, 'await');
    h.player.pos.set(RED_KITE_START.x, 0, RED_KITE_START.z); h.start();
    h.sim.spawn({ type: 'wreck', pos: RED_KITE_GATES[1].pos, mass: 1800, radius: 50, hull: 100, hullMax: 100, data: {} });
    h.tick(15); assert.equal(h.system._phase, 'await'); assert.equal(h.system._memory.firstCompletion, null);
    assert.equal(h.system.readiness().ok, false);
  } finally { h.sim.dispose(); }
});
test('combat on the final crossing wins no race and records no reward; collision only marks the run', () => {
  const h = fixture({ payment: true }); const completed = [];
  try {
    h.sim.bus.on('mission:completed', p => completed.push(p)); h.unlock(); h.start(); h.cross(0); h.cross(1);
    h.sim.bus.emit('physics:impact', { playerInvolved: true }); assert.equal(h.system._run.clean, false);
    const g = redKiteGateFrame(2); h.player.pos.set(g.pos.x - g.nx * 10, 0, g.pos.z - g.nz * 10); h.tick();
    h.sim.bus.emit('combat:damage', { targetId: h.player.id, attackerId: 999, weaponId: 'beam', origin: { kind: 'weapon' } });
    h.player.pos.set(g.pos.x + g.nx * 10, 0, g.pos.z + g.nz * 10); h.tick();
    assert.equal(h.system._memory.firstCompletion, null); assert.equal(h.s.missions.redKiteFirstReward, undefined); assert.deepEqual(completed, []);
    h.player.pos.set(RED_KITE_START.x, 0, RED_KITE_START.z); h.start(); h.cross(0); h.cross(1);
    h.sim.bus.emit('combat:fire', { ownerId: h.player.id, weaponId: 'beam' }); h.cross(2);
    assert.equal(h.system._phase, 'await'); assert.equal(h.system._memory.firstCompletion, null);
  } finally { h.sim.dispose(); }
});
test('first mission reward is reserved before recursive callbacks, cap-clamped and never repeats', () => {
  const h = fixture({ payment: true }); let recursive;
  try {
    h.s.player.credits = Number.MAX_SAFE_INTEGER - 7;
    h.sim.bus.on('economy:grantCredits', () => { recursive = h.sim.registry.get('missions').settleRedKiteRelay(h.system._memory.firstCompletion.id); });
    h.unlock(); h.start(); h.cross(0); h.cross(1); h.cross(2);
    assert.equal(h.s.player.credits, Number.MAX_SAFE_INTEGER); assert.equal(h.s.missions.redKiteFirstReward.creditedCr, 7);
    assert.equal(recursive.duplicate, true); assert.equal(recursive.creditedCr, 7);
    const owner = h.sim.registry.get('missions'), saved = owner.serialize();
    owner.deserialize(saved); assert.equal(owner.settleRedKiteRelay(h.system._memory.firstCompletion.id).duplicate, true);
    assert.equal(h.s.missions.completedLog.find(r => r.type === 'red_kite_relay').count, 1);
    assert.equal(owner.settleRedKiteRelay('wrong-finish').ok, false);
  } finally { h.sim.dispose(); }
});
test('courier loss stays permanent and the public buoy truthfully offers a solo run', () => {
  const h = fixture();
  try {
    h.unlock(); const actor = h.system._currentCourier(); actor.hull = 0; actor.alive = false;
    h.sim.bus.emit('entity:killed', { id: actor.id }); h.tick();
    assert.equal(h.system._memory.courierDestroyed, true); assert.equal(h.system._currentCourier(), null);
    h.system.deserialize(h.system.serialize()); h.tick(); assert.equal(h.system._currentCourier(), null);
    h.sim.spawn(makeShipEntitySpec('ship_hornet', { team: 2, pos: { x: RED_KITE_START.x + 400, z: RED_KITE_START.z }, fittings: [] }));
    const offer = []; h.sim.bus.on('redKite:offer', p => offer.push(p)); h.s.player.targetId = null; h.system.offer();
    assert.equal(offer.at(-1).solo, true); h.start(); h.cross(0); h.cross(1); h.cross(2);
    assert.equal(h.system._memory.lastResult.solo, true);
    assert.ok(h.system._memory.bestTimesByCourseAndHullClass[`${h.system._memory.lastResult.hullClass}:solo`]);
  } finally { h.sim.dispose(); }
});
test('version mismatch rejects times and exact current hull changes cannot inherit an active race', () => {
  const h = fixture();
  try {
    h.unlock(); h.start(); h.cross(0); h.player.occupantGeneration++; h.tick();
    assert.equal(h.system._phase, 'await'); assert.equal(h.system._memory.firstCompletion, null);
    const raw = h.system.serialize(); raw.courseVersion++;
    raw.bestTimesByCourseAndHullClass = { 'light:live': 400 }; raw.cleanCompletions = 12;
    assert.deepEqual(normalizeRedKiteMemory(raw).bestTimesByCourseAndHullClass, {});
    assert.equal(normalizeRedKiteMemory(raw).cleanCompletions, 0);
  } finally { h.sim.dispose(); }
});
test('actual save envelope retains finite body and rewards while Continue cancels an unfinished clock', () => {
  const h = fixture({ payment: true });
  const destination = createSimulation({ seed: 5, systems: [world, spawnBudget, redKite, economy, missions, save] });
  try {
    h.unlock(); h.start(); h.cross(0); h.cross(1); h.cross(2);
    h.player.pos.set(RED_KITE_START.x, 0, RED_KITE_START.z); h.start(); h.cross(0);
    const sourceSaver = Object.assign(Object.create(save), { state: h.s, bus: h.sim.bus, helpers: h.sim.helpers, registry: h.sim.registry });
    const data = sourceSaver.serializeData(); assert.equal(data.entities.persistent.filter(e => e.data?.redKiteActorId === C.actorId).length, 1);
    const saver = destination.registry.get('save'), system = destination.registry.get('redKite');
    let previous = h.system._currentCourier();
    for (let pass = 0; pass < 2; pass++) {
      assert.equal(saver._restore(structuredClone(data), 'quick').restored, true);
      destination.state.mode = 'flight'; system.update(1 / 60, destination.state);
      assert.equal(system._phase, 'await'); assert.equal(system._run, null);
      assert.equal([...destination.state.entities.values()].filter(e => e.alive && e.data?.redKiteActorId === C.actorId).length, 1);
      assert.equal([...destination.state.entities.values()].filter(e => e.alive && e.data?.redKiteMark).length, 4);
      const actor = system._currentCourier(); assert.ok(actor); assert.notEqual(actor, previous);
      const restoredProfile = resolveFlightProfile(actor, destination.state);
      assert.equal(restoredProfile.mass, C.mass); assert.equal(restoredProfile.mainAccel, C.mainAccel);
      assert.equal(restoredProfile.maxSpeed, C.maxSpeed);
      if (pass > 0) assert.notEqual(actor.occupantGeneration, previous.occupantGeneration);
      previous = actor;
      assert.equal(destination.state.missions.redKiteFirstReward.creditedCr, C.firstRewardCr);
      assert.equal(system._settleFirst().duplicate, true);
    }
    resetFreshRunSystems(destination.registry);
    assert.equal(system._memory.firstCompletion, null); assert.equal(system._memory.lineUsed, false);
    assert.equal(destination.state.missions.redKiteFirstReward, undefined);
    destination.state.mode = 'flight'; destination.state.world.currentSectorId = C.sectorId;
    destination.state.tick++; system.update(1 / 60, destination.state);
    assert.equal([...destination.state.entities.values()].filter(e => e.alive && e.data?.redKiteActorId === C.actorId).length, 1);
  } finally { destination.dispose(); h.sim.dispose(); }
});
test('the shipped maneuver port physically flies the courier within its actual fixed thrust and speed limits', async () => {
  const h = fixture({ native: true });
  try {
    const ph = h.sim.registry.get('physics');
    await ph.prepareBackend(h.s, { reset: true });
    h.unlock(); h.start(); const actor = h.system._currentCourier(), profile = resolveFlightProfile(actor, h.s);
    assert.equal(profile.mass, C.mass); assert.equal(profile.mainAccel, C.mainAccel);
    assert.equal(profile.maxSpeed, C.maxSpeed); assert.equal(profile.inertia, 3000);
    const start = { ...actor.pos }, samples = []; let maxForce = 0, maxSpeed = 0;
    for (let i = 0; i < C.deadlineTicks && h.system._run?.courierGate < 3; i++) {
      h.tick();
      const native = readPhysicsTelemetry(actor); assert.ok(native);
      maxForce = Math.max(maxForce, Math.hypot(native.force.x, native.force.z));
      maxSpeed = Math.max(maxSpeed, Math.hypot(actor.vel.x, actor.vel.z));
      if (i % 600 === 0) samples.push({ tick: h.s.tick, gate: h.system._run?.courierGate, pos: { ...actor.pos },
        request: h.system._planner.byEntity.get(actor.id)?.lastRequest });
    }
    assert.ok(Math.hypot(actor.pos.x - start.x, actor.pos.z - start.z) > 1000,
      JSON.stringify({ phase: h.system._phase, gate: h.system._run?.courierGate, pos: actor.pos, vel: actor.vel,
        start, player: h.player.pos, tick: h.s.tick, samples, port: h.sim.registry.get('aiPorts')._diag }));
    assert.equal(h.system._run?.courierGate, 3, JSON.stringify({ phase: h.system._phase,
      gate: h.system._run?.courierGate, gates: h.system._run?.courierGates, pos: actor.pos, samples }));
    const fixedDriveAndBrake = profile.mass * (Math.hypot(profile.mainAccel, profile.strafeAccel * .75)
      + profile.maxSpeed * (profile.linearDrag + profile.reverseBrake));
    assert.ok(maxForce <= fixedDriveAndBrake + 1e-5);
    assert.ok(maxSpeed <= profile.maxSpeed + .01); assert.deepEqual(actor.weapons, []);
    assert.deepEqual(actor.data.weapons, []); assert.deepEqual(actor.data.fittings, []);
    assert.equal(ph._sg02.records.get(actor.id).colliders.length, 9);
    assert.ok(redKitePresentation(h.s, actor));
    const native = ph._sg02, solved = native._simTick;
    native._simTick = h.s.tick + 1; assert.equal(redKitePresentation(h.s, actor), null);
    native._simTick = solved;
    h.system._handoff = { id: 'future', life: actor.occupantGeneration, gateIndex: 2, atTick: h.s.tick + 1 };
    assert.equal(redKitePresentation(h.s, actor).handoffReceipt, null);
    h.s.tick += 3; assert.equal(redKitePresentation(h.s, actor), null);
  } finally { h.sim.dispose(); }
});
test('a courier that misses an aperture receives a physical return goal without false handoff credit', async () => {
  const h = fixture({ native: true });
  try {
    const ph = h.sim.registry.get('physics'); await ph.prepareBackend(h.s, { reset: true }); h.unlock(); h.start();
    const actor = h.system._currentCourier(), g = redKiteGateFrame(0);
    actor.pos.set(g.pos.x + g.nx * 200 - g.nz * 200, 0, g.pos.z + g.nz * 200 + g.nx * 200);
    actor.vel.set(0, 0, 0); actor.flags.noInterp = true; ph.update(1 / 60, h.s);
    const before = (actor.pos.x - g.pos.x) * g.nx + (actor.pos.z - g.pos.z) * g.nz;
    h.tick(120); assert.equal(h.system._run.courierGate, 0); assert.deepEqual(h.system._run.courierGates, []);
    assert.equal(h.system._run.courierCrossing, false); assert.equal(h.system._handoff, null);
    const after = (actor.pos.x - g.pos.x) * g.nx + (actor.pos.z - g.pos.z) * g.nz;
    assert.ok(after < before, JSON.stringify({ before, after, vel: actor.vel }));
    assert.equal(ph._sg02.records.get(actor.id).entity, actor);
  } finally { h.sim.dispose(); }
});
test('the existing decision deck offers plot, explicit start and close without starting on inspection', () => {
  const cards = new Map(); setPromptDeck({ offerDecision: row => { cards.set(row.id, row); return true; }, resolveDecision: id => cards.delete(id) });
  const h = fixture(), adapter = Object.create(redKitePrompt); adapter.init(h.system.ctx);
  try {
    h.system.offer(); assert.equal(h.system._phase, 'await'); assert.equal(cards.get('red-kite:relay').choices.some(c => c.id === 'start'), false);
    h.unlock(); h.system.offer(); const offer = cards.get('red-kite:relay'); assert.ok(offer.choices.some(c => c.id === 'start'));
    offer.onChoose('leave'); assert.equal(cards.size, 0); assert.equal(h.system._phase, 'await');
    h.system.offer(); cards.get('red-kite:relay').onChoose('start'); assert.equal(h.system._phase, 'countdown'); assert.equal(cards.size, 0);
  } finally { adapter.destroy(); h.sim.dispose(); setPromptDeck(null); }
});
