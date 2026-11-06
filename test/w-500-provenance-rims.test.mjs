// w-500: provenance is history — a stamped unit carries tier + deed through the
// normalizer to its rim mark; Backordered is flavour over a real tier with its
// order text intact; and a fitted Line head's mark reaches the line hardware's
// presentation profile so the hull part shows the same rim.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeModuleProvenance,
  provenanceStamp,
  lineHeadBehavior,
} from '../src/data/lineProgression.js';
import { MODULES } from '../src/data/modules.js';
import { readLineVisualProfile } from '../src/render/lineVisualProfile.js';

const BY_ID = new Map(MODULES.map((d) => [d.id, d]));

test('w-500: a stamped history normalizes to tier, mark and deed — never a stat', () => {
  const stamp = provenanceStamp({
    tier: 'storied',
    label: 'Recovered: ISC Vigilant',
    source: 'wreck',
    deed: 'hull of ISC Vigilant',
  });
  assert.equal(stamp.tier, 'storied');
  assert.equal(stamp.deed, 'hull of ISC Vigilant');
  const norm = normalizeModuleProvenance({ provenance: stamp }, BY_ID.get('mod_line_head_barb'));
  assert.equal(norm.tier, 'storied');
  assert.equal(norm.mark, 'gold', 'storied wears the gold rim');
  assert.equal(norm.deed, 'hull of ISC Vigilant');
  // Behaviours, not stats: no numeric payload anywhere in the normalized mark.
  for (const [k, v] of Object.entries(norm)) assert.equal(typeof v === 'number', false, `${k} must not be a stat`);
});

test('w-500: Backordered is flavour over a real tier, order text intact', () => {
  const stamp = provenanceStamp({ backordered: true, orderText: 'ORDER 0003-PIT' });
  assert.equal(stamp.tier, 'backordered');
  assert.equal(stamp.behindTier, 'worked', 'the paper flavour still names its real tier');
  // Even on a stock-floor def, the flavour resolves to its behind-tier and keeps the joke.
  const norm = normalizeModuleProvenance({ provenance: stamp }, BY_ID.get('mod_line_head_standard'));
  assert.equal(norm.tier, 'worked');
  assert.equal(norm.mark, 'copper');
  assert.equal(norm.backordered, true);
  assert.equal(norm.orderText, 'ORDER 0003-PIT');
  const behavior = lineHeadBehavior('head_breaker', norm);
  assert.equal(behavior.orderText, 'ORDER 0003-PIT', 'the head behavior surfaces the order text');
});

test('w-500: stock mints nothing and a wreck stamp marks Storied salvage', () => {
  assert.equal(provenanceStamp({ tier: 'stock' }), null);
  assert.equal(provenanceStamp({}), null);
  const wreck = provenanceStamp({ tier: 'storied', label: 'Recovered: X', source: 'wreck', deed: 'flew with the Red Wake' });
  const norm = normalizeModuleProvenance({ provenance: wreck });
  assert.equal(norm.mark, 'gold');
  assert.equal(norm.source, 'wreck');
});

test('w-500: the fitted head rim reaches the line hardware profile', () => {
  const entities = new Map();
  entities.set(7, { id: 7, data: { derived: { lineHead: lineHeadBehavior('head_barb', { tier: 'storied' }) } } });
  const state = { playerId: 7, entities, player: { tether: { active: false } }, run: { kind: 'sandbox', phase: 'inactive' } };
  const out = readLineVisualProfile(state);
  assert.equal(out.headId, 'head_barb');
  assert.equal(out.headMark, 'gold', 'a storied Barb marks gold on the part');
  assert.equal(out.markColor, 0xe8b84a);
  assert.equal(out.headColor, '#f07f72', 'the head keeps its authored cable colour');
  // No head fitted — the profile carries no mark fields.
  const plain = readLineVisualProfile({ playerId: 8, entities: new Map(), player: { tether: {} }, run: { kind: 'sandbox', phase: 'inactive' } });
  assert.equal(plain.headId, null);
  assert.equal(plain.markColor, null);
});
