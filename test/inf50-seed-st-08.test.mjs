// SEED-ST-08: the first cargo landing in an empty hold names the live manifest key once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { noteFirstCargoLanding } from '../src/ui/hud.js';
import { promptLabel, setPromptDevice } from '../src/ui/bindings.js';

const HUD_SRC = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');

test('seed 4242 names the manifest key once when cargo first fills an empty hold', () => {
  setPromptDevice('kbm');
  const state = createGameState(4242);
  assert.equal(state.meta.seed, 4242);
  const cargo = { items: { fuel_cell: 8 }, usedVolume: 8 };
  const label = promptLabel('cargo');
  const line = noteFirstCargoLanding(state, { wasEmpty: true, cargo, bindingLabel: label });
  assert.match(line, /Cargo aboard/);
  assert.match(line, /Manifest/);
  assert.ok(line.includes(label), 'the line uses the live manifest binding');
  assert.equal(state.player.hints.firstCargoManifest, true);
  assert.equal(state.ui.cargoPanelOpen, undefined, 'the panel stays closed');
  assert.equal(noteFirstCargoLanding(state, { wasEmpty: true, cargo, bindingLabel: label }), '');
});

test('later adds, a hold that was already full, and hints off stay silent', () => {
  setPromptDevice('kbm');
  const label = promptLabel('cargo');
  const cargo = { items: { ore: 1 }, usedVolume: 1 };
  const already = createGameState(4242);
  assert.equal(noteFirstCargoLanding(already, { wasEmpty: false, cargo, bindingLabel: label }), '');
  assert.notEqual(already.player.hints.firstCargoManifest, true);

  const emptyAdd = createGameState(4242);
  assert.equal(noteFirstCargoLanding(emptyAdd, {
    wasEmpty: true,
    cargo: { items: { ore: 0 }, usedVolume: 0 },
    bindingLabel: label,
  }), '');
  assert.notEqual(emptyAdd.player.hints.firstCargoManifest, true);

  const quiet = createGameState(4242);
  quiet.settings.gameplay.tutorialHints = false;
  assert.equal(noteFirstCargoLanding(quiet, { wasEmpty: true, cargo, bindingLabel: label }), '');
  assert.notEqual(quiet.player.hints.firstCargoManifest, true);

  const handler = HUD_SRC.slice(HUD_SRC.indexOf("on('cargo:changed'"), HUD_SRC.indexOf("on('ui:toggleCargo'"));
  assert.match(handler, /noteFirstCargoLanding/);
  assert.match(handler, /promptLabel\('cargo'\)/);
  assert.doesNotMatch(handler, /toggleCargoPanel|cargoPanelOpen = true/);
});
