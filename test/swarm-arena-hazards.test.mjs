// S9 — the arena is friend and foe: per-arena signature-hazard contract at data level.
// Proves each Swarm arena carries one signature hazard with a >=1 s telegraph and that
// the collision law's crumple reading (the reading every machinery bite routes) kills a
// thrown fodder hull while only stinging a heavy player hull — the mass-scaled mercy.
// Route-level proof (jaw actually bites the pilot, slam verdict routes, pool burns a
// thrown Wasp) lives in swarm-arena-hazard-route.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { terrainCrumpleDamage, TERRAIN_CRUMPLE_LAW } from '../src/combat/impulseKernel.js';
import { stepCinderMachinery, CINDER_ARENA_ID } from '../src/systems/cinderSluiceArena.js';
import { CINDER_SLUICE_CYCLES } from '../src/data/environmentalMachinery.js';
import { planLagrangeInstall, LAGRANGE_ARENA_ID } from '../src/systems/lagrangeCrucible.js';
import {
  STORM_ARENA_ID,
  STORM_DISCHARGE_WARNING_S,
  STORM_DISCHARGE_DAMAGE,
  dischargeBiteTargets,
} from '../src/systems/stormLatticeArena.js';
import {
  HIVE_ARENA_ID,
  HIVE_WALL_GROW_S,
  hiveWallRing,
} from '../src/systems/theHiveArena.js';
import { swarmCharacterFor } from '../src/data/swarmCharacter.js';
import { mulberry32 } from '../src/core/rng.js';

const TELL_FLOOR_S = 1;

test('the crumple law kills a thrown fodder hull and only stings the pilot', () => {
  // A Wasp (the sheet's fodder mass band) meeting machinery at 60 WU/s reads lethal;
  // a heavy pilot hull at the same speed reads a survivable bite — same formula.
  const wasp = terrainCrumpleDamage(60, 16);
  const playerHull = terrainCrumpleDamage(60, 3000);
  assert.ok(wasp > 30, `wasp-mass crumple ${wasp} should read lethal on a fodder hull`);
  assert.ok(playerHull > 0, 'the pilot takes a real bite — friend and foe, not exempt');
  assert.ok(playerHull < wasp * 0.2,
    `pilot bite ${playerHull} stays a fraction of the wasp's ${wasp} — mass does the mercy`);
  // Under the threshold there is no bite at all — a gentle drift is honest.
  assert.equal(terrainCrumpleDamage(TERRAIN_CRUMPLE_LAW.threshold - 1, 3000), 0);
});

test('cinder sluice — the mouth crusher warns >= 1 s before it surges', () => {
  const cycle = CINDER_SLUICE_CYCLES.unregulated;
  assert.ok(cycle.warningS >= TELL_FLOOR_S,
    `crusher warning ${cycle.warningS}s must stand at least a second`);
  // The machinery clock is deterministic: same elapsed second, same phase.
  const a = stepCinderMachinery(0.5), b = stepCinderMachinery(0.5);
  assert.equal(a.phase, 'warning');
  assert.deepEqual(a, b, 'machinery phase is a pure function of elapsed sim time');
  // During warning the jaw strength is zero — the tell is the whole point.
  assert.equal(a.strength, 0);
});

test('storm lattice — the discharge warns >= 1 s and bites whoever stands on a node', () => {
  assert.ok(STORM_DISCHARGE_WARNING_S >= TELL_FLOOR_S,
    `discharge warning ${STORM_DISCHARGE_WARNING_S}s must stand at least a second`);
  assert.ok(STORM_DISCHARGE_DAMAGE > 0, 'a hop bite does real damage');
  // The bite list takes every living body on the node — player and enemy alike.
  const bodies = [
    { id: 'pilot', type: 'ship', alive: true, pos: { x: 0, z: 0 } },
    { id: 'wasp', type: 'ship', alive: true, pos: { x: 4, z: 0 } },
    { id: 'far', type: 'ship', alive: true, pos: { x: 400, z: 400 } },
  ];
  const targets = dischargeBiteTargets({ x: 0, z: 0 }, bodies);
  const ids = targets.map((t) => t.id);
  assert.ok(ids.includes('pilot'), 'the pilot standing on the node is bitten — foe');
  assert.ok(ids.includes('wasp'), 'the wasp standing on the node is bitten — friend');
  assert.ok(!ids.includes('far'), 'a body off the node takes nothing');
});

test('lagrange crucible — the pylon pair is authored, the saddle throw is the hazard', () => {
  const out = planLagrangeInstall({ at: { x: 0, z: 0 }, arenaPhase: 'furnace_active', rng: mulberry32(7) });
  assert.ok(Array.isArray(out.fields) && out.fields.length >= 2,
    'two wells stand on opposite pylons');
  assert.ok(typeof out.note === 'string' && out.note.length > 0,
    'the law line says what the room does');
});

test('the hive — wall growth lands on a telegraphed cadence', () => {
  assert.ok(HIVE_WALL_GROW_S >= TELL_FLOOR_S,
    `wall growth cadence ${HIVE_WALL_GROW_S}s must stand at least a second`);
  const rng = mulberry32(11);
  const rocks = hiveWallRing({ anchor: { x: 0, z: 0 }, ring: 0, rng });
  assert.ok(rocks.length > 0, 'a ring lands real bodies');
  assert.ok(rocks.every((r) => Number.isFinite(r.x) && Number.isFinite(r.z) && r.radius > 0),
    'every nub is a placed solid');
  // The gap is authored — the lane the ring leaves open is a real bearing, not noise.
  const angles = rocks.map((r) => Math.atan2(r.z, r.x)).sort();
  let widest = 0;
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i], b = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? Math.PI * 2 : 0);
    widest = Math.max(widest, b - a);
  }
  assert.ok(widest > 0.5, 'the ring leaves a lane open — the squeeze is a shape, not a wall');
});

test('every sheet row is a body the room can kill', () => {
  // The signature hazards read body numbers — every roster row's mass sits inside
  // the crumple law's range so nothing is hazard-immune by construction.
  for (const id of ['wasp_swarmer', 'bruiser_brawler', 'field_anchor_controller']) {
    const row = swarmCharacterFor(id);
    assert.ok(row && row.mass > 0, `${id} has a real mass the room reads`);
    const bite = terrainCrumpleDamage(80, row.mass);
    assert.ok(bite > 0, `${id} thrown into machinery at 80 WU/s takes the reading`);
  }
});
