// PQ-175.02 — draft cards change a verb's shape, not a number. Seed 17520.
// Honest count: a "+15% line load" card is a number. Shape is what the verb does.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DRAFT_MAGNITUDE_SMELL,
  DRAFT_VERB_CARD_MIN_RATIO,
  DRAFT_VERB_SHAPES,
  auditDraftShapes,
} from '../src/data/survivalDraft.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';

const SEED = 17520;

test('PQ-175.02 shapes: honest catalog is ≥66% verb, ≤33% number, no magnitude smell', () => {
  const audit = auditDraftShapes(SWARM_RULESET);
  assert.equal(audit.ok, true, audit.issues.join('; '));
  assert.deepEqual(audit.smelled, []);
  assert.ok(audit.verbRatio + 1e-9 >= DRAFT_VERB_CARD_MIN_RATIO, `verb ${audit.verbPercent}%`);
  assert.ok(audit.numberShare <= 1 / 3 + 1e-9, `number share ${audit.numberShare}`);
  for (const shape of DRAFT_VERB_SHAPES) {
    assert.ok(audit.shapes.includes(shape), `missing ${shape}`);
  }
  const snare = audit.verbCards.find((card) => card.shape === 'line_load');
  assert.equal(snare.defId, 'mod_transverse_snare_m');
  assert.ok(!DRAFT_MAGNITUDE_SMELL.test(snare.blurb));
  const spool = audit.numberCards.find((card) => card.id === 'spool');
  assert.ok(spool, 'spool is a longer line — a number');
  const reel = audit.verbCards.find((card) => card.shape === 'reel');
  assert.equal(reel.defId, 'mod_winch_hd');
  assert.ok(!DRAFT_MAGNITUDE_SMELL.test(reel.blurb));
  for (const card of audit.verbCards) {
    assert.ok(!card.blurb.includes('\n'), card.id);
    assert.ok(!DRAFT_MAGNITUDE_SMELL.test(card.blurb), card.id);
  }
  assert.equal(survivalDraft.catalogShapes(SWARM_RULESET).verbPercent, audit.verbPercent);
  console.log(
    `DRAFT_SHAPES_${SEED} total=${audit.total} verb=${audit.verbCount} `
    + `number=${audit.numberCount} verbPercent=${audit.verbPercent} `
    + `shapes=${audit.shapes.join(',')}`,
  );
});
