// PQ-208.00 — progression verb drift guard (scripts/check-progression-verb-audit.mjs).
//
// Pins the guard's two failure modes WITHOUT touching real data:
//   1. vocabulary drift — a module declaring a mods key the vocabulary does not know;
//   2. consumer drift — a registered verb key whose declared consumer no longer exists (renamed,
//      moved or deleted), or an unwired key hiding without an honest declared-only label.
// Positive cases run against the real tree: the shipped vocabulary must verify clean, and the two
// packet-named keys (microJumpBlink, reactiveMissileKnockback) are wired consumers (PQ-208.01).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERB_MOD_KEYS,
  classifyModule,
  auditModules,
  verifyVerbKeyConsumers,
  runAudit,
} from '../scripts/check-progression-verb-audit.mjs';

function fakeReader(files) {
  return (file) => {
    if (!Object.prototype.hasOwnProperty.call(files, file)) {
      throw new Error(`ENOENT: ${file}`);
    }
    return files[file];
  };
}

const SHIPS_STUB = 'export const CONTROL_GUN_TOKEN_RE = /x/;\nexport const masslineHeadId = {};\n';

test('PQ-208.00 every registered verb key carries verifiable or honestly declared-only evidence', () => {
  const outcome = verifyVerbKeyConsumers();
  assert.deepEqual(outcome.errors, [], `consumer verification must pass on the shipped vocabulary: ${outcome.errors.join(' | ')}`);
  assert.equal(
    outcome.verified.length + outcome.declaredOnly.length,
    Object.keys(VERB_MOD_KEYS).length,
    'every verb key must land in exactly one bucket',
  );
  assert.ok(outcome.verified.length >= 14, `expected the landed consumers to verify, got ${outcome.verified.length}`);
});

test('PQ-208.01 Pale-Coil and Choir-Bell verb keys are read by the unique-loot consumer', () => {
  for (const [key, entry] of Object.entries(VERB_MOD_KEYS)) {
    const evidence = entry[2] || {};
    if (evidence.declaredOnly) {
      assert.match(evidence.declaredOnly, /^PQ-\d+\.\d+$/, `declared-only key '${key}' must name the packet leaf that resolves it`);
    }
  }
  for (const key of ['microJumpBlink', 'reactiveMissileKnockback']) {
    const entry = VERB_MOD_KEYS[key];
    assert.ok(entry, `packet key '${key}' must stay registered`);
    assert.equal(entry[2].file, 'src/systems/uniqueLootAbilities.js');
    assert.equal(entry[2].symbol, key);
    assert.equal(entry[2].declaredOnly, undefined);
  }
  const outcome = verifyVerbKeyConsumers();
  assert.equal(outcome.declaredOnly.length, 0, `unwired keys remain: ${outcome.declaredOnly.join(', ')}`);
  assert.ok(outcome.verified.includes('microJumpBlink'));
  assert.ok(outcome.verified.includes('reactiveMissileKnockback'));
});

test('PQ-208.00 the audit passes on the current tree', () => {
  const outcome = runAudit();
  assert.deepEqual(outcome.errors, [], `runAudit must be green on shipped data: ${outcome.errors.join(' | ')}`);
  assert.ok(outcome.summary.modules > 0);
});

test('PQ-208.00 consumer drift: a verb key whose symbol vanished from its consumer fails', () => {
  const vocabulary = {
    phantomVerb: ['grants a capability nobody implements any more', 'consumer renamed away', { file: 'src/systems/ships.js', symbol: 'PHANTOM_VERB_CONSUMER' }],
  };
  const outcome = verifyVerbKeyConsumers({
    vocabulary,
    readText: fakeReader({ 'src/systems/ships.js': SHIPS_STUB }),
  });
  assert.equal(outcome.errors.length, 1, 'the drift must be fatal');
  assert.match(outcome.errors[0], /phantomVerb/);
  assert.match(outcome.errors[0], /names no implemented behaviour/);
  assert.match(outcome.errors[0], /PHANTOM_VERB_CONSUMER/);
});

test('PQ-208.00 consumer drift: a verb key whose consumer file is deleted fails', () => {
  const vocabulary = {
    ghostVerb: ['grants a capability whose system was deleted', 'systems/deleted.js', { file: 'src/systems/deleted.js', symbol: 'ghostVerb' }],
  };
  const outcome = verifyVerbKeyConsumers({ vocabulary, readText: fakeReader({}) });
  assert.equal(outcome.errors.length, 1);
  assert.match(outcome.errors[0], /ghostVerb/);
  assert.match(outcome.errors[0], /names no implemented behaviour/);
  assert.match(outcome.errors[0], /missing/);
});

test('PQ-208.00 fail closed: an unwired verb key cannot register without an honest label', () => {
  // No evidence block at all.
  const bare = verifyVerbKeyConsumers({
    vocabulary: { bareVerb: ['a verb', 'trust me'] },
    readText: fakeReader({}),
  });
  assert.equal(bare.errors.length, 1);
  assert.match(bare.errors[0], /bareVerb/);
  assert.match(bare.errors[0], /no consumer evidence/);

  // Malformed evidence (neither file+symbol nor declaredOnly).
  const malformed = verifyVerbKeyConsumers({
    vocabulary: { malformedVerb: ['a verb', 'hand-waved', { consumer: 'somewhere' }] },
    readText: fakeReader({}),
  });
  assert.equal(malformed.errors.length, 1);
  assert.match(malformed.errors[0], /malformedVerb/);
  assert.match(malformed.errors[0], /malformed/);

  // declaredOnly without a tracker is just as malformed — the label must name its packet leaf.
  const unlabeled = verifyVerbKeyConsumers({
    vocabulary: { unlabeledVerb: ['a verb', 'unwired', { declaredOnly: '' }] },
    readText: fakeReader({}),
  });
  assert.equal(unlabeled.errors.length, 1);
  assert.match(unlabeled.errors[0], /unlabeledVerb/);
});

test('PQ-208.00 vocabulary drift: a module declaring an unregistered verb-shaped key is fatal', () => {
  // A module that otherwise classifies clean (known scalar), drifting via one unregistered key.
  const def = { id: 'pq208_drift_fixture', mods: { shieldFlat: 10, telepathyScanRange: 5 } };
  const row = { def, ...classifyModule(def) };
  assert.deepEqual(row.unknownKeys, ['telepathyScanRange']);
  const pass = auditModules([row]);
  assert.equal(pass.errors.length, 1);
  assert.match(pass.errors[0], /MODULE DRIFT pq208_drift_fixture/);
  assert.match(pass.errors[0], /telepathyScanRange/);
  // The same key registered honestly as a verb with a live consumer classifies clean.
  const good = classifyModule({ id: 'pq208_clean_fixture', mods: { droneBay: 2 } });
  assert.deepEqual(good.unknownKeys, []);
  assert.equal(good.primary, 'verb');
});
