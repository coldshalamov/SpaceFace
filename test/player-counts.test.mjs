// Lint for the INFERENCE "counts and plurals" defect class (design/program/INFERENCE_CLASSES.md):
// a raw number glued to a noun — `${n} unit${n === 1 ? '' : 's'}` and friends — belongs nowhere in
// player-facing source. Every count-to-word decision routes through pluralWord()/counted() in
// src/core/numberFormat.js. This file fails when the glue or a per-screen chooser copy comes back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { counted, pluralWord } from '../src/core/numberFormat.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const HELPER = join(SRC, 'core', 'numberFormat.js');

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'catalogs') continue;
      yield* jsFiles(path);
    } else if (/\.(js|mjs|cjs)$/.test(name) && !name.endsWith('.generated.js')) {
      yield path;
    }
  }
}

// s-glue inside a template hole: `${x === 1 ? '' : 's'}`, `${x > 1 ? 's' : ''}`,
// `${x !== 1 ? 'es' : ''}` — the number-and-noun split the class bans.
const S_GLUE = /\$\{[^{}]*(?:={2,3}|!==|!=|>|<)\s*1\s*\?\s*'(?:es|s|S|ES)?'\s*:\s*'(?:es|s|S|ES)?'\}/g;
// A word-ternary on a count: `x === 1 ? 'word' : 'words'` inside ${} and in plain code.
const TERNARY_IN_TEMPLATE = /\$\{[^{}]*={2,3}\s*1\s*\?\s*'([A-Za-z][A-Za-z ]*)'\s*:\s*'([A-Za-z][A-Za-z ]*)'\}/g;
const TERNARY_PLAIN = /[\w.[\]$()]+\s*={2,3}\s*1\s*\?\s*'([A-Za-z][A-Za-z-]*)'\s*:\s*'([A-Za-z][A-Za-z-]*)'/g;
// A local one-vs-many chooser — the class's "per-screen copies". `counted` also means a plain
// counter variable elsewhere, so it is only banned with the chooser's exact signature.
const LOCAL_CHOOSER = /(?:function|const|let|var)\s+(countPhrase|countPlural|plural|pluralize|pluralOf|pluralWords)\s*[=(]|function\s+counted\s*\(\s*\w+\s*,\s*singular/g;

// Legitimate single-word ternaries that are not noun plurals (idioms, state words, class names).
// Keyed by the exact matched arm pair "a|b"; add only with a comment in the file.
const ALLOWED_ARMS = new Set([
  'once|', // "did it once" is a whole sentence, not a noun count
  'down|up', // drill direction, not a count
  'pirate|civilian', // shipjack team label, not a count
  'economyContract|encounterAftermath', // event-type IDs, not nouns
  'asteroid|wreck', 'asteroid|debris', // battlefield slot kinds
  'success|encore', // vesper performance event names
  'triangle|square', // discoveryAudio shape constants
  'true|false', // aria-pressed on a zoom-scale control, not a count
  'low|normal', // market demand label (level is a small int, but not a noun plural)
  'full|online', // hullIntegrity shield fraction (0..1 float — must stay === 1, never round)
]);

test('counted()/pluralWord() are the one chooser and behave', () => {
  assert.equal(pluralWord(1, 'leg'), 'leg');
  assert.equal(pluralWord(2, 'leg'), 'legs');
  assert.equal(pluralWord(2, 'trophy', 'trophies'), 'trophies');
  assert.equal(pluralWord(1, 'was taken', 'were taken'), 'was taken');
  assert.equal(pluralWord(2, 'was taken', 'were taken'), 'were taken');
  assert.equal(counted(1, 'entry', 'entries'), '1 entry');
  assert.equal(counted(2500, 'unit'), '2,500 units');
  assert.equal(counted(3, 'crate', 'crates', null, { words: true }), 'three crates');
  assert.equal(counted(7, 'ship', 'ships', null, { bare: true }), 'ships');
});

test('no raw number glued to a noun in player-facing source', () => {
  const offenders = [];
  for (const file of jsFiles(SRC)) {
    if (file === HELPER) continue;
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    for (const re of [S_GLUE, TERNARY_IN_TEMPLATE, TERNARY_PLAIN]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (re !== S_GLUE && ALLOWED_ARMS.has(`${m[1]}|${m[2]}`)) continue;
        const line = text.slice(0, m.index).split('\n').length;
        offenders.push(`${rel}:${line}: ${m[0].slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], [
    'count/plural glue found — route it through pluralWord()/counted() in src/core/numberFormat.js:',
    ...offenders,
  ].join('\n'));
});

test('no per-screen plural chooser copies', () => {
  const offenders = [];
  for (const file of jsFiles(SRC)) {
    if (file === HELPER) continue;
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    LOCAL_CHOOSER.lastIndex = 0;
    let m;
    while ((m = LOCAL_CHOOSER.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      offenders.push(`${rel}:${line}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], [
    'per-screen plural chooser found — use pluralWord()/counted() from src/core/numberFormat.js:',
    ...offenders,
  ].join('\n'));
});
