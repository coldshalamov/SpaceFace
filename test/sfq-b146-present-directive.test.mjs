import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { judgePresentDirective, presentMissLine, presentOrderLine } from '../src/data/presentDirective.js';
import { tickMachineLayer } from '../src/systems/precursorMachines.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';

const ossuary = MACHINE_SITES.ashfall_machine_ossuary;
const order = { objectId: ossuary.presentObject, radius: ossuary.radius };

function worldAt(distance, items) {
  const logs = [];
  const state = {
    simTime: 4,
    tick: 1,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    rng: () => 0,
    paused: false,
    player: { credits: 40, cargo: { items: { ...items } }, heat: 3 },
    world: { currentSectorId: ossuary.sectorId, sectors: {} },
  };
  const player = {
    id: 1, type: 'player', alive: true, rot: 0, radius: 10,
    pos: { x: ossuary.center.x + distance, z: ossuary.center.z },
    vel: { x: 0, z: 0 },
    data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const world = {
    state,
    registry: { get: () => null },
    active: { dressing: [], pois: [] },
    _toGlobal: (p) => ({ x: p.x, z: p.z }),
    _toLocal: (p) => ({ x: p.x, z: p.z }),
    bus: { emit: (type, payload) => logs.push({ type, payload }) },
  };
  return { state, world, logs, tick() { tickMachineLayer(world, 1); } };
}

test('the named specimen inside the volume is presented and any other miss is named', () => {
  assert.equal(judgePresentDirective(order, { distance: 0, cargoCount: 1 }).reason, 'presented');
  assert.equal(judgePresentDirective(order, { distance: order.radius, cargoCount: 1 }).accepted, true);
  assert.equal(judgePresentDirective(order, { distance: order.radius + 1, cargoCount: 1 }).reason, 'outside the volume');
  assert.equal(judgePresentDirective(order, { distance: 10, cargoCount: 0 }).reason, 'wrong object');
  assert.equal(judgePresentDirective({ objectId: '', radius: 10 }, { distance: 0, cargoCount: 1 }).reason, 'unnamed');
  assert.match(presentMissLine('outside the volume', ossuary.presentLabel), /OUTSIDE THE VOLUME/);
  assert.match(presentMissLine('wrong object', ossuary.presentLabel), /THIS LOT IS NOT IT/);
  assert.equal(presentMissLine('story', ossuary.presentLabel), null);
});

test('arriving with the specimen satisfies the ossuary and leaves the lot', () => {
  const w = worldAt(0, { cmdty_live_specimen: 1 });
  w.tick();
  const rec = ensureAlienEcologyState(w.state).machineSites[ossuary.siteId];
  assert.equal(rec.directiveResolved, true);
  assert.equal(rec.presentReason, 'presented');
  assert.equal(w.state.player.cargo.items.cmdty_live_specimen, 1);
  assert.equal(w.state.player.credits, 40);
  assert.equal(w.state.player.heat, 3);
  assert.equal(w.state.paused, false);
  const issued = w.logs.find((e) => e.type === 'comms:log' && /PRESENT SPECIMEN/.test(e.payload.text));
  assert.ok(issued);
  assert.match(issued.payload.text, /cradled live specimen/);
  assert.match(issued.payload.text, /RADIUS 600/);
  w.tick();
  assert.equal(w.state.player.cargo.items.cmdty_live_specimen, 1);
  assert.equal(ensureAlienEcologyState(w.state).machineSites[ossuary.siteId].directiveResolved, true);
});

test('the same specimen outside the volume is refused as outside', () => {
  const w = worldAt(700, { cmdty_live_specimen: 1 });
  w.tick();
  const rec = ensureAlienEcologyState(w.state).machineSites[ossuary.siteId];
  assert.notEqual(rec.directiveResolved, true);
  assert.equal(rec.presentReason, 'outside the volume');
  assert.equal(w.state.player.cargo.items.cmdty_live_specimen, 1);
  const miss = w.logs.filter((e) => e.type === 'comms:log' && /OUTSIDE THE VOLUME/.test(e.payload.text));
  assert.equal(miss.length, 1);
  w.tick();
  assert.equal(w.logs.filter((e) => e.type === 'comms:log' && /OUTSIDE THE VOLUME/.test(e.payload.text)).length, 1);
});

test('a different lot inside the volume is refused as the wrong object', () => {
  const w = worldAt(0, { cmdty_scrap: 4 });
  w.tick();
  const rec = ensureAlienEcologyState(w.state).machineSites[ossuary.siteId];
  assert.notEqual(rec.directiveResolved, true);
  assert.equal(rec.presentReason, 'wrong object');
  assert.equal(w.state.player.cargo.items.cmdty_scrap, 4);
  assert.equal(w.state.player.credits, 40);
  const miss = w.logs.find((e) => e.type === 'comms:log' && /THIS LOT IS NOT IT/.test(e.payload.text));
  assert.ok(miss);
});

test('the order line names the volume and the other directives keep their shape', () => {
  const line = presentOrderLine(ossuary, ossuary.center);
  assert.match(line, /PRESENT SPECIMEN/);
  assert.match(line, /RADIUS 600/);
  assert.equal(MACHINE_SITES.charon_pylon_field.directive, 'VACATE');
  assert.equal(MACHINE_SITES.veil_survey_monolith.directive, 'HOLD');
  assert.equal(MACHINE_SITES.ashfall_gate_underlayer.directive, 'WITNESS');
});
