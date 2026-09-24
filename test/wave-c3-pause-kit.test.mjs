// C3 — pause uses the same kit as flight. Resume, save, and settings stay in the
// tab order. The return-after-absence brief stays.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8');

test('pause verbs are kit words in tab order, and the brief stays', () => {
  assert.equal(source.includes('sf-btn'), false);
  const resume = source.indexOf("coreText('resume')");
  const settings = source.indexOf("coreText('settings')");
  const save = source.indexOf("coreText('save')");
  assert.ok(resume > 0 && settings > resume && save > settings, 'resume, then settings, then save');
  assert.match(source, /briefSave/);
  assert.match(source, /briefObjective/);
  assert.match(source, /briefNext/);
  assert.match(source, /system: 'light'/);
});
