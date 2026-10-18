// feel re-init contract: a second init() must finish through the OLD references before
// rebinding — every bus listener the previous init installed, and any stale 'feel:hit-stop'
// lease parked under the retired source name. Beats are presentation only now: nothing in
// feel sets that request, but a lease left behind by an older generation would still pin
// state.timeScale — so init/reset/destroy keep clearing it, and stacked listeners must never
// double a punch. flybyFocus and bulletTime already honor this lease; feel does too.
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { feel as feelDefinition } from '../src/render/feel.js';

installDomFixture();

const SHIELD_BREAK = { brokeShield: true, isPlayer: true, amount: 10, pos: { x: 0, z: 0 } };

function makeFixture(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.playerId = 1;
  state.ui.screenStack = [];
  state.ui.docked = false;
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } });
  state.entityList.push(state.entities.get(1));
  return { state, bus: createBus(), effects: createTimeEffects(state) };
}

function initFeel(fx, feel) {
  const host = feel || Object.create(feelDefinition);
  host.init({ state: fx.state, bus: fx.bus, helpers: {}, timeEffects: fx.effects });
  return host;
}

// --- same-state re-init must not orphan a stale lease --------------------------------------
{
  const fx = makeFixture(11);
  const feel = initFeel(fx);
  fx.effects.set('feel:hit-stop', { scale: 0.12 });
  assert.equal(fx.state.timeScale, 0.12, 'fixture must begin with the stale lease held');

  feel.init({ state: fx.state, bus: fx.bus, helpers: {}, timeEffects: fx.effects });
  assert.equal(fx.effects.describeRequests()['feel:hit-stop'], undefined,
    're-init must release a stale feel:hit-stop lease');
  assert.equal(fx.state.timeScale, 1, 're-init must not leave world time dipped');
  feel.frame(1, fx.state);
  assert.equal(fx.state.timeScale, 1, 'no late frame may resurrect the dip');

  // Automatic beats no longer write the clock at all — a fresh shield break lands its
  // punch and leaves every time-effects owner untouched.
  fx.bus.emit('combat:damage', { ...SHIELD_BREAK });
  feel.frame(0, fx.state);
  assert.equal(fx.state.timeScale, 1, 'the shield-break beat is presentation only');
  assert.deepEqual(fx.effects.describeRequests(), {}, 'feel must never arm a request');
}

// --- cross-state re-init must finish through the OLD service and bus ----------------------
{
  const old = makeFixture(12);
  const feel = initFeel(old);
  old.effects.set('feel:hit-stop', { scale: 0.12 });
  assert.equal(old.state.timeScale, 0.12);

  const next = makeFixture(13);
  feel.init({ state: next.state, bus: next.bus, helpers: {}, timeEffects: next.effects });
  assert.equal(old.effects.describeRequests()['feel:hit-stop'], undefined,
    're-init on a new state must clear a stale lease on the OLD time-effects service');
  assert.equal(old.state.timeScale, 1, 'the abandoned state must not stay dipped');

  old.bus.emit('combat:damage', { ...SHIELD_BREAK });
  feel.frame(0, next.state);
  assert.equal(next.state.timeScale, 1,
    'listeners left on the abandoned bus must not punch the new run');
  assert.deepEqual(next.effects.describeRequests(), {},
    'and nothing on either bus may arm a feel request');
}

// --- re-init must not stack duplicate listeners -------------------------------------------
{
  const fx = makeFixture(14);
  const feel = initFeel(fx);
  feel.init({ state: fx.state, bus: fx.bus, helpers: {}, timeEffects: fx.effects });
  fx.bus.emit('combat:damage', { ...SHIELD_BREAK });

  const control = makeFixture(15);
  const controlFeel = initFeel(control);
  control.bus.emit('combat:damage', { ...SHIELD_BREAK });

  assert.equal(feel._fovPunch, controlFeel._fovPunch,
    'one emit after re-init must land one punch, not one per stacked subscription');
}

// --- destroy() releases a stale lease and every listener -------------------------------------
{
  const fx = makeFixture(16);
  const feel = initFeel(fx);
  assert.equal(typeof feel.destroy, 'function',
    'feel must expose destroy() for registry teardown');
  fx.bus.emit('combat:damage', { ...SHIELD_BREAK });
  feel.frame(0, fx.state);
  assert.equal(fx.state.timeScale, 1, 'the shield-break beat never writes the clock');
  assert.deepEqual(fx.effects.describeRequests(), {}, 'no request is armed by a beat');
  const punchBefore = feel._fovPunch;

  fx.effects.set('feel:hit-stop', { scale: 0.12 }); // a stale lease, as an older generation parked it
  feel.destroy();
  assert.equal(fx.effects.describeRequests()['feel:hit-stop'], undefined,
    'destroy must clear a stale feel:hit-stop lease');
  assert.equal(fx.state.timeScale, 1, 'destroy must release the dip');
  fx.bus.emit('combat:damage', { ...SHIELD_BREAK });
  feel.frame(0, fx.state);
  assert.equal(fx.state.timeScale, 1, 'removed listeners must not re-arm anything');
  assert.equal(feel._fovPunch, punchBefore, 'removed listeners must not punch again');
}

console.log('feel-reinit-hitstop: re-init/destroy finish through old references PASS');

function installDomFixture() {
  const elements = new Map();
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...values) { values.forEach((value) => this.values.add(value)); }
    remove(...values) { values.forEach((value) => this.values.delete(value)); }
    contains(value) { return this.values.has(value); }
    toggle(value, force) {
      if (force === undefined) force = !this.values.has(value);
      if (force) this.values.add(value); else this.values.delete(value);
      return force;
    }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.dataset = {};
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this.hidden = false;
      this.disabled = false;
      this.isConnected = true;
      this.inert = false;
      this.id = '';
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); if (child.id) elements.set(child.id, child); return child; }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll() { return []; }
    querySelector() { return null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    contains(candidate) { for (let node = candidate; node; node = node.parentNode) if (node === this) return true; return false; }
    focus() { document.activeElement = this; }
    blur() { if (document.activeElement === this) document.activeElement = document.body; }
    getContext() {
      return {
        clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        createRadialGradient() { return { addColorStop() {} }; },
        createLinearGradient() { return { addColorStop() {} }; },
        set globalCompositeOperation(_value) {},
      };
    }
  }
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const screens = new FakeElement('div'); screens.id = 'screens'; elements.set('screens', screens); body.appendChild(screens);
  const backdrop = new FakeElement('div'); backdrop.id = 'modal-backdrop'; elements.set('modal-backdrop', backdrop); body.appendChild(backdrop);
  const hud = new FakeElement('div'); hud.id = 'hud'; elements.set('hud', hud); body.appendChild(hud);
  globalThis.document = {
    body, head, activeElement: body,
    getElementById(id) { return elements.get(id) || null; },
    createElement(tagName) { return new FakeElement(tagName); },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (callback) => { callback(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
}
