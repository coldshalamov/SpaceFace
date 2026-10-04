// FB-031 — The authored way-of-life sheet is read on arrival and feeds the zones it describes
//
// Pins:
// 1. SECTOR_WAY_OF_LIFE authors exactly 24 rows matching all live sectors.
// 2. Every signatureToy maps to an id in ALL_KILL_MACHINES or is 'explicitly none'.
// 3. buildPostcard on seed 4242 carries wayOfLife sentence and signatureToy.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTOR_WAY_OF_LIFE, getSectorWayOfLife } from '../src/data/sectorWayOfLife.js';
import { ALL_KILL_MACHINES } from '../src/data/environmentalMachinery.js';
import { SECTORS } from '../src/data/sectors.js';
import { buildPostcard } from '../src/ui/sectorPostcard.js';
import { createGameState } from '../src/core/gameState.js';

test('FB-031: SECTOR_WAY_OF_LIFE authors 24 rows matching all live sectors', () => {
  assert.equal(SECTOR_WAY_OF_LIFE.length, 24, 'Exactly 24 rows in SECTOR_WAY_OF_LIFE');
  const sectorIds = new Set(SECTORS.map((s) => s.id));
  assert.equal(sectorIds.size, 24, '24 live sectors');

  for (const row of SECTOR_WAY_OF_LIFE) {
    assert.ok(sectorIds.has(row.id), `Row id ${row.id} must be a known live sector id`);
    assert.ok(typeof row.sentence === 'string' && row.sentence.length > 0, `Row ${row.id} has sentence`);
    assert.ok(typeof row.verb === 'string' && row.verb.length > 0, `Row ${row.id} has verb`);
    assert.ok(typeof row.rhythm === 'string' && row.rhythm.length > 0, `Row ${row.id} has rhythm`);
    assert.ok(typeof row.signatureToy === 'string' && row.signatureToy.length > 0, `Row ${row.id} has signatureToy`);
  }
});

test('FB-031: every signatureToy maps to ALL_KILL_MACHINES or is explicitly none', () => {
  const machineIds = new Set(ALL_KILL_MACHINES.map((m) => m.id));

  for (const row of SECTOR_WAY_OF_LIFE) {
    const toy = row.signatureToy;
    const isValid = machineIds.has(toy) || toy === 'explicitly none';
    assert.ok(
      isValid,
      `Sector ${row.id} signatureToy "${toy}" must exist in ALL_KILL_MACHINES or be "explicitly none"`
    );
  }
});

test('FB-031: postcard model carries way-of-life sentence and signature toy on seed 4242 arrival', () => {
  const state = createGameState({ seed: 4242 });

  for (const sector of SECTORS) {
    const card = buildPostcard(state, sector.id);
    const life = getSectorWayOfLife(sector.id);

    assert.ok(card, `Card exists for ${sector.id}`);
    assert.equal(card.wayOfLife, life.sentence, `Postcard wayOfLife must match sentence for ${sector.id}`);
    assert.equal(card.signatureToy, life.signatureToy, `Postcard signatureToy must match for ${sector.id}`);
  }
});
