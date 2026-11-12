import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { installSimCommandSink, laneCommandSink, laneRpc, laneSetMode, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { crucibleLaunchConfig, crucibleSetupFor } from '../src/ui/crucibleLaunch.js';
import { requestSandboxGame } from '../src/ui/sandbox/sandboxSetup.js';
import { crucibleDraftScreen, crucibleRefitScreen } from '../src/ui/screens/crucibleDraft.js';
import { fakeDom, findAll, findButtons } from './helpers/fake-dom.mjs';

function armoryDom() {
  const doc = fakeDom();
  const make = doc.createElement;
  doc.createElement = tag => {
    const node = make(tag);
    node.ownerDocument = doc;
    node.dispatchEvent = event => { for (const listener of node.listeners[event.type] || []) listener(event); return true; };
    if (tag === 'select') {
      let value;
      Object.defineProperty(node, 'value', { get: () => value ?? node.children[0]?.value ?? '', set(next) { value = next; } });
    }
    Object.defineProperty(node, 'parentElement', { get: () => node.parentNode });
    let html = '';
    Object.defineProperty(node, 'innerHTML', { get: () => html, set(value) { html = value; node.children = []; } });
    node.replaceChildren = (...children) => { node.children = []; node.append(...children); };
    node.prepend = (...children) => { for (const child of children.reverse()) { child.parentNode = node; node.children.unshift(child); } };
    node.after = child => { if (node.parentNode) node.parentNode.insertBefore(child, node.parentNode.children[node.parentNode.children.indexOf(node) + 1]); };
    node.remove = () => { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node); };
    node.removeEventListener = (type, listener) => { node.listeners[type] = (node.listeners[type] || []).filter(fn => fn !== listener); };
    node.contains = target => findAll(node, child => child === target).length > 0;
    node.querySelectorAll = selector => findAll(node, child => child !== node && (
      selector.startsWith('.') ? child.classList.contains(selector.slice(1))
        : selector === 'button:not(:disabled)' ? child.tagName === 'button' && !child.disabled
          : child.tagName === selector));
    node.querySelector = selector => node.querySelectorAll(selector)[0] || null;
    return node;
  };
  doc.createElementNS = (_namespace, tag) => doc.createElement(tag);
  return doc;
}

// Configured CPU-only transport fixture: real mounted screen handlers, worker registry facades,
// production boot/owners and the real main-lane forwarding/read-model/replay code. The channel
// is in-process and manually drained; this is not ordinary browser acceptance.
test('mounted Armory purchase and refit settle through the paused production host', async () => {
  const host = createSimHost();
  const main = createGameState(4242);
  const bus = createBus();
  let lane, deliver, pending = Promise.resolve();
  const replies = [];
  const asWorker = async fn => {
    const sink = laneCommandSink();
    uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); }
  };
  const drain = async () => {
    for (;;) { const current = pending; await current; if (current === pending) break; }
    await Promise.resolve();
    return { events: replies.splice(0).flatMap(reply => reply.events || []) };
  };
  const previousDocument = globalThis.document;
  const doc = armoryDom();
  const screens = [];
  try {
    const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));
    lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers: {},
      flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
      channelFactory: () => ({
        onMessage(fn) { deliver = fn; },
        terminate() {},
        post(message) {
          if (message.kind === 'init') pending = pending.then(async () => {
            const reply = await asWorker(() => host.init({ ...structuredClone(message), profile: 'production', seed: 4242, bridgeAll: true, scenarioContract }));
            deliver(structuredClone({ kind: 'ready', seq: message.seq, ...reply }));
          });
          if (message.kind === 'clockCommand') pending = pending.then(async () => {
            const reply = await asWorker(() => host.tick({ ...structuredClone(message), kind: 'tick' }));
            replies.push(reply);
            deliver(structuredClone({ kind: 'clockTick', ...reply, commandSequence: message.commandSequence }));
          });
        },
      }),
    });
    await lane.readyPromise;
    let opts;
    const launchBus = createBus();
    launchBus.on('game:new', payload => { opts = structuredClone(payload); });
    requestSandboxGame(launchBus, crucibleLaunchConfig(
      crucibleSetupFor({ starterId: 'ricochet_runner', ruleset: 'swarm', seed: 4242 }).value, 'swarm'));
    laneSetMode(main, bus, 'loading');
    await laneRpc('newGameBoot', { opts });
    laneSetMode(main, bus, 'paused');
    await drain();
    assert.equal(host.host.state.run.phase, 'draft');
    globalThis.document = doc;
    const registry = createRegistry({ state: main, bus, helpers: {}, simLane: 'worker' });
    let top = 'crucibleDraft';
    const ctx = { state: main, bus, registry, helpers: {}, screenManager: { top: () => top } };
    const mount = definition => {
      const screen = Object.create(definition);
      screens.push(screen);
      const root = doc.createElement('section');
      screen.mount(root, ctx);
      screen.onShow(ctx);
      screen.refresh(ctx);
      return { screen, root };
    };
    const armory = mount(crucibleDraftScreen);
    const facade = registry.get('survivalDraft');
    const native = host.host.registry.get('survivalDraft');
    const buy = facade.currentOffers().find(row => row.available && Number.isInteger(row.slotIndex) && row.price > 0);
    assert.ok(buy, 'the unmodified opening shelf has a legal fitting to buy');
    const card = findAll(armory.root, node => node.dataset.offerId === buy.id)[0];
    assert.ok(card, 'actual shelf renders its authoritative offer');
    card.click();
    const credits = host.host.state.run.credits;
    const confirmation = findButtons(armory.root).find(node => node.classList.contains('orr-armory-purchase'));
    assert.ok(confirmation, 'the mounted inspection exposes its purchase control');
    confirmation.click();
    const purchase = await drain();
    assert.ok(purchase.events.some(event => event.t === 'run:shopPurchased'));
    assert.equal(host.host.state.run.credits, credits - buy.price);
    assert.equal(main.run.credits, credits - buy.price);
    assert.equal(host.host.state.player.ownedShips[host.host.state.player.activeShipIndex].fittings[buy.slotIndex], buy.defId);
    assert.deepEqual(facade.refitRows(), native.refitRows());

    armory.screen.onHide();
    top = 'crucibleRefit';
    const refit = mount(crucibleRefitScreen);
    const rowNode = refit.screen._rows.children[buy.slotIndex];
    assert.ok(rowNode, 'the purchased hardpoint is reachable in Rearrange loadout');
    const strip = findButtons(rowNode).find(node => node.textContent === 'Strip');
    assert.ok(strip, 'a fitted hardpoint exposes Strip');
    const pausedTick = host.host.state.tick;
    strip.click();
    assert.equal(refit.screen._rows.getAttribute('aria-busy'), 'true');
    assert.match(refit.screen._note.textContent, /Moving.*spares/);
    assert.ok(findButtons(refit.screen._rows).filter(node => node.classList.contains('sf-cru-act')).every(node => node.disabled),
      'the visible transaction controls wait for the worker');
    bus.emit('run:refitChanged', { requestId: 'an-unrelated-action', action: 'strip', ok: true });
    assert.ok(refit.screen._pendingRefit, 'an unrelated receipt cannot rearm the stale controls');
    strip.click();
    const stripped = await drain();
    assert.ok(stripped.events.some(event => event.t === 'run:refitChanged' && event.p?.ok));
    assert.equal(stripped.events.filter(event => event.t === 'run:refitChanged').length, 1,
      'a second press while the worker is pending cannot turn a successful strip into a refusal');
    assert.equal(native.refitRows().find(row => row.slotIndex === buy.slotIndex).defId, null);
    assert.deepEqual(facade.refitRows(), native.refitRows());
    assert.equal(refit.screen._rows.getAttribute('aria-busy'), 'false');
    assert.match(refit.screen._note.textContent, /Moved .+ to spares\./);
    assert.equal(refit.screen._note.textContent, native.lastNotice());

    const strippedRow = facade.refitRows().find(row => row.slotIndex === buy.slotIndex);
    const spare = strippedRow.spares.find(part => part.defId === buy.defId);
    assert.ok(spare, 'the paid fitting retains its owned spare instance');
    const openRow = refit.screen._rows.children[buy.slotIndex];
    const spareChoice = findButtons(openRow).find(node => node.dataset.spare === String(spare.instanceId));
    assert.ok(spareChoice, 'the earned part is a reachable spare choice');
    spareChoice.click();
    const fit = findButtons(openRow).find(node => node.textContent === 'Fit');
    assert.ok(fit);
    fit.click(); fit.click();
    const fitted = await drain();
    assert.equal(fitted.events.filter(event => event.t === 'run:refitChanged').length, 1);
    assert.equal(fitted.events.find(event => event.t === 'run:refitChanged').p.ok, true);
    assert.equal(native.refitRows().find(row => row.slotIndex === buy.slotIndex).defId, buy.defId);
    assert.deepEqual(facade.refitRows(), native.refitRows());
    assert.match(refit.screen._note.textContent, /Fitted .+ to hardpoint/);
    assert.equal(refit.screen._pendingRefit, null);
    assert.equal(host.host.state.run.credits, credits - buy.price, 'moving an earned fitting never buys it again');

    // Configured stale-view fixture: another owner action consumes the selected spare after
    // it was displayed. The real Fit button must report the refusal and become usable again.
    findButtons(refit.screen._rows.children[buy.slotIndex]).find(node => node.textContent === 'Strip').click();
    await drain();
    const staleRow = refit.screen._rows.children[buy.slotIndex];
    const staleSpare = facade.refitRows().find(row => row.slotIndex === buy.slotIndex).spares.find(part => part.defId === buy.defId);
    findButtons(staleRow).find(node => node.dataset.spare === String(staleSpare.instanceId)).click();
    await asWorker(() => host.host.registry.get('ships').takeInventoryModuleInstance(staleSpare.instanceId));
    const staleFit = findButtons(staleRow).find(node => node.textContent === 'Fit');
    staleFit.click(); staleFit.click();
    const refused = await drain();
    const refusal = refused.events.filter(event => event.t === 'run:refitChanged');
    assert.equal(refusal.length, 1);
    assert.equal(refusal[0].p.ok, false);
    assert.equal(refit.screen._pendingRefit, null, 'a denied transaction releases the controls too');
    assert.equal(refit.screen._note.textContent, refusal[0].p.reason);
    assert.equal(refit.screen._rows.getAttribute('aria-busy'), 'false');

    const sale = findButtons(refit.screen._rows).find(node => node.classList.contains('sf-cru-sell'));
    assert.ok(sale, 'the remaining real inventory still offers a legal next action');
    const beforeSale = host.host.state.run.credits;
    sale.click(); sale.click();
    // Covering/reopening the modal before the worker returns cannot bypass the pending action.
    refit.screen.onHide(); refit.screen.onShow(ctx);
    assert.ok(refit.screen._pendingRefit);
    const sold = await drain();
    const saleReceipts = sold.events.filter(event => event.t === 'run:refitChanged');
    assert.equal(saleReceipts.length, 1);
    assert.equal(saleReceipts[0].p.action, 'sell');
    assert.equal(saleReceipts[0].p.ok, true);
    assert.equal(host.host.state.run.credits, beforeSale + saleReceipts[0].p.credits);
    assert.equal(main.run.credits, host.host.state.run.credits);
    assert.equal(refit.screen._pendingRefit, null);
    assert.match(refit.screen._note.textContent, /Sold .+ for \d+ cr\./);
    assert.equal(host.host.state.tick, pausedTick, 'all interactions complete without advancing combat');

    // A delayed old-DOM press after public Launch still traverses the real UI/main-lane
    // queue. One authoritative flight tick moves the owner out of the refit phases.
    const lateStrip = findButtons(refit.screen._rows).find(node => node.textContent === 'Strip');
    assert.ok(lateStrip);
    const launchGeneration = native.preparationGeneration();
    refit.screen.onHide();
    top = 'crucibleDraft';
    armory.screen.onShow(ctx);
    armory.screen._skip.click();
    await drain();
    laneSetMode(main, bus, 'flight');
    await drain();
    const advanced = await asWorker(() => {
      // The worker has no DOM. Hide the fixture's main document only during this synchronous
      // authoritative step, restoring it before main-lane refresh microtasks can execute.
      delete globalThis.document;
      try { return host.tick({ tick: host.host.state.tick + 1, steps: 1, commands: [] }); }
      finally { globalThis.document = doc; }
    });
    deliver(structuredClone({ kind: 'clockTick', ...advanced }));
    await drain();
    assert.equal(host.host.state.run.phase, 'wave_intro');
    assert.equal(native.preparationGeneration(), launchGeneration, 'Launch does not open a new draft generation');
    const loadoutBeforeLatePress = structuredClone(host.host.state.player.ownedShips);
    const inventoryBeforeLatePress = structuredClone(host.host.state.player.moduleInventory);
    lateStrip.click();
    const lateRequest = refit.screen._pendingRefit?.requestId;
    assert.ok(lateRequest, 'the old DOM handler queued a correlated transaction');
    const late = await drain();
    assert.equal(native.preparationGeneration(), launchGeneration);
    assert.equal(refit.screen._pendingRefit, null,
      'a phase-stale correlated request must settle without waiting for another generation');
    const lateReceipt = late.events.filter(event => event.t === 'run:refitChanged' && event.p?.requestId === lateRequest);
    assert.equal(lateReceipt.length, 1);
    assert.equal(lateReceipt[0].p.ok, false);
    assert.match(lateReceipt[0].p.reason, /refit.*closed/i);
    assert.deepEqual(host.host.state.player.ownedShips, loadoutBeforeLatePress);
    assert.deepEqual(host.host.state.player.moduleInventory, inventoryBeforeLatePress);
  } finally {
    for (const screen of screens) screen.dispose?.();
    lane?.close();
    host.shutdown();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
