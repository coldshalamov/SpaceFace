import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SECTORS } from '../src/data/sectors.js';
import { CORRIDOR_SECTOR_IDS } from '../src/data/sectorCoordinates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
const WORLD = read('src/systems/world.js');
const STARMAP = read('src/ui/screens/starmap.js');
const GALAXY_MAP = read('src/ui/galaxyMap.js');
const LOCALMAP = read('src/ui/screens/localmap.js');

function reachableFrom(start) {
  const byId = new Map(SECTORS.map((sector) => [sector.id, sector]));
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const sector = byId.get(queue[head]);
    for (const neighbor of sector?.neighbors || []) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }
  return [...seen];
}

test('canonical SECTORS graph deterministically reaches all 24 regions from Helios', () => {
  assert.equal(SECTORS.length, 24);
  assert.equal(new Set(SECTORS.map((sector) => sector.id)).size, 24);
  assert.equal(reachableFrom('sector_helios_prime').length, 24);
  assert.deepEqual(CORRIDOR_SECTOR_IDS, SECTORS.map((sector) => sector.id));
});

test('every route edge is reciprocal and has a physical gate at both ends', () => {
  const byId = new Map(SECTORS.map((sector) => [sector.id, sector]));
  for (const sector of SECTORS) {
    for (const neighborId of sector.neighbors || []) {
      const neighbor = byId.get(neighborId);
      assert.ok(neighbor, `${sector.id} has unknown neighbor ${neighborId}`);
      assert.ok(neighbor.neighbors.includes(sector.id), `${sector.id}<->${neighborId} is one-way`);
      assert.ok(sector.gates.some((gate) => gate.to === neighborId), `${sector.id} missing gate to ${neighborId}`);
      assert.ok(neighbor.gates.some((gate) => gate.to === sector.id), `${neighborId} missing gate to ${sector.id}`);
    }
  }
});

test('world remains the authoritative route owner; map surfaces emit/read its route', () => {
  assert.match(WORLD, /computeRoute\(targetSectorId, mode = 'fuel'\)/);
  assert.match(WORLD, /this\.state\.nav\.route = route/);
  assert.match(WORLD, /state\.world\.sectors\[id\] \|\| SECTOR_BY_ID\.get\(id\)/);

  for (const [name, source] of [['starmap', STARMAP], ['galaxyMap', GALAXY_MAP]]) {
    assert.match(source, /world:requestRoute/, `${name} must request the world-owned route`);
    assert.match(source, /ui:setCourse/, `${name} must use the existing course event`);
    assert.doesNotMatch(source, /state\.nav\.route\s*=/, `${name} must not own route state`);
  }
  assert.match(LOCALMAP, /state\.nav && state\.nav\.route/);
  assert.match(LOCALMAP, /ui:setCourse/);
  assert.doesNotMatch(LOCALMAP, /state\.nav\.route\s*=/);
});

test('continuous residency transitions do not reset origin or globally wipe entities', () => {
  const enterStart = WORLD.indexOf('enterSector(sectorId, opts = {})');
  const ensureStart = WORLD.indexOf('  _ensureResidencyState()', enterStart);
  assert.ok(enterStart >= 0 && ensureStart > enterStart);
  const enterBody = WORLD.slice(enterStart, ensureStart);
  assert.doesNotMatch(enterBody, /frameOrigin\.(?:x|z)\s*=\s*0/);
  assert.doesNotMatch(enterBody, /_despawnSectorEntities\(/);
  assert.match(enterBody, /continuous/);
  assert.match(enterBody, /noTeleport/);
});
