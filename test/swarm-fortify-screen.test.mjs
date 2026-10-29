import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';
import { crucibleFortifyScreen, fortifyAvailable } from '../src/ui/swarmFortifyPanel.js';

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
