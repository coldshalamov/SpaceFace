// INFERENCE swarm-as-toybox U1 — trick kills count as trick kills.
//
// The run's kill counters feed the results plate ("Trick kills", "Best chain …
// physics paid, guns never multiply"). recordTrickKill had no callers and the
// kill branch never set trickKill, so every thrown/slammed kill was miscounted
// as a gun kill and the physics-paid line could never fire. A detected trick
// now reclassifies its dead victims' kills, in either event order.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  attributeTrickKill,
  comboKills,
  createComboState,
  recordKill,
} from '../src/systems/stuntCombo.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { comboLead, comboRows } from '../src/ui/screens/crucible.js';
import { comboSummary } from '../src/systems/stuntCombo.js';

const GUN = 'wpn_autocannon_m';
const PULSE = 'wpn_pulse_laser_s';

test('a gun kill reclassified by its trick counts once, as a trick kill', () => {
  const combo = createComboState();
  const paid = recordKill(combo, { lifeId: 'life-1', threatClass: 'fodder', playerOwned: true, weaponId: GUN });
  assert.equal(paid, 100, 'flat threat base untouched');
  assert.equal(combo.gunKills, 1);
  assert.equal(combo.trickKills, 0);
  assert.equal(attributeTrickKill(combo, 'life-1'), true);
  assert.equal(combo.gunKills, 0);
  assert.equal(combo.trickKills, 1);
  assert.equal(comboKills(combo), 1, 'reclassification moves the kill, never duplicates it');
  assert.equal(combo.banked, 100, 'pay is unchanged; only the counter moves');
  assert.equal(attributeTrickKill(combo, 'life-1'), false, 'second attribution is a no-op');
  assert.equal(comboKills(combo), 1);
});

test('pulse kills flip the same way; unknown and legacy lives are left alone', () => {
  const combo = createComboState();
  recordKill(combo, { lifeId: 'life-p', threatClass: 'fodder', playerOwned: true, weaponId: PULSE });
  assert.equal(attributeTrickKill(combo, 'life-p'), true);
  assert.equal(combo.pulseKills, 0);
  assert.equal(combo.trickKills, 1);
  assert.equal(attributeTrickKill(combo, 'no-such-life'), true, 'unseen life parks as pending');
  assert.equal(comboKills(combo), 1, 'pending attribution counts nothing yet');
  const legacy = createComboState();
  legacy.settledDeaths['old-life'] = true;
  assert.equal(attributeTrickKill(legacy, 'old-life'), false, 'legacy boolean carries no counter to move');
  assert.equal(comboKills(legacy), 0);
});

test('trick-before-kill order still lands as a trick kill', () => {
  const combo = createComboState();
  assert.equal(attributeTrickKill(combo, 'life-early'), true);
  recordKill(combo, { lifeId: 'life-early', threatClass: 'fodder', playerOwned: true, weaponId: GUN });
  assert.equal(combo.trickKills, 1);
  assert.equal(combo.gunKills, 0);
  assert.equal(comboKills(combo), 1);
});

function detectorShapedTrick(over = {}) {
  return {
    schemaVersion: 2,
    actorId: 7,
    trickId: 'wrecking_ball',
    name: 'Wrecking Ball',
    rarity: 'uncommon',
    family: 'tether',
    episodeId: 'ep-u1',
    tick: 600,
    rootTick: 590,
    modifiers: {},
    victimLives: [{ lifeId: 'victim-life', threatClass: 'fodder', dead: true }],
    metrics: { payloadMass: 20, playerDryHullMass: 20, usefulDeltaV: 0, referenceCruise: 100 },
    ...over,
  };
}

function bootGrammar() {
  const state = createGameState(4242);
  const bus = createBus();
  state.playerId = 7;
  state.run = { kind: 'survival', phase: 'active', ruleset: 'swarm', seed: 4242, wave: 1 };
  state.tick = 600;
  stuntGrammar.init({ state, bus });
  return { state, bus };
}

test('a detected trick reclassifies its dead victims through the live grammar', () => {
  const { state, bus } = bootGrammar();
  try {
    const victim = {
      id: 101, alive: true, type: 'ship',
      pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 },
      data: { runCohort: 'survival', runWave: 1, threatClass: 'fodder' },
    };
    state.entities.set(victim.id, victim);
    victim.alive = false;
    bus.emit('entity:killed', { id: victim.id, killerId: 7, tick: 600, weaponId: GUN });
    const combo = state.stunts.combo;
    assert.equal(combo.gunKills, 1);
    assert.equal(combo.trickKills, 0);
    const deathIds = Object.keys(combo.settledDeaths);
    assert.equal(deathIds.length, 1);
    stuntGrammar.detector = {
      setPlayerId() {},
      incidents: new Map(),
      processEvent: () => [detectorShapedTrick({
        victimLives: [{ lifeId: deathIds[0], threatClass: 'fodder', dead: true }],
      })],
    };
    bus.emit('combat:collisionConsequence', { tick: 600 });
    assert.equal(combo.gunKills, 0);
    assert.equal(combo.trickKills, 1);
    assert.equal(comboKills(combo), 1);
  } finally {
    stuntGrammar.destroy();
  }
});

test('a trick witness that is still alive reclassifies nothing', () => {
  const { state, bus } = bootGrammar();
  try {
    const victim = {
      id: 102, alive: true, type: 'ship',
      pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 },
      data: { runCohort: 'survival', runWave: 1, threatClass: 'fodder' },
    };
    state.entities.set(victim.id, victim);
    victim.alive = false;
    bus.emit('entity:killed', { id: victim.id, killerId: 7, tick: 600, weaponId: GUN });
    const combo = state.stunts.combo;
    const deathIds = Object.keys(combo.settledDeaths);
    stuntGrammar.detector = {
      setPlayerId() {},
      incidents: new Map(),
      processEvent: () => [detectorShapedTrick({
        victimLives: [{ lifeId: deathIds[0], threatClass: 'fodder', dead: false }],
      })],
    };
    bus.emit('combat:collisionConsequence', { tick: 600 });
    assert.equal(combo.gunKills, 1);
    assert.equal(combo.trickKills, 0);
  } finally {
    stuntGrammar.destroy();
  }
});

test('the results plate can finally say physics paid', () => {
  const combo = createComboState();
  recordKill(combo, { lifeId: 'life-r', threatClass: 'fodder', playerOwned: true, weaponId: GUN });
  attributeTrickKill(combo, 'life-r');
  combo.bestChain = 2;
  combo.bestChainPoints = 180;
  const summary = comboSummary(combo);
  assert.match(comboLead(summary, 'swarm'), /physics paid/);
  const rows = comboRows(summary);
  assert.ok(rows.some((row) => row[0] === 'Trick kills' && row[1] === '1'));
});
