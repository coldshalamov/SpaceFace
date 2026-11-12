import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { createRigWorkshopSystem } from '../src/features/rigWorkshop/runtime.js';
import { shipjack } from '../src/systems/shipjack.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { tickLivedVignettes } from '../src/systems/livedWorldDirector.js';

const DT = 1 / 60;
function fixture(t, withDirector = false) {
  const sim = createSimulation({ seed: 4242,
    systems: [createRigWorkshopSystem(), shipjack, ...(withDirector ? [encounterDirector] : [])] });
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  state.onboarding = { active: true, finished: false };
  state.settings.gameplay.tutorialHints = true;
  state.ui.docked = false;
  state.world = { currentSectorId: 'sector_helios_prime', sectors: {
    sector_helios_prime: { id: 'sector_helios_prime' },
  } };
  const pilot = sim.spawn(makeShipEntitySpec('ship_kestrel', { pos: { x: 400, z: -900 }, team: 0 }));
  state.playerId = pilot.id;
  sim.spawn({ type: 'station', pos: { x: 280, z: -140 }, radius: 80,
    data: { stationId: 'station_helios' } });
  const workshop = registry.get('rigWorkshop'), custody = registry.get('shipjack');
  const opportunities = [], prompts = [];
  bus.on('shipjack:opportunity', value => opportunities.push(value));
  bus.on('rigWorkshop:prompt', value => prompts.push(value));
  t.after(() => { workshop.destroy(); custody.destroy(); registry.get('encounterDirector')?.destroy?.(); });
  return { ...sim, pilot, workshop, custody, opportunities, prompts };
}

function livedRuntime(state) {
  const requests = [];
  state.encounterDirector = { live: {}, stats: { fired: 0 } };
  const director = { requestAuthoredEncounter(request) {
    requests.push(request); state.encounterDirector.stats.fired++; return { ok: true };
  } };
  return { state, requests, registry: { get: id => id === 'encounterDirector' ? director : null } };
}

function startEntry(f) { f.bus.emit('game:started', {}); f.custody.update(DT, f.state); }

test('guided onboarding defers new RATCHET, Empty Seat and curated offers without spending identities or cadence', t => {
  const f = fixture(t), { state, workshop } = f;
  assert.equal(state.tutorial, undefined, 'the actual onboarding owner is the only tutorial record in this fixture');
  const ids = [...state.entities.keys()];
  workshop.update(DT, state);
  assert.equal(workshop.discover(), false);
  startEntry(f);
  const lived = livedRuntime(state);
  tickLivedVignettes(lived);
  assert.deepEqual([...state.entities.keys()], ids);
  assert.equal(state.rigWorkshop.bench, null);
  assert.equal(state.rigWorkshop.introduced, false);
  assert.equal(state.rigWorkshop.declinedUntil, 0);
  assert.equal(state.player.shipjack, undefined);
  assert.deepEqual(f.opportunities, []);
  assert.deepEqual(f.prompts, []);
  assert.deepEqual(lived.requests, []);
  assert.equal(lived._livedScanAt, undefined);
  assert.deepEqual(state.encounterDirector.stats, { fired: 0 });
});

for (const release of ['tutorial:finished', 'hints disabled']) {
  test(`${release} resumes the original offers in the same sector once`, t => {
    const f = fixture(t), { state, workshop, custody } = f;
    startEntry(f); workshop.update(DT, state);
    const lived = livedRuntime(state);
    tickLivedVignettes(lived);
    if (release === 'tutorial:finished') {
      state.onboarding.finished = true; state.onboarding.active = false;
      f.bus.emit('tutorial:finished', {});
    } else state.settings.gameplay.tutorialHints = false;
    workshop.update(DT, state); custody.update(DT, state); tickLivedVignettes(lived);
    assert.ok(state.rigWorkshop.bench);
    assert.equal(state.rigWorkshop.introduced, true);
    assert.ok(state.rigWorkshop.prompt);
    assert.equal(f.opportunities.length, 1);
    assert.equal(f.opportunities[0].encounterId, 'black_flag_empty_seat');
    assert.equal(lived.requests.length, 1);
    assert.equal(Object.keys(state.encounterDirector.stats.livedStarted).length, 1);
    const ids = [...state.entities.keys()], bench = state.rigWorkshop.bench;
    workshop.update(DT, state); custody.update(DT, state); tickLivedVignettes(lived);
    assert.deepEqual([...state.entities.keys()], ids, 'the retry must not copy benches, rigs or recovery hulls');
    assert.equal(state.rigWorkshop.bench, bench);
    assert.equal(f.opportunities.length, 1);
    assert.equal(lived.requests.length, 1);
    assert.equal(state.world.currentSectorId, 'sector_helios_prime');
  });
}

test('guided onboarding retains an existing physical workshop, work order, explicit controls and loss recovery', t => {
  const f = fixture(t), { state, workshop, pilot, bus } = f;
  state.onboarding.active = false;
  assert.equal(workshop.discover(), true);
  pilot.pos.set(state.rigWorkshop.bench.pos.x, 0, state.rigWorkshop.bench.pos.z);
  assert.equal(workshop.dispatch('open').ok, true);
  assert.equal(workshop.dispatch('selectRig', { rigId: state.rigWorkshop.rigs.find(row => row.template === 'sled').id }).ok, true);
  assert.equal(workshop.dispatch('acceptJob', { id: 'needle' }).ok, true);
  const w = state.rigWorkshop, job = w.jobs.needle;
  const bench = w.bench, originals = [...job.cargoIds], rigs = w.rigs.map(row => [...row.partIds]);
  state.onboarding.active = true;
  workshop.update(DT, state);
  assert.equal(w.bench, bench);
  assert.equal(w.activeJobId, 'needle');
  assert.deepEqual(job.cargoIds, originals);
  assert.deepEqual(w.rigs.map(row => row.partIds), rigs);
  const power = workshop.dispatch('power', { on: true });
  assert.equal(power.ok, false);
  assert.match(power.reason, /couple/i, 'physical coupling remains required rather than silently disabled by guidance');
  assert.equal(workshop.dispatch('guide', { target: 'pickup' }).ok, true);
  const feedback = [];
  bus.on('rigWorkshop:feedback', value => feedback.push(value));
  const lost = state.entities.get(originals[0]); lost.alive = false; lost.hull = 0;
  bus.emit('entity:killed', { id: lost.id });
  assert.equal(job.cargo[0].lost, true);
  assert.ok(feedback.some(row => row.kind === 'warning' && /survivors/.test(row.text)));
  assert.equal(workshop.dispatch('open').ok, true, 'explicit bench decisions remain reachable');
  assert.ok(w.prompt);
  assert.equal(workshop.dispatch('power', { on: false }).ok, true);
});

test('retained BLACK FLAG hulls reconcile during guidance while new offers stay deferred', t => {
  const f = fixture(t), { state, custody, bus } = f;
  state.onboarding.active = false;
  custody.enterSector();
  assert.equal(f.opportunities.length, 1);
  const vessel = Object.values(state.player.shipjack.vesselsById)[0];
  const firstId = vessel.location.entityId;
  custody.parkSector();
  assert.equal(vessel.location.kind, 'remote');
  state.onboarding.active = true;
  custody.enterSector();
  assert.notEqual(vessel.location.entityId, firstId);
  const retainedId = vessel.location.entityId;
  assert.equal(state.entities.get(retainedId).data.vesselId, vessel.vesselId);
  assert.equal(f.opportunities.length, 1, 'retained rematerialization emits no new opportunity');
  custody.enterSector();
  assert.equal(vessel.location.entityId, retainedId);
  const distress = [];
  bus.on('shipjack:distress', payload => distress.push(payload));
  assert.equal(custody.command({ action: 'distress' }).ok, true);
  assert.equal(distress.length, 1);
});

for (const boundary of ['game:new', 'save:restoring']) {
  test(`${boundary} fences a deferred admission until its matching ready event`, t => {
    const f = fixture(t);
    startEntry(f);
    f.bus.emit(boundary, {});
    f.state.settings.gameplay.tutorialHints = false;
    f.custody.update(DT, f.state);
    assert.equal(f.opportunities.length, 0);
    f.bus.emit(boundary === 'game:new' ? 'game:started' : 'save:loaded', {});
    f.custody.update(DT, f.state);
    assert.equal(f.opportunities.length, 1);
    f.bus.emit('tutorial:finished', {});
    f.custody.update(DT, f.state);
    assert.equal(f.opportunities.length, 1);
    f.custody.destroy();
    f.bus.emit('game:started', {});
    f.bus.emit('tutorial:finished', {});
    assert.equal(f.opportunities.length, 1, 'retired listeners cannot publish more offers');
  });
}

test('the actual catalog request cannot spend or chart RATCHET while guidance defers it, including force', t => {
  const f = fixture(t, true), director = f.registry.get('encounterDirector');
  const resolutions = [];
  f.bus.on('encounter:resolved', row => resolutions.push(row));
  const payload = { shapeId: 'pro_rig_workshop', encounterId: 'guided:workshop',
    sectorId: 'sector_helios_prime', anchor: { x: 400, z: -900 }, zoneType: 'civilian_core',
    zoneId: 'guided:fixture', zoneName: 'Guided fixture', zoneRadius: 500 };
  const before = JSON.stringify(f.state.encounterDirector);
  for (const force of [false, true]) {
    assert.equal(director.requestAuthoredEncounter({ ...payload, force }).ok, false);
    assert.equal(JSON.stringify(f.state.encounterDirector), before, 'no fired, cooldown, window or live admission is consumed');
  }
  assert.deepEqual(resolutions, []);
  assert.equal(f.state.rigWorkshop.bench, null);
  f.state.onboarding.finished = true; f.state.onboarding.active = false;
  f.bus.emit('tutorial:finished', {});
  assert.equal(director.requestAuthoredEncounter(payload).reason, 'resolved_on_fire');
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].outcome, 'workshop_charted');
  assert.ok(f.state.rigWorkshop.bench);
  assert.deepEqual(f.state.encounterDirector.live, {}, 'charting leaves no empty encounter blocking the story');
});
