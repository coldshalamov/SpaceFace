// CPU integration: real tactical decisions and bounded JSON DTO; sensor/roster
// ports and canonical restore-binding receipts are explicit fixtures. No shot,
// native combat, ordinary route or GPU-visibility claim is made here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const IDS = [2, 3, 4, 5, 6];
const ACTIVITY = { kind: 'attack_run', reason: 'lane_fixture', anchor: { x: 0, z: 0 },
  leashRadius: 2600, preferredRange: 180, startedTick: 0 };

function initialState(doctrineId = 'interceptor_flyby') {
  const entities = new Map();
  entities.set(1, { id: 1, occupantGeneration: 3, type: 'ship', alive: true, team: 2,
    pos: { x: 190, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, data: {} });
  for (const id of IDS) entities.set(id, { id, occupantGeneration: 7 + id,
    type: 'ship', alive: true, team: 1, pos: { x: 0, z: id * 12 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
    data: { ai: { combatDoctrineId: id === 2 ? doctrineId : null,
      activity: structuredClone(ACTIVITY), roe: 'weapons_free', ...(id === 2 ? { swarmFireHoldUntil: 10 } : {}) },
    intent: {}, weapons: [{ projSpeed: 420 }] } });
  return { tick: 0, simTime: 0, playerId: 1, entities, meta: { seed: 47 },
    player: { heat: 0 }, combat: { trace: { events: [] } } };
}

function host(state = initialState(), { visible = true } = {}) {
  const events = [], bus = createBus();
  bus.on('ai:telegraph', payload => events.push(structuredClone(payload)));
  const doctrineId = state.entities.get(2).data.ai.combatDoctrineId;
  const tactical = createTacticalAISystem({ seed: 47, config: { trace: { enabled: false } },
    sensors: { frameFor(id, tick) {
      const entity = state.entities.get(id), player = state.entities.get(1);
      return { tick, self: { id, team: 1, pos: entity.pos, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
        hullFraction: 1, energyFraction: 1, heatFraction: 0, disabled: false, tethered: false,
        capabilities: ['drive', 'sensor', 'weapon', 'ranged'], subsystemFractions: {},
        activity: ACTIVITY, roe: 'weapons_free', combatDoctrineId: id === 2 ? doctrineId : null },
      contacts: visible ? [{ id: 1, kind: 'ship', team: 2, classification: 'live_hostile',
        pos: player.pos, vel: player.vel, radius: 12, confidence: 1, threat: 0.9,
        hostile: true, alive: true, valid: true, visible: true, tags: ['armed'] }] : [], events: [] };
    } },
    roster: { listSquads() { return [{ id: 'lane_fixture', doctrine: 'scavenger', faction: 'fixture', formation: 'wedge',
      members: IDS.map(id => ({ id, capabilities: id === 2 ? ['drive', 'sensor', 'weapon'] : ['drive', 'sensor', 'weapon', 'ranged'],
        combatDoctrineId: id === 2 ? doctrineId : null })) }]; } },
    maneuver: { request() { return true; } },
    actionPortFactory: () => ({ list: () => [{ id: 'action_burst', tags: ['attack'], range: 700,
      preferredRange: 220, targetKinds: ['ship'] }], canStart: () => ({ ok: true }),
    start: () => ({}), status: () => 'running', interrupt: () => true }),
  });
  tactical.init({ state, bus, helpers: {} });
  return { state, tactical, bus, events, cues: () => events.filter(row => row.entityId === 2) };
}

function step(h, tick) {
  h.state.tick = tick; h.state.simTime = tick / 60; h.tactical.update(1 / 60, h.state);
}

function coldFrom(warm, options = {}) {
  const slice = JSON.parse(JSON.stringify(warm.tactical.serialize()));
  assert.ok(slice, 'the real bounded owner slice is present');
  const state = structuredClone(warm.state);
  const bindings = slice.bindings.map(binding => {
    const entity = state.entities.get(binding.id); entity.occupantGeneration += 100;
    return { saveId: binding.id, savedGeneration: binding.generation,
      entityId: entity.id, generation: entity.occupantGeneration };
  });
  if (options.wrongLifeId != null) state.entities.get(options.wrongLifeId).occupantGeneration += 1;
  const cold = host(state, options);
  cold.bus.emit('save:loaded', { tacticalAI: slice, tacticalAIEntityBindings: bindings });
  return cold;
}

test('cold committed warning uses the restored record and emits once after repeated hold/release', () => {
  const warm = host(); let cold;
  try {
    step(warm, 0); step(warm, 1);
    assert.equal(warm.cues().length, 0, 'the actual fire hold suppresses the initial cue');
    cold = coldFrom(warm);
    const record = cold.tactical.stack.combatDoctrine.byEntity.get(2);
    const decision = cold.tactical.stack.lastResult.decisions.find(row => row.entityId === 2);
    assert.notEqual(record.telegraph, decision.combatDoctrine.telegraph,
      'JSON restores value copies, so cached-decision pointer identity is insufficient');
    step(cold, 2);
    assert.equal(cold.cues().length, 0, 'a still-held restored lane does not announce early');
    for (const h of [warm, cold]) h.state.entities.get(2).data.ai.swarmFireHoldUntil = 0;
    step(warm, 3); step(cold, 3);
    assert.equal(warm.cues().length, 1); assert.equal(cold.cues().length, 1);
    const cue = cold.cues()[0];
    assert.equal(cue.sourceGeneration, cold.state.entities.get(2).occupantGeneration);
    assert.equal(cue.targetGeneration, cold.state.entities.get(1).occupantGeneration);
    assert.deepEqual(cue.aimCommit, warm.cues()[0].aimCommit, 'the restored warning never changes committed aim');
    assert.deepEqual(cue.attackLine, warm.cues()[0].attackLine);
    step(cold, 3);
    cold.state.entities.get(2).data.ai.swarmFireHoldUntil = 10; step(cold, 4);
    cold.state.entities.get(2).data.ai.swarmFireHoldUntil = 0; step(cold, 5);
    assert.equal(cold.cues().length, 1, 'repeat update and later hold/release cannot remint the same cue');
  } finally { warm.tactical.destroy(); cold?.tactical.destroy(); }
});

test('a noncommitted doctrine and a completed announce do not invent a cold warning', () => {
  for (const kind of ['noncommitted', 'expired']) {
    const warm = host(initialState(kind === 'noncommitted' ? 'mine_layer_wake' : 'interceptor_flyby')); let cold;
    try {
      step(warm, 0); step(warm, 1);
      if (kind === 'expired') step(warm, 31);
      const snapshot = warm.tactical.stack.lastResult.decisions.find(row => row.entityId === 2)?.combatDoctrine;
      assert.ok(snapshot);
      if (kind === 'noncommitted') assert.equal(snapshot.aimCommit, null);
      else assert.equal(snapshot.telegraph, null, 'the real doctrine has left its announce phase');
      cold = coldFrom(warm);
      cold.state.entities.get(2).data.ai.swarmFireHoldUntil = 0;
      step(cold, warm.state.tick + 1);
      assert.equal(cold.cues().length, 0, kind);
    } finally { warm.tactical.destroy(); cold?.tactical.destroy(); }
  }
});

test('a rejected source or target life cannot rearm its cached announce', () => {
  for (const wrongLifeId of [1, 2]) {
    const warm = host(); let cold;
    try {
      step(warm, 0); step(warm, 1);
      cold = coldFrom(warm, { wrongLifeId, visible: false });
      assert.equal(cold.tactical.stack.combatDoctrine.byEntity.has(2), false,
        'the canonical binding reader rejects the stale relation before restore can rearm it');
      cold.state.entities.get(2).data.ai.swarmFireHoldUntil = 0; step(cold, 2);
      assert.equal(cold.cues().length, 0, 'no warning can revive the rejected cached life');
    } finally { warm.tactical.destroy(); cold?.tactical.destroy(); }
  }
});
