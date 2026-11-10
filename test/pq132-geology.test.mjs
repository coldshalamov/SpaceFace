import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeDeepCoreBudget,
  DEEP_CORE_YIELD_MULT,
  DRILL_CONST,
  generateDrillField,
  generateFormations,
} from '../src/systems/drill.js';

const { COLS, ROWS } = DRILL_CONST;
const METAL_ORES = new Set([
  'cmdty_ore_iron',
  'cmdty_ore_bronzium',
  'cmdty_ore_copper',
  'cmdty_ore_silverium',
  'cmdty_ore_goldium',
  'cmdty_ore_platinium',
]);
const EXOTIC_ORES = new Set([
  'cmdty_ore_einsteinium',
  'cmdty_gem_emerald',
  'cmdty_gem_ruby',
  'cmdty_exotic_amazonite',
]);
const ICE_ORE = 'cmdty_gem_diamond';
const BEFORE_SEED_4 = Object.freeze({
  bodies: 189,
  largest: 3,
  histogram: Object.freeze({ 1: 172, 2: 16, 3: 1 }),
});
const NBR4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

function collectComponents(field, accepts, materialOf) {
  const seen = new Uint8Array(COLS * ROWS);
  const components = [];
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const idx = row * COLS + col;
      if (seen[idx]) continue;
      seen[idx] = 1;
      const tile = field[col][row];
      if (!accepts(tile)) continue;
      const material = materialOf(tile);
      const cells = [];
      const stack = [[col, row]];
      while (stack.length) {
        const [cc, rr] = stack.pop();
        cells.push({ col: cc, row: rr, idx: rr * COLS + cc });
        for (const [dc, dr] of NBR4) {
          const nc = cc + dc;
          const nr = rr + dr;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
          const ni = nr * COLS + nc;
          if (seen[ni]) continue;
          const neighbor = field[nc][nr];
          if (!accepts(neighbor) || materialOf(neighbor) !== material) continue;
          seen[ni] = 1;
          stack.push([nc, nr]);
        }
      }
      components.push({ material, cells, size: cells.length });
    }
  }
  return components;
}

function veinComponents(field) {
  return collectComponents(field, (tile) => tile?.type === 'vein' && !!tile.ore, (tile) => tile.ore);
}

function gasComponents(field) {
  return collectComponents(field, (tile) => tile?.type === 'gas', () => 'gas');
}

function histogram(components) {
  const counts = {};
  for (const component of components) counts[component.size] = (counts[component.size] || 0) + 1;
  return counts;
}

function sortedSizes(components) {
  return components.map((component) => component.size).sort((a, b) => a - b);
}

function spanOf(component) {
  const cols = component.cells.map((cell) => cell.col);
  const rows = component.cells.map((cell) => cell.row);
  return {
    width: Math.max(...cols) - Math.min(...cols) + 1,
    height: Math.max(...rows) - Math.min(...rows) + 1,
  };
}

test('PQ-132 seeded geology replaces confetti with bounded contiguous bodies', (t) => {
  const field = generateDrillField(4);
  const veins = veinComponents(field);
  const metals = veins.filter((body) => METAL_ORES.has(body.material));
  const ice = veins.filter((body) => body.material === ICE_ORE);
  const exotics = veins.filter((body) => EXOTIC_ORES.has(body.material));
  const gas = gasComponents(field);
  const after = {
    bodies: veins.length,
    largest: Math.max(...veins.map((body) => body.size)),
    histogram: histogram(veins),
  };

  t.diagnostic(`PQ-132 BEFORE seed 4: ${JSON.stringify(BEFORE_SEED_4)}`);
  t.diagnostic(`PQ-132 AFTER seed 4: ${JSON.stringify(after)}`);
  t.diagnostic(`metal seams=${JSON.stringify(sortedSizes(metals))}; gas pockets=${JSON.stringify(sortedSizes(gas))}; ice lenses=${JSON.stringify(sortedSizes(ice))}; exotic bodies=${JSON.stringify(sortedSizes(exotics))}`);

  assert.ok(metals.length >= 6 && metals.length <= 12, `metal seam count ${metals.length} must be 6-12`);
  assert.ok(metals.every((body) => body.size >= 4 && body.size <= 14), 'every metal seam is 4-14 connected cells');
  assert.ok(gas.length >= 3 && gas.length <= 6, `gas pocket count ${gas.length} must be 3-6`);
  assert.ok(gas.every((body) => body.size >= 2 && body.size <= 6), 'every gas pocket is 2-6 connected cells');
  assert.ok(ice.length >= 1 && ice.length <= 3, `ice lens count ${ice.length} must be 1-3`);
  assert.ok(exotics.length >= 1 && exotics.length <= 3, `exotic body count ${exotics.length} must be 1-3`);
  assert.ok(
    exotics.every((body) => body.cells.every((cell) => cell.row >= Math.floor(ROWS * 0.72))),
    'exotic bodies stay in the deep-core band',
  );
  const entrySeam = metals.find((body) => body.cells.some((cell) => cell.row === 3 && cell.col >= 7 && cell.col <= 21));
  assert.ok(entrySeam, 'the fresh entry work window contains a real seam the site-register lens can inspect');
  assert.ok(
    entrySeam.cells.every((cell) => field[cell.col][cell.row].tierReq === 1),
    'the first surveyable seam is workable before deeper locked materials advertise upgrades',
  );

  const grainReadable = metals.filter((body) => {
    const span = spanOf(body);
    return Math.max(span.width, span.height) >= Math.min(span.width, span.height) + 2;
  });
  assert.ok(
    grainReadable.length >= Math.ceil(metals.length * 0.75),
    'at least 75% of metal seams have a readable major-axis grain',
  );

  let forkCells = 0;
  for (const body of metals) {
    const members = new Set(body.cells.map((cell) => cell.idx));
    for (const cell of body.cells) {
      const degree = NBR4.reduce((sum, [dc, dr]) => {
        const col = cell.col + dc;
        const row = cell.row + dr;
        return sum + (col >= 0 && col < COLS && row >= 0 && row < ROWS
          && members.has(row * COLS + col));
      }, 0);
      if (degree >= 3) forkCells++;
    }
  }
  assert.ok(forkCells > 0, 'the seeded walks produce branches, not only straight stamps');
});

test('gas pockets have an intact one-cell seal and strata remain depth-banded matrix', () => {
  const field = generateDrillField(4);
  const gas = gasComponents(field);
  for (const body of gas) {
    const members = new Set(body.cells.map((cell) => cell.idx));
    for (const cell of body.cells) {
      assert.ok(cell.col > 0 && cell.col < COLS - 1 && cell.row > 0 && cell.row < ROWS - 1, 'gas never touches the field boundary');
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const col = cell.col + dc;
          const row = cell.row + dr;
          const idx = row * COLS + col;
          if (members.has(idx)) continue;
          assert.notEqual(field[col][row].type, 'empty', 'gas seal contains no open void');
          assert.notEqual(field[col][row].type, 'gas', 'separate pockets cannot leak into the seal');
        }
      }
    }
  }

  let matrixCells = 0;
  const basaltByRow = [];
  for (let row = 3; row < ROWS; row++) {
    let basalt = 0;
    for (let col = 0; col < COLS; col++) {
      const tile = field[col][row];
      if (tile.type === 'dirt') matrixCells++;
      if (tile.type === 'rock') basalt++;
    }
    basaltByRow.push(basalt);
  }
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < 3; row++) if (field[col][row].type === 'dirt') matrixCells++;
  }
  assert.ok(matrixCells > COLS * ROWS * 0.5, 'plain matrix remains the majority material');
  assert.ok(basaltByRow.filter((count) => count >= COLS / 2).length >= 3, 'multiple basalt-heavy depth bands exist');
  assert.ok(basaltByRow.filter((count) => count <= COLS * 0.2).length >= 3, 'basalt bands are separated by matrix-heavy strata');
});

test('formation generation is pure, seeded, family-stable, and free of ambient randomness', () => {
  const a = generateFormations(4, 'deep-core', COLS, ROWS);
  const b = generateFormations(4, 'deep-core', COLS, ROWS);
  const otherSeed = generateFormations(5, 'deep-core', COLS, ROWS);
  const otherFamily = generateFormations(4, 'icy-family', COLS, ROWS);
  assert.deepEqual(a, b, 'same seed and family reproduce the identical field');
  assert.notDeepEqual(a, otherSeed, 'asteroid seed changes the field');
  assert.notDeepEqual(a, otherFamily, 'stable family identity participates in the derived streams');
});

test('larger seams do not regress either deep-core payout floor', () => {
  assert.equal(DEEP_CORE_YIELD_MULT, 4, 'deep-core keeps the enlarged pool that outlasts the first few veins');
  const normal = computeDeepCoreBudget({ surfaceYieldU: 8, richnessMult: 1 });
  assert.equal(normal.max, 32, 'an 8u surface rock retains a 32u deep-core pool');

  const thinLastUnit = computeDeepCoreBudget({
    surfaceYieldU: 2,
    drillDepletion: 0.8,
    richnessMult: 0.45,
  });
  assert.equal(thinLastUnit.remaining, 1);
  assert.equal(thinLastUnit.budget, 1, 'a still-bearing thin-field rock never rounds its payout to zero');
});
