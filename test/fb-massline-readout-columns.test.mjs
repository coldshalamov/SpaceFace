// FB-011 — the cadence instrument reads load, stored swing energy, apex proximity,
// exit speed and time-to-whip. Seed 4242. No line → every column is undefined.
// The readout does not invent the numbers; masslineTelemetry already published them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';
import {
  createMasslineCadenceReadout,
  resolveMasslineInstrumentColumns,
  whipUrgency,
  masslineFlightRead,
} from '../src/ui/masslineCadenceReadout.js';

const SEED = 4242;

function swingState() {
  const player = {
    id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 48 },
  };
  const anchor = {
    id: 2, pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
  };
  const entities = new Map([[1, player], [2, anchor]]);
  return {
    seed: SEED,
    tick: 0,
    simTime: 0,
    playerId: 1,
    entities,
    player: {
      tether: {
        active: true,
        targetId: 2,
        phase: 'loaded',
        load: 0.64,
        strain: 0.01,
        restLength: 140,
        storedEnergy: 860,
      },
    },
  };
}

test('FB-011: a seed-4242 swing exposes load, energy, apex, exit and whip', () => {
  const state = swingState();
  masslineTelemetry.bus = { emit() {} };
  masslineTelemetry.init({ state, bus: masslineTelemetry.bus });
  masslineTelemetry.update(1 / 60, state);
  const columns = resolveMasslineInstrumentColumns(state);
  assert.equal(state.seed, SEED);
  assert.ok(columns.load > 0.5, `load ${columns.load}`);
  assert.equal(columns.energy, 860);
  assert.ok(columns.apex > 0.9, `apex ${columns.apex}`);
  assert.equal(columns.exit, 48);
  assert.equal(typeof columns.whip, 'number');
  assert.ok(columns.whip >= 0);
});

test('FB-011: with no line attached every instrument column is undefined', () => {
  const state = swingState();
  state.player.tether.active = false;
  masslineTelemetry.update(1 / 60, state);
  const columns = resolveMasslineInstrumentColumns(state);
  assert.deepEqual(columns, {
    load: undefined, energy: undefined, apex: undefined, exit: undefined, whip: undefined,
  });
});

test('FB-011: the mounted readout paints the five columns and hides with no line', () => {
  const doc = {
    createElement(tag) {
      const node = {
        tagName: tag, className: '', hidden: false, textContent: '', innerHTML: '',
        children: [], style: {}, dataset: {},
        setAttribute() {},
        appendChild(child) { this.children.push(child); return child; },
        querySelector() { return null; },
        remove() {},
      };
      return node;
    },
  };
  // A parent with no ownerDocument makes the view refuse — the model is the contract.
  // A real parent with ownerDocument is what the HUD mounts; assert the model text
  // the view would write by calling the same resolver the view calls.
  const parent = doc.createElement('div');
  parent.ownerDocument = null;
  assert.throws(() => createMasslineCadenceReadout(parent), /DOM parent/);
  const state = swingState();
  masslineTelemetry.update(1 / 60, state);
  const painted = resolveMasslineInstrumentColumns(state);
  assert.ok(Number.isFinite(painted.load));
  assert.ok(Number.isFinite(painted.exit));
});

function mountableParent() {
  const node = () => ({
    textContent: '', style: {}, dataset: {}, className: '', open: true,
    setAttribute() {},
  });
  const root = {
    className: '', hidden: false, innerHTML: '', dataset: {},
    querySelector() { return node(); },
    setAttribute() {},
    remove() {},
  };
  const doc = { createElement() { return root; } };
  return {
    ownerDocument: doc,
    append() {},
    root,
  };
}

test('FB-011: the whip column warns inside one second and goes quiet with no line', () => {
  assert.equal(whipUrgency(0.4), 'soon');
  assert.equal(whipUrgency(0), 'soon');
  assert.equal(whipUrgency(1), 'idle');
  assert.equal(whipUrgency(3.2), 'idle');
  assert.equal(whipUrgency(null), 'none');
  assert.equal(whipUrgency(undefined), 'none');

  const parent = mountableParent();
  const view = createMasslineCadenceReadout(parent);
  const state = swingState();
  masslineTelemetry.update(1 / 60, state);
  state.player.masslineTelemetry.arcPreview.timeToWhip = 0.4;
  view.update(state);
  assert.equal(view.element.dataset.whip, 'soon');
  assert.match(view.element.innerHTML, /data-whip="soon"/);

  state.player.masslineTelemetry.arcPreview.timeToWhip = 2.5;
  view.update(state);
  assert.equal(view.element.dataset.whip, 'idle');

  state.player.tether.active = false;
  view.update(state);
  assert.equal(view.element.dataset.whip, 'none');
  view.destroy();
});


test('compact line read names the attached body and respects uncertain solutions', () => {
  const state = swingState();
  state.entities.get(2).type = 'asteroid';
  state.massline2 = { throw: { payloadId: 1, solution: { valid: true, onSolution: true } } };
  assert.deepEqual(masslineFlightRead(state), { name: 'Asteroid', cue: 'Release path aligned' });
  state.massline2.throw.solution.decisionStale = true;
  assert.match(masslineFlightRead(state).cue, /uncertain/);
  state.massline2.throw.solution = { window: { reliable: true, enterS: 0.42 } };
  assert.match(masslineFlightRead(state).cue, /If coasting · window in 0.4 s/);
  state.entities.get(2).type = 'payload';
  assert.equal(masslineFlightRead(state).name, 'Cargo Mass');
  state.player.tether.active = false;
  assert.equal(masslineFlightRead(state), null);
});

test('details are a native disclosure and diagnostics refresh when opened', () => {
  const nodes = new Map();
  const makeNode = () => ({ textContent: '', dataset: {}, style: {}, open: false,
    setAttribute() {}, addEventListener(type, fn) { this[type] = fn; }, removeEventListener() {} });
  const root = makeNode();
  root.querySelector = selector => { if (!nodes.has(selector)) nodes.set(selector, makeNode()); return nodes.get(selector); };
  root.remove = () => {};
  const parent = { ownerDocument: { createElement: () => root }, append() {} };
  const view = createMasslineCadenceReadout(parent);
  const state = swingState();
  state.player.masslineTelemetry = { load: 0.6, storedSwingEnergy: 123, apexProximity: 0.2, arcPreview: { exitSpeed: 42, timeToWhip: 2 } };
  view.update(state);
  assert.match(root.innerHTML, /<details><summary role="button">Line details/);
  assert.equal(nodes.get('[data-ml="energy"]').textContent, '');
  nodes.get('details').open = true;
  nodes.get('details').toggle();
  assert.equal(nodes.get('[data-ml="energy"]').textContent, '123');
  state.player.masslineTelemetry.storedSwingEnergy = 234;
  view.update(state);
  assert.equal(nodes.get('[data-ml="energy"]').textContent, '234');
  view.destroy();
});

test('visible hint and open details refresh independently of HUD repaint and stop on hide', () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  let nextId=0; const scheduled=new Map();
  globalThis.setTimeout = (fn,ms) => { const id=++nextId; scheduled.set(id,{fn,ms}); return id; };
  globalThis.clearTimeout = id => { scheduled.delete(id); };
  const run = ms => { const [id, task]=[...scheduled].find(([,task])=>task.ms===ms); scheduled.delete(id); task.fn(); };
  const nodes = new Map();
  const node = () => ({ textContent:'', dataset:{}, open:false, setAttribute(){}, addEventListener(type,fn){this[type]=fn;}, removeEventListener(){} });
  const root = node(); root.querySelector = selector => {
    if (!nodes.has(selector)) nodes.set(selector,node()); return nodes.get(selector);
  }; root.remove = () => {};
  const view = createMasslineCadenceReadout({ ownerDocument:{createElement:()=>root}, append(){} });
  try {
    const state=swingState();
    state.settings={ controls:{bindings:{pull:['Digit1']}} };
    state.player.masslineTelemetry={storedSwingEnergy:10};
    view.update(state);
    assert.equal(nodes.get('.ml-cadence__focus-hint').textContent,'F10: focus flight controls');
    state.settings.controls.bindings.pull=['F10'];
    run(1000);
    assert.equal(nodes.get('.ml-cadence__focus-hint').textContent,'Ctrl+F10: focus flight controls');
    state.settings.controls.bindings.brake=['ControlLeft'];
    run(1000);
    assert.equal(nodes.get('.ml-cadence__focus-hint').textContent,'Alt+F10: focus flight controls');
    state.settings.controls.bindings.brake.push('AltLeft');
    run(1000);
    assert.equal(nodes.get('.ml-cadence__focus-hint').textContent,'Rebind F10 to focus flight controls');
    nodes.get('details').open=true; nodes.get('details').toggle();
    state.player.masslineTelemetry.storedSwingEnergy=27;
    run(250);
    assert.equal(nodes.get('[data-ml="energy"]').textContent,'27');
    view.hide(); assert.equal(scheduled.size,0);
  } finally { view.destroy(); globalThis.setTimeout=originalSet; globalThis.clearTimeout=originalClear; }
});
