import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createDamageIndicators } from '../src/ui/damageIndicators.js';
import { createFloatingText } from '../src/ui/floatingText.js';

class FakeStyle {
  constructor() {
    this._props = new Map();
  }

  setProperty(name, value) {
    this._props.set(name, String(value));
  }
}

class FakeClassList {
  constructor(el) {
    this.el = el;
  }

  add(...names) {
    const set = new Set(String(this.el.className || '').split(/\s+/).filter(Boolean));
    for (const name of names) set.add(name);
    this.el.className = [...set].join(' ');
  }

  remove(...names) {
    const remove = new Set(names);
    this.el.className = String(this.el.className || '').split(/\s+/).filter((name) => !remove.has(name)).join(' ');
  }
}

class FakeElement {
  constructor(tag, ownerDocument) {
    this.tagName = String(tag || '').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = new FakeStyle();
    this.className = '';
    this.classList = new FakeClassList(this);
    this.attributes = new Map();
    this.textContent = '';
    this.id = '';
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    if (child.id) this.ownerDocument._ids.set(child.id, child);
    return child;
  }

  append(...children) {
    for (const child of children) this.appendChild(child);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

class FakeDocument {
  constructor() {
    this._ids = new Map();
    this.head = this.createElement('head');
    this.body = this.createElement('body');
  }

  createElement(tag) {
    return new FakeElement(tag, this);
  }

  getElementById(id) {
    return this._ids.get(id) || null;
  }

  mount(id) {
    const el = this.createElement('div');
    el.id = id;
    this._ids.set(id, el);
    this.body.appendChild(el);
    return el;
  }
}

function installFakeDom() {
  const document = new FakeDocument();
  document.mount('hud');
  document.mount('ui-root');
  globalThis.document = document;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  globalThis.requestAnimationFrame = (fn) => {
    if (typeof fn === 'function') fn();
    return 1;
  };
  return document;
}

function checkFloatingTextSleepsWhenInactive() {
  installFakeDom();
  const bus = createBus();
  const state = {
    settings: { showDamageNumbers: true },
    entities: new Map([[2, { id: 2, pos: { x: 10, z: 20 } }]]),
  };
  let projectionCalls = 0;
  const ft = createFloatingText({
    state,
    bus,
    helpers: {
      worldToScreen() {
        projectionCalls++;
        return { x: 100, y: 120, onScreen: true };
      },
    },
  });

  ft.update(1 / 60);
  assert.equal(projectionCalls, 0, 'inactive floating text should not project or scan the DOM pool');
  assert.equal(ft._activeCount(), 0, 'floating text should start asleep');

  bus.emit('combat:damage', { targetId: 2, amount: 5 });
  assert.equal(ft._activeCount(), 1, 'floating text should wake when a combat number spawns');
  ft.update(1 / 60);
  assert.equal(projectionCalls, 1, 'active floating text should still project live numbers');

  ft.update(2);
  assert.equal(ft._activeCount(), 0, 'floating text should retire expired numbers');
  projectionCalls = 0;
  ft.update(1 / 60);
  assert.equal(projectionCalls, 0, 'retired floating text should go back to sleep');
}

function checkDamageIndicatorsSleepWhenInactive() {
  installFakeDom();
  const indicator = createDamageIndicators().bind(() => {
    playerReads++;
    return { id: 1, pos: { x: 0, z: 0 } };
  }, 1);
  let playerReads = 0;
  let projectionCalls = 0;
  const helpers = {
    worldToScreen() {
      projectionCalls++;
      return { x: 900, y: 300, onScreen: true };
    },
  };

  indicator.tick(1 / 60, helpers);
  assert.equal(playerReads, 0, 'inactive damage indicators should not read the player');
  assert.equal(projectionCalls, 0, 'inactive damage indicators should not project world points');
  assert.equal(indicator._activeCount(), 0, 'damage indicators should start asleep');

  indicator.onDamage({ targetId: 1, amount: 8, pos: { x: 50, z: 0 } });
  assert.equal(indicator._activeCount(), 1, 'damage indicators should wake on player damage');
  playerReads = 0;
  projectionCalls = 0;
  indicator.tick(1 / 60, helpers);
  assert.equal(playerReads, 1, 'active damage indicators should read player position');
  assert.equal(projectionCalls, 1, 'active damage indicators should project source direction');

  indicator.tick(2, helpers);
  assert.equal(indicator._activeCount(), 0, 'damage indicators should retire expired arcs');
  playerReads = 0;
  projectionCalls = 0;
  indicator.tick(1 / 60, helpers);
  assert.equal(playerReads, 0, 'retired damage indicators should go back to sleep');
  assert.equal(projectionCalls, 0, 'retired damage indicators should not project source direction');
}

function checkHudMetaCargoIsEventDriven() {
  const src = readFileSync(new URL('../src/ui/hudMeta.js', import.meta.url), 'utf8');
  assert.ok(src.includes("bus.on('cargo:changed', maybeShowManifestGhost)"), 'HUD meta manifest ghost should wake from cargo:changed');
  assert.ok(!src.includes('snapshotCargo'), 'HUD meta should not clone cargo every overlay tick');
  const tickBody = src.match(/function tick\(dt\) \{([\s\S]*?)\n  \}\n\n  function diffCargo/);
  assert.ok(tickBody, 'HUD meta tick body should remain parseable by the sleep check');
  assert.ok(!tickBody[1].includes('diffCargo('), 'HUD meta tick should not diff cargo every overlay tick');
  assert.ok(!tickBody[1].includes('cargoItems('), 'HUD meta tick should not read cargo every overlay tick');
}

function checkModalChromeAvoidsFrameDomQueries() {
  const uiRoot = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  const comms = readFileSync(new URL('../src/ui/comms.js', import.meta.url), 'utf8');
  assert.ok(comms.includes('isModalOpen'), 'comms should expose modal state without forcing uiRoot DOM queries');
  assert.ok(uiRoot.includes('this.comms.isModalOpen'), 'uiRoot frame should consume comms modal state directly');
  assert.ok(!uiRoot.includes("document.querySelector('.sf-endgame--c.open')"), 'uiRoot frame should not query endgame modal DOM state');
  assert.ok(uiRoot.includes('_modalBackdropEl'), 'uiRoot should cache the shared modal backdrop element');
}

checkFloatingTextSleepsWhenInactive();
checkDamageIndicatorsSleepWhenInactive();
checkHudMetaCargoIsEventDriven();
checkModalChromeAvoidsFrameDomQueries();
console.log('UI frame sleep checks OK');
