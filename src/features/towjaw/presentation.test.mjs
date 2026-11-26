// Headless production-port contracts only. These are not GPU/player acceptance.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../../core/eventBus.js';
import { attackGeometry, mechanismPosition, pointInAttack, slotPosition } from './geometry.js';
import {
  buildTowjawPresentationFrame, createTowjawOverlay, createTowjawPresentation,
  mountTowjawPresentation, towjawPresentationPolicy, towjawShapeOutlines,
} from './presentation.js';

const clone = value => JSON.parse(JSON.stringify(value));
const countListeners = bus => [...bus._listeners.values()].reduce((sum, rows) => sum + rows.size, 0);
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}

function fixture(kind = 'grapple') {
  const boss = { id: 2, pos: { x: 1200, z: -600 }, rot: 0.4, radius: 24, alive: true };
  const mechanisms = Object.fromEntries(['jaw', 'winch', 'drive'].map((key, index) =>
    [key, { id: 3 + index, pos: mechanismPosition(boss, key), alive: true }]));
  const debris = [0, 1, 2].map(slot => ({ id: 20 + slot, pos: slotPosition(boss, slot), radius: 6, alive: true }));
  const geometry = attackGeometry(kind, boss, { pos: { x: 1300, z: -550 } });
  const attack = { ...geometry, kind, castId: 'presentation:1', startedAt: 8999.5,
    fireAt: 9001.5, endAt: 9004, activeTime: 0 };
  const world = { simTime: 9000, boss, mechanisms, debris };
  const view = { phase: 'commit', elapsed: 12, lastTime: 9000, attack,
    armor: debris.map((body, slot) => ({ id: body.id, slot, status: 'latched' })),
    mechanisms: Object.fromEntries(['jaw', 'winch', 'drive'].map(key => [key, { exposed: true, disabled: false }])),
    world };
  const state = { tick: 500, simTime: 9000, mode: 'flight', settings: {}, ui: {}, entities: new Map() };
  return { view, world, state, bus: createBus() };
}

function recordingCanvas() {
  const calls = [];
  const context = {};
  for (const key of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'stroke', 'clearRect', 'save', 'restore'])
    context[key] = (...args) => calls.push({ key, args });
  context.fill = (...args) => calls.push({ key: 'fill', args, alpha: context.globalAlpha });
  context.fillText = (...args) => calls.push({ key: 'fillText', args, font: context.font });
  context.setLineDash = dash => calls.push({ key: 'setLineDash', args: [[...dash]] });
  const canvas = { width: 1280, height: 720, style: {},
    getContext: kind => kind === '2d' ? context : null,
    setAttribute() {}, remove() { this.removed = true; } };
  return { canvas, context, calls };
}

test('TOWJAW presentation projects physical identities and absolute sim time without changing world state', () => {
  const h = fixture();
  h.world.mechanisms.jaw.pos.x += 7; // A real displaced body, not its nominal mount.
  h.world.debris[0].pos.z += 4;
  h.view.armor.push({ id: 999, slot: 3, status: 'latched' }); // Missing body cannot become a visual plate.
  const before = clone(h.view);
  freeze(h.view);
  const frame = buildTowjawPresentationFrame(h.view);
  assert.deepEqual(h.view, before);
  assert.equal(frame.clock, 9000);
  assert.equal(frame.attack.secondsUntil, 1.5, 'late-sector telegraph must not use encounter elapsed time');
  assert.equal(frame.armorCount, 3);
  assert.equal(frame.cables.length, 3);
  assert.equal(frame.cables.some(row => row.id === 999), false);
  assert.deepEqual(frame.cables[0].from, { ...h.world.mechanisms.jaw.pos, y: 0 });
  assert.deepEqual(frame.cables[0].to, { ...h.world.debris[0].pos, y: 0 });
  assert.notDeepEqual(frame.cables[0].from, frame.cables[0].mount, 'the real anchor is a mechanism, not an armor placeholder');
  assert.equal(frame.boss.id, 2);
  assert.equal(frame.origin.x, 1200);
});

test('TOWJAW warning contours use the shared collision footprint and preserve the annular safe hole', () => {
  const lane = { kind: 'lane', a: { x: 90, z: -150 }, b: { x: 255, z: -38 }, radius: 27 };
  const contours = towjawShapeOutlines(lane);
  assert.equal(contours.length, 1);
  for (const point of contours[0]) assert.equal(pointInAttack(lane, point, 0.001), true);
  assert.equal(pointInAttack(lane, { x: 90, z: -180 }, 0), false);
  const ring = { kind: 'arc', x: -210, z: 500, heading: 1.4, halfAngle: Math.PI, inner: 35, outer: 112 };
  assert.equal(towjawShapeOutlines(ring).length, 2, 'separate inner contour gives the even-odd fill a safe hole');
  assert.equal(pointInAttack(ring, { x: ring.x, z: ring.z }, 0), false);
  assert.equal(pointInAttack(ring, { x: ring.x + 75, z: ring.z }, 0), true);
  assert.deepEqual(towjawShapeOutlines({ kind: 'lane', a: { x: NaN, z: 0 }, b: lane.b, radius: 12 }), []);
  assert.deepEqual(towjawShapeOutlines({ ...ring, inner: 200 }), []);
});

test('TOWJAW vented armor keeps its real body but loses its released cable and latched count', () => {
  const h = fixture();
  const body = h.world.debris[0];
  h.view.armor[0].status = 'venting';
  const frame = buildTowjawPresentationFrame(h.view);
  assert.equal(frame.armorCount, 2);
  assert.equal(frame.cables.some(row => row.id === body.id), false);
  assert.strictEqual(h.world.debris[0], body);
  assert.equal(body.alive, true);
  const adapter = createTowjawPresentation({ state: h.state, bus: h.bus, getSnapshot: () => h.view });
  try {
    adapter.onEvents([{ type: 'armor-vented', entityId: body.id, mechanism: 'jaw', at: 9000 }], h.view);
    assert.equal(adapter.inspect().caption, 'CLAMPS OPEN — GAPS ARE FORMING');
  } finally { adapter.destroy(); }
});

test('TOWJAW accessibility retains exact warning geometry and non-color timing while suppressing optional bursts', () => {
  const h = fixture();
  h.world.simTime = 9002; h.view.attack.activeTime = 0.5;
  const normal = buildTowjawPresentationFrame(h.view);
  const settings = { video: { motionReduce: true }, accessibility: { flashReduce: true }, forcedColors: true };
  const reduced = buildTowjawPresentationFrame(h.view, h.world, settings);
  assert.deepEqual(reduced.attack.shapes, normal.attack.shapes, 'accessibility never shrinks the danger footprint');
  assert.deepEqual(reduced.caption, normal.caption);
  assert.equal(normal.attack.sweepOutlines.length > 0, true);
  assert.equal(reduced.attack.sweepOutlines, undefined, 'reduced motion keeps the static complete envelope');
  assert.deepEqual(towjawPresentationPolicy(settings), { motionReduced: true, flashReduced: true, forcedColors: true });
  const receipts = [];
  h.bus.on('audio:cue', value => receipts.push(['audio', value]));
  h.bus.on('presentation:vfxCue', value => receipts.push(['vfx', value]));
  h.state.settings = settings;
  const adapter = createTowjawPresentation({ state: h.state, bus: h.bus, getSnapshot: () => h.view });
  try {
    adapter.onEvents([{ type: 'armor-lost', at: 9002, entityId: 20 }], h.view);
    assert.ok(receipts.some(row => row[0] === 'audio'), 'optional flash reduction does not remove the sound tell');
    assert.equal(receipts.some(row => row[0] === 'vfx'), false);
  } finally { adapter.destroy(); }
});

test('TOWJAW overlay distinguishes commitment from active damage by dash and text, not color alone', () => {
  const h = fixture('ram'), record = recordingCanvas();
  const projected = { x: 0, y: 0 }; // Mirrors production's reused projection result.
  const project = p => { projected.x = p.x - 1000; projected.y = p.z + 800; return projected; };
  const overlay = createTowjawOverlay({ canvas: record.canvas, worldToScreen: project,
    getFrame: () => buildTowjawPresentationFrame(h.view) });
  try {
    overlay.draw();
    assert.ok(record.calls.some(row => row.key === 'setLineDash' && row.args[0].length > 0));
    assert.ok(record.calls.some(row => row.key === 'fillText' && row.args[0] === 'RAM 1.5'));
    assert.ok(record.calls.filter(row => row.key === 'fillText').every(row => row.font.includes('12px')));
    record.calls.length = 0;
    h.world.simTime = 9002;
    overlay.draw();
    assert.ok(record.calls.some(row => row.key === 'fillText' && row.args[0] === 'RAM'));
    assert.equal(record.calls.some(row => row.key === 'fillText' && /\d\.\d/.test(row.args[0])), false);
    assert.ok(record.calls.some(row => row.key === 'setLineDash' && row.args[0].length === 0));
    h.view.attack.kind = 'shotgun';
    h.view.attack.shapes = [0, 1, 2].map(index => ({ kind: 'lane',
      a: { x: 1200, z: -600 + index * 20 }, b: { x: 1400, z: -600 + index * 50 }, radius: 18 }));
    record.calls.length = 0;
    overlay.draw();
    assert.equal(record.calls.filter(row => row.key === 'fillText' && row.args[0] === 'SHOTGUN').length, 1,
      'three physical shot corridors share one readable attack label');
    assert.equal(record.calls.filter(row => row.key === 'fill').length, 3);
  } finally { overlay.destroy(); }
  assert.equal(overlay.inspect().disposed, true);
});

test('TOWJAW cancelled ram keeps its physical coast corridor and a braking tell until the controller releases it', () => {
  const h = fixture('ram'), record = recordingCanvas();
  const shapes = clone(h.view.attack.shapes);
  h.view.coast = { ...h.view.attack, cancelled: true };
  h.view.attack = null; h.view.phase = 'exposed'; h.world.simTime = 9002;
  const frame = buildTowjawPresentationFrame(h.view);
  assert.equal(frame.attack.coasting, true);
  assert.deepEqual(frame.attack.shapes.map(row => row.shape), shapes);
  assert.match(frame.caption, /HULL IS STILL COASTING/);
  h.view.coast.reason = 'braking';
  assert.match(buildTowjawPresentationFrame(h.view).caption, /^RAM SPENT/);
  const overlay = createTowjawOverlay({ canvas: record.canvas,
    worldToScreen: p => ({ x: p.x, y: p.z }), getFrame: () => frame });
  try {
    overlay.draw();
    assert.ok(record.calls.some(row => row.key === 'fillText' && row.args[0] === 'RAM BRAKING'));
    h.view.coast = null;
    assert.equal(buildTowjawPresentationFrame(h.view).attack, null);
  } finally { overlay.destroy(); }
});

test('TOWJAW rejects mirrored behind-camera projection without filling an invented closing edge', () => {
  const h = fixture('ram'), record = recordingCanvas();
  const frame = buildTowjawPresentationFrame(h.view);
  frame.cables = []; frame.mechanisms = [];
  const overlay = createTowjawOverlay({ canvas: record.canvas,
    worldToScreen: p => ({ x: p.x, y: p.z, behind: p.x > frame.attack.origin.x }),
    getFrame: () => frame });
  try {
    overlay.draw();
    assert.equal(record.calls.some(row => row.key === 'fill'), false,
      'a partially hidden contour must not become a filled chord across the screen');
    assert.equal(record.calls.some(row => row.key === 'closePath'), false);
    assert.ok(record.calls.some(row => row.key === 'lineTo'), 'visible outline segments remain readable');
  } finally { overlay.destroy(); }
});

test('TOWJAW critical cue ordering, dedupe and burst quotas use the production presentation bus', () => {
  const h = fixture(), audio = [], effects = [];
  h.bus.on('audio:cue', value => audio.push(value));
  h.bus.on('presentation:vfxCue', value => effects.push(value));
  const adapter = createTowjawPresentation({ state: h.state, bus: h.bus, getSnapshot: () => h.view });
  const events = Array.from({ length: 12 }, (_, index) => ({ type: 'armor-latched', at: 9000,
    entityId: 20 + index, pos: { x: 1200 + index, z: -600 } }));
  events.push({ type: 'telegraph-cancel', attack: 'grapple', reason: 'jaw-pinned', castId: 'presentation:1', at: 9000 });
  events.push({ type: 'mechanism-disabled', mechanism: 'drive', at: 9000 });
  try {
    adapter.onEvents(events, h.view);
    assert.equal(audio.length, 2);
    assert.equal(audio[0].id, 'sfx_subsystem_drive_disabled', 'critical mechanism loss wins before plate flavor');
    assert.ok(effects.length > 0 && effects.length <= 3);
    assert.ok(effects.every(row => row.kind === 'vfx.arcade_structural'), 'existing structural admission owns the geometry pool');
    const counts = [audio.length, effects.length];
    adapter.onEvents(clone(events), h.view);
    assert.deepEqual([audio.length, effects.length], counts, 'duplicate update cannot replay sounds or structure');
    assert.equal(adapter.inspect().caption, 'DRIVE DISABLED — RAM OFFLINE');
  } finally { adapter.destroy(); }
});

test('TOWJAW event captions expire on sim time, recover to phase text and clear outside flight', () => {
  const h = fixture(), captions = [];
  const adapter = createTowjawPresentation({ state: h.state, bus: h.bus, getSnapshot: () => h.view,
    onCaption: text => captions.push(text) });
  try {
    adapter.onEvents([{ type: 'armor-lost', entityId: 20, at: 9000 }], h.view);
    adapter.draw();
    assert.equal(adapter.inspect().caption, 'ARMOR STRIPPED — THE GAP IS REAL');
    h.world.simTime = 9000.5; h.state.tick++;
    adapter.draw();
    assert.equal(adapter.inspect().caption, 'ARMOR STRIPPED — THE GAP IS REAL');
    h.world.simTime = 9002; h.state.tick++; h.view.attack = null; h.view.phase = 'recover';
    adapter.draw();
    assert.match(adapter.inspect().caption, /^RECOVERING/);
    h.state.mode = 'menu'; adapter.draw();
    assert.equal(adapter.inspect().caption, '');
    h.state.mode = 'flight'; adapter.draw();
    assert.match(adapter.inspect().caption, /^RECOVERING/);
    adapter.draw({ visible: false });
    assert.equal(adapter.inspect().caption, '', 'the shared HUD modal gate hides the warning caption');
    adapter.draw({ visible: true });
    assert.match(adapter.inspect().caption, /^RECOVERING/);
    h.bus.emit('save:restoring', {});
    assert.equal(adapter.inspect().caption, '');
    assert.equal(adapter.inspect().seenCount, 0);
  } finally { adapter.destroy(); }
  assert.equal(captions.at(-1), '');
});

test('TOWJAW presentation reset and repeated disposal release every lifecycle listener', () => {
  const h = fixture(), baseline = countListeners(h.bus);
  for (let iteration = 0; iteration < 3; iteration++) {
    const adapter = createTowjawPresentation({ state: h.state, bus: h.bus, getSnapshot: () => h.view });
    adapter.onEvents([{ type: 'reel-start', entityId: 20, at: 9000 }], h.view);
    assert.ok(adapter.inspect().seenCount > 0);
    assert.ok(countListeners(h.bus) > baseline);
    h.bus.emit('sector:exit', {});
    assert.equal(adapter.inspect().seenCount, 0);
    adapter.destroy(); adapter.destroy();
    assert.equal(countListeners(h.bus), baseline);
    assert.equal(adapter.inspect().disposed, true);
    adapter.onEvents([{ type: 'outcome', outcome: 'defeat' }], h.view);
    assert.equal(adapter.inspect().seenCount, 0);
  }
});

test('TOWJAW optional UI mount removes its nodes and resize subscription when the runtime releases it', () => {
  const h = fixture(), record = recordingCanvas(), nodes = [], windowListeners = new Map();
  const host = { addEventListener: (type, fn) => windowListeners.set(type, fn),
    removeEventListener: (type, fn) => { if (windowListeners.get(type) === fn) windowListeners.delete(type); } };
  const doc = { defaultView: host, createElement: type => type === 'canvas' ? record.canvas
    : { style: {}, setAttribute() {}, remove() { this.removed = true; } } };
  const root = { appendChild: node => nodes.push(node), getBoundingClientRect: () => ({ left: 20, top: 10, width: 800, height: 600 }) };
  const before = countListeners(h.bus);
  const adapter = mountTowjawPresentation({ root, state: h.state, bus: h.bus, document: doc,
    helpers: { worldToScreen: (p, out) => Object.assign(out, { x: p.x, y: p.z, onScreen: true }) },
    runtime: { getView: () => h.view } });
  assert.ok(adapter);
  adapter.draw();
  assert.equal(record.canvas.width, 800);
  assert.equal(record.canvas.height, 600);
  assert.equal(nodes.length, 2);
  assert.equal(windowListeners.size, 1);
  adapter.destroy(); adapter.destroy();
  assert.ok(nodes.every(node => node.removed));
  assert.equal(windowListeners.size, 0);
  assert.equal(countListeners(h.bus), before);
});
