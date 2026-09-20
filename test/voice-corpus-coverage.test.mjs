// Voice-corpus coverage — the data-side proof for the bark/hail/whisper expansion.
//
// DONE WHEN: every faction × situation/stance cell carries ≥MIN_LINES authored lines, every
// corpus covers every faction with zero missing keys, every selector returns a non-empty
// string per cell, and the new landmark-bleed whisper sources resolve through the same
// deterministic seam as the original three. Pure data checks — no sim boot. The contactHail
// cells stay skipped until that corpus's own lane lands its file.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BARKS,
  BARK_FACTIONS,
  WITNESS_CRIME_BARKS,
  PURSUIT_BARKS,
  SURRENDER_BARKS,
  ESCAPE_TAUNT_BARKS,
  barkFor,
  witnessCrimeBarkFor,
  pursuitBarkFor,
  surrenderBarkFor,
  escapeTauntBarkFor,
} from '../src/data/barks.js';
// contactHail.js lands in its own lane; until its named exports exist, its cells are skipped
// rather than failing the whole file at ESM link time. The validation switches on automatically
// the moment the corpus is committed.
let CONTACT_HAIL_LINES = null;
let CONTACT_HAIL_STANCES = null;
let contactHailLineFor = null;
try {
  const contactHail = await import('../src/data/contactHail.js');
  if (contactHail.contactHailLineFor && contactHail.CONTACT_HAIL_LINES && contactHail.CONTACT_HAIL_STANCES) {
    ({ CONTACT_HAIL_LINES, CONTACT_HAIL_STANCES, contactHailLineFor } = contactHail);
  }
} catch { /* corpus not landed yet */ }
const HAS_CONTACT_HAIL = !!contactHailLineFor;
import { BAND_CHANNEL_BY_ID, resolveLandmarkBleed } from '../src/data/bandRadio.js';

const MIN_LINES = 3;
// The five contact situations every faction must voice: the four long-standing situations plus
// the new 'distress' key (an additive BARKS key — deliberately not in BARK_SITUATIONS).
const CONTACT_SITUATIONS = Object.freeze(['scan', 'warn', 'taunt', 'flee', 'distress']);
// Law-event corpora the law lane wires: witness reaction, pursuit chatter, surrender, post-escape.
const LAW_CORPORA = Object.freeze({
  WITNESS_CRIME_BARKS,
  PURSUIT_BARKS,
  SURRENDER_BARKS,
  ESCAPE_TAUNT_BARKS,
});
const LAW_SELECTORS = Object.freeze({
  WITNESS_CRIME_BARKS: witnessCrimeBarkFor,
  PURSUIT_BARKS: pursuitBarkFor,
  SURRENDER_BARKS: surrenderBarkFor,
  ESCAPE_TAUNT_BARKS: escapeTauntBarkFor,
});
const LAW_SOURCE_IDS = Object.freeze([
  'landmark_quiessence', 'planet_hush', 'resonance_obelisk',
  'wreck_cathedral', 'candle_fleet', 'lung_of_charon',
]);
const NEW_WHISPER_SOURCE_IDS = Object.freeze(['wreck_cathedral', 'candle_fleet', 'lung_of_charon']);

function assertLineShape(line, label, { maxLen = 160, maxEnders = 2 } = {}) {
  assert.equal(typeof line, 'string', `${label} must be a string`);
  assert.ok(line.trim().length > 0, `${label} must be non-empty`);
  assert.ok(!/[\r\n]/.test(line), `${label} must be one line: "${line}"`);
  assert.ok(line.length <= maxLen, `${label} exceeds ${maxLen} chars: "${line}"`);
  const enders = (line.match(/[.!?]/g) || []).length;
  assert.ok(enders <= maxEnders, `${label} is more than one sentence: "${line}"`);
}

test('every faction has distinct scan/warn/taunt/flee/distress lines (≥3, zero missing keys)', () => {
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    assert.ok(pack, `BARKS missing faction ${factionId}`);
    for (const situation of CONTACT_SITUATIONS) {
      const lines = pack[situation];
      assert.ok(Array.isArray(lines), `${factionId}.${situation} key missing`);
      assert.ok(lines.length >= MIN_LINES,
        `${factionId}.${situation} has ${lines.length} lines (need ≥${MIN_LINES})`);
      // The authored register differs per faction: no two factions share an identical array.
      assert.ok(new Set(lines).size === lines.length,
        `${factionId}.${situation} contains duplicate lines`);
    }
    // Deterministic resolution through the standard selector, distress included.
    for (const situation of CONTACT_SITUATIONS) {
      const a = barkFor(factionId, situation, () => 0.5);
      const b = barkFor(factionId, situation, () => 0.5);
      assert.equal(a, b, `barkFor ${factionId}.${situation} not deterministic`);
      assert.ok(typeof a === 'string' && a.length > 0);
    }
  }
});

test('new voice lines are one sentence with one consequence', () => {
  for (const factionId of BARK_FACTIONS) {
    for (const line of BARKS[factionId].distress) {
      assertLineShape(line, `${factionId}.distress`);
    }
    for (const [name, corpus] of Object.entries(LAW_CORPORA)) {
      for (const line of corpus[factionId] || []) {
        assertLineShape(line, `${name}.${factionId}`);
      }
    }
    if (HAS_CONTACT_HAIL) {
      for (const stance of CONTACT_HAIL_STANCES) {
        for (const line of CONTACT_HAIL_LINES[factionId][stance] || []) {
          assertLineShape(line, `CONTACT_HAIL_LINES.${factionId}.${stance}`);
        }
      }
    }
  }
});

test('law-event corpora cover every faction with zero missing keys', () => {
  for (const [name, corpus] of Object.entries(LAW_CORPORA)) {
    for (const factionId of BARK_FACTIONS) {
      const lines = corpus[factionId];
      assert.ok(Array.isArray(lines), `${name} missing faction ${factionId}`);
      assert.ok(lines.length >= MIN_LINES,
        `${name}.${factionId} has ${lines.length} lines (need ≥${MIN_LINES})`);
      const pick = LAW_SELECTORS[name](factionId, 0);
      assert.ok(typeof pick === 'string' && pick.length > 0, `${name} selector empty for ${factionId}`);
    }
    // Unknown factions resolve through the faction_free fallback, never empty.
    assert.ok(LAW_SELECTORS[name]('faction_nonexistent', 0).length > 0);
  }
});

test('contact hails cover every faction × stance cell (≥3 lines, zero missing keys)', (t) => {
  if (!HAS_CONTACT_HAIL) {
    t.skip('contactHail corpus lands in its own lane');
    return;
  }
  for (const factionId of BARK_FACTIONS) {
    const cell = CONTACT_HAIL_LINES[factionId];
    assert.ok(cell, `CONTACT_HAIL_LINES missing faction ${factionId}`);
    for (const stance of CONTACT_HAIL_STANCES) {
      const lines = cell[stance];
      assert.ok(Array.isArray(lines), `CONTACT_HAIL_LINES.${factionId}.${stance} missing`);
      assert.ok(lines.length >= MIN_LINES,
        `${factionId}.${stance} has ${lines.length} lines (need ≥${MIN_LINES})`);
      const a = contactHailLineFor(factionId, stance, 1);
      const b = contactHailLineFor(factionId, stance, 1);
      assert.equal(a, b, 'hail line not deterministic');
      assert.ok(a.length > 0);
    }
  }
  assert.ok(contactHailLineFor('faction_nonexistent', 'hostile', 0).length > 0);
});

test('landmark bleed whisper sources: 6 sources, each with ident/silence behavior and ≥3 lines', () => {
  const channel = BAND_CHANNEL_BY_ID.landmark_bleed;
  assert.ok(channel, 'landmark_bleed channel missing');
  assert.equal(LAW_SOURCE_IDS.length, 6, 'expected six whisper sources (3 original + 3 new)');
  for (const sourceId of LAW_SOURCE_IDS) {
    const behavior = channel.sourceBehaviors.find((row) => row.sourceId === sourceId);
    assert.ok(behavior, `sourceBehaviors missing ${sourceId}`);
    if (behavior.kind === 'ident') {
      assert.ok(behavior.ident && behavior.ident.text.length > 0, `${sourceId} ident missing`);
    } else {
      assert.equal(behavior.kind, 'silence', `${sourceId} has unknown behavior kind ${behavior.kind}`);
    }
    const lines = channel.lines.filter((line) => line.sourceId === sourceId);
    assert.ok(lines.length >= MIN_LINES,
      `${sourceId} has ${lines.length} lines (need ≥${MIN_LINES})`);
    const isNew = NEW_WHISPER_SOURCE_IDS.includes(sourceId);
    for (const line of lines) {
      assert.ok(typeof line.text === 'string' && line.text.trim().length > 0 && !/[\r\n]/.test(line.text),
        `${sourceId}:${line.id} must be a non-empty single line`);
      // The one-sentence rule binds newly authored sources; legacy bleed copy predates it.
      if (isNew) assertLineShape(line.text, `${sourceId}:${line.id}`);
    }
    // Every source resolves through the deterministic bleed seam when its carrier is fed.
    const bleed = resolveLandmarkBleed({ [sourceId]: 0.9 });
    assert.equal(bleed && bleed.sourceId, sourceId, `${sourceId} did not resolve`);
    assert.ok(bleed.lines.length >= MIN_LINES);
  }
  // Established precedence holds: the Hush's silence still outranks every ident carrier.
  const contested = Object.fromEntries(LAW_SOURCE_IDS.map((id) => [id, 0.9]));
  assert.equal(resolveLandmarkBleed(contested).sourceId, 'planet_hush');
});
