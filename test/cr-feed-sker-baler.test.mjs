// CR-FEED — the Sker Haven scrap baler is a compactor, not another directional mouth: a WELL
// intake centred on its own anvil gathers loose mass from every bearing during the surge. The
// same warning/surge/calm law the Ceres mouths run is what makes it honest — warning registers
// the volume at strength 0, calm is the safe window, and a boosting hull still walks out over
// the rim while a light hull caught inside gets pulled onto the press.
import test from 'node:test';
import assert from 'node:assert/strict';

import { integrateFieldEscape, normalizeField } from '../src/core/fields/fieldKernel.js';
import { everydaySpaceKitFileForPlaceId } from '../src/data/everydaySpaceKitDressing.js';
import {
  ALL_KILL_MACHINES,
  KILL_MACHINES,
  KILL_MACHINE_SECTOR_ID,
  SKER_SCRAP_BALER,
  SKER_SCRAP_BALER_SECTOR_ID,
  STARTER_FIELD_MACHINE,
  killMachineFieldCenter,
  killMachinePhase,
  killMachinesForSector,
  pointInsideKillMachine,
} from '../src/data/environmentalMachinery.js';
import { FIELD_ESCAPE_BOOST_ACCEL, FIELD_FLAGS } from '../src/data/fields.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { SKER_GATEMOUTH_WICK_ORIGIN } from '../src/data/opticStructures.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { SECTORS } from '../src/data/sectors.js';

const MACHINE = SKER_SCRAP_BALER;
const CYCLE = MACHINE.cycle;
const SECTOR = SECTORS.find((row) => row.id === SKER_SCRAP_BALER_SECTOR_ID);

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function phaseAt(offsetS) {
  return killMachinePhase(MACHINE, MACHINE.phaseOffsetS + offsetS);
}

function liveWellField(strengthScale = 1) {
  const spec = MACHINE.fields[0];
  return normalizeField({
    id: spec.id,
    kind: spec.kind,
    center: killMachineFieldCenter(MACHINE, spec),
    radius: spec.radius,
    strength: spec.strength * strengthScale,
    falloff: spec.falloff,
    sourceId: MACHINE.id,
    createdAt: 0,
  });
}

// Integrate the escape kernel in short slices so we can watch the hull cross the anvil disc —
// integrateFieldEscape only reports the endpoint, and "pulled to the anvil" is a mid-flight
// event under a point-well oscillation.
function reachWithinAnvil(startPos, vel, seconds) {
  let pos = { ...startPos };
  let v = { ...vel };
  const field = liveWellField(1);
  let t = 0;
  for (; t < seconds; t += 0.1) {
    const step = integrateFieldEscape(pos, v, [field], null, { dt: 1 / 60, maxTimeS: 0.1 });
    pos = step.pos;
    v = step.vel;
    if (step.free) return { pulledIn: false, free: true, timeS: t, pos };
    if (distance(pos, MACHINE.anvil.pos) <= MACHINE.anvil.radius + 8) {
      return { pulledIn: true, free: false, timeS: t, pos };
    }
  }
  return { pulledIn: false, free: false, timeS: t, pos };
}

test('the baler registers for Sker Haven and joins the all-machine census', () => {
  assert.deepEqual(killMachinesForSector(SKER_SCRAP_BALER_SECTOR_ID), [MACHINE]);
  assert.equal(MACHINE.id, 'sker_scrap_baler');
  assert.equal(MACHINE.sectorId, 'sector_sker_haven');
  assert.equal(killMachinesForSector(KILL_MACHINE_SECTOR_ID), KILL_MACHINES, 'Ceres slice intact');
  assert.deepEqual(killMachinesForSector(STARTER_FIELD_MACHINE.sectorId), [STARTER_FIELD_MACHINE]);
  assert.deepEqual(killMachinesForSector('sector_nowhere'), []);
  // The census is exactly the union of the per-sector slices - derived rather than a hand-counted
  // constant, because CR-FEED keeps adding sectors and a stale pin fails for the wrong reason
  // (this assertion was red for exactly that before row 48 landed).
  const censusIds = ALL_KILL_MACHINES.map((m) => m.id);
  assert.equal(new Set(censusIds).size, censusIds.length, 'the census has no duplicate machines');
  const sliceIds = [...new Set(ALL_KILL_MACHINES.map((m) => m.sectorId))]
    .flatMap((sectorId) => killMachinesForSector(sectorId).map((m) => m.id))
    .sort();
  assert.deepEqual([...censusIds].sort(), sliceIds, 'every census machine serves its own sector slice');
  for (const machine of [...KILL_MACHINES, STARTER_FIELD_MACHINE, MACHINE]) {
    assert.ok(ALL_KILL_MACHINES.includes(machine), `${machine.id} is in ALL_KILL_MACHINES`);
  }
});

test('its intake is a well centred on the anvil — a compactor, not a directional mouth', () => {
  assert.equal(MACHINE.fields.length, 1);
  const field = MACHINE.fields[0];
  assert.equal(field.kind, 'well');
  assert.notEqual(field.kind, 'cone');
  assert.notEqual(field.kind, 'sheet');
  const center = killMachineFieldCenter(MACHINE, field);
  assert.equal(center.x, MACHINE.anvil.pos.x, 'well centre sits on the anvil');
  assert.equal(center.z, MACHINE.anvil.pos.z, 'well centre sits on the anvil');
  assert.equal(MACHINE.anvil.radius, 22, 'anvil sized like the Helios cracker press');
  assert.equal(MACHINE.anvil.mass, 11000);
  assert.equal(field.radius, 120, 'gather radius ~120 WU');
  // A well contains by radius alone: the rim volume admits from every bearing, unlike the
  // cone mouths that only admit in the wedge forward of their dir.
  for (const bearing of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const rim = {
      x: MACHINE.globalPos.x + Math.cos(bearing) * (field.radius - 10),
      z: MACHINE.globalPos.z + Math.sin(bearing) * (field.radius - 10),
    };
    assert.equal(pointInsideKillMachine(MACHINE, rim), true,
      `bearing ${bearing.toFixed(2)} is inside the gather volume`);
  }
});

test('warning registers at zero strength, surge bites, calm is the safe window', () => {
  const warning = phaseAt(0.5);
  assert.equal(warning.phase, 'warning');
  assert.equal(warning.fieldActive, true, 'warning still registers the geometry');
  assert.equal(warning.fieldStrengthScale, 0, 'warning applies no force');
  const surge = phaseAt(CYCLE.warningS + 0.5);
  assert.equal(surge.phase, 'surge');
  assert.equal(surge.fieldStrengthScale, 1);
  const calm = phaseAt(CYCLE.warningS + CYCLE.surgeS + 0.5);
  assert.equal(calm.phase, 'calm');
  assert.equal(calm.fieldActive, false);
  assert.equal(calm.fieldStrengthScale, 0);
  // Registered field strength outside the bite is exactly zero.
  for (const phase of [warning, calm]) {
    assert.equal(MACHINE.fields[0].strength * phase.fieldStrengthScale, 0);
  }
  assert.equal(MACHINE.phaseOffsetS, 6, 'distinct phase offset against the 0/4/8/0 peers');
});

test('a light hull caught at the rim is pulled to the anvil inside one surge', () => {
  const rimPos = {
    x: MACHINE.anvil.pos.x + MACHINE.fields[0].radius - 4,
    z: MACHINE.anvil.pos.z,
  };
  const result = reachWithinAnvil(rimPos, { x: 0, z: 0 }, CYCLE.surgeS);
  assert.equal(result.pulledIn, true,
    `rim hull reaches the press in ${result.timeS.toFixed(2)}s of the ${CYCLE.surgeS}s surge`);
  assert.ok(result.timeS < CYCLE.surgeS, 'the gather lands inside the surge window');
});

test('a boosting hull escapes the rim during the surge; a deep one is already baler-fed', () => {
  const field = liveWellField(1);
  const out = { x: 1, z: 0 };
  const rim = integrateFieldEscape(
    { x: MACHINE.anvil.pos.x + field.radius - 4, z: MACHINE.anvil.pos.z },
    { x: 0, z: 0 },
    [field],
    null,
    {
      dt: 1 / 60,
      maxTimeS: CYCLE.surgeS,
      extraAccel: { x: out.x * FIELD_ESCAPE_BOOST_ACCEL, z: out.z * FIELD_ESCAPE_BOOST_ACCEL },
    },
  );
  assert.equal(rim.free, true, 'rim hull under FIELD_ESCAPE_BOOST_ACCEL escapes');
  assert.ok(rim.timeS < CYCLE.surgeS, `escape in ${rim.timeS.toFixed(2)}s, inside the surge`);

  const deep = integrateFieldEscape(
    { x: MACHINE.anvil.pos.x + 80, z: MACHINE.anvil.pos.z },
    { x: 0, z: 0 },
    [field],
    null,
    {
      dt: 1 / 60,
      maxTimeS: CYCLE.surgeS,
      extraAccel: { x: FIELD_ESCAPE_BOOST_ACCEL, z: 0 },
    },
  );
  assert.equal(deep.free, false, 'a hull that let the gather deepen cannot boost out');
});

test('the baler stands clear of Sker Haven’s station, gates, wick, zones, and POIs', () => {
  const pos = MACHINE.localPos;
  const CLEAR = 600;
  assert.ok(SECTOR, 'sector_sker_haven exists');
  assert.ok(Math.hypot(pos.x, pos.z) <= SECTOR.worldRadius, 'inside the sector radius');

  for (const station of SECTOR.stations || []) {
    assert.ok(distance(pos, station.pos) >= CLEAR,
      `${station.id} is ${distance(pos, station.pos).toFixed(0)} WU away (< ${CLEAR})`);
  }
  for (const gate of SECTOR.gates || []) {
    assert.ok(distance(pos, gate.pos) >= CLEAR,
      `gate ${gate.to} is ${distance(pos, gate.pos).toFixed(0)} WU away (< ${CLEAR})`);
  }
  assert.ok(distance(pos, SKER_GATEMOUTH_WICK_ORIGIN) >= CLEAR,
    `gate-camp wick is ${distance(pos, SKER_GATEMOUTH_WICK_ORIGIN).toFixed(0)} WU away`);
  for (const poi of SECTOR.pois || []) {
    assert.ok(distance(pos, poi.pos) >= CLEAR,
      `${poi.id} is ${distance(pos, poi.pos).toFixed(0)} WU away (< ${CLEAR})`);
  }
  for (const field of SECTOR.fields || []) {
    assert.ok(distance(pos, field.center) - field.clusterRadius > 0,
      `${field.id} rim is clear by ${(distance(pos, field.center) - field.clusterRadius).toFixed(0)} WU`);
  }
  for (const hazard of SECTOR.hazards || []) {
    assert.ok(distance(pos, hazard.center) - hazard.radius > 0,
      `${hazard.type} edge is clear by ${(distance(pos, hazard.center) - hazard.radius).toFixed(0)} WU`);
  }
  for (const zone of SECTOR_ZONES[SKER_SCRAP_BALER_SECTOR_ID] || []) {
    assert.ok(distance(pos, zone.center) - zone.radius > 0,
      `${zone.id} edge is clear by ${(distance(pos, zone.center) - zone.radius).toFixed(0)} WU`);
  }
});

test('the compactor hull is an existing packaged place, same jaw-crusher shell as the peers', () => {
  assert.equal(MACHINE.placeId, 'place_crusher_module');
  assert.equal(everydaySpaceKitFileForPlaceId(MACHINE.placeId), 'places/place_crusher_module.glb');
});

// The mouth contract lives on the machine record now: the starter cracker and the baler ask
// for a spawned shell, the Ceres mouths still get theirs from occupationalYardDressing.js.
test('mouth data: baler and starter name a shell, Ceres mouths name none', () => {
  assert.deepEqual(MACHINE.mouth, { name: 'Scrap Baler', radius: 18 });
  assert.deepEqual(STARTER_FIELD_MACHINE.mouth, { name: 'Claim Cracker', radius: 18 });
  for (const machine of KILL_MACHINES) {
    assert.equal(machine.mouth, null, `${machine.id} keeps its authored dressing shell`);
  }
});

test('a Sker visit places the baler shell once per visit, and never outside Sker', () => {
  const placed = [];
  const world = {
    _spawnPlaceProp(active, sector, placeId, pos, options) {
      const id = `shell-${placed.length}`;
      placed.push({ id, sectorId: sector.id, placeId, pos, options });
      active.dressing.push({ id, placeId, pos });
      return { id };
    },
  };
  const fieldBook = {
    byId: {},
    registerEnvironmental(field) { this.byId[field.id] = field; return field; },
    unregisterExternal(id) { delete this.byId[id]; return true; },
    hasExternal(id) { return !!this.byId[id]; },
    updateExternal() {},
  };
  const activeSector = { id: SKER_SCRAP_BALER_SECTOR_ID, pois: [], dressing: [] };
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: MACHINE.phaseOffsetS + MACHINE.cycle.warningS + 0.35,
    playerId: 1,
    world: {
      currentSectorId: SKER_SCRAP_BALER_SECTOR_ID,
      activeSector,
      sectors: {
        [SKER_SCRAP_BALER_SECTOR_ID]: { id: SKER_SCRAP_BALER_SECTOR_ID },
      },
    },
    entities: new Map([[1, {
      id: 1, type: 'ship', alive: true, isPlayer: true,
      pos: { x: MACHINE.globalPos.x - 400, z: MACHINE.globalPos.z - 400 },
    }]]),
    sites: { worldOrder: [], worldById: {} },
  };
  const system = Object.create(environmentalMachinery);
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    system.init({
      state,
      bus: { on() { return () => {}; }, emit() {} },
      registry: {
        get(name) {
          return name === 'fields' ? fieldBook : name === 'world' ? world : null;
        },
      },
    });
    system.update(1 / 60, state);
    assert.equal(placed.length, 1, 'the baler shell spawns in Sker');
    assert.equal(placed[0].placeId, 'place_crusher_module');
    assert.equal(placed[0].pos.x, MACHINE.globalPos.x);
    assert.equal(placed[0].pos.z, MACHINE.globalPos.z);
    assert.equal(placed[0].options.name, 'Scrap Baler');
    assert.equal(placed[0].options.radius, 18);
    assert.equal(placed[0].options.worldOneOff, true);
    assert.equal(placed[0].options.rot, MACHINE.rot);
    assert.ok(activeSector.dressing[0].environmentalMachineryId === MACHINE.id,
      'the dressing row is tagged with the machine id');
    assert.ok(fieldBook.byId[MACHINE.fields[0].id], 'the well intake registers in Sker');
    system.update(1 / 60, state);
    assert.equal(placed.length, 1, 'the shell is placed once per visit');

    // Leaving for Ceres retires the intake and the mouth bookkeeping; Ceres mouths place
    // nothing through this path.
    state.world.currentSectorId = KILL_MACHINE_SECTOR_ID;
    state.world.activeSector = { id: KILL_MACHINE_SECTOR_ID, pois: [], dressing: [] };
    system.update(1 / 60, state);
    assert.equal(fieldBook.byId[MACHINE.fields[0].id], undefined,
      'leaving Sker drops the well intake');
    assert.equal(placed.length, 1, 'Ceres places no shell through the mouth path');

    // A return visit is a fresh spawn, same once-per-visit contract as the starter cracker.
    state.world.currentSectorId = SKER_SCRAP_BALER_SECTOR_ID;
    state.world.activeSector = { id: SKER_SCRAP_BALER_SECTOR_ID, pois: [], dressing: [] };
    system.update(1 / 60, state);
    assert.equal(placed.length, 2, 'the shell respawns on the next Sker visit');
    system.update(1 / 60, state);
    assert.equal(placed.length, 2, 'still once per visit on the return');
  } finally {
    system.destroy();
    FIELD_FLAGS.enabled = previous;
  }
});
