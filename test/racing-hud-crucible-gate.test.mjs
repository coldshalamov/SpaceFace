// Swarm blocker: compact race-tape (Circuits) must not show during a sealed Crucible run.
// Evidence: mastercheck-d88f swarm frames 0212→0215 — fire click hit Circuits, raceBoard over
// a live Swarm round, sim frozen at 140.1 s.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRunState } from '../src/core/runState.js';
import { isRunSealed } from '../src/core/runSeal.js';
import { mountRacingHud } from '../src/ui/racingHud.js';

function installDom() {
  class FakeClassList {
    constructor(owner) { this.owner = owner; this.values = new Set(); }
    add(...vs) { for (const v of vs) this.values.add(v); this._sync(); }
    remove(...vs) { for (const v of vs) this.values.delete(v); this._sync(); }
    contains(v) { return this.values.has(v); }
    _sync() { this.owner.className = [...this.values].join(' '); }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.classList = new FakeClassList(this);
      this.attributes = new Map();
      this.style = {};
      this.textContent = '';
      this.id = '';
      this.className = '';
      this.hidden = false;
      this.disabled = false;
      this.title = '';
      this.dataset = {};
      this._listeners = new Map();
      this.type = '';
    }
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
      if (k === 'id') this.id = String(v);
    }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    append(...nodes) { for (const n of nodes) this.appendChild(n); }
    replaceChildren(...nodes) {
      for (const c of this.children) c.parentNode = null;
      this.children = [];
      for (const n of nodes) this.appendChild(n);
    }
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    addEventListener(type, fn) {
      const list = this._listeners.get(type) || [];
      list.push(fn);
      this._listeners.set(type, list);
    }
    blur() { this._blurred = true; }
    click() {
      for (const fn of this._listeners.get('click') || []) fn({});
    }
  }
  const head = new FakeElement('head');
  const body = new FakeElement('body');
  const byId = new Map();
  const previous = globalThis.document;
  globalThis.document = {
    head,
    body,
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => byId.get(id) || null,
    querySelector: () => null,
  };
  // Deckplate inject writes a style node into head; track by id if set.
  const origAppend = head.appendChild.bind(head);
  head.appendChild = (child) => {
    const el = origAppend(child);
    if (child.id) byId.set(child.id, child);
    return el;
  };
  return {
    FakeElement,
    restore() { globalThis.document = previous; },
  };
}

function flightState({ run = null } = {}) {
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, rot: 0, vel: { x: 0, z: 0 } };
  return {
    mode: 'flight',
    simTime: 10,
    ui: { docked: false },
    render: { photoMode: { active: false } },
    entities: new Map([[1, player]]),
    playerId: 1,
    missions: { active: [] },
    settings: { gameplay: {}, video: {} },
    run,
  };
}

function sealedSurvival(ruleset = 'swarm') {
  const run = createRunState({ kind: 'survival', ruleset, seed: 7 });
  run.phase = 'active';
  assert.equal(isRunSealed({ run }), true);
  return run;
}

test('adventure free flight still shows the compact race-tape (Circuits available)', () => {
  const dom = installDom();
  try {
    const root = document.createElement('div');
    const state = flightState();
    const pushed = [];
    const hud = mountRacingHud({
      root,
      bus: { on() { return () => {}; }, emit() {} },
      state,
      screens: { isOpen: () => false, pushScreen: (id) => pushed.push(id) },
    });
    assert.ok(hud);
    const panel = root.children.find((c) => c.id === 'race-tape');
    assert.ok(panel, 'race-tape mounted');
    hud.frame(state);
    assert.equal(panel.hidden, false, 'adventure flight keeps the tape');
    assert.equal(panel.dataset.compact, 'true');
    const circuits = panel.children
      .flatMap?.(function walk(el) { return [el, ...(el.children || []).flatMap(walk)]; })
      || [];
    // Walk children manually — FakeElement has .children
    const buttons = [];
    const stack = [...panel.children];
    while (stack.length) {
      const el = stack.pop();
      if (el.tagName === 'BUTTON') buttons.push(el);
      stack.push(...(el.children || []));
    }
    const board = buttons.find((b) => b.textContent === 'Circuits');
    assert.ok(board, 'Circuits button present');
    board.click();
    assert.deepEqual(pushed, ['raceBoard']);
    assert.equal(board._blurred, true, 'Circuits blurs after click so Space cannot re-fire');
    hud.dispose();
  } finally {
    dom.restore();
  }
});

test('sealed Crucible (Swarm) flight hides the race-tape entirely', () => {
  const dom = installDom();
  try {
    const root = document.createElement('div');
    const state = flightState({ run: sealedSurvival('swarm') });
    const pushed = [];
    const hud = mountRacingHud({
      root,
      bus: { on() { return () => {}; }, emit() {} },
      state,
      screens: { isOpen: () => false, pushScreen: (id) => pushed.push(id) },
    });
    const panel = root.children.find((c) => c.id === 'race-tape');
    hud.frame(state);
    assert.equal(panel.hidden, true, 'Circuits tape must not steal combat clicks in Swarm');
    assert.deepEqual(pushed, [], 'no raceBoard push while Crucible is live');
    // Gauntlet (scored) is the same survival kind.
    state.run = sealedSurvival('scored');
    state.simTime += 1;
    hud.frame(state);
    assert.equal(panel.hidden, true, 'Gauntlet likewise hides the tape');
    hud.dispose();
  } finally {
    dom.restore();
  }
});

test('ended / inactive Crucible restores the adventure race-tape', () => {
  const dom = installDom();
  try {
    const root = document.createElement('div');
    const run = sealedSurvival('swarm');
    const state = flightState({ run });
    const hud = mountRacingHud({
      root,
      bus: { on() { return () => {}; }, emit() {} },
      state,
      screens: { isOpen: () => false, pushScreen() {} },
    });
    const panel = root.children.find((c) => c.id === 'race-tape');
    hud.frame(state);
    assert.equal(panel.hidden, true);
    run.phase = 'ended';
    state.simTime += 1;
    hud.frame(state);
    assert.equal(panel.hidden, false, 'campaign HUD returns after the run ends');
    hud.dispose();
  } finally {
    dom.restore();
  }
});
