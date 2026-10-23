// EXP-01: unmasked Helix ships speak in their own voice. Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BARK_EVENT_SITUATIONS,
  BARK_FACTIONS,
  BARK_SITUATIONS,
  BARKS,
  BAR_APPROACH_BARKS,
  BAR_GREETING_BARKS,
  ESCAPE_TAUNT_BARKS,
  barkFor,
  barApproachBarkFor,
  barGreetingBarkFor,
  escapeTauntBarkFor,
} from '../src/data/barks.js';

const SEED = 4242;
const CONCORD_SCAN = 'Concord Patrol. Stand by for routine transponder verification. Ref 44-C.';

test(`seed ${SEED}: Helix speaks its own invoice voice on the bark, bar, and escape paths`, () => {
  assert.equal(BARK_FACTIONS.at(-1), 'faction_helix');
  const pack = BARKS.faction_helix;
  assert.ok(pack, 'faction_helix has a bark pack');
  const heard = [];
  for (const situation of [...BARK_SITUATIONS, ...BARK_EVENT_SITUATIONS]) {
    const lines = pack[situation];
    assert.ok(Array.isArray(lines) && lines.length >= 4, `${situation} needs four Helix lines`);
    for (let i = 0; i < lines.length; i++) {
      const line = barkFor('faction_helix', situation, i);
      assert.equal(line, lines[i], `${situation}[${i}] must come from the shipped pack`);
      heard.push(line);
    }
  }
  const all = heard.join('\n');
  assert.match(all, /Lawful interdiction\./);
  assert.match(all, /Under orders\./);
  assert.match(all, /Read the invoice first\./);
  assert.equal(barkFor('faction_scn', 'scan', 0), CONCORD_SCAN, 'another house keeps its lines');

  const greet = barGreetingBarkFor('faction_helix', 'pilot', SEED);
  assert.ok(BAR_GREETING_BARKS.faction_helix.any.includes(greet), greet);
  const approach = barApproachBarkFor('faction_helix', SEED);
  assert.ok(BAR_APPROACH_BARKS.faction_helix.includes(approach), approach);
  const taunt = escapeTauntBarkFor('faction_helix', SEED);
  assert.ok(ESCAPE_TAUNT_BARKS.faction_helix.includes(taunt), taunt);
  assert.ok(ESCAPE_TAUNT_BARKS.faction_helix.length >= 4);
});
