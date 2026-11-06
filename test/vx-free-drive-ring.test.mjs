// VX-02 — the Cracker Run free-drive ring (sector_helios_prime).
//
// The ring is a place, not a race: authored census-solid props + non-solid buoy markers, spawned
// by world._spawnFreeDriveRing as fixed dressing, plus authored reservation discs fed into
// _arrangerForSector so seeded starter-field scatter never lands inside the lanes. These tests
// pin the four things that make it playable: (1) the furniture EXISTS at the authored spots and
// is real packaged art; (2) the structure props are SOLID at authored radius while the buoys stay
// ghosts; (3) the reservation discs actually re-seat field scatter out of the lanes through the
// real arranger; (4) the whole thing is deterministic and inert in every other sector.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  VX_FREE_DRIVE_SECTOR_ID,
  VX_FREE_DRIVE_POI,
  VX_FREE_DRIVE_STRUCTURES,
  VX_FREE_DRIVE_MARKERS,
  VX_FREE_DRIVE_RESERVATION_DISCS,
  vxFreeDriveStructuresFor,
  vxFreeDriveMarkersFor,
  vxFreeDriveReservationsFor,
} from '../src/data/vxFreeDriveRing.js';
import { SECTORS } from '../src/data/sectors.js';
import { solidDressingPlanFor } from '../src/world/solidDressing.js';
import { ARRANGEMENT_VERSION } from '../src/data/sectorCompositions.js';
import { world } from '../src/systems/world.js';

const SECTOR = SECTORS.find((s) => s.id === VX_FREE_DRIVE_SECTOR_ID);
const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));

test('the ring is authored: unique ids, inside the sector, real packaged art', () => {
  assert.ok(SECTOR, 'sector_helios_prime must exist');
  const ids = VX_FREE_DRIVE_STRUCTURES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'structure ids are unique');
  for (const s of VX_FREE_DRIVE_STRUCTURES) {
    const d = Math.hypot(s.localPos.x, s.localPos.z);
    assert.ok(d <= SECTOR.worldRadius,
      `${s.id} sits at ${d.toFixed(0)} WU, inside the ${SECTOR.worldRadius} WU radius`);
    assert.ok(existsSync(`${PLACES_DIR}${s.placeId}.glb`),
      `${s.id}: ${s.placeId}.glb must be packaged`);
    assert.ok(s.why && s.why.length > 20, `${s.id} has a why`);
  }
  for (const m of VX_FREE_DRIVE_MARKERS) {
    assert.ok(Math.hypot(m.localPos.x, m.localPos.z) <= SECTOR.worldRadius,
      'marker inside the sector radius');
  }
});

test('structure props are solid at authored radius; route buoys stay ghosts', () => {
  for (const s of VX_FREE_DRIVE_STRUCTURES) {
    const plan = solidDressingPlanFor(s.placeId, { radius: s.radius });
    assert.ok(plan, `${s.id} (${s.placeId} @ r${s.radius}) must take a measured-skin collider`);
    assert.ok(plan.silhouetteWu >= 4, `${s.id} silhouette ${plan.silhouetteWu} clears the floor`);
  }
  // Marker buoys must never become a wall: nav buoy at r10 stays under the solid floor.
  assert.equal(solidDressingPlanFor('place_nav_buoy', { radius: 10 }), null,
    'the route breadcrumb stays a ghost marker');
});

test('reservation discs cover the timed lanes; threads stay thread-scale', () => {
  assert.ok(VX_FREE_DRIVE_RESERVATION_DISCS.length >= 12, 'the named lanes are protected');
  for (const disc of VX_FREE_DRIVE_RESERVATION_DISCS) {
    assert.ok(disc.radius >= 55 && disc.radius <= 110,
      `disc at ${disc.localPos.x},${disc.localPos.z} protects a lane, not open field`);
    assert.ok(Math.hypot(disc.localPos.x, disc.localPos.z) <= SECTOR.worldRadius,
      'disc inside the sector radius');
  }
  // The low road forms a contiguous sealed chain — the always-safe line south of the cone.
  // The open field is deliberately unreserved: weaving live scatter is the third honest option.
  const chainContiguous = (rows) => rows.every((a) => rows.some((b) => b !== a
    && Math.hypot(a.localPos.x - b.localPos.x, a.localPos.z - b.localPos.z)
      <= a.radius + b.radius - 10));
  const lowRoad = VX_FREE_DRIVE_RESERVATION_DISCS.filter((d) => d.localPos.z === -525);
  const thread = VX_FREE_DRIVE_RESERVATION_DISCS.filter((d) => d.localPos.z === -540 || d.localPos.z === -455);
  assert.ok(lowRoad.length >= 3 && chainContiguous(lowRoad), 'the low road is a sealed lane');
  assert.ok(thread.length === 2, 'the anvil thread protects its mouth and exit shoulder');
});

function bootHarness() {
  const entities = new Map();
  const entityList = [];
  let nextId = 9001;
  const system = Object.create(world);
  system.helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, type: spec.type, pos: { ...spec.pos },
        rot: spec.rot, radius: spec.radius, mass: spec.mass,
        collides: spec.collides,
        physicsBody: spec.physicsBody && { ...spec.physicsBody },
        data: { ...spec.data } };
      entities.set(ent.id, ent);
      entityList.push(ent);
      return ent;
    },
  };
  system.state = { entities, entityList, meta: { seed: 47 },
    world: { arrangementVersion: ARRANGEMENT_VERSION } };
  return { system, entities };
}

test('the world spawns the ring verbatim on Helios, and nothing anywhere else', () => {
  const { system } = bootHarness();
  const active = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnFreeDriveRing(SECTOR, active);
  const rows = (system.state.world.dressing ? system.state.world.dressing.rows : [])
    .filter((r) => r.data && r.data.worldOneOff === true);
  assert.equal(rows.length,
    VX_FREE_DRIVE_STRUCTURES.length + VX_FREE_DRIVE_MARKERS.length,
    'every structure and marker lands as a dressing row');
  // Helios origin is 0,0: global == local for this sector.
  const gate = rows.find((r) => r.data.name === 'Cracker Run — the Mouth');
  assert.ok(gate, 'the plaza mouth spawns');
  assert.equal(gate.pos.x, 1180);
  assert.equal(gate.pos.z, -30);
  assert.equal(gate.collides, true, 'the mouth takes the solid census collider');
  assert.equal(gate.physicsBody.dynamic, false);
  const buoy = rows.filter((r) => r.data.name === 'Cracker Run marker');
  assert.equal(buoy.length, VX_FREE_DRIVE_MARKERS.length);
  for (const b of buoy) assert.equal(b.collides, false, 'markers never wall off the route');
  // The POI/guidance seam depends on stamped row metadata; the first-pass spawn must apply it
  // even though the dressing table did not exist when the pass began (lazy-table regression).
  for (const r of rows) {
    assert.ok(r.data.vxFreeDriveId, `${r.data.name} carries its ring identity`);
    assert.equal(r.data.vxFreeDrivePoiId, VX_FREE_DRIVE_POI.id,
      `${r.data.name} is bound to the Cracker Run POI`);
  }
  // Other sectors: completely inert.
  const ceres = SECTORS.find((s) => s.id === 'sector_ceres_belt');
  const before = system.state.world.dressing.rows.length;
  system._spawnFreeDriveRing(ceres, active);
  assert.equal(system.state.world.dressing.rows.length, before, 'no ring rows outside Helios');
});

test('the arranger re-seats scatter out of every reservation lane', () => {
  const { system } = bootHarness();
  const active = { pois: [], stations: [], gates: [], dressing: [] };
  const arranger = system._arrangerForSector(SECTOR, active);
  assert.ok(arranger, 'the sector arranger exists');
  const field = SECTOR.fields.find((f) => f.id === 'f_helios_starter');
  const reservations = vxFreeDriveReservationsFor(SECTOR.id, (p) => p);
  const insideLane = (pos, pad = 0) => reservations.some(
    (r) => Math.hypot(pos.x - r.pos.x, pos.z - r.pos.z) < r.radius + pad);
  let moved = 0;
  let keptInside = 0;
  for (const disc of reservations) {
    // Fresh field per disc: production scatter lands a handful of rocks in any one lane,
    // not the whole probe set — peers accumulate the way they do at spawn time.
    const live = arranger.createField(field, { x: field.center.x, z: field.center.z },
      field.clusterRadius);
    assert.ok(live && typeof live.place === 'function');
    for (const frac of [-0.4, 0, 0.4]) {
      const original = { x: disc.pos.x + frac * disc.radius, z: disc.pos.z };
      const out = live.place(original, 12, 3);
      if (out.x === original.x && out.z === original.z) { keptInside++; continue; }
      moved++;
      assert.ok(!insideLane(out, 12),
        `re-seated rock must leave the lane (${out.x.toFixed(0)},${out.z.toFixed(0)})`);
    }
  }
  assert.ok(moved > 0, 'the arranger actually relocated lane intruders');
  assert.ok(keptInside === 0, 'no rock kept a lane-interior slot as fallback');
});

test('world.js wires the ring inside the sector materialize sequence', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const source = readFileSync(fileURLToPath(new URL('../src/systems/world.js', import.meta.url)), 'utf8');
  assert.match(source,
    /this\._spawnWorldOneOffs\(sector, active\);\s*\n\s*this\._spawnFreeDriveRing\(sector, active\);/,
    'the ring pass runs in the materialize dressing sequence directly after one-offs');
  assert.match(source, /vxFreeDriveReservationsFor\(sector\.id/,
    'the lane discs feed the sector arranger before scatter placement');
});

test('reservation helper emits global hops and stays inert off-sector', () => {
  const hop = vxFreeDriveReservationsFor(SECTOR.id, (p) => ({ x: p.x + 1000, z: p.z }));
  assert.equal(hop.length, VX_FREE_DRIVE_RESERVATION_DISCS.length);
  assert.equal(hop[0].pos.x, VX_FREE_DRIVE_RESERVATION_DISCS[0].localPos.x + 1000,
    'non-origin sectors get the galactic hop');
  assert.equal(vxFreeDriveReservationsFor('sector_ceres_belt', (p) => p).length, 0);
  assert.equal(vxFreeDriveStructuresFor('sector_ceres_belt').length, 0);
  assert.equal(vxFreeDriveMarkersFor('sector_ceres_belt').length, 0);
});
