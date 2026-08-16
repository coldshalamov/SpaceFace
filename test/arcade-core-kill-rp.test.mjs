import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  killResearchPointsForVictim,
} from '../src/data/killRewards.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { combat } from '../src/systems/combat.js';
import { lootShards } from '../src/systems/lootShards.js';
import { missions } from '../src/systems/missions.js';

function withLootFlags(fn) {
  const prior = { enabled: MASSLINE2_FLAGS.enabled, lootShards: MASSLINE2_FLAGS.lootShards };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  try { return fn(); }
  finally {
    MASSLINE2_FLAGS.enabled = prior.enabled;
    MASSLINE2_FLAGS.lootShards = prior.lootShards;
  }
}

function bootKill({
  hostile = true,
  playerKill = true,
  missionTarget = false,
  shipClass = 'fighter',
  namedAceId = null,
} = {}) {
  const sim = createSimulation({ seed: 0xac03, systems: [missions, lootShards, combat] });
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, data: { defId: 'ship_kestrel', fittings: [] },
  });
  state.playerId = player.id;
  state.player.researchPoints = 0;
  const target = sim.spawn({
    type: 'ship', team: hostile ? 1 : 2, factionId: 'faction_reach',
    pos: { x: 40, z: 0 }, hull: 20, hullMax: 20,
    data: {
      shipClass,
      encounter: hostile,
      worldRecordId: `ac03-${shipClass}`,
      ...(namedAceId ? { namedAceId } : {}),
      ...(missionTarget ? { missionId: 'reserved', missionPinned: true } : {}),
    },
  });
  const changed = [];
  bus.on('research:pointsChanged', (payload) => changed.push(structuredClone(payload)));
  const killer = playerKill ? player : sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 20, z: 0 },
    hull: 20, hullMax: 20, data: { encounter: true },
  });
  withLootFlags(() => registry.get('combat').kill(target, killer.id));
  return { sim, state, bus, registry, target, changed };
}

test('hostile-kill RP is victim-scaled in the existing progression currency', () => {
  assert.equal(killResearchPointsForVictim({ data: { shipClass: 'fighter' } }), 1);
  assert.equal(killResearchPointsForVictim({ data: { shipClass: 'brawler' } }), 2);
  assert.equal(killResearchPointsForVictim({ data: { shipClass: 'gunship' } }), 3);
  assert.equal(killResearchPointsForVictim({
    data: { shipClass: 'fighter', namedAceId: 'ace_yara_no_cut' },
  }), 5);
});

test('qualifying hostile kill grants once through missions and survives save-shaped dedupe', () => {
  const run = bootKill({ shipClass: 'gunship' });
  assert.equal(run.state.player.researchPoints, 3);
  assert.equal(run.state.player.xp, undefined);
  assert.equal(run.changed.length, 1);
  assert.equal(run.changed[0].source, 'hostile_kill');
  assert.equal(run.changed[0].granted, 3);
  assert.match(run.changed[0].receiptId, /^hostile-kill-rp:/);

  run.bus.emit('research:grant', {
    amount: 3,
    source: 'hostile_kill',
    receiptId: run.changed[0].receiptId,
  });
  assert.equal(run.state.player.researchPoints, 3, 'duplicate receipt cannot pay twice');
  assert.equal(run.changed.length, 1);

  const saved = run.registry.get('missions').serialize();
  assert.deepEqual(saved.researchGrantReceipts, [run.changed[0].receiptId]);
  run.registry.get('missions').deserialize(saved);
  run.bus.emit('research:grant', {
    amount: 3,
    source: 'hostile_kill',
    receiptId: run.changed[0].receiptId,
  });
  assert.equal(run.state.player.researchPoints, 3, 'restored receipt remains authoritative');
  run.sim.dispose();
});

test('mission-owned, civilian, and non-player kills remain fail-closed', () => {
  for (const options of [
    { missionTarget: true },
    { hostile: false },
    { playerKill: false },
  ]) {
    const run = bootKill(options);
    assert.equal(run.state.player.researchPoints, 0);
    assert.equal(run.changed.length, 0);
    run.sim.dispose();
  }
});

test('missions writer rejects malformed intents and preserves existing grant amounts', () => {
  const sim = createSimulation({ seed: 7, systems: [missions] });
  const { state, bus, registry } = sim;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel', fittings: ['mod_sensor_array_l'] },
  });
  state.playerId = player.id;
  state.player.researchPoints = 0;
  const system = registry.get('missions');

  for (const payload of [
    null,
    {},
    { amount: 0, source: 'hostile_kill', receiptId: 'bad:zero' },
    { amount: -2, source: 'hostile_kill', receiptId: 'bad:negative' },
    { amount: 2, source: '', receiptId: 'bad:source' },
    { amount: 2, source: 'hostile_kill' },
  ]) bus.emit('research:grant', payload);
  assert.equal(state.player.researchPoints, 0);

  assert.equal(system._grantFittedScanRpBonus({ found: { asteroids: 1 } }), 2);
  assert.equal(state.player.researchPoints, 2, 'productive fitted scan keeps its existing +2');
  assert.equal(system._grantResearchPoints(3, {
    source: 'mission_recon_scan', receiptId: 'mission-rp:recon-fixture',
  }), 3);
  assert.equal(state.player.researchPoints, 5, 'mission-sized grant remains exact');
  sim.dispose();
});
