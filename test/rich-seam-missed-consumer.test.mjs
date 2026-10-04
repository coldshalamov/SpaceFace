// D166/D167 — `news:headline` and `field:richSeamMissed` were emitted into the void.
//
// news:headline is the system-side record channel; the chronicler now lists it in FACT_EVENTS
// and normalizes an emitter's own line into a 'story' fact. marketNews re-broadcasts committed
// ticker lines on the same event — echoes carry `source` and must not double-record.
//
// field:richSeamMissed is consumed by presentationOrchestrator: a live glint on the dead
// seam's rock ends (key-matched — another seam's receipt must not kill it), and an in-sector
// miss publishes a cited quiet line while recording the fact.
//
// Run: node --test test/rich-seam-missed-consumer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { admitRichSeamGlint, endRichSeamGlint, richSeamGlintRecord } from '../src/render/vfx/worldCueRecipes.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { normalizeFact } from '../src/chronicler/normalize.js';
import { harness } from '../tests/chronicler/harness.mjs';

const SEAM_A = { fieldId: 'f_ceres_1', activityObjectSlotId: 'slot_a' };
const SEAM_B = { fieldId: 'f_ceres_1', activityObjectSlotId: 'slot_b' };

function seamState() {
  const rock = { id: 77, type: 'asteroid', alive: true,
    pos: { x: 10, y: 0, z: 20 },
    data: { fieldId: SEAM_A.fieldId, activityObjectSlotId: SEAM_A.activityObjectSlotId } };
  return {
    simTime: 50, tick: 3000, playerId: 1,
    world: { currentSectorId: 'ceres' },
    entities: new Map([[rock.id, rock]]),
    presentation: {},
  };
}

test('a different seam\'s resolution receipt leaves the live glint standing', () => {
  const state = seamState();
  const live = admitRichSeamGlint(state, { ...SEAM_A, sectorId: 'ceres' });
  assert.equal(richSeamGlintRecord(state), live);
  assert.equal(endRichSeamGlint(state, { ...SEAM_B, sectorId: 'ceres' }), null,
    'seam B\'s missed receipt must not kill seam A\'s glint');
  assert.equal(richSeamGlintRecord(state), live);
  assert.equal(endRichSeamGlint(state, { ...SEAM_A, sectorId: 'ceres' }), live,
    'the matching seam\'s receipt ends it');
  assert.equal(richSeamGlintRecord(state), null);
});

test('a receipt with no seam identity keeps the legacy unconditional end', () => {
  const state = seamState();
  admitRichSeamGlint(state, { ...SEAM_A, sectorId: 'ceres' });
  assert.ok(endRichSeamGlint(state, { asteroidId: 77 }), 'legacy worked emits carry no seam key');
  assert.equal(richSeamGlintRecord(state), null);
});

test('news:headline records a story fact; the marketNews echo is filtered', () => {
  const state = { simTime: 10, tick: 600, playerId: 1,
    world: { currentSectorId: 'helios', activeSector: { name: 'Helios' } }, entities: new Map() };
  const direct = normalizeFact('news:headline', {
    headline: 'Counterexample destroyed. The Revision has lost its captain.',
    kind: 'nemesis-resolution', aceId: 'ace_orra', sectorId: 'helios',
  }, state);
  assert.ok(direct, 'an emitter\'s own line is a fact');
  assert.equal(direct.stage, 'story');
  assert.equal(direct.details.kind, 'news_headline');
  assert.equal(direct.details.note, 'Counterexample destroyed. The Revision has lost its captain.');
  const echo = normalizeFact('news:headline', {
    headline: 'Counterexample destroyed. The Revision has lost its captain.',
    kind: 'nemesis-resolution', aceId: 'ace_orra', source: 'news:publish',
  }, state);
  assert.equal(echo, null, 'a sourced re-broadcast is presentation echo, not a second fact');
  assert.equal(normalizeFact('news:headline', { kind: 'empty' }, state).invalid, true,
    'a headline-less payload is malformed, not noise');
});

test('the live bus path captures each emitter\'s line once', () => {
  const t = harness();
  t.emit(10, 'news:headline', {
    headline: 'The bright seam went cold — its ore reads ordinary rock now.',
    kind: 'rich-seam-missed', sectorId: 'helios',
    fieldId: 'f_ceres_1', activityObjectSlotId: 'slot_a', eventId: 'richSeam:missed:1',
  });
  t.emit(10, 'news:headline', {
    headline: 'The bright seam went cold — its ore reads ordinary rock now.',
    kind: 'rich-seam-missed', sectorId: 'helios', eventId: 'richSeam:missed:1',
    source: 'field:richSeamMissed',
  });
  t.emit(11, 'news:headline', {
    headline: 'The bright seam went cold — its ore reads ordinary rock now.',
    kind: 'rich-seam-missed', sectorId: 'helios',
    fieldId: 'f_ceres_1', activityObjectSlotId: 'slot_b', eventId: 'richSeam:missed:2',
  });
  const facts = t.state.chronicler.pending.filter((f) => f.event === 'news:headline');
  assert.equal(facts.length, 2, 'direct emit + echo dedupe to one fact per seam');
  assert.equal(facts[0].details.newsKind, 'rich-seam-missed');
});

test('an in-sector miss ends the glint and publishes one cited quiet line', () => {
  const state = seamState();
  admitRichSeamGlint(state, { ...SEAM_A, sectorId: 'ceres' });
  const emitted = [];
  const bus = { emit: (event, payload) => emitted.push({ event, payload }) };
  presentationOrchestrator._onRichSeamMissed.call({ state, bus, playerId: 1 }, {
    ...SEAM_A, sectorId: 'ceres', resolvedAtT: 50,
  });
  assert.equal(richSeamGlintRecord(state), null, 'the dead seam\'s glint dies with it');
  const headline = emitted.find((e) => e.event === 'news:headline');
  const publish = emitted.find((e) => e.event === 'news:publish');
  assert.ok(headline && publish, 'the miss records AND surfaces');
  assert.equal(headline.payload.kind, 'rich-seam-missed');
  assert.ok(publish.payload.id && publish.payload.source,
    'the published line carries a citation key and echo-marking source');
});

test('an out-of-sector miss is bookkeeping, not news; a mismatched receipt cannot kill the glint', () => {
  const state = seamState();
  admitRichSeamGlint(state, { ...SEAM_A, sectorId: 'ceres' });
  const emitted = [];
  const bus = { emit: (event, payload) => emitted.push({ event, payload }) };
  presentationOrchestrator._onRichSeamMissed.call({ state, bus, playerId: 1 }, {
    ...SEAM_B, sectorId: 'verge', resolvedAtT: 50,
  });
  assert.equal(richSeamGlintRecord(state) != null, true,
    'a far-sector miss on another seam leaves the live glint');
  assert.equal(emitted.length, 0, 'far-sector misses publish nothing');
});
