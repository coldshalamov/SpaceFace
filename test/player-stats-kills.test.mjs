// INFERENCE-30 (career tally): player.stats.kills shipped authored readers — the death screen's
// career recap, the Life Ledger's evidence basis, and the finale's "The combat tally records N
// kills" line — and no writer ever incremented it. combat.kill() now tallies player-dealt kills
// under the same adjudication as the telemetry sink.
import assert from 'node:assert/strict';
import test from 'node:test';

import { combat } from '../src/systems/combat.js';

function vec(x, z) {
  return {
    x, y: 0, z,
    copy(other) { this.x = other.x; this.y = other.y || 0; this.z = other.z; return this; },
  };
}

function makePlayer() {
  return {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: vec(0, 0), prevPos: vec(0, 0), vel: vec(0, 0), rot: 0, flags: {},
    data: { defId: 'ship_kestrel' },
    hull: 100, hullMax: 140, armorHp: 0, armorMax: 30, shield: 40, shieldMax: 55, cap: 80, capMax: 80,
  };
}

function makeVictim(id, data = {}) {
  return {
    id, type: 'ship', alive: true, team: 1, factionId: 'faction_reach',
    pos: vec(0, 80), vel: vec(0, 0),
    data: { defId: 'ship_drifter', shipClass: 'gunship', ...data },
    hull: 0, hullMax: 60, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
  };
}

function makeState({ kills = 0, dropStats = false } = {}) {
  const player = makePlayer();
  const bag = {
    tick: 300, simTime: 5, playerId: 1, meta: { seed: 47 },
    settings: { gameplay: { difficulty: 'standard' } },
    content: {},
    player: {
      credits: 5000,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 100 },
      stats: { kills },
    },
    story: { persistentCargo: [] },
    entities: new Map([[1, player]]),
    entityList: [player],
    combat: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: { stations: [] },
    },
  };
  if (dropStats) delete bag.player.stats;
  return bag;
}

function boot(state) {
  const events = [];
  const listeners = new Map();
  const bus = {
    events,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) {
      events.push({ event, payload });
      for (const fn of listeners.get(event) || []) fn(payload);
    },
  };
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return bus;
}

test('a player-dealt kill increments the career tally once', () => {
  const state = makeState();
  const victim = makeVictim(9);
  state.entities.set(9, victim);
  boot(state);
  combat.kill(victim, 1, { killerId: 1 });
  assert.equal(state.player.stats.kills, 1);
  const second = makeVictim(10);
  combat.kill(second, 1, { killerId: 1 });
  assert.equal(state.player.stats.kills, 2);
});

test('NPC attrition is not the player\u2019s tally — other killers leave the counter alone', () => {
  const state = makeState();
  const victim = makeVictim(9);
  boot(state);
  combat.kill(victim, 44, { killerId: 44 });
  assert.equal(state.player.stats.kills, 0);
});

test('a Survival wave body pays the run wallet, not the career tally', () => {
  const state = makeState();
  const victim = makeVictim(9, { runCohort: 'survival' });
  boot(state);
  combat.kill(victim, 1, { killerId: 1 });
  assert.equal(state.player.stats.kills, 0);
});

test('a mission-owned kill still counts — missions own the reward, not the fact', () => {
  const state = makeState();
  const victim = makeVictim(9, { missionId: 'm_contract_1' });
  boot(state);
  combat.kill(victim, 1, { killerId: 1 });
  assert.equal(state.player.stats.kills, 1);
});

test('a stats-bag-less player gets one created on first kill', () => {
  const state = makeState({ dropStats: true });
  const victim = makeVictim(9);
  boot(state);
  combat.kill(victim, 1, { killerId: 1 });
  assert.equal(state.player.stats.kills, 1);
});

test('a dead body cannot be tallied twice', () => {
  const state = makeState();
  const victim = makeVictim(9);
  boot(state);
  combat.kill(victim, 1, { killerId: 1 });
  combat.kill(victim, 1, { killerId: 1 });
  assert.equal(state.player.stats.kills, 1);
});

test('the player\u2019s own death never self-tallies', () => {
  const state = makeState();
  boot(state);
  const player = state.entities.get(1);
  player.hull = 0;
  combat.kill(player, 9, { killerId: 9 });
  assert.equal(state.player.stats.kills, 0);
});
