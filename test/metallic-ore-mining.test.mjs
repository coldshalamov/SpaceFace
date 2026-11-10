// metallic-ore-mining — demo defect ledger D227 (owner recording 20261018-1702).
//
// environmentSurfaceData stamps opticMaterial 'metal'/'diamond' onto ordinary ore as a SURFACE
// tag (src/data/environmentMaterials.js, wired through world.js _spawnAsteroidInSector since
// 7a2389fe3f4). The four mining guards keyed their "not ore" refusal on that tag, so every
// ast_metallic / ast_crystalline field rock — 143 of 254 on seed 4242 — was unmineable. The
// guards now discriminate on data.opticStructureId, the optic-lattice marker
// (world/asteroidField.js isOpticRockData; core/physics.js:104 already used the same split).
//
// Proven here on seed 4242 against the live owners:
//   systems/world.js       f_ceres_1 materializes ast_metallic rocks carrying the metal tag
//   world/asteroidField.js promoteAsteroidFieldRock lifts the tagged record to a live body
//   systems/mining.js      applyMining + isBeamTargetEligible + _acquireTarget (pointer path,
//                          free-aim scan, and the tethered in-range scan) take tagged ore —
//                          true lattice cells stay refused at every one of those gates
//
// Run: node --test test/metallic-ore-mining.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { mining, isBeamTargetEligible } from '../src/systems/mining.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { environmentSurfaceData } from '../src/data/environmentMaterials.js';

const CERES = 'sector_ceres_belt';
const CERES_FIELD = 'f_ceres_1';
const SEED = 4242;
const RANGE = 300;
// Remote corner far from every sector anchor — inserted records there are the whole candidate set.
const REMOTE = { x: 400000, z: 400000 };

function bootSim({ sector = null } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [physics, world, mining] });
  const { state } = sim;
  state.mode = 'flight';
  sim.registry.get('world').newGame();
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  if (sector) sim.registry.get('world').enterSector(sector);
  return { sim, state, player, helpers: sim.registry.ctx.helpers };
}

// Cut until a whole unit ejects (or the rock dies); returns units released. Fractional ore accrues
// per call, so a single call can legitimately pay 0 mid-cut — the bug signature is oreHP never
// moving at all.
function cutUntilOre(miningSystem, id, state, maxCalls = 24) {
  let released = 0;
  for (let i = 0; i < maxCalls && released === 0; i++) {
    const ast = state.entities.get(id);
    if (!ast || ast.alive === false) break;
    released += miningSystem.applyMining(id, 50, 1, state.playerId);
  }
  return released;
}

test('D227 repro: a metal-surface f_ceres_1 rock targets, cuts, and pays ore', () => {
  const { sim, state, player, helpers } = bootSim({ sector: CERES });
  try {
    const field = state.world.asteroidField;
    const rec = field.rocks.find((r) => r.data && r.data.fieldId === CERES_FIELD
      && r.data.opticMaterial === 'metal' && !r.data.opticStructureId);
    assert.ok(rec, 'seed 4242 materializes metal-surface ore in f_ceres_1');
    assert.equal(rec.data.typeId, 'ast_metallic', 'the fixture is the metallic ore body');

    // The player route: pointer-target the rock — _acquireTarget resolves the field record,
    // validates it through isBeamTargetEligible, and promotes it to a live body.
    player.pos.x = rec.pos.x - 120;
    player.pos.z = rec.pos.z;
    state.input.worldObjectTargetId = rec.id;
    const miningSystem = sim.registry.get('mining');
    const live = miningSystem._acquireTarget(player, RANGE, state);
    assert.ok(live && live.id === rec.id, 'the pointer acquires the tagged ore rock');
    assert.equal(live.data.opticMaterial, 'metal', 'the surface tag survives promotion');
    assert.equal(isBeamTargetEligible(live, state), true, 'tagged ore is beam-eligible');

    const oreHPBefore = live.data.oreHP;
    const released = cutUntilOre(miningSystem, live.id, state);
    assert.ok(live.data.oreHP < oreHPBefore,
      `the beam cuts ore-HP (${oreHPBefore} -> ${live.data.oreHP})`);
    assert.ok(released > 0, `the cut ejects whole ore units (released ${released}u)`);
  } finally {
    sim.dispose();
  }
});

test('the free-aim scan takes surface-tagged ore and skips the lattice cell', () => {
  const { sim, state, player } = bootSim();
  try {
    player.pos.x = REMOTE.x;
    player.pos.z = REMOTE.z;
    const miningSystem = sim.registry.get('mining');

    // A true lattice cell carries the structure marker — the scan must refuse it even with
    // nothing else in the aim cone.
    insertAsteroidFieldRock(state, {
      pos: { x: REMOTE.x + 60, z: REMOTE.z },
      radius: 14,
      data: {
        typeId: 'ast_metallic', material: 'rock', opticMaterial: 'stone',
        opticStructureId: 'test_lattice_cell', opticCell: 'cell_0',
        oreHP: 1e6, oreHPMax: 1e6, yieldU: 0, pctEjected: 0, fieldId: 'test_lattice',
      },
    });
    state.input.aimAngle = 0;
    assert.equal(miningSystem._acquireTarget(player, RANGE, state), null,
      'a lattice cell alone in the cone wins no lock');

    // Ordinary ore stamped by the real producer — the same call world.js makes per slot.
    const metal = insertAsteroidFieldRock(state, {
      pos: { x: REMOTE.x + 40, z: REMOTE.z },
      radius: 16,
      data: environmentSurfaceData('metal', {
        typeId: 'ast_metallic', oreHP: 600, oreHPMax: 600, yieldU: 30, pctEjected: 0,
        fieldId: 'test_metal_field',
      }),
    });
    const acquiredMetal = miningSystem._acquireTarget(player, RANGE, state);
    assert.ok(acquiredMetal && acquiredMetal.id === metal.id,
      'the scan acquires and promotes the metal-surface rock');

    const diamond = insertAsteroidFieldRock(state, {
      pos: { x: REMOTE.x, z: REMOTE.z + 50 },
      radius: 16,
      data: environmentSurfaceData('crystal', {
        typeId: 'ast_crystalline', oreHP: 400, oreHPMax: 400, yieldU: 18, pctEjected: 0,
        fieldId: 'test_diamond_field',
      }),
    });
    assert.equal(diamond.data.opticMaterial, 'diamond', 'the crystal surface stamps the diamond tag');
    state.input.aimAngle = Math.PI / 2;
    const acquiredDiamond = miningSystem._acquireTarget(player, RANGE, state);
    assert.ok(acquiredDiamond && acquiredDiamond.id === diamond.id,
      'the scan acquires and promotes the diamond-surface rock');
  } finally {
    sim.dispose();
  }
});

test('live bodies: the lattice marker — not the surface tag — is what the beam refuses', () => {
  const { sim, state, player } = bootSim();
  try {
    player.pos.x = REMOTE.x;
    player.pos.z = REMOTE.z;
    const miningSystem = sim.registry.get('mining');

    const ore = sim.spawn({
      type: 'asteroid', pos: { x: REMOTE.x + 60, z: REMOTE.z }, radius: 12, mass: 300,
      hull: 500, hullMax: 500, collides: true,
      data: environmentSurfaceData('metal', {
        typeId: 'ast_metallic', oreHP: 500, oreHPMax: 500, yieldU: 24, pctEjected: 0,
      }),
    });
    const diamondOre = sim.spawn({
      type: 'asteroid', pos: { x: REMOTE.x + 90, z: REMOTE.z + 60 }, radius: 12, mass: 300,
      hull: 400, hullMax: 400, collides: true,
      data: environmentSurfaceData('crystal', {
        typeId: 'ast_crystalline', oreHP: 400, oreHPMax: 400, yieldU: 18, pctEjected: 0,
      }),
    });
    const lattice = sim.spawn({
      type: 'asteroid', pos: { x: REMOTE.x - 80, z: REMOTE.z }, radius: 10, mass: 400,
      hull: 1e6, hullMax: 1e6, collides: true,
      data: {
        typeId: 'ast_metallic', opticMaterial: 'metal', opticStructureId: 'test_lattice_cell',
        oreHP: 1e6, oreHPMax: 1e6, yieldU: 0,
      },
    });

    // Eligibility gate (isBeamTargetEligible — shared by _isValidMineableTarget, the target
    // panel, and the pointer beam lane).
    assert.equal(isBeamTargetEligible(ore, state), true, 'metal-surface ore is eligible');
    assert.equal(isBeamTargetEligible(diamondOre, state), true, 'diamond-surface ore is eligible');
    assert.equal(isBeamTargetEligible(lattice, state), false, 'the lattice cell stays refused');

    // applyMining — the D227 signature was an immediate 0 with oreHP untouched.
    const oreHP = ore.data.oreHP;
    assert.ok(cutUntilOre(miningSystem, ore.id, state) > 0, 'the metal-surface rock pays ore');
    assert.ok(ore.data.oreHP < oreHP, 'its ore-HP really fell');
    const diamondHP = diamondOre.data.oreHP;
    assert.ok(cutUntilOre(miningSystem, diamondOre.id, state) > 0, 'the diamond-surface rock pays ore');
    assert.ok(diamondOre.data.oreHP < diamondHP, 'its ore-HP really fell');
    assert.equal(miningSystem.applyMining(lattice.id, 500, 1, state.playerId), 0,
      'applyMining refuses the lattice cell');
    assert.equal(lattice.data.oreHP, 1e6, 'the lattice cell takes no cut');
    assert.notEqual(lattice.alive, false, 'the lattice cell is unharmed');

    // Tether lane (activeMineableTetherTarget): aim away — only the tethered in-range scan can
    // return the rock, so an id match proves that guard passes tagged ore.
    state.player.tether = { active: true, targetId: ore.id };
    state.input.aimAngle = Math.PI;
    const tethered = miningSystem._acquireTarget(player, RANGE, state);
    assert.ok(tethered && tethered.id === ore.id,
      'the tethered metal-surface rock stays mineable in range');

    // Same lane, lattice cell: refused there, and the aim scan behind it can only find ordinary
    // ore — never the marked cell.
    state.player.tether = { active: true, targetId: lattice.id };
    const refused = miningSystem._acquireTarget(player, RANGE, state);
    assert.ok(refused == null || refused.id !== lattice.id,
      'the tether/scan never returns a lattice cell');
  } finally {
    sim.dispose();
  }
});
