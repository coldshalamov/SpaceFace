// npc-starter-seam-mining — D227 companion (demo defect ledger, owner recording 20261018-1702).
//
// environmentSurfaceData stamps opticMaterial 'metal'/'diamond' onto ordinary starter-seam ore as
// a SURFACE tag (about a third of f_helios_starter's common-rock scatter rolls metal or crystal
// via adventureMaterialFor). starterRockMineable keyed its refusal on the tag, so the Helios
// shift cutter ignored those faces outright. It now discriminates on opticStructureId — the
// optic-lattice marker — matching mining.js, world/asteroidField.js isOpticRockData, and
// core/physics.js.
//
// Proven through the two field-facing callers of the predicate:
//   _pickHeliosStarterRock — the prospect pick across f_helios_starter field records
//   _promoteStarterRock    — promote-then-revalidate before the beam shift holds it
//
// Run: node --test test/npc-starter-seam-mining.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { environmentSurfaceData } from '../src/data/environmentMaterials.js';

const STARTER_FIELD = 'f_helios_starter';

function seamRock(state, pos, data) {
  return insertAsteroidFieldRock(state, {
    pos,
    radius: 14,
    data: { oreHP: 400, oreHPMax: 400, yieldU: 20, pctEjected: 0, fieldId: STARTER_FIELD, ...data },
  });
}

test('the starter-seam pick steps past the lattice cell to ordinary tagged ore', () => {
  const sim = createSimulation({ seed: 4242, systems: [npcJobsRuntime] });
  try {
    const { state } = sim;
    state.world = state.world || {};
    const runtime = sim.registry.get('npcJobsRuntime');

    const lattice = seamRock(state, { x: 60, z: 0 }, {
      typeId: 'ast_metallic', opticMaterial: 'stone', opticStructureId: 'test_lattice_cell',
    });
    const metal = seamRock(state, { x: 120, z: 0 },
      environmentSurfaceData('metal', { typeId: 'ast_metallic' }));
    const diamond = seamRock(state, { x: 200, z: 0 },
      environmentSurfaceData('crystal', { typeId: 'ast_crystalline' }));
    assert.equal(metal.data.opticMaterial, 'metal', 'the metal surface stamps its tag');
    assert.equal(diamond.data.opticMaterial, 'diamond', 'the crystal surface stamps its tag');
    assert.ok(!metal.data.opticStructureId && !diamond.data.opticStructureId,
      'tagged ore carries no lattice marker');

    const picked = runtime._pickHeliosStarterRock({ x: 0, z: 0 });
    assert.ok(picked && picked.id === metal.id,
      'the nearest lattice cell is skipped and the nearest metal face wins');

    assert.equal(runtime._promoteStarterRock(lattice), null,
      'a lattice cell never promotes for the beam');
    const live = runtime._promoteStarterRock(metal);
    assert.ok(live && live.id === metal.id, 'the tagged record promotes to a live ore body');
    assert.equal(live.data.opticMaterial, 'metal', 'the surface tag survives promotion');

    const liveDiamond = runtime._promoteStarterRock(diamond);
    assert.ok(liveDiamond && liveDiamond.id === diamond.id, 'the diamond face promotes too');
  } finally {
    sim.dispose();
  }
});
