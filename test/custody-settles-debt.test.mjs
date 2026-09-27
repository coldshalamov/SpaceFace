import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { ensureCombatState } from '../src/combat/runtime.js';
import { surrenderRecovery, SURRENDER_SECURE_REEL_WU } from '../src/systems/surrenderRecovery.js';
import { ensureMoralMemory, nextMoralDebt, rememberMoralDebt } from '../src/systems/moralMemory.js';
import { promotedPilotIdentity, promotedPilotIdFor } from '../src/data/pilotCallsigns.js';

function boot({ seed = 4801 } = {}) {
  const voices = [];
  const sim = createSimulation({
    seed,
    systems: [surrenderRecovery],
    helpers: { voice: { say(payload) { voices.push(structuredClone(payload)); return true; } } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 0, z: 0 },
    radius: 90,
    data: { stationId: 'station_custody_test', factionId: 'faction_scn', sectorId: 'sector_tethys_junction', size: 'M' },
  });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 1200, z: 0 }, hull: 200, hullMax: 200,
  });
  state.playerId = player.id;
  const hostile = sim.spawn({
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 1240, z: 0 },
    hull: 12,
    hullMax: 100,
    mass: 80,
    data: {
      name: 'Reach Cutter',
      bountyCr: 300,
      ai: {
        squadId: 'sq_custody_debt',
        archetype: 'pirate_raider',
        fsm: 'surrender',
        passive: true,
        roe: 'hold_fire',
      },
      intent: { fire: false, fireGroup: null, moveX: 0, moveZ: 0 },
      combat: { targetId: null, lockTarget: null },
    },
  });
  const events = { custody: [], escaped: [] };
  bus.on('law:custodyTransfer', (payload) => events.custody.push(structuredClone(payload)));
  bus.on('surrender:escaped', (payload) => events.escaped.push(structuredClone(payload)));
  return { sim, state, bus, player, hostile, events, voices };
}

function openRecord(t) {
  return Object.values(t.state.surrenderRecovery.records).find((r) => r && r.entityId === t.hostile.id);
}

function expireEscapeWindow(t) {
  const record = openRecord(t);
  t.state.simTime = record.escapeAt + 0.1;
  t.sim.step();
  return record;
}

function surrender(t) {
  t.bus.emit('combat:surrendered', {
    entityId: t.hostile.id,
    squadId: 'sq_custody_debt',
    reason: 'damage-critical',
    factionId: t.hostile.factionId,
    type: 'ship',
  });
}

// Mirror the aceMemory surrender contract: deterministic minted name stamped on the hull,
// pending spared debt in the ledger.
function spareDebt(t, overrides = {}) {
  const identity = promotedPilotIdentity(t.state.meta.seed >>> 0, t.hostile.id);
  const id = promotedPilotIdFor(t.hostile.id);
  t.hostile.data.sparedPilot = { id, name: identity.name, sparedAt: t.state.simTime || 0 };
  return rememberMoralDebt(t.state, {
    id,
    name: identity.name,
    cause: 'spared',
    factionId: 'faction_reach',
    archetype: 'pirate_raider',
    t: t.state.simTime || 0,
    source: 'test:spared',
    ...overrides,
  });
}

function towIntoCustody(t) {
  const combat = ensureCombatState(t.state);
  combat.attachments.byId.att_custody_debt = {
    id: 'att_custody_debt',
    defId: 'tether_standard',
    ownerId: t.player.id,
    targetId: t.hostile.id,
    state: 'active',
    restLength: SURRENDER_SECURE_REEL_WU,
    lastTension: 0,
    lastImpulse: 0,
    physicsHandle: null,
  };
  t.state.player.tether = {
    active: true,
    targetId: t.hostile.id,
    attachmentId: 'att_custody_debt',
    restLength: SURRENDER_SECURE_REEL_WU,
    strain: 0.1,
    phase: 'loaded',
  };
  t.bus.emit('tether:latched', { actorId: t.player.id, targetId: t.hostile.id, attachmentId: 'att_custody_debt' });
  t.bus.emit('tether:reel', {
    actorId: t.player.id,
    targetId: t.hostile.id,
    attachmentId: 'att_custody_debt',
    before: SURRENDER_SECURE_REEL_WU + 10,
    after: SURRENDER_SECURE_REEL_WU,
  });
  t.player.pos.x = 100;
  t.hostile.pos.x = 140;
  t.sim.step();
}

test('custody settles the spared debt so the prisoner has no comeback', () => {
  const t = boot();
  ensureMoralMemory(t.state);
  surrender(t);
  const debt = spareDebt(t);
  assert.equal(debt.status, 'pending');
  assert.equal(nextMoralDebt(t.state)?.id, debt.id, 'h7 would resurrect the prisoner');
  towIntoCustody(t);
  assert.equal(t.events.custody.length, 1);
  assert.equal(debt.status, 'settled');
  assert.equal(debt.settledHow, 'custody');
  assert.equal(t.events.custody[0].settledDebtId, debt.id);
  assert.match(t.events.custody[0].text, new RegExp(`${debt.name} is in chains; the ledger closes`));
  assert.equal(nextMoralDebt(t.state), null, 'settled debts never return');
});

test('custody without a debt still transfers cleanly', () => {
  const t = boot();
  surrender(t);
  towIntoCustody(t);
  assert.equal(t.events.custody.length, 1);
  assert.equal(t.events.custody[0].settledDebtId, null);
});

test('a recycled entity id never settles a stranger debt', () => {
  const t = boot();
  surrender(t);
  // Same debt id a previous hull occupant left behind, but a different pilot name.
  const id = promotedPilotIdFor(t.hostile.id);
  const stranger = rememberMoralDebt(t.state, {
    id, name: 'Rex Impossible', cause: 'spared', factionId: 'faction_reach',
    archetype: 'pirate_raider', source: 'test:recycled',
  });
  towIntoCustody(t);
  assert.equal(t.events.custody.length, 1);
  assert.equal(stranger.status, 'pending', 'name mismatch blocks the settle');
  assert.equal(t.events.custody[0].settledDebtId, null);
});

test('escape keeps the debt, escalates it, and names the threat', () => {
  const t = boot();
  surrender(t);
  const debt = spareDebt(t);
  assert.equal(debt.escalationTier, 1);
  const record = expireEscapeWindow(t);
  assert.equal(t.events.escaped.length, 1);
  assert.equal(record.phase, 'escaped');
  assert.equal(debt.status, 'pending', 'the slipped rope still answers');
  assert.equal(debt.escalationTier, 2);
  assert.equal(debt.escapes, 1);
  assert.equal(record.escapeeDebtId, debt.id);
  assert.equal(t.events.escaped[0].escapeeDebtId, debt.id);
  assert.equal(nextMoralDebt(t.state)?.id, debt.id, 'h7 can still collect');
  const threat = t.voices.find((v) => String(v.id || '').endsWith(':escape-threat'));
  assert.ok(threat, 'escapee speaks a named threat');
  assert.ok(String(threat.text).startsWith(`${debt.name}:`), 'threat wears the minted name');
});

test('an escape with no prior debt mints one with a stamped face', () => {
  const t = boot();
  surrender(t);
  const record = expireEscapeWindow(t);
  assert.equal(t.events.escaped.length, 1);
  const memory = t.state.story.moralMemory;
  const debt = memory.debts[record.escapeeDebtId];
  assert.ok(debt, 'escape mints the missing debt');
  assert.equal(debt.cause, 'escaped_custody');
  assert.equal(debt.status, 'pending');
  assert.equal(t.hostile.data.callsign, debt.name, 'hull wears the pilot name immediately');
  assert.equal(t.hostile.data.ai.name, debt.name);
  assert.equal(t.hostile.data.sparedPilot?.id, debt.id);
  assert.equal(nextMoralDebt(t.state)?.id, debt.id);
});

test('executing a prisoner darkens the debt to vengeful', () => {
  const t = boot();
  surrender(t);
  const debt = spareDebt(t);
  t.hostile.hull = 0;
  t.hostile.alive = false;
  t.sim.step();
  const record = openRecord(t);
  assert.equal(record.phase, 'lost');
  assert.equal(debt.status, 'pending', 'the debt survives the pilot');
  assert.equal(debt.disposition, 'vengeful');
  assert.equal(debt.cause, 'executed_prisoner');
  assert.equal(debt.escalationTier, 2);
  assert.equal(nextMoralDebt(t.state)?.id, debt.id, 'the crew answers it');
});

test('executing a prisoner with no prior debt mints a vengeful crew debt', () => {
  const t = boot();
  surrender(t);
  t.hostile.hull = 0;
  t.hostile.alive = false;
  t.sim.step();
  const memory = t.state.story.moralMemory;
  const ids = Object.keys(memory.debts);
  assert.equal(ids.length, 1);
  const debt = memory.debts[ids[0]];
  assert.equal(debt.cause, 'executed_prisoner');
  assert.equal(debt.disposition, 'vengeful');
  assert.equal(debt.escalationTier, 2);
  assert.equal(debt.status, 'pending');
});

test('a squatted id keeps the escape anonymous and the stranger untouched', () => {
  const t = boot();
  surrender(t);
  const id = promotedPilotIdFor(t.hostile.id);
  const stranger = rememberMoralDebt(t.state, {
    id, name: 'Rex Impossible', cause: 'spared', factionId: 'faction_reach',
    archetype: 'pirate_raider', source: 'test:squat',
  });
  const record = expireEscapeWindow(t);
  assert.equal(t.events.escaped.length, 1);
  assert.equal(record.escapeeDebtId, undefined, 'no linkage minted on a squatted id');
  assert.equal(t.events.escaped[0].escapeeDebtId, null);
  assert.equal(stranger.escalationTier, 1, 'stranger debt untouched');
  assert.equal(stranger.escapes || 0, 0);
  assert.ok(!t.voices.some((v) => String(v.id || '').endsWith(':escape-threat')), 'no threat in a stranger name');
});

test('a squatted id keeps an execution from darkening a stranger', () => {
  const t = boot();
  surrender(t);
  const id = promotedPilotIdFor(t.hostile.id);
  const stranger = rememberMoralDebt(t.state, {
    id, name: 'Rex Impossible', cause: 'spared', factionId: 'faction_reach',
    archetype: 'pirate_raider', source: 'test:squat',
  });
  t.hostile.hull = 0;
  t.hostile.alive = false;
  t.sim.step();
  assert.equal(stranger.disposition === 'vengeful' && stranger.cause === 'executed_prisoner', false);
  assert.equal(stranger.cause, 'spared');
  assert.equal(Object.keys(t.state.story.moralMemory.debts).length, 1, 'no second debt minted');
});

test('a destroyed freighter under rescue mints no crew debt', () => {
  const t = boot();
  const freighter = t.sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_mts',
    pos: { x: 1300, z: 0 },
    hull: 40,
    hullMax: 100,
    data: {
      name: 'MTS Relief Mule',
      role: 'hauler',
      trafficRole: 'hauler',
      cargoManifest: {
        manifestId: 'fm_custody_debt_1',
        freighterKey: 'custody-debt:hauler:0',
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_food', qty: 5 }],
        totalQty: 5,
      },
      ai: { archetype: 'mule_trader', encounterRole: 'hauler', fsm: 'travel', passive: true },
    },
  });
  if (!t.state.combat || typeof t.state.combat !== 'object') t.state.combat = {};
  t.state.combat.entities = {
    ...(t.state.combat.entities || {}),
    [String(freighter.id)]: {
      entityId: freighter.id,
      capabilities: { drive: false, weapon: true },
      subsystems: { subsystem_drive: { id: 'subsystem_drive', destroyed: true, effectiveDisabled: true } },
    },
  };
  t.bus.emit('combat:subsystemDisabled', {
    attackerId: t.hostile.id,
    targetId: freighter.id,
    subsystemId: 'subsystem_drive',
  });
  const record = Object.values(t.state.surrenderRecovery.records).find((r) => r && r.entityId === freighter.id);
  assert.equal(record?.recoveryKind, 'civilian_disabled');
  freighter.hull = 0;
  freighter.alive = false;
  t.sim.step();
  assert.deepEqual(Object.keys(t.state.story.moralMemory?.debts || {}), [], 'victims mint no debts');
});

test('debts from other causes are not custody business', () => {
  const t = boot();
  surrender(t);
  const identity = promotedPilotIdentity(t.state.meta.seed >>> 0, t.hostile.id);
  const id = promotedPilotIdFor(t.hostile.id);
  t.hostile.data.sparedPilot = { id, name: identity.name, sparedAt: t.state.simTime || 0 };
  const other = rememberMoralDebt(t.state, {
    id, name: identity.name, cause: 'mercy', factionId: 'faction_reach',
    archetype: 'pirate_raider', source: 'test:other-cause',
  });
  towIntoCustody(t);
  assert.equal(t.events.custody.length, 1);
  assert.equal(other.status, 'pending');
});
