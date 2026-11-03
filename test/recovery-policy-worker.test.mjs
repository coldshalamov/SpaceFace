import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneCommandSink, installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { gameOverScreen } from '../src/ui/screens/gameOver.js';
import { fakeDom } from './helpers/fake-dom.mjs';

test('progressed Adventure fixture: recovery with no cargo claim ends the trip policy across save/restore', async () => {
  const oldDocument = globalThis.document;
  const host = createSimHost(), main = createGameState(4242), bus = createBus();
  let lane, deliver, pending = Promise.resolve(), serial = 0;
  const asWorker = async (fn) => {
    const sink = laneCommandSink(); uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); }
  };
  const drain = async () => { for (;;) { const p = pending; await p; if (p === pending) return; } };
  const tick = async () => {
    await drain();
    const reply = await asWorker(() => host.tick({ kind: 'tick', tick: ++serial, steps: 0, commands: [] }));
    deliver(structuredClone({ kind: 'clockTick', ...reply }));
    await drain();
  };
  try {
    const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
    lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers: {}, flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
      channelFactory: () => ({ onMessage(fn) { deliver = fn; }, terminate() {}, post(message) {
        if (message.kind === 'init') asWorker(() => host.init({ ...structuredClone(message), profile: 'production', seed: 4242, scenarioContract }))
          .then((reply) => deliver(structuredClone({ kind: 'ready', seq: message.seq, ...reply })))
          .catch((e) => deliver({ kind: 'error', seq: message.seq, message: String(e) }));
        if (message.kind === 'clockCommand') pending = pending.then(async () => {
          const reply = await asWorker(() => host.tick({ ...structuredClone(message), kind: 'tick' }));
          deliver(structuredClone({ kind: 'clockTick', ...reply, commandSequence: message.commandSequence }));
        });
      } }),
    });
    await lane.readyPromise;
    const { state, runtime, registry } = host.host;
    state.mode = 'flight';
    registry.get('world').enterSector('sector_helios_prime');
    const player = runtime.spawn({ ...makeShipEntitySpec('ship_kestrel'), isPlayer: true });
    state.playerId = player.id;
    // Explicit progressed fixture: a paid policy from an earlier legal manifest, one remaining ore.
    // Half of one rounds down to zero, so this wreck has no payable cargo claim.
    state.player.credits = 5000;
    state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
    state.player.activeShipIndex = 0;
    state.player.insurance = { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' };
    state.player.cargo.items = { cmdty_ore_iron: 1 };
    state.player.cargoPolicy = { coverFrac: 0.7, coverCr: 1000, premiumCr: 100 };
    registry.get('combat').kill(player, null, { origin: { kind: 'environmental' }, result: { dominantLayer: 'hull' } });
    assert.equal(state.combat.lastPlayerDefeat.recovery.cargoPayoutCr, 0);
    for (let i = 0; i < 65 && !main.player.cargoPolicy; i++) await tick();
    assert.ok(main.player.cargoPolicy, 'the read model starts with the live policy');
    globalThis.document = fakeDom();
    const screen = Object.create(gameOverScreen);
    const manager = { top: () => 'gameOver', popScreen() {}, closeAll() {} };
    const ctx = { state: main, bus, screenManager: manager, telemetry: { getSessionStats: () => ({ deathLog: [] }) } };
    screen.mount(document._make('div'), ctx);
    screen.onShow(ctx);
    screen._retryButton.click();
    await drain();
    assert.equal(player.alive, true, 'production recovery restores the player');
    assert.equal(state.player.cargo.items.cmdty_ore_iron, 1);
    assert.equal(state.player.credits, 4500, 'the recovery charge applies once');
    assert.equal(state.player.cargoPolicy, undefined, 'recovery ends the trip policy even without a payout');
    for (let i = 0; i < 65 && main.player.cargoPolicy; i++) await tick();
    assert.equal(main.player.cargoPolicy, undefined, 'main read model observes the ended policy');
    const save = registry.get('save');
    const saved = await asWorker(() => structuredClone(save.serializeData()));
    state.player.cargoPolicy = { coverFrac: 0.5, coverCr: 123, premiumCr: 10 };
    await asWorker(() => save._restore(saved, 'quick'));
    for (let i = 0; i < 65 && main.player.cargoPolicy; i++) await tick();
    assert.equal(state.player.cargoPolicy, undefined, 'the ended policy stays ended after restore');
    assert.equal(main.player.cargoPolicy, undefined, 'the restored read model stays truthful');
    assert.equal(state.player.credits, 4500);
  } finally { lane?.close(); host.shutdown(); globalThis.document = oldDocument; }
});
