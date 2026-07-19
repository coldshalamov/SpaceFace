import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/probe-authored-assets-live.mjs', import.meta.url), 'utf8');
const electronSource = readFileSync(new URL('../scripts/check-electron-new-game-launch.mjs', import.meta.url), 'utf8');

test('live asset proof respects spatial streaming while forbidding visible substitutes', () => {
  assert.doesNotMatch(source, /requestAuthoredUpgrade/,
    'normal-route proof must not defeat the production residency policy by demanding every offscreen body');
  assert.match(source, /report\.ships\.filter\(\(ship\) => ship\.presented && ship\.state !== 'authored'/,
    'every presented ship remains required to use its authored identity');
  assert.match(source, /!ship\.presented && ship\.state !== 'awaiting-authored-admission'/,
    'offscreen boundaries must wait invisibly instead of publishing procedural boxes');
  assert.match(source, /maxConcurrentDecode <= 1/,
    'production decode admission remains serial and bounded');
});

test('Electron normal route proves authored release identities without an artificial drain', () => {
  assert.doesNotMatch(electronSource, /requestAuthoredUpgrade/,
    'Electron acceptance must exercise production demand rather than forcing distant assets resident');
  assert.match(electronSource, /ship\.authoredAssetState === 'authored'/);
  assert.match(electronSource, /ship\.authoredAssetMode === 'release'/);
  assert.match(electronSource, /report\.mode === 'flight'/,
    'the proof remains a real playable-route handoff, not an isolated asset viewer');
});
