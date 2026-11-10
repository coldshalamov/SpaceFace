// Every named ace's specialty tag reads as a named problem on the target panel — no raw
// fallback uppercase strings for authored gimmicks. The panel's label table is module-private,
// so the pin reads the table's keys from the module source: any tag missing there would fall
// through getGimmickLabel's uppercase fallback and fail here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { knownAces } from '../src/data/namedAces.js';

function labelTableKeys() {
  const src = readFileSync(new URL('../src/ui/targetPanel.js', import.meta.url), 'utf8');
  const table = src.match(/const GIMMICK_LABELS = \{([\s\S]*?)\n\};/);
  assert.ok(table, 'targetPanel.js keeps its GIMMICK_LABELS table');
  const keys = new Set();
  for (const m of table[1].matchAll(/['"]([a-z_-]+)['"]:/g)) keys.add(m[1]);
  for (const m of table[1].matchAll(/^ {2}([a-z_]+):/gm)) keys.add(m[1]);
  return keys;
}

test('every ace gimmick tag resolves through the panel table without a raw fallback', () => {
  const keys = labelTableKeys();
  const tags = [...new Set(knownAces().map((ace) => ace.gimmickTag).filter(Boolean))];
  assert.ok(tags.length >= 10, 'the ace roster carries its specialty tags');
  for (const tag of tags) {
    const normalized = String(tag).toLowerCase().replace(/_/g, '-');
    assert.ok(
      keys.has(normalized) || keys.has(String(tag).toLowerCase()),
      `gimmickTag "${tag}" must have a target-panel label`,
    );
  }
});
