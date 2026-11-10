import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_FILES = [
  'src/data/bandRadio.js',
  'src/systems/bandRadio.js',
  'src/audio/bandBeds.js',
  'src/ui/bandHud.js',
  'scripts/check-depth-program-a1.mjs',
];

test('A1 additive Band lane owns the promised integration-ready files', () => {
  for (const relativePath of REQUIRED_FILES) {
    assert.equal(existsSync(join(ROOT, relativePath)), true, `${relativePath} must exist`);
  }
});
