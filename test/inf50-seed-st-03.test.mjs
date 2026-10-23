// SEED-ST-03: the authored first-flight card mounts once per profile from the flight HUD.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { controlPrompt } from '../src/ui/controlPrompts.js';
import { getPromptDevice, setPromptDevice } from '../src/ui/bindings.js';
import { hudJobFromState } from '../src/ui/hudAttention.js';

function installCardDom() {
  const byId = new Map();
  class El {
    constructor(tag) {
      this.tagName = String(tag || 'div');
      this.children = [];
      this.id = '';
      this.className = '';
      this.hidden = false;
      this.textContent = '';
      this.parentNode = null;
    }
    setAttribute(name, value) {
      if (name === 'id') this.id = String(value);
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) byId.set(child.id, child);
      return child;
    }
  }
  const hud = new El('div');
  hud.id = 'hud';
  byId.set('hud', hud);
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => new El(tag),
    body: new El('body'),
    head: new El('head'),
  };
  return {
    byId,
    forget(id) {
      const el = byId.get(id);
      if (el && el.parentNode) {
        el.parentNode.children = el.parentNode.children.filter((child) => child !== el);
      }
      byId.delete(id);
    },
    restore() {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    },
  };
}

function firstFlight(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.ui = { docked: false };
  state.onboarding = { active: true, finished: false, pace: { flownBefore: false } };
  return state;
}

test('seed 4242 mounts the authored tutorial card once, with live labels', () => {
  const previousDevice = getPromptDevice();
  setPromptDevice('kbm');
  const dom = installCardDom();
  try {
    const state = firstFlight(4242);
    assert.equal(state.meta.seed, 4242);
    const before = controlPrompt('tutorialFlight', 'kbm', state);
    assert.equal(hudJobFromState(state, null), 'cruise');
    const card = dom.byId.get('sf-tutorial-flight-card');
    assert.ok(card, 'the first free flight mounts the card');
    assert.equal(card.textContent, before);
    assert.equal(card.textContent.includes(' • '), false, 'the keys wall is not the card');
    assert.equal(state.player.hints.firstFlight, true);

    state.settings.controls.bindings = {
      ...(state.settings.controls.bindings || {}),
      forward: ['KeyQ'],
    };
    assert.equal(hudJobFromState(state, null), 'cruise');
    const rebound = controlPrompt('tutorialFlight', getPromptDevice(), state);
    assert.notEqual(rebound, before);
    assert.equal(card.textContent, rebound);
    assert.match(card.textContent, /\bQ thrusts/);

    setPromptDevice('gamepad');
    hudJobFromState(state, null);
    assert.equal(card.textContent, controlPrompt('tutorialFlight', 'gamepad', state));
    assert.equal(card.textContent.includes(' • '), false);

    setPromptDevice('touch');
    hudJobFromState(state, null);
    assert.equal(card.textContent, controlPrompt('tutorialFlight', 'touch', state));
    assert.equal(card.textContent.includes(' • '), false);

    dom.forget('sf-tutorial-flight-card');
    hudJobFromState(state, null);
    assert.equal(dom.byId.get('sf-tutorial-flight-card'), undefined, 'spent profile does not remount');

    const again = firstFlight(4242);
    hudJobFromState(again, null);
    assert.ok(dom.byId.get('sf-tutorial-flight-card'), 'a new profile still gets the card');
    assert.equal(again.player.hints.firstFlight, true);
  } finally {
    dom.restore();
    setPromptDevice(previousDevice);
  }
});

test('the card waits for a real first flight and does not spend the flag early', () => {
  const previousDevice = getPromptDevice();
  setPromptDevice('kbm');
  const dom = installCardDom();
  try {
    const parked = firstFlight(4242);
    parked.mode = 'menu';
    hudJobFromState(parked, null);
    assert.equal(dom.byId.get('sf-tutorial-flight-card'), undefined);
    assert.notEqual(parked.player.hints.firstFlight, true);

    const docked = firstFlight(4242);
    docked.ui.docked = true;
    hudJobFromState(docked, null);
    assert.equal(dom.byId.get('sf-tutorial-flight-card'), undefined);
    assert.notEqual(docked.player.hints.firstFlight, true);

    const quiet = firstFlight(4242);
    quiet.settings.gameplay.tutorialHints = false;
    hudJobFromState(quiet, null);
    assert.equal(dom.byId.get('sf-tutorial-flight-card'), undefined);
    assert.notEqual(quiet.player.hints.firstFlight, true);

    const bare = firstFlight(4242);
    bare.onboarding = null;
    hudJobFromState(bare, null);
    assert.equal(dom.byId.get('sf-tutorial-flight-card'), undefined);
    assert.notEqual(bare.player.hints.firstFlight, true);

    dom.forget('hud');
    const unmounted = firstFlight(4242);
    hudJobFromState(unmounted, null);
    assert.notEqual(unmounted.player.hints.firstFlight, true, 'no #hud means the moment is not spent');
  } finally {
    dom.restore();
    setPromptDevice(previousDevice);
  }
});
