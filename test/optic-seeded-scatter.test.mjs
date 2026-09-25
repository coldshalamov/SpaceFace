// build_map §24 "Seeded scatter": ordinary belts grow a few small lattices from
// the sector seed, so authorship is not required for every field. The draw runs
// after the rock draw on its own branch of (meta.seed, sectorId, epoch), so the
// field beneath is byte-identical with or without scatter. Harness idioms and
// the boot mirror optic-stamps.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import {
  OPTIC_LATTICE_SPACING,
  OPTIC_MATERIALS,
  OPTIC_SPEND_QUIET,
  collectOpticSpentIds,
  opticSpendLedger,
  recordOpticSpend,
} from '../src/combat/opticField.js';
import {
  CERES_PRISM_GALLERY_ID,
  OPTIC_SCATTER_MAX_LATTICES,
  opticStructuresFor,
} from '../src/data/opticStructures.js';
import { FIELDS } from '../src/data/mining.js';
import { SECTORS } from '../src/data/sectors.js';

// A belt palette sector with fields and no authored structure — the row's target.
const CHARON = 'sector_charon_expanse';
const CERES = 'sector_ceres_belt';

function bootWorld(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, world };
}

function isScatterCell(e) {
  return !!(e && e.data && typeof e.data.opticStructureId === 'string'
    && e.data.opticStructureId.startsWith('scatter:'));
}

function scatterCellsFor(state, sectorId) {
  return state.entityList.filter(
    (e) => e.alive && isScatterCell(e)
      && (e.homeSectorId === sectorId || (e.data && e.data.homeSectorId === sectorId)),
  );
}

// Byte-identity signature: structure, cell, material, pose — everything the seed owns.
function scatterSignature(state, sectorId) {
  return scatterCellsFor(state, sectorId)
    .map((e) => [
      e.data.opticStructureId,
      e.data.opticCell,
      e.data.opticMaterial,
      e.data.typeId,
      e.pos.x,
      e.pos.z,
      e.radius,
    ].join('|'))
    .sort();
}

// Every rock the field spawner produced for this sector — dormant field records
// plus any live-asteroid stragglers — keyed on stable spawn order, not entity ids.
function rockSignature(state, sectorId) {
  const rows = [];
  const field = state.world && state.world.asteroidField;
  for (const rec of (field && field.rocks) || []) {
    const home = rec.homeSectorId || (rec.data && rec.data.homeSectorId);
    if (home !== sectorId) continue;
    rows.push([
      'dormant',
      rec.data && rec.data.fieldId,
      rec.data && rec.data.asteroidSlotId,
      rec.pos.x,
      rec.pos.z,
      rec.radius,
      rec.data && rec.data.oreHP,
    ].join('|'));
  }
  for (const e of state.entityList) {
    if (!e || !e.data || !e.data.fieldId || isScatterCell(e)) continue;
    const home = e.homeSectorId || e.data.homeSectorId;
    if (home !== sectorId) continue;
    rows.push([
      'live',
      e.data.fieldId,
      e.data.asteroidSlotId,
      e.pos.x,
      e.pos.z,
      e.radius,
      e.data.oreHP,
    ].join('|'));
  }
  return rows.sort();
}

test('an ordinary belt grows a few small real lattices from the sector seed', () => {
  // Charon has fields and no authored structure — prove the fixture premise.
  assert.equal(opticStructuresFor(CHARON).length, 0);
  const sector = SECTORS.find((s) => s.id === CHARON);
  assert.ok(sector && (sector.fields || []).length > 0);

  const { state, world } = bootWorld(4242);
  world.enterSector(CHARON);

  const cells = scatterCellsFor(state, CHARON);
  assert.ok(cells.length > 0, 'an unauthored belt must still grow optic cells');

  const byStructure = new Map();
  for (const e of cells) {
    const list = byStructure.get(e.data.opticStructureId) || [];
    list.push(e);
    byStructure.set(e.data.opticStructureId, list);
  }
  // "A few": at least one lattice, never more than the row's small cap.
  assert.ok(byStructure.size >= 1);
  assert.ok(byStructure.size <= OPTIC_SCATTER_MAX_LATTICES,
    `scatter must stay a few small lattices, got ${byStructure.size}`);

  for (const [id, members] of byStructure) {
    // Deterministic ledger ids keyed like the authored stamps.
    assert.equal(id.split(':').slice(0, 2).join(':'), `scatter:${CHARON}`);
    // Small: a short fuse or a triad — never a Ceres-scale gallery (42 cells).
    assert.ok(members.length <= 14, `${id} is ${members.length} cells — not small`);
    const materials = members.map((e) => e.data.opticMaterial);
    assert.ok(materials.includes('diamond'), `${id} has no prism cell`);
    for (const e of members) {
      // Real colliders with the contact-grammar tags.
      assert.equal(e.type, 'asteroid');
      assert.equal(e.collides, true);
      assert.ok(OPTIC_MATERIALS[e.data.opticMaterial], `unknown material ${e.data.opticMaterial}`);
      assert.ok(/^-?\d+,-?\d+$/.test(e.data.opticCell), `${id} cell tag ${e.data.opticCell}`);
      assert.equal(e.data.masslineTetherable, false, 'optic cells are not ore');
    }
  }

  // Cells share the lattice grid: neighbours sit one OPTIC_LATTICE_SPACING apart.
  for (const [, members] of byStructure) {
    const cells2 = new Set(members.map((e) => e.data.opticCell));
    assert.equal(cells2.size, members.length, 'no duplicate cell in one lattice');
  }

  // Scatter only fills the unauthored gap: authored sectors keep exactly their recipe.
  world.enterSector(CERES, { noTeleport: true });
  const ceresIds = new Set(
    state.entityList
      .filter((e) => e.alive && e.data && e.data.opticStructureId
        && (e.homeSectorId === CERES || e.data.homeSectorId === CERES))
      .map((e) => e.data.opticStructureId),
  );
  assert.deepEqual([...ceresIds], [CERES_PRISM_GALLERY_ID],
    'an authored sector must not also grow scatter');
});

test('the same seed regrows byte-identical lattices', () => {
  const a = bootWorld(4242);
  a.world.enterSector(CHARON);
  const sigA = scatterSignature(a.state, CHARON);
  assert.ok(sigA.length > 0);

  const b = bootWorld(4242);
  b.world.enterSector(CHARON);
  const sigB = scatterSignature(b.state, CHARON);

  assert.deepEqual(sigB, sigA, 'same seed must regrow identical placement/materials');

  // And re-materialize is stable too: a FULL bag re-stamped would double-spawn.
  a.world._ensureOpticStructures(a.state.world.sectors[CHARON], a.state.world.sectorContents[CHARON]);
  assert.deepEqual(scatterSignature(a.state, CHARON), sigA, 'the stamp must not run twice');
});

test('a different seed grows a different field', () => {
  const a = bootWorld(4242);
  a.world.enterSector(CHARON);
  const b = bootWorld(99);
  b.world.enterSector(CHARON);
  assert.ok(scatterSignature(b.state, CHARON).length > 0);
  assert.notDeepEqual(
    scatterSignature(b.state, CHARON),
    scatterSignature(a.state, CHARON),
    'different seeds must grow different lattices',
  );
});

test('the rock draw is untouched — scatter rides its own rng branch', () => {
  const withScatter = bootWorld(4242);
  withScatter.world.enterSector(CHARON);

  // Sibling boot with the scatter planner disabled — same seed, same rock draw.
  const without = bootWorld(4242);
  without.world._opticScatterSpecs = () => [];
  without.world.enterSector(CHARON);

  assert.ok(scatterCellsFor(withScatter.state, CHARON).length > 0, 'fixture must scatter');
  assert.equal(scatterCellsFor(without.state, CHARON).length, 0, 'sibling disabled scatter');

  assert.deepEqual(
    rockSignature(without.state, CHARON),
    rockSignature(withScatter.state, CHARON),
    'scatter must not move a single rock',
  );

  // Field records (centres + rock membership) are part of the same draw.
  const fieldsOf = (st) => (st.world.sectorContents[CHARON].fields || [])
    .map((f) => `${f.id}|${f.center.x}|${f.center.z}|${f.asteroidIds.length}`);
  assert.deepEqual(fieldsOf(without.state), fieldsOf(withScatter.state));
});

test('a spent scattered diamond persists through world serialize/deserialize', () => {
  const { state, world } = bootWorld(4242);
  world.enterSector(CHARON);

  const cells = scatterCellsFor(state, CHARON);
  const diamond = cells.find((e) => e.data.opticMaterial === 'diamond');
  assert.ok(diamond, 'fixture sector must scatter at least one diamond');
  const structureId = diamond.data.opticStructureId;
  const cell = diamond.data.opticCell;
  const untouched = cells.find(
    (e) => e.data.opticStructureId === structureId && e.data.opticCell !== cell
      && e.data.opticMaterial === 'diamond',
  );

  state.simTime = 5;
  const ledger = opticSpendLedger(state);
  const spend = recordOpticSpend(diamond, state.simTime, ledger);
  assert.ok(spend, 'the scattered diamond must be a spendable optic cell');
  assert.equal(diamond.data.opticMaterial, 'spent');
  assert.equal(ledger[structureId][cell], 5);

  const saved = JSON.parse(JSON.stringify(world.serialize()));
  assert.equal(saved.opticSpent[structureId][cell], 5, 'the save carries the scatter cell stamp');

  // Load mid-quiet on the same seed: the same lattice regrows and the same cell
  // comes back dark with its original stamp — no authored recipe needed.
  const mid = bootWorld(4242);
  mid.state.simTime = 20;
  mid.world.deserialize(saved);
  mid.world.enterSector(CHARON);

  const midCells = scatterCellsFor(mid.state, CHARON);
  const midBurned = midCells.find(
    (e) => e.data.opticStructureId === structureId && e.data.opticCell === cell,
  );
  assert.ok(midBurned, 'the regrown lattice carries the same structure/cell id');
  assert.equal(midBurned.data.opticMaterial, 'spent', 'mid-cooldown scatter cell stays dark');
  assert.equal(midBurned.data.opticSpentAt, 5, 'the timer kept its absolute stamp');
  assert.equal(midBurned.data.tint, OPTIC_MATERIALS.spent.tint);
  assert.ok(collectOpticSpentIds(mid.state).has(midBurned.id),
    'the restored dark cell rejoins the rekindle watch');
  if (untouched) {
    const midLive = midCells.find(
      (e) => e.data.opticStructureId === structureId && e.data.opticCell === untouched.data.opticCell,
    );
    assert.equal(midLive.data.opticMaterial, 'diamond', 'unburned cells load live');
  }

  // Healed while closed: past the quiet window the cell loads live and the
  // stale ledger entry drops at materialize — same as authored stamps.
  const late = bootWorld(4242);
  late.state.simTime = 5 + OPTIC_SPEND_QUIET + 30;
  late.world.deserialize(saved);
  late.world.enterSector(CHARON);
  const lateBurned = scatterCellsFor(late.state, CHARON).find(
    (e) => e.data.opticStructureId === structureId && e.data.opticCell === cell,
  );
  assert.equal(lateBurned.data.opticMaterial, 'diamond', 'healed-while-away loads live');
  assert.equal(lateBurned.data.opticSpentAt, undefined);
  assert.deepEqual(late.state.world.opticSpent[structureId] || {}, {},
    'the stale scatter entry was dropped at materialize');
});

test('scatter cells stay on the 64-lattice and off the rock discs', () => {
  const { state, world } = bootWorld(4242);
  world.enterSector(CHARON);
  const active = state.world.sectorContents[CHARON];
  const fields = active.fields || [];
  assert.ok(fields.length > 0);

  const byStructure = new Map();
  for (const e of scatterCellsFor(state, CHARON)) {
    const list = byStructure.get(e.data.opticStructureId) || [];
    list.push(e);
    byStructure.set(e.data.opticStructureId, list);
  }
  const tierParams = FIELDS[SECTORS.find((s) => s.id === CHARON).tier] || {};
  const fdefs = SECTORS.find((s) => s.id === CHARON).fields || [];
  const spacing2 = OPTIC_LATTICE_SPACING * OPTIC_LATTICE_SPACING;
  for (const [id, members] of byStructure) {
    // On-grid: integer cell tags, and every pair of cells is a whole number of
    // lattice steps apart — gap² is always a multiple of OPTIC_LATTICE_SPACING²
    // (orthogonal k², diagonal 2k², etc.).
    for (const e of members) {
      const [ix, iz] = e.data.opticCell.split(',').map(Number);
      assert.ok(Number.isInteger(ix) && Number.isInteger(iz), `${id} cell tag off grid`);
    }
    for (const e of members) {
      for (const other of members) {
        if (other === e) continue;
        const dx = e.pos.x - other.pos.x;
        const dz = e.pos.z - other.pos.z;
        const g2 = dx * dx + dz * dz;
        const rem = g2 % spacing2;
        assert.ok(rem < 1e-4 || rem > spacing2 - 1e-4,
          `${id} pair ${e.data.opticCell}/${other.data.opticCell} off the 64-grid (g²=${g2})`);
      }
      // Every cell sits outside every rock disc — the lattice grew on open ground.
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const fdef = fdefs.find((d) => d && d.id === f.id) || {};
        const radius = fdef.clusterRadius || tierParams.clusterRadius || 450;
        const gap = Math.hypot(e.pos.x - f.center.x, e.pos.z - f.center.z);
        assert.ok(gap >= radius - 1e-6,
          `scatter cell ${e.data.opticCell} sits inside ${f.id} (${gap.toFixed(0)} < ${radius})`);
      }
      // Diamonds never overlap a sibling body; stone-on-stone touch is the lattice rule.
      if (e.data.opticMaterial !== 'diamond') continue;
      for (const other of members) {
        if (other === e) continue;
        const gap = Math.hypot(e.pos.x - other.pos.x, e.pos.z - other.pos.z);
        assert.ok(gap + 1e-6 >= e.radius + other.radius,
          `diamond ${e.data.opticCell} overlaps ${other.data.opticCell}`);
      }
    }
  }
});
