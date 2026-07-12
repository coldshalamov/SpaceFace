import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const media = createMediaQuery(false);
globalThis.window = { matchMedia: () => media };

const { createGameState } = await import('../src/core/gameState.js');
const {
  ACCESSIBILITY_SETTINGS_SCHEMA,
  applyAccessibility,
} = await import('../src/ui/accessibility.js');

const state = createGameState(606);
const root = createRoot();

assert.equal(state.settings.accessibility.motionPreference, 'system');
assert.equal(state.settings.accessibility.captions, true);
assert.equal(state.settings.accessibility.captionSize, 'medium');
assert.equal(state.settings.accessibility.captionBackground, true);

let applied = applyAccessibility(state.settings, root);
assert.equal(applied.motionPreference, 'system');
assert.equal(applied.motionReduced, false);
assert.equal(state.settings.video.motionReduce, false);
assert.equal(root.classList.contains('sf-caption-size-medium'), true);
assert.equal(root.classList.contains('sf-caption-backing'), true);

media.setMatches(true);
assert.equal(state.settings.video.motionReduce, true, 'OS motion preference must reach existing runtime flag live');
assert.equal(root.classList.contains('sf-reduce-motion'), true);

state.settings.accessibility.motionPreference = 'full';
state.settings.accessibility.captions = false;
state.settings.accessibility.captionSize = 'large';
state.settings.accessibility.captionBackground = false;
applied = applyAccessibility(state.settings, root);
assert.equal(applied.motionReduced, false, 'explicit Full must override OS reduce');
assert.equal(state.settings.video.motionReduce, false);
assert.equal(root.classList.contains('sf-captions-off'), true);
assert.equal(root.classList.contains('sf-caption-size-large'), true);
assert.equal(root.classList.contains('sf-caption-backing'), false);

const schemaPaths = new Set(ACCESSIBILITY_SETTINGS_SCHEMA.map((row) => row.path));
for (const path of [
  'accessibility.motionPreference',
  'accessibility.captions',
  'accessibility.captionSize',
  'accessibility.captionBackground',
  'uiScale',
]) assert.equal(schemaPaths.has(path), true, `schema missing ${path}`);

const settingsSource = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
assert.match(settingsSource, /setAttribute\('role', 'tablist'\)/);
assert.match(settingsSource, /labelEl\.htmlFor = id/);
assert.match(settingsSource, /'Follow system'/);
assert.match(settingsSource, /'Gameplay captions'/);
assert.match(settingsSource, /'Solid caption backing'/);

const inputSource = readFileSync(new URL('../src/ui/input.js', import.meta.url), 'utf8');
assert.match(inputSource, /classList\.add\('sf-gamepad-focus'\)/);
assert.match(inputSource, /document\.addEventListener\('pointerdown', clearGamepadFocus, true\)/);
assert.match(inputSource, /active\.getAttribute\('role'\) === 'tab'/);

// The existing profile owner snapshots the full accessibility subtree. Prove the new preferences
// round-trip through that real path instead of trusting a settings screen label.
globalThis.localStorage = createStorage();
const { createBus } = await import('../src/core/eventBus.js');
const { save } = await import('../src/save/saveSystem.js');
const persistedState = createGameState(607);
const bus = createBus();
save.init({ state: persistedState, bus, helpers: {}, registry: { get: () => null } });
Object.assign(persistedState.settings.accessibility, {
  motionPreference: 'reduce', captions: false, captionSize: 'large', captionBackground: false,
});
bus.emit('settings:changed', { section: 'accessibility', key: 'captions', value: false });
const profile = JSON.parse(localStorage.getItem('sf.settings.profile.v1'));
assert.equal(profile.settings.accessibility.motionPreference, 'reduce');
assert.equal(profile.settings.accessibility.captions, false);
assert.equal(profile.settings.accessibility.captionSize, 'large');
assert.equal(profile.settings.accessibility.captionBackground, false);

console.log('Accessibility settings parity OK - system motion, captions, labels, scale and gamepad focus are wired.');

function createMediaQuery(initial) {
  let listener = null;
  return {
    matches: initial,
    addEventListener(type, fn) { if (type === 'change') listener = fn; },
    setMatches(value) { this.matches = !!value; if (listener) listener({ matches: this.matches }); },
  };
}

function createRoot() {
  const classes = new Set();
  return {
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      toggle(value, force) {
        if (force === undefined) force = !classes.has(value);
        if (force) classes.add(value); else classes.delete(value);
        return !!force;
      },
      contains(value) { return classes.has(value); },
    },
    style: { setProperty() {} },
  };
}

function createStorage() {
  const records = new Map();
  return {
    getItem(key) { return records.has(String(key)) ? records.get(String(key)) : null; },
    setItem(key, value) { records.set(String(key), String(value)); },
    removeItem(key) { records.delete(String(key)); },
  };
}
