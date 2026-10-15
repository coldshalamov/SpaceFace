import test from 'node:test';
import assert from 'node:assert/strict';
import { fightBeat, readTarget, foldTargetRejections } from '../scripts/player-truth/driver.mjs';
import { publishRadarHostileCourse } from '../src/ui/radar.js';

function canvas() {
  return { tagName: 'CANVAS',
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
}

function vector3() {
  return class Vector3 {
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setFromMatrixPosition(m) { return this.set(m.x, m.y || 0, m.z); }
    project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
  };
}

for (const becomesReachable of [true, false]) test(becomesReachable
  ? 'fighter selects and fires a target that becomes canvas-reachable during radar search'
  : 'unsuccessful radar search retains rejection evidence and its null return', async () => {
  const oldWindow = globalThis.window; const oldDocument = globalThis.document;
  const surface = canvas();
  const radar = { offsetParent: {}, attrs: new Map(),
    getAttribute: key => radar.attrs.get(key) ?? null,
    setAttribute: (key, value) => radar.attrs.set(key, value),
    removeAttribute: key => radar.attrs.delete(key) };
  const player = { id: 1, alive: true, type: 'ship', team: 1, pos: { x: 0, z: 0 }, rot: 0, hull: 260, hullMax: 260 };
  const target = { id: 2, alive: true, type: 'ship', team: 3, pos: { x: 10, z: 0 },
    presentationAdmission: becomesReachable ? 'ready' : 'pending', data: { runRole: 'enemy' } };
  const state = { mode: 'flight', simTime: 10, playerId: 1, player: { targetId: null },
    run: { kind: 'survival', phase: 'active' }, entityList: [player],
    render: { scene: {}, camera: {}, meshes: new Map(), renderer: { domElement: surface } } };
  let targetVisible = false; let fireDown = 0; let selected = 0; let targetReads = 0; let targetReceipt;
  const held = new Set();
  const addTarget = () => {
    if (targetVisible) return;
    targetVisible = true;
    state.entityList.push(target);
  };
  const refreshRadar = () => publishRadarHostileCourse(radar, { baseLabel: 'Local tactical radar.',
    courseText: 'Nearest hostile at 12 o\'clock, dial bearing 90 degrees.', mode: 'flight', simTime: state.simTime });
  const page = {
    evaluate: async (fn, arg) => { if (fn === readTarget) targetReads++; return fn(arg); },
    __ptOnTargetRead: read => { targetReceipt = foldTargetRejections(targetReceipt, read); },
    waitForTimeout: async () => { state.simTime += 0.2; addTarget(); refreshRadar(); },
    keyboard: {
      down: async key => held.add(key),
      up: async key => held.delete(key),
      press: async () => {},
    },
    mouse: {
      move: async () => {},
      click: async (x, y, { button } = {}) => {
        assert.equal(button, 'right'); assert.equal(x, 550); assert.equal(y, 300);
        selected++; state.player.targetId = target.id;
      },
      down: async () => { fireDown++; },
      up: async () => {},
    },
  };
  try {
    globalThis.window = { SF: { THREE: { Vector3: vector3() }, state,
      ctx: { helpers: { worldToScreen: () => ({ x: 550, y: 300, onScreen: true, behind: false }) } } } };
    globalThis.document = {
      elementFromPoint: () => surface,
      querySelector: selector => selector === '.sf-radar-semantic-canvas' ? radar : null,
    };
    refreshRadar();
    assert.equal((await readTarget()).none, true);
    assert.equal(await fightBeat(page, 0), becomesReachable ? undefined : null, 'diagnostics preserve the beat return');
    assert.equal(targetVisible, true);
    assert.equal(selected, becomesReachable ? 1 : 0, 'only the fresh reachable observation is selected');
    assert.equal(fireDown, becomesReachable ? 1 : 0, 'pending presentation never becomes a shot');
    assert.equal(state.player.targetId, becomesReachable ? target.id : null);
    assert.equal(held.size, 0, 'radar keys are released before the selection/fire path completes');
    assert.equal(targetReceipt.reads, targetReads, 'each actor target read contributes once');
    assert.ok(targetReceipt.reads > 1, 'search reads reach the trace receipt');
    if (becomesReachable) assert.ok(targetReceipt.reachableReads > 0, 'selected aim reads reach the trace receipt');
    else {
      assert.equal(targetReceipt.reachableReads, 0);
      assert.ok(targetReceipt.reasons[0].count > 1, 'repeated misses survive a null fight return');
      assert.equal(targetReceipt.reasons[0].reason, 'presentation');
    }
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('readTarget reports bounded public rejection causes without admitting covered or hidden bodies', async () => {
  const oldWindow = globalThis.window; const oldDocument = globalThis.document;
  const surface = canvas();
  const player = { id: 1, alive: true, type: 'ship', team: 1, pos: { x: 0, z: 0 }, rot: 0, hull: 260, hullMax: 260 };
  const hidden = { id: 2, alive: true, type: 'ship', team: 3, pos: { x: 10, z: 0 }, data: { runRole: 'enemy' } };
  const covered = { id: 3, occupantGeneration: 9, alive: true, type: 'ship', team: 3, pos: { x: 20, z: 0 },
    presentationAdmission: 'unavailable', presentationFallbackVisible: true, data: { runRole: 'enemy' } };
  const pending = { ...covered, id: 4, presentationAdmission: 'pending', presentationFallbackVisible: false };
  const offscreen = { ...covered, id: 5, pos: { x: 200, z: 0 } };
  const coveredAgain = { ...covered, id: 6 };
  const state = { mode: 'flight', simTime: 10, tick: 600, playerId: 1, player: { targetId: null },
    entityList: [player, hidden, covered, pending, offscreen, coveredAgain],
    render: { camera: {}, scene: {}, meshes: new Map([[hidden.id, { visible: false, matrixWorld: hidden.pos }]]), renderer: { domElement: surface } } };
  let projections = 0; let hitTests = 0;
  try {
    globalThis.window = { SF: { THREE: { Vector3: vector3() }, state,
      ctx: { helpers: { worldToScreen: pos => { projections++; return pos === offscreen.pos
        ? { x: 1200, y: 300, onScreen: false, behind: true }
        : { x: 700, y: 300, onScreen: true, behind: false }; } } } } };
    globalThis.document = { elementFromPoint: x => { hitTests++; return x === 700
      ? { tagName: 'ASIDE', id: 'combat-hud', className: 'hud-panel' } : surface; },
      querySelector: () => null };
    const result = await readTarget();
    assert.equal(result.none, true);
    assert.deepEqual(result.rejects, ['hidden', 'covered', 'presentation', 'projection']);
    assert.ok(result.rejects.length <= 4);
    assert.equal(projections, 3, 'pending and hidden bodies do not cause diagnostic projection reads');
    assert.equal(hitTests, 2, 'offscreen bodies do not cause diagnostic DOM hit tests');
    assert.equal(result.targetRejections.candidates, 5);
    assert.equal(result.targetRejections.reachable, false);
    const rows = Object.fromEntries(result.targetRejections.reasons.map(row => [row.reason, row]));
    assert.equal(rows.covered.count, 2);
    assert.equal(rows.covered.sample.id, covered.id, 'the first witness is retained for repeated causes');
    assert.equal(rows.covered.sample.generation, 9);
    assert.equal(rows.covered.sample.admission, 'unavailable');
    assert.equal(rows.covered.sample.fallbackVisible, true);
    assert.equal(rows.covered.sample.hasRoot, false);
    assert.deepEqual(rows.covered.sample.projection, { x: 700, y: 300, depth: 0, onScreen: null, behind: null });
    assert.deepEqual(rows.covered.sample.hit, { tag: 'ASIDE', id: 'combat-hud', className: 'hud-panel' });
    assert.equal(rows.hidden.sample.rootVisible, false);
    assert.equal(rows.presentation.sample.admission, 'pending');
    assert.equal(rows.presentation.sample.hasRoot, null, 'presentation rejection does not invent a mesh lookup');
    assert.deepEqual(rows.projection.sample.projection, { x: 1200, y: 300, depth: null, onScreen: false, behind: true });
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('target rejection trace keeps counts and only one detached sample per bounded reason', () => {
  const receipt = { targetRejections: { candidates: 12, reachable: false,
    reasons: Array.from({ length: 8 }, (_, i) => ({ reason: `cause-${i}`, count: i + 1,
      sample: { id: i, projection: { x: 50 } } })) } };
  const summary = foldTargetRejections(undefined, receipt);
  receipt.targetRejections.reasons[0].sample.projection.x = 500;
  foldTargetRejections(summary, { targetRejections: { candidates: 3, reachable: true, reasons: [
    { reason: 'cause-0', count: 4, sample: { id: 99 } },
    { reason: 'ninth-cause', count: 1, sample: { id: 100 } },
  ] } });
  assert.equal(summary.reads, 2);
  assert.equal(summary.candidates, 15);
  assert.equal(summary.reachableReads, 1);
  assert.equal(summary.reasons.length, 8);
  assert.equal(summary.reasons[0].count, 5);
  assert.deepEqual(summary.reasons[0].sample, { id: 0, projection: { x: 50 } });
  assert.equal(foldTargetRejections(summary, null), summary, 'missing reads do not fabricate evidence');
});
