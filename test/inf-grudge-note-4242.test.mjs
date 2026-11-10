/**
 * A berth that refuses a dock-slam note names the credits still owed.
 * Seed 4242. The number is the live note (debt above the floor the slams started from),
 * read back from the dock refusal, the berth refusal, and the dock-control line.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { economy, DOCK_SLAM_LAW, stationConditionLine } from '../src/systems/economy.js';
import { stationGrudgeRefusal } from '../src/economy/stationConditions.js';
import { stationBerthAdmits, stationBerthRefusal } from '../src/data/frontierRumors.js';
import { resolveDockDeny } from '../src/core/dockAccess.js';

const CERES = 'station_ceres';
const HELIOS = 'station_helios';

function harness() {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.simTime = 120;
  state.tick = 7200;
  state.playerId = 1;
  state.world.currentSectorId = 'sector_ceres_belt';
  for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, hull: 100, hullMax: 100, data: {},
  };
  const ceres = {
    id: 900, type: 'station', alive: true, pos: { x: 200, z: 0 },
    data: { stationId: CERES, name: 'Ceres Refinery' },
  };
  state.entities = new Map([[1, player], [900, ceres]]);
  state.entityList = [player, ceres];
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit: raw.emit.bind(raw),
  };
  economy.init({ state, bus, helpers: {}, registry: { get(name) { return name === 'economy' ? economy : null; } } });
  economy.newGame();
  return { state, bus };
}

function slamThree(state, bus) {
  const payload = {
    targetId: 77, otherId: 900,
    surface: 'structure', targetType: 'drone', otherType: 'station',
    exchangedMomentum: 900, deltaV: 40, feelDeltaV: 75, control: 0.2,
    impactDamage: 30, hullDamage: 30, targetMass: 12, otherMass: 1e6, targetKilled: true,
    provenance: { actorId: 1, weaponId: 'wpn_tractor', tag: 'tether_sling' },
    tick: 7200,
  };
  for (let i = 0; i < 3; i++) {
    state.simTime += DOCK_SLAM_LAW.relatchS + 1;
    bus.emit('combat:collisionConsequence', payload);
  }
}

function stationRecord(id) {
  return SECTORS.flatMap((s) => s.stations || []).find((st) => st.id === id);
}

test('a refused Ceres berth names the 450 cr the three slams put on the note (seed 4242)', () => {
  const { state, bus } = harness();
  slamThree(state, bus);
  assert.equal(state.player.debt, 450);
  const sentence = 'Dock control: pay the 450 cr on your note before you come through our ring again';
  assert.equal(stationGrudgeRefusal(state, CERES), sentence);
  assert.equal(resolveDockDeny(state, CERES).text, sentence);
  assert.equal(stationBerthRefusal(stationRecord(CERES), 0, state).text, sentence);
  assert.match(stationConditionLine(state, CERES), /Pay the 450 cr on your note before you come through our ring again\./);
  assert.equal(resolveDockDeny(state, HELIOS), null);
  assert.equal(stationBerthAdmits(stationRecord(HELIOS), 0, state), true);
});

test('a later slam changes the refusal to the new note (seed 4242)', () => {
  const { state, bus } = harness();
  slamThree(state, bus);
  state.simTime += DOCK_SLAM_LAW.relatchS + 1;
  bus.emit('combat:collisionConsequence', {
    targetId: 77, otherId: 900,
    surface: 'structure', targetType: 'drone', otherType: 'station',
    exchangedMomentum: 900, deltaV: 40, feelDeltaV: 75, control: 0.2,
    impactDamage: 30, hullDamage: 30, targetMass: 12, otherMass: 1e6, targetKilled: true,
    provenance: { actorId: 1, weaponId: 'wpn_tractor', tag: 'tether_sling' },
    tick: 7200,
  });
  assert.equal(state.player.debt, 600);
  const sentence = 'Dock control: pay the 600 cr on your note before you come through our ring again';
  assert.equal(stationGrudgeRefusal(state, CERES), sentence);
  assert.equal(resolveDockDeny(state, CERES).text, sentence);
  assert.doesNotMatch(sentence, /450/);
});

test('an older note is named as the slam fines only, and a part payment changes the sentence (seed 4242)', () => {
  const { state, bus } = harness();
  state.player.debt = 1000;
  slamThree(state, bus);
  assert.equal(state.player.debt, 1450);
  const full = 'Dock control: pay the 450 cr on your note before you come through our ring again';
  assert.equal(stationGrudgeRefusal(state, CERES), full);
  assert.equal(resolveDockDeny(state, CERES).text, full);
  bus.emit('economy:releaseDebt', { amount: 449 });
  assert.equal(state.player.debt, 1001);
  const one = 'Dock control: pay the 1 cr on your note before you come through our ring again';
  assert.equal(stationGrudgeRefusal(state, CERES), one);
  assert.equal(stationBerthAdmits(stationRecord(CERES), 0, state), false);
  bus.emit('economy:releaseDebt', { amount: 1 });
  assert.equal(stationGrudgeRefusal(state, CERES), null);
  assert.equal(resolveDockDeny(state, CERES), null);
  assert.equal(stationBerthAdmits(stationRecord(CERES), 0, state), true);
});
