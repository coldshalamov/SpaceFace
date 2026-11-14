// #1027 review: the STANDING row stood blank on master because the mounted screen never handed its
// node to the painter. inf-slot-standing.test.mjs calls paintSavePortrait directly, so it passed
// anyway; this test mounts the whole Save/Load screen (the same headless mount as
// save-cold-card-default-facade.test.mjs) and reads the painted STANDING node.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createBus } from '../src/core/eventBus.js';
import { registerLaneRpcHandler } from '../src/core/simLaneCommands.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createLaneSystemFacade } from '../src/runtime/laneSystemFacades.js';
import { saveLoadScreen } from '../src/ui/screens/saveLoad.js';
import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

const WAR = { 'faction_dmc:faction_mts': { tension: 80, state: 'war', playerLean: 0.2, momentum: 30 } };

function storedSlot() {
  const data = {
    player: { activeShipIndex: 0, heat: 0, bounty: 0, ownedShips: [{ defId: 'ship_kestrel', fittings: [] }] },
    story: { titles: { byId: {} } },
    aceMemory: {},
    factions: { factions: { faction_dmc: { rep: 720 } }, conflicts: WAR },
  };
  const meta = { savedAt: '2026-11-05T03:40:00.000Z', playtimeS: 180,
    credits: 5000, shipName: 'ship_kestrel', label: 'Standing Run' };
  const envelope = { fmt: 'spaceface-save', version: CURRENT_VERSION, slot: 'quick',
    ...meta, checksum: fnv1a(JSON.stringify(data)), data };
  return { meta, raw: JSON.stringify({ fmt: 'spaceface-save-gz', gz: 1,
    version: envelope.version, savedAt: meta.savedAt, checksum: envelope.checksum,
    payload: gzipSync(JSON.stringify(envelope)).toString('base64') }) };
}

let host;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
before(async () => {
  host = createSimHost();
  await host.init({ profile: 'production', seed: 4242,
    scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
});
after(() => {
  host?.shutdown(); // In-process test runtime disposal; no process/session is stopped.
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

// The fake DOM plus the tree operations the Save screen uses (as in the cold-card test).
function saveDom() {
  const doc = fakeDom(), make = doc.createElement;
  doc.createElement = (tag) => {
    const node = make(tag);
    node.remove = () => {
      if (node.parentNode) {
        const siblings = node.parentNode.children;
        siblings.splice(siblings.indexOf(node), 1);
        node.parentNode = null;
      }
    };
    const asNode = child => typeof child === 'string'
      ? Object.assign(make('#text'), { textContent: child }) : child;
    node.appendChild = child => {
      child = asNode(child); child.remove?.(); child.parentNode = node;
      node.children.push(child); return child;
    };
    node.insertBefore = (child, ref) => {
      child.remove?.(); child.parentNode = node;
      const at = node.children.indexOf(ref);
      node.children.splice(at < 0 ? node.children.length : at, 0, child); return child;
    };
    node.append = (...children) => children.forEach(child => node.appendChild(child));
    node.prepend = (...children) => children.reverse().forEach(child => node.insertBefore(asNode(child), node.firstChild));
    node.replaceChildren = (...children) => {
      for (const child of node.children) child.parentNode = null;
      node.children = []; node.append(...children);
    };
    node.insertAdjacentElement = (_where, child) => node.parentNode?.appendChild(child);
    node.removeEventListener = () => {};
    node.style.removeProperty = name => { delete node.style[name]; };
    node.querySelectorAll = selector => findAll(node, child => {
      if (child === node) return false;
      if (selector.startsWith('.')) return child.classList?.contains(selector.slice(1));
      return false;
    });
    node.querySelector = selector => node.querySelectorAll(selector)[0] || null;
    node.getContext = () => null;
    return node;
  };
  return doc;
}

function mount(t, { current = false } = {}) {
  const keys = ['document', 'localStorage', 'matchMedia', 'Worker'];
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const doc = saveDom(), slot = storedSlot();
  const rows = new Map([['sf.save.quick', slot.raw], ['sf.save.index', JSON.stringify({ quick: slot.meta })]]);
  Object.assign(globalThis, { document: doc, Worker: undefined,
    matchMedia: () => ({ matches: true }),
    localStorage: { getItem: key => rows.get(key) ?? null,
      setItem: (key, value) => rows.set(key, String(value)),
      removeItem: key => rows.delete(key), clear: () => rows.clear(),
      get length() { return rows.size; }, key: i => [...rows.keys()][i] ?? null },
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = { mode: current ? 'flight' : 'menu', save: { currentSlot: current ? 'quick' : null },
    player: { ownedShips: [{ defId: 'ship_kestrel', fittings: [] }], activeShipIndex: 0 },
    settings: { accessibility: { motionReduce: true } } };
  // The live run's houses, flat on state (the shape unwrapStandingBags reads for the current slot).
  if (current) Object.assign(state, { factions: { faction_dmc: { rep: 720 } }, conflicts: WAR });
  const ctx = { bus: createBus(), state };
  const defaultFacade = createLaneSystemFacade(ctx);
  ctx.registry = { get: defaultFacade };
  const calls = [];
  const off = registerLaneRpcHandler('savePeekCardData', args => {
    const result = host.host.rpcHandlers.get('savePeekCardData')(args);
    calls.push(result);
    return result;
  });
  const root = doc.createElement('div');
  t.after(() => {
    saveLoadScreen.dispose(); off();
    keys.forEach((key, i) => {
      if (previous[i]) Object.defineProperty(globalThis, key, previous[i]);
      else delete globalThis[key];
    });
  });
  saveLoadScreen.mount(root, ctx);
  const standing = () => findAll(root, node => node.dataset?.portraitField === 'standing')[0] || null;
  const settle = async () => {
    const start = calls.length;
    t.mock.timers.tick(180);
    await Promise.all(calls.slice(start));
    await new Promise(setImmediate);
  };
  return { standing, settle };
}

test('the mounted Save screen paints STANDING (an unread cold slot reads "Record not read", then its reading)', async t => {
  const card = mount(t);
  const node = card.standing();
  assert.ok(node, 'the mounted record has a STANDING node');
  assert.equal(node.textContent, 'Record not read', 'an unread record reads unread on STANDING too, never blank');
  await card.settle();
  assert.notEqual(card.standing().textContent.trim(), '', 'the settled STANDING row is never blank');
});

test('the mounted Save screen paints the current run\'s house and war on STANDING, full text in its title', t => {
  const card = mount(t, { current: true });
  const node = card.standing();
  assert.ok(node, 'the mounted record has a STANDING node');
  assert.match(node.textContent, /Drift · /, 'the strongest house reads on the mounted card');
  assert.match(node.textContent, /Tethys Junction/, 'the burning front reads on the mounted card');
  assert.equal(node.getAttribute('title'), node.textContent, 'a short frame may cap the line; the title keeps the whole reading');
});
