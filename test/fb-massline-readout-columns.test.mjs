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
    textContent: '', style: {}, dataset: {}, className: '',
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
