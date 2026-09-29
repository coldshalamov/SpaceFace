// §1C row 54 OPTIC-COST / §24 "Collider cost" — the Ceres entry trace's control,
// pinned as a unit test. The probe (scripts/probe-optic-cost-ceres-entry.mjs)
// measured the 42-body gallery's frame cost; timings live in the receipt
// (design/program/roadmap/receipts/OPTIC-COST-ceres-entry-trace.md) because wall
// clocks do not belong in CI. What CI CAN pin is the structure the timing was
// taken over — break any of these and the measured numbers stop describing the
// thing the guard asked about:
//
//   - the anchor is exactly the 42 live bodies the row names;
//   - the stamp is the ONLY difference between the trace's A/B arms (the rock
//     draw and live census are untouched — the delta stays attributable);
//   - the stamp is deterministic per seed (the trace is a fixed-seed close);
//   - entry keeps the lattice field-resident (the quiet-belt cost ~0 claim) and
//     the decode disc is what promotes it (the burst the probe measured).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { tickOpticFieldRocks } from '../src/world/asteroidField.js';
import { world as worldSystem } from '../src/systems/world.js';
import {
  CERES_PRISM_GALLERY_ID,
  CERES_PRISM_GALLERY_ORIGIN,
  compileCeresPrismGallery,
} from '../src/data/opticStructures.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const SEED = 4242;
const CERES = 'sector_ceres_belt';
const DT = 1 / 60;

function boot(seed, suppressOptic) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.maxSpeed = 160;
  const world = Object.assign(Object.create(worldSystem), {});
  if (suppressOptic) world._ensureOpticStructures = () => {};
  world.init({ state, bus, helpers, registry: null });
  return { state, world, player, helpers };
}

function opticRecords(state, sectorId) {
  const field = state.world && state.world.asteroidField;
  return ((field && field.rocks) || []).filter(
    (r) => r.alive !== false && r.data && r.data.opticStructureId
      && (r.homeSectorId === sectorId || (r.data && r.data.homeSectorId === sectorId)),
  );
}

function liveOptic(state, sectorId) {
  return (state.entityList || []).filter(
    (e) => e && e.alive !== false && e.type === 'asteroid' && e.data && e.data.opticStructureId
      && (!sectorId || e.homeSectorId === sectorId || (e.data && e.data.homeSectorId === sectorId)),
  );
}

function stampSignature(state, sectorId) {
  return opticRecords(state, sectorId)
    .map((r) => [r.data.opticStructureId, r.data.opticCell, r.data.opticMaterial,
      r.pos.x, r.pos.z, r.radius].join('|'))
    .sort();
}

test('the Ceres gallery anchor is exactly the 42 live bodies the row names', () => {
  const bodies = compileCeresPrismGallery();
  assert.equal(bodies.length, 42, 'the §24 guard anchors on a 42-body Ceres set');
  const byMaterial = {};
  for (const b of bodies) byMaterial[b.material] = (byMaterial[b.material] || 0) + 1;
  assert.equal(byMaterial.diamond, 15);
  assert.equal(byMaterial.stone, 25);
  assert.equal(byMaterial.metal, 2);
  // Every body is a real collider shape with a tagged material id.
  for (const b of bodies) {
    assert.ok(b.radius > 0);
    assert.ok(/^-?\d+,-?\d+$/.test(`${b.ix},${b.iz}`));
  }
});

test('the trace A/B control: the optic stamp is the ONLY difference entry makes', () => {
  const withGallery = boot(SEED, false);
  withGallery.world.enterSector(CERES);
  const suppressed = boot(SEED, true);
  suppressed.world.enterSector(CERES);

  const prodRecs = opticRecords(withGallery.state, CERES);
  assert.equal(prodRecs.length, 42, 'entry stamps the full gallery');
  assert.equal(opticRecords(suppressed.state, CERES).length, 0, 'control arm suppressed clean');

  // The stamp adds exactly 42 field records and touches nothing else the census counts.
  const prodCensus = withGallery.state.world.asteroidField;
  const suppCensus = suppressed.state.world.asteroidField;
  assert.equal(prodCensus.rocks.length - suppCensus.rocks.length, 42,
    'the A/B delta is exactly the 42 optic records');

  // Same live population both arms — entry promotes no optic body (quiet-belt arm).
  const liveBoth = (st) => st.entityList.filter(
    (e) => e && e.alive !== false && e.type === 'asteroid',
  ).length;
  assert.equal(liveBoth(withGallery.state), liveBoth(suppressed.state),
    'entry must not promote lattice bodies — that is the decode disc\'s job');
  assert.equal(liveOptic(withGallery.state, CERES).length, 0);

  for (const r of prodRecs) {
    assert.equal(r.data.opticStructureId, CERES_PRISM_GALLERY_ID);
    assert.equal(r.data.masslineTetherable, false, 'lattice cells are not ore');
  }
});

test('the entry stamp is seed-deterministic — the trace is a fixed-seed close', () => {
  const a = boot(SEED, false);
  a.world.enterSector(CERES);
  const b = boot(SEED, false);
  b.world.enterSector(CERES);
  const sigA = stampSignature(a.state, CERES);
  assert.equal(sigA.length, 42);
  assert.deepEqual(stampSignature(b.state, CERES), sigA,
    'same seed must stamp byte-identical lattice records');
});

test('the decode disc is what promotes the 42 — the burst the probe measured', () => {
  const { state, world, player, helpers } = boot(SEED, false);
  world.enterSector(CERES);
  assert.equal(liveOptic(state, CERES).length, 0, 'still field-resident after entry');

  // Park inside the disc but OFF the lattice: half a spacing step from the origin
  // cell, so every promote rides the optic-approach path rather than the
  // touch/ram exemption the probe's dead-centre park picked up.
  const g = sectorLocalToGlobalForSector(CERES_PRISM_GALLERY_ORIGIN, CERES);
  player.pos.x = g.x + 32;
  player.pos.z = g.z + 32;
  // Drive the exact per-tick call world.update makes (world.js tickOpticFieldRocks).
  for (let i = 0; i < 3; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + DT;
    tickOpticFieldRocks(state, helpers);
  }
  const promoted = liveOptic(state, CERES);
  assert.equal(promoted.length, 42, 'arrival inside the decode disc promotes the whole lattice');
  for (const e of promoted) {
    assert.equal(e.type, 'asteroid');
    assert.equal(e.collides, true, 'promoted cells are live colliders');
    assert.ok(e.data.opticMaterial in { stone: 1, metal: 1, diamond: 1 });
  }

  // Parked: promotion is stable, not churn — the steady-state arm of the trace.
  state.tick = (state.tick | 0) + 1;
  state.simTime += DT;
  const result = tickOpticFieldRocks(state, helpers);
  assert.equal(result.promoted, 0, 'no re-promotion while parked inside the disc');
  assert.equal(result.shelved, 0, 'no shelving while parked inside the disc');
  assert.equal(liveOptic(state, CERES).length, 42);
});

test('a ship parked dead-centre on a cell refuses that cell\'s admit — the D50 guard holds', () => {
  const { state, world, player, helpers } = boot(SEED, false);
  world.enterSector(CERES);
  const g = sectorLocalToGlobalForSector(CERES_PRISM_GALLERY_ORIGIN, CERES);
  player.pos.x = g.x; // the (0,0) diamond sits exactly here
  player.pos.z = g.z;
  for (let i = 0; i < 3; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + DT;
    tickOpticFieldRocks(state, helpers);
  }
  // 41 promote around the ship; the centred cell stays dormant rather than
  // materializing a collider on the hull (resolveAdmitOverlap, asteroidField.js).
  assert.equal(liveOptic(state, CERES).length, 41);
  const cells = new Set(liveOptic(state, CERES).map((e) => e.data.opticCell));
  assert.ok(!cells.has('0,0'), 'the centred cell is the refused one');
});
