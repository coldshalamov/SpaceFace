import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import {
  GUN_KILL_SCORE,
  comboTotal,
  createComboState,
  recordKill,
  recordTrick,
  recordTrickKill,
} from '../src/systems/stuntCombo.js';
import {
  killScoreFor,
  killXpFor,
  survivalRewards,
} from '../src/systems/survivalRewards.js';

const SEED = 7;
const ARENA = 'helios_core';
const DT = 1 / 60;

function bootGrammar(playerId = 'player') {
  const bus = createBus();
  const state = {
    playerId,
    stunts: null,
    tick: 0,
    simTime: 0,
    mode: 'flight',
    run: { kind: 'survival', phase: 'active' },
    entities: new Map(),
  };
  const sys = Object.create(stuntGrammar);
  sys.init({ bus, state });
  return { sys, bus, state };
}

function markCohort(state, id) {
  state.entities.set(id, {
    id, alive: true, type: 'ship', data: { runCohort: 'survival' },
  });
}

function bootRun() {
  const state = createGameState(SEED);
  state.player.credits = 1000;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  runSession.init({ state, bus });
  survivalRewards.init({ state, bus });
  const stuntSys = Object.create(stuntGrammar);
  stuntSys.init({ state, bus });
  return { state, bus, emitted, player, stuntSys };
}

function beginSurvival(harness) {
  harness.bus.emit('run:beginRequested', {
    kind: 'survival',
    ruleset: 'scored',
    seed: SEED,
    arenaId: ARENA,
  });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    harness.bus.emit('run:transitionRequested', {
      expectedPhase: from,
      nextPhase: next,
      reason: 'test',
      tick: 0,
    });
    from = next;
  }
}

function spawnCohort(harness, { level = 1 } = {}) {
  const id = harness.state.nextEntityId++;
  const entity = {
    id,
    alive: true,
    type: 'ship',
    team: 1,
    pos: { x: 40, z: 0 },
    data: { level, runWave: 1, runCohort: 'survival' },
  };
  harness.state.entities.set(id, entity);
  harness.state.entityList.push(entity);
  return entity;
}

function killCohort(harness, entity, payload = {}) {
  entity.alive = false;
  harness.bus.emit('entity:killed', {
    id: entity.id,
    type: entity.type,
    pos: entity.pos,
    ...payload,
  });
}

const named = (emitted, event) => emitted.filter((entry) => entry.event === event);

test('update(dt, state) banks the chain once it goes quiet', () => {
  const { sys, state } = bootGrammar('player');
  sys.update(DT, state);
  const combo = state.stunts.combo;
  recordTrick(combo, {
    trickId: 'collateral', rarity: 'uncommon', baseScore: 200,
    actorId: 'player', tick: 10, metrics: {},
  });
  const live = comboTotal(combo);
  assert.ok(combo.activeCount > 0);
  state.tick = 370;
  sys.update(DT, state);
  assert.equal(combo.activeCount, 0);
  assert.equal(combo.banked, live);

  const other = { playerId: 'player' };
  sys.update(other, DT);
  assert.equal(other.stunts, undefined);
});

test('tick fallback, zero ids, and no-player-no-pay', () => {
  const { sys, bus, state } = bootGrammar(0);
  sys.update(DT, state);
  state.tick = 1234;
  const seen = [];
  bus.on('stunt:trickDetected', (t) => seen.push(t));
  bus.emit('combat:hitstunImpulse', {
    actorId: 0, victimId: 'raider_wasp', weaponId: 'wpn_concussion_cannon_m', deltaV: 28,
  });
  bus.emit('combat:collisionConsequence', {
    targetId: 'raider_wasp', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 30, exchangedMomentum: 1200,
    targetHostile: true, damageApplied: true, targetKilled: true,
    hullDamage: 0, targetHullMax: 100,
    provenance: { actorId: 0 },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].tick, 1234);

  markCohort(state, 7);
  bus.emit('entity:killed', { id: 7, killerId: 0, weaponId: 'wpn_autocannon_m' });
  assert.equal(state.stunts.combo.gunKills, 1);

  const guest = bootGrammar('player');
  guest.sys.update(DT, guest.state);
  guest.bus.emit('entity:killed', { tick: 5, id: 0, killerId: 7, weaponId: 'wpn_autocannon_m' });
  assert.equal(guest.state.stunts.combo.gunKills, 0);
  guest.sys.destroy();

  const zeroVictim = bootGrammar(7);
  markCohort(zeroVictim.state, 0);
  zeroVictim.sys.update(DT, zeroVictim.state);
  zeroVictim.bus.emit('entity:killed', { tick: 5, id: 0, killerId: 7, weaponId: 'wpn_autocannon_m' });
  assert.equal(zeroVictim.state.stunts.combo.gunKills, 1);
  zeroVictim.sys.destroy();

  markCohort(state, 'vx');
  bus.emit('entity:killed', { tick: 6, id: 'vx', killerId: 999 });
  bus.emit('combat:kill', { tick: 7, targetId: 'vx', killerId: 0 });
  assert.equal(state.stunts.combo.gunKills, 1);

  const anonymous = bootGrammar(null);
  anonymous.sys.update(DT, anonymous.state);
  anonymous.bus.emit('entity:killed', { tick: 5, id: 9, killerId: 'player' });
  assert.equal(anonymous.state.stunts.combo.gunKills, 0);
  assert.equal(comboTotal(anonymous.state.stunts.combo), 0);
  anonymous.sys.destroy();
  sys.destroy();
});

test('double init does not double-subscribe; destroy twice is safe', () => {
  const bus = createBus();
  const state = {
    playerId: 'player', stunts: null, tick: 0, mode: 'flight',
    run: { kind: 'survival', phase: 'active' },
    entities: new Map(),
  };
  const sys = Object.create(stuntGrammar);
  sys.init({ bus, state });
  sys.init({ bus, state });

  markCohort(state, 'v1');
  bus.emit('entity:killed', { tick: 10, id: 'v1', killerId: 'player' });
  assert.equal(state.stunts.combo.gunKills, 1);
  assert.equal(state.stunts.combo.banked, GUN_KILL_SCORE);

  bus.emit('combat:hitstunImpulse', {
    tick: 18, actorId: 'player', victimId: 'raider_x', weaponId: 'wpn_autocannon_m', deltaV: 26,
  });
  bus.emit('combat:collisionConsequence', {
    tick: 20, targetId: 'raider_x', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 30, exchangedMomentum: 900,
    targetHostile: true, damageApplied: true, targetKilled: true,
    hullDamage: 0, targetHullMax: 80,
    provenance: { actorId: 'player' },
  });
  assert.equal(state.stunts.totalTricksDetected, 1);

  sys.destroy();
  sys.destroy();
});

test('save/new-game boundaries clear tricks, pay, detector history, and counted kills', () => {
  const { sys, bus, state } = bootGrammar('player');
  sys.update(DT, state);

  markCohort(state, 'pod');
  bus.emit('tether:attached', { tick: 5, sourceId: 'player', targetId: 'pod', isTow: true, relSpeed: 10 });
  bus.emit('combat:collisionConsequence', {
    tick: 8, targetId: 'pod', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 26, exchangedMomentum: 800,
    targetHostile: true, damageApplied: true, targetKilled: true,
    hullDamage: 0, targetHullMax: 60, provenance: { actorId: 'player' },
  });
  bus.emit('entity:killed', { tick: 10, id: 'pod', killerId: 'player', cause: 'ship_collision' });
  assert.equal(state.stunts.recentTricks.length, 1);
  assert.equal(state.stunts.pay.reputation, 0);
  assert.equal(state.stunts.pay.salvageRights, 0);
  assert.equal(sys._countedKills.size, 1);

  bus.emit('save:loaded', {});
  assert.equal(state.stunts.recentTricks.length, 0);
  assert.equal(state.stunts.totalTricksDetected, 0);
  assert.equal(state.stunts.pay.reputation, 0);
  assert.equal(state.stunts.pay.salvageRights, 0);
  assert.equal(sys._countedKills.size, 0);

  bus.emit('entity:killed', { tick: 20, id: 'pod', killerId: 'player' });
  assert.equal(state.stunts.recentTricks.length, 0);
  assert.equal(state.stunts.combo.gunKills, 1);

  markCohort(state, 'pod2');
  bus.emit('tether:attached', { tick: 30, sourceId: 'player', targetId: 'pod2', isTow: true, relSpeed: 10 });
  bus.emit('combat:collisionConsequence', {
    tick: 35, targetId: 'pod2', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 26, exchangedMomentum: 800,
    targetHostile: true, damageApplied: true, targetKilled: true,
    hullDamage: 0, targetHullMax: 60, provenance: { actorId: 'player' },
  });
  bus.emit('entity:killed', { tick: 40, id: 'pod2', killerId: 'player', cause: 'ship_collision' });
  assert.equal(state.stunts.recentTricks.length, 1);
  bus.emit('game:newGame', {});
  assert.equal(state.stunts.recentTricks.length, 0);
  assert.equal(state.stunts.pay.reputation, 0);
  assert.equal(sys._countedKills.size, 0);

  bus.emit('run:started', {});
  bus.emit('run:started', {});
  bus.emit('save:restoring', {});
  assert.equal(state.stunts.recentTricks.length, 0);
  sys.destroy();
});

test('recordTrickKill banks flat base, same as recordKill for any gun', () => {
  const combo = createComboState();
  const before = comboTotal(combo);
  assert.equal(recordTrickKill(combo), GUN_KILL_SCORE);
  assert.equal(comboTotal(combo) - before, GUN_KILL_SCORE);
  assert.equal(combo.trickKills, 1);
  assert.equal(recordKill(combo, { weaponId: 'wpn_pulse_laser_s' }), GUN_KILL_SCORE);
  assert.equal(recordKill(combo, { weaponId: 'wpn_concussion_cannon_m' }), GUN_KILL_SCORE);
  assert.equal(recordKill(combo, {}), GUN_KILL_SCORE);
});

test('one cohort death pays once across entity:killed + combat:kill aliases', () => {
  const harness = bootRun();
  beginSurvival(harness);
  harness.bus.emit('run:wavePlanned', { wave: 1, plan: { rewards: { credits: 10 } } });

  const victim = spawnCohort(harness);
  victim.alive = false;
  harness.bus.emit('entity:killed', { id: victim.id, killerId: harness.player.id, type: 'ship', pos: victim.pos });
  harness.bus.emit('combat:kill', { targetId: victim.id, killerId: harness.player.id });
  harness.bus.emit('entity:killed', { id: victim.id, killerId: harness.player.id, type: 'ship', pos: victim.pos });

  assert.equal(harness.state.run.xp, killXpFor(1));
  assert.equal(harness.state.run.score, killScoreFor(1));
  assert.equal(named(harness.emitted, 'loot:drop').length, 1);

  const other = spawnCohort(harness);
  killCohort(harness, other, { killerId: harness.player.id });
  assert.equal(harness.state.run.xp, killXpFor(1) * 2);
  assert.equal(harness.state.run.score, killScoreFor(1) * 2);
  assert.equal(named(harness.emitted, 'loot:drop').length, 2);

  harness.bus.emit('entity:spawned', { id: victim.id, type: 'ship' });
  harness.bus.emit('entity:killed', { id: victim.id, killerId: harness.player.id, type: 'ship', pos: victim.pos });
  assert.equal(harness.state.run.xp, killXpFor(1) * 2);
  assert.equal(named(harness.emitted, 'loot:drop').length, 2);

  victim.alive = true;
  harness.bus.emit('entity:spawned', { id: victim.id, type: 'ship', entity: victim });
  victim.alive = false;
  harness.bus.emit('entity:killed', { id: victim.id, killerId: harness.player.id, type: 'ship', pos: victim.pos });
  assert.equal(harness.state.run.xp, killXpFor(1) * 3);
  assert.equal(named(harness.emitted, 'loot:drop').length, 3);
});

test('fair base settlement: guns, causes, multipliers equal; unowned scores 0', () => {
  const harness = bootRun();
  beginSurvival(harness);
  harness.bus.emit('run:wavePlanned', { wave: 1, plan: { rewards: { credits: 10 } } });
  const base = killScoreFor(1);

  const pulse = spawnCohort(harness);
  killCohort(harness, pulse, { killerId: harness.player.id, weaponId: 'wpn_pulse_laser_s' });
  assert.equal(harness.state.run.score, base);

  const shove = spawnCohort(harness);
  killCohort(harness, shove, { killerId: harness.player.id, weaponId: 'wpn_concussion_cannon_m' });
  assert.equal(harness.state.run.score, base * 2);

  const terrain = spawnCohort(harness);
  killCohort(harness, terrain, {
    killerId: harness.player.id,
    presentation: { cause: 'terrain_collision' },
  });
  assert.equal(harness.state.run.score, base * 3);

  harness.state.run.style = { multiplier: 4, recentCauses: ['direct', 'explosive'] };
  const styled = spawnCohort(harness);
  killCohort(harness, styled, { killerId: harness.player.id, weaponId: 'wpn_autocannon_m' });
  assert.equal(harness.state.run.score, base * 4);

  const xpBefore = harness.state.run.xp;
  const dropsBefore = named(harness.emitted, 'loot:drop').length;

  const room = spawnCohort(harness);
  killCohort(harness, room, { killerId: 999, presentation: { cause: 'ship_collision' } });
  assert.equal(harness.state.run.score, base * 4);
  assert.equal(harness.state.run.xp, xpBefore + killXpFor(1));
  assert.equal(named(harness.emitted, 'loot:drop').length, dropsBefore + 1);

  const npcShoved = spawnCohort(harness);
  harness.bus.emit('combat:hitstunImpulse', {
    tick: 50, actorId: 999, victimId: npcShoved.id, weaponId: 'wpn_concussion_cannon_m', deltaV: 30,
  });
  killCohort(harness, npcShoved, { killerId: 999 });
  assert.equal(harness.state.run.score, base * 4);

  const playerShoved = spawnCohort(harness);
  harness.bus.emit('combat:hitstunImpulse', {
    tick: 60, actorId: harness.player.id, victimId: playerShoved.id,
    weaponId: 'wpn_concussion_cannon_m', deltaV: 25,
  });
  killCohort(harness, playerShoved, { killerId: 999 });
  assert.equal(harness.state.run.score, base * 4);

  const collisionTagged = spawnCohort(harness);
  harness.bus.emit('combat:hitstunImpulse', {
    tick: 70, actorId: harness.player.id, victimId: collisionTagged.id,
    source: 'collision', deltaV: 25,
  });
  killCohort(harness, collisionTagged, { killerId: 999 });
  assert.equal(harness.state.run.score, base * 4);

  const flagged = spawnCohort(harness);
  killCohort(harness, flagged, { killerId: 999, presentation: { cause: 'kinetic', playerCaused: true } });
  assert.equal(harness.state.run.score, base * 4);

  const conflicting = spawnCohort(harness);
  killCohort(harness, conflicting, { killerId: 999, provenance: { actorId: harness.player.id } });
  assert.equal(harness.state.run.score, base * 4);
});

test('trick pay emits zero faction:repDelta / stunt:salvageRights in Survival and Adventure', () => {
  const harness = bootRun();
  beginSurvival(harness);
  harness.state.entities.set('pod_s', {
    id: 'pod_s', alive: true, type: 'debris', pos: { x: 5, z: 0 },
    data: { runCohort: 'survival' },
  });
  harness.bus.emit('tether:attached', {
    tick: 90, sourceId: harness.player.id, targetId: 'pod_s', isTow: true, relSpeed: 10,
  });
  harness.bus.emit('combat:collisionConsequence', {
    tick: 95, targetId: 'pod_s', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 26, exchangedMomentum: 800,
    targetHostile: true, damageApplied: true, targetKilled: true,
    hullDamage: 0, targetHullMax: 60, provenance: { actorId: harness.player.id },
  });
  harness.bus.emit('entity:killed', {
    tick: 100, id: 'pod_s', killerId: harness.player.id, cause: 'ship_collision',
  });
  assert.equal(named(harness.emitted, 'stunt:trickDetected').length, 1);
  assert.equal(named(harness.emitted, 'faction:repDelta').length, 0);
  assert.equal(named(harness.emitted, 'stunt:salvageRights').length, 0);
  assert.ok(harness.state.run.score > 0);
  assert.equal(harness.state.stunts.pay.reputation, 0);
  assert.equal(harness.state.stunts.pay.salvageRights, 0);

  const adventure = bootRun();
  adventure.state.entities.set('pod_a', { id: 'pod_a', alive: true, type: 'debris', pos: { x: 5, z: 0 } });
  adventure.bus.emit('tether:attached', {
    tick: 10, sourceId: adventure.player.id, targetId: 'pod_a', isTow: true, relSpeed: 10,
  });
  adventure.bus.emit('combat:collisionConsequence', {
    tick: 15, targetId: 'pod_a', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 26, exchangedMomentum: 800,
    targetHostile: true, damageApplied: true, targetKilled: true,
    hullDamage: 0, targetHullMax: 60, provenance: { actorId: adventure.player.id },
  });
  adventure.bus.emit('entity:killed', {
    tick: 20, id: 'pod_a', killerId: adventure.player.id, cause: 'ship_collision',
  });
  assert.equal(named(adventure.emitted, 'stunt:trickDetected').length, 1);
  assert.equal(named(adventure.emitted, 'faction:repDelta').length, 0);
  assert.equal(named(adventure.emitted, 'stunt:salvageRights').length, 0);
  assert.equal(adventure.state.stunts.recentTricks.length, 1);
});
