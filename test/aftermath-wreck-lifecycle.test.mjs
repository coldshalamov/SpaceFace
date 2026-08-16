import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  AFTERMATH_FRESH_WINDOW_S,
  aftermathForSector,
  aftermathWrecks,
} from '../src/systems/aftermathWrecks.js';
import { mining } from '../src/systems/mining.js';

const SECTOR_ID = 'sector_helios_prime';

function boot(seed = 26026) {
  const sim = createSimulation({ seed, systems: [aftermathWrecks, mining] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR_ID;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  sim.state.playerId = player.id;
  return { sim, system: sim.registry.get('aftermathWrecks') };
}

function recordFreshKill(t) {
  const zone = zonesForSector(SECTOR_ID)[0];
  const pos = sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
  const victim = t.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_reach', pos, vel: { x: 0, z: 0 },
    radius: 7, hull: 0, hullMax: 80,
    data: { defId: 'ship_corsair', shipClass: 'corsair_raider', name: 'Cold Ledger' },
  });
  victim.alive = false;
  t.sim.bus.emit('entity:killed', {
    id: victim.id,
    killerId: t.sim.state.playerId,
    type: 'ship',
    victimClass: 'corsair_raider',
    factionId: victim.factionId,
    pos: { ...pos },
    sectorId: SECTOR_ID,
  });
  return t.sim.state.entityList.find((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data && entity.data.markerId);
}

test('ordinary battle aftermath cools in place into a persistent salvage hulk without changing value', () => {
  const t = boot();
  try {
    const cooled = [];
    t.sim.bus.on('aftermathWreck:cooled', (payload) => cooled.push(payload));
    const wreck = recordFreshKill(t);
    const marker = aftermathForSector(t.sim.state, SECTOR_ID)[0];
    assert.ok(wreck && marker, 'the ordinary production kill creates its durable physical wreck');
    assert.equal(wreck.data.wreckLifecycle, 'fresh');
    assert.match(wreck.data.scanLabel, /^Fresh .* Wreck$/);
    const pool = { ...marker.salvagePool };

    t.sim.state.simTime = marker.t + AFTERMATH_FRESH_WINDOW_S - 0.01;
    t.sim.state.tick = 30;
    t.system.update(0.5, t.sim.state);
    assert.equal(wreck.data.wreckLifecycle, 'fresh');

    t.sim.state.simTime = marker.t + AFTERMATH_FRESH_WINDOW_S;
    t.sim.state.tick = 60;
    t.system.update(0.5, t.sim.state);
    assert.equal(marker.lifecycleStage, 'cold');
    assert.equal(wreck.data.wreckLifecycle, 'cold');
    assert.match(wreck.data.scanLabel, /^Cold .* Hulk$/);
    assert.deepEqual(marker.salvagePool, pool, 'cooling changes the job, never mints or deletes salvage');
    assert.strictEqual(wreck.data.salvagePool, marker.salvagePool, 'live hulk keeps the durable source pool');
    assert.equal(cooled.length, 1);

    const saved = JSON.parse(JSON.stringify(t.system.serialize()));
    t.sim.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    wreck.alive = false;
    t.sim.state.entities.delete(wreck.id);
    t.system.deserialize(saved);
    t.sim.bus.emit('save:loaded', {});
    const returned = t.sim.state.entityList.find((entity) => entity && entity.alive !== false
      && entity.type === 'wreck' && entity.data && entity.data.markerId === marker.markerId);
    assert.ok(returned, 'Continue rematerializes the source-bound cold hulk');
    assert.equal(returned.data.wreckLifecycle, 'cold');
    assert.deepEqual(returned.data.salvagePool, pool);
  } finally {
    t.sim.dispose();
  }
});
