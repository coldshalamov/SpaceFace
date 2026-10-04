// Row 282 LG-SHIP-PORTRAIT. The load screen reads the hull's history back.
// Seed 4242. Scars, yard repairs, a held title, and a named grudge come from the
// living-hull, title, and ace-memory records. A clean hull does not grow a repair.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultLivingHull,
  livingHullWithPatchedScars,
  livingHullWithRepair,
  livingHullWithScar,
} from '../src/core/livingHull.js';
import { buildSavePortrait, paintSavePortrait } from '../src/ui/screens/saveLoad.js';

const SEED = 4242;
const HEAVY_REPAIR = Object.freeze({
  restoredHull: 40,
  hullMax: 100,
  restoredArmor: 0,
  armorMax: 0,
});

function historyHull() {
  let hull = defaultLivingHull(0);
  hull = livingHullWithScar(hull, {
    id: 'scar-port-4242',
    cause: 'weapon',
    surface: 'weapon',
    band: 'hard',
    facing: 'port beam',
    atT: 4,
    tick: SEED,
  }, 4);
  hull = livingHullWithRepair(hull, HEAVY_REPAIR, 8);
  hull = livingHullWithRepair(hull, HEAVY_REPAIR, 9);
  hull = livingHullWithPatchedScars(hull, 10);
  hull = livingHullWithScar(hull, {
    id: 'scar-bow-4242',
    cause: 'slam',
    surface: 'craft',
    band: 'heavy',
    facing: 'bow',
    atT: 12,
    tick: SEED,
  }, 12);
  return hull;
}

test('seed 4242 portrait shows the scar, the yard repairs, the title, and the named grudge', () => {
  const hull = historyHull();
  assert.equal(hull.repairPatches, 2, 'two heavy yard repairs stuck');
  const portrait = buildSavePortrait({
    data: {
      player: {
        activeShipIndex: 0,
        heat: 0,
        bounty: 0,
        ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: hull }],
      },
      missions: {
        story: {
          titles: {
            byId: {
              title_thunderchild: {
                status: 'held',
                holderKey: 'player',
                title: 'Thunderchild',
                titleId: 'title_thunderchild',
              },
            },
          },
        },
      },
      aceMemory: {
        ace_mara_voss: {
          id: 'ace_mara_voss',
          name: 'Mara Voss',
          fled: true,
          defeated: false,
          returnTier: 1,
          fleeCount: 1,
          returnsBigger: false,
        },
      },
    },
  });

  assert.match(portrait.scars.line, /port beam, hard \(patched\)/);
  assert.match(portrait.scars.line, /bow, heavy/);
  assert.equal(portrait.scars.line.includes('starboard'), false, 'no scar the hull does not carry');
  assert.equal(portrait.repairs.repairPatches, 2);
  assert.equal(portrait.repairs.patchedScars, 1);
  assert.equal(portrait.repairs.line, 'Two yard repairs · One scar patched');
  assert.equal(portrait.titles.line, 'Thunderchild');
  assert.equal(portrait.titles.names.length, 1);
  assert.equal(portrait.grudge.name, 'Mara Voss');
  assert.equal(portrait.grudge.line, 'Mara Voss hates you');

  const nodes = {
    hull: { textContent: '' },
    scars: { textContent: '' },
    repairs: { textContent: '' },
    titles: { textContent: '' },
    grudge: { textContent: '' },
  };
  paintSavePortrait(nodes, portrait);
  assert.equal(nodes.repairs.textContent, 'Two yard repairs · One scar patched');
  assert.equal(nodes.scars.textContent, portrait.scars.line);
  assert.equal(nodes.titles.textContent, 'Thunderchild');
  assert.equal(nodes.grudge.textContent, 'Mara Voss hates you');
});

test('seed 4242 clean hull does not invent a yard repair', () => {
  const portrait = buildSavePortrait({
    data: {
      player: {
        activeShipIndex: 0,
        ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: defaultLivingHull(SEED) }],
      },
    },
  });
  assert.equal(portrait.repairs.repairPatches, 0);
  assert.equal(portrait.repairs.patchedScars, 0);
  assert.equal(portrait.repairs.line, 'No yard repairs');
  assert.equal(portrait.scars.line, 'Clean plates');
  assert.equal(portrait.grudge.line, 'No one hunts you');
});
