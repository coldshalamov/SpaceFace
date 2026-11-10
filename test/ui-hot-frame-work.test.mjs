import assert from 'node:assert/strict';
import test from 'node:test';
import { galaxyMapScreen } from '../src/ui/galaxyMap.js';
import { drawSensorLattice } from '../src/ui/orrery/chartInstruments.js';
import { rangeScreen } from '../src/ui/screens/range.js';

function latticeContext() {
  const commands = [];
  return { commands, save() {}, restore() {}, clearRect() { commands.length = 0; },
    setTransform(...args) { this.transform = args; },
    set fillStyle(value) { this.color = value; },
    fillRect(...args) { commands.push([this.color, ...args]); } };
}

test('chart retains one exact-resolution lattice until its visual inputs change and releases it', () => {
  const context = latticeContext();
  const retained = { width: 0, height: 0, getContext: () => context };
  let allocations = 0;
  const screen = Object.create(galaxyMapScreen);
  screen._canvas = { width: 800, height: 400, ownerDocument: {
    createElement: () => { allocations += 1; return retained; },
  } };
  screen._dpr = 2;
  screen._pointer = { x: 120, y: 80 };
  const copies = [];
  const output = { drawImage(...args) { copies.push(args); } };
  screen._drawSensorLattice(output, 400, 200, 0.055);
  const direct = latticeContext();
  drawSensorLattice(direct, 400, 200, { pointer: screen._pointer, a: 0.055 });
  assert.deepEqual(context.commands, direct.commands, 'every point, alpha and pointer lens is preserved');
  assert.deepEqual(context.transform, [2, 0, 0, 2, 0, 0]);
  assert.equal(retained.width, 800);
  assert.equal(retained.height, 400);
  const firstCommands = context.commands.slice();
  context.fillRect = () => { throw new Error('unchanged lattice must not redraw'); };
  screen._drawSensorLattice(output, 400, 200, 0.055);
  assert.deepEqual(copies[1], [retained, 0, 0, 400, 200]);
  context.fillRect = (...args) => context.commands.push([context.color, ...args]);
  screen._pointer.x += 1;
  screen._drawSensorLattice(output, 400, 200, 0.055);
  assert.notDeepEqual(context.commands, firstCommands, 'pointer lens changes immediately');
  screen._drawSensorLattice(output, 400, 200, 0.11);
  assert.equal(allocations, 1, 'scale alpha changes reuse the single owned surface');
  screen._dpr = 1;
  screen._canvas.width = 400;
  screen._canvas.height = 200;
  screen._drawSensorLattice(output, 400, 200, 0.11);
  assert.deepEqual(context.transform, [1, 0, 0, 1, 0, 0]);
  screen._releaseSensorLattice();
  assert.equal(retained.width, 0);
  assert.equal(retained.height, 0);
  assert.equal(screen._sensorLatticeCache, null);
});

test('chart lattice falls back to the original point drawing when no 2D cache is available', () => {
  const screen = Object.create(galaxyMapScreen);
  screen._canvas = { ownerDocument: { createElement: () => ({ getContext: () => null }) } };
  screen._pointer = null;
  const output = latticeContext();
  output.drawImage = () => { throw new Error('unavailable cache must not be copied'); };
  screen._drawSensorLattice(output, 100, 80, 0.055);
  const direct = latticeContext();
  drawSensorLattice(direct, 100, 80, { pointer: null, a: 0.055 });
  assert.deepEqual(output.commands, direct.commands);
  assert.equal(screen._sensorLatticeCache.canvas, null);
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
