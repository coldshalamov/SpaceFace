import test from 'node:test';
import assert from 'node:assert/strict';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { PALLET_JACK } from '../src/data/palletJack.js';

function fixture({ specialist = true, interval = 2 } = {}) {
  const actor = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, radius: 20, data: { ai: { passive: false },
      intent: { fire: false }, combat: {}, weapons: [],
      ...(specialist ? { lootTableId: PALLET_JACK.enemyId, palletJack: { phase: 'approach',
        flightPoint: { x: 100, z: 0 }, flightVelocity: { x: 0, z: 0 }, faceAngle: 0, loaded: false } } : {}) } };
  const state = { tick: 0, simTime: 0, playerId: 1, player: { heat: 0 },
    entities: new Map([[actor.id, actor]]), entityList: [actor], combat: { trace: { events: [] } } };
  const requests = []; let selections = 0;
  const tactical = createTacticalAISystem({ seed: 79,
    config: { runtime: { decisionIntervalTicks: interval, memberBatchSize: 1, memberBatchSpreadTicks: 3 }, trace: { enabled: false } },
    sensors: { frameFor(entityId, tick) { return { tick, self: { id: entityId, team: 1,
      pos: actor.pos, vel: actor.vel, rot: actor.rot, radius: actor.radius, hullFraction: 1,
      energyFraction: 1, heatFraction: 0, disabled: false, tethered: false,
      capabilities: ['drive'], subsystemFractions: {}, activity: null, roe: 'hold_fire', combatDoctrineId: null }, contacts: [], events: [] }; } },
    roster: { listSquads(tick) { return [{ id: 'pallet-fixture', doctrine: 'patrol', faction: 'fixture', tick,
      members: [{ id: actor.id, capabilities: ['drive'], combatDoctrineId: null, team: 1,
        alive: true, pos: actor.pos, passive: false, playerId: 1, playerTeam: 0,
        authorityOrigin: actor.pos, authorityRadius: 500 }] }]; } },
    maneuver: { request(value) { requests.push(value); return true; } },
    actionPortFactory: () => ({ list: () => { selections++; return []; }, canStart: () => ({ ok: false }), start: () => null,
      status: () => 'idle', interrupt: () => true }),
  });
  tactical.init({ state, bus: null, helpers: {} });
  return { actor, state, tactical, requests, selections: () => selections,
    step() { state.tick++; state.simTime = state.tick / 60; tactical.update(1 / 60, state); return requests.at(-1); } };
}

test('Pallet waypoints reach the real planner before forces, including cached decisions and replay ticks', () => {
  const h = fixture();
  try {
    const first = h.step();
    assert.ok(first.forceLocal.forward > 0, 'a load ahead produces forward force, not an idle squad hold');
    assert.equal(first.reason, 'pallet-jack-physical-freight');
    const replay = h.step();
    assert.deepEqual(replay.forceLocal, first.forceLocal, 'interleaved tick replays a computed motor request');
    h.actor.data.palletJack.flightPoint = { x: -100, z: 0 };
    h.actor.data.palletJack.faceAngle = Math.PI / 2;
    // Tick 3 refreshes this member; tick 5 must reuse selection but re-plan new cargo intent.
    h.step(); h.step();
    h.actor.data.palletJack.flightPoint = { x: 100, z: 0 };
    const beforeCached = h.selections();
    const cached = h.step();
    assert.equal(h.selections(), beforeCached, 'the member-batch path reused its selected action');
    assert.ok(cached.forceLocal.forward > 0, 'cached action receives the latest cargo waypoint');
    h.actor.data.palletJack.flightPoint = { x: -100, z: 0 };
    h.step(); h.step();
    assert.ok(h.requests.at(-1).forceLocal.forward < 0, 'cached behavior re-plans the updated load waypoint');
    assert.ok(h.requests.at(-1).torqueYaw > 0, 'the authored facing reaches actual yaw torque');
  } finally { h.tactical.destroy(); }
});

test('ordinary pilots keep their normal idle squad maneuver', () => {
  const h = fixture({ specialist: false });
  try { assert.equal(h.step().forceLocal.forward, 0); }
  finally { h.tactical.destroy(); }
});

test('ordinary cargo payloads are sensed as objectives; unrelated payloads, empty cargo, and out-of-range loads are not', async () => {
  const { createSimulation } = await import('../src/core/sim.js');
  const { aiPorts } = await import('../src/systems/aiPorts.js');
  const { spawnJettisonedCargoPod } = await import('../src/systems/lootShards.js');
  const sim = createSimulation({ seed: 79, systems: [aiPorts] });
  try {
    const actor = sim.spawn({ type: 'ship', team: 1, hull: 160, hullMax: 160, radius: 20,
      mass: 100, pos: { x: 0, z: 0 }, data: { ai: { sensorRange: 700 }, weapons: [] } });
    const helpers = sim.registry.ctx.helpers;
    const cargo = spawnJettisonedCargoPod(sim.state, { commodityId: 'cmdty_electronics', amount: 3,
      unitMass: 20, pos: { x: 50, z: 0 }, vel: { x: -5, z: 0 } }, helpers);
    const unrelated = sim.spawn({ type: 'payload', pos: { x: 70, z: 0 }, radius: 3, mass: 20, data: {} });
    const empty = sim.spawn({ type: 'payload', pos: { x: 80, z: 0 }, radius: 3, mass: 20,
      data: { kind: 'cargo', commodityId: 'cmdty_electronics', amount: 0 } });
    const far = spawnJettisonedCargoPod(sim.state, { commodityId: 'cmdty_electronics', amount: 3,
      unitMass: 20, pos: { x: 2000, z: 0 } }, helpers);
    const frame = helpers.aiSensors.frameFor(actor.id, sim.state.tick);
    const target = frame.contacts.find(contact => contact.id === cargo.id);
    assert.equal(target?.kind, 'objective');
    assert.deepEqual(target.vel, { x: -5, z: 0 });
    for (const other of [unrelated, empty, far]) assert.equal(frame.contacts.some(c => c.id === other.id), false);
  } finally { sim.dispose(); }
});
