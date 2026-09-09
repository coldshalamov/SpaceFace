import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { ensureCombatState } from '../src/combat/runtime.js';

let recoveryModule = null;
try {
  recoveryModule = await import('../src/systems/surrenderRecovery.js');
} catch {
  // The first TDD run intentionally reaches this branch: the production system does not exist yet.
}

const surrenderRecovery = recoveryModule?.surrenderRecovery || recoveryModule?.default || null;
const SECURE_REEL_WU = recoveryModule?.SURRENDER_SECURE_REEL_WU || 60;
const ESCAPE_S = recoveryModule?.SURRENDER_ESCAPE_S || 45;

test('surrender recovery system exists as a deterministic simulation system', () => {
  assert.ok(surrenderRecovery, 'src/systems/surrenderRecovery.js must exist');
  assert.equal(surrenderRecovery.name, 'surrenderRecovery');
});

test('normal play registers surrender recovery after tether gameplay', () => {
  const state = createGameState(4800);
  const registry = createRegistry({ state, bus: createBus(), helpers: {} });
  const names = registry.systems.map((system) => system.name);
  assert.ok(names.includes('surrenderRecovery'));
  assert.ok(names.indexOf('surrenderRecovery') > names.indexOf('tetherGameplay'));
});

function boot({ seed = 4801, hostileData = {}, bountyCr = 300 } = {}) {
  const voices = [];
  const sim = createSimulation({
    seed,
    systems: [surrenderRecovery],
    helpers: { voice: { say(payload) { voices.push(structuredClone(payload)); return true; } } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  const station = sim.spawn({
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
      bountyCr,
      ...hostileData,
      ai: {
        squadId: 'sq_surrender_recovery',
        archetype: 'pirate_raider',
        fsm: 'surrender',
        passive: true,
        roe: 'hold_fire',
        ...(hostileData.ai || {}),
      },
      intent: { fire: false, fireGroup: null, moveX: 0, moveZ: 0 },
      combat: { targetId: null, lockTarget: null },
    },
  });
  const events = {
    option: [], tethered: [], secured: [], recoveryLost: [], custody: [], escaped: [], credits: [], rep: [], receipts: [], resolutions: [],
  };
  for (const [event, key] of [
    ['surrender:option', 'option'],
    ['surrender:tethered', 'tethered'],
    ['surrender:secured', 'secured'],
    ['surrender:recoveryLost', 'recoveryLost'],
    ['law:custodyTransfer', 'custody'],
    ['surrender:escaped', 'escaped'],
    ['economy:grantCredits', 'credits'],
    ['faction:repDelta', 'rep'],
    ['encounter:receipt', 'receipts'],
    ['combat:nonlethalResolution', 'resolutions'],
  ]) bus.on(event, (payload) => events[key].push(structuredClone(payload)));
  return { sim, state, bus, station, player, hostile, events, voices };
}

function latchAt(t, restLength, attachmentId = 'att_surrender_tethered') {
  const combat = ensureCombatState(t.state);
  combat.attachments.byId[attachmentId] = {
    id: attachmentId,
    defId: 'tether_standard',
    ownerId: t.player.id,
    targetId: t.hostile.id,
    state: 'active',
    restLength,
    lastTension: 0,
    lastImpulse: 0,
    physicsHandle: null,
  };
  t.state.player.tether = {
    active: true,
    targetId: t.hostile.id,
    attachmentId,
    restLength,
    strain: 0.1,
    phase: 'loaded',
  };
  t.bus.emit('tether:latched', { actorId: t.player.id, targetId: t.hostile.id, attachmentId });
}

function surrender(t) {
  t.bus.emit('combat:surrendered', {
    entityId: t.hostile.id,
    squadId: 'sq_surrender_recovery',
    reason: 'damage-critical',
    factionId: t.hostile.factionId,
    type: 'ship',
  });
}

function disableDrive(t, { attackerId = t.player.id } = {}) {
  if (!t.state.combat || typeof t.state.combat !== 'object') t.state.combat = {};
  if (!t.state.combat.entities || typeof t.state.combat.entities !== 'object') t.state.combat.entities = {};
  t.state.combat.entities[String(t.hostile.id)] = {
    entityId: t.hostile.id,
    capabilities: { drive: false, weapon: true },
    subsystems: {
      subsystem_drive: {
        id: 'subsystem_drive',
        destroyed: true,
        effectiveDisabled: true,
      },
    },
  };
  t.bus.emit('combat:subsystemDisabled', {
    attackerId,
    targetId: t.hostile.id,
    subsystemId: 'subsystem_drive',
  });
}

function restoreDrive(t) {
  const runtime = t.state.combat.entities[String(t.hostile.id)];
  runtime.capabilities.drive = true;
  runtime.subsystems.subsystem_drive.destroyed = false;
  runtime.subsystems.subsystem_drive.effectiveDisabled = false;
  t.bus.emit('combat:subsystemEnabled', {
    targetId: t.hostile.id,
    subsystemId: 'subsystem_drive',
  });
}

function attachAndReel(t, after = SECURE_REEL_WU) {
  const combat = ensureCombatState(t.state);
  combat.attachments.byId.att_surrender_test = {
    id: 'att_surrender_test',
    defId: 'tether_standard',
    ownerId: t.player.id,
    targetId: t.hostile.id,
    state: 'active',
    restLength: after,
    lastTension: 0,
    lastImpulse: 0,
    physicsHandle: null,
  };
  t.state.player.tether = {
    active: true,
    targetId: t.hostile.id,
    attachmentId: 'att_surrender_test',
    restLength: after,
    strain: 0.1,
    phase: 'loaded',
  };
  t.bus.emit('tether:latched', { actorId: t.player.id, targetId: t.hostile.id, attachmentId: 'att_surrender_test' });
  t.bus.emit('tether:reel', {
    actorId: t.player.id,
    targetId: t.hostile.id,
    attachmentId: 'att_surrender_test',
    before: after + 10,
    after,
  });
}

test('surrender creates one readable massline custody option', { skip: !surrenderRecovery }, () => {
  const t = boot();
  surrender(t);
  surrender(t);
  assert.equal(t.events.option.length, 1, 'duplicate surrender events do not spam the option');
  assert.equal(t.voices.length, 1, 'one instruction owns the voice floor');
  assert.match(t.events.option[0].instruction, /massline|reel/i);
  assert.match(t.events.option[0].instruction, /station|custody/i);
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'awaiting_tether');
  assert.equal(t.hostile.data.ai.passive, true);
});

test('non-civilian guidance never selects a prefetched station from another sector', { skip: !surrenderRecovery }, () => {
  const t = boot();
  t.sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn', pos: { ...t.hostile.pos }, radius: 90,
    data: { stationId: 'station_prefetched_neighbor', factionId: 'faction_scn', sectorId: 'sector_ceres_belt', size: 'M' },
  });
  surrender(t);
  assert.equal(t.events.option[0].destinationStationId, 'station_custody_test');
});

test('a player-disabled hostile drive opens custody without forcing surrender or controls', { skip: !surrenderRecovery }, () => {
  const t = boot({ hostileData: { ai: { fsm: 'attack', passive: false, roe: 'fire_at_will' } } });
  t.hostile.data.intent.fire = true;
  t.hostile.data.intent.moveX = -1;
  t.hostile.data.intent.boost = true;
  const beforeAi = structuredClone(t.hostile.data.ai);
  const beforeIntent = structuredClone(t.hostile.data.intent);

  disableDrive(t);
  disableDrive(t);

  assert.equal(t.events.option.length, 1, 'duplicate drive transition cannot spam the option');
  assert.equal(t.events.option[0].recoveryKind, 'drive_disabled');
  assert.match(t.events.option[0].instruction, /drive disabled|massline/i);
  assert.equal(t.hostile.data.surrenderRecovery.escapeAt, null, 'a ballistic disabled hull has no fake escape timer');
  assert.deepEqual(t.hostile.data.ai, beforeAi, 'drive recovery does not force surrender or passive AI');
  assert.deepEqual(t.hostile.data.intent, beforeIntent, 'drive recovery never takes over fire, thrust, facing, or boost');

  attachAndReel(t);
  assert.equal(t.events.secured.length, 1);
  assert.deepEqual(t.hostile.data.ai, beforeAi);
  assert.deepEqual(t.hostile.data.intent, beforeIntent);

  t.player.pos.x = 100;
  t.hostile.pos.x = 140;
  t.sim.step();
  assert.equal(t.events.custody.length, 1);
  assert.equal(t.events.custody[0].recoveryKind, 'drive_disabled');
  assert.match(t.events.custody[0].text, /disabled hull/i);
});

test('only a player-caused drive disable creates the nonlethal recovery option', { skip: !surrenderRecovery }, () => {
  const t = boot({ hostileData: { ai: { fsm: 'attack', passive: false } } });
  disableDrive(t, { attackerId: t.hostile.id + 100 });
  assert.equal(t.events.option.length, 0);
  assert.equal(t.hostile.data.surrenderRecovery, undefined);
});

test('only a real close player tether secures the surrendered ship', { skip: !surrenderRecovery }, () => {
  const t = boot();
  surrender(t);
  t.bus.emit('tether:reel', {
    actorId: t.player.id,
    targetId: t.hostile.id,
    attachmentId: 'spoofed',
    before: 70,
    after: SECURE_REEL_WU,
  });
  assert.equal(t.events.secured.length, 0, 'event alone cannot spoof custody');

  attachAndReel(t, SECURE_REEL_WU + 1);
  assert.equal(t.events.secured.length, 0, 'line must be reeled inside the physical threshold');
  attachAndReel(t, SECURE_REEL_WU);
  assert.equal(t.events.secured.length, 1);
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'secured');
  assert.equal(t.events.credits.length, 0, 'field secure is not an instant remote payout');
  assert.equal(t.events.custody.length, 0, 'field secure still needs a lawful station');
});

test('canonical attachment publishes exactly one truthful tethered transition', { skip: !surrenderRecovery }, () => {
  const t = boot();
  surrender(t);

  t.bus.emit('tether:latched', {
    actorId: t.player.id,
    targetId: t.hostile.id,
    attachmentId: 'spoofed',
  });
  assert.equal(t.events.tethered.length, 0, 'an event without canonical attachment cannot spoof guidance');

  latchAt(t, SECURE_REEL_WU + 20);
  latchAt(t, SECURE_REEL_WU + 20);
  assert.equal(t.events.tethered.length, 1, 'repeated latch notices cannot replay the phase transition');
  assert.deepEqual(t.events.tethered[0], {
    id: `surrender:${t.hostile.id}`,
    entityId: t.hostile.id,
    label: 'Reach Cutter',
    recoveryKind: 'surrendered',
    phase: 'tethered',
    reason: 'damage-critical',
    rewardCr: 180,
    escapeAt: t.events.option[0].escapeAt,
    deadlineAt: null,
    manifestId: null,
    freighterKey: null,
    remainingQty: 0,
    destinationStationId: t.events.option[0].destinationStationId,
    secureReel_wu: SECURE_REEL_WU,
    instruction: 'Hold massline reel until the custody lock engages.',
    lostReason: null,
  });

  t.bus.emit('tether:reel', {
    actorId: t.player.id,
    targetId: t.hostile.id,
    attachmentId: 'att_surrender_tethered',
    before: SECURE_REEL_WU + 20,
    after: SECURE_REEL_WU + 20,
  });
  assert.equal(t.events.tethered.length, 1, 'reel chatter inside the same phase stays silent');
});

test('towing a secured ship into lawful protection transfers custody exactly once', { skip: !surrenderRecovery }, () => {
  const t = boot();
  surrender(t);
  attachAndReel(t);
  t.sim.step();
  assert.equal(t.events.custody.length, 0, 'outside the station ring remains a physical tow');

  t.player.pos.x = 100;
  t.hostile.pos.x = 140;
  t.sim.step();
  assert.equal(t.events.custody.length, 1);
  assert.equal(t.events.custody[0].stationId, 'station_custody_test');
  assert.equal(t.events.credits.length, 1);
  assert.deepEqual(t.events.credits[0], {
    amount: 180,
    reason: `surrender_custody:${t.hostile.id}`,
    entityId: t.hostile.id,
  });
  assert.equal(t.events.rep.length, 1);
  assert.equal(t.events.rep[0].factionId, 'faction_scn');
  assert.equal(t.events.rep[0].delta, 2);
  assert.equal(t.events.resolutions.length, 1);
  assert.equal(t.events.resolutions[0].outcome, 'custody');
  assert.equal(t.events.receipts.length, 1);
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'custody');
  assert.ok(t.hostile.data.despawnAt > t.state.simTime, 'custody removes the inert hull after a readable beat');

  t.sim.runTicks(30);
  assert.equal(t.events.custody.length, 1);
  assert.equal(t.events.credits.length, 1);
  assert.equal(t.events.rep.length, 1);
  assert.equal(t.events.receipts.length, 1);
});

test('an abandoned secure line reopens the escape window instead of leaving inert scenery', { skip: !surrenderRecovery }, () => {
  const t = boot();
  surrender(t);
  attachAndReel(t);
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'secured');
  t.state.player.tether.active = false;
  t.state.player.tether.targetId = null;
  t.bus.emit('tether:released', { targetId: t.hostile.id });
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'awaiting_tether');
  assert.match(t.hostile.data.surrenderRecovery.instruction, /relatch|escapes/i);
  t.sim.runTicks(Math.ceil((ESCAPE_S + 0.2) / SIM_DT));
  assert.equal(t.events.escaped.length, 1);
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'escaped');
});

test('an ignored surrender escapes instead of remaining inert forever', { skip: !surrenderRecovery }, () => {
  const t = boot();
  surrender(t);
  t.sim.runTicks(Math.ceil((ESCAPE_S + 0.2) / SIM_DT));
  assert.equal(t.events.escaped.length, 1);
  assert.equal(t.events.credits.length, 0);
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'escaped');
  assert.equal(t.hostile.data.ai.fsm, 'flee');
  assert.equal(t.hostile.data.intent.fire, false);
  assert.equal(t.hostile.data.intent.boost, true);
  assert.ok(t.hostile.data.despawnAt > t.state.simTime);
});

test('a released disabled hull remains ballistic, and repair closes the option without fake flight', { skip: !surrenderRecovery }, () => {
  const t = boot({ hostileData: { ai: { fsm: 'attack', passive: false, roe: 'fire_at_will' } } });
  t.hostile.data.intent.fire = true;
  t.hostile.data.intent.moveX = -1;
  t.hostile.data.intent.boost = false;
  const beforeAi = structuredClone(t.hostile.data.ai);
  const beforeIntent = structuredClone(t.hostile.data.intent);

  disableDrive(t);
  attachAndReel(t);
  t.state.player.tether.active = false;
  t.state.player.tether.targetId = null;
  t.bus.emit('tether:released', { targetId: t.hostile.id });
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'awaiting_tether');
  assert.equal(t.hostile.data.surrenderRecovery.escapeAt, null);
  assert.match(t.hostile.data.surrenderRecovery.instruction, /drive remains disabled/i);

  t.sim.runTicks(Math.ceil((ESCAPE_S + 0.2) / SIM_DT));
  assert.equal(t.events.escaped.length, 0, 'disabled recovery never invents an escape controller or despawn');
  assert.equal(t.hostile.data.despawnAt, undefined);
  assert.deepEqual(t.hostile.data.ai, beforeAi);
  assert.deepEqual(t.hostile.data.intent, beforeIntent);

  restoreDrive(t);
  t.sim.step();
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'lost');
  assert.match(t.hostile.data.surrenderRecovery.instruction, /drive restored/i);
  assert.equal(t.events.escaped.length, 0);
  assert.deepEqual(t.hostile.data.ai, beforeAi);
  assert.deepEqual(t.hostile.data.intent, beforeIntent);

  disableDrive(t);
  assert.equal(t.events.option.length, 2, 'a later real drive disable reopens the physical option');
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'awaiting_tether');
  assert.deepEqual(t.hostile.data.ai, beforeAi);
  assert.deepEqual(t.hostile.data.intent, beforeIntent);
});

test('authored bosses and aces cannot enter generic surrender recovery', { skip: !surrenderRecovery }, () => {
  for (const hostileData of [
    { isBoss: true },
    { encounterBoss: true },
    { aceMemory: { aceId: 'ace_vanta' } },
    { aiArchetype: 'miniboss_capital' },
  ]) {
    const t = boot({ hostileData });
    surrender(t);
    assert.equal(t.events.option.length, 0);
    assert.equal(t.hostile.data.surrenderRecovery, undefined);

    const disabled = boot({
      seed: t.state.meta.seed + 100,
      hostileData: {
        ...hostileData,
        ai: { fsm: 'attack', passive: false, ...(hostileData.ai || {}) },
      },
    });
    disableDrive(disabled);
    assert.equal(disabled.events.option.length, 0);
    assert.equal(disabled.hostile.data.surrenderRecovery, undefined);
  }
});
