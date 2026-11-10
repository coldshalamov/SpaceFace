import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { DOMAIN_COLD_BYTES, DOMAIN_COLD_TICKS } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneCommandSink, installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { automationScreen } from '../src/ui/screens/automationPanel.js';
import { fakeDom } from './helpers/fake-dom.mjs';

for (const existingCount of [0, 100]) test(`outpost build and decommission publish while paused (${existingCount} existing)`, async () => {
  const oldDocument = globalThis.document;
  const host = createSimHost();
  const main = createGameState(4242);
  const bus = createBus();
  let lane, deliver, commandsDone = Promise.resolve();
  let serial = 0;
  // The production host normally occupies a separate realm; keep its direct
  // writes from seeing this test realm's installed main-lane sink.
  const asWorker = async (fn) => {
    const sink = laneCommandSink();
    uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); }
  };
  const drain = async () => {
    for (;;) {
      const current = commandsDone;
      await current;
      if (current === commandsDone) return;
    }
  };
  const tick = async () => {
    await drain();
    const reply = await asWorker(() => host.tick({ kind: 'tick', tick: ++serial, steps: 0, commands: [] }));
    deliver(structuredClone({ kind: 'clockTick', ...reply }));
    await drain();
  };
  let screen;
  try {
    const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
    lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers: {},
      flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
      channelFactory: () => ({
        onMessage(fn) { deliver = fn; },
        terminate() {},
        post(message) {
          if (message.kind === 'init') asWorker(() => host.init({ ...structuredClone(message),
            profile: 'production', seed: 4242, scenarioContract: contract }))
            .then((reply) => deliver(structuredClone({ kind: 'ready', seq: message.seq, ...reply })))
            .catch((error) => deliver({ kind: 'error', seq: message.seq, message: String(error) }));
          if (message.kind === 'clockCommand') commandsDone = commandsDone.then(async () => {
            const reply = await asWorker(() => host.tick({ ...structuredClone(message), kind: 'tick' }));
            deliver(structuredClone({ kind: 'clockTick', ...reply, commandSequence: message.commandSequence }));
          });
        },
      }),
    });
    await lane.readyPromise;
    const state = host.host.state;
    state.mode = 'flight';
    state.player.credits = 100000;
    state.player.researchedNodes = ['tech_outpost_charter'];
    host.host.registry.get('world').enterSector('sector_helios_prime');
    // Exercise a legitimately shaped, cold-sized list without touching cargo or
    // creating any outposts through a test-only command.
    state.automation.outposts = Array.from({ length: existingCount }, (_, i) => ({
      id: `fixture_${i}`, defId: 'outpost_fuelsynth', recipeId: 'outpost_fuelsynth',
      level: 1, sectorId: 'sector_helios_prime', pos: { x: i, z: 0 }, storage: 0,
      storageCap: 400, defense: 15, upkeepPerMin: 40, autoSell: true,
      raidCooldown: 0, status: 'producing', ratePerMin: 0,
    }));
    await tick();
    const leaf = host.host.domainDiffer.paths.get('automation.outposts');
    assert.ok(leaf, 'the production domain differ tracks the outpost leaf');
    if (existingCount) assert.ok(leaf.bytes > DOMAIN_COLD_BYTES, 'the list uses cold cadence');

    const doc = fakeDom();
    globalThis.document = doc;
    const root = doc._make('div'), body = doc._make('div'), tabs = doc._make('div');
    root.querySelector = (s) => s === '[data-body]' ? body : s === '[data-tabs]' ? tabs : null;
    screen = Object.create(automationScreen);
    screen.refresh = () => {};
    screen.mount(root, { state: main, bus });
    const fragment = doc._make('fragment');
    screen._renderOutposts(fragment);
    const html = fragment.children.map((node) => node.innerHTML).join('\n');
    const button = html.match(/<button[^>]*data-act="buildOutpost"[^>]*data-ref="outpost_fuelsynth"[^>]*>/)?.[0];
    assert.ok(button && !/\sdisabled(?:\s|>)/.test(button), 'the ordinary build button is available');

    const click = (act, ref) => {
      const control = { dataset: { act, ref, kind: 'outpost' } };
      for (const listener of body.listeners.click || []) listener({ target: { closest: () => control } });
    };
    click('buildOutpost', 'outpost_fuelsynth');
    await drain();
    assert.equal(state.automation.outposts.length, existingCount + 1, 'production automation owner constructs the outpost');
    assert.equal(state.player.credits, 55000, 'the authoritative economy charges the construction price');
    const built = state.automation.outposts.at(-1);
    assert.equal(host.host.registry.get('automation').serialize().outposts.at(-1).id, built.id,
      'the existing save owner retains the outpost');
    assert.equal(main.automation?.outposts?.length, existingCount + 1, 'the build reply publishes the outpost');
    assert.equal(main.automation.outposts.at(-1).id, built.id);
    const updated = doc._make('fragment');
    screen._renderOutposts(updated);
    assert.match(updated.children.map((node) => node.innerHTML).join('\n'), new RegExp(`data-act="decommission" data-ref="${built.id}"`));

    click('decommission', built.id);
    await drain();
    assert.equal(state.automation.outposts.length, existingCount);
    assert.equal(main.automation.outposts.length, existingCount, 'the decommission reply removes the outpost');
    assert.equal(host.host.registry.get('automation').serialize().outposts.some((o) => o.id === built.id), false);
    if (existingCount) {
      const lastSign = leaf.lastSign;
      state.automation.outposts[0].storage = 7;
      await tick();
      assert.equal(leaf.lastSign, lastSign, 'ordinary production remains on cold cadence');
      for (let i = 0; i < DOMAIN_COLD_TICKS; i++) await tick();
      assert.equal(main.automation.outposts[0].storage, 7, 'normal cadence still publishes storage');
    }
  } finally {
    screen?.dispose();
    lane?.close();
    host.shutdown();
    globalThis.document = oldDocument;
  }
});
