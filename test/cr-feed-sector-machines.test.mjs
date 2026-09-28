// CR-FEED (build_map §1C row 48) - non-copy kill machines for the remaining named sectors.
//
// The done sentence: Vesta, Tethys-adjacent and Veil each get a kill machine, and no two of them
// (nor any machine already in the census) is the same KIND of object. A second mouth at a
// different angle is a copy; these separate on field count, field direction and gather centring,
// which are the things a player actually reads at the chase camera.
//
//   vesta_shear_jaws    two opposed sheets converging on one bar   - the only converging machine
//   tethys_weigh_clamp  one reversed cone feeding a plate behind   - the only one that kills behind its face
//   veil_cold_draw      one off-centre well dragging across a plate - the only off-centre gather
//
// All three run the shared law every mouth runs: warning registers the volume at strength 0,
// surge is the bite, calm is the safe window. None is a damage aura.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ALL_KILL_MACHINES,
  KILL_MACHINES,
  KILL_MACHINE_SECTOR_ID,
  TETHYS_WEIGH_CLAMP,
  TETHYS_WEIGH_SECTOR_ID,
  VEIL_COLD_DRAW,
  VEIL_COLD_SECTOR_ID,
  VESTA_SHEAR_JAWS,
  VESTA_SHEAR_SECTOR_ID,
  killMachineFieldCenter,
  killMachineFieldDir,
  killMachinePhase,
  killMachinesForSector,
  pointInsideKillMachine,
  pointInsideMachineField,
} from '../src/data/environmentalMachinery.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { SECTORS } from '../src/data/sectors.js';

const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));

const TRIO = Object.freeze([
  { machine: VESTA_SHEAR_JAWS, sectorId: VESTA_SHEAR_SECTOR_ID, kind: 'converging' },
  { machine: TETHYS_WEIGH_CLAMP, sectorId: TETHYS_WEIGH_SECTOR_ID, kind: 'behind-its-face' },
  { machine: VEIL_COLD_DRAW, sectorId: VEIL_COLD_SECTOR_ID, kind: 'off-centre-gather' },
]);

function fieldAlong(machine, field) {
  const center = killMachineFieldCenter(machine, field);
  return (center.x - machine.globalPos.x) * machine.dir.x
    + (center.z - machine.globalPos.z) * machine.dir.z;
}

function forceAlong(machine, field) {
  const dir = killMachineFieldDir(machine, field);
  return dir.x * machine.dir.x + dir.z * machine.dir.z;
}

function anvilAlong(machine) {
  return (machine.anvil.pos.x - machine.globalPos.x) * machine.dir.x
    + (machine.anvil.pos.z - machine.globalPos.z) * machine.dir.z;
}

test('each machine serves its named sector alone and joins the census', () => {
  for (const { machine, sectorId } of TRIO) {
    const slice = killMachinesForSector(sectorId);
    assert.deepEqual(slice, [machine], `${machine.id} is the only machine in ${sectorId}`);
    assert.ok(ALL_KILL_MACHINES.includes(machine), `${machine.id} is in ALL_KILL_MACHINES`);
    assert.equal(machine.sectorId, sectorId);
    for (const other of [KILL_MACHINE_SECTOR_ID, 'sector_helios_prime', 'sector_sker_haven', 'sector_haumea_rift']) {
      assert.equal(killMachinesForSector(other).includes(machine), false,
        `${machine.id} must not leak into ${other}`);
    }
    assert.ok(existsSync(`${PLACES_DIR}${machine.placeId}.glb`),
      `${machine.id}: ${machine.placeId}.glb is packaged art, not a new body`);
    assert.ok(machine.mouth, `${machine.id} asks the adapter for its shell once per visit`);
  }
  // Three new sectors, three new slices: the Ceres roster is untouched.
  assert.deepEqual(killMachinesForSector(KILL_MACHINE_SECTOR_ID), KILL_MACHINES);
});

test('no two of them is the same kind of object', () => {
  // 1 - CONVERGING: two sheets whose force directions point at each other and meet on one bar.
  const jaws = VESTA_SHEAR_JAWS;
  assert.equal(jaws.fields.length, 2, 'the shear is the only multi-field machine in the census');
  assert.ok(jaws.fields.every((f) => f.kind === 'sheet'), 'both jaws are sheets');
  const jawForces = jaws.fields.map((f) => forceAlong(jaws, f));
  assert.ok(jawForces.some((s) => s > 0) && jawForces.some((s) => s < 0),
    `the jaws push toward each other, not the same way: ${jawForces.join(', ')}`);
  assert.ok(Math.abs(anvilAlong(jaws)) < 1, 'the shear bar sits between the jaws');
  // Each jaw's sweep volume actually reaches the bar.
  for (const field of jaws.fields) {
    const bar = { x: jaws.anvil.pos.x, z: jaws.anvil.pos.z };
    assert.equal(pointInsideMachineField(jaws, field, bar), true,
      `${field.id} sweeps over the shear bar`);
  }

  // 2 - BEHIND ITS FACE: one cone whose force runs reversed, onto a plate behind the gantry.
  const clamp = TETHYS_WEIGH_CLAMP;
  assert.equal(clamp.fields.length, 1);
  assert.equal(clamp.fields[0].kind, 'cone');
  assert.equal(clamp.fields[0].dirAlong, -1, 'the gather runs reversed off the gantry face');
  assert.ok(forceAlong(clamp, clamp.fields[0]) < 0, 'the gather runs backward off the gantry face');
  assert.ok(anvilAlong(clamp) < 0, 'the weigh plate sits behind the gantry, where the bite lands');

  // 3 - OFF-CENTRE GATHER: one well whose mouth is not on the plate, so the draw drags across it.
  const draw = VEIL_COLD_DRAW;
  assert.equal(draw.fields.length, 1);
  assert.equal(draw.fields[0].kind, 'well');
  assert.notEqual(draw.fields[0].across, 0, 'the gather is off-centre from the plate');
  const drain = killMachineFieldCenter(draw, draw.fields[0]);
  assert.ok(Math.hypot(drain.x - draw.anvil.pos.x, drain.z - draw.anvil.pos.z) > 20,
    'the drain mouth sits clear of the pressure plate');
  assert.equal(draw.hazardType, 'nebula', 'the only nebula machine: gas, not debris');

  // The three axes are unique across the WHOLE census, not just across the trio - which is what
  // "non-copy" has to mean if a later sitting is going to keep the promise. The unit of comparison
  // is the machine's shape, not an individual field: the shear legitimately uses one reversed jaw
  // as half of its convergence, so "behind its face" is a whole-machine property.
  const isConvergingPair = (m) => m.fields.length === 2
    && m.fields.map((f) => forceAlong(m, f)).some((s) => s > 0)
    && m.fields.map((f) => forceAlong(m, f)).some((s) => s < 0)
    && Math.abs(anvilAlong(m)) < 1;
  const killsBehindItsFace = (m) => m.fields.every((f) => f.dirAlong === -1) && anvilAlong(m) < 0;
  const offCentreGather = (m) => m.fields.some((f) => f.kind === 'well' && f.across !== 0);

  for (const machine of ALL_KILL_MACHINES) {
    if (machine !== jaws) {
      assert.equal(isConvergingPair(machine), false, `${machine.id} must not also be a converging pair`);
    }
    if (machine !== clamp) {
      assert.equal(killsBehindItsFace(machine), false, `${machine.id} must not also kill behind its face`);
    }
    if (machine !== draw) {
      assert.equal(offCentreGather(machine), false, `${machine.id} must not also run an off-centre gather`);
    }
  }
  assert.equal(isConvergingPair(jaws), true);
  assert.equal(killsBehindItsFace(clamp), true);
  assert.equal(offCentreGather(draw), true);
});

test('all three run the shared law: warning quiet, surge bites, calm is the safe window', () => {
  for (const { machine } of TRIO) {
    const cycle = machine.cycle;
    const at = (offsetS) => killMachinePhase(machine, machine.phaseOffsetS + offsetS);
    const warning = at(0.5);
    const surge = at(cycle.warningS + 0.5);
    const calm = at(cycle.warningS + cycle.surgeS + 0.5);
    assert.equal(warning.phase, 'warning', machine.id);
    assert.equal(warning.fieldActive, true, `${machine.id}: warning registers the volume`);
    assert.equal(warning.fieldStrengthScale, 0, `${machine.id}: warning applies no force`);
    assert.equal(surge.phase, 'surge');
    assert.equal(surge.fieldStrengthScale, 1, `${machine.id}: surge is the bite`);
    assert.equal(calm.phase, 'calm');
    assert.equal(calm.fieldActive, false, `${machine.id}: calm is the safe window`);
    for (const field of machine.fields) {
      assert.equal(field.strength * warning.fieldStrengthScale, 0, `${machine.id}/${field.idSuffix}`);
      assert.ok(field.strength * surge.fieldStrengthScale > 0, `${machine.id}/${field.idSuffix}`);
    }
  }
  // Distinct phase offsets so the three never bite on the same tick.
  const offsets = TRIO.map(({ machine }) => machine.phaseOffsetS);
  assert.equal(new Set(offsets).size, offsets.length, `distinct phase offsets: ${offsets.join(', ')}`);
});

test('every mouth stands clear of its own sector anchors by its hazard radius', () => {
  for (const { machine, sectorId } of TRIO) {
    const anchors = SECTOR_ANCHORS[sectorId];
    assert.ok(anchors, `${sectorId} has authored anchors`);
    const clear = (label, x, z, padding = 0) => {
      const d = Math.hypot(x - machine.localPos.x, z - machine.localPos.z) - padding;
      assert.ok(d > machine.hazardRadius,
        `${machine.id} clear of ${label}: ${d.toFixed(0)} WU > ${machine.hazardRadius}`);
    };
    for (const s of anchors.stations || []) clear(s.id, s.pos.x, s.pos.z);
    for (const g of anchors.gates || []) clear(`gate:${g.to}`, g.pos.x, g.pos.z);
    for (const f of anchors.fields || []) clear(f.id, f.center.x, f.center.z, f.clusterRadius || 0);
    for (const p of anchors.pois || []) {
      // A mouth is ALLOWED to stand beside a landmark - the weigh clamp belongs on the weigh
      // site - but never on top of one.
      const d = Math.hypot(p.pos.x - machine.localPos.x, p.pos.z - machine.localPos.z);
      assert.ok(d > 40, `${machine.id} not on top of ${p.id}: ${d.toFixed(0)} WU`);
    }
    const sector = SECTORS.find((row) => row.id === sectorId);
    const r = Math.hypot(machine.localPos.x, machine.localPos.z);
    assert.ok(r <= sector.worldRadius, `${machine.id} sits inside ${sectorId}'s radius`);
  }
});

test('a hull at the bar/plate is inside the bite volume, and one outside is not', () => {
  for (const { machine, kind } of TRIO) {
    assert.equal(pointInsideKillMachine(machine, { x: machine.anvil.pos.x, z: machine.anvil.pos.z }), true,
      `${machine.id} (${kind}) admits at the anvil`);
    const far = { x: machine.anvil.pos.x + 4000, z: machine.anvil.pos.z + 4000 };
    assert.equal(pointInsideKillMachine(machine, far), false, `${machine.id} does not reach across the sector`);
  }
  // The converging jaws admit on BOTH sides of the bar and nowhere else at that distance.
  const jaws = VESTA_SHEAR_JAWS;
  const ahead = {
    x: jaws.globalPos.x + jaws.dir.x * 40,
    z: jaws.globalPos.z + jaws.dir.z * 40,
  };
  const behind = {
    x: jaws.globalPos.x - jaws.dir.x * 40,
    z: jaws.globalPos.z - jaws.dir.z * 40,
  };
  assert.equal(pointInsideKillMachine(jaws, ahead), true, 'the forward jaw admits ahead of the bar');
  assert.equal(pointInsideKillMachine(jaws, behind), true, 'the aft jaw admits behind the bar');
});
