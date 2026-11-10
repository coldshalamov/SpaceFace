import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';
import { crucibleFortifyScreen, fortifyAvailable } from '../src/ui/swarmFortifyPanel.js';
import { summarizeFortifyModel, summarizeTwoWaveFortify } from '../scripts/player-truth/fortify.mjs';

function boot() {
  const previous = globalThis.document;
  const doc = fakeDom();
  const make = doc.createElement;
  doc.createElement = tag => {
    const node = make(tag);
    node.ownerDocument = doc;
    node.replaceChildren = (...children) => {
      for (const child of node.children) child.parentNode = null;
      node.children = [];
      node.append(...children);
    };
    node.contains = target => node === target || node.children.some(child => child.contains?.(target));
    node.focus = () => { doc.activeElement = node; };
    node.scrollIntoView = options => { node.lastScroll = options; };
    node.querySelectorAll = selector => findAll(node, child => selector === '[data-repair-id]' && child.dataset.repairId != null);
    return node;
  };
  doc.createElementNS = (_namespace, tag) => doc.createElement(tag);
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  globalThis.document = doc;
  const root = doc.createElement('section');
  const bus = createBus();
  const events = [];
  bus.on('swarm:fortifyStateRequested', p => events.push(['view', p]));
  bus.on('swarm:fortifyBuildRequested', p => events.push(['build', p]));
  bus.on('swarm:fortifyRepairRequested', p => events.push(['repair', p]));
  bus.on('swarm:fortifyReloadRequested', p => events.push(['reload', p]));
  bus.on('ui:popScreen', p => events.push(['close', p]));
  const screen = Object.create(crucibleFortifyScreen);
  screen.mount(root, { bus, state: {}, screenManager: { top: () => screen.id } });
  screen.onShow();
  return { screen, root, bus, doc, events, cleanup() { screen.dispose(); globalThis.document = previous; } };
}

function model(requestId, extra = {}) {
  return {
    requestId, runToken: 'run:1', phase: 'draft', wave: 1, credits: 300,
    arena: { x: 0, z: 0 }, player: { x: 0, z: 0, rotation: 0 },
    sockets: [{ id: 'fore', label: 'Forward gate', x: 280, z: 0, blocked: false, occupied: false }],
    structures: [], ...extra,
  };
}

test('player-truth records two full waves of surviving devices without inferring combat effects', () => {
  const ids = ['gravity_beacon', 'repulsor_pylon', 'tesla_pair', 'kinetic_turret', 'reflector_fin'];
  const snapshot = wave => summarizeFortifyModel({ runToken: 'run:1', wave, credits: 12,
    structures: ids.map((deviceId, id) => ({ id, deviceId, operational: true, entityIds: [id] })) });
  const visits = [1, 2, 3].map(wave => ({ before: snapshot(wave), end: snapshot(wave) }));
  const evidence = summarizeTwoWaveFortify(visits);
  assert.deepEqual(evidence.waves, [2, 3]);
  assert.equal(evidence.allFourSurvived, true);
  assert.equal(Object.hasOwn(evidence, 'effectsObserved'), false);
  visits[2].before.structures.pop();
  assert.equal(summarizeTwoWaveFortify(visits).allFourSurvived, false);
  visits[2].before.wave = 5;
  assert.equal(summarizeTwoWaveFortify(visits).observed, false);
});

test('occupied public position prevents purchase without spending the purse', () => {
  const h = boot();
  try {
    const requestId = h.events.at(-1)[1].requestId;
    h.bus.emit('swarm:fortifyState', model(requestId, {
      sockets: [{ id: 'fore', label: 'Forward gate', x: 280, z: 0, occupied: true }],
    }));
    assert.equal(h.screen._build.disabled, true);
    assert.match(h.screen._position.textContent, /occupied/i);
    assert.equal(h.events.some(([type]) => type === 'build'), false);
    assert.equal(h.screen._model.credits, 300);
  } finally { h.cleanup(); }
});

test('construction screen waits for its own worker query and sends one serializable purchase', () => {
  const h = boot();
  try {
    const requestId = h.events.at(-1)[1].requestId;
    h.bus.emit('swarm:fortifyState', model(requestId - 1));
    assert.equal(h.screen._build.disabled, true, 'a stale response cannot enable purchases');
    h.bus.emit('swarm:fortifyState', model(requestId, {
      sockets: [{ id: 'fore', label: 'Forward gate', x: 280, z: 0, occupied: false,
        devices: {
          gravity_beacon: { blocked: false, positions: [{ x: 280, z: 0 }] },
          tesla_pair: { blocked: true, reason: 'socket_blocked', positions: [{ x: 280, z: -50 }, { x: 280, z: 50 }] },
        } }],
    }));
    h.screen._deviceButtons.get('tesla_pair').click();
    assert.equal(h.screen._build.disabled, true, 'paired endpoint obstruction comes from the worker preview');
    h.screen._deviceButtons.get('gravity_beacon').click();
    assert.equal(h.screen._build.disabled, false, 'the single device can still use the same clear center');
    h.screen._build.click();
    h.screen._build.click();
    const builds = h.events.filter(([type]) => type === 'build');
    assert.equal(builds.length, 1, 'a pending worker purchase cannot be duplicated');
    const command = builds[0][1];
    assert.deepEqual(JSON.parse(JSON.stringify(command)), command, 'the worker command carries no callbacks or DOM objects');
    assert.equal(command.runToken, 'run:1');
    assert.equal(command.deviceId, 'gravity_beacon');
    h.bus.emit('swarm:fortifyBuildResolved', { requestId: command.requestId, runToken: 'run:1', accepted: false, reason: 'blocked', readModel: model(0) });
    assert.match(h.screen._note.textContent, /obstructed/);
    assert.equal(h.screen._build.disabled, false, 'a refusal leaves the next valid choice usable');
    h.screen.onHide();
    h.bus.emit('swarm:fortifyState', model(requestId, { credits: 0 }));
    assert.equal(h.screen._model.credits, 300, 'hidden screens ignore late replies');
  } finally { h.cleanup(); }
});

test('repairs use the structure command and screen cancellation returns to the paused armory', () => {
  const h = boot();
  try {
    const requestId = h.events.at(-1)[1].requestId;
    h.bus.emit('swarm:fortifyState', model(requestId, {
      structures: [{ id: 'fortify-run-1-1', entityId: 42, deviceId: 'gravity_beacon', hull: 90, hullMax: 140, repairCost: 20 }],
    }));
    const repair = findAll(h.root, child => child.dataset.repairId === 'fortify-run-1-1')[0];
    assert.ok(repair);
    repair.click();
    assert.equal(h.events.at(-1)[0], 'repair');
    assert.equal(h.events.at(-1)[1].entityId, 42);
    assert.equal(h.screen._model.structures[0].hull, 90, 'UI cannot repair combat health itself');
    h.bus.emit('ui:cancel', {});
    assert.equal(h.events.at(-1)[0], 'close');
  } finally { h.cleanup(); }
});

test('Fortify is an inter-wave Swarm action rather than a Gauntlet or active-flight overlay', () => {
  const run = { kind: 'survival', ruleset: 'swarm', phase: 'draft', wave: 1 };
  assert.equal(fortifyAvailable(run), true);
  assert.equal(fortifyAvailable({ ...run, phase: 'refit' }), true);
  assert.equal(fortifyAvailable({ ...run, phase: 'active' }), false);
  assert.equal(fortifyAvailable({ ...run, ruleset: 'scored' }), false);
});

test('an empty turret with a full hull can buy ammunition without a fake hull repair', () => {
  const h = boot();
  try {
    const viewRequest = h.events.at(-1)[1].requestId;
    const turret = { id: 'fortify-run-1-4', entityId: 57, deviceId: 'kinetic_turret', hull: 220, hullMax: 220,
      ammo: 0, ammoMax: 32, serviceCost: 64 };
    h.bus.emit('swarm:fortifyState', model(viewRequest, { structures: [turret] }));
    const service = findAll(h.root, child => child.dataset.repairId === 'ammo:fortify-run-1-4')[0];
    assert.ok(service, 'full hull must not hide the ammunition service');
    service.click();
    const [type, command] = h.events.at(-1);
    assert.equal(type, 'reload');
    assert.equal(command.entityId, 57);
    assert.equal(h.screen._model.structures[0].ammo, 0, 'the UI never refills ammunition itself');
    h.bus.emit('swarm:fortifyBuildResolved', { requestId: command.requestId, runToken: 'run:1',
      accepted: true, serviced: true, readModel: model(0, { credits: 236, structures: [{ ...turret, ammo: 32, serviceCost: 0 }] }) });
    assert.match(h.screen._note.textContent, /rearmed/);
    assert.equal(findAll(h.root, child => child.dataset.repairId === 'ammo:fortify-run-1-4').length, 0);
  } finally { h.cleanup(); }
});

test('a broken Tesla link explains the failure and offers its endpoint replacement', () => {
  const h = boot();
  try {
    const requestId = h.events.at(-1)[1].requestId;
    h.bus.emit('swarm:fortifyState', model(requestId, { structures: [{ id: 'pair-1', entityId: 'pair-1',
      deviceId: 'tesla_pair', hull: 90, hullMax: 90, operational: false, missingEndpoint: true, repairCost: 36 }] }));
    const row = h.screen._structures.children[1].children[0];
    assert.match(row.textContent, /link offline.*endpoint destroyed/i);
    const replace = findAll(h.root, child => child.dataset.repairId === 'pair-1')[0];
    assert.match(replace.textContent, /replace endpoint.*36/i);
    replace.click();
    const command = h.events.at(-1)[1];
    assert.equal(command.entityId, 'pair-1');
    h.bus.emit('swarm:fortifyBuildResolved', { requestId: command.requestId, runToken: 'run:1', accepted: true,
      replaced: true, readModel: model(0, { credits: 264 }) });
    assert.match(h.screen._note.textContent, /endpoint replaced/i);
  } finally { h.cleanup(); }
});

test('placement stays with the commit action across device, socket and facing choices', () => {
  const h = boot();
  try {
    h.bus.emit('swarm:fortifyState', model(h.events.at(-1)[1].requestId, { sockets: [
      { id: 'front', label: 'Front corridor · inner', x: 280, z: 0, occupied: true },
      { id: 'port', label: 'Port corridor · outer', x: 0, z: 370 },
    ] }));
    const { screen } = h;
    assert.equal(screen._position.parentNode, screen._build.parentNode, 'context is outside both scrollports');
    assert.equal(screen._build.getAttribute('aria-describedby'), screen._position.id);
    assert.match(screen._position.textContent, /Position 2.*Port · outer.*clear/);
    screen._deviceButtons.get('reflector_fin').click();
    screen._facings.children.find(button => button.dataset.facingId === 'edge').click();
    assert.match(screen._position.textContent, /Position 2.*Port · outer.*Edge-on/);
    screen._sockets.children[0].click();
    assert.match(screen._position.textContent, /Position 1 is occupied/);
    assert.equal(screen._build.disabled, true);
    screen._deviceButtons.get('kinetic_turret').click();
    assert.doesNotMatch(screen._position.textContent, /Edge-on/);
    screen._sockets.children[1].click();
    screen._build.click();
    assert.equal(h.events.at(-1)[1].socketId, 'port');
    assert.equal(h.events.at(-1)[1].deviceId, 'kinetic_turret');
    assert.equal(h.events.at(-1)[1].facing, undefined);
  } finally { h.cleanup(); }
});

test('device navigation exposes the count and retains complete accessible descriptions', () => {
  const h = boot();
  try {
    h.bus.emit('swarm:fortifyState', model(h.events.at(-1)[1].requestId));
    const devices = findAll(h.root, node => node.getAttribute('aria-controls') === 'sf-fortify-shelf')[0];
    assert.match(devices.textContent, /Devices · 5/);
    h.screen._deviceButtons.get('tesla_pair').click();
    devices.click();
    const selected = h.screen._deviceButtons.get('tesla_pair');
    assert.equal(h.doc.activeElement, selected);
    assert.equal(selected.lastScroll.block, 'nearest');
    assert.equal(selected.lastScroll.behavior, 'instant', 'navigation never forces animated scrolling');
    for (const button of h.screen._deviceButtons.values()) {
      const description = button.children.find(node => node.tagName === 'small');
      assert.ok(description.textContent.length > 20);
      assert.equal(button.getAttribute('aria-describedby'), description.id);
      assert.match(button.getAttribute('aria-label'), / · \d+ cr$/, 'name and price are separate from the accessible description');
    }
    assert.equal(h.events.filter(([kind]) => kind === 'build').length, 0, 'navigation is not a transaction');
  } finally { h.cleanup(); }
});

test('field navigation reveals real service needs, including unaffordable and empty states', () => {
  const h = boot();
  try {
    const requestId = h.events.at(-1)[1].requestId;
    const damaged = { id: 'beacon', entityId: 42, deviceId: 'gravity_beacon', hull: 77, hullMax: 140, repairCost: 24 };
    const empty = { id: 'turret', entityId: 43, deviceId: 'kinetic_turret', hull: 220, hullMax: 220,
      ammo: 0, ammoMax: 32, serviceCost: 64 };
    h.bus.emit('swarm:fortifyState', model(requestId, { structures: [damaged, empty] }));
    assert.match(h.screen._fieldLink.textContent, /In the field · 2 · 2 need service/);
    h.screen._fieldLink.click();
    assert.equal(h.doc.activeElement.dataset.repairId, 'beacon');
    assert.equal(h.events.filter(([kind]) => kind === 'repair').length, 0);
    h.bus.emit('swarm:fortifyState', model(requestId, { credits: 0, structures: [damaged, empty] }));
    h.screen._fieldLink.click();
    assert.equal(h.doc.activeElement, h.screen._structures, 'unaffordable service is still readable');
    h.bus.emit('swarm:fortifyState', model(requestId));
    assert.equal(h.screen._fieldLink.textContent, 'In the field · 0');
    h.screen._fieldLink.click();
    assert.equal(h.doc.activeElement, h.screen._structures);
    h.screen.onHide(); h.screen.onShow();
    assert.equal(h.screen._fieldLink.disabled, true, 'old service state is not actionable while reading the new run');
    assert.match(h.screen._position.textContent, /Reading construction positions/);
  } finally { h.cleanup(); }
});

test('mounted Fortify retains gamepad selection, service navigation and cancel through the shipped input router', async () => {
  const h = boot();
  const previousWindow = globalThis.window;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let input, gamepad;
  try {
    globalThis.window = { addEventListener() {}, removeEventListener() {}, SF: null };
    h.doc.addEventListener = () => {}; h.doc.removeEventListener = () => {};
    h.doc.querySelector = () => null; h.doc.querySelectorAll = () => [];
    const screens = h.doc.createElement('main'); screens.appendChild(h.root);
    screens.querySelector = () => h.root; screens.querySelectorAll = () => [h.root];
    const getById = h.doc.getElementById;
    h.doc.getElementById = id => id === 'screens' ? screens : getById(id);
    h.root.querySelectorAll = () => findAll(h.root, node => node.tagName === 'button');
    const dress = () => h.root.querySelectorAll().forEach((button, index) => {
      // Synthetic geometry exercises routing only, not actual compact CSS or hardware input.
      button.getBoundingClientRect = () => ({ left: 0, right: 240, top: index * 48, bottom: index * 48 + 44, width: 240, height: 44 });
    });
    let pressed = -1;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [{
      id: 'Synthetic Fortify pad', index: 0, connected: true, mapping: 'standard', timestamp: 1,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: index === pressed, value: index === pressed ? 1 : 0 })),
    }] } });
    const { createGamepad } = await import('../src/systems/gamepad.js');
    const { createUiInput } = await import('../src/ui/input.js');
    const state = { mode: 'flight', timeScale: 0, tick: 1, ui: {}, player: {}, entities: new Map(),
      settings: { controls: { gamepad: { enabled: true } } } };
    gamepad = createGamepad({ state, bus: h.bus });
    const manager = { isOpen: () => true, top: () => h.screen.id, locked: () => true,
      getActiveScreenDef: () => h.screen, popScreen: () => assert.fail('locked Fortify closes through its cancel handler') };
    input = createUiInput({ state, bus: h.bus, gamepad }, manager);
    const press = index => { dress(); pressed = index; input.tick(0.016); pressed = -1; input.tick(0.016); };
    h.bus.emit('swarm:fortifyState', model(h.events.at(-1)[1].requestId, { structures: [
      { id: 'beacon', entityId: 42, deviceId: 'gravity_beacon', hull: 77, hullMax: 140, repairCost: 24 },
    ] }));
    const devices = findAll(h.root, node => node.getAttribute('aria-controls') === 'sf-fortify-shelf')[0];
    devices.focus(); press(0);
    assert.equal(h.doc.activeElement, h.screen._deviceButtons.get('gravity_beacon'));
    press(13); press(0);
    assert.equal(h.screen._deviceId, 'repulsor_pylon');
    assert.match(h.screen._build.textContent, /Repulsor Pylon/);
    h.screen._fieldLink.focus(); press(0);
    assert.equal(h.doc.activeElement.dataset.repairId, 'beacon');
    press(0);
    assert.equal(h.events.at(-1)[0], 'repair');
    assert.equal(h.events.at(-1)[1].entityId, 42);
    press(1);
    assert.equal(h.events.filter(([kind]) => kind === 'close').length, 1);
    h.screen.onHide(); press(1);
    assert.equal(h.events.filter(([kind]) => kind === 'close').length, 1, 'hidden screen released its cancel listener');
  } finally {
    input?.dispose(); gamepad?.dispose?.(); h.cleanup();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else delete globalThis.navigator;
  }
});

test('Fortify Escape returns to the armory once and leaves already-handled keys alone', () => {
  const h = boot();
  try {
    let prevented = 0, stopped = 0;
    const dispatch = (key, defaultPrevented = false) => h.root.listeners.keydown.forEach(listener => listener({
      key, defaultPrevented, preventDefault() { prevented++; }, stopPropagation() { stopped++; },
    }));
    dispatch('Enter'); dispatch('Escape', true);
    assert.equal(h.events.filter(([kind]) => kind === 'close').length, 0);
    dispatch('Escape');
    assert.equal(h.events.filter(([kind]) => kind === 'close').length, 1);
    assert.equal(prevented, 1); assert.equal(stopped, 1);
  } finally { h.cleanup(); }
});
