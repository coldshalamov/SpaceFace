// PQ-143.02 — six texture one-offs. The set pieces are non-systemic by design: no mission, no
// scan gate, no economy hook — the assertion set therefore pins the three things the leaf's
// done-when names: they are AUTHORED (always exactly where the data says, no seed/epoch), they
// are PLACED AND REACHABLE on the default route (anchors resolve inside the starting sectors'
// radius, against real station/gate rows), and they are REAL (every placeId has its packaged
// prop on disk; the fast courier flies a role whose live speed really is far too fast).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { NAMED_LANE_CONTACTS } from '../src/data/laneContacts.js';
import { SECTORS } from '../src/data/sectors.js';
import { world } from '../src/systems/world.js';
import { TRAFFIC_ROLES } from '../src/systems/traffic.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));

test('the placed one-offs exist, plus the too-fast courier', () => {
  assert.equal(WORLD_ONE_OFFS.length, 6, 'six placed set pieces in worldOneOffs.js');
  const courier = NAMED_LANE_CONTACTS.find((c) => c.id === 'lane_cinder_run_courier');
  assert.ok(courier, 'the named express courier still lives in laneContacts.js');
  const ids = WORLD_ONE_OFFS.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'one-off ids are unique');
});

test('every one-off is authored against a real anchor inside the sector radius', () => {
  for (const oneOff of WORLD_ONE_OFFS) {
    const sector = SECTOR_BY_ID.get(oneOff.sectorId);
    assert.ok(sector, `${oneOff.id}: sector ${oneOff.sectorId} must exist`);
    const anchorPos = world._oneOffAnchorPos(sector, oneOff.anchor);
    assert.ok(anchorPos, `${oneOff.id}: anchor ${oneOff.anchor.type}:${oneOff.anchor.id} must resolve in ${sector.id}`);
    const pos = {
      x: anchorPos.x + oneOff.offsetLocal.x,
      z: anchorPos.z + oneOff.offsetLocal.z,
    };
    const dist = Math.hypot(pos.x, pos.z);
    assert.ok(dist <= sector.worldRadius,
      `${oneOff.id} sits at ${dist.toFixed(0)} WU from origin, inside ${sector.id}'s ${sector.worldRadius} WU radius`);
    if (oneOff.cluster) {
      for (const part of oneOff.cluster.props) {
        const d = Math.hypot(pos.x + part.dx, pos.z + part.dz);
        assert.ok(d <= sector.worldRadius, `${oneOff.id} cluster part stays inside the sector radius`);
      }
    }
    // Reachable on the default route: the start sector, the first hop, or a sector whose gate
    // sits in the start sector's neighbor list.
    assert.ok(
      oneOff.sectorId === 'sector_helios_prime'
      || SECTOR_BY_ID.get('sector_helios_prime').neighbors.includes(oneOff.sectorId),
      `${oneOff.id} must be reachable without leaving the starter pocket`,
    );
  }
});

test('every placed one-off prop is real packaged art on disk, and the spin is texture-quiet', () => {
  for (const oneOff of WORLD_ONE_OFFS) {
    assert.ok(existsSync(`${PLACES_DIR}${oneOff.placeId}.glb`),
      `${oneOff.id}: ${oneOff.placeId}.glb must be packaged`);
    if (oneOff.cluster) {
      for (const part of oneOff.cluster.props) {
        assert.ok(existsSync(`${PLACES_DIR}${part.placeId}.glb`), `${oneOff.id} cluster: ${part.placeId}.glb must be packaged`);
      }
    }
    if (oneOff.spin) {
      assert.ok(oneOff.spin > 0 && oneOff.spin <= 0.5,
        `${oneOff.id}: spin ${oneOff.spin} rad/s reads as a slow tumble, not a carnival ride`);
    }
  }
});

test('the courier is far too fast: her role flies at liner sprint, not courier cruise', () => {
  const courier = NAMED_LANE_CONTACTS.find((c) => c.id === 'lane_cinder_run_courier');
  const express = TRAFFIC_ROLES[courier.role];
  assert.ok(express && express.express === true, 'the courier must fly the express role (live V3 boost intent)');
  const ordinary = TRAFFIC_ROLES.courier;
  assert.ok(express.speed >= ordinary.speed * 3,
    `express ${express.speed} WU/s must be far too fast against courier cruise ${ordinary.speed} WU/s`);
  // She is a deterministic fixture of the START sector only: never in a generic pick pool
  // (adding her to Ceres's pool displaced that sector's authored cast), so her sector list is
  // exactly the start sector and traffic.js stamps her own dedicated slot there.
  assert.deepEqual([...courier.sectorIds], ['sector_helios_prime'],
    'the courier is a fixture of the start sector, not a pool pick');
});

function bootOneOffHarness() {
  const spawned = [];
  let nextId = 9001;
  const entities = new Map();
  const system = Object.create(world);
  system.helpers = {
    spawnEntity(spec) {
      const ent = {
        id: nextId++,
        type: spec.type,
        pos: { ...spec.pos },
        rot: spec.rot,
        radius: spec.radius,
        data: { ...spec.data },
      };
      spawned.push(ent);
      entities.set(ent.id, ent);
      return ent;
    },
  };
  system.state = { entities, meta: { seed: 47 } };
  // One-off props are dressing rows (insertDressingRow → state.world.dressing), not live
  // spawnEntity actors — the assertions read the table the props actually land in.
  const dressingRows = () => (system.state.world && system.state.world.dressing
    ? system.state.world.dressing.rows : []);
  return { system, spawned, dressingRows, entities };
}

test('the world spawns the one-offs verbatim on sector activation, and spins the tug', () => {
  const { system, dressingRows } = bootOneOffHarness();

  // Ceres Belt: the tug, the shrine, the ram, and the pod-field cluster (1 hero + 7 shells).
  const ceres = SECTOR_BY_ID.get('sector_ceres_belt');
  const activeCeres = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(ceres, activeCeres);
  assert.equal(activeCeres.dressing.length, 11, 'tug + shrine + ram + the pod field (1 hero + 7 shells)');
  for (const prop of dressingRows()) {
    assert.equal(prop.data.worldOneOff, true,
      'every one-off prop carries the additive-dressing flag the PQ-020 census classifies by');
  }
  const tug = dressingRows().find((e) => e.data.name === 'The Long Berth — an abandoned yard tug');
  assert.ok(tug, 'the abandoned tug spawns');
  const station = ceres.stations.find((s) => s.id === 'station_ceres');
  assert.equal(tug.pos.x, station.pos.x - 260, 'the tug sits exactly where the data says, no rng');
  assert.equal(tug.pos.z, station.pos.z + 240);
  assert.equal(tug.rot, 2.1);
  const shrine = dressingRows().find((e) => e.data.name === 'The Strut Shrine');
  assert.ok(shrine, 'the strut shrine spawns');
  assert.equal(shrine.pos.x, station.pos.x + 980, 'the shrine hangs across the refinery approach');
  assert.equal(shrine.pos.z, station.pos.z + 1140);

  // The spin is tracked and the tick advances exactly the tracked prop — one second moves the
  // tug by its spin and NOTHING else (snapshot every prop's rot before the tick).
  assert.equal(activeCeres.worldOneOffSpins.length, 1, 'only the tug carries a spin in Ceres');
  assert.equal(activeCeres.worldOneOffSpins[0].id, tug.id);
  const rotBefore = new Map(dressingRows().map((p) => [p.id, p.rot]));
  system._tickWorldOneOffSpin(1, { world: { activeSector: activeCeres } });
  assert.ok(Math.abs(tug.rot - (rotBefore.get(tug.id) + 0.32)) < 1e-9, 'one second advances the tug by its spin');
  for (const prop of dressingRows()) {
    if (prop === tug) continue;
    assert.equal(prop.rot, rotBefore.get(prop.id),
      `${prop.data.name || prop.data.placeId} must never be spun`);
  }

  // Helios Prime: only the great tanker (the shrine lives in Ceres now).
  const helios = SECTOR_BY_ID.get('sector_helios_prime');
  const activeHelios = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(helios, activeHelios);
  assert.equal(activeHelios.dressing.length, 1, 'the tanker alone sits in the start sector');
  assert.equal(activeHelios.worldOneOffSpins, undefined, 'the tanker does not spin');
});

test('world.js owns the pass end to end: spawn on dressing, tick in update, reset on strip', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/systems/world.js', import.meta.url)), 'utf8');
  assert.match(source, /import \{ WORLD_ONE_OFFS \} from '\.\.\/data\/worldOneOffs\.js';/,
    'the one-off data is imported, not duplicated');
  assert.match(source, /this\._spawnWreckAftermathDressing\(sector, active, paletteClass\);\s*\n\s*this\._spawnWorldOneOffs\(sector, active\);/,
    'the one-off pass runs with the other dressing passes on sector activation');
  assert.match(source, /this\._tickWorldOneOffSpin\(dt, state\);/,
    'the spin ticks inside world.update');
  assert.match(source, /active\.worldOneOffSpins = \[\];/,
    'the spin list resets with the sector dressing on deactivation');
});

test('every placed set piece resolves an authored body — a named prop can never go invisible', async () => {
  const { resolvePlaceFileForEntity } = await import('../src/render/partsLibrary.js');
  const { system, dressingRows } = bootOneOffHarness();

  for (const sector of SECTORS) {
    const active = { pois: [], stations: [], gates: [], dressing: [] };
    system._spawnWorldOneOffs(sector, active);
  }
  assert.ok(dressingRows().length >= 12, 'all one-off rows spawn across the sectors');
  for (const prop of dressingRows()) {
    assert.ok(
      resolvePlaceFileForEntity({ type: 'fx', data: prop.data }),
      `${prop.data.name || prop.data.placeId} (${prop.data.placeId}) must resolve a place file`,
    );
  }

  // A landmark POI may name a body that lives only in the family maps: the marker is a
  // deliberate authored placement, so the family file must resolve — or the scanner leads the
  // player to a marker floating over empty space.
  assert.ok(
    resolvePlaceFileForEntity({
      type: 'fx',
      data: { poi: true, landmark: true, placeId: 'place_maintenance_gantry' },
    }),
    'a landmark POI naming a family-map body must still resolve its authored file',
  );

  // The gate stays shut for rows it was built for: an undecorated dressing row naming a family
  // id still resolves nothing — random census dressing must not leak into authored families.
  assert.equal(
    resolvePlaceFileForEntity({ type: 'fx', data: { placeId: 'place_maintenance_gantry' } }),
    null,
    'a bare dressing row without the family or set-piece flags stays unadmitted',
  );
});
