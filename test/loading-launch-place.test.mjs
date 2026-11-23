// LOADING-02 (design/overhaul/08_INTERFACE.md section 3, ledger A6): a launch (Swarm, New Game,
// Continue) covers its load with a real picture of the place it is going, its name, one progress line
// and one controls card. The boot film's wireframe sweep belongs to the cold boot only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { LOADING_SCENE_ART, LOADING_SCENE_LINE, LOADING_CONTROLS } from '../src/ui/loadingPresenter.js';

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

test('a launch with a place never starts the boot film; the film, ring and clock stand down under it', () => {
  assert.match(SRC, /if \(placeShown\) \{\n\s*\/\/ The film stays paused under a place/);
  assert.match(CSS, /\[data-loading-scene\] :is\(\.boot-video, \.boot-canvas, \.boot-meta, \.boot-instrument, \.boot-wordmark, \.boot-scrim\) \{ display:none !important; \}/);
  // A Continue before its sector is named reads as the verb the player pressed.
  assert.match(SRC, /const RESTORE_DESTINATION = 'Continue';/);
});
