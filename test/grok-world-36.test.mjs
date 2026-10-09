// WORLD-36: encounter:predationTelegraph reaches the telegraph path once per
// stalk, before the commit. Pairing odds are untouched.
import assert from 'node:assert/strict';
import test from 'node:test';

import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { createSimulation } from '../src/core/sim.js';
import { emitPredationStalkTelegraph } from '../src/systems/encounterScripts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const SEED = 4242;
const AMBIENT_SECTOR = 'sector_pallas_drift';
const AMBIENT_LANE = Object.freeze({ x: 1420, z: 760 });

function lanePoint(sectorId, dx, dz) {
  return sectorLocalToGlobalForSector(
    { x: AMBIENT_LANE.x + dx, z: AMBIENT_LANE.z + dz },
    sectorId,
  );
}

test('a predation stalk telegraphs once and does not telegraph again at the commit', () => {
  const state = { meta: { seed: SEED } };
  const names = [];
  const emit = (name) => names.push(name);
  const payload = { raidId: 'ambient:raid:4242', raiderId: 3, targetId: 8, encounterId: 'ambient:raid:4242' };
  assert.equal(emitPredationStalkTelegraph(state, payload, emit), true);
  assert.equal(emitPredationStalkTelegraph(state, payload, emit), false);
  assert.deepEqual(names, ['encounter:predationTelegraph']);
  assert.equal(emitPredationStalkTelegraph(state, { ...payload, raidId: 'ambient:raid:other' }, emit), true);
  assert.equal(names.length, 2);

  const sim = createSimulation({ seed: SEED, systems: [spawnBudget, encounterDirector] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = AMBIENT_SECTOR;
  sim.state.story.beatIndex = 7;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: lanePoint(AMBIENT_SECTOR, 5000, 5000),
    vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  const telegraph = [];
  const ambient = [];
  const engaged = [];
  sim.bus.on('encounter:predationTelegraph', (p) => telegraph.push(p));
  sim.bus.on('encounter:ambientPredationTelegraph', (p) => ambient.push(p));
  sim.bus.on('encounter:ambientPredationEngaged', (p) => engaged.push(p));
  sim.spawn({
    type: 'ship', team: 1,
    pos: lanePoint(AMBIENT_SECTOR, -200, -100),
    vel: { x: 0, z: 0 }, hull: 120, hullMax: 120, shield: 50, radius: 18,
    data: {
      intent: {},
      weapons: [{ id: 'wpn_autocannon_s' }],
      ai: {
        archetype: 'pirate', lawful: false, combatDoctrineId: 'interceptor_flyby',
        motive: 'assigned_interdiction', engagementTrigger: 'authorized_hostile_spawn',
        zoneId: 'zone_pallas_ambush', approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 2,
        activity: {
          kind: 'attack_run', reason: 'zone_hostile:hunt',
          anchor: lanePoint(AMBIENT_SECTOR, -200, -100),
          leashRadius: 2600, startedTick: 0, targetId: null,
        },
        roe: 'weapons_free',
      },
    },
  });
  sim.spawn({
    type: 'ship', team: 2,
    pos: lanePoint(AMBIENT_SECTOR, 150, 60),
    vel: { x: 0, z: 0 }, hull: 80, hullMax: 80, shield: 0, radius: 14,
    data: {
      intent: {}, trafficRole: 'hauler', role: 'hauler',
      cargoManifest: {
        manifestId: 'ambient_test_manifest',
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 24 }],
        totalQty: 24,
      },
      ai: { passive: true },
    },
  });

  sim.runTicks(2 * 60);
  assert.equal(ambient.length, 1, 'the stalk still binds');
  assert.equal(telegraph.length, 1, 'the telegraph path hears the stalk once');
  assert.equal(engaged.length, 0, 'the telegraph arrives before the commit');
  assert.equal(telegraph[0].raiderId, ambient[0].raiderId);
  assert.equal(telegraph[0].targetId, ambient[0].targetId);
  const wait = Math.ceil((ambient[0].telegraphS + 2) * 60);
  sim.runTicks(wait);
  assert.equal(telegraph.length, 1, 'the commit does not telegraph a second time');
  assert.equal(engaged.length, 1);
});
