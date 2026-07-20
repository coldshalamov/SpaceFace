import assert from 'node:assert/strict';
import test from 'node:test';

import { BINDINGS } from '../src/ui/bindings.js';
import { createUiInput } from '../src/ui/input.js';
import * as targetPanel from '../src/ui/targetPanel.js';

function entity(id, type, data = {}) {
  return {
    id,
    type,
    alive: true,
    data,
    pos: { x: 20, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
  };
}

function installDomHarness() {
  const listeners = new Map();
  const body = { tagName: 'BODY', isContentEditable: false };
  globalThis.document = {
    activeElement: body,
    body,
    documentElement: { classList: { add() {}, remove() {} } },
    addEventListener(type, handler, options) {
      const capture = options === true || !!(options && options.capture);
      const list = listeners.get(type) || [];
      list.push({ handler, capture });
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((entry) => entry.handler !== handler));
    },
    getElementById() { return null; },
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };
  return listeners;
}

function press(listeners, key, code) {
  const event = {
    key,
    code,
    target: globalThis.document.body,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
    stopImmediatePropagation() {},
  };
  const keydowns = listeners.get('keydown') || [];
  for (const { handler } of keydowns) handler(event);
  return event;
}

function inputHarness({ selectedTarget = null, earlierTetherTarget = null, tetherTarget = null } = {}) {
  const listeners = installDomHarness();
  const player = entity('player', 'ship');
  const entities = new Map([[player.id, player]]);
  if (selectedTarget) entities.set(selectedTarget.id, selectedTarget);
  if (earlierTetherTarget) entities.set(earlierTetherTarget.id, earlierTetherTarget);
  if (tetherTarget) entities.set(tetherTarget.id, tetherTarget);
  const attachments = {};
  if (earlierTetherTarget) {
    attachments.earlier = {
      id: 'earlier',
      state: 'active',
      ownerId: player.id,
      targetId: earlierTetherTarget.id,
      defId: 'tether_standard',
    };
  }
  if (tetherTarget) {
    attachments.tether = {
      id: 'tether',
      state: 'active',
      ownerId: player.id,
      targetId: tetherTarget.id,
      defId: 'tether_standard',
    };
  }
  const state = {
    mode: 'flight',
    ui: {},
    playerId: player.id,
    player: { targetId: selectedTarget ? selectedTarget.id : null },
    entities,
    entityList: [...entities.values()],
    combat: { attachments: { byId: attachments } },
  };
  const events = [];
  const bus = {
    on() { return () => {}; },
    emit(name, payload) { events.push({ name, payload }); },
  };
  const screenManager = {
    isOpen() { return false; },
    getActiveScreenDef() { return null; },
    pushScreen() {},
    popScreen() {},
  };
  const input = createUiInput({ state, bus, registry: { get() { return null; } } }, screenManager);
  return { events, input, listeners };
}

function latestToast(events) {
  const item = events.findLast((event) => event.name === 'toast');
  return item && item.payload ? String(item.payload.text || '') : '';
}

test('target panel identifies a mineable asteroid by geological name and interaction class', () => {
  const rock = entity('rock', 'asteroid', { typeId: 'ast_metallic' });
  assert.equal(targetPanel.targetDisplayName(rock), 'Metallic Asteroid');
  assert.equal(typeof targetPanel.targetInteractionClass, 'function');
  assert.equal(targetPanel.targetInteractionClass(rock), 'Mineable Asteroid');
});

test('selected ordinary wreck is labeled salvage and B explains the salvage verb', () => {
  const wreck = entity('wreck', 'wreck', { parentType: 'hull' });
  assert.equal(targetPanel.targetDisplayName(wreck), 'Wreckage');
  assert.equal(typeof targetPanel.targetInteractionClass, 'function');
  assert.equal(targetPanel.targetInteractionClass(wreck), 'Salvage');

  const h = inputHarness({ selectedTarget: wreck });
  const event = press(h.listeners, BINDINGS.drill.key, BINDINGS.drill.code);
  const toast = latestToast(h.events);
  assert.equal(event.defaultPrevented, true);
  assert.match(toast, /B drills asteroids/i);
  assert.match(toast, /mining control.*salvage this wreck/i);
  h.input.dispose();
});

test('active unstable reactor wreck massline is labeled hazardous salvage and B warns it can explode', () => {
  const reactor = entity('reactor', 'wreck', {
    parentType: 'reactor',
    unstableReactor: { dueAt: 120, vented: false },
  });
  assert.equal(targetPanel.targetDisplayName(reactor), 'Unstable Reactor Wreck');
  assert.equal(typeof targetPanel.targetInteractionClass, 'function');
  assert.equal(targetPanel.targetInteractionClass(reactor), 'Hazardous Salvage');

  const h = inputHarness({
    tetherTarget: reactor,
  });
  press(h.listeners, BINDINGS.drill.key, BINDINGS.drill.code);
  const toast = latestToast(h.events);
  assert.match(toast, /hazardous reactor/i);
  assert.match(toast, /explode/i);
  assert.match(toast, /B drills asteroids/i);
  assert.match(toast, /mining control.*salvage/i);
  h.input.dispose();
});

test('an active asteroid massline keeps drill authority when a wreck is selected', () => {
  const asteroid = entity('latched-rock', 'asteroid', { typeId: 'ast_metallic' });
  const wreck = entity('selected-wreck', 'wreck', { parentType: 'hull' });
  const h = inputHarness({ selectedTarget: wreck, tetherTarget: asteroid });

  press(h.listeners, BINDINGS.drill.key, BINDINGS.drill.code);

  assert.deepEqual(
    h.events.filter((event) => event.name === 'ui:drillFadeStart').map((event) => event.payload),
    [{ asteroidId: asteroid.id, attachmentId: 'tether' }],
  );
  assert.equal(h.events.some((event) => event.name === 'toast'), false);
  h.input.dispose();
});

test('B keeps the generic no-target drill guidance when no semantic target exists', () => {
  const h = inputHarness();
  press(h.listeners, BINDINGS.drill.key, BINDINGS.drill.code);
  assert.match(latestToast(h.events), /No asteroid targeted/i);
  h.input.dispose();
});
