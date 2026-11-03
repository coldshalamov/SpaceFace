import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, createDomainMirroringProfile, DOMAIN_COLD_BYTES, DOMAIN_COLD_TICKS } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { createLaneSystemFacade } from '../src/runtime/laneSystemFacades.js';
import { createIndustryScreen, industryReadiness, industryOwnedFitting } from '../src/ui/station/screens/industry.js';
import { fakeDom } from './helpers/fake-dom.mjs';
import { addCargo } from '../src/systems/cargo.js';
import { makeShipEntitySpec, buildSlotList } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { BLUEPRINT_BY_ID } from '../src/data/blueprints.js';
import { SECTORS } from '../src/data/sectors.js';

test('instant fabrication reaches a cold worker inventory and fits at the same berth', async () => {
  const oldDocument = globalThis.document;
  const oldRaf = globalThis.requestAnimationFrame;
  const oldPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  const oldTimeout = globalThis.setTimeout;
  const host = createSimHost();
  const main = createGameState(4242);
  const bus = createBus();
  const domains = new Map(Object.entries(main));
  let serial = 0;
  let screen;
  const apply = (reply) => {
    for (const update of reply.domainUpdates || []) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.')
        ? update.segs[0].split('.') : update.segs;
      applyDomainPathUpdate(domains, { ...update, segs }, new Set());
      main[segs[0]] = domains.get(segs[0]);
    }
    for (const event of reply.events || []) bus.emit(event.t, event.p);
  };
  const tick = async (commands = []) => {
    const reply = structuredClone(await host.tick({ tick: ++serial, steps: 0, commands }));
    apply(reply);
    return reply;
  };
  try {
    const init = await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    apply(structuredClone(init));
    const { state, registry, runtime } = host.host;
    state.mode = 'flight';
    registry.get('world').enterSector('sector_vesta_forge');
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_forge';
    const player = runtime.spawn({ ...makeShipEntitySpec('ship_kestrel'), isPlayer: true });
    state.playerId = player.id;
    const hull = SHIPS.find((item) => item.id === 'ship_kestrel');
    const slots = buildSlotList(hull);
    state.player.ownedShips = [{ defId: hull.id, fittings: Array(slots.length).fill(null) }];
    state.player.activeShipIndex = 0;
    state.player.moduleInventory = Array.from({ length: 600 }, (_, i) => ({
      instanceId: `mi_existing_${i}`, defId: 'mod_hull_patch_kit_s',
    }));
    state.player.researchedNodes = [];
    state.player.credits = 0;
    registry.get('ships').recomputeEntity(player.id, state.player.ownedShips[0].fittings);
    addCargo(state, 'cmdty_refined_metals', 3);
    addCargo(state, 'cmdty_silicate', 4);
    await tick();
    const inventory = host.host.domainDiffer.paths.get('player.moduleInventory');
    assert.ok(inventory.bytes > DOMAIN_COLD_BYTES, 'inventory exercises the production cold tier');
    while ((inventory.slot - host.host.domainDiffSeq + DOMAIN_COLD_TICKS) % DOMAIN_COLD_TICKS < 10) await tick();
    const station = SECTORS.flatMap((sector) => sector.stations || []).find((row) => row.id === 'station_forge');
    const blueprint = BLUEPRINT_BY_ID.get('bp_build_cargo_net_s');
    assert.equal(industryReadiness(blueprint, main, station).state, 'ready');

    let pending;
    installSimCommandSink((descriptor) => new Promise((resolve) => { pending = { descriptor, resolve }; }));
    const crafting = createLaneSystemFacade({ state: main, bus })('crafting');
    // Mount the real screen and activate its actual Fabricate handler. The chain artwork is
    // omitted by this tiny DOM; the selection, disabled state, hold and RPC are production code.
    const doc = fakeDom();
    doc.documentElement = doc._make('html');
    doc.documentElement.classList.add('sf-reduce-motion');
    const root = doc._make('div'), list = doc._make('div'), stage = doc._make('div');
    const marker = doc._make('i'), key = doc._make('button'), ringEl = doc._make('span');
    root.querySelector = (s) => s === '.sx-ind__list' ? list : s === '.sx-ind__stage' ? stage : null;
    list.querySelector = (s) => s === ':scope > .orr-extent' ? marker : null;
    key.querySelector = (s) => s === '.dp-holdring' ? ringEl : null;
    key.closest = (s) => s.includes('.sx-fab-build') || s === '[data-build]' ? key : null;
    stage.querySelector = (s) => s.startsWith('.sx-fab-build') && !key.disabled ? key : null;
    let stageHtml = '';
    Object.defineProperty(stage, 'innerHTML', { set(html) {
      stageHtml = html;
      const button = html.match(/<button[^>]+data-build="([^"]+)"[^>]*>/);
      key.disabled = !button || /\sdisabled(?:\s|>)/.test(button[0]);
      if (button) key.setAttribute('data-build', button[1]);
    } });
    doc.createElement = () => root;
    globalThis.document = doc;
    globalThis.requestAnimationFrame = undefined;
    let landing;
    globalThis.setTimeout = (fn, ms, ...args) => ms === 240 ? (landing = fn, 1) : oldTimeout(fn, ms, ...args);
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 10000 } });
    const cues = [];
    bus.on('audio:cue', (event) => cues.push(event.id));
    screen = createIndustryScreen({ state: main, bus, crafting, station });
    screen.onShow();
    for (const listener of list.listeners.click || []) {
      listener({ target: { closest: (s) => s === '[data-bp]' ? { getAttribute: () => blueprint.id } : null } });
    }
    assert.match(stageHtml, /data-build="bp_build_cargo_net_s"/);
    assert.equal(key.disabled, false);
    for (const listener of stage.listeners.click || []) listener({ target: key });
    assert.ok(pending, 'the real screen requests the worker build');
    assert.equal(cues.includes('ui_accept'), false, 'no accept cue before the worker replies');
    const command = createSimCommandRing();
    command.pushRpc(pending.descriptor.id, pending.descriptor.op, pending.descriptor.args);
    const committed = await tick(command.drain());
    pending.resolve(committed.rpcAcks[0]);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(cues.includes('ui_accept'), true);
    assert.equal(state.player.cargo.items.cmdty_refined_metals || 0, 0);
    assert.equal(state.player.cargo.items.cmdty_silicate || 0, 0);
    assert.ok(main.crafting?.queues?.station_forge == null, 'instant build leaves no queue');
    const item = main.player.moduleInventory.find((row) => row.defId === blueprint.outputs.id);
    assert.ok(item, 'the actual fitting accompanies the acknowledgement despite cold cadence');
    assert.equal(industryOwnedFitting(blueprint, main, station), true);
    assert.ok(landing);
    landing();
    assert.match(stageHtml, /Fit owned in Shipworks/);

    const slot = slots.findIndex((row) => row.type === 'cargo');
    const fit = createSimCommandRing();
    fit.pushBus({ emit: 'ui:fitModule', payload: { shipIndex: 0, slotIndex: slot, instanceId: item.instanceId } });
    await tick(fit.drain());
    assert.equal(state.player.ownedShips[0].fittings[slot], blueprint.outputs.id);
    assert.equal(main.player.ownedShips[0].fittings[slot], blueprint.outputs.id);
    assert.equal(main.player.cargo.capVolume, 270);
    assert.equal(main.player.moduleInventory.some((row) => row.instanceId === item.instanceId), false);
    const lastSign = inventory.lastSign;
    await tick();
    assert.equal(inventory.lastSign, lastSign, 'ordinary cold cadence resumes after the owner events');
  } finally {
    screen?.dispose();
    uninstallSimCommandSink();
    host.shutdown();
    globalThis.document = oldDocument;
    globalThis.requestAnimationFrame = oldRaf;
    globalThis.setTimeout = oldTimeout;
    if (oldPerformance) Object.defineProperty(globalThis, 'performance', oldPerformance);
  }
});
