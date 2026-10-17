// SFQ-B058 — Show why the run ended: a Crucible death to a thrown mass, a Massline
// whip, or a collision slam names the physical impact or thrown object instead of
// printing "unidentified weapon". Seed 4242, focused module-level check.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  buildDefeatReceipt,
  weaponIdFromDamage,
} from '../src/combat/playerDefeat.js';
import { deathCauseText, survivalResults } from '../src/systems/survivalResults.js';

const DT = 1 / 60;
const ARENA = 'helios_core';

function boot(seed = 4242) {
  const state = createGameState(seed);
  state.tick = 300;
  state.simTime = 5;
  const player = {
    id: 1, alive: true, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 0, hullMax: 140, armorHp: 0, armorMax: 30, shield: 0, shieldMax: 55,
    data: { defId: 'ship_kestrel' },
  };
  const enemy = {
    id: 9, alive: true, type: 'ship', team: 1,
    pos: { x: 0, z: 80 }, vel: { x: 0, z: 0 },
    data: { defId: 'ship_drifter', lootTableId: 'reaver_pirate', shipClass: 'gunship' },
  };
  state.entities.set(player.id, player);
  state.entities.set(enemy.id, enemy);
  state.entityList.push(player, enemy);
  state.playerId = player.id;
  state.nextEntityId = 10;
  if (!state.player) state.player = {};
  state.player.credits = 5000;
  state.player.insurance = { rate: 0.6, deductibleCr: 500, insuredModules: false };
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: ['wpn_pulse_laser_s'] }];
  state.player.activeShipIndex = 0;
  state.player.cargo = { items: {} };
  state.world = state.world || {};
  state.world.currentSectorId = state.world.currentSectorId || 'sector_helios_prime';
  return { state, player };
}

function beginSurvivalRun(harness, seed = 4242) {
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit: (event, payload) => raw.emit(event, payload),
  };
  const ctx = { state: harness.state, bus, helpers: {} };
  runSession.init(ctx);
  survivalResults.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed, arenaId: ARENA });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
  harness.state.run.wave = 1;
  return { bus, ctx };
}

function defeatOf(harness, lethal, killerId = 9) {
  const receipt = buildDefeatReceipt(harness.state, harness.player, killerId, lethal);
  harness.state.simTime += DT;
  harness.state.tick += 1;
  return receipt;
}

// --- weaponIdFromDamage physical fallback -------------------------------------

test('SFQ-B058: weaponIdFromDamage resolves a massline whip packet to a physical label', () => {
  const resolved = weaponIdFromDamage({
    origin: { kind: 'massline_whip', massId: 12 },
    packet: { source: { kind: 'massline_whip', massId: 12 } },
  });
  assert.equal(resolved, 'thrown mass');
});

test('SFQ-B058: weaponIdFromDamage resolves a terrain collision packet to a physical label', () => {
  const resolved = weaponIdFromDamage({
    origin: { kind: 'collision', id: 'terrain' },
    packet: {
      source: {
        kind: 'collision_terrain',
        collisionPresentation: { impactLink: { actorId: 9, tag: 'terrain_collision' } },
      },
    },
  });
  assert.equal(resolved, 'arena impact');
});

// --- positive: whip death names thrown mass -----------------------------------

test('SFQ-B058: a fatal Massline whip names thrown mass, never unidentified weapon', () => {
  const harness = boot(4242);
  const receipt = defeatOf(harness, {
    origin: { kind: 'massline_whip', massId: 12 },
    packet: {
      source: { kind: 'massline_whip', massId: 12 },
      hit: { pos: { x: 0, z: 10 } },
    },
    dominantLayer: 'hull',
    result: { after: { shield: 0, shieldMax: 55, armor: 0, armorMax: 30, hull: 0, hullMax: 140 } },
  });
  const text = JSON.stringify(receipt);
  assert.match(text, /thrown mass/i);
  assert.doesNotMatch(text, /unidentified weapon/i);
  assert.match(String(receipt.fatalSummary), /thrown mass/i);
  const chain = JSON.stringify(receipt);
  void chain;
  survivalResults.destroy();
});

// --- positive: terrain slam names arena impact ---------------------------------

test('SFQ-B058: a fatal terrain slam names the arena impact, never unidentified weapon', () => {
  const harness = boot(4242);
  const receipt = defeatOf(harness, {
    origin: { kind: 'collision', id: 'terrain' },
    packet: {
      source: {
        kind: 'collision_terrain',
        impulseProvenance: 'massline_throw',
        collisionPresentation: { impactLink: { actorId: 9, tag: 'massline_throw' } },
      },
      hit: { pos: { x: 1, z: 2 } },
    },
    dominantLayer: 'hull',
    result: { after: { shield: 0, shieldMax: 55, armor: 0, armorMax: 30, hull: 0, hullMax: 140 } },
  });
  const text = JSON.stringify(receipt);
  assert.match(text, /thrown mass|arena impact/i);
  assert.doesNotMatch(text, /unidentified weapon/i);
  const cause = deathCauseText(receipt, []);
  assert.match(cause, /thrown mass|arena impact/i);
  assert.doesNotMatch(cause, /unidentified weapon/i);
  survivalResults.destroy();
});

// --- positive: survival results deathCause names the physical cause -------------

test('SFQ-B058: buildSurvivalResults deathCause names the physical cause', () => {
  const harness = boot(4242);
  const { bus, ctx } = beginSurvivalRun(harness, 4242);
  const receipt = defeatOf(harness, {
    origin: { kind: 'massline_whip', massId: 12 },
    packet: {
      source: { kind: 'massline_whip', massId: 12 },
      hit: { pos: { x: 0, z: 10 } },
    },
    dominantLayer: 'hull',
    result: { after: { shield: 0, shieldMax: 55, armor: 0, armorMax: 30, hull: 0, hullMax: 140 } },
  });
  try {
    bus.emit('player:death', receipt);
    const result = survivalResults.lastResult();
    assert.ok(result, 'a defeat publishes a result');
    assert.equal(result.outcome, 'defeat');
    const killed = JSON.stringify(result.defeat) + JSON.stringify(result.death);
    assert.match(killed, /thrown mass|arena impact/i);
    assert.doesNotMatch(killed, /unidentified weapon/i);
    // Idempotence: buildSurvivalResults is pure over state.run — reading twice
    // returns an equal plate rather than accumulating rows.
    const again = survivalResults.lastResult();
    assert.deepEqual(again, result);
  } finally {
    survivalResults.destroy();
    runSession.destroy();
    void ctx;
  }
});

// --- negative/quiet: a real gun keeps its name ----------------------------------

test('SFQ-B058: a fatal Pulse Laser S hit still names Pulse Laser S', () => {
  const harness = boot(4242);
  const receipt = defeatOf(harness, {
    weaponId: 'wpn_pulse_laser_s',
    origin: { kind: 'weapon', id: 'wpn_pulse_laser_s' },
    packet: {
      source: { kind: 'weapon', weaponId: 'wpn_pulse_laser_s' },
      hit: { pos: { x: 0, z: 10 } },
    },
    dominantLayer: 'hull',
    result: { after: { shield: 0, shieldMax: 55, armor: 0, armorMax: 30, hull: 0, hullMax: 140 } },
  });
  assert.match(String(receipt.weapon), /Pulse Laser S/);
  assert.match(String(receipt.fatalSummary), /Pulse Laser S/);
  assert.doesNotMatch(String(receipt.fatalSummary), /unidentified weapon/i);
  survivalResults.destroy();
});
