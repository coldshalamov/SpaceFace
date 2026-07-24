/**
 * Structural proof that remastered weak place assets exist as non-placeholder sources.
 * Drives real filesystem contracts for authored GLBs under assets/ships/parts/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = [
  'place_dock_interior',
  'place_asteroid_rock_a',
  'place_asteroid_rock_b',
  'place_asteroid_rock_c',
  'place_dead_hulk',
  'place_debris_chunk',
];

test('remastered weak place sources are non-trivial GLBs', () => {
  // Legacy place_dock_interior source was ~103KB of pure 12-tri cubes.
  // Remasters must clearly leave that placeholder band.
  const minBytes = {
    place_dock_interior: 1_000_000,
    place_asteroid_rock_a: 150_000,
    place_asteroid_rock_b: 150_000,
    place_asteroid_rock_c: 150_000,
    place_dead_hulk: 150_000,
    place_debris_chunk: 150_000,
  };
  for (const id of ASSETS) {
    const glb = path.join(root, 'assets/ships/parts/places', `${id}.glb`);
    assert.ok(fs.existsSync(glb), `missing source GLB ${id}`);
    const st = fs.statSync(glb);
    const floor = minBytes[id] ?? 150_000;
    assert.ok(st.size > floor, `${id} still placeholder-sized (${st.size} bytes, need > ${floor})`);
  }
});

test('dock interior authored blend exists', () => {
  const blend = path.join(root, 'assets/ships/parts/blender/place_dock_interior_authored.blend');
  assert.ok(fs.existsSync(blend), 'missing dock authored blend');
  assert.ok(fs.statSync(blend).size > 1_000_000, 'dock blend too small');
});
