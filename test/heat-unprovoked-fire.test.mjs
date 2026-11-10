/**
 * Lane 3 fix packet: unprovoked fire must move the WANTED ledger.
 *
 * `combat:damage` carries the DAMAGE CHANNEL in `payload.type` ('kinetic', …), never the
 * victim's kind — the live entity record is the classification authority. Also covered:
 * the sealed-run receipt consume, the nets-band checkpoint break landing out of nets, and
 * the fixer scrub's one-band deal (full WANTED clear on the last band).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  heat, isPlayerWanted, heatLevelFor, wantedTierFor, WANTED_TIER, THRESHOLD,
} from '../src/systems/heat.js';

function makeBus() {
  const handlers = {};
  return {
    on(name, fn) {
      (handlers[name] || (handlers[name] = [])).push(fn);
    },
    emit(name, payload) {
      for (const fn of handlers[name] || []) fn(payload);
    },
  };
}

function boot({ heat: heatValue = 0, run = null } = {}) {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 } };
  const ship = { id: 2, type: 'ship', alive: true, team: 2, pos: { x: 40, z: 0 } };
  const station = { id: 3, type: 'station', alive: true, team: 2, pos: { x: 400, z: 0 }, factionId: 'faction_law' };
  const drone = { id: 4, type: 'drone', alive: true, team: 2, pos: { x: 60, z: 0 } };
  const civilian = { id: 5, type: 'ship', alive: true, team: 2, pos: { x: 80, z: 0 }, factionId: 'faction_civ' };
  const pirate = { id: 6, type: 'ship', alive: true, team: 3, pos: { x: 100, z: 0 }, factionId: 'faction_pirate' };
  const mine = { id: 9, type: 'mine', alive: true, team: 1, pos: { x: 20, z: 0 } };
  const massSeed = { id: 10, type: 'massSeed', alive: true, team: 0, pos: { x: 8, z: 0 } };
  const entities = new Map(
    [player, ship, station, drone, civilian, pirate, mine, massSeed].map((e) => [e.id, e]),
  );
  const state = {
    playerId: 1,
    simTime: 12,
    mode: 'flight',
    tick: 720,
    player: { heat: heatValue },
    entities,
    entityList: [...entities.values()],
    factions: {},
    world: { currentSectorId: 'sector_test' },
    run,
  };
  const bus = makeBus();
  const sys = Object.create(heat);
  sys.init({ state, bus, registry: { get: () => null } });
  return { state, bus, sys };
}

/** A `combat:damage` payload in the shape the live emitter actually sends (damage.js:440-471). */
function liveHit(targetId, extra = {}) {
  return {
    targetId,
    attackerId: 1,
    amount: 8,
    applied: 8,
    type: 'kinetic', // the dominant damage channel — NOT the victim's kind
    factionId: null,
    factionLawful: false,
    targetHostileToPlayer: false,
    ...extra,
  };
}

test('live-channel payload: unprovoked fire on a ship accrues WANTED heat', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', liveHit(2));
  assert.ok(state.player.heat > 0, 'a kinetic hit on a ship must raise suspicion');
});

test('unprovoked fire on a station accrues WANTED heat', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', liveHit(3, { factionId: 'faction_law' }));
  assert.ok(state.player.heat > 0, 'a kinetic hit on a station must raise suspicion');
});

test('unprovoked fire on a drone accrues WANTED heat', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', liveHit(4));
  assert.ok(state.player.heat > 0, 'a kinetic hit on a drone must raise suspicion');
});

test('unprovoked fire on a civilian ship accrues WANTED heat', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', liveHit(5, { factionId: 'faction_civ' }));
  assert.ok(state.player.heat > 0, 'a kinetic hit on a civilian must raise suspicion');
});

test('deployed devices and the pilot still do not classify as victims', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', liveHit(9));
  bus.emit('combat:damage', liveHit(10));
  bus.emit('combat:damage', liveHit(1));
  assert.equal(state.player.heat, 0, 'mines, mass-seeds and self-hits stay free');
});

test('unprovoked fire plateaus in the suspicion band and never convicts by itself', () => {
  const { state, bus } = boot();
  for (let i = 0; i < 20; i += 1) {
    bus.emit('combat:damage', liveHit(2));
    state.simTime += 1.1; // clear the per-second burst cap
  }
  assert.ok(state.player.heat > 0, 'sustained fire banks suspicion');
  assert.ok(state.player.heat < THRESHOLD, 'hit chips plateau under WANTED, never convicting');
  assert.equal(heatLevelFor(state.player.heat), 0);
  assert.equal(isPlayerWanted(state), false, 'suspicion alone is not a warrant');
});

test('a synthetic entity-kind type still classifies when no entity resolves', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', liveHit(77, { type: 'ship' }));
  assert.ok(state.player.heat > 0, 'a payload naming an entity kind still reads as a victim');
});

test('returning fire on a hostile non-lawful ship stays free', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', liveHit(6, {
    factionId: 'faction_pirate', targetHostileToPlayer: true,
  }));
  assert.equal(state.player.heat, 0, 'self-defense against a hostile pirate is not a crime');
});

test('a lawful victim that turned hostile still chips (provoked retaliation is no launder)', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', liveHit(3, {
    factionId: 'faction_law', factionLawful: true, targetHostileToPlayer: true,
  }));
  assert.ok(state.player.heat > 0,
    'shooting a lawful unit you provoked keeps costing suspicion');
});

const RECEIPT = {
  accepted: true,
  source: 'lawSecurity',
  validatedCrime: true,
  incidentReceiptId: 'inc-sealed-1',
  reportId: 'rep-sealed-1',
  kind: 'unlawful_kill',
  victimClass: 'ship',
};

test('a sealed run refuses a law receipt without spending its id', () => {
  const { state, sys } = boot({ run: { kind: 'survival', phase: 'wave' } });
  const refused = sys.applyIncidentReceipt({ ...RECEIPT });
  assert.equal(refused.applied, false);
  assert.equal(refused.reason, 'sealed');
  assert.equal(state.player.heat, 0, 'sealed run writes no heat');
  assert.equal(state.player.heatIncidentsApplied, undefined, 'the receipt id stays unspent');
  assert.equal(state.player.heatLastIncident, undefined, 'no conviction is recorded');

  state.run.phase = 'inactive'; // the seal lifts
  const applied = sys.applyIncidentReceipt({ ...RECEIPT });
  assert.equal(applied.applied, true, 'the same receipt can convict once the run ends');
  assert.ok(state.player.heat > 0);
});

test('a law receipt still applies exactly once outside the seal', () => {
  const { state, sys } = boot();
  const first = sys.applyIncidentReceipt({ ...RECEIPT, incidentReceiptId: 'inc-1', reportId: 'rep-1' });
  const second = sys.applyIncidentReceipt({ ...RECEIPT, incidentReceiptId: 'inc-1', reportId: 'rep-1' });
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(second.reason, 'already_applied');
});

test('breaking the wanted checkpoint leaves the nets tier — no reposted net', () => {
  for (const [heatAt, fromLevel] of [[0.55, 3], [0.8, 4]]) {
    const { state, bus } = boot({ heat: heatAt });
    assert.equal(wantedTierFor(state.player.heat), WANTED_TIER.NETS);
    bus.emit('law:wantedCheckpointBroken', {
      accepted: true, source: 'lawSecurity', method: 'mass',
    });
    assert.equal(
      wantedTierFor(state.player.heat), WANTED_TIER.BOUNTY,
      `level ${fromLevel} net break must land out of nets, not back on a fresh net`,
    );
    assert.ok(state.player.heat < heatAt, 'the escape cooled the ledger');
  }
});

test('a checkpoint-break receipt is ignored outside the nets tier', () => {
  const { state, bus } = boot({ heat: 0.4 }); // bounty
  bus.emit('law:wantedCheckpointBroken', { accepted: true, source: 'lawSecurity', method: 'mass' });
  assert.equal(state.player.heat, 0.4);
});

test('the fixer scrub on the last wanted band clears the full WANTED state', () => {
  const { state, bus } = boot({ heat: 0.2 }); // level 1 — the final band
  assert.equal(isPlayerWanted(state), true);
  const request = { schemaVersion: 1, fenceId: 'fence_test', stationId: 'station_test', result: null };
  bus.emit('heat:scrubRequested', request);
  assert.equal(request.result.ok, true);
  assert.equal(state.player.heat, 0, 'scrubbing the last band leaves the pilot clean');
  assert.equal(isPlayerWanted(state), false);
  assert.equal(wantedTierFor(state.player.heat), WANTED_TIER.NONE);
  assert.equal(state.player.wantedTier, WANTED_TIER.NONE);
});

test('the fixer scrub cools exactly one band per ask (the advertised deal)', () => {
  const { state, bus } = boot({ heat: 0.35 }); // level 2 — bounty
  const request = { schemaVersion: 1, fenceId: 'fence_test', stationId: 'station_test', result: null };
  bus.emit('heat:scrubRequested', request);
  assert.equal(request.result.ok, true);
  assert.equal(heatLevelFor(state.player.heat), 1, 'one paid ask drops one band, honestly sold');
  assert.equal(isPlayerWanted(state), true, 'a deeper record stays WANTED after one band');
});
