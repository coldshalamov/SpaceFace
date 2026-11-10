import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { stationServices } from '../src/systems/stationServices.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';

const STATION = 'station_helios';
const IRON = 'cmdty_ore_iron';

function docked({ credits = 10000, hull = 10, heat = 0 } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [economy, cargo, stationServices, lawSecurity] });
  const { state, bus } = sim;
  const player = { id: 1, type: 'ship', alive: true, team: 0, hull, hullMax: 100,
    armorHp: 0, armorMax: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    flags: { docked: true }, data: { defId: 'ship_kestrel' } };
  const station = { id: 2, type: 'station', alive: true, factionId: 'faction_scn',
    pos: { x: 0, z: 0 }, data: { stationId: STATION } };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entities.set(station.id, station);
  state.entityList.push(player, station);
  state.player.credits = credits;
  state.player.heat = heat;
  state.ui.docked = true;
  state.ui.dockedStationId = STATION;
  state.timeScale = 0;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const receipts = [];
  for (const type of ['service:completed', 'heat:clear', 'law:fineRefused']) {
    bus.on(type, payload => receipts.push({ type, payload }));
  }
  bus.emit('dock:docked', { stationId: STATION });
  return { sim, state, bus, player, receipts, econ: sim.registry.get('economy'),
    yard: sim.registry.get('stationServices'), law: sim.registry.get('lawSecurity') };
}

function runYard(h) {
  for (let i = 0; i < 600 && h.state.stationServices.player?.jobs.length; i++) {
    h.yard.update(1, h.state);
  }
  assert.equal(h.state.stationServices.player?.jobs.length, 0);
}

test('SFQ-B085: a partly sealed rich lot keeps exact provenance quantities when its hull parks', () => {
  const state = createGameState(4242);
  state.player.ownedShips = [{ defId: 'ship_kestrel' }, { defId: 'ship_pelican' }];
  state.player.cargo.capVolume = 100;
  addCargo(state, IRON, 10, { lotId: 'stolen-lot', provenanceId: 'claim:miners', sourceOwner: 'npc' });
  state.missions.active = [{ status: 'active', preloadedCargo: true, params: { cmdtyId: IRON, qty: 2 } }];
  const owner = Object.create(cargo);
  owner.state = state;
  assert.equal(owner._swapParkedHold({ fromIndex: 0, toIndex: 1, cargoCapVolume: 100 }), true);
  const parked = state.player.ownedShips[0].cargo;
  assert.equal(parked.items[IRON], 8);
  assert.equal(parked.richLots[0].qty, 8, 'the parked lot records the eight units actually moved');
  assert.equal(state.player.cargo.richLots[0].qty, 2);
  assert.equal(parked.richLots[0].provenanceId, 'claim:miners');
  assert.equal(parked.richLots[0].sourceOwner, 'npc');
});

test('SFQ-B086: a broke critical hull gets one bounded weld on the note and can resume after interruption', () => {
  const h = docked({ credits: 0, hull: 10 });
  try {
    h.econ.handleService({ type: 'repair' });
    assert.equal(h.player.hull, 10, 'yard work is timed');
    assert.equal(h.state.stationServices.player.jobs.length, 1, 'a broke hull still receives a job');
    assert.ok(h.state.player.debt > 0, 'the weld is filed as debt');
    const debt = h.state.player.debt;
    h.econ.handleService({ type: 'repair' });
    assert.equal(h.state.player.debt, debt, 'a repeated click cannot mint another weld');
    const saved = h.yard.serialize();
    h.yard.deserialize(JSON.parse(JSON.stringify(saved)));
    runYard(h);
    assert.ok(Math.abs(h.player.hull - 25) < 1e-9, 'the floor restores agency, not a free full repair');
    assert.equal(h.state.player.credits, 0);
    h.player.hull = 10;
    h.econ.handleService({ type: 'repair' });
    runYard(h);
    assert.ok(Math.abs(h.player.hull - 20) < 1e-9, 'the daily budget cannot replace more than 25 hull points after repeated damage');
    h.player.hull = 10;
    h.econ.handleService({ type: 'repair' });
    assert.equal(h.state.stationServices.player.jobs.length, 0, 'the exhausted daily allowance cannot repeat hardship aid');
  } finally { h.sim.dispose(); }
});

test('SFQ-B089: malformed note intents never erase a debt or mint a loan', () => {
  const h = docked();
  try {
    h.state.player.debt = 500;
    h.state.player.debtSinceDay = 0;
    for (const amount of [NaN, Infinity, -Infinity, 'not-an-amount']) {
      const credits = h.state.player.credits;
      h.econ.handleService({ type: 'settle', amount });
      assert.equal(h.state.player.debt, 500);
      assert.equal(h.state.player.credits, credits);
      h.econ.handleService({ type: 'loan', amount });
      assert.equal(h.state.player.debt, 500);
      assert.equal(h.state.player.credits, credits);
    }
    h.econ.handleService({ type: 'settle', amount: 100 });
    assert.equal(h.state.player.debt, 400, 'ordinary partial settlement still works');
  } finally { h.sim.dispose(); }
});

test('SFQ-B095: booked repair cannot charge the same missing hull twice, and completion reports actual work', () => {
  const h = docked({ hull: 50 });
  try {
    h.econ.handleService({ type: 'repair' });
    const credits = h.state.player.credits;
    h.econ.handleService({ type: 'repair' });
    assert.equal(h.state.player.credits, credits, 'already booked protection is not sold again');
    assert.equal(h.state.stationServices.player.jobs.length, 1);
    runYard(h);
    const done = h.receipts.filter(row => row.type === 'service:completed' && row.payload.type === 'repair');
    assert.equal(done.length, 1);
    assert.equal(done[0].payload.restoredHull, 50);
    assert.equal(done[0].payload.restoredArmor, 0);
  } finally { h.sim.dispose(); }
});

test('SFQ-B086: aborting undelivered aid releases debt and preserves a return to repair', () => {
  const h = docked({ credits: 0, hull: 10 });
  try {
    h.econ.handleService({ type: 'repair' });
    h.state.ui.docked = false;
    h.state.ui.dockedStationId = null;
    h.bus.emit('dock:undocked', { stationId: STATION });
    assert.equal(h.state.player.debt, 0);
    assert.equal(h.state.player.emergencyRepairBudget.usedHull, 0);
    h.state.ui.docked = true;
    h.state.ui.dockedStationId = STATION;
    h.bus.emit('dock:docked', { stationId: STATION });
    h.econ.handleService({ type: 'repair' });
    runYard(h);
    assert.ok(Math.abs(h.player.hull - 25) < 1e-9);
    assert.ok(h.state.player.debt > 0);
  } finally { h.sim.dispose(); }
});

test('SFQ-B095: a repair completion measures only hull it actually restored', () => {
  const h = docked({ hull: 50 });
  try {
    h.econ.handleService({ type: 'repair' });
    h.player.hull = 75;
    runYard(h);
    const done = h.receipts.find(row => row.type === 'service:completed' && row.payload.type === 'repair');
    assert.ok(Math.abs(done.payload.restoredHull - 25) < 1e-9);
  } finally { h.sim.dispose(); }
});

test('SFQ-B115: restitution work advances at the frozen berth and pauses after undocking', () => {
  const h = docked({ credits: 0, heat: 0.2 });
  try {
    h.bus.emit('law:fineChoice', { choice: 'work', stationId: STATION });
    for (let i = 0; i < 120; i++) h.sim.step();
    const work = h.state.lawSecurity.fineOffer.workS;
    assert.ok(work > 1.9 && work < 2.1, 'the frozen dock must service the work shift');
    h.state.ui.docked = false;
    h.state.ui.dockedStationId = null;
    h.player.flags.docked = false;
    h.bus.emit('dock:undocked', { stationId: STATION });
    h.law.update(10, h.state);
    assert.equal(h.state.lawSecurity.fineOffer.workS, work, 'flying away is not station work');
    h.state.ui.docked = true;
    h.state.ui.dockedStationId = STATION;
    h.bus.emit('dock:docked', { stationId: STATION });
    for (let i = 0; i < 130; i++) h.sim.step();
    assert.equal(h.state.lawSecurity.fineOffer.status, 'paid');
    assert.equal(h.receipts.filter(row => row.type === 'heat:clear').length, 1);
    for (let i = 0; i < 60; i++) h.sim.step();
    assert.equal(h.receipts.filter(row => row.type === 'heat:clear').length, 1, 'one shift settles once');
  } finally { h.sim.dispose(); }
});

test('SFQ-B115: frozen maps, pause surfaces, and arrival cooks do not dispatch world law', () => {
  const h = docked({ credits: 0, heat: 0.2 });
  try {
    h.bus.emit('law:fineChoice', { choice: 'work', stationId: STATION });
    h.state.ui.docked = false;
    h.state.ui.dockedStationId = null;
    h.player.flags.docked = false;
    let reconciliations = 0;
    h.law._reconcileJobResponses = () => { reconciliations++; };
    for (const surface of ['map', 'pause', 'arrival']) {
      h.state.ui.screenStack = surface === 'arrival' ? [] : [surface];
      h.state.render.sectorShellAdmission = surface === 'arrival';
      h.law.update(10, h.state);
      assert.equal(reconciliations, 0, `${surface} cannot dispatch responders behind the frozen picture`);
      assert.equal(h.state.lawSecurity.fineOffer.status, 'working');
      assert.equal(h.state.lawSecurity.fineOffer.workS || 0, 0, 'off-berth fine work does not advance');
      assert.equal(h.state.player.heat, 0.2);
    }
  } finally { h.sim.dispose(); }
});
