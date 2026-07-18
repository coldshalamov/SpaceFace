import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/probe-authored-assets-live.mjs', import.meta.url), 'utf8');
const electronSource = readFileSync(new URL('../scripts/check-electron-new-game-launch.mjs', import.meta.url), 'utf8');

test('the exhaustive live-asset probe explicitly demands offscreen authored boundaries', () => {
  assert.match(source, /requestAuthoredUpgrade/,
    'rendering alone obeys runtime relevance and cannot prove offscreen asset loadability');
  assert.match(source, /AUTHORED_DRAIN_TIMEOUT_MS/,
    'the explicit serial drain needs its own bounded timeout instead of the opening-shot budget');
  assert.match(source, /snapshot\.authoredShipCount === snapshot\.shipCount/,
    'the exhaustive probe must retain its all-live-ships-authored acceptance bar');
  assert.match(source, /maxConcurrentDecode <= 3/,
    'the live probe must permit the bounded three-lane decoder without accepting unbounded admission');
});

test('the Electron exhaustive route check explicitly drains demand-scoped authored boundaries', () => {
  assert.match(electronSource, /requestAuthoredUpgrade/,
    'the Electron route check must explicitly demand ships that are intentionally offscreen');
  assert.match(electronSource, /AUTHORED_DRAIN_TIMEOUT_MS/,
    'the exhaustive Electron drain needs a bounded timeout separate from flight startup');
  assert.match(electronSource, /waitForAllShipsAuthored/,
    'the Electron report must be collected only after the explicit authored drain');
});
