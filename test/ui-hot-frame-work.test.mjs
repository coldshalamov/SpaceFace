import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { galaxyMapScreen } from '../src/ui/galaxyMap.js';
import { ATLAS_ART_URL } from '../src/ui/map/atlasRelief.js';
import { rangeScreen } from '../src/ui/screens/range.js';

test('chart relief keeps one surface, repaints changed inputs, and releases resources on remount', t => {
  const images = [];
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
    constructor() { images.push(this); }
  } });
  t.after(() => {
    if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage);
    else delete globalThis.Image;
  });
  const uniforms = new Map(), viewports = [], draws = [], freed = [], handlers = new Map();
  const gl = {
    TRIANGLES: 4, createShader: () => ({}), shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, deleteShader() {}, createProgram: () => ({ kind: 'program' }),
    attachShader() {}, linkProgram() {}, getProgramParameter: () => true, useProgram() {},
    createTexture: () => ({ kind: 'texture' }), activeTexture() {}, bindTexture() {},
    texImage2D() {}, texParameteri() {}, generateMipmap() {},
    deleteTexture: texture => freed.push(texture.kind), deleteProgram: program => freed.push(program.kind),
    getUniformLocation: (_program, name) => name,
    uniform2f: (name, ...args) => uniforms.set(name, args),
    uniform1i: (name, value) => uniforms.set(name, value),
    uniform1f: (name, value) => uniforms.set(name, value),
    uniform4fv: (name, data) => uniforms.set(name, Array.from(data.slice(0, 4))),
    viewport: (...args) => viewports.push(args), drawArrays: (...args) => draws.push(args),
  };
  let contextReads = 0, wakes = 0;
  const canvas = { width: 0, height: 0, hidden: true,
    getContext(type) { assert.equal(type, 'webgl2'); contextReads++; return gl; },
    addEventListener: (type, listener) => handlers.set(type, listener),
    removeEventListener: (type, listener) => { assert.equal(handlers.get(type), listener); handlers.delete(type); },
  };
  const screen = Object.create(galaxyMapScreen);
  screen._atlasCanvas = canvas;
  screen._wake = () => { wakes++; };
  const paint = (originX = 120, featureKind = 2) => screen._paintAtlas(400, 200, originX, 80, 320,
    [[180, 100, 22, featureKind]]);
  assert.equal(paint(), true);
  assert.equal(canvas.hidden, false);
  assert.deepEqual(viewports.at(-1), [0, 0, 400, 200]);
  assert.deepEqual(uniforms.get('uOrigin'), [120, 80]);
  assert.deepEqual(uniforms.get('uFeature[0]'), [180, 100, 22, 2]);
  assert.equal(images[0].src, ATLAS_ART_URL);
  assert.match(images[1].src, /\/atlas-engravings\.webp$/);
  assert.deepEqual(draws, [[gl.TRIANGLES, 0, 3]]);
  assert.equal(paint(), true);
  assert.equal(draws.length, 1, 'a settled view with equivalent feature values does not redraw');
  paint(121);
  assert.deepEqual(uniforms.get('uOrigin'), [121, 80]);
  paint(121, 4);
  assert.equal(draws.length, 3, 'pan and authored feature changes appear on the same paint');
  assert.deepEqual(uniforms.get('uFeature[0]'), [180, 100, 22, 4]);
  images[1].onload();
  assert.equal(wakes, 1);
  paint(121, 4);
  assert.equal(uniforms.get('uHasEngraving'), 1);
  assert.equal(draws.length, 4, 'new engraving art invalidates an otherwise identical view');
  screen._paintAtlas(2000, 1100, 121, 80, 320);
  assert.deepEqual(viewports.at(-1), [0, 0, 1440, 792]);
  assert.equal(contextReads, 1, 'pan, features, asset arrival and resize reuse the one surface');
  screen.mount(null, {});
  assert.deepEqual(freed, ['texture', 'texture', 'program']);
  assert.equal(handlers.size, 0);
  assert.ok(images.every(image => image.onload === null));
  assert.equal(screen._atlas, undefined);
});

test('the local chart still draws a navigable course when relief WebGL is unavailable', () => {
  const state = createGameState(4242);
  state.world.currentSectorId = 'sector_helios_prime';
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList = [player];
  state.nav.waypoint = { kind: 'local', label: 'Player course', pos: { x: 150, z: 55 } };
  const text = [], gradient = { addColorStop() {} };
  const context = new Proxy({ globalAlpha: 1, measureText: value => ({ width: String(value).length * 7 }),
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    fillText: value => text.push(String(value)), strokeText() {} },
  { get: (target, key) => key in target ? target[key] : () => {} });
  let contextReads = 0;
  const canvas = { hidden: true, getContext() { contextReads++; return null; } };
  const screen = Object.create(galaxyMapScreen);
  Object.assign(screen, { _ctx: { state }, _atlasCanvas: canvas, _canvas: { setAttribute() {} },
    _clickTargets: [], _scanRings: [], _previewPts: [], _reduceMotion: true,
    _layers: { route: true }, _cams: { local: { cx: 0, cy: 0, zoom: 1 } },
    _clearField: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
    _placeLabels: candidates => candidates.map(candidate => ({ ...candidate, visible: true })),
  });
  screen._drawLocal(context, state, 1000, 800);
  assert.equal(canvas.hidden, true);
  assert.equal(screen._atlas, null);
  assert.ok(text.some(value => value.includes('GOAL · PLAYER COURSE')));
  const goal = screen._clickTargets.find(target => target.id === 'active-waypoint');
  assert.deepEqual({ x: goal?.x, z: goal?.z }, state.nav.waypoint.pos);
  assert.equal(screen._paintAtlas(1000, 800, 0, 0, 400), false);
  assert.equal(contextReads, 1, 'an unavailable context does not trigger an allocation attempt on every paint');
});

function node(attributes = {}) {
  const attrs = new Map(Object.entries(attributes));
  return { dataset: {}, writes: 0, textContent: '', hidden: true,
    getAttribute(key) { return attrs.get(key) ?? null; },
    setAttribute(key, value) { this.writes += 1; attrs.set(key, value); },
    removeAttribute(key) { this.writes += 1; attrs.delete(key); },
    classList: { toggle() {} }, querySelector() { return null; } };
}

test('Range unchanged rail frames do not repin buttons but rung and cleared changes publish immediately', () => {
  const screen = Object.create(rangeScreen);
  const a = node({ 'data-rung-id': 'a' }), b = node({ 'data-rung-id': 'b' });
  const aCheck = node(), bCheck = node();
  a.parentElement = { querySelector: () => aCheck };
  b.parentElement = { querySelector: () => bCheck };
  let repins = 0;
  a._fhSync = b._fhSync = () => { repins += 1; };
  screen._sim = { id: 'a' };
  screen._cleared = new Set(); screen._flown = new Set(['a']);
  screen._keepRungInView = () => {};
  screen._els = { rail: {}, rungButtons: [a, b], railRows: [] };
  screen._syncRail();
  const initialWrites = a.writes + b.writes;
  screen._syncRail();
  assert.equal(repins, 2);
  assert.equal(a.writes + b.writes, initialWrites);
  screen._sim.id = 'b'; screen._flown.add('b'); screen._cleared.add('a');
  screen._syncRail();
  assert.equal(repins, 4);
  assert.equal(a.getAttribute('aria-current'), null);
  assert.equal(b.getAttribute('aria-current'), 'true');
  assert.equal(aCheck.hidden, false);
  assert.equal(bCheck.hidden, true);
});

test('Range inactive energy beam does not force layout or repeat SVG writes', () => {
  const screen = Object.create(rangeScreen);
  let reads = 0, paths = 0, active = 0;
  screen._els = { canvas: { getBoundingClientRect() { reads += 1; return { width: 640, height: 360 }; } } };
  screen._beamFx = { setPath() { paths += 1; }, setActive() { active += 1; }, resize() {} };
  screen._sim = { id: 'heavy_turns_wide' };
  screen._syncBeam(); screen._syncBeam();
  assert.equal(reads, 0);
  assert.equal(paths, 1);
  assert.equal(active, 1);
  screen._sim = { id: 'you_can_run_dry', energy: { capRegen: 4, continuousDrain: 2, capMax: 20 } };
  screen._syncBeam(); screen._syncBeam();
  assert.equal(paths, 2, 'unchanged energy geometry is not republished');
  screen._sim.energy.continuousDrain = 8;
  screen._syncBeam();
  assert.equal(paths, 3, 'changed flow direction is published immediately');
});
