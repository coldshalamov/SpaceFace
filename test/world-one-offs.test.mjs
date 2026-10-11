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
import { AUTHORED_DOCK_RUMORS } from '../src/data/frontierRumors.js';
import { NAMED_LANE_CONTACTS } from '../src/data/laneContacts.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector, sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { world } from '../src/systems/world.js';
import { stableRecordId, RECORD_KIND } from '../src/world/worldRecords.js';
import { TRAFFIC_ROLES } from '../src/systems/traffic.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));

test('the placed one-offs exist, plus the too-fast courier', () => {
  assert.equal(WORLD_ONE_OFFS.length, 32,
    'thirty-two placed set pieces: the nine beside places, the four CV-QUIET detours on the legs, plus nineteen for per-sector coverage');
  const courier = NAMED_LANE_CONTACTS.find((c) => c.id === 'lane_cinder_run_courier');
  assert.ok(courier, 'the named express courier still lives in laneContacts.js');
  const ids = WORLD_ONE_OFFS.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'one-off ids are unique');
});

test('CV-QUIET: the flight between jobs is a place, not a loading corridor', () => {
  // A detour is worth one of four things in this universe. All four are on the default route, all
  // four are in the OPEN TRANSIT rather than beside the place they were anchored from, and no two
  // are the same kind of detour - the thin answer is four flavours of wreckage.
  const KINDS = Object.freeze({
    body: 'oneoff_spare_keg',
    job: 'oneoff_half_shift',
    signal: 'oneoff_answering_buoy',
    joke: 'oneoff_the_settling',
  });
  const byId = new Map(WORLD_ONE_OFFS.map((o) => [o.id, o]));
  for (const [kind, id] of Object.entries(KINDS)) {
    assert.ok(byId.has(id), `the default route has a detour that is ${kind}: ${id}`);
  }

  for (const id of Object.values(KINDS)) {
    const oneOff = byId.get(id);
    assert.equal(oneOff.sectorId, 'sector_helios_prime',
      `${id} is on the default route, in the start sector`);
    const sector = SECTOR_BY_ID.get(oneOff.sectorId);
    const anchorPos = world._oneOffAnchorPos(sector, oneOff.anchor);
    const off = Math.hypot(oneOff.offsetLocal.x, oneOff.offsetLocal.z);
    assert.ok(off > 200,
      `${id} is ${off.toFixed(0)} WU off its anchor - out on the leg, not station dressing`);
  }

  // A body is a body: ropeable, with mass the existing rope/shove can actually feel.
  const body = byId.get(KINDS.body);
  assert.ok(body.physicalBody && body.physicalBody.mass > 0,
    `${KINDS.body} carries a physical body, not a billboard`);

  // A job already underway reads as a worksite: more than one prop, mid-task.
  const job = byId.get(KINDS.job);
  assert.ok(job.cluster && job.cluster.props.length >= 2,
    `${KINDS.job} is a worksite with parts, not one prop`);

  // A signal is readable furniture.
  const signal = byId.get(KINDS.signal);
  assert.ok(signal.cluster && signal.cluster.props.length >= 1,
    `${KINDS.signal} has its supporting furniture`);

  // A joke the physics tells is a shape in space - the spacing widens, so it reads as sorted.
  const joke = byId.get(KINDS.joke);
  assert.ok(joke.cluster && joke.cluster.props.length >= 3, `${KINDS.joke} is a scatter that reads`);
  const spacings = joke.cluster.props.map((p) => Math.hypot(p.dx, p.dz));
  for (let i = 1; i < spacings.length; i++) {
    assert.ok(spacings[i] > spacings[i - 1],
      `${KINDS.joke} spreads out with distance: heavy clumped, light strung out`);
  }

  // Every detour has a reason a stranger can read in one sentence.
  for (const id of Object.values(KINDS)) {
    assert.ok(byId.get(id).why && byId.get(id).why.length > 20, `${id} has a why`);
  }
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
  }
});

test('CR-TEXTURE-1: every named sector has a reachable one-off', () => {
  const bySector = new Map();
  for (const oneOff of WORLD_ONE_OFFS) {
    if (!bySector.has(oneOff.sectorId)) bySector.set(oneOff.sectorId, []);
    bySector.get(oneOff.sectorId).push(oneOff);
  }
  for (const sector of SECTORS) {
    // Interior hosts (The Bolus) materialize their own volume and skip the one-off dressing pass.
    if (sector.interiorHost) continue;
    assert.ok(
      (bySector.get(sector.id) || []).length >= 1,
      `${sector.id} has no one-off — every named place gets one reachable surprise`,
    );
  }

  // Reachability: starter-pocket one-offs are on the default route (skyline); every other
  // sector reaches the same bar through an authored bar lead at one of its own stations,
  // so a stranger can dock, ask for rumors, and fly to the thing.
  const STARTER_POCKET = new Set([
    'sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction',
    'sector_vesta_forge', 'sector_io_reach',
  ]);
  for (const sector of SECTORS) {
    if (STARTER_POCKET.has(sector.id) || sector.interiorHost) continue;
    const stations = sector.stations || [];
    assert.ok(
      stations.some((s) => AUTHORED_DOCK_RUMORS[s.id]),
      `${sector.id} has no authored bar lead at any of its stations`,
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
  const entityList = [];
  const system = Object.create(world);
  system.helpers = {
    spawnEntity(spec) {
      const ent = {
        id: nextId++,
        type: spec.type,
        pos: { ...spec.pos },
        rot: spec.rot,
        angVel: spec.angVel,
        radius: spec.radius,
        mass: spec.mass,
        collides: spec.collides,
        physicsBody: spec.physicsBody && { ...spec.physicsBody },
        data: { ...spec.data },
      };
      spawned.push(ent);
      entities.set(ent.id, ent);
      entityList.push(ent);
      return ent;
    },
  };
  system.state = { entities, entityList, meta: { seed: 47 } };
  // One-off props are dressing rows (insertDressingRow → state.world.dressing), not live
  // spawnEntity actors — the assertions read the table the props actually land in.
  const dressingRows = () => (system.state.world && system.state.world.dressing
    ? system.state.world.dressing.rows : []);
  return { system, spawned, dressingRows, entities };
}

test('the world spawns the one-offs verbatim on sector activation, and spins the tug', () => {
  const { system, dressingRows, entities } = bootOneOffHarness();

  // Ceres Belt: the tug, the shrine, the ram, and the pod-field cluster (1 hero + 7 shells).
  const ceres = SECTOR_BY_ID.get('sector_ceres_belt');
  const activeCeres = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(ceres, activeCeres);
  assert.equal(activeCeres.dressing.length, 11, 'tug + shrine + ram + the pod field (1 hero + 7 shells)');
  for (const prop of dressingRows()) {
    assert.equal(prop.data.worldOneOff, true,
      'every one-off prop carries the additive-dressing flag the PQ-020 census classifies by');
  }
  const tug = [...entities.values()].find((e) => e.data.name === 'The Long Berth — an abandoned yard tug');
  assert.ok(tug, 'the abandoned tug spawns as a live physical body');
  assert.equal(tug.type, 'wreck');
  assert.equal(tug.collides, true);
  assert.equal(tug.data.masslineTetherable, true);
  const station = ceres.stations.find((s) => s.id === 'station_ceres');
  // Entities and dressing rows live in galactic-global space; the authored anchor pos is
  // sector-local (Ceres sits at a non-zero galactic origin), so the pin composes the same
  // hop the spawn pass must make.
  const stationGlobal = sectorLocalToGlobalForSector(station.pos, ceres.id);
  assert.equal(tug.pos.x, stationGlobal.x - 260, 'the tug sits exactly where the data says, no rng');
  assert.equal(tug.pos.z, stationGlobal.z + 240);
  assert.equal(tug.rot, 2.1);
  const shrine = dressingRows().find((e) => e.data.name === 'The Strut Shrine');
  assert.ok(shrine, 'the strut shrine spawns');
  assert.equal(shrine.pos.x, stationGlobal.x + 980, 'the shrine hangs across the refinery approach');
  assert.equal(shrine.pos.z, stationGlobal.z + 1140);

  // The tug's authored spin is angular velocity owned by physics; it is no longer a render-only
  // mutation in the dressing spin list.
  assert.equal(tug.angVel, 0.32);
  assert.equal(activeCeres.worldOneOffSpins, undefined, 'the physical tug is not double-spun as dressing');
  const rotBefore = new Map(dressingRows().map((p) => [p.id, p.rot]));
  system._tickWorldOneOffSpin(1, { world: { activeSector: activeCeres } });
  for (const prop of dressingRows()) {
    assert.equal(prop.rot, rotBefore.get(prop.id),
      `${prop.data.name || prop.data.placeId} must never be spun`);
  }

  // Helios Prime: the great tanker plus the four CV-QUIET lane detours and their furniture.
  const helios = SECTOR_BY_ID.get('sector_helios_prime');
  const activeHelios = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(helios, activeHelios);
  const heliosOneOffs = WORLD_ONE_OFFS.filter((o) => o.sectorId === 'sector_helios_prime');
  const expectedRows = heliosOneOffs.reduce((total, o) => total + 1 + (o.cluster ? o.cluster.props.length : 0), 0);
  assert.equal(activeHelios.dressing.length, expectedRows,
    'every Helios one-off and every cluster part lands as dressing');
  assert.equal(heliosOneOffs.length, 5,
    'the tanker plus the four detours (body, job, signal, joke) sit in the start sector');
  // The spare keg is a physical body, so its tumble is its own angVel and it is never double-spun
  // as dressing. Only the two non-physical tumbling detours join the spin list.
  assert.ok(activeHelios.worldOneOffSpins, 'the tumbling detours spin as dressing');
  assert.equal(activeHelios.worldOneOffSpins.length, 2,
    'exactly the two non-physical tumbling detours are spun as dressing');
  const spunNames = activeHelios.worldOneOffSpins
    .map((row) => {
      const prop = dressingRows().find((p) => p.id === row.id);
      return (prop && prop.data && prop.data.name) || '';
    })
    .sort();
  assert.equal(spunNames.length, 2);
  assert.ok(spunNames.some((n) => n.includes('Answering Buoy')), 'the signal tumbles slowly');
  assert.ok(spunNames.some((n) => n.includes('Settling')), 'the joke tumbles slowly');
  const keg = [...entities.values()].find((e) => e.data && e.data.oneOffId === 'oneoff_spare_keg');
  assert.ok(keg && keg.angVel === 0.12, 'the spare keg tumbles as its own physical body');
});

test('D176: a non-origin sector spawns its one-off in its own space, not beside Helios', () => {
  // The defect signature: anchor + offset composed local-as-global put Vesta's Runaway
  // Ladle at (-720,380) galactic - inside Helios space - instead of Vesta's (0,16384) slab.
  const { system, entities } = bootOneOffHarness();
  const vesta = SECTOR_BY_ID.get('sector_vesta_forge');
  const origin = sectorGlobalOrigin(vesta.id);
  assert.ok(Math.abs(origin.x) + Math.abs(origin.z) > 1000,
    'Vesta is a non-origin sector - this pin cannot pass on a 0,0 origin');
  const active = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(vesta, active);
  const ladle = [...entities.values()].find((e) => e.data && e.data.oneOffId === 'oneoff_runaway_ladle');
  assert.ok(ladle, 'the Runaway Ladle spawns as a live body');
  const anchor = vesta.stations.find((s) => s.id === 'station_forge');
  const anchorGlobal = sectorLocalToGlobalForSector(anchor.pos, vesta.id);
  assert.equal(ladle.pos.x, anchorGlobal.x - 720, 'the ladle berths beside Forge Foundry in Vesta space');
  assert.equal(ladle.pos.z, anchorGlobal.z + 380);
  // And the dressing rows the map/renderer read carry the same global frame.
  const rows = (system.state.world && system.state.world.dressing
    ? system.state.world.dressing.rows : []);
  for (const row of rows) {
    const localD = Math.hypot(row.pos.x - origin.x, row.pos.z - origin.z);
    assert.ok(localD <= vesta.worldRadius,
      `${row.data && row.data.name}: dressing row must sit inside Vesta's radius, not at origin ${Math.hypot(row.pos.x, row.pos.z).toFixed(0)}`);
  }
});

test('D176: a body stranded at the pre-fix spot re-seats; a hauled wreck keeps its pose', () => {
  const vesta = SECTOR_BY_ID.get('sector_vesta_forge');
  const ladleOff = WORLD_ONE_OFFS.find((o) => o.id === 'oneoff_runaway_ladle');
  const anchor = vesta.stations.find((s) => s.id === 'station_forge');
  const buggyLocal = { x: anchor.pos.x + ladleOff.offsetLocal.x, z: anchor.pos.z + ladleOff.offsetLocal.z };
  const trueGlobal = sectorLocalToGlobalForSector(buggyLocal, vesta.id);
  const recordId = stableRecordId(47, vesta.id, RECORD_KIND.WRECK, `worldOneOff:${ladleOff.id}`);

  // The stranded case: a live record-carrier parked exactly at the pre-D176 local-as-global
  // coordinates was never player-moved — re-materialize re-seats it beside its anchor.
  {
    const { system, entities } = bootOneOffHarness();
    const stranded = {
      id: 42, type: 'wreck', alive: true,
      pos: { x: buggyLocal.x, z: buggyLocal.z },
      vel: { x: 0, z: 0 },
      data: { worldRecordId: recordId, placeId: ladleOff.placeId },
    };
    entities.set(stranded.id, stranded);
    system.state.entityList.push(stranded);
    system._spawnWorldOneOffs(vesta, { pois: [], stations: [], gates: [], dressing: [] });
    assert.equal(stranded.pos.x, trueGlobal.x, 'the stranded ladle re-seats in Vesta space');
    assert.equal(stranded.pos.z, trueGlobal.z);
    assert.equal(stranded.flags.noInterp, true, 'the re-seat skips render interpolation');
    assert.equal(stranded.vel.x, 0, 'a re-seated body carries no leftover drift');
  }

  // The hauled case: a record-carrier a real tow moved 500 WU off the buggy spot keeps its
  // player-made pose — the window covers stranded drift, not deliberate hauls.
  {
    const { system, entities } = bootOneOffHarness();
    const hauled = {
      id: 43, type: 'wreck', alive: true,
      pos: { x: buggyLocal.x + 500, z: buggyLocal.z },
      vel: { x: 0, z: 0 },
      data: { worldRecordId: recordId, placeId: ladleOff.placeId },
    };
    entities.set(hauled.id, hauled);
    system.state.entityList.push(hauled);
    system._spawnWorldOneOffs(vesta, { pois: [], stations: [], gates: [], dressing: [] });
    assert.equal(hauled.pos.x, buggyLocal.x + 500,
      'a wreck the player hauled off the buggy spot is not yanked back');
    assert.equal(hauled.pos.z, buggyLocal.z);
  }
});

test('world.js owns the pass end to end: spawn on dressing, tick in update, reset on strip', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/systems/world.js', import.meta.url)), 'utf8');
  assert.match(source, /import \{ WORLD_ONE_OFFS \} from '\.\.\/data\/worldOneOffs\.js';/,
    'the one-off data is imported, not duplicated');
  // The materialize scheduler interleaves a yield marker between dressing passes; the pin is
  // that one-offs run in the same dressing sequence directly after wreck aftermath, not that
  // no scheduler beat sits between the calls.
  assert.match(source, /this\._spawnWreckAftermathDressing\(sector, active, paletteClass\);\s*\n\s*(?:yield 'materialize:dressing-wrecks';\s*\n\s*)?this\._spawnWorldOneOffs\(sector, active\);/,
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
    const pid = String(prop.data.placeId || '');
    // CR-BERTH-2: the Afterwake slip's crib rows are procedural kit — `alien_growth_*` and
    // `machine_*` placeIds author geometry in buildFallbackPlaceProp, not a GLB file. The
    // census' no-invisible-prop law holds through the same prefix the renderer resolves on.
    if (pid.startsWith('alien_growth_') || pid.startsWith('machine_')) {
      assert.ok(
        prop.data.berthId != null || prop.data.worldOneOff === true || prop.data.poi === true
          || prop.data.landmark === true || prop.data.activityObjectSlotId != null,
        `${prop.data.name || pid} (${pid}) is a procedural prop — it must arrive on an authored claim`,
      );
      continue;
    }
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
