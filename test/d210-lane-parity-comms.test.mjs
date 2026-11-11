import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { applyLaneInputWrites, installSimCommandSink } from '../src/core/simLaneCommands.js';
import { createCommsRadial } from '../src/ui/commsRadial.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { fakeDom } from './helpers/fake-dom.mjs';

function commsDocument() {
  const doc = fakeDom();
  const listeners = new Map();
  const make = tag => {
    const node = doc._make(tag);
    const keyed = new Map();
    node.querySelector = selector => {
      const key = /^\[data-k="([^"]+)"\]$/.exec(selector)?.[1];
      if (!key) return null;
      if (!keyed.has(key)) {
        const child = make('div');
        node.appendChild(child);
        keyed.set(key, child);
      }
      return keyed.get(key);
    };
    node.replaceChildren = (...children) => {
      for (const child of [...node.children]) node.removeChild(child);
      node.append(...children);
    };
    node.removeChild = child => {
      node.children.splice(node.children.indexOf(child), 1);
      child.parentNode = null;
    };
    node.insertBefore = child => { child.parentNode = node; node.children.unshift(child); };
    node.remove = () => node.parentNode?.removeChild(node);
    node.contains = child => child === node || node.children.some(row => row.contains(child));
    node.focus = () => { doc.activeElement = node; };
    return node;
  };
  const root = make('div');
  root.id = 'ui-root';
  doc.body = make('body');
  doc.body.appendChild(root);
  doc.createElement = make;
  doc.createElementNS = (_, tag) => make(tag);
  const findInHead = doc.getElementById;
  doc.getElementById = id => root.children.find(node => node.id === id)
    || (id === root.id ? root : findInHead(id));
  doc.addEventListener = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
  };
  doc.removeEventListener = (type, listener) => listeners.get(type)?.delete(listener);
  doc.key = (type, key) => {
    for (const listener of listeners.get(type) || []) listener({ key });
  };
  return doc;
}

function contactState() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, data: {} };
  const patrol = { id: 2, type: 'ship', alive: true, team: 2, pos: { x: 120, z: 0 },
    data: { trafficRole: 'patrol', callsign: 'Concord Seven', ai: { passive: true, lawful: true, spawnContext: 'patrol' } } };
  return { mode: 'flight', simTime: 10, tick: 600, playerId: player.id,
    player: { targetId: null, ownedShips: [] }, ui: {}, input: { actions: {} },
    entities: new Map([[player.id, player], [patrol.id, patrol]]), entityList: [player, patrol],
    world: { currentSectorId: 'sector_test', scanPings: {} }, traffic: { freighters: [] } };
}

for (const lane of ['main', 'worker']) {
  test(`${lane}: a selected resident berth exposes its native verbs in the existing comms fan`, () => {
    const previousDocument = globalThis.document, doc = commsDocument();
    globalThis.document = doc;
    const state = contactState();
    state.world.currentSectorId = 'sector_tethys_junction'; state.player.targetId = 2;
    const station = { id: 2, type: 'station', alive: true, pos: { x: 300, z: 0 },
      data: { stationId: 'station_tethys' } };
    state.entities.set(2, station); state.entityList[1] = station;
    const writes = [], uninstall = lane === 'worker' ? installSimCommandSink(command => writes.push(command)) : () => {};
    const bus = createBus(), choices = [];
    bus.on('contactHail:choice', payload => choices.push(payload));
    const radial = createCommsRadial({ state, bus });
    try {
      doc.key('keydown', 'Alt');
      const fan = doc.getElementById('sf-commsfan');
      assert.equal(fan.hidden, false);
      const initial = fan.querySelector('[data-k="wedgehost"]').children.filter(node => node.dataset.choice);
      assert.ok(initial.some(node => node.dataset.choice === 'resident_work'), 'a resident never opens an empty fan');
      assert.ok(initial.some(node => node.dataset.choice === 'resident_local'));
      // This is the scanner reply arriving through either lane. Only its real request
      // is dispatched; the synchronous UI probe cannot accept anything itself.
      bus.emit('contactHail:offer', { requestId: 'native-resident', targetId: 2, kind: 'resident',
        residentName: 'Mira', residentRole: 'Freight Seal Clerk', expiresAt: 40,
        lines: ['Mira', 'The recorder has work.'], actions: [{ id: 'resident_accept', label: 'ACCEPT · 500 CR' }] });
      const accept = fan.querySelector('[data-k="wedgehost"]').children.find(node => node.dataset.choice === 'resident_accept');
      assert.ok(accept); accept.click();
      assert.deepEqual(choices, [{ requestId: 'native-resident', targetId: 2, choice: 'resident_accept', source: 'pointer' }]);
      assert.equal(MAIN_TO_SIM_BUS_EVENTS.has('contactHail:cancel'), true, 'closing the optional channel revokes actions across the worker bridge');
    } finally {
      radial.destroy(); uninstall();
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  });

  test(`${lane}: first Alt hold opens nearest contact and stays open before a mirror reply`, () => {
    const previousDocument = globalThis.document;
    const doc = commsDocument();
    globalThis.document = doc;
    const state = contactState();
    const authoritative = structuredClone(state);
    const writes = [];
    const uninstall = lane === 'worker' ? installSimCommandSink(command => writes.push(command)) : () => {};
    const bus = createBus();
    const requests = [];
    bus.on('contactHail:request', request => requests.push(request));
    const radial = createCommsRadial({ state, bus });
    try {
      doc.key('keydown', 'Alt');
      const fan = doc.getElementById('sf-commsfan');
      assert.equal(fan.hidden, false, 'the first hold opens the fan without waiting for the target mirror');
      assert.equal(state.ui.commsRadialOpen, true);
      assert.equal(fan.querySelector('[data-k="pilot"]').textContent, 'CONCORD SEVEN');
      assert.deepEqual(requests, [{ targetId: 2, source: 'radial' }]);
      assert.ok(fan.querySelector('[data-k="wedgehost"]').children.some(node => node.dataset.choice === 'status'));
      radial.tick();
      assert.equal(fan.hidden, false, 'a presentation tick before the worker reply preserves the open fan');
      if (lane === 'worker') {
        assert.equal(state.player.targetId, null, 'the page has not received the authoritative selection yet');
        assert.equal(applyLaneInputWrites(authoritative, writes), 1);
        assert.equal(authoritative.player.targetId, 2, 'the selection still reaches the simulation owner');
        state.player.targetId = authoritative.player.targetId;
        radial.tick();
        assert.equal(fan.hidden, false, 'the authoritative mirror reply preserves the same fan');
      } else assert.equal(state.player.targetId, 2);
      doc.key('keyup', 'Alt');
      assert.equal(fan.hidden, true);
      doc.key('keydown', 'Alt');
      assert.equal(fan.hidden, false, 'a later hold still opens normally');
      state.entities.get(2).alive = false;
      radial.tick();
      assert.equal(fan.hidden, true, 'the selected contact is revalidated instead of caching stale availability');
      doc.key('keyup', 'Alt');
    } finally {
      radial.destroy();
      uninstall();
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  });
}
