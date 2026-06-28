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
  const tickBody = src.match(/function tick\(dt\) \{([\s\S]*?)\r?\n  \}\r?\n\r?\n  function diffCargo/);
  assert.ok(tickBody, 'HUD meta tick body should remain parseable by the sleep check');
  assert.ok(!tickBody[1].includes('diffCargo('), 'HUD meta tick should not diff cargo every overlay tick');
  assert.ok(!tickBody[1].includes('cargoItems('), 'HUD meta tick should not read cargo every overlay tick');
}

function checkModalChromeAvoidsFrameDomQueries() {
  const input = readFileSync(new URL('../src/ui/input.js', import.meta.url), 'utf8');
  const uiRoot = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  const comms = readFileSync(new URL('../src/ui/comms.js', import.meta.url), 'utf8');
  const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.ok(comms.includes('isModalOpen'), 'comms should expose modal state without forcing uiRoot DOM queries');
  assert.match(comms, /state\.ui\.commsBacklogOpen = true/, 'comms backlog should publish open state for Escape routing');
  assert.match(comms, /state\.ui\.commsBacklogOpen = false/, 'comms backlog should clear open state for Escape routing');
  assert.doesNotMatch(comms, /'C' (?:key|backlog)|toggle with 'C'|route the 'C' key/i, 'comms backlog docs should reference the live L binding, not stale C copy');
  assert.match(hud, /state\.ui\.cargoPanelOpen = cargoPanelOpen/, 'cargo panel should publish open state for Escape routing');
  assert.match(hud, /state\.ui\.cargoPanelOpen = false/, 'cargo panel should clear open state for Escape routing');
  assert.match(input, /state\.ui\.commsBacklogOpen[\s\S]*bus\.emit\('ui:closeComms'\)/, 'input router should close comms before opening Pause');
  assert.match(input, /state\.ui\.cargoPanelOpen[\s\S]*bus\.emit\('ui:closeCargo'\)/, 'input router should close cargo before opening Pause');
  assert.ok(uiRoot.includes('this.comms.isModalOpen'), 'uiRoot frame should consume comms modal state directly');
  assert.ok(!uiRoot.includes("document.querySelector('.sf-endgame--c.open')"), 'uiRoot frame should not query endgame modal DOM state');
  assert.ok(uiRoot.includes('_modalBackdropEl'), 'uiRoot should cache the shared modal backdrop element');
}

function checkFullscreenCompositorShellsSleep() {
  const css = readFileSync(new URL('../styles/ui.css', import.meta.url), 'utf8');
  const screenManager = readFileSync(new URL('../src/ui/screenManager.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const uiRoot = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  const modalBackdrop = blockFor(css, '#modal-backdrop');
  const dockOverlay = blockFor(css, '#sf-dock-overlay');
  const dockOverlayInjected = blockFor(uiRoot, '.sf-dock-fade');
  const controlHints = blockFor(css, '#control-hints');
  const radarLegend = blockFor(uiRoot, '.sf-radar-legend');
  const lockRing = blockFor(uiRoot, '.sf-lockring');
  const lockRingActive = blockFor(uiRoot, '.sf-lockring.active');
  const lockDiamond = blockFor(uiRoot, '.sf-lockdiamond');
  const lockDiamondVisible = blockFor(uiRoot, '.sf-lockdiamond.visible');

  assert.match(modalBackdrop, /display:\s*none/, 'closed modal backdrop must not stay in the compositor tree');
  assert.doesNotMatch(modalBackdrop, /backdrop-filter|-webkit-backdrop-filter/, 'closed modal backdrop must not carry live backdrop filters');
  assert.match(css, /#modal-backdrop\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i, 'hidden modal backdrop should be display:none');
  assert.match(css, /body\.ui-modal-open\s+#modal-backdrop\s*\{[^}]*display:\s*block/i, 'modal backdrop should still be wired for open screens');
  assert.match(main, /o\.style\.display\s*=\s*'none'/, 'boot overlay should be removed from display after its fade');
  assert.match(screenManager, /backdrop\.hidden\s*=\s*!\s*open/, 'screen manager should unmount the shared backdrop when no screen is open');
  assert.match(dockOverlay, /pointer-events:\s*none/, 'docking overlay should not intercept input while inactive');
  assert.match(css, /#sf-dock-overlay\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i, 'hidden docking overlay should be display:none in static CSS');
  assert.match(uiRoot, /\.sf-dock-fade\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i, 'hidden docking overlay should be display:none in injected HUD CSS');
  assert.match(uiRoot, /dockFade\.hidden\s*=\s*true/, 'docking overlay should return to hidden after the fade');
  assert.match(uiRoot, /dockFade\.hidden\s*=\s*false/, 'docking overlay should only mount while the transition is active');
  assert.doesNotMatch(dockOverlayInjected, /backdrop-filter|-webkit-backdrop-filter/, 'docking overlay should not use live backdrop filters');

  assert.doesNotMatch(controlHints, /backdrop-filter|-webkit-backdrop-filter/, 'flight hint bar should not use live backdrop blur during gameplay');
  assert.doesNotMatch(controlHints, /box-shadow\s*:/, 'flight hint bar should not use shadow compositing during gameplay');
  assert.doesNotMatch(controlHints, /text-shadow\s*:/, 'flight hint bar should not use text-shadow compositing during gameplay');
  assert.doesNotMatch(controlHints, /transition\s*:/, 'flight hint bar should not keep an idle compositor transition during gameplay');
  assert.doesNotMatch(radarLegend, /text-shadow:\s*var\(--text-shadow-hard\)/, 'radar legend should stay flat next to the live canvas');
  assert.doesNotMatch(blockFor(uiRoot, '.sf-radar'), /transition\s*:/, 'radar dial should not keep idle width/height transitions next to the live canvas');
  assert.doesNotMatch(uiRoot, /\.sf-radar-legend \.stn\s*\{[^}]*box-shadow/i, 'radar legend swatches should not glow next to the live canvas');
  assert.match(lockRing, /display:\s*none/, 'idle lock ring should not stay in the compositor tree');
  assert.match(lockRingActive, /display:\s*block/, 'active lock ring should still mount for lock feedback');
  assert.match(lockDiamond, /display:\s*none/, 'idle target diamond should not keep its pulsing glow mounted');
  assert.match(lockDiamondVisible, /display:\s*block/, 'visible target diamond should still mount for selected targets');
  assert.match(hud, /objWrap\.style\.display\s*=\s*'none'/, 'empty objective tracker should start out of the compositor tree');
  assert.match(hud, /setDisplay\(objWrap,\s*false\)/, 'empty objective tracker should sleep after objectives clear');
  assert.match(hud, /setDisplay\(objWrap,\s*true,\s*'flex'\)/, 'objective tracker should remount with its authored flex layout when populated');
}

function blockFor(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  assert.ok(match, `${selector} CSS block should be present`);
  return match[1];
}

checkFloatingTextSleepsWhenInactive();
checkDamageIndicatorsSleepWhenInactive();
checkHudMetaCargoIsEventDriven();
checkModalChromeAvoidsFrameDomQueries();
checkFullscreenCompositorShellsSleep();
console.log('UI frame sleep checks OK');
