// PLACES-1 — item 7 of INV-25 §4: arrival names the place, in the place's own voice.
// sectorArrivalPlate.js: one-shot sector:enter DOM layer showing the sector name plus the
// sector's FIRST greeting bark (the shipped SECTOR_GREETING_BARKS table, picked through the
// same deterministic export the ambient hail reads). This file pins the contract:
//   • pure build — name + first bark for every authored sector, bare name for unknown ids;
//   • the carve — a real arrival shows, a continuous handoff and the opening lessons do not;
//   • the layer — mounts under #ui-root, one plate at a time, dismisses on any input and on
//     its own timer, and never blocks flight input (the dismissal handler only removes the
//     plate; nothing is prevented, focused or captured);
//   • the motion seam — reduced motion mounts the plate without transition frames.
import assert from 'node:assert/strict';
import test from 'node:test';

import { SECTOR_GREETING_BARKS } from '../src/data/barks.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  SECTOR_ARRIVAL_PLATE_TTL_MS,
  buildArrivalPlate,
  sectorArrivalPlate,
} from '../src/ui/sectorArrivalPlate.js';
import {
  getAuthoritativeInitOrder,
  getSystemCapability,
  isNodeSafeSystemId,
} from '../src/runtime/authoritativeSystemManifest.js';

// ── Pure builder ─────────────────────────────────────────────────────────────────────────────

test('PLACES-1.7: the plate is the sector\'s name plus its FIRST greeting bark', () => {
  const pallas = buildArrivalPlate('sector_pallas_drift');
  assert.equal(pallas.sectorId, 'sector_pallas_drift');
  assert.equal(pallas.name, 'Pallas Drift');
  assert.equal(pallas.line, 'The drift does not forgive a fat hull. Trim or tow.',
    'the first line of the shipped greeting barks, in the place\'s own voice');
  assert.equal(pallas.line, SECTOR_GREETING_BARKS.sector_pallas_drift[0]);

  // Every authored sector carries a name, and every sector with a bark table carries its
  // first line — all twenty-five shipped sectors are covered by the V-01 table.
  const sectorIds = new Set(SECTORS.map((s) => s.id));
  assert.equal(Object.keys(SECTOR_GREETING_BARKS).length, 25, 'the greeting table covers 25 sectors');
  for (const [sectorId, lines] of Object.entries(SECTOR_GREETING_BARKS)) {
    assert.ok(sectorIds.has(sectorId), `bark table names an authored sector ${sectorId}`);
    const plate = buildArrivalPlate(sectorId);
    assert.ok(plate.name && plate.name.length, `${sectorId} names itself`);
    assert.equal(plate.line, lines[0], `${sectorId} pins its first bark, deterministically`);
  }
});

test('PLACES-1.7: an unknown sector degrades to a bare name card, never throws', () => {
  const plate = buildArrivalPlate('sector_somewhere_far');
  assert.equal(plate.name, 'somewhere far');
  assert.equal(plate.line, null);
  assert.deepEqual(buildArrivalPlate(''), { sectorId: '', name: 'unknown sector', line: null });
});

// ── System behaviour (fake bus + state + DOM) ────────────────────────────────────────────────

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.attrs = {};
    this.listeners = [];
    this.classList = {
      add: () => {}, remove: () => {}, contains: () => false,
    };
    this.style = { setProperty: () => {}, removeProperty: () => {} };
    this.dataset = {};
  }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key]; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
    child.parentNode = null;
    return child;
  }
  addEventListener(type, fn) { this.listeners.push({ type, fn }); }
  removeEventListener(type, fn) {
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn));
  }
  get firstChild() { return this.children[0] || null; }
  get isConnected() { return !!this.parentNode; }
}

function installDom({ reduceMotionClass = false } = {}) {
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
  };
  const host = new FakeEl('div');
  host.id = 'ui-root';
  let now = 0;
  let serial = 0;
  const jobs = new Map();
  const doc = {
    createElement: (tag) => new FakeEl(tag),
    getElementById: (id) => (id === 'ui-root' ? host : null),
    body: new FakeEl('body'),
    documentElement: new FakeEl('html'),
    addEventListener(type, fn, opts) { doc.listeners.push({ type, fn, opts }); },
    removeEventListener(type, fn) {
      doc.listeners = doc.listeners.filter((l) => !(l.type === type && l.fn === fn));
    },
    listeners: [],
  };
  doc.documentElement.classList.contains = () => reduceMotionClass;
  globalThis.document = doc;
  globalThis.window = {
    setTimeout(fn, delay = 0) { const id = ++serial; jobs.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { jobs.delete(id); },
    addEventListener() {}, removeEventListener() {},
  };
  // Kit motion drives transitions through the bare global rAF/timer pair, so the fakes must
  // exist; the transition callbacks are deliberately NOT executed synchronously — running them
  // would schedule settle()'s trailing bare-global timer past the test's lifetime.
  const rafQueue = [];
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  const clock = {
    step(ms) {
      const end = now + ms;
      for (let guard = 0; guard < 1000; guard++) {
        const next = [...jobs].filter(([, job]) => job.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) { now = end; return; }
        jobs.delete(next[0]); now = next[1].at; next[1].fn();
      }
      throw new Error('timer loop did not settle');
    },
  };
  const restore = () => {
    if (prev.document === undefined) delete globalThis.document; else globalThis.document = prev.document;
    if (prev.window === undefined) delete globalThis.window; else globalThis.window = prev.window;
    if (prev.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prev.raf;
    if (prev.caf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prev.caf;
  };
  return { host, doc, clock, restore };
}

function makeHarness({ onboarding = null } = {}) {
  const listeners = new Map();
  const bus = {
    on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
    off: (name, fn) => { const all = listeners.get(name) || []; const at = all.indexOf(fn); if (at >= 0) all.splice(at, 1); },
    emit: (name, payload) => { for (const fn of [...(listeners.get(name) || [])]) fn(payload); },
  };
  const state = { simTime: 42, ui: {} };
  if (onboarding) state.onboarding = onboarding;
  const system = { ...sectorArrivalPlate };
  system.init({ bus, state });
  return { bus, state, system, emit: (payload) => bus.emit('sector:enter', payload) };
}

const flownPilot = { active: true, finished: false, beatDoneAt: { dock: 1, raid: 2 } };
const learningPilot = { active: true, finished: false, beatDoneAt: {} };

test('PLACES-1.7: a real arrival mounts one plate naming the place in its own voice', () => {
  const dom = installDom();
  try {
    const { state, emit } = makeHarness({ onboarding: flownPilot });
    emit({ sectorId: 'sector_pallas_drift', sector: { id: 'sector_pallas_drift', name: 'Pallas Drift' } });

    const plate = state.ui.sectorArrival;
    assert.ok(plate, 'the plate lands on additive UI state');
    assert.equal(plate.sectorId, 'sector_pallas_drift');
    assert.equal(plate.name, 'Pallas Drift');
    assert.equal(plate.line, SECTOR_GREETING_BARKS.sector_pallas_drift[0]);
    assert.equal(plate.t, 42, 'stamped with the enter\'s sim time');

    const [el] = dom.host.children;
    assert.ok(el, 'the plate mounts under #ui-root, its own layer');
    assert.equal(el.id, 'sf-sector-arrival');
    assert.equal(el.getAttribute('role'), 'status');
    assert.equal(el.getAttribute('aria-live'), 'polite');
    assert.equal(el.children[0].className, 'sf-arrival__name');
    assert.equal(el.children[0].textContent, 'Pallas Drift');
    assert.equal(el.children[1].className, 'sf-arrival__voice');
    assert.equal(el.children[1].textContent, `\u201C${SECTOR_GREETING_BARKS.sector_pallas_drift[0]}\u201D`);
    assert.equal(dom.host.children.length, 1, 'one plate at a time');
  } finally {
    dom.restore();
  }
});

test('PLACES-1.7: a continuous handoff is cruise, not arrival — no plate', () => {
  const dom = installDom();
  try {
    const { state, emit } = makeHarness({ onboarding: flownPilot });
    emit({ sectorId: 'sector_pallas_drift', continuous: true });
    assert.equal(state.ui.sectorArrival, undefined, 'continuous enters never write the plate state');
    assert.equal(dom.host.children.length, 0);
  } finally {
    dom.restore();
  }
});

test('PLACES-1.7: one voice during lessons — the opening rail suppresses the plate', () => {
  const dom = installDom();
  try {
    const { state, emit } = makeHarness({ onboarding: learningPilot });
    emit({ sectorId: 'sector_pallas_drift' });
    assert.equal(state.ui.sectorArrival, undefined, 'the lessons keep the glass to one voice');
    assert.equal(dom.host.children.length, 0);
  } finally {
    dom.restore();
  }
});

test('PLACES-1.7: the plate is one-shot — a new arrival replaces it, input and time dismiss it', () => {
  const dom = installDom();
  try {
    const { state, emit, system } = makeHarness({ onboarding: flownPilot });
    emit({ sectorId: 'sector_ceres_belt' });
    emit({ sectorId: 'sector_pallas_drift' });
    assert.equal(dom.host.children.length, 1, 'the second arrival replaces the first plate');
    assert.equal(state.ui.sectorArrival.sectorId, 'sector_pallas_drift');
    assert.equal(dom.host.children[0].children[0].textContent, 'Pallas Drift');

    // Dismissal on ANY input removes the plate and never blocks it: the handler takes no
    // event, prevents nothing, focuses nothing — it only takes the card down.
    const keydown = dom.doc.listeners.find((l) => l.type === 'keydown');
    assert.ok(keydown, 'the plate listens for a dismissal key');
    let prevented = 0;
    keydown.fn({ preventDefault: () => { prevented += 1; } });
    assert.equal(prevented, 0, 'the dismissal never blocks the input it answers');
    assert.equal(dom.host.children.length, 0);

    // Auto-fade: the cosmetic timer clears the plate on its own.
    emit({ sectorId: 'sector_sker_haven' });
    assert.equal(dom.host.children.length, 1);
    dom.clock.step(SECTOR_ARRIVAL_PLATE_TTL_MS + 1);
    assert.equal(dom.host.children.length, 0, 'the plate fades on its own timer');

    // destroy() unpairs the bus and clears whatever is left.
    emit({ sectorId: 'sector_veil_nebula' });
    system.destroy();
    assert.equal(dom.host.children.length, 0, 'destroy clears a live plate');
    emit({ sectorId: 'sector_sker_haven' });
    assert.equal(dom.host.children.length, 0, 'destroy unpairs the sector:enter subscription');
  } finally {
    dom.restore();
  }
});

test('PLACES-1.7: reduced motion mounts the plate without transition frames', () => {
  const dom = installDom({ reduceMotionClass: true });
  try {
    const rafCalls = [];
    const prevRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (fn) => { rafCalls.push(fn); return 0; };
    try {
      const { state, emit } = makeHarness({ onboarding: flownPilot });
      emit({ sectorId: 'sector_haumea_rift' });
      assert.equal(dom.host.children.length, 1, 'the plate still shows under reduced motion');
      assert.equal(rafCalls.length, 0, 'no transition frames are scheduled — cut, not settle');
      assert.equal(state.ui.sectorArrival.name, 'Haumea Rift');
    } finally {
      globalThis.requestAnimationFrame = prevRaf;
    }
  } finally {
    dom.restore();
  }
});
test('PLACES-1.7: the module is DOM-guarded — a host with no document still records the arrival', () => {
  // Node has no document global in this file's default state; the restore() from prior tests
  // guarantees it is absent here.
  assert.equal(typeof globalThis.document, 'undefined');
  const { state, emit } = makeHarness({ onboarding: flownPilot });
  emit({ sectorId: 'sector_pallas_drift' });
  assert.equal(state.ui.sectorArrival.name, 'Pallas Drift', 'no DOM, no throw — state still written');
});

test('PLACES-1.7: the plate boots on the MAIN lane — a DOM card must never live in the worker lane', () => {
  // The worker lane is the production default (main.js). A DOM system that inits inside the
  // worker never mounts — workers have no document — so the lane posture is part of the
  // module's contract, not an implementation detail. The miningHud posture: nodeSafe and
  // domGuarded, which the presentation registry's own filter (presentationRegistry.js
  // isPresentation) selects for main-lane boot and the worker-lane list (nodeSafeOnly)
  // excludes.
  const cap = getSystemCapability('sectorArrivalPlate');
  assert.equal(cap.domGuarded, true, 'the plate is a main-lane DOM system');
  assert.equal(isNodeSafeSystemId('sectorArrivalPlate'), true);
  const workerLaneIds = getAuthoritativeInitOrder('production', { nodeSafeOnly: true });
  assert.ok(!workerLaneIds.includes('sectorArrivalPlate'),
    'the worker lane must not boot the plate — its DOM would be dead there');
  // And the presentation side: a domGuarded, nodeSafe system is exactly what the main-lane
  // presentation registry keeps (isPresentation: !nodeSafe || platform || domGuarded).
  assert.ok(!isNodeSafeSystemId('sectorArrivalPlate') || cap.phase === 'platform' || cap.domGuarded === true,
    'the presentation registry selects the plate for main-lane init');
});
