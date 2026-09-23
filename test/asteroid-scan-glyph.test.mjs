import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASTEROIDS,
  asteroidScanGlyph,
  dominantOreScanGlyph,
} from '../src/data/mining.js';
import { appraiseDeposit, glyphForOreTable } from '../src/careers/origins/prospectorOriginAppraisal.js';
import { scanner } from '../src/systems/scanner.js';

const EXPECTED = Object.freeze({
  ast_common_rock: 'Si',
  ast_metallic: 'Fe',
  ast_icy: 'H₂O',
  ast_crystalline: 'Cr',
  ast_gas_cloud: 'Gas',
  ast_rare_exotic: 'Xe',
});

test('each authored rock agrees on lock, chart, and dominant ore', () => {
  assert.equal(ASTEROIDS.length, 6);
  for (const ast of ASTEROIDS) {
    const glyph = EXPECTED[ast.id];
    assert.ok(glyph, ast.id);
    assert.equal(asteroidScanGlyph(ast.id), glyph, ast.id);
    assert.equal(dominantOreScanGlyph(ast.oreTable), glyph, `${ast.id} dominant`);
    assert.equal(glyphForOreTable(ast.oreTable), glyph, `${ast.id} appraisal table`);
    const appraisal = appraiseDeposit({
      id: ast.id,
      type: 'asteroid',
      data: { typeId: ast.id },
    });
    assert.equal(appraisal.glyph, glyph, `${ast.id} appraisal`);
  }
});

test('silicate is not iron, and a platinoid rock is not iron', () => {
  assert.equal(dominantOreScanGlyph({ cmdty_silicate: 0.7, cmdty_ore_iron: 0.3 }), 'Si');
  assert.equal(
    dominantOreScanGlyph({
      cmdty_ore_platinoid: 0.6,
      cmdty_crystal_lumin: 0.25,
      cmdty_exotic_xenium: 0.15,
    }),
    'Xe',
  );
  assert.equal(asteroidScanGlyph('not_a_rock'), 'Ore');
  assert.equal(glyphForOreTable(null), 'Ore');
});

test('a scan pulse stamps the type glyph, seed 4242 rocks', () => {
  const rocks = ASTEROIDS.map((ast, index) => ({
    id: 100 + index,
    type: 'asteroid',
    alive: true,
    pos: { x: 40 + index * 10, z: 12 },
    data: { typeId: ast.id },
  }));
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: { fittings: [] } };
  const entities = new Map([[player.id, player], ...rocks.map((rock) => [rock.id, rock])]);
  const state = {
    meta: { seed: 4242 },
    playerId: player.id,
    entities,
    entityList: [player, ...rocks],
    simTime: 12,
    mode: 'flight',
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: { pois: [] },
    },
  };
  const events = [];
  const priorBus = scanner.bus;
  const priorScratch = scanner._scratch;
  scanner.bus = { emit(name) { events.push(name); } };
  scanner._scratch = [];
  try {
    scanner._pulse(state, player, state.simTime);
  } finally {
    scanner.bus = priorBus;
    scanner._scratch = priorScratch;
  }
  for (const rock of rocks) {
    assert.equal(rock.data.scanOreGlyph, EXPECTED[rock.data.typeId], rock.data.typeId);
    assert.equal(appraiseDeposit(rock).glyph, EXPECTED[rock.data.typeId]);
  }
  assert.equal(events.filter((name) => name === 'scan:completed').length, 1);
});
