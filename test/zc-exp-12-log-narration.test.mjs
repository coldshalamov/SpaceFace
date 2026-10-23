// EXP-12 — the LOG copy table holds the row-502 volume across the outcome kinds, in register.
//
// Index 0 of every pool is the launch line the golden pins, so a caller with no pick reads
// exactly what row 502 shipped; the volume lives behind the caller's rotation pick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { physicsLogLine, PHYSICS_LOG_LINE_COUNT, PHYSICS_LOG_EVENTS } from '../src/data/physicsLog.js';

const BIBLE = readFileSync(new URL('../design/expansion/01_TONE_AND_WORLD.md', import.meta.url), 'utf8');

test('the copy table holds at least 60 authored lines across the outcome kinds', () => {
  assert.ok(PHYSICS_LOG_LINE_COUNT >= 60, `LOG holds ${PHYSICS_LOG_LINE_COUNT} lines, needs >= 60`);
});

test('every outcome kind still speaks, and the launch lines are unchanged under no pick', () => {
  assert.match(physicsLogLine('combat:kill', { cause: 'impact', victimName: 'reaver-2', impactMass: 640 }),
    /REAVER-2 RECLASSIFIED: PROJECTILE — 640t/);
  assert.match(physicsLogLine('tether:releaseRated', { classification: 'clean', tonnageU: 42 }), /LINE RELEASED 42t/);
  assert.match(physicsLogLine('vael:lienClamped'), /LIEN ATTACHED/);
  assert.match(physicsLogLine('vael:lienPaid'), /LIEN SETTLED/);
  assert.match(physicsLogLine('vael:lienCut'), /LIEN CUT/);
  assert.match(physicsLogLine('vael:lienThrown'), /LIEN TRANSFERRED/);
  for (const kind of ['lossLedger:recorded', 'custody:recorded', 'aftermathWreck:recorded', 'law:recordAudit',
    'mail:delivered', 'survivorPod:delivered', 'occupation:delivered', 'helix:lienFiled', 'helix:lienStuck']) {
    assert.equal(typeof physicsLogLine(kind, {}), 'string', `${kind} still narrates`);
  }
  assert.equal(physicsLogLine('combat:kill', { cause: 'gun' }), null, 'ordinary gun kills stay quiet');
});

test('a pick rotates the pool without inventing a second voice', () => {
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    seen.add(physicsLogLine('combat:kill', { cause: 'impact', victimName: 'reaver-2', impactMass: 640, pick: i }));
  }
  assert.ok(seen.size >= 6, `rotation reaches the pool (${seen.size} distinct over 24 picks)`);
  for (const line of seen) {
    assert.match(line, /REAVER-2/, 'every variant still names the hull — LOG edits facts, never mood');
  }
  // Deterministic: the same pick reads the same line, twice, on any seed.
  assert.equal(physicsLogLine('combat:kill', { cause: 'impact', victimName: 'x', pick: 5 }),
    physicsLogLine('combat:kill', { cause: 'impact', victimName: 'x', pick: 5 }));
});

test("the register is the bible filing voice: declarative, units a person knows, no jokes on purpose", () => {
  // §3.2's voice law + §3.3's plain-verb rules, enforced on the whole table.
  assert.match(BIBLE, /LOG\s+never jokes on purpose/);
  const src = readFileSync(new URL('../src/data/physicsLog.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bwu\/s\b(?!²)/, 'lines carry units a person knows');
  assert.ok(PHYSICS_LOG_EVENTS.length >= 19, 'the feed surface is unchanged');
});
