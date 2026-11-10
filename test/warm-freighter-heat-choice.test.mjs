import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneCommandSink, uninstallSimCommandSink, installSimCommandSink } from '../src/core/simLaneCommands.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { createPhysicalJobsPrompt } from '../src/ui/physicalJobsPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { tickAlienEcology } from '../src/systems/alienEcology.js';
import { HEAT_ON, HEAT_OFF } from '../src/data/wasteHeat.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import contract from '../src/data/scenarios/47a.scenario.json' with { type: 'json' };

const site = ALIEN_SITES.warm_freighter;
const key = 'site-evidence:warm_freighter:warm-freighter-standby';

test('worker scan, independent deck choice and correlated receipt operate the canonical heat record', async () => {
  const worker = createSimHost(), state = createGameState(4242), bus = createBus();
  const cards = new Map(), notices = [], requests = [];
  let deliver, commandsDone = Promise.resolve();
  const asWorker = async fn => {
    const sink = laneCommandSink(); uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); }
  };
  const lane = createSimLaneRuntime({ state, bus, registry: {}, flags: { lane: 'worker', sab: false, warnings: [] },
    clockMode: 'worker-local', channelFactory: () => ({
      onMessage(fn) { deliver = fn; }, terminate() { worker.shutdown(); },
      post(message) {
        if (message.kind === 'init') asWorker(() => worker.init({ ...structuredClone(message), scenarioContract: contract }))
          .then(reply => deliver(structuredClone({ kind: 'ready', seq: message.seq, ...reply })))
          .catch(error => deliver({ kind: 'error', seq: message.seq, message: String(error) }));
        if (message.kind === 'clockCommand') commandsDone = commandsDone.then(async () => {
          assert.equal(message.steps, 0);
          const reply = await asWorker(() => worker.tick({ ...structuredClone(message), kind: 'tick', steps: 0 }));
          deliver(structuredClone({ kind: 'clockTick', ...reply, commandSequence: message.commandSequence }));
        });
      },
    }) });
  const drain = async () => { let last; do { last = commandsDone; await last; await Promise.resolve(); } while (last !== commandsDone); };
  setPromptDeck({ offerDecision(spec) { cards.set(spec.id, spec); return true; },
    resolveDecision(id) { return cards.delete(id); } });
  const prompt = createPhysicalJobsPrompt({ bus, state });
  bus.on('toast', row => notices.push(row.text));
  bus.on('siteEvidence:action', row => requests.push(row));
  try {
    await lane.readyPromise;
    assert.equal(MAIN_TO_SIM_BUS_EVENTS.has('siteEvidence:action'), true);
    const { state: authority, runtime, registry, bus: workerBus } = worker.host;
    const workerResults = [], workerActions = [], heatLogs = [];
    workerBus.on('siteEvidence:result', result => workerResults.push(result));
    workerBus.on('siteEvidence:action', action => workerActions.push(action));
    workerBus.on('comms:log', row => { if (row.text === HEAT_ON || row.text === HEAT_OFF) heatLogs.push(row.text); });
    authority.mode = 'flight'; authority.world.currentSectorId = site.sectorId;
    const world = registry.get('world'), wreckOwner = registry.get('aftermathWrecks');
    const binding = await asWorker(() => wreckOwner.admitSiteWreck(site.siteId));
    assert.ok(binding?.host, 'the actual aftermath owner must admit the Mule');
    const host = binding.host, center = { ...binding.pose };
    const player = runtime.spawn({ type: 'ship', isPlayer: true, pos: { ...center }, vel: { x: 0, z: 0 },
      radius: 10, hull: 100, data: { fittings: [] } });
    authority.playerId = player.id;
    const rec = () => authority.world.alienEcology.sites.warm_freighter;
    const flush = async () => {
      const reply = await asWorker(() => worker.tick({ kind: 'tick', steps: 0, tick: 0, commands: [] }));
      deliver(structuredClone({ kind: 'clockTick', ...reply }));
    };
    const scan = async () => {
      await asWorker(() => workerBus.emit('scan:completed', { targetId: null, sectorId: site.sectorId }));
      await flush(); return cards.get(key);
    };
    // A legacy fossil offer must coexist with, and survive resolving, the heat card.
    bus.emit('siteEvidence:offer', { siteId: site.siteId, headline: 'Fossil', choices: [{ id: 'compare', label: 'Compare' }] });
    const fossil = cards.get('site-evidence:warm_freighter');
    let card = await scan();
    assert.ok(card); assert.equal(rec().heatOnline !== false, true);
    assert.match(card.detail, /slows cysts.*releases eels/);
    assert.equal(cards.get('site-evidence:warm_freighter'), fossil);
    assert.equal(card.onChoose('1'), true); assert.equal(requests.length, 0);
    assert.equal(rec().heatOnline !== false, true);
    const oldCard = card; card = await scan();
    assert.equal(oldCard.onChoose('0'), false);
    assert.equal(card.onChoose('0'), true);
    const previousNoticeCount = notices.length;
    bus.emit('siteEvidence:result', { interactionId: 'warm-freighter-standby', requestId: -1, ok: true, online: false });
    assert.equal(notices.length, previousNoticeCount, 'unmatched receipt cannot announce success');
    await drain();
    assert.equal(rec().heatOnline, false);
    assert.match(notices.at(-1), /Standby cut/);
    assert.equal(card.onChoose('0'), false);
    assert.equal(cards.get('site-evidence:warm_freighter'), fossil);
    const cutRequest = requests.at(-1);
    card = await scan(); assert.match(card.detail, /supports cysts.*holds eels/);
    assert.equal(card.onChoose('0'), true); await drain();
    assert.equal(rec().heatOnline, true); assert.match(notices.at(-1), /Standby restored/);
    // A delayed duplicate cannot invert a later state and must be reported as refused.
    bus.emit('siteEvidence:action', cutRequest); await drain();
    assert.equal(rec().heatOnline, true);
    card = await scan();
    player.pos.x = center.x + site.arrivalBands.close;
    card.onChoose('0'); await drain();
    assert.equal(rec().heatOnline, true); assert.match(notices.at(-1), /unchanged.*range/i);
    player.pos.x = center.x;
    host.pos.x = center.x + 900;
    assert.equal(await scan(), undefined, 'the old marker location cannot operate a displaced host');
    player.pos.x = host.pos.x;
    card = await scan(); assert.ok(card, 'the offer follows the displaced live host');
    host.pos.x += site.arrivalBands.close;
    card.onChoose('0'); await drain();
    assert.equal(rec().heatOnline, true); assert.match(notices.at(-1), /unavailable or out of range/i);
    player.pos.x = host.pos.x;
    card = await scan(); assert.ok(card);
    authority.entities.delete(host.id);
    card.onChoose('0'); await drain();
    assert.equal(rec().heatOnline, true, 'temporary missing residency does not cut heat');
    assert.match(notices.at(-1), /unavailable or out of range/i);
    authority.entities.set(host.id, host);
    host.data.playerOwned = true;
    assert.equal(await scan(), undefined, 'a claimed host does not offer standby controls');
    assert.equal(rec().heatOnline, true, 'claim is not treated as destruction');
    delete host.data.playerOwned;
    host.pos.x = center.x; player.pos.x = center.x;
    assert.equal(fossil.onChoose('0'), true); await drain();
    assert.equal(workerResults.at(-1).siteId, site.siteId);
    assert.equal(workerResults.at(-1).interactionId, undefined, 'legacy fossil action retains its route');
    assert.equal(rec().heatOnline, true);
    card = await scan();
    await asWorker(() => workerBus.emit('save:restoring', {}));
    assert.equal(card.onChoose('0'), true); await drain();
    assert.equal(rec().heatOnline, true);
    assert.match(workerResults.at(-1).reason, /restoring/i);
    assert.match(notices.at(-1), /unchanged.*range/i, 'restore clears the earlier pending UI receipt');
    await asWorker(() => workerBus.emit('save:error', {}));
    host.data.salvagePool = {};
    assert.equal(await asWorker(() => wreckOwner._completeByEntity({ wreckId: host.id, markerId: binding.markerId })), true);
    assert.equal(rec().heatOnline, false, 'confirmed exhaustion cuts the canonical heat source');
    assert.equal(await scan(), undefined, 'a terminal host cannot offer standby controls');
    const heatLogCount = heatLogs.length;
    rec().heatEdge = false;
    await asWorker(() => tickAlienEcology(world, 0.1));
    assert.equal(heatLogs.length, heatLogCount, 'terminal host does not publish a live standby arrival reading');
    rec().heatOnline = true;
    await asWorker(() => workerBus.emit('save:loaded', {}));
    assert.equal(rec().heatOnline, false, 'restored terminal owner outcome reconciles legacy heat');
  } finally {
    prompt.dispose(); setPromptDeck(null); lane.close();
  }
});
