// SFQ-I008 — toggling the G combat stick on desktop keyboard-and-mouse speaks one
// hint naming the live-bound key and explaining the relative cursor-origin stick, and a
// live stick deflection counts as the missing-three stroke. Seed 4242. The device gate
// reads state.input.promptDevice (worker-visible, kept current by the worker lane under
// D214), never the main-thread-only prompt-device flag, and the hint fires through the
// real onboarding system update.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { onboarding } from '../src/systems/onboarding.js';
import { missingThreeStrokeActive } from '../src/onboarding/missingThree.js';
import { verbBindingLabel } from '../src/onboarding/verbSpeech.js';
import { toggleAutoTarget } from '../src/combat/autoTargetMode.js';

// ── DOM stubs (same shape as missing-three.test.mjs) ────────────────────────────
function stubElement() {
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    removeAttribute() {},
    appendChild() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  head: stubElement(),
  body: stubElement(),
  documentElement: null,
  createElement: () => stubElement(),
};

function makeState(device = 'kbm') {
  const player = makeEntity({
    type: 'ship',
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: {
      weapons: [{ defId: 'pulse_laser_s', _heat: 0, heatMax: 100 }],
      combat: {},
      ai: {},
    },
  });
  player.id = 1;
  return {
    meta: { seed: 4242 },
    simTime: 10,
    tick: 0,
    mode: 'flight',
    settings: { gameplay: { tutorialHints: true }, controls: {} },
    ui: { docked: false },
    run: { kind: 'adventure', phase: 'active' },
    playerId: 1,
    player: { hints: {}, targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    nextEntityId: 10,
    nav: {},
    combat: { attachments: { byId: {} } },
    input: {
      boost: false,
      autoFire: false,
      promptDevice: device,
      autoTargetVector: { active: false, screenX: 0, screenY: 0, worldX: 0, worldZ: 0, magnitude: 0 },
      autoTargetPath: { active: false, drawing: false, points: [] },
    },
    world: { activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
    onboarding: { active: false, finished: true },
  };
}

function boot(device = 'kbm') {
  const bus = createBus();
  const state = makeState(device);
  const sys = Object.create(onboarding);
  const firstUse = [];
  bus.on('hud:firstUse', (payload) => firstUse.push(payload));
  sys.init({
    state,
    bus,
    helpers: {
      spawnEntity(spec) {
        const entity = makeEntity(spec);
        entity.id = state.nextEntityId++;
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
        return entity;
      },
      removeEntity(id) {
        const entity = state.entities.get(id);
        if (entity) entity.alive = false;
      },
    },
    registry: null,
  });
  const hints = () => firstUse.filter((payload) => payload && payload.verbId === 'combatStickOrigin');
  return {
    bus, state, sys, firstUse, hints,
    toggle() { return toggleAutoTarget(state, bus); },
    tick() { sys.update(1 / 60, state); },
  };
}

function expectedHint(label) {
  return `${label} — the cursor is the stick's center. Deflect from that center to fly.`;
}

test('SFQ-I008 seed 4242: a live stick deflection counts as the stroke, a resting stick does not', () => {
  assert.equal(missingThreeStrokeActive({
    autoFire: true,
    autoTargetVector: { active: true, magnitude: 0.42 },
  }), true, 'autoFire plus a live deflection is the stroke');
  assert.equal(missingThreeStrokeActive({
    autoFire: true,
    autoTargetVector: { active: true, magnitude: 0.42 },
    autoTargetPath: { active: false, drawing: false, points: [] },
  }), true, 'the vector counts even when no path is drawn');
  assert.equal(missingThreeStrokeActive({
    autoTargetPath: { active: true, points: [{}, {}] },
  }), true, 'a drawn path is still the stroke');
  assert.equal(missingThreeStrokeActive({
    autoTargetPath: { drawing: true, points: [] },
  }), true, 'a path still being drawn is still the stroke');

  assert.equal(missingThreeStrokeActive({
    autoFire: false,
    autoTargetVector: { active: true, magnitude: 0.42 },
  }), false, 'deflection while the stick is off is not the stroke');
  assert.equal(missingThreeStrokeActive({
    autoFire: true,
    autoTargetVector: { active: false, magnitude: 0.42 },
  }), false, 'an inactive vector is not a deflection');
  assert.equal(missingThreeStrokeActive({
    autoFire: true,
    autoTargetVector: { active: true, magnitude: 0 },
  }), false, 'a centered stick is not a deflection');
  assert.equal(missingThreeStrokeActive({
    autoFire: true,
    autoTargetVector: null,
  }), false);
  assert.equal(missingThreeStrokeActive({}), false);
  assert.equal(missingThreeStrokeActive(null), false);
});

test('SFQ-I008 seed 4242: toggling the stick on in flight names the key and the cursor center once', () => {
  const h = boot('kbm');
  try {
    assert.equal(h.state.meta.seed, 4242);
    assert.equal(h.state.input.autoFire, false);
    const label = verbBindingLabel(h.state, 'autoFire');
    assert.equal(label, 'G');
    h.tick();
    assert.equal(h.hints().length, 0, 'the stick is still off');
    assert.equal(h.toggle(), true);
    h.tick();
    const hint = h.hints();
    assert.equal(hint.length, 1, 'the first on-toggle speaks one hint');
    assert.equal(hint[0].text, expectedHint(label));
    assert.equal(hint[0].text.includes(label), true);
    assert.equal(hint[0].text.includes('autoFire'), false, 'no raw action id in player words');
    assert.equal(hint[0].text.includes('autoTargetVector'), false, 'no raw field id in player words');
    assert.equal(hint[0].text.includes('KeyG'), false, 'no raw binding code in player words');
    assert.equal(h.state.player.hints.combatStickOrigin, true, 'the profile remembers');
    assert.equal(h.toggle(), false);
    h.tick();
    assert.equal(h.toggle(), true);
    h.tick();
    h.tick();
    assert.equal(h.hints().length, 1, 'later toggles stay quiet');
  } finally { try { h.sys.destroy(); } catch (_) { /* harness only */ } }
});

test('SFQ-I008 seed 4242: a rebound key is the name the hint uses', () => {
  const h = boot('kbm');
  try {
    h.state.settings.controls.bindings = { autoFire: ['KeyH'] };
    assert.equal(verbBindingLabel(h.state, 'autoFire'), 'H');
    h.tick();
    h.toggle();
    h.tick();
    const hint = h.hints()[0];
    assert.ok(hint, 'the toggle still teaches');
    assert.equal(hint.text, expectedHint('H'));
    assert.equal(hint.text.includes('KeyH'), false, 'the raw code is not the player word');
  } finally { try { h.sys.destroy(); } catch (_) { /* harness only */ } }
});

test('SFQ-I008 seed 4242: menu, dock, hints off, the rail, and an unbound key stay quiet', () => {
  const menu = boot('kbm');
  try {
    menu.state.mode = 'menu';
    menu.toggle();
    menu.tick();
    assert.equal(menu.hints().length, 0, 'a menu toggle does not teach');
    assert.equal(menu.state.player.hints.combatStickOrigin, undefined);
    menu.state.mode = 'flight';
    menu.tick();
    assert.equal(menu.hints().length, 0, 'entering flight with the stick already on is not a new toggle');
  } finally { try { menu.sys.destroy(); } catch (_) { /* harness only */ } }

  const docked = boot('kbm');
  try {
    docked.state.ui.docked = true;
    docked.toggle();
    docked.tick();
    assert.equal(docked.hints().length, 0, 'a docked toggle does not teach');
    docked.state.ui.docked = false;
    docked.tick();
    assert.equal(docked.hints().length, 0, 'undocking with the stick already on stays quiet');
    docked.toggle();
    docked.tick();
    docked.toggle();
    docked.tick();
    assert.equal(docked.hints().length, 1, 'the next on-toggle in flight still teaches');
  } finally { try { docked.sys.destroy(); } catch (_) { /* harness only */ } }

  const quiet = boot('kbm');
  try {
    quiet.state.settings.gameplay.tutorialHints = false;
    quiet.toggle();
    quiet.tick();
    assert.equal(quiet.hints().length, 0);
    assert.equal(quiet.state.player.hints.combatStickOrigin, undefined, 'hints off does not spend the lesson');
    quiet.state.settings.gameplay.tutorialHints = true;
    quiet.tick();
    assert.equal(quiet.hints().length, 0, 'turning hints back on does not invent a toggle');
    quiet.toggle();
    quiet.tick();
    quiet.toggle();
    quiet.tick();
    assert.equal(quiet.hints().length, 1, 'the next on-toggle teaches');
  } finally { try { quiet.sys.destroy(); } catch (_) { /* harness only */ } }

  const rail = boot('kbm');
  try {
    rail.tick();
    rail.state.onboarding = { active: true, finished: false };
    rail.toggle();
    rail.tick();
    assert.equal(rail.hints().length, 0, 'the staged rail keeps the voice');
    assert.equal(rail.state.player.hints.combatStickOrigin, undefined);
    rail.state.onboarding = { active: false, finished: true };
    rail.tick();
    assert.equal(rail.hints().length, 1, 'the owed hint speaks once the rail releases');
    assert.equal(rail.hints()[0].text, expectedHint(verbBindingLabel(rail.state, 'autoFire')));
  } finally { try { rail.sys.destroy(); } catch (_) { /* harness only */ } }

  const unbound = boot('kbm');
  try {
    unbound.state.settings.controls.bindings = { autoFire: [] };
    assert.equal(verbBindingLabel(unbound.state, 'autoFire'), '');
    unbound.toggle();
    unbound.tick();
    assert.equal(unbound.hints().length, 0, 'no key to name stays quiet');
    assert.equal(unbound.state.player.hints.combatStickOrigin, undefined);
  } finally { try { unbound.sys.destroy(); } catch (_) { /* harness only */ } }
});

test('SFQ-I008 seed 4242: a pad toggle stays quiet — a pad has no cursor-origin stick to explain', () => {
  const h = boot('gamepad');
  try {
    const padLabel = verbBindingLabel(h.state, 'autoFire');
    assert.ok(padLabel.length > 0 && padLabel !== 'G', 'the pad names its own toggle button');
    h.toggle();
    h.tick();
    assert.equal(h.hints().length, 0, 'a pad toggle does not teach a cursor origin');
    assert.equal(h.state.player.hints.combatStickOrigin, undefined);
    h.toggle();
    h.tick();
    h.toggle();
    h.tick();
    assert.equal(h.hints().length, 0, 'later pad toggles stay quiet');
    h.state.input.promptDevice = 'kbm';
    h.toggle();
    h.tick();
    h.toggle();
    h.tick();
    assert.equal(h.hints().length, 1, 'the desktop hand still hears it');
  } finally { try { h.sys.destroy(); } catch (_) { /* harness only */ } }

  const touch = boot('touch');
  try {
    assert.equal(verbBindingLabel(touch.state, 'autoFire'), '', 'touch has no key to name');
    touch.toggle();
    touch.tick();
    assert.equal(touch.hints().length, 0, 'touch stays quiet');
    assert.equal(touch.state.player.hints.combatStickOrigin, undefined);
  } finally { try { touch.sys.destroy(); } catch (_) { /* harness only */ } }
});
