import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { createShipLedgerPanel } from '../src/ui/shipLedgerPanel.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { SHIP_LEDGER_VERGE_EVIDENCE_PAGES, shipLedgerBoard, serializeShipLedgerBoard } from '../src/systems/shipLedger.js';

class MiniNode {
  constructor(tagName = '', fragment = false) {
    this.tagName = String(tagName).toUpperCase();
    this.isFragment = fragment;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) {
    if (node && node.isFragment) { for (const child of [...node.children]) this.appendChild(child); node.children = []; return node; }
    if (!node) return node;
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  dispatch(type, event) { const listener = this.listeners.get(type); if (listener) listener(event); }
  closest(selector) {
    const selfSelectors = [
      '[data-ledger-page]', '[data-ledger-evidence]', '[data-ledger-back]',
      '[data-ledger-pin]', '[data-ledger-tie]', '[data-ledger-board-open]',
      '[data-ledger-board-tie]', '[data-ledger-board-unpin]', '[data-ledger-board-cut]',
      '[data-ledger-board-cancel]',
    ];
    const attr = selfSelectors.find((sel) => sel === selector);
    if (attr && this.attributes.has(attr.slice(1, -1))) return this;
    return this.parentNode && this.parentNode.closest ? this.parentNode.closest(selector) : null;
  }
  focus() {}
  click() { this.dispatch('click', { target: this }); }
}
class MiniDocument {
  createElement(tagName) { return new MiniNode(tagName); }
  createDocumentFragment() { return new MiniNode('', true); }
}

function find(node, pred) {
  if (!node) return null;
  if (pred(node)) return node;
  for (const child of node.children || []) { const hit = find(child, pred); if (hit) return hit; }
  return null;
}
function findAll(node, pred, out = []) {
  if (node && pred(node)) out.push(node);
  for (const child of (node && node.children) || []) findAll(child, pred, out);
  return out;
}


test('docked ledger pins and ties reach the worker story and saved board', async () => {
  const previousDocument = globalThis.document;
  const host = createSimHost();
  const main = createGameState(4242);
  const bus = createBus();
  const domains = new Map(Object.entries(main));
  let seq = 0, panel, pending;
  const apply = (reply) => {
    for (const update of reply.domainUpdates || []) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
      applyDomainPathUpdate(domains, { ...update, segs }, new Set());
      main[segs[0]] = domains.get(segs[0]);
    }
    for (const event of reply.events || []) bus.emit(event.t, event.p);
  };
  const tick = async (commands = []) => {
    const reply = structuredClone(await host.tick({ tick: ++seq, steps: 0, commands }));
    apply(reply);
    return reply;
  };
  const finish = async () => {
    assert.ok(pending, 'the actual panel dispatched its action to the worker');
    const { descriptor, resolve } = pending;
    pending = null;
    const ring = createSimCommandRing();
    ring.pushRpc(descriptor.id, descriptor.op, descriptor.args);
    const reply = await tick(ring.drain());
    resolve(reply.rpcAcks[0]);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    return reply;
  };
  try {
    apply(structuredClone(await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) })));
    const state = host.host.state;
    state.mode = 'flight';
    const player = host.host.runtime.spawn({ ...makeShipEntitySpec('ship_kestrel'), isPlayer: true });
    state.playerId = player.id;
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_helios';
    // Earned evidence is fixture input; the board actions and story consequence are real owners.
    state.story.verge = { revealed: true, awake: false, valeGatesRevoked: false, playerUsedClosureProtocol: false,
      evidence: { kellPaperTrail: true, archiveFile: true, kurtzLedger: true }, revocations: [] };
    for (let i = 0; i < 65 && !main.story?.verge?.evidence?.kellPaperTrail; i++) await tick();
    assert.equal(main.story?.verge?.evidence?.kellPaperTrail, true);
    globalThis.document = new MiniDocument();
    installSimCommandSink((descriptor) => new Promise((resolve) => { pending = { descriptor, resolve }; }));
    panel = createShipLedgerPanel({ state: main, bus }, { hostId: 'station' });
    panel.onShow();
    const ids = SHIP_LEDGER_VERGE_EVIDENCE_PAGES.map((page) => page.pageId);
    const detail = find(panel.el, (node) => node.attributes.has('data-ledger-back')).parentNode;
    for (const id of ids) {
      panel.openEvidenceByPageId(id);
      const pin = find(panel.el, (node) => node.attributes.has('data-ledger-pin'));
      detail.dispatch('click', { target: pin });
      assert.equal(shipLedgerBoard(main)?.pins.includes(id) || false, false, 'no optimistic pin');
      const firstRequest = pending;
      detail.dispatch('click', { target: pin });
      assert.strictEqual(pending, firstRequest, 'repeated clicks cannot duplicate the pending mutation');
      await finish();
      assert.ok(shipLedgerBoard(main)?.pins.includes(id), 'ack publishes the authoritative pin');
      assert.ok(shipLedgerBoard(state)?.pins.includes(id));
    }
    for (const [a, b] of [[ids[0], ids[1]], [ids[1], ids[2]]]) {
      panel.openEvidenceByPageId(a);
      detail.dispatch('click', { target: find(panel.el, (node) => node.attributes.has('data-ledger-tie')) });
      panel.openEvidenceByPageId(b);
      detail.dispatch('click', { target: find(panel.el, (node) => node.attributes.has('data-ledger-tie')) });
      await finish();
    }
    assert.equal(state.story.verge.valeGatesRevoked, true, 'the real story owner sees the completed chain');
    assert.equal(main.story.verge.valeGatesRevoked, true, 'the consequence reaches the main reader in the reply');
    assert.equal(shipLedgerBoard(state).links.length, 2);
    assert.deepEqual(shipLedgerBoard(main), shipLedgerBoard(state));
    assert.deepEqual(serializeShipLedgerBoard(state).board, shipLedgerBoard(state), 'save owner retains pins and ties');
    const save = host.host.registry.get('save');
    const saved = structuredClone(save.serializeData());
    assert.deepEqual(saved.shipLedger.board, shipLedgerBoard(state));
    // The production worker runs in its own realm; this in-process harness removes
    // the main-lane sink while calling the real Continue restore driver.
    uninstallSimCommandSink();
    state.shipLedger.board = { pins: [], links: [] };
    save._restore(saved, 'quick');
    await tick();
    assert.deepEqual(shipLedgerBoard(state), saved.shipLedger.board, 'Continue restores the worker board');
    assert.deepEqual(shipLedgerBoard(main), saved.shipLedger.board, 'Continue republishes the restored board');
  } finally {
    panel?.destroy();
    uninstallSimCommandSink();
    globalThis.document = previousDocument;
    host.shutdown();
  }
});
