import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { createShipStage } from '../src/ui/station/screens/shipworks.js';
import { fakeDom } from './helpers/fake-dom.mjs';
import { makeShipEntitySpec, buildSlotList } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { postImpoundListing, impoundLotBoard } from '../src/systems/impoundLot.js';
function shipworksDom() {
  const doc = fakeDom();
  const make = doc.createElement;
  const regions = new Map();
  doc.createElement = (tag) => {
    const node = make(tag);
    node.ownerDocument = doc;
    node.hidden = true;
    node.style.removeProperty = (key) => { delete node.style[key]; };
    node.hasAttribute = (key) => node.getAttribute(key) !== null;
    node.removeEventListener = () => {};
    node.remove = () => {};
    node.prepend = (...children) => children.forEach((child) => node.appendChild(child));
    node.insertBefore = (child) => node.appendChild(child);
    node.after = () => {}; node.before = () => {};
    node.replaceChildren = (...children) => { node.children.length = 0; children.forEach((child) => node.appendChild(child)); };
    node.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
    node.getContext = () => null;
    node.contains = (child) => child?.parentNode === node;
    node.querySelector = (selector) => {
      if (node.className === 'sx-sw-lot-dialog') {
        node.dialogParts ||= new Map();
        if (!node.dialogParts.has(selector)) node.dialogParts.set(selector, doc.createElement('div'));
        return node.dialogParts.get(selector);
      }
      if (node.className.split(/\s+/).includes('sx-sw')) {
        if (!regions.has(selector)) regions.set(selector, doc.createElement('div'));
        return regions.get(selector);
      }
      if (/^\[data-gauge-(?:value|ghost)\]$/.test(selector)) {
        node.gaugeNodes ||= new Map();
        if (!node.gaugeNodes.has(selector)) node.gaugeNodes.set(selector, doc.createElement('span'));
        return node.gaugeNodes.get(selector);
      }
      const attr = selector.match(/^\[(data-(?:buyship|buy|mode))(?:="([^"]*)")?\]$/);
      if (!attr) return null;
      const button = [...node.innerHTML.matchAll(/<button\b[^>]*>/g)]
        .find(([html]) => html.includes(`${attr[1]}="${attr[2] || ''}`));
      if (!button) return null;
      const control = doc.createElement('button');
      for (const [, key, value] of button[0].matchAll(/([\w-]+)="([^"]*)"/g)) control.setAttribute(key, value);
      control.disabled = /\sdisabled(?:\s|>)/.test(button[0]);
      control.parentNode = node;
      control.closest = (sel) => sel === `[${attr[1]}]` ? control : null;
      return control;
    };
    node.fire = async (target) => {
      for (const handler of node.listeners.click || []) await handler({ target, preventDefault() {}, stopPropagation() {} });
    };
    return node;
  };
  doc.createComment = () => doc.createElement('comment');
  doc.createElementNS = (_ns, tag) => doc.createElement(tag);
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  return { doc, regions };
}



test('paid lot desk waits for its worker answer and publishes the book before repaint', async () => {
  const host = createSimHost(), main = createGameState(4242), bus = createBus();
  const domains = new Map(Object.entries(main)); let seq = 0; let stage;
  const apply = reply => { for (const u of reply.domainUpdates || []) {
    const segs = u.segs.length === 1 && u.segs[0].includes('.') ? u.segs[0].split('.') : u.segs;
    applyDomainPathUpdate(domains, { ...u, segs }, new Set()); main[segs[0]] = domains.get(segs[0]);
  }};
  const tick = async (commands = []) => { const r = structuredClone(await host.tick({ tick: ++seq, steps: 0, commands })); apply(r); return r; };
  const globals = ['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'];
  const previous = new Map(globals.map(k => [k, globalThis[k]]));
  try {
    apply(structuredClone(await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync('src/data/scenarios/47a.scenario.json', 'utf8')) })));
    const { state, bus: workerBus, registry, runtime } = host.host;
    state.mode = 'flight'; state.world.currentSectorId = 'sector_helios_prime'; state.player.credits = 100000;
    state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
    const player = runtime.spawn({ ...makeShipEntitySpec('ship_kestrel'), isPlayer: true }); state.playerId = player.id;
    const hull = SHIPS.find(s => s.id === 'ship_kestrel');
    state.player.ownedShips = [{ defId: hull.id, fittings: Array(buildSlotList(hull).length).fill(null) }];
    state.player.activeShipIndex = 0;
    const entity = { id: 700, alive: true, type: 'ship', factionId: 'faction_reach',
      data: { defId: 'ship_wasp', callsign: 'Marrow', sectorId: 'sector_helios_prime' } };
    const listing = postImpoundListing(state, workerBus, { entity, entry: { lossId: 'loss_dv5',
      sectorId: 'sector_helios_prime', factionId: 'faction_reach', victimCallsign: 'Marrow', killedByPlayer: true, killerId: player.id } });
    assert.ok(listing); state.ui.dockedStationId = listing.stationId;
    await tick();
    assert.equal(impoundLotBoard(main).tip, false);
    const dom = shipworksDom(); globalThis.document = dom.doc;
    globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
    globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
    globalThis.setTimeout = () => 1; globalThis.clearTimeout = () => {};
    main.render = { renderer: { getContext: () => ({ isContextLost: () => true }) } };
    const ring = createSimCommandRing(), cues = [];
    assert.ok(MAIN_TO_SIM_BUS_EVENTS.has('impoundLot:deskIntent'));
    bus.on('impoundLot:deskIntent', payload => ring.pushBus({ emit: 'impoundLot:deskIntent', payload }));
    bus.on('audio:cue', p => cues.push(p.id));
    let savedView = { mode: 'fleet' };
    stage = createShipStage({ state: main, bus, screenMemory: {
      read: (_s, key, fallback) => savedView[key] ?? fallback,
      set: (_s, value) => { savedView = { ...value }; },
    } });
    stage.onShow();
    const side = dom.regions.get('.sx-sw__side'), segment = dom.regions.get('.sx-seg'), rail = dom.regions.get('.sx-sw__list');
    const buyMode = { getAttribute: k => k === 'data-mode' ? 'buy' : null };
    buyMode.closest = s => s === '[data-mode]' ? buyMode : null;
    await segment.fire(buyMode);
    const used = { parentNode: rail, getAttribute: k => k === 'data-buy' ? 'ship_wasp' : null };
    used.closest = s => s === '[data-fleet], [data-buy]' ? used : null;
    await rail.fire(used);
    assert.match(side.innerHTML, /Buy the tip/);
    const tip = { disabled: false, setAttribute() {}, getAttribute: k => k === 'data-lot-verb' ? 'tip' : null };
    tip.closest = s => s === '[data-lot-verb]' ? tip : null;
    await side.fire(tip);
    const commands = ring.drain();
    assert.equal(commands.length, 1);
    assert.equal(tip.disabled, true);
    assert.equal(cues.includes('ui_accept'), false, 'no success sound before the desk answers');
    stage.onHide();
    stage.onShow();
    assert.match(side.innerHTML, /data-lot-verb="tip" disabled/, 'reopening keeps the pending desk disabled');
    const reopenedTip = { disabled: false, setAttribute() {}, getAttribute: k => k === 'data-lot-verb' ? 'tip' : null };
    reopenedTip.closest = s => s === '[data-lot-verb]' ? reopenedTip : null;
    await side.fire(reopenedTip);
    assert.equal(ring.drain().length, 0, 'covering and reopening cannot submit the outstanding action twice');
    const reply = await tick(commands);
    const answer = reply.events.find(e => e.t === 'impoundLot:deskAnswered');
    assert.equal(answer.p.operationId, commands[0].p.payload.operationId);
    assert.equal(answer.p.ok, true);
    assert.equal(state.player.credits, 99832);
    assert.equal(main.player.credits, 99832);
    assert.equal(impoundLotBoard(main).tip, true, 'the main book is current in the answer reply');
    for (const e of reply.events || []) bus.emit(e.t, e.p);
    assert.match(side.innerHTML, /Tip bought/);
    assert.ok(cues.includes('ui_accept'));
    // A quote can become stale while the player is looking at it. The worker's
    // wallet wins, and its refusal must not play a success sound or charge a fee.
    state.player.credits = 0;
    const hold = { disabled: false, setAttribute() {}, getAttribute: k => k === 'data-lot-verb' ? 'hold' : null };
    hold.closest = s => s === '[data-lot-verb]' ? hold : null;
    await side.fire(hold);
    const refused = await tick(ring.drain());
    assert.ok(refused.events.some(e => e.t === 'impoundLot:deskAnswered' && !e.p.ok && e.p.reason === 'thin_wallet'));
    assert.ok(refused.events.some(e => e.t === 'toast' && /Not enough credits/.test(e.p.text)));
    assert.equal(state.player.credits, 0);
    assert.equal(state.lossLedger.impound.hold, null);
    for (const e of refused.events || []) bus.emit(e.t, e.p);
    assert.ok(cues.includes('ui_deny'));

    // The same desk answers the active hull's papers offer, whose authority is
    // the owned-ship record rather than the lot book.
    state.player.ownedShips[0].impoundShadow = { lossId: 'loss_papers', priorCallsign: 'Marrow',
      liveId: null, resolved: null, nextAt: null,
      ransom: { state: 'offered', amount: 500, offerDay: 0, untilDay: 5,
        stationId: listing.stationId, claimant: 'the former crew' } };
    for (let i = 0; i < 120 && !impoundLotBoard(main).ransom; i++) await tick();
    assert.equal(impoundLotBoard(main).ransom?.state, 'offered');
    const fleetMode = { getAttribute: k => k === 'data-mode' ? 'fleet' : null };
    fleetMode.closest = s => s === '[data-mode]' ? fleetMode : null;
    await segment.fire(fleetMode);
    assert.match(side.innerHTML, /Sell the papers/);
    const papers = { disabled: false, setAttribute() {}, getAttribute: k => k === 'data-lot-verb' ? 'acceptRansom' : null };
    papers.closest = s => s === '[data-lot-verb]' ? papers : null;
    await side.fire(papers);
    const paperReply = await tick(ring.drain());
    assert.ok(paperReply.events.some(e => e.t === 'impoundLot:deskAnswered' && e.p.verb === 'acceptRansom' && e.p.ok));
    assert.equal(state.player.credits, 500);
    assert.equal(main.player.ownedShips[0].impoundShadow.ransom.state, 'paid', 'the answer publishes the actual papers owner');
    for (const e of paperReply.events || []) bus.emit(e.t, e.p);
    assert.doesNotMatch(side.innerHTML, /Sell the papers/);
    const saved = registry.get('save').serializeData();
    // A real worker has no DOM. Keep this facade-only test's fake document out of
    // the native restore, which otherwise mounts unrelated main-realm postcards.
    globalThis.document = previous.get('document');
    registry.get('save')._restore(structuredClone(saved), 'quick');
    assert.equal(state.lossLedger.impound.tip, true, 'the purchased information survives Continue');
    assert.equal(state.player.credits, 500);
    assert.equal(state.player.ownedShips[0].impoundShadow.ransom.state, 'paid');
  } finally {
    stage?.dispose(); for (const [k, v] of previous) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
    host.shutdown();
  }
});
