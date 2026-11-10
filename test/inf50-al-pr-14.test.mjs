// AL-PR-14 — accessibility and massline captions sit where the extractor reads `text`.
// Seed 4242. The generated en-US catalog is foreign dirty work and is not rewritten here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MASSLINE_CAPTIONS } from '../src/audio/masslineInstrument.js';
import { hasPlaceholderParity, pseudoLocalize } from '../src/localization/runtime.js';
import { localizableCaptionMessages } from '../src/ui/captions.js';
import { inventoryText } from '../scripts/lib/localizationInventory.mjs';
import surfaces from '../scripts/localization-surfaces.json' with { type: 'json' };

const SEED = 4242;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test(`seed ${SEED}: accessibility and massline captions extract with placeholder parity`, () => {
  const source = readFileSync(join(ROOT, 'src/ui/captions.js'), 'utf8');
  const entries = inventoryText({
    path: 'src/ui/captions.js',
    source,
    kind: 'js',
    config: surfaces,
  });
  const messages = new Set(entries.map((entry) => entry.message));
  const wanted = localizableCaptionMessages();
  assert.ok(wanted.includes('Incoming telegraph'));
  assert.ok(wanted.includes('Repulsor deployed'));
  for (const text of Object.values(MASSLINE_CAPTIONS)) {
    assert.ok(wanted.includes(text), `massline caption missing from copy table: ${text}`);
  }
  for (const text of wanted) {
    assert.ok(messages.has(text), `extractor missed ${text}`);
    assert.equal(hasPlaceholderParity(text, text), true, text);
    assert.equal(hasPlaceholderParity(text, pseudoLocalize(text)), true, text);
  }
});
