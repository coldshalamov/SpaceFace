import test from 'node:test';
import assert from 'node:assert/strict';
import { generateContacts, getChoices, buildReply } from '../src/ui/station/barContacts.js';
import { LAST_POD } from '../src/data/encounters/1311-eris-last-pod.js';
import { CAL_DAY_S, CAL_WEEK_DAYS } from '../src/data/worldCalendar.js';

const stateAt = (time, until) => ({ simTime: time, story: { flags: { eris_choir_bar_silent_until: until } } });
test('the Eris wake lasts one calendar sector week', () => {
  assert.equal(LAST_POD.sectorWeekS, CAL_WEEK_DAYS * CAL_DAY_S);
});
test('only Margin Fence ambient patrons fall silent until the saved deadline', () => {
  const active = stateAt(100, 200);
  const rows = generateContacts('station_eris_margin', active);
  const ambient = rows.filter(row => row.id.startsWith('contact_station_eris_margin_'));
  assert.ok(ambient.length);
  for (const row of ambient) {
    assert.equal(row.erisChoirSilent, true);
    assert.equal(row.line, 'The room falls silent as you enter.');
    assert.deepEqual(getChoices(row.role, row), [{ id: 'eris_silence', label: 'Leave them in peace.' }]);
    assert.match(buildReply(row.role, 'eris_silence', {state: active}, 'station_eris_margin', row).text, /silent/i);
  }
  assert.ok(generateContacts('station_helios', active).every(row => !row.erisChoirSilent));
  assert.ok(generateContacts('station_eris_margin', stateAt(200, 200)).every(row => !row.erisChoirSilent));
});

import { special500Sommelier } from '../src/systems/special500Sommelier.js';
function busFixture() {
  const listeners = new Map(), events = [];
  return { events, on(n, f) { const a = listeners.get(n) || []; a.push(f); listeners.set(n, a); return () => {}; },
    emit(n, p) { events.push({ n, p }); for (const f of listeners.get(n) || []) f(p); } };
}
const command = (choiceId, visitId = null) => ({ canonicalKey: 'eris_choir_chair', stationId: 'station_eris_margin', choiceId, visitId, requestId: `eris:${visitId}:${choiceId}` });
test('the chair serves exactly once only after the economy accepts, across restore and true visits', () => {
  const state = { ...stateAt(100, 0), ui: { docked: true, dockedStationId: 'station_eris_margin' }, player: { credits: 20 } };
  state.story.flags.eris_choir_chair_claimed = 0;
  const bus = busFixture(), owner = Object.create(special500Sommelier); owner.init({ state, bus });
  bus.emit('ui:talkContact', command('bar_enter', 1));
  const first = state.story.flags.eris_choir_bar_service.visitId;
  bus.emit('ui:talkContact', command('bar_enter', 1));
  assert.equal(state.story.flags.eris_choir_bar_service.visitId, first);
  bus.emit('ui:talkContact', command('free_drink', first));
  assert.equal(state.story.flags.eris_choir_bar_service.served, false, 'no economy acceptance means no drink');
  assert.ok(bus.events.some(e => e.n === 'comms:log' && e.p.outcome === 'refused'));
  bus.on('economy:chargeCredits', p => { if (p.amount === 0 && p.commit()) p.result = true; });
  bus.emit('ui:talkContact', command('free_drink', first));
  bus.emit('ui:talkContact', command('free_drink', first));
  assert.equal(bus.events.filter(e => e.n === 'erisChoir:drinkReceipt' && e.p.outcome === 'settled').length, 1);
  const saved = JSON.parse(JSON.stringify(state.story.flags));
  const restored = { ...state, story: { flags: saved } }, bus2 = busFixture(), owner2 = Object.create(special500Sommelier);
  owner2.init({ state: restored, bus: bus2 });
  bus2.on('economy:chargeCredits', p => { if (p.commit()) p.result = true; });
  bus2.emit('ui:talkContact', command('bar_enter', first));
  bus2.emit('ui:talkContact', command('free_drink', first));
  assert.equal(bus2.events.filter(e => e.n === 'erisChoir:drinkReceipt' && e.p.outcome === 'settled').length, 0);
  bus2.emit('ui:talkContact', command('bar_leave', first));
  bus2.emit('ui:talkContact', command('bar_enter', first));
  assert.equal(restored.story.flags.eris_choir_bar_service.active, false, 'late entry is stale');
  bus2.emit('ui:talkContact', command('bar_enter', first + 1));
  const second = restored.story.flags.eris_choir_bar_service.visitId;
  assert.notEqual(second, first);
  bus2.emit('ui:talkContact', command('free_drink', first));
  bus2.emit('ui:talkContact', command('free_drink', second));
  assert.equal(bus2.events.filter(e => e.n === 'erisChoir:drinkReceipt' && e.p.outcome === 'settled').length, 1);
});

import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { applyDomainPathUpdate, createDomainMirroringProfile, DOMAIN_COLD_TICKS } from '../scripts/lib/simReadModel.mjs';
test('production sim host settles the serialized bar action through the actual economy and save owners', async () => {
  assert.ok(MAIN_TO_SIM_BUS_EVENTS.has('ui:talkContact'));
  const host = createSimHost();
  try {
    const init = await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
      scenarioContract: JSON.parse(readFileSync('src/data/scenarios/47a.scenario.json', 'utf8')) });
    const { state, registry } = host.host;
    state.ui.docked = true; state.ui.dockedStationId = 'station_eris_margin';
    state.story.flags.eris_choir_chair_claimed = 0; state.player.credits = 25;
    let tick = 0;
    const send = async payload => {
      const ring = createSimCommandRing();
      pushLaneCommand(ring, { kind: 'busEmit', emit: 'ui:talkContact', payload });
      return host.tick({ tick: ++tick, steps: 0, generation: 0,
        ackEnd: init.initRebuild?.end ?? 0, commands: structuredClone(ring.drain()) });
    };
    await send(command('bar_enter', 1));
    const visit = state.story.flags.eris_choir_bar_service.visitId;
    const reply = await send(command('free_drink', visit));
    assert.equal(state.story.flags.eris_choir_bar_service.served, true);
    assert.equal(state.player.credits, 25);
    assert.ok(reply.events.some(e => e.t === 'comms:log' && /free beer/.test(e.p.text)));
    const save = registry.get('save').serializeData();
    assert.deepEqual(save.missions.story.flags.eris_choir_bar_service, state.story.flags.eris_choir_bar_service);
    state.story.flags = {};
    registry.get('save')._restoreMissions(structuredClone(save.missions));
    assert.equal(state.story.flags.eris_choir_bar_service.served, true);
    await send(command('bar_enter', visit));
    const retry = await send(command('free_drink', visit));
    assert.ok(!retry.events.some(e => e.t === 'comms:log' && /free beer/.test(e.p.text)));
  } finally { host.shutdown(); }
});


import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { fakeDom } from './helpers/fake-dom.mjs';
test('mounted bar offers the chair and counts tab departure, but not refresh or a shell hide', async () => {
  const previous = { document: globalThis.document, window: globalThis.window, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  const doc = fakeDom(), make = doc.createElement;
  doc.createElement = tag => {
    const node = make(tag), bySelector = new Map();
    node.isConnected = true; node.hidden = false; node.offsetWidth = 10;
    node.style.getPropertyValue = () => ''; node.style.removeProperty = () => {};
    node.ownerDocument = doc; node.getBoundingClientRect = () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 });
    node.querySelector = sel => { if (!bySelector.has(sel)) bySelector.set(sel, doc.createElement('div')); return bySelector.get(sel); };
    node.replaceChildren = (...children) => { node.children = []; children.forEach(c => node.appendChild(c)); };
    node.removeChild = child => { node.children = node.children.filter(c => c !== child); child.parentNode = null; };
    node.remove = () => { if (node.parentNode) node.parentNode.removeChild(node); };
    node.scrollIntoView = () => {}; node.hasAttribute = key => key in node.attributes;
    return node;
  };
  doc.createElementNS = (_ns, tag) => doc.createElement(tag); doc.body = doc.createElement('body');
  doc.querySelector = () => null; doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  globalThis.document = doc; globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  const state = createGameState(4242), bus = createBus();
  state.ui.docked = true; state.ui.dockedStationId = 'station_eris_margin'; state.story.flags.eris_choir_chair_claimed = 0;
  const owner = Object.create(special500Sommelier); owner.init({ state, bus });
  let screen;
  try {
    screen = createBarScreen({ state, bus }); screen.onShow();
    const rail = screen.el.querySelector('.sx-bar__rail'), stage = screen.el.querySelector('.sx-bar__stage');
    assert.match(rail.innerHTML, /Choir Chair/); assert.match(stage.innerHTML, /Take your free drink/);
    const first = state.story.flags.eris_choir_bar_service.visitId;
    screen.onShow(); screen.refresh(); assert.equal(state.story.flags.eris_choir_bar_service.visitId, first);
    const button = doc.createElement('button'); button.setAttribute('data-choice', 'free_drink');
    const target = { closest: sel => sel === '[data-choice]' ? button : null };
    for (const fn of stage.listeners.click || []) fn({ target });
    assert.match(stage.innerHTML, /The barkeep cannot pour just now/);
    assert.equal(state.story.flags.eris_choir_bar_service.served, false);
    bus.on('economy:chargeCredits', p => { if (p.commit()) p.result = true; });
    for (const fn of stage.listeners.click || []) fn({ target });
    assert.equal(state.story.flags.eris_choir_bar_service.served, true);
    assert.match(stage.innerHTML, /Served this visit/);
    screen.onHide(); await Promise.resolve(); screen.onShow();
    assert.equal(state.story.flags.eris_choir_bar_service.visitId, first, 'shell hide is not a bar departure');
    screen.onHide(); screen.el.isConnected = false; await Promise.resolve();
    screen.el.isConnected = true; screen.onShow();
    assert.equal(state.story.flags.eris_choir_bar_service.visitId, first + 1);
    screen.dispose();
    // Main-thread story snapshots can lag the worker: preserve the typed local identity
    // across a quick visit and send commands in the same order as the real bridge.
    const main = createGameState(4242), sim = createGameState(4242), mainBus = createBus(), simBus = createBus(), queued = [];
    for (const s of [main, sim]) { s.ui.docked = true; s.ui.dockedStationId = 'station_eris_margin'; s.story.flags.eris_choir_chair_claimed = 0; }
    const simOwner = Object.create(special500Sommelier); simOwner.init({ state: sim, bus: simBus });
    simBus.on('economy:chargeCredits', p => { if (p.commit()) p.result = true; });
    const receipts = []; simBus.on('erisChoir:drinkReceipt', p => receipts.push(p));
    mainBus.on('ui:talkContact', p => queued.push(structuredClone(p)));
    screen = createBarScreen({ state: main, bus: mainBus }); screen.onShow();
    const lagStage = screen.el.querySelector('.sx-bar__stage');
    for (const fn of lagStage.listeners.click || []) fn({ target });
    screen.onHide(); screen.el.isConnected = false; await Promise.resolve();
    screen.el.isConnected = true; screen.onShow();
    for (const fn of lagStage.listeners.click || []) fn({ target });
    for (const payload of queued) simBus.emit('ui:talkContact', payload);
    assert.equal(sim.story.flags.eris_choir_bar_service.visitId, 2);
    assert.equal(receipts.filter(r => r.outcome === 'settled').length, 2);
    simOwner.destroy();

    // Real save envelope and an entirely new host/client: the restored service identity
    // must win even if the first UI snapshot has not yet carried it across the bridge.
    screen.dispose();
    const opts = { profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync('src/data/scenarios/47a.scenario.json', 'utf8')) };
    const uiWindow = globalThis.window;
    delete globalThis.window;
    const oldHost = createSimHost(); let envelope;
    try {
      await oldHost.init(opts);
      const old = oldHost.host, oldState = old.state;
      old.registry.get('world').enterSector('sector_eris_margin');
      const player = old.runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, pos: { x: 0, z: 0 }, fittings: [] }));
      oldState.playerId = player.id; oldState.mode = 'flight'; oldState.player.credits = 25;
      oldState.ui.docked = true; oldState.ui.dockedStationId = 'station_eris_margin';
      oldState.story.flags.eris_choir_chair_claimed = 1;
      old.bus.emit('ui:talkContact', command('bar_enter', 1));
      old.bus.emit('ui:talkContact', command('bar_leave', 1));
      old.bus.emit('ui:talkContact', command('bar_enter', 2));
      old.bus.emit('ui:talkContact', command('free_drink', 2));
      assert.equal(oldState.story.flags.eris_choir_bar_service.served, true);
      envelope = JSON.parse(JSON.stringify(old.registry.get('save').serialize('eris-chair-cold')));
    } finally { oldHost.shutdown(); }
    const freshHost = createSimHost();
    try {
      const init = await freshHost.init(opts), fresh = freshHost.host;
      assert.equal(fresh.registry.get('save').loadEnvelope(envelope), true);
      globalThis.window = uiWindow;
      const restoredState = fresh.state;
      assert.deepEqual(restoredState.story.flags.eris_choir_bar_service, { visitId: 2, active: true, served: true });
      // Continue restores in flight. Emulate the ordinary docked bar surface without
      // creating an undock event, so this remains the same saved service visit.
      restoredState.ui.docked = true; restoredState.ui.dockedStationId = 'station_eris_margin';
      const coldMain = createGameState(4242), coldBus = createBus(), pending = [];
      coldMain.ui.docked = true; coldMain.ui.dockedStationId = 'station_eris_margin';
      coldMain.story.flags.eris_choir_chair_claimed = 1;
      const domains = new Map(Object.entries(coldMain));
      coldBus.on('ui:talkContact', p => pending.push(structuredClone(p)));
      const charged = []; fresh.bus.on('economy:chargeCredits', p => charged.push(p));
      let seq = 0;
      const flush = async (applyStory = false) => {
        const ring = createSimCommandRing();
        for (const payload of pending.splice(0)) pushLaneCommand(ring, { kind: 'busEmit', emit: 'ui:talkContact', payload });
        delete globalThis.window;
        try {
          const reply = await freshHost.tick({ tick: ++seq, steps: 0, generation: 0, ackEnd: init.initRebuild?.end ?? 0,
            commands: structuredClone(ring.drain()) });
          if (applyStory) for (const update of reply.domainUpdates || []) {
            const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
            if (segs[0] !== 'story') continue;
            applyDomainPathUpdate(domains, { ...update, segs }, new Set());
            coldMain.story = domains.get('story');
          }
          for (const event of reply.events || []) coldBus.emit(event.t, event.p);
          return reply;
        } finally { globalThis.window = uiWindow; }
      };
      screen = createBarScreen({ state: coldMain, bus: coldBus }); screen.onShow(); await flush();
      assert.equal(restoredState.story.flags.eris_choir_bar_service.visitId, 2);
      coldMain.story.flags.eris_choir_bar_service = structuredClone(restoredState.story.flags.eris_choir_bar_service);
      const coldStage = screen.el.querySelector('.sx-bar__stage');
      for (const fn of coldStage.listeners.click || []) fn({ target });
      await flush();
      assert.equal(charged.length, 0, 'same-visit duplicate never reaches the economy');
      screen.onHide(); screen.el.isConnected = false; await Promise.resolve();
      screen.el.isConnected = true; screen.onShow();
      for (const fn of coldStage.listeners.click || []) fn({ target });
      await flush();
      assert.equal(restoredState.story.flags.eris_choir_bar_service.visitId, 3);
      assert.equal(restoredState.story.flags.eris_choir_bar_service.served, true);
      assert.equal(charged.length, 1); assert.equal(charged[0].amount, 0); assert.equal(charged[0].result, true);
      assert.match(coldStage.innerHTML, /Served this visit/);
      assert.match(coldStage.innerHTML, /data-choice="free_drink"[^>]*disabled/);
      assert.match(coldStage.innerHTML, /Your drink for this visit has been served/);
      for (let i = 0; i <= DOMAIN_COLD_TICKS && coldMain.story.flags.eris_choir_bar_service?.visitId !== 3; i++) await flush(true);
      assert.equal(coldMain.story.flags.eris_choir_bar_service.visitId, 3, 'worker domain diff reaches the main story mirror');
      assert.equal(coldMain.story.flags.eris_choir_bar_service.served, true);
      screen.refresh();
      assert.match(coldStage.innerHTML, /Served this visit/);
    } finally { freshHost.shutdown(); }
  } finally {
    screen?.dispose(); owner.destroy();
    globalThis.document = previous.document; globalThis.window = previous.window;
    globalThis.requestAnimationFrame = previous.raf; globalThis.cancelAnimationFrame = previous.caf;
  }
});
