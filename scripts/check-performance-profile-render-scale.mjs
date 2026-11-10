import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import {
  buildRenderScaleApplyExpression,
  buildRenderScaleRestoreExpression,
  parseRenderScaleRequest,
} from './lib/perf-render-scale.mjs';

assert.equal(parseRenderScaleRequest(undefined), null, 'omitted render scale preserves runtime defaults');
assert.equal(parseRenderScaleRequest('1'), 1, 'render scale 1 parses exactly');
assert.equal(parseRenderScaleRequest('0.5'), 0.5, 'renderer minimum scale is accepted');
assert.equal(parseRenderScaleRequest('2'), 2, 'renderer maximum scale is accepted');
for (const invalid of [true, '', 'nope', '0.49', '2.01', Infinity]) {
  assert.throws(() => parseRenderScaleRequest(invalid), /render-scale/i,
    `invalid render scale ${String(invalid)} is rejected`);
}

const previousLocalStorage = globalThis.localStorage;
globalThis.localStorage = makeStorage();
const state = createGameState(47);
const bus = createBus();
save.init({ state, bus, helpers: {}, registry: { get: () => null } });
state.settings.video.renderScale = 0.85;
bus.emit('settings:changed', { section: 'video', key: 'renderScale', value: 0.85 });
const profileBeforeProbe = localStorage.getItem('sf.settings.profile.v1');
const resizeEvents = [];
const runtime = {
  SF: {
    state,
    bus,
  },
  Event: class Event { constructor(type) { this.type = type; } },
  dispatchEvent: (event) => resizeEvents.push(event.type),
};
const expression = buildRenderScaleApplyExpression(1);
const applied = Function('window', `return ${expression};`)(runtime);
assert.deepEqual(applied, {
  requested: 1,
  applied: 1,
  previous: 0.85,
  changed: true,
  profileSettingsRaw: profileBeforeProbe,
},
  'runtime application reports requested and applied scale');
assert.equal(runtime.SF.state.settings.video.renderScale, 1,
  'runtime application mutates video.renderScale before capture');
assert.deepEqual(resizeEvents, ['resize'], 'runtime application explicitly refreshes renderer sizing');
assert.equal(localStorage.getItem('sf.settings.profile.v1'), profileBeforeProbe,
  'real save listener does not persist the runtime probe override');

const restoreExpression = buildRenderScaleRestoreExpression(applied);
const restored = Function('window', `return ${restoreExpression};`)(runtime);
assert.deepEqual(restored, { restored: 0.85, profileRestored: true },
  'probe restoration reports the original runtime and profile state');
assert.equal(runtime.SF.state.settings.video.renderScale, 0.85,
  'probe restores the prior runtime render scale');
assert.equal(localStorage.getItem('sf.settings.profile.v1'), profileBeforeProbe,
  'real save-listener profile remains byte-identical after the probe');
assert.deepEqual(resizeEvents, ['resize', 'resize'], 'restoration explicitly refreshes renderer sizing');

const probeSource = readFileSync(new URL('./probe-performance-profile.mjs', import.meta.url), 'utf8');
assert.match(probeSource, /buildRenderScaleRestoreExpression/,
  'performance probe imports the runtime override restoration seam');
assert.match(probeSource, /finally\s*\{[\s\S]*restoreRequestedRenderScale/,
  'performance probe restores the runtime override even when capture fails');
assert.match(probeSource, /renderScale\.restored/,
  'performance report records the restored runtime value');

if (previousLocalStorage === undefined) delete globalThis.localStorage;
else globalThis.localStorage = previousLocalStorage;

console.log('Performance profile render-scale checks OK');

function makeStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(String(key)) ? map.get(String(key)) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
  };
}
