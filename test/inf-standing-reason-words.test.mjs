/**
 * inf-standing-reason-words — the standing register reads every deed back as words.
 *
 * The phrase bank's own law said "the bank covers every standing reason the register can read
 * back, so a deed surfaces as words and never as a raw reason id" — but half the vocabulary the
 * repo emits was never given words. The register printed 'survivorPod rescued', 'choir
 * offering:chorister', 'fled the border' as 'verge:border_flight'. Now the bank phrases every
 * emitted reason from its emitter's own beat (rescue, border crossings, choir work, cover
 * checks, the fence's route, inspections, the five hundred), compound families carry their
 * tails as words, and an unphrased future id falls back to split words, never camelCase code.
 * A source-scan pins the law: every standing reason literal in src renders clean.
 *
 * Focused: owners = src/data/repReasons.js (read by src/ui/factionStanding.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repReasonLabel, REP_REASON_LABELS } from '../src/data/repReasons.js';
import { factionHistoryLines } from '../src/ui/factionStanding.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// One scan pattern for both call seams that land in the standing register's ring.
const REASON_SCAN = /(?:applyRep\([^;]{0,160}?|emit\('faction:repDelta',\s*\{[^;]{0,200}?)reason:\s*'([A-Za-z0-9_]+(?::[A-Za-z0-9_]+)*)'/gs;
// Compound ids whose tail is a template at the emit site — pinned by family through these
// representative ids (archive:cite:*, choir_sacrilege:*, recovery:* are templates in src).
const DYNAMIC_FAMILY_SAMPLES = [
  'archive:cite:vigil',
  'archive:file_circulated',
  'choir_sacrilege:reliquary',
  'choir_relief:mercy_hand_repair',
  'choir_offering:chorister',
  'recovery:success',
  'mission_failed:hauler',
  'spillover:war_won',
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function collectEmittedReasonIds() {
  const ids = new Set();
  for (const file of walk(path.join(ROOT, 'src'))) {
    if (file.replaceAll('\\\\', '/').includes('src/data/repReasons.js')) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(REASON_SCAN)) ids.add(match[1]);
  }
  return [...ids].sort();
}

const MACHINE_RESIDUE = /[_:]|[a-z][A-Z]/;

test('every standing reason the repo emits reads as words — the bank law holds by scan', () => {
  const ids = collectEmittedReasonIds();
  assert.ok(ids.length >= 40, `the scan still sees the vocabulary (${ids.length} ids)`);
  const failures = [];
  for (const id of ids) {
    const label = repReasonLabel(id);
    if (MACHINE_RESIDUE.test(label) || label === id) {
      failures.push(`${id} -> "${label}"`);
    }
  }
  assert.deepEqual(failures, [], 'reasons rendering as raw ids or machine words');
  // And every scanned id is either labeled exactly or phrased through its family — no id may
  // silently rely on a humanized fallback once it has shipped.
  const unlabeled = ids.filter((id) => !REP_REASON_LABELS[id] && !id.includes(':'));
  assert.deepEqual(unlabeled, [], 'flat ids must carry an authored label');
});

test('the rescue receipt finally reads as words, not code', () => {
  // The leak that surfaced while wiring the rescue desk answer: the pod you towed home paid
  // its standing as 'survivorPod rescued'.
  assert.equal(repReasonLabel('survivorPod:rescued'), 'mayday answered');
  assert.equal(repReasonLabel('survivorPod:strip'), 'pod stripped for salvage');
});

test('compound families speak their tails as words', () => {
  assert.equal(repReasonLabel('choir_offering:vigil'), 'choir offering (vigil)');
  assert.equal(repReasonLabel('choir_relief:mercy_hand_repair'), 'choir relief work (mercy hand repair)');
  assert.equal(repReasonLabel('archive:file_circulated'), 'archive deed (file circulated)');
  assert.equal(repReasonLabel('gate3:contest_won'), 'gate three (contest won)');
  assert.equal(repReasonLabel('special500:guilt_filed'), 'the five hundred (guilt filed)');
  assert.equal(repReasonLabel('occupation_switch:bonded_hauler'), 'occupation changed (bonded hauler)');
  assert.equal(repReasonLabel('spillover:war_won'), 'ally/rival spillover (war outcome support)');
  for (const sample of DYNAMIC_FAMILY_SAMPLES) {
    assert.ok(!MACHINE_RESIDUE.test(repReasonLabel(sample)), `${sample} reads as words`);
  }
});

test('border crossings and the war outcomes read as the deeds they are', () => {
  assert.equal(repReasonLabel('verge:clean_transit'), 'clean border transit');
  assert.equal(repReasonLabel('verge:border_flight'), 'fled the border');
  assert.equal(repReasonLabel('verge:unauthorized_crossing'), 'crossed the border unwelcome');
  assert.equal(repReasonLabel('war_won'), 'war outcome support');
  assert.equal(repReasonLabel('war_lost'), 'war outcome loss');
});

test('a future unphrased id falls back to words, never code', () => {
  assert.equal(repReasonLabel('futureSystem:unphrased_thing'), 'future system unphrased thing');
  assert.equal(repReasonLabel('newPlainId'), 'new plain id');
  assert.equal(repReasonLabel('CamelFamily:secondPart'), 'camel family second part');
});

test('the register renders a mixed history as a page of words', () => {
  const lines = factionHistoryLines({
    history: [
      { value: 20, reason: 'survivorPod:rescued', t: 60 },
      { value: -8, reason: 'verge:border_flight', t: 120 },
      { value: 6, reason: 'choir_offering:vigil', t: 180 },
      { value: 2, reason: 'lawful_inspection_clear', t: 240 },
    ],
  }, 300, 8);
  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.ok(!MACHINE_RESIDUE.test(line.text), `register line is words: ${line.text}`);
  }
  assert.match(lines[3].text, /mayday answered · \+20/);
  assert.match(lines[0].text, /inspection passed · \+2/);
});
