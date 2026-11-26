// What is inside a rock follows what the rock is. The laser cuts a weighted mix of the rock's ore
// table; the rover finds those same materials inside, cheap near the surface and dear in the
// heart, plus a prize the laser never brings up. A rock bored before this rule keeps the interior
// its tunnels were cut in.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, ROWS, LEGACY_GEOLOGY_FAMILY, ROCK_GEOLOGY, ROCK_GEOLOGY_LIVE, assayRock, generateDrillField,
  geologyFamilyForRock, resolveBoreFamily, drillTierReqForOre,
} from '../src/systems/drillFieldModel.js';
import { ASTEROIDS, ORES } from '../src/data/mining.js';
import { ORE_TINTS } from '../src/ui/asteroid/asteroidRenderer2d.js';

const SEEDS = [1, 7, 47, 1234, 99991, 314159, 2718281];
const ORE_IDS = new Set(ORES.map((ore) => ore.id));

test('the rule is live, and every rock type the belts spawn has its own interior', () => {
  assert.equal(ROCK_GEOLOGY_LIVE.enabled, true);
  for (const rock of ASTEROIDS) {
    assert.ok(ROCK_GEOLOGY[rock.id], `${rock.id} has a geology`);
    assert.equal(geologyFamilyForRock(rock.id), rock.id);
  }
  assert.equal(geologyFamilyForRock('ast_unknown_thing'), LEGACY_GEOLOGY_FAMILY);
});

test('the rover finds what the laser cuts: every mineable in the rock table is inside the rock', () => {
  for (const rock of ASTEROIDS) {
    // Silicate is the matrix itself and hydrogen is the gas pockets; neither is a vein.
    const wanted = Object.keys(rock.oreTable).filter((id) => id !== 'cmdty_silicate' && id !== 'cmdty_gas_hydrogen');
    for (const seed of SEEDS) {
      const found = new Set(assayRock(seed, rock.id).materials.map((m) => m.ore));
      for (const ore of wanted) assert.ok(found.has(ore), `${rock.id} seed ${seed} carries ${ore}`);
    }
  }
});

test('value runs downward: a rock keeps its dearer ores deeper than its cheaper ones', () => {
  const tier = new Map(ORES.map((ore) => [ore.id, ore.tier]));
  for (const [family, profile] of Object.entries(ROCK_GEOLOGY)) {
    const seams = profile.seams.filter((seam) => seam.count[0] > 0);
    for (let i = 1; i < seams.length; i++) {
      const a = seams[i - 1], b = seams[i];
      if (tier.get(b.ore) > tier.get(a.ore)) {
        assert.ok((b.band[0] + b.band[1]) / 2 > (a.band[0] + a.band[1]) / 2,
          `${family}: ${b.ore} sits deeper than ${a.ore}`);
      }
    }
    // The first seam a tunnel meets is something a starter rig can cut or the rock's own base ore.
    assert.ok(ORE_IDS.has(profile.starter), `${family} starter ore is real`);
  }
  // The teaching rocks open on an ore the Mk I rig can take.
  assert.equal(drillTierReqForOre(ROCK_GEOLOGY.ast_common_rock.starter), 1);
  assert.equal(drillTierReqForOre(ROCK_GEOLOGY.ast_metallic.starter), 1);
  assert.equal(drillTierReqForOre(ROCK_GEOLOGY.ast_icy.starter), 1);
});

test('each family is a different board, the same every visit', () => {
  const icy = assayRock(1234, 'ast_icy'), metal = assayRock(1234, 'ast_metallic'), gas = assayRock(1234, 'ast_gas_cloud');
  assert.ok(gas.gasPockets > metal.gasPockets, 'a gas-bearing rock has more pockets than a metallic one');
  assert.ok(metal.hardness > icy.hardness, 'a metallic rock is harder than an ice body');
  for (const family of Object.keys(ROCK_GEOLOGY)) {
    const a = generateDrillField(424242, family), b = generateDrillField(424242, family);
    assert.equal(JSON.stringify(a), JSON.stringify(b), `${family} is deterministic`);
    assert.equal(a.length, COLS);
    assert.equal(a[0].length, ROWS);
    // Rows 0-2 stay the soft surface every tutorial and every entry shaft relies on.
    for (let col = 0; col < COLS; col++) for (let row = 0; row < 3; row++) {
      assert.equal(a[col][row].type, 'dirt', `${family} surface is soft at ${col},${row}`);
    }
    for (const material of assayRock(424242, family).materials) {
      assert.ok(ORE_IDS.has(material.ore), `${material.ore} is a real commodity`);
      assert.ok(ORE_TINTS[material.ore], `${material.ore} has a colour on the board`);
    }
  }
});

test('the old interior is untouched, byte for byte, for rocks bored before the rule', () => {
  assert.equal(JSON.stringify(generateDrillField(1234)), JSON.stringify(generateDrillField(1234, LEGACY_GEOLOGY_FAMILY)));
  assert.notEqual(JSON.stringify(generateDrillField(1234)), JSON.stringify(generateDrillField(1234, 'ast_metallic')));
  const legacy = assayRock(1234);
  assert.ok(legacy.materials.some((m) => m.ore === 'cmdty_ore_goldium' || m.ore === 'cmdty_ore_silverium'
    || m.ore === 'cmdty_ore_bronzium'), 'the pre-rule deep-core ladder is still what a legacy rock holds');
});

test('a stamp is final; a bored rock without one keeps the old interior; an untouched rock takes its type', () => {
  assert.equal(resolveBoreFamily({ boreFamily: 'ast_icy', boreSeed: 9, typeId: 'ast_metallic' }), 'ast_icy');
  assert.equal(resolveBoreFamily({ boreSeed: 9, typeId: 'ast_metallic' }), LEGACY_GEOLOGY_FAMILY);
  assert.equal(resolveBoreFamily({ typeId: 'ast_metallic' }), 'ast_metallic');
  assert.equal(resolveBoreFamily({ boreSeed: 9 }), LEGACY_GEOLOGY_FAMILY, 'a saved site record with only a seed');
  assert.equal(resolveBoreFamily(null, 'ast_crystalline'), 'ast_crystalline');
  assert.equal(resolveBoreFamily({}), LEGACY_GEOLOGY_FAMILY);
});

test('each rock type is its own stone on the board, and the board is told which rock it is in', async () => {
  const { readFileSync } = await import('node:fs');
  const { worksHostStone } = await import('../src/ui/asteroid/asteroidRenderer3d.js');
  const stones = new Set();
  for (const family of Object.keys(ROCK_GEOLOGY)) {
    const stone = worksHostStone(family);
    assert.equal(stone.length, 3, `${family} has a stone`);
    assert.ok(stone.every((channel) => channel > 0.3 && channel < 1.8), `${family} stays a rock colour`);
    stones.add(stone.join(','));
  }
  assert.equal(stones.size, Object.keys(ROCK_GEOLOGY).length, 'no two rock types share a stone');
  assert.deepEqual([...worksHostStone('ast_common_rock')], [1, 1, 1], 'the common rock is the stone the board always had');
  assert.deepEqual([...worksHostStone(LEGACY_GEOLOGY_FAMILY)], [1, 1, 1], 'a rock bored before the rule keeps its look');
  // The session says which rock this is, and the display side is sent that field.
  assert.match(readFileSync(new URL('../src/systems/drill.js', import.meta.url), 'utf8'), /fieldId: rock\.fieldId,[^]*?\n\s+boreFamily,/);
  assert.match(readFileSync(new URL('../scripts/lib/simReadModel.mjs', import.meta.url), 'utf8'), /'fieldId','boreFamily'/);
});
