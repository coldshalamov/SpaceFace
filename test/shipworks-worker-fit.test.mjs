import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { createShipStage } from '../src/ui/station/screens/shipworks.js';
import { fakeDom } from '../test/helpers/fake-dom.mjs';
import { makeShipEntitySpec, buildSlotList } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';
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



test('worker owned Fit waits for its exact owner result and keeps retries truthful', async () => {
  const host = createSimHost(), main = createGameState(4242), bus = createBus();
  const domains = new Map(Object.entries(main)); let seq = 0, stage;
  const apply = reply => {
    for (const update of reply.domainUpdates || []) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
      applyDomainPathUpdate(domains, { ...update, segs }, new Set());
      main[segs[0]] = domains.get(segs[0]);
    }
  };
  const tick = async (commands = []) => {
    const reply = structuredClone(await host.tick({ tick: ++seq, steps: 0, commands }));
    apply(reply); return reply;
  };
  const dispatch = reply => { for (const event of reply.events || []) bus.emit(event.t, event.p); };
  const globals = ['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'];
  const previous = new Map(globals.map(key => [key, globalThis[key]]));
  const timers = new Map(); let timerId = 0;
  try {
    apply(structuredClone(await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync('src/data/scenarios/47a.scenario.json', 'utf8')) })));
    const { state, registry, runtime } = host.host;
    state.mode = 'flight'; state.ui.docked = true; state.ui.dockedStationId = 'station_forge';
    registry.get('world').enterSector('sector_vesta_forge');
    const player = runtime.spawn({ ...makeShipEntitySpec('ship_kestrel'), isPlayer: true }); state.playerId = player.id;
    const hull = SHIPS.find(row => row.id === 'ship_kestrel'), slots = buildSlotList(hull);
    const slot = slots.findIndex(row => row.type === 'cargo');
    state.player.ownedShips = [{ defId: hull.id, fittings: Array(slots.length).fill(null), fittedInstances: {} }];
    state.player.activeShipIndex = 0; state.player.credits = 1234;
    state.player.moduleInventory = Array.from({ length: 600 }, (_, i) => ({ instanceId: `mi_existing_${i}`, defId: 'mod_hull_patch_kit_s' }));
    registry.get('ships').recomputeEntity(player.id, state.player.ownedShips[0].fittings);
    addCargo(state, 'cmdty_refined_metals', 3); addCargo(state, 'cmdty_silicate', 4);
    await tick();
    const build = createSimCommandRing(); build.pushRpc('build-net', 'craftingBuild', { bpId: 'bp_build_cargo_net_s', stationId: 'station_forge' });
    const built = await tick(build.drain()); assert.equal(built.rpcAcks[0].result.ok, true);
    const item = main.player.moduleInventory.find(row => row.defId === 'mod_cargo_net_s');
    assert.ok(item, 'the actual manufactured instance reaches the main reader');
    assert.equal(main.player.cargo.items.cmdty_refined_metals || 0, 0);
    assert.equal(main.player.cargo.items.cmdty_silicate || 0, 0);
    const baseCap = main.player.cargo.capVolume;
    const dom = shipworksDom(); globalThis.document = dom.doc;
    globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
    globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
    globalThis.setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };
    globalThis.clearTimeout = id => timers.delete(id);
    main.render = { renderer: { getContext: () => ({ isContextLost: () => true }) } };
    const ring = createSimCommandRing(), intents = [], cues = [], toasts = [];
    bus.on('ui:fitModule', payload => { intents.push(payload); if (MAIN_TO_SIM_BUS_EVENTS.has('ui:fitModule')) ring.pushBus({ emit: 'ui:fitModule', payload }); });
    bus.on('audio:cue', e => cues.push(e.id)); bus.on('toast', e => toasts.push(e.text));
    installSimCommandSink(() => {});
    stage = createShipStage({ state: main, bus, screenMemory: { read: (_s, key, fallback) => ({ mode: 'fleet' })[key] ?? fallback, set() {} } });
    stage.onShow();
    const slotfield = dom.regions.get('.sx-sw__slotfield'), chooser = dom.regions.get('.sx-sw__chooser');
    const anchor = { getAttribute: key => key === 'data-spatial-slot' ? String(slot) : null, closest: sel => sel === '[data-spatial-slot]' ? anchor : null };
    const open = async () => { await slotfield.fire(anchor); assert.match(chooser.innerHTML, /In your hold/); };
    const button = () => {
      const b = { disabled: false, getAttribute: key => key === 'data-fit-inv' ? item.instanceId : key === 'data-fit-inv-slot' ? String(slot) : null };
      b.closest = sel => sel === '[data-fit-inv]' ? b : null; return b;
    };
    await open(); cues.length = 0;
    const fit = button(), pending = chooser.fire(fit);
    assert.equal(fit.disabled, true, 'Fit stays pending until its owner responds');
    assert.equal(intents.length, 1); assert.ok(intents[0].operationId);
    const duplicate = chooser.fire(button()); await duplicate;
    assert.equal(intents.length, 1, 'duplicate activation is ignored');
    bus.emit('module:equipped', { operationId: 'other', slotIndex: slot, instanceId: item.instanceId });
    bus.emit('module:equipped', { operationId: intents[0].operationId, slotIndex: slot, instanceId: 'mi_other' });
    assert.ok(stage.el.classList.contains('is-choosing')); assert.equal(cues.includes('sfx_ui_switch_detent'), false);
    const accepted = await tick(ring.drain());
    assert.equal(main.player.ownedShips[0].fittedInstances[slot].instanceId, item.instanceId);
    assert.equal(main.player.cargo.capVolume, baseCap + 20);
    assert.equal(main.player.moduleInventory.some(row => row.instanceId === item.instanceId), false);
    assert.equal(main.player.credits, 1234);
    assert.ok(accepted.events.some(e => e.t === 'module:equipped' && e.p.operationId === intents[0].operationId && e.p.instanceId === item.instanceId));
    assert.equal(cues.includes('sfx_ui_switch_detent'), false, 'main data alone does not close before owner event');
    dispatch(accepted); await pending;
    assert.equal(stage.el.classList.contains('is-choosing'), false); assert.ok(cues.includes('sfx_ui_switch_detent'));

    // Put the same instance back through the actual owner, then deliberately make the main chooser stale.
    registry.get('ships').unfitModule({ shipIndex: 0, slotIndex: slot }); await tick();
    await open(); cues.length = 0;
    state.player.moduleInventory = state.player.moduleInventory.filter(row => row.instanceId !== item.instanceId);
    const stale = button(), refusedClick = chooser.fire(stale), refusal = await tick(ring.drain());
    assert.equal(cues.includes('sfx_ui_switch_detent'), false);
    assert.ok(refusal.events.some(e => e.t === 'module:fitRefused' && e.p.reason === 'missing_module' && e.p.operationId === intents[1].operationId));
    dispatch(refusal); await refusedClick;
    assert.ok(stage.el.classList.contains('is-choosing')); assert.equal(stale.disabled, false);
    assert.ok(cues.includes('ui_deny')); assert.ok(toasts.some(text => /fit/i.test(text)));
    assert.equal(state.player.ownedShips[0].fittings[slot], null); assert.equal(state.player.credits, 1234);

    state.ui.docked = false; cues.length = 0;
    const berthClick = chooser.fire(button()), noBerth = await tick(ring.drain());
    assert.ok(noBerth.events.some(e => e.t === 'module:fitRefused'
      && e.p.reason === 'station_unavailable' && e.p.operationId === intents.at(-1).operationId));
    dispatch(noBerth); await berthClick;
    assert.ok(stage.el.classList.contains('is-choosing')); assert.equal(cues.includes('sfx_ui_switch_detent'), false);
    state.ui.docked = true; await tick();

    // A chooser change cancels listeners and timer; a late receipt cannot close the new chooser.
    const cancelled = chooser.fire(button()); const cancelledCommands = ring.drain();
    const cancelledId = intents.at(-1).operationId;
    await slotfield.fire(anchor); await cancelled;
    assert.equal([...timers.values()].filter(t => t.ms === 5000).length, 0);
    bus.emit('module:equipped', { operationId: cancelledId, slotIndex: slot, instanceId: item.instanceId });
    assert.ok(stage.el.classList.contains('is-choosing'));
    assert.equal(cancelledCommands.length, 1);

    // A missing reply is neither success nor refusal and leaves the chooser available.
    cues.length = 0; const timeoutButton = button(), timed = chooser.fire(timeoutButton); ring.drain();
    const timedId = intents.at(-1).operationId;
    const deadline = [...timers.entries()].find(([, t]) => t.ms === 5000); assert.ok(deadline);
    timers.delete(deadline[0]); deadline[1].fn(); await timed;
    assert.ok(stage.el.classList.contains('is-choosing')); assert.equal(timeoutButton.disabled, false);
    assert.equal(cues.includes('sfx_ui_switch_detent'), false); assert.equal(cues.includes('ui_deny'), false);
    assert.ok(toasts.some(text => /confirm/i.test(text)));
    const hiddenButton = button(), duringHide = chooser.fire(hiddenButton); ring.drain(); stage.onHide(); await duringHide;
    assert.equal(hiddenButton.disabled, false, 'a hidden and later reopened chooser is not stranded');
    assert.equal([...timers.values()].filter(t => t.ms === 5000).length, 0);
    stage.onShow(); await open();
    const disposingButton = button(), duringDispose = chooser.fire(disposingButton); ring.drain();
    bus.emit('module:equipped', { operationId: timedId, slotIndex: slot, instanceId: item.instanceId });
    assert.equal(disposingButton.disabled, true, 'a late timeout reply cannot settle a new attempt');
    stage.dispose(); await duringDispose; stage = null;
    assert.equal(disposingButton.disabled, false);
    assert.equal([...timers.values()].filter(t => t.ms === 5000).length, 0);
  } finally {
    uninstallSimCommandSink(); stage?.dispose();
    for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
    host.shutdown();
  }
});
