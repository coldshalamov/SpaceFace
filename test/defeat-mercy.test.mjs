// defeat-mercy — the adaptive-difficulty lever: a rolling defeat streak eases incoming player
// damage ~18% on the softened profiles, decays after a clean interval, and stays off the
// advertised hard modes. Silent in play, auditable on every after-action receipt.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFEAT_STREAK_MERCY_SCALE,
  DEFEAT_STREAK_WINDOW_S,
  defeatMercyScale,
  difficultyDamageScale,
  difficultyProfile,
} from '../src/data/difficulty.js';
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
    pos: vec(0, 0), prevPos: vec(0, 0), vel: vec(12, -4), rot: 0, flags: {},
    data: { defId: 'ship_kestrel' },
    hull: 0, hullMax: 140, armorHp: 0, armorMax: 30, shield: 0, shieldMax: 55, cap: 0, capMax: 80,
  };
}

function makeState({ difficulty = 'standard', simTime = 5 } = {}) {
  const player = makePlayer();
  const attacker = {
    id: 9, type: 'ship', alive: true, team: 1, factionId: 'faction_reach',
    pos: vec(0, 80), data: { defId: 'ship_drifter', lootTableId: 'reaver_pirate', shipClass: 'gunship' },
  };
  return {
    tick: 300, simTime, playerId: 1, meta: { seed: 47 },
    settings: { gameplay: { difficulty } },
    content: {},
    player: {
      credits: 5000,
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' },
      ownedShips: [{ defId: 'ship_kestrel', fittings: ['wpn_pulse_laser_s'] }],
      activeShipIndex: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 100 },
    },
    story: { persistentCargo: [] },
    entities: new Map([[1, player], [9, attacker]]),
    entityList: [player, attacker],
    combat: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: { stations: [{ stationId: 'station_helios', pos: { x: 320, z: -80 } }] },
    },
  };
}

function makeBus() {
  const listeners = new Map();
  const events = [];
  return {
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
}

function boot(state) {
  const bus = makeBus();
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return bus;
}

const LETHAL = {
  origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
  packet: { source: { weaponId: 'wpn_autocannon_s' } },
  result: { dominantLayer: 'hull' },
};

function defeat(state) {
  const player = state.entities.get(1);
  // Stand the player back up as recovery would; a new defeat after the last berth.
  combat._pendingPlayerRecovery = null;
  player.alive = true;
  if (player.flags) player.flags.defeated = false;
  combat.kill(player, 9, LETHAL);
}

test('a single defeat records the streak but keeps the baseline; the second eases incoming', () => {
  const state = makeState({ simTime: 100 });
  boot(state);

  assert.equal(difficultyDamageScale(state, 9, 1), 0.5, 'no streak, standard baseline');

  defeat(state);
  const receipt = state.combat.lastPlayerDefeat;
  assert.equal(state.player.defeatStreak.count, 1);
  assert.equal(state.player.defeatStreak.lastDefeatSimTime, 100);
  assert.equal(receipt.defeatStreak, 1);
  assert.equal(receipt.defeatMercyScale, null, 'first defeat leaves the profile untouched');
  assert.equal(difficultyDamageScale(state, 9, 1), 0.5);

  state.simTime = 200;
  defeat(state);
  const receipt2 = state.combat.lastPlayerDefeat;
  assert.equal(state.player.defeatStreak.count, 2);
  assert.equal(receipt2.defeatStreak, 2);
  assert.equal(receipt2.defeatMercyScale, DEFEAT_STREAK_MERCY_SCALE,
    'the receipt audits the floor now in force');
  assert.equal(difficultyDamageScale(state, 9, 1), 0.5 * DEFEAT_STREAK_MERCY_SCALE);
  assert.equal(difficultyDamageScale(state, 1, 9), 1.15,
    'outgoing damage is untouched — mercy never hands the player extra power');
  assert.equal(difficultyDamageScale(state, 9, 8), 1, 'NPC-vs-NPC is never scaled');
});

test('the streak resets when defeats are spread past the window, and decays after a clean interval', () => {
  const state = makeState({ simTime: 100 });
  boot(state);
  defeat(state);
  state.simTime = 100 + DEFEAT_STREAK_WINDOW_S + 60; // one defeat, long ago
  defeat(state);
  assert.equal(state.player.defeatStreak.count, 1, 'a defeat after the window restarts the count');
  assert.equal(difficultyDamageScale(state, 9, 1), 0.5);

  state.simTime += 60;
  defeat(state); // count 2 → mercy hot
  assert.equal(difficultyDamageScale(state, 9, 1), 0.5 * DEFEAT_STREAK_MERCY_SCALE);

  state.simTime += DEFEAT_STREAK_WINDOW_S + 1; // clean interval passes
  assert.equal(difficultyDamageScale(state, 9, 1), 0.5,
    'no reset event needed — a clean window decays the floor back to baseline');
});

test('casual eases from its own softer baseline', () => {
  const state = makeState({ difficulty: 'casual', simTime: 10 });
  state.player.defeatStreak = { count: 3, lastDefeatSimTime: 9 };
  assert.equal(difficultyDamageScale(state, 9, 1), 0.40 * DEFEAT_STREAK_MERCY_SCALE);
});

test('veteran and ironman stay on the unsoftened baseline no matter the streak', () => {
  for (const difficulty of ['veteran', 'ironman']) {
    const state = makeState({ difficulty, simTime: 10 });
    state.player.defeatStreak = { count: 9, lastDefeatSimTime: 9 };
    assert.equal(difficultyDamageScale(state, 9, 1), 1.0, difficulty);
    assert.equal(defeatMercyScale(state), 1, difficulty);
  }
});

test('a live survival run keeps its own tuning even with a hot streak', () => {
  const state = makeState({ simTime: 10 });
  state.player.defeatStreak = { count: 4, lastDefeatSimTime: 9 };
  state.run = { kind: 'survival', phase: 'active' };
  assert.equal(difficultyDamageScale(state, 9, 1), 0.5);
  state.run.phase = 'inactive';
  assert.equal(difficultyDamageScale(state, 9, 1), 0.5 * DEFEAT_STREAK_MERCY_SCALE);
});

test('ironman permadeath never reaches the streak seam', () => {
  const state = makeState({ difficulty: 'ironman', simTime: 10 });
  const bus = boot(state);
  combat.kill(state.entities.get(1), 9, LETHAL);
  assert.equal(state.player.defeatStreak, undefined, 'game over, no streak recorded');
  assert.ok(bus.events.some((e) => e.event === 'game:over' && e.payload.reason === 'ironman_death'));
});

test('a crafted or stale streak fails closed', () => {
  const state = makeState({ simTime: 10 });
  state.player.defeatStreak = { count: 12, lastDefeatSimTime: null };
  assert.equal(defeatMercyScale(state), 1, 'no finite timestamp, no window, no mercy');
  state.player.defeatStreak = { count: 'junk', lastDefeatSimTime: 9 };
  assert.equal(defeatMercyScale(state), 1, 'a non-numeric count is not a streak');
  state.player.defeatStreak = 'bogus';
  assert.equal(defeatMercyScale(state), 1);
  assert.equal(difficultyProfile(state).id, 'standard');
});
