/**
 * §15.6 C6 — mass slam × station. The player throws a hull through a berth's ring and the world
 * answers: economy (single writer for credits/services/insurance) files a fine on the note, downs
 * the repair bay for ten minutes, bumps the insurance deductible, dings reputation, and emits one
 * `station:slammed` receipt; sectorSim turns that receipt into a bounded lane impulse; the yard
 * quote shows the outage; the outage survives a save round-trip and expires on the clock.
 *
 * Not a slam: a sub-threshold tap, a dust-mass pebble, a wall that is not a berth, or a hull the
 * player did not throw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { economy, DOCK_SLAM_LAW, stationServiceOutage, INSURANCE_DEFAULTS } from '../src/systems/economy.js';
import { sectorSim } from '../src/systems/sectorSim.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';

const STATION_ENTITY_ID = 900;
const DRONE_ID = 77;

function makeCtx(seed) {
  const state = createGameState(seed);
  state.meta.seed = seed;
  state.mode = 'flight';
  state.simTime = 120;
  state.tick = 7200;
  state.playerId = 1;
  state.world.currentSectorId = 'sector_ceres_belt';
  for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, hull: 100, hullMax: 100, data: {} };
  const station = { id: STATION_ENTITY_ID, type: 'station', alive: true, pos: { x: 200, z: 0 }, data: { stationId: 'station_ceres', name: 'Ceres Refinery' } };
  const drone = { id: DRONE_ID, type: 'drone', alive: true, team: 2, pos: { x: 190, z: 0 }, vel: { x: 0, z: 0 }, mass: 12, data: {} };
  const entities = [player, station, drone];
  state.entities = new Map(entities.map((e) => [e.id, e]));
  state.entityList = entities;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const registry = {
    get(name) {
      if (name === 'economy') return economy;
      if (name === 'factions') return { addOffscreenTension() {}, contestedSectorFor() { return null; } };
      if (name === 'automation') return { offscreenRiskPass() { return 0; } };
      return null;
    },
  };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  economy.newGame();
  sectorSim.init(ctx);
  return { state, bus, emitted, player, station, drone };
}

function slam(overrides = {}) {
  return {
    targetId: DRONE_ID, otherId: STATION_ENTITY_ID,
    surface: 'structure', targetType: 'drone', otherType: 'station',
    exchangedMomentum: 900, deltaV: 40, feelDeltaV: 75, control: 0.2,
    impactDamage: 30, hullDamage: 30, targetMass: 12, otherMass: 1e6, targetKilled: true,
    provenance: { actorId: 1, weaponId: 'wpn_tractor', tag: 'tether_sling' },
    tick: 7200,
    ...overrides,
  };
}

const receiptsOf = (emitted, name) => emitted.filter((e) => e.event === name).map((e) => e.payload);

for (const seed of [4242, 8008]) {
  test(`C6: a thrown 12 t hull at 75 WU/s through Ceres' ring files a fine, downs the yard, marks the lane (seed ${seed})`, () => {
    const { state, bus, emitted } = makeCtx(seed);
    const debtBefore = Number(state.player.debt) || 0;
    const t0 = state.simTime;

    bus.emit('combat:collisionConsequence', slam());

    const receipts = receiptsOf(emitted, 'station:slammed');
    assert.equal(receipts.length, 1, 'one slam, one receipt');
    const r = receipts[0];
    assert.equal(r.schemaVersion, 1);
    assert.equal(r.stationId, 'station_ceres');
    assert.equal(r.sectorId, 'sector_ceres_belt');
    assert.equal(r.factionId, 'faction_dmc');
    assert.equal(r.actorId, 1);
    assert.equal(r.strikerId, DRONE_ID);
    assert.equal(r.strikerKilled, true);
    const expectedFine = Math.max(DOCK_SLAM_LAW.fineMinCr, Math.min(DOCK_SLAM_LAW.fineMaxCr, Math.round(12 * 75 * DOCK_SLAM_LAW.finePerMomentum)));
    assert.equal(r.fineCr, expectedFine, 'fine = mass × closing × rate, clamped');
    assert.equal(Number(state.player.debt), debtBefore + expectedFine, 'the fine is filed on the note, not snatched from the wallet');

    const outage = stationServiceOutage(state, 'station_ceres', 'repair');
    assert.ok(outage, 'the repair bay is down');
    assert.equal(outage.cause, 'dock_slam');
    assert.ok(Math.abs(outage.remainingS - DOCK_SLAM_LAW.repairOutageS) < 1e-9);
    assert.equal(stationServiceOutage(state, 'station_ceres', 'refuel'), null, 'only the yard is down; the pumps still run');
    assert.equal(stationServiceOutage(state, 'station_helios', 'repair'), null, 'another berth is untouched');

    const rep = receiptsOf(emitted, 'faction:repDelta');
    assert.equal(rep.length, 1);
    assert.equal(rep[0].factionId, 'faction_dmc');
    assert.equal(rep[0].delta, DOCK_SLAM_LAW.repDelta);
    assert.equal(rep[0].reason, 'dock_slam');

    const toasts = receiptsOf(emitted, 'toast');
    assert.ok(toasts.some((t) => /Ceres Refinery/.test(t.text) && /through our ring/.test(t.text) && new RegExp(`${expectedFine} cr`).test(t.text)),
      'dock control names the berth, the ring, and the fine');
    assert.equal(state.player.dockSlams, 1);

    // sectorSim: the receipt becomes a bounded lane impulse.
    const imp = state.sectorSim.impulses.filter((i) => i.kind === 'dock_slam');
    assert.equal(imp.length, 1);
    assert.equal(imp[0].sectorId, 'sector_ceres_belt');
    assert.ok(imp[0].danger > 0 && imp[0].danger <= 0.05, `small danger bump ${imp[0].danger}`);
    assert.ok(imp[0].pricePressure > 0 && imp[0].pricePressure <= 0.05, `small price bump ${imp[0].pricePressure}`);
    assert.ok(imp[0].influence && imp[0].influence.faction_dmc < 0, 'the owner loses a sliver of standing');

    // The yard quote reads the outage while docked here.
    state.ui.dockedStationId = 'station_ceres';
    state.player.hull = 40; state.player.hullMax = 100;
    const quote = serviceQuote('repair', state, state.entities.get(1));
    assert.equal(quote.disabled, true, 'repair is refused while the ring is being cleared');
    assert.match(quote.detail, /Repair bay down/);
    assert.ok(quote.chips.some((c) => /bay down 10 min/.test(c.text)));

    // Re-latch: the same hull bouncing twice in the ring is one slam.
    bus.emit('combat:collisionConsequence', slam({ tick: 7210 }));
    assert.equal(receiptsOf(emitted, 'station:slammed').length, 1, 'duplicate contact inside the relatch window is not a second slam');
    state.simTime = t0 + DOCK_SLAM_LAW.relatchS + 1;
    bus.emit('combat:collisionConsequence', slam({ targetId: DRONE_ID, tick: 7700 }));
    assert.equal(receiptsOf(emitted, 'station:slammed').length, 2, 'after the relatch window a new hit is a new slam');
    assert.equal(state.player.dockSlams, 2);

    // Save round-trip keeps the live outage; the clock expires it.
    const chunk = economy.serialize();
    assert.ok(chunk.stationOutages && chunk.stationOutages.station_ceres, 'a live outage is serialized');
    const fresh = makeCtx(seed);
    fresh.state.simTime = state.simTime;
    economy.deserialize(chunk);
    assert.ok(stationServiceOutage(fresh.state, 'station_ceres', 'repair'), 'the outage is restored');
    fresh.state.simTime = state.simTime + DOCK_SLAM_LAW.repairOutageS + 1;
    assert.equal(stationServiceOutage(fresh.state, 'station_ceres', 'repair'), null, 'the yard reopens on the clock');
    assert.equal(economy.serialize().stationOutages, undefined, 'an expired outage is not saved');
  });

  test(`C6: taps, pebbles, non-berth walls, and hulls the player did not throw are not slams (seed ${seed})`, () => {
    const { state, bus, emitted } = makeCtx(seed);
    bus.emit('combat:collisionConsequence', slam({ feelDeltaV: DOCK_SLAM_LAW.closingSpeedMin - 1 }));
    bus.emit('combat:collisionConsequence', slam({ targetMass: DOCK_SLAM_LAW.massMin - 1 }));
    bus.emit('combat:collisionConsequence', slam({ surface: 'terrain', otherType: 'asteroid' }));
    bus.emit('combat:collisionConsequence', slam({ provenance: { actorId: 55, weaponId: null, tag: 'ram' } }));
    bus.emit('combat:collisionConsequence', slam({ provenance: null }));
    bus.emit('combat:collisionConsequence', slam({ targetId: 1, provenance: { actorId: 1, tag: 'self' } }));
    assert.equal(receiptsOf(emitted, 'station:slammed').length, 0);
    assert.equal(Number(state.player.debt) || 0, 0);
    assert.equal(stationServiceOutage(state, 'station_ceres', 'repair'), null);
    assert.equal(state.sectorSim.impulses.filter((i) => i.kind === 'dock_slam').length, 0);
  });
}

test('C6: an insured pilot who slams a ring sees the deductible climb, capped', () => {
  const { state, bus } = makeCtx(4242);
  state.player.insurance = { deductibleCr: INSURANCE_DEFAULTS.deductibleCr };
  const cap = Math.round(INSURANCE_DEFAULTS.deductibleCr * DOCK_SLAM_LAW.deductibleMaxMult);
  for (let i = 0; i < 6; i++) {
    state.simTime += DOCK_SLAM_LAW.relatchS + 1;
    bus.emit('combat:collisionConsequence', slam({ targetId: DRONE_ID }));
  }
  assert.equal(state.player.insurance.deductibleCr, cap, 'the deductible climbs by 1.2× per slam and stops at the cap');
});
