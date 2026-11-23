// LOADING-02 (design/overhaul/08_INTERFACE.md section 3, ledger A6): a launch (Swarm, New Game,
// Continue) covers its load with a real picture of the place it is going, its name, one progress line
// and one controls card. The boot film's wireframe sweep belongs to the cold boot only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { LOADING_SCENE_ART, LOADING_SCENE_LINE, LOADING_CONTROLS, swarmSceneLine } from '../src/ui/loadingPresenter.js';

const ROOT = new URL('../', import.meta.url);
const SRC = readFileSync(new URL('src/ui/loadingPresenter.js', ROOT), 'utf8');
const CSS = readFileSync(new URL('styles/intro.css', ROOT), 'utf8');

test('every launch picture is a file that ships', () => {
  for (const [scene, rel] of Object.entries(LOADING_SCENE_ART)) {
    assert.ok(existsSync(new URL(rel, ROOT)), `${scene} picture ${rel} exists`);
  }
});

test('the controls card is one short card in plain words', () => {
  assert.ok(LOADING_CONTROLS.length >= 4 && LOADING_CONTROLS.length <= 6);
  for (const [keys, verb] of LOADING_CONTROLS) {
    assert.ok(keys && verb);
    assert.ok(verb.split(/\s+/).length <= 8, `"${verb}" is eight words or fewer`);
  }
  for (const line of Object.values(LOADING_SCENE_LINE)) assert.doesNotMatch(line, /Crucible|AFTERMATH/i);
});

test('the controls card ships the taught set: the Line row carries its key beside the RMB seat', () => {
  // The opening and Help teach the Line as F (FLIGHT_CORE_KEYS); the loading card must never
  // regress to teaching the rope as RMB-only.
  const line = LOADING_CONTROLS.find(([, verb]) => /^Line/.test(verb));
  assert.ok(line, 'the card still has its Line row');
  assert.match(line[0], /^F \/ RMB$/, 'the shipped Line row prints the taught key and the mouse seat');
});

test('a Swarm launch names the room it is entering; a Gauntlet names itself', () => {
  // Fields exactly as the real launch writes them (gameNewOptionsForSandboxConfig →
  // crucibleSetup.survivalRuleset / crucibleSetup.survivalSetup.arenaId, the same payload the
  // bench's loading-swarm shot emits).
  assert.equal(swarmSceneLine('swarm', 'helios_core'), 'Round 1 · Madame Kiln’s Foundry',
    'the default room keeps its authored fiction name');
  assert.equal(swarmSceneLine('swarm', 'lagrange_crucible'), 'Round 1 · Lagrange Arena',
    'a picked room says its own display name, not the Foundry');
  assert.equal(swarmSceneLine('swarm', 'cinder_sluice'), 'Round 1 · Cinder Sluice');
  assert.equal(swarmSceneLine('swarm', undefined), 'Round 1 · Madame Kiln’s Foundry',
    'a launch that names no room falls back to the Foundry pair with the picture');
  assert.equal(swarmSceneLine('scored', 'lagrange_crucible'), 'Gauntlet',
    'a scored launch says its own name — it is not a Foundry round');
  assert.equal(swarmSceneLine('scored', 'helios_core'), 'Gauntlet');
  for (const id of ['helios_core', 'lagrange_crucible', 'cinder_sluice', 'cryo_drift', 'storm_lattice']) {
    assert.doesNotMatch(swarmSceneLine('swarm', id), /Crucible/i, `${id} line stays player-facing`);
  }
});

test('a launch with a place never starts the boot film; the film, ring and clock stand down under it', () => {
  assert.match(SRC, /if \(placeShown\) \{\n\s*\/\/ The film stays paused under a place/);
  assert.match(CSS, /\[data-loading-scene\] :is\(\.boot-video, \.boot-canvas, \.boot-meta, \.boot-instrument, \.boot-wordmark, \.boot-scrim\) \{ display:none !important; \}/);
  // A Continue before its sector is named reads as the verb the player pressed.
  assert.match(SRC, /const RESTORE_DESTINATION = 'Continue';/);
});
