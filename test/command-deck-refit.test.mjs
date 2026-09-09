import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  SURFACE_NAMES, normalizeDescriptor, classifySurfaceTokens, getControlIntent,
  formatRangeValue, readControlState, mountCommandDeckRefit,
} from '../src/ui/commandDeckRefit.js';
import {
  SCREEN_ID_TO_SURFACE, STATION_OPERATION_TO_SURFACE, sourceSurfaceHooks,
} from '../src/ui/commandDeckRefitHooks.js';

const root = new URL('../', import.meta.url);

test('semantic screen names match actual identifier conventions', () => {
  const examples = {
    titleScreen: 'title', mainMenu: 'title', front_menu: 'title',
    newGamePanel: 'new-game', gameOverScreen: 'game-over', pauseMenu: 'pause',
    stationHub: 'station', marketPanel: 'market', commodityExchange: 'market',
    shipworksPanel: 'shipworks', shipFitting: 'shipworks', contracts: 'contracts',
    stationBar: 'contacts', industryPanel: 'industry', factions: 'factions',
    ledger: 'ledger', settingsPanel: 'settings', saveLoadScreen: 'saves',
    missionLog: 'missions', galaxyMap: 'galaxy-map', localMap: 'local-map',
    navigationInspector: 'navigation', research: 'research', fleetManagement: 'automation',
    miningPanel: 'mining', Crucible: 'crucible', firingRange: 'range',
    codex: 'codex', helpPanel: 'help', confirmDialog: 'confirmation', gameHUD: 'flight',
  };
  for (const [input, expected] of Object.entries(examples)) assert.equal(classifySurfaceTokens(input), expected, input);
});

test('screen classifier does not promote transient messages or arbitrary components', () => {
  for (const input of ['market-tooltip', 'pause notification', 'research toast', 'debug console', 'tiny button', '', null]) {
    assert.equal(classifySurfaceTokens(input), null, String(input));
  }
});

test('normalization handles case, delimiters and absent descriptors', () => {
  assert.equal(normalizeDescriptor('  mainMenu / flight_hud-root  '), 'main menu flight hud root');
  assert.equal(normalizeDescriptor(null), '');
});

test('action treatment never makes destructive actions primary', () => {
  for (const label of ['Delete save', 'Abandon contract', 'Self-destruct', 'Erase slot', 'Reset all settings']) assert.equal(getControlIntent(label), 'danger');
  for (const label of ['Buy 10', 'Sell', 'Fit module', 'Set waypoint', 'Resume']) assert.equal(getControlIntent(label), 'primary');
  for (const label of ['Back', 'Cancel', 'Close']) assert.equal(getControlIntent(label), 'quiet');
  assert.equal(getControlIntent('Delete-resistant hull'), 'danger');
  assert.equal(getControlIntent('Inventory'), 'normal');
});

test('range readouts preserve actual step precision and do not invent units', () => {
  assert.equal(formatRangeValue('0.5', '0.01'), '0.50');
  assert.equal(formatRangeValue('25', '1', '%'), '25%');
  assert.equal(formatRangeValue('0.000012', '1e-6'), '0.000012');
  assert.equal(formatRangeValue('1.234567', 'any'), '1.235');
  assert.equal(formatRangeValue('not a number'), 'not a number');
  assert.equal(formatRangeValue('10.000', '1'), '10');
});

function control(attributes = {}, disabled = false) {
  return { disabled, getAttribute(name) { return attributes[name] ?? null; } };
}

test('busy state is real state; becoming idle is not evidence of a successful transaction', () => {
  assert.equal(readControlState(control({ 'aria-busy': 'true' })), 'pending');
  assert.equal(readControlState(control({ 'aria-busy': 'true' }, true)), 'pending');
  assert.equal(readControlState(control()), 'idle');
  assert.equal(readControlState(control({ 'aria-selected': 'true' })), 'selected');
  assert.equal(readControlState(control({ 'aria-pressed': 'true' })), 'selected');
  assert.equal(readControlState(control({ 'aria-disabled': 'true' })), 'disabled');
  assert.equal(readControlState(control({}, true)), 'disabled');
});

test('module is importable without a browser and refuses to invent a DOM', () => {
  assert.equal(mountCommandDeckRefit({ document: null }), null);
});

test('every named screen family has a scoped presentation rule', async () => {
  const css = await readFile(new URL('styles/command-deck-refit.css', root), 'utf8');
  for (const kind of SURFACE_NAMES) assert.ok(css.includes(`[data-sf-surface='${kind}']`), kind);
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(css.includes('forced-colors: active'));
  assert.ok(css.includes('min-aspect-ratio: 21/9'));
  assert.ok(css.includes('max-width: 1280px'));
  assert.ok(css.includes(':focus-visible'));
  assert.ok(!/backdrop-filter:\s*blur/.test(css));
});

test('all local CSS artwork dependencies are present and no external fonts are introduced', async () => {
  const css = await readFile(new URL('styles/command-deck-refit.css', root), 'utf8');
  for (const [, relative] of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) {
    assert.ok(!/^https?:/.test(relative), relative);
    await access(fileURLToPath(new URL(relative, new URL('styles/command-deck-refit.css', root))));
  }
  assert.ok(!css.includes('@font-face'));
});

test('instrument symbols have unique IDs and every visible action has authored art', async () => {
  const svg = await readFile(new URL('assets/ui/command-deck-refit/instruments.svg', root), 'utf8');
  const ids = [...svg.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const id of ['ship', 'station', 'exchange', 'fitting', 'contract', 'navigation', 'research', 'mining', 'crucible', 'buy', 'sell', 'strip', 'target', 'save', 'back']) assert.ok(ids.includes(id), id);
});

test('the enhancement owns no game-state write, animation loop or text-content observer', async () => {
  const source = await readFile(new URL('src/ui/commandDeckRefit.js', root), 'utf8');
  assert.ok(!source.includes('requestAnimationFrame('));
  assert.ok(!source.includes('characterData: true'));
  assert.ok(!source.includes('localStorage.setItem'));
  assert.ok(!source.includes('getGamepads('));
  assert.ok(!source.includes('innerHTML ='));
  assert.ok(source.includes('MAX_NEW_CONTROLS_PER_SCAN'));
  assert.ok(source.includes('signal: abort.signal'));
  assert.ok(source.includes('observer?.disconnect()'));
});

test('transient warnings are not persisted as presentation-owned danger state', async () => {
  const source = await readFile(new URL('src/ui/commandDeckRefit.js', root), 'utf8');
  assert.ok(!source.includes("setAttribute(warning, 'data-sf-part', 'warning')"));
});

test('live SpaceFace screen ids and station destinations map onto surfaces', () => {
  assert.equal(SCREEN_ID_TO_SURFACE.mainMenu, 'title');
  assert.equal(SCREEN_ID_TO_SURFACE.newGame, 'new-game');
  assert.equal(SCREEN_ID_TO_SURFACE.saveLoad, 'saves');
  assert.equal(SCREEN_ID_TO_SURFACE.techTree, 'research');
  assert.equal(SCREEN_ID_TO_SURFACE.drill, 'mining');
  assert.equal(SCREEN_ID_TO_SURFACE.galaxyMap, 'galaxy-map');
  assert.equal(STATION_OPERATION_TO_SURFACE.bar, 'contacts');
  assert.equal(STATION_OPERATION_TO_SURFACE.market, 'market');
  assert.ok(sourceSurfaceHooks.some((hook) => hook.kind === 'title' && hook.selector.includes('mainMenu')));
  assert.ok(sourceSurfaceHooks.some((hook) => hook.kind === 'contacts' && hook.selector.includes('data-view="contacts"')));
});

test('kit world canvases are not covered by generated surface artwork', async () => {
  const source = await readFile(new URL('src/ui/commandDeckRefit.js', root), 'utf8');
  assert.ok(source.includes("root.querySelector('.k-world')"));
  assert.ok(source.includes("root.classList.contains('k-screen')"));
});
