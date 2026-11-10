import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createBus } from '../src/core/eventBus.js';
import { registerLaneRpcHandler } from '../src/core/simLaneCommands.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createLaneSystemFacade } from '../src/runtime/laneSystemFacades.js';
import { saveLoadScreen } from '../src/ui/screens/saveLoad.js';
import { save } from '../src/save/saveSystem.js';
import { saveStoreSignature, beginSaveStoreApply, endSaveStoreApply } from '../src/save/saveStoreGeneration.js';
import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

// Sanitized, bounded Ring export shape. No ignored capture dependency and no restore/writer.
function ringSlot({ scarCount = 17, grudge = true } = {}) {
  const scars = Array.from({ length: scarCount }, (_, i) => ({
    id: `slam:${i + 1}:port bow`, cause: 'slam', surface: 'craft', band: 'hard',
    facing: 'port bow', atT: i + 1, tick: i + 1, patchedAtT: null,
  }));
  const data = {
    player: { activeShipIndex: 0, heat: 0, bounty: 0, ownedShips: [{
      defId: 'ship_kestrel', fittings: [], livingHull: {
        schema: 'spaceface.livingHull.v1', historyVersion: 2, scars,
        repairPatches: 0, killTally: 0, updatedAtT: 17,
      },
    }] },
    aceMemory: grudge ? { ace_edda: { id: 'ace_edda', name: 'Edda', fled: true,
      defeated: false, returnTier: 1, fleeCount: 1, returnsBigger: true } } : {},
  };
  const meta = { savedAt: '2026-11-05T03:40:00.000Z', playtimeS: 180,
    credits: 5000, shipName: 'ship_kestrel', label: 'Cracker Run' };
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
  assert.equal(typeof host.host.rpcHandlers.get('savePeekCardData'), 'function');
});
after(() => {
  host?.shutdown(); // In-process test runtime disposal; no process/session is stopped.
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

// Extend the existing DOM stub only with normal DOM tree operations used by Save.
// Forced colours selects its non-animated layout; canvas has no graphics context.
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

function mountColdCard(t, options = {}) {
  const keys = ['document', 'localStorage', 'matchMedia', 'Worker'];
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const doc = saveDom(), slot = ringSlot(options);
  if (options.unreadable) slot.raw = '{"fmt":"spaceface-save-gz","gz":1,"payload":"bad gzip"}';
  const rows = new Map([['sf.save.quick', slot.raw], ['sf.save.index', JSON.stringify({ quick: slot.meta })]]);
  Object.assign(globalThis, { document: doc, Worker: undefined,
    matchMedia: () => ({ matches: true }),
    localStorage: { getItem: key => rows.get(key) ?? null,
      setItem: (key, value) => rows.set(key, String(value)),
      removeItem: key => rows.delete(key), clear: () => rows.clear(),
      get length() { return rows.size; }, key: i => [...rows.keys()][i] ?? null },
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = { bus: createBus(), state: { mode: 'menu', save: { currentSlot: null },
    player: { ownedShips: [] }, settings: { accessibility: { motionReduce: true } } } };
  // This is the exact factory selected for sim-owned Save by presentationRegistry.get.
  // No Object.create(save), fake card reader, injected projection or decoder call.
  const defaultFacade = createLaneSystemFacade(ctx);
  ctx.registry = { get: defaultFacade };
  const calls = [];
  const off = registerLaneRpcHandler('savePeekCardData', args => {
    const result = host.host.rpcHandlers.get('savePeekCardData')(args);
    calls.push({ raw: args.raw, result });
    return result;
  });
  const screen = saveLoadScreen, root = doc.createElement('div');
  t.after(() => {
    screen.dispose(); off();
    keys.forEach((key, i) => {
      if (previous[i]) Object.defineProperty(globalThis, key, previous[i]);
      else delete globalThis[key];
    });
  });
  screen.mount(root, ctx);
  const fields = () => Object.fromEntries(findAll(root, node => node.dataset?.portraitField)
    .map(node => [node.dataset.portraitField, node.textContent]));
  const settle = async () => {
    const start = calls.length;
    t.mock.timers.tick(180);
    await Promise.all(calls.slice(start).map(call => call.result));
    // Drain the existing RPC acknowledgement/facade/UI continuation chain once.
    await new Promise(setImmediate);
  };
  return { ctx, screen, fields, rows, settle, calls, raw: slot.raw, facade: defaultFacade('save') };
}

test('mounted cold Save card never reports clean history before reading the record', t => {
  const card = mountColdCard(t);
  assert.notEqual(card.fields().scars, 'Clean plates');
  assert.notEqual(card.fields().grudge, 'No one hunts you');
});

test('default facade mounted cold gzip card retains 17 scars and Edda after its lazy fill', async t => {
  const card = mountColdCard(t);
  t.diagnostic(`default facade peek=${typeof card.facade.peekSaveCardData}; signature=${typeof card.facade.saveStoreSignature}`);
  await card.settle();
  const fields = card.fields();
  t.diagnostic(JSON.stringify(fields));
  assert.match(fields.scars, /port bow, hard.*and 14 more/);
  assert.match(fields.grudge, /Edda hates you/);
  assert.equal(fields.repairs, 'No yard repairs');
  assert.equal(card.calls.length, 1, 'the cold UI sends one read to the production host');
  assert.equal(card.calls[0].raw, card.raw, 'the actual local slot bytes reach the canonical owner');
  assert.equal(card.rows.get('sf.save.quick'), card.raw, 'portrait reads preserve the slot bytes');
  card.screen.refresh(card.ctx);
  card.screen.onHide();
  card.screen.onShow(card.ctx);
  assert.deepEqual(card.fields(), fields, 'refresh and reopen retain the settled portrait');
  assert.equal(card.calls.length, 1, 'stable generation needs no additional decode');

  const replacement = ringSlot({ scarCount: 4, grudge: false });
  globalThis.localStorage.setItem('sf.save.quick', replacement.raw);
  card.screen.refresh(card.ctx);
  assert.equal(card.fields().scars, 'Record not read', 'a new generation cannot show the old record');
  await card.settle();
  assert.match(card.fields().scars, /and 1 more/);
  assert.equal(card.fields().grudge, 'No one hunts you', 'a decoded clean grudge is a factual empty result');
  assert.equal(card.calls.length, 2, 'a store write causes exactly one fresh read');
  assert.equal(card.rows.get('sf.save.quick'), replacement.raw);
});

test('unreadable cold card stays unknown after the production owner refuses its bytes', async t => {
  const card = mountColdCard(t, { unreadable: true });
  await card.settle();
  assert.equal(card.fields().scars, 'Record not read');
  assert.equal(card.fields().grudge, 'Record not read');
  assert.equal(card.calls.length, 1);
  assert.equal(card.rows.get('sf.save.quick'), card.raw);
});

test('decoded old clean records still show factual clean history on the mounted card', async t => {
  const card = mountColdCard(t, { scarCount: 0, grudge: false });
  assert.equal(card.fields().scars, 'Record not read');
  await card.settle();
  assert.equal(card.fields().scars, 'Clean plates');
  assert.equal(card.fields().grudge, 'No one hunts you');
});

test('facade and save owner share canonical tracking filters, wrapping, swaps, events and silencing', t => {
  const card = mountColdCard(t);
  const same = () => assert.equal(card.facade.saveStoreSignature(), save.saveStoreSignature());
  same();
  let signature = saveStoreSignature();
  globalThis.localStorage.setItem('unrelated', 'x');
  assert.equal(saveStoreSignature(), signature);
  for (const key of ['sf.save.quick', 'sf.recovery.quick', 'sf.settings.video']) {
    globalThis.localStorage.setItem(key, 'changed');
    assert.notEqual(saveStoreSignature(), signature);
    signature = saveStoreSignature(); same();
  }
  const wrapped = globalThis.localStorage.setItem;
  same(); assert.equal(globalThis.localStorage.setItem, wrapped, 'installation is idempotent');
  beginSaveStoreApply();
  try { globalThis.localStorage.setItem('sf.save.quick', 'reconciled'); }
  finally { endSaveStoreApply(); }
  assert.equal(saveStoreSignature(), signature, 'reconcile-owned writes are silenced');
  globalThis.localStorage.removeItem('sf.save.quick');
  assert.notEqual(saveStoreSignature(), signature, 'ordinary writes resume after the silence window');

  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'Storage');
  t.after(() => {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else delete globalThis.window;
    if (priorStorage) Object.defineProperty(globalThis, 'Storage', priorStorage); else delete globalThis.Storage;
  });
  const listeners = [];
  globalThis.window = { addEventListener: (name, handler) => { if (name === 'storage') listeners.push(handler); } };
  class MemoryStorage {
    setItem() {}
    removeItem() {}
    clear() {}
  }
  globalThis.Storage = MemoryStorage;
  signature = saveStoreSignature();
  globalThis.localStorage = new MemoryStorage();
  assert.notEqual(saveStoreSignature(), signature, 'swapped stores invalidate the prior generation');
  assert.equal(Object.hasOwn(globalThis.localStorage, 'setItem'), false, 'native-shaped storage wraps its prototype');
  signature = saveStoreSignature();
  globalThis.localStorage.setItem('sf.save.quick', 'prototype write');
  assert.notEqual(saveStoreSignature(), signature);
  signature = saveStoreSignature();
  listeners[0]({ key: 'sf.recovery.quick', newValue: 'peer' });
  assert.notEqual(saveStoreSignature(), signature, 'cross-tab storage events invalidate the same generation');
  same();
});

test('the extracted tracker still invokes the sole save-owner speculation callback with fresh bytes', t => {
  const card = mountColdCard(t);
  const owner = host.host.registry.get('save');
  const previousSpec = owner._speculativeContinuePrepare;
  const previousPending = owner._pendingSlotRearm;
  t.after(() => {
    owner._speculativeContinuePrepare = previousSpec;
    owner._pendingSlotRearm = previousPending;
  });
  const spy = t.mock.method(owner, 'speculateLoadPrepare');
  owner._speculativeContinuePrepare = { slot: 'quick', sig: card.facade.saveStoreSignature() };
  const replacement = ringSlot({ scarCount: 8 });
  beginSaveStoreApply();
  beginSaveStoreApply();
  try { globalThis.localStorage.setItem('sf.save.quick', 'reconcile-owned'); }
  finally { endSaveStoreApply(); endSaveStoreApply(); }
  t.mock.timers.tick(0);
  assert.equal(spy.mock.callCount(), 0, 'silenced reconciliation does not re-arm speculation');
  globalThis.localStorage.setItem('sf.save.quick', replacement.raw);
  const currentSig = card.facade.saveStoreSignature();
  t.mock.timers.tick(0);
  assert.equal(spy.mock.callCount(), 1);
  assert.deepEqual(spy.mock.calls[0].arguments, ['quick', { sig: currentSig, raw: replacement.raw }]);
  assert.equal(owner._pendingSlotRearm.raw, null, 'the callback releases dispatched raw bytes');
});
