import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMAIN_COLD_TICKS } from '../scripts/lib/simReadModel.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneCommandSink, installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { automationScreen } from '../src/ui/screens/automationPanel.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { fakeDom } from './helpers/fake-dom.mjs';

test('panel Mine drives a real worker wingman and survives save; Recall interrupts', async () => {
  const oldDocument = globalThis.document;
  const host = createSimHost(), main = createGameState(4242), bus = createBus();
  let lane, deliver, commandsDone = Promise.resolve(), serial = 0, screen;
  const asWorker = async (fn) => {
    const sink = laneCommandSink(); uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); }
  };
  const drain = async () => { for (;;) { const p = commandsDone; await p; if (p === commandsDone) return; } };
  const tick = async (steps = 0) => {
    await drain();
    const reply = await asWorker(() => host.tick({ kind: 'tick', tick: ++serial, steps, commands: [] }));
    deliver(structuredClone({ kind: 'clockTick', ...reply })); await drain();
  };
  try {
    const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
    lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers: {},
      flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
      channelFactory: () => ({ onMessage(fn) { deliver = fn; }, terminate() {}, post(message) {
        if (message.kind === 'init') asWorker(() => host.init({ ...structuredClone(message), profile: 'production', seed: 4242, scenarioContract: contract }))
          .then((reply) => deliver(structuredClone({ kind: 'ready', seq: message.seq, ...reply })))
          .catch((error) => deliver({ kind: 'error', seq: message.seq, message: String(error) }));
        if (message.kind === 'clockCommand') commandsDone = commandsDone.then(async () => {
          const reply = await asWorker(() => host.tick({ ...structuredClone(message), kind: 'tick' }));
          deliver(structuredClone({ kind: 'clockTick', ...reply, commandSequence: message.commandSequence }));
        });
      } }),
    });
    await lane.readyPromise;
    const state = host.host.state, owner = host.host.registry.get('automation');
    state.mode = 'flight';
    const playerEntity = host.host.runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player, pos: { x: 0, z: 0 }, fittings: [] }));
    state.playerId = playerEntity.id;
    host.host.registry.get('world').enterSector('sector_helios_prime');
    // Configured progressed-state fixture: an owned spare hull, assigned through its real owner.
    state.player.ownedShips = [{ defId: 'ship_kestrel' }, { defId: 'ship_kestrel', customName: 'Prospector' }];
    state.player.activeShipIndex = 0;
    assert.equal(owner.assignFleet(1), true);
    host.host.registry.get('wingmen')._spawnWingmen();
    const fs = state.automation.fleet[0], ship = state.entities.get(fs._liveId);
    assert.ok(ship, 'the owned wingman is deployed');
    const player = state.entities.get(state.playerId);
    const rock = state.entityList.find((e) => e.type === 'asteroid' && e.alive && !e.data?.siteAnchored && !e.data?.opticStructureId && !e.data?.isChunk && (e.data?.oreHP == null || e.data.oreHP > 0));
    assert.ok(rock, 'progressed fixture has a mineable rock');
    rock.pos.x = ship.pos.x; rock.pos.z = ship.pos.z;
    state.player.targetId = rock.id;
    for (let i = 0; i <= DOMAIN_COLD_TICKS && !main.automation?.fleet?.length; i++) await tick();
    const doc = fakeDom(); doc.createDocumentFragment = () => doc._make('fragment'); globalThis.document = doc;
    const root = doc._make('div'), body = doc._make('div'), tabs = doc._make('div');
    root.querySelector = (s) => s === '[data-body]' ? body : s === '[data-tabs]' ? tabs : null;
    body.replaceChildren = (...nodes) => { body.children = nodes; };
    screen = Object.create(automationScreen); screen._tab = 'fleet';
    screen.mount(root, { state: main, bus });
    screen.refresh();
    const render = () => body.children.flatMap((fragment) => fragment.children).map((n) => n.innerHTML).join('\n');
    assert.match(render(), /data-act="orderMine"/);
    const click = (act) => { const control = { dataset: { act, ref: String(fs.id), kind: 'fleet' } }; for (const fn of body.listeners.click || []) fn({ target: { closest: () => control } }); };
    click('orderMine'); await drain();
    assert.equal(fs.order, 'mine', 'the production automation owner accepts Mine');
    await asWorker(() => host.host.registry.get('wingmen').update(1 / 60, state));
    assert.equal(ship.data.wingmanMining, rock.id, 'the live wingman cuts the marked rock');
    const saved = structuredClone(owner.serialize());
    assert.equal(saved.fleet[0].id, fs.id);
    assert.equal(saved.fleet[0].order, 'mine', 'the saved job remains Mine');
    host.host.registry.get('wingmen')._despawnWingmen();
    owner.deserialize(saved);
    assert.equal(state.automation.fleet[0].id, fs.id);
    assert.equal(state.automation.fleet[0].order, 'mine', 'the same wingman retains the mining job after load');
    assert.match(render(), /order mine/, 'the panel displays the authoritative order');
    // The newly restored row is deployed again on sector entry.
    host.host.registry.get('wingmen')._spawnWingmen(); await tick();
    click('orderRecall'); await drain();
    const recalled = state.automation.fleet[0];
    assert.equal(recalled.order, 'idle');
    await asWorker(() => host.host.registry.get('wingmen').update(1 / 60, state));
    assert.equal(state.entities.get(recalled._liveId).data.wingmanMining, null, 'Recall stops the cut');
    assert.match(render(), /order regroup/, 'the panel displays the actual recalled order');
  } finally { screen?.dispose(); lane?.close(); host.shutdown(); globalThis.document = oldDocument; }
});

