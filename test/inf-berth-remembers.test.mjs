import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { berthVisitLine, quietBerthLine } from '../src/ui/dockArrival.js';
import { createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';

function boot(t) {
  const sim = createSimulation({ seed: 42, systems: [economy, world, save] });
  t.after(() => sim.dispose());
  sim.state.mode = 'flight';
  sim.registry.get('world').enterSector('sector_helios_prime');
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100 });
  sim.state.playerId = player.id;
  return sim;
}

test('physical arrivals, not price refreshes, stamp visits and survive actual Continue and worker projection', t => {
  const sim = boot(t), state = sim.state, econ = sim.registry.get('economy');
  const sid = 'station_helios';
  state.simTime = 0;
  sim.bus.emit('dock:docked', { stationId: sid });
  assert.equal(state.player.berthMemory[sid].visitedAt, 0);
  state.simTime = 1200;
  econ.snapshotIntel(sid);
  assert.equal(state.player.berthMemory[sid].visitedAt, 0, 'long stay does not mint a visit');
  econ.snapshotIntel('station_helios', { source: 'uplink' });
  assert.equal(state.player.berthMemory[sid].priorVisitAt, null);
  sim.bus.emit('dock:undocked', { stationId: sid });
  sim.bus.emit('dock:docked', { stationId: sid });
  assert.match(berthVisitLine(state, sid), /2 days/);
  state.simTime = 1250;
  assert.match(berthVisitLine(state, sid), /2 days/, 'line is stable while docked');
  sim.bus.emit('dock:undocked', { stationId: sid });
  state.simTime = 1251;
  sim.bus.emit('dock:docked', { stationId: sid });
  assert.equal(berthVisitLine(state, sid), null, 'a same-day return does not repeat old prose');
  const envelope = JSON.parse(JSON.stringify(sim.registry.get('save').serialize('quick')));
  const restored = boot(t);
  assert.equal(restored.registry.get('save')._restore(envelope.data, 'quick').restored, true);
  assert.deepEqual(restored.state.player.berthMemory[sid], state.player.berthMemory[sid]);
  const domains = new Map();
  for (const u of createDomainDiffer().diff(restored.state, 0).updates) applyDomainPathUpdate(domains, u, new Set());
  assert.deepEqual(domains.get('player').berthMemory[sid], state.player.berthMemory[sid]);
  assert.equal(quietBerthLine({ player: domains.get('player') }, sid), quietBerthLine(state, sid));
});

