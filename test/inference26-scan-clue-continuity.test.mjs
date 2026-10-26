import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { scanReveal } from '../src/systems/scanReveal.js';

function fixture() {
  const sim = createSimulation({ seed: 4242, systems: [scanner, scanReveal] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  state.world.currentSectorId = 'sector_inference26_scan';
  state.world.activeSector = { id: state.world.currentSectorId, pois: [] };
  const player = sim.spawn({ type: 'ship', team: 0, radius: 10, hull: 100,
    pos: { x: 0, z: 0 }, data: {} });
  state.playerId = player.id;
  const courses = [];
  bus.on('ui:setCourse', course => courses.push(course));
  const pulse = () => { state.simTime += 8.1; state.input.actions.scanPulse = true; sim.runTicks(1); };
  return { sim, state, bus, courses, pulse };
}

test('a repeated convoy scan retains its stale-fix explanation and retracking intercepts it', () => {
  const h = fixture();
  try {
    const convoy = { behaviorId: 'inference26-convoy', familyId: 'convoy_industrial_route',
      sectorId: h.state.world.currentSectorId, status: 'available', zoneCenter: { x: 400, z: 0 } };
    h.state.livingPoiBehaviors = { activeByZone: { lane: convoy } };
    h.pulse();
    convoy.zoneCenter = { x: 800, z: 40 };
    h.pulse();
    h.pulse();
    const id = 'signal:living:inference26-convoy';
    const row = h.state.signalInvestigation.records[id];
    assert.match(row.detail, /stale/i);
    assert.equal(row.clue.revised, true);
    assert.equal(row.clue.history.length, 1);
    h.bus.emit('signal:track', { signalId: id });
    assert.match(h.courses.at(-1).reason, /stale.*intercept/i);
    assert.deepEqual(h.courses.at(-1).pos, { x: 800, z: 40 });
    const count = h.courses.length;
    h.pulse();
    assert.equal(h.courses.length, count, 'unchanged observations do not replot');
  } finally { h.sim.dispose(); }
});

test('a contradicted hold stays an inspection on a third scan and after save/load', () => {
  const h = fixture();
  try {
    const smuggler = h.sim.spawn({ type: 'ship', team: 2, factionId: 'faction_quiet',
      pos: { x: 200, z: 0 }, radius: 8, hull: 50, data: { trafficRole: 'smuggler',
        hiddenCargo: { id: 'cmdty_narcotics', qty: 4 } } });
    h.pulse(); h.pulse(); h.pulse();
    const id = `signal:entity:${smuggler.id}`;
    const row = h.state.signalInvestigation.records[id];
    assert.match(row.detail, /contradicts/i);
    assert.equal(row.clue.history.length, 1);
    h.bus.emit('signal:track', { signalId: id });
    assert.match(h.courses.at(-1).reason, /contradicted.*inspect/i);
    const system = h.sim.registry.get('scanner');
    system.deserialize(system.serialize());
    h.pulse();
    assert.match(h.state.signalInvestigation.records[id].detail, /contradicts/i);
    assert.equal(h.state.signalInvestigation.records[id].clue.history.length, 1);
    assert.doesNotMatch(JSON.stringify(h.state.signalInvestigation), /cmdty_narcotics/);
  } finally { h.sim.dispose(); }
});
