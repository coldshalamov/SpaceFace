import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// INST-06 — the boot screen does not write to instruments that are not in the page.
// Every [data-loading-*] selector queried by loadingTerminalArt must resolve to an element
// present in index.html; the four retired instruments stay gone.

const ART = readFileSync(
  fileURLToPath(new URL('../src/ui/loadingTerminalArt.js', import.meta.url)),
  'utf8',
);
const INDEX = readFileSync(
  fileURLToPath(new URL('../index.html', import.meta.url)),
  'utf8',
);

test('INST-06 the retired boot instruments are never queried', () => {
  for (const dead of [
    'data-loading-diag-stream',
    'data-loading-hex',
    'data-loading-subsystems',
    'data-loading-segments',
    'data-loading-stage-name',
  ]) {
    assert.equal(ART.includes(dead), false, `${dead} must not be queried`);
  }
});

test('INST-06 every queried data-loading selector exists in index.html', () => {
  const queried = new Set(
    [...ART.matchAll(/data-loading-([a-z-]+)/g)].map((m) => `data-loading-${m[1]}`),
  );
  assert.ok(queried.size > 0, 'expected at least one live instrument query');
  for (const selector of queried) {
    assert.ok(INDEX.includes(selector), `${selector} is queried but missing from index.html`);
  }
});
