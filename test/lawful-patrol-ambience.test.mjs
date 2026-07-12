import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import { planZoneSpawns } from '../src/data/sectorZones.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';

function plannedPresence() {
  const rng = mulberry32(hash32(321, 'sector_ceres_belt', 'lawful-patrol-ambience'));
  return planZoneSpawns('sector_ceres_belt', 3, [2, 4], rng);
}

function entityFor(intent, id) {
  const entity = makeEnemySpawnSpec(intent.archetypeId, intent.level, intent.pos, {
    factionId: intent.factionId,
  });
  entity.id = id;
  entity.data.ai.spawnContext = intent.context;
  entity.data.ai.zoneId = intent.zoneId;
  entity.data.ai.sectorId = 'sector_ceres_belt';
  entity.data.ai.sectorSecurity = 0.72;
  entity.data.ai.sectorTier = 1;
  return entity;
}

function distance2(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

test('Ceres presence combines neutral lawful patrols with intentional named-zone danger', () => {
  const plan = plannedPresence();
  assert.deepEqual(plannedPresence(), plan, 'zone presence planning is deterministic');

  const patrols = plan.filter((intent) => intent.context === 'patrol');
  const hostiles = plan.filter((intent) => intent.context === 'zone_hostile');
  assert.ok(patrols.length > 0, 'refinery approach keeps a visible lawful patrol');
  assert.ok(hostiles.length > 0, 'ambush and derelict zones keep intentional pirate danger');

  const state = {
    playerId: 1,
    player: { heat: 0 },
    world: { currentSectorId: 'sector_ceres_belt', sectors: { sector_ceres_belt: { security: 0.72, tier: 1 } } },
  };
  for (let i = 0; i < patrols.length; i++) {
    const entity = entityFor(patrols[i], 100 + i);
    assert.equal(entity.data.ai.lawful, true);
    assert.equal(isHostileToPlayer(entity, 0, state), false, 'clean player is not lawful-patrol prey');
  }
  for (let i = 0; i < hostiles.length; i++) {
    const entity = entityFor(hostiles[i], 200 + i);
    assert.ok(entity.data.ai.zoneId, 'pirate danger names its authored zone');
    assert.equal(isHostileToPlayer(entity, 0, state), true, 'authored pirate zone remains dangerous');
  }

  const ceres = SECTORS.find((sector) => sector.id === 'sector_ceres_belt');
  const safeHostiles = hostiles.filter((intent) => {
    const clearOfStations = (ceres.stations || []).every((station) => {
      const stationClearance = 1100 + (station.size === 'S' ? 26 : station.size === 'L' ? 42 : 34);
      return distance2(intent.pos, station.pos) >= stationClearance * stationClearance;
    });
    const clearOfGates = (ceres.gates || []).every((gate) => distance2(intent.pos, gate.pos) >= 900 * 900);
    return clearOfStations && clearOfGates;
  });
  assert.ok(safeHostiles.length > 0,
    'Ceres retains at least one authored pirate pocket outside port and arrival protection');
});
