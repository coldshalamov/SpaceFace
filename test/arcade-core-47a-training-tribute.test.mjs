import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  SCENARIO_47A_ID,
  SCENARIO_47A_TRAINING_TRIBUTE,
  build47aTrainingLaunchOptions,
} from '../src/data/scenarios/47aLiveScene.js';
import { scenarioRuntime } from '../src/systems/scenarioRuntime.js';
import { newGameScreen, request47aTrainingLaunch } from '../src/ui/screens/newGame.js';

test('New Game exposes the 47-A archive clue and launches its fixed-seed training route', () => {
  const previousDocument = globalThis.document;
  const document = new FakeDocument();
  globalThis.document = document;
  try {
    const root = document.createElement('main');
    document.body.appendChild(root);
    const bus = createBus();
    const launches = [];
    bus.on('game:new', (payload) => launches.push(payload));

    newGameScreen.mount(root, {
      bus,
      state: { content: { ships: {} } },
      registry: { get: () => null },
    });

    const archive = document.getElementById('sf-ng-47a-training');
    const launch = document.getElementById('sf-ng-47a-training-launch');
    assert.ok(archive, 'the New Game menu contains a legitimate archive clue');
    assert.equal(archive.children[0].textContent, 'TRAINING ARCHIVE · TAPE 47-A');
    assert.equal(launch.textContent, 'Launch 47-A training route');

    launch.click();
    bus.emit('game:startFailed'); // clear the UI warmup latch/timer in this DOM fixture

    assert.deepEqual(launches, [build47aTrainingLaunchOptions({
      name: 'Wren',
      difficulty: 'standard',
      skipArcadeVerbOnboarding: false,
    })]);
    assert.equal(launches[0].seed, 47);
    for (const forbidden of ['credits', 'researchPoints', 'reward', 'unlockAllTech', 'seededRun', 'newGamePlus']) {
      assert.equal(forbidden in launches[0], false, `${forbidden} must not gate or reward the tribute`);
    }
  } finally {
    newGameScreen.onHide();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('the tribute deterministically reuses the one live 47-A scenario contract', () => {
  const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  assert.equal(SCENARIO_47A_TRAINING_TRIBUTE.scenarioId, SCENARIO_47A_ID);
  assert.equal(contract.id, SCENARIO_47A_ID);
  assert.equal(SCENARIO_47A_TRAINING_TRIBUTE.title, '47-A // GOLDEN ROUTE');
  assert.deepEqual(SCENARIO_47A_TRAINING_TRIBUTE.checklist, [
    'SCENARIO CONTRACT · FOUND',
    'ACTOR BINDINGS · QUEUED',
    'EXPECTED OUTCOME · NOT RECORDED',
  ]);

  const bus = createBus();
  const launches = [];
  bus.on('game:new', (payload) => launches.push(payload));
  const first = request47aTrainingLaunch(bus, { name: 'Wren', difficulty: 'veteran' });
  const second = request47aTrainingLaunch(bus, { name: 'Wren', difficulty: 'veteran' });
  assert.deepEqual(first, second);
  assert.deepEqual(launches, [first, second]);

  const state = createGameState(first.seed);
  state.mode = 'flight';
  state.playerId = 1;
  const loaded = [];
  bus.on('scenario:loaded', (payload) => loaded.push(payload));
  const runtime = Object.assign({}, scenarioRuntime);
  runtime.init({
    state,
    bus,
    helpers: {
      scenarioContract: contract,
      scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
      scenarioContractHash: 'training-route-proof',
    },
  });
  runtime.update();
  assert.equal(state.scenario.active.id, SCENARIO_47A_ID);
  assert.equal(state.scenario.active.name, contract.scenario);
  assert.equal(loaded.length, 1);
  runtime.dispose();
});

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.textContent = '';
    this.id = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this._innerHTML = '';
  }
  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION' && (child.selected || this.value === '')) {
      this.value = child.value;
    }
    return child;
  }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  click() { for (const listener of this.listeners.get('click') || []) listener({ target: this }); }
  focus() {}
  select() {}
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector(selector) { return findElement(this, selector); }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    if (value === '') this.children = [];
  }
  get innerHTML() { return this._innerHTML; }
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement(this, 'head');
    this.body = new FakeElement(this, 'body');
  }
  createElement(tagName) { return new FakeElement(this, tagName); }
  getElementById(id) {
    return findElement(this.head, `#${id}`) || findElement(this.body, `#${id}`);
  }
}

function findElement(root, selector) {
  const stack = [...root.children];
  while (stack.length) {
    const item = stack.shift();
    const matches = selector.startsWith('#')
      ? item.id === selector.slice(1)
      : (item.classList.contains(selector.slice(1)) || item.className.split(/\s+/).includes(selector.slice(1)));
    if (matches) return item;
    stack.push(...item.children);
  }
  return null;
}
