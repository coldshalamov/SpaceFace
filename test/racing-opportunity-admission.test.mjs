import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { createRigWorkshopSystem, isWorkshopAdventure } from '../src/features/rigWorkshop/runtime.js';
import { shipjack } from '../src/systems/shipjack.js';
import { isBlackFlagAdventure } from '../src/shipjack/model.js';
import { tickLivedVignettes } from '../src/systems/livedWorldDirector.js';
import { configureRacingCorridorSession, isRacingCorridorSession } from '../src/world/racingCorridor.js';

function fixture(t, temporary) {
  const sim = createSimulation({ seed: 4242, systems: [createRigWorkshopSystem(), shipjack] });
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  state.onboarding = { active: false };
  state.ui.docked = false;
  state.world = { currentSectorId: 'sector_helios_prime', sectors: {
    sector_helios_prime: { id: 'sector_helios_prime' },
  } };
  const pilot = sim.spawn(makeShipEntitySpec('ship_kestrel', { pos: { x: 400, z: -900 }, team: 0 }));
  state.playerId = pilot.id;
  sim.spawn({ type: 'station', pos: { x: 280, z: -140 }, radius: 80,
    data: { stationId: 'station_helios' } });
  configureRacingCorridorSession(state, temporary);
  const workshop = registry.get('rigWorkshop');
  const custody = registry.get('shipjack');
  t.after(() => { workshop.destroy(); custody.destroy(); });
  return { ...sim, workshop, custody };
}

function livedRuntime(state) {
  const requests = [];
  state.encounterDirector = { live: {}, stats: { fired: 0 } };
  const director = { requestAuthoredEncounter(request) {
    requests.push(request);
    state.encounterDirector.stats.fired += 1;
    return { ok: true };
  } };
  return { state, requests, registry: { get: id => id === 'encounterDirector' ? director : null } };
}

test('borrowed racing defers RATCHET, Empty Seat, and curated civilian offers before a race mission exists', t => {
  const f = fixture(t, true);
  const { state, workshop, custody, bus } = f;
  assert.equal(isRacingCorridorSession(state), true);
  assert.equal(state.racing?.active, undefined);
  assert.equal(state.race?.active, undefined);
  const opportunities = [], prompts = [];
  bus.on('shipjack:opportunity', value => opportunities.push(value));
  bus.on('rigWorkshop:prompt', value => prompts.push(value));
  const beforeIds = [...state.entities.keys()];
  workshop.update(1 / 60, state);
  assert.equal(workshop.discover(), false);
  custody.enterSector();
  const lived = livedRuntime(state);
  tickLivedVignettes(lived);
  assert.deepEqual([...state.entities.keys()], beforeIds, 'opportunity-only bodies stay outside the borrowed race');
  assert.equal(state.rigWorkshop.bench, null);
  assert.equal(state.rigWorkshop.introduced, false);
  assert.equal(state.player.shipjack, undefined, 'no campaign opportunity or custody receipt is consumed');
  assert.deepEqual(prompts, []);
  assert.deepEqual(opportunities, []);
  assert.deepEqual(lived.requests, []);
  assert.equal(lived._livedScanAt, undefined, 'deferral spends no scan window');
  assert.deepEqual(state.encounterDirector.stats, { fired: 0 }, 'deferral consumes no once-ever scene or cooldown');
});

test('ending the borrowed session admits the original offers without lost opportunities', t => {
  const { state, workshop, custody, bus } = fixture(t, true);
  const opportunities = [];
  bus.on('shipjack:opportunity', value => opportunities.push(value));
  const lived = livedRuntime(state);
  tickLivedVignettes(lived);
  configureRacingCorridorSession(state, false);
  assert.equal(isWorkshopAdventure(state), true);
  assert.equal(workshop.discover(), true);
  assert.match(state.rigWorkshop.prompt.title, /RATCHET/);
  custody.enterSector();
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].encounterId, 'black_flag_empty_seat');
  custody.enterSector();
  assert.equal(opportunities.length, 1, 'the deferred offer retains its normal once-only identity');
  tickLivedVignettes(lived);
  assert.equal(lived.requests.length, 1);
  assert.equal(lived.requests[0].zoneType, 'civilian_core');
  assert.equal(lived.requests[0].force, true);
  assert.equal(Object.keys(state.encounterDirector.stats.livedStarted).length, 1);
});

test('ordinary in-world Adventure racing retains unrelated Adventure opportunities', t => {
  const { state, workshop, custody, bus } = fixture(t, false);
  state.missions.active = { race: { params: { racingContractId: 'circuit_helios_belt', raceLease: true }, phase: 'grid' } };
  assert.equal(isRacingCorridorSession(state), false);
  assert.equal(isWorkshopAdventure(state), true);
  assert.equal(isBlackFlagAdventure(state), true);
  assert.equal(workshop.discover(), true);
  const opportunities = [];
  bus.on('shipjack:opportunity', value => opportunities.push(value));
  custody.enterSector();
  assert.equal(opportunities.length, 1);
  const lived = livedRuntime(state);
  tickLivedVignettes(lived);
  assert.equal(lived.requests.length, 1);
});

test('racing admission leaves warning delivery, explicit distress, and existing decisions intact', t => {
  const { state, workshop, custody, bus } = fixture(t, true);
  const feedback = [], distress = [];
  bus.on('rigWorkshop:feedback', value => feedback.push(value));
  bus.on('shipjack:distress', value => distress.push(value));
  bus.emit('rigWorkshop:jointBroken', {});
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0].kind, 'warning');
  assert.match(feedback[0].text, /recover the original loose part/);
  assert.equal(isBlackFlagAdventure(state), true, 'only offer admission is excluded, not explicit custody actions');
  assert.equal(custody.command({ action: 'distress' }).ok, true);
  assert.equal(distress.length, 1);
  const lived = livedRuntime(state);
  const decision = { phase: 'waiting', choice: null };
  state.encounterDirector.live.existing = decision;
  tickLivedVignettes(lived);
  assert.equal(state.encounterDirector.live.existing, decision);
  assert.deepEqual(decision, { phase: 'waiting', choice: null });
  assert.deepEqual(lived.requests, []);
});

test('a new world cannot inherit the old borrowed-session offer exclusion', t => {
  const { state, workshop, custody, bus } = fixture(t, true);
  state.world.sectors = { sector_helios_prime: { id: 'sector_helios_prime' } };
  assert.equal(isRacingCorridorSession(state), false);
  assert.equal(workshop.discover(), true);
  const opportunities = [];
  bus.on('shipjack:opportunity', value => opportunities.push(value));
  custody.enterSector();
  assert.equal(opportunities.length, 1);
  const lived = livedRuntime(state);
  tickLivedVignettes(lived);
  assert.equal(lived.requests.length, 1);
});
