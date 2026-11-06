import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scanLocalEventHelpers, registeredPresentationRanges, rows, computeForwardSet } from '../scripts/lib/eventSurfaceCensus.mjs';
import { createBreakwaterSpurPromptSystem } from '../src/features/breakwaterSpur/presentation.js';
import { crucibleDraftScreen } from '../src/ui/screens/crucibleDraft.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { MAIN_TO_SIM_BUS_EVENTS, KNOWN_UNFORWARDED_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';

test('local event parameters follow lexical helpers and the owning object across multiple hops', () => {
  const source = `
    function dispatch(ctx, kind, payload) { ctx.bus?.emit?.(kind, payload); }
    const screen = {
      relay(ctx, kind, payload) { dispatch(ctx, kind, payload); },
      choose(ctx) { this.relay(ctx, 'input:fit', {}); },
    };
    const other = { relay(ctx, kind) {}, choose(ctx) { this.relay(ctx, 'unsupported:method'); } };
    function queued(kind) { bus.queue(kind, {}); }
    queued('input:queued');
    function unrelated() { function queued(kind) {} queued('unsupported:shadow'); }
    function plugin(kind) { socket.emit(kind, {}); }
    plugin('unsupported:socket');
    function replaced(kind) { kind = 'actual:other'; bus.emit(kind); }
    replaced('unsupported:reassigned');
    foreign('unsupported:import');
  `;
  assert.deepEqual(scanLocalEventHelpers(source).filter(h => h.kind === 'literal')
    .map(h => [h.verb, h.type]).sort(), [['emit', 'input:fit'], ['queue', 'input:queued']]);
});

test('registration and manifest capability select factory ranges inside a shared module', () => {
  const files = new Map([
    ['registry', `import { makeGlass as createPrompt, makeSim } from 'feature';
      const entries = [['glass', createPrompt()], ['sim', makeSim()]];`],
    ['feature', `const glass = { name: 'glass', init(ctx) { ctx.bus.emit('input:choose'); } };
      const shadowed = { init(ctx) { ctx.bus.emit('unsupported:shadow'); } };
      export function makeGlass() { const shadowed = null; return Object.create(glass); }
      export function makeSim() { return { name: 'sim', init(ctx) { ctx.bus.on('input:choose', () => {}); } }; }`],
  ]);
  const ranges = registeredPresentationRanges('registry', {
    readSource: file => files.get(file), resolveModule: spec => spec,
    isPresentationId: id => id === 'glass',
  }).get('feature');
  const contains = offset => ranges.some(([start, end]) => start <= offset && offset < end);
  assert.equal(contains(files.get('feature').indexOf("ctx.bus.emit")), true);
  assert.equal(contains(files.get('feature').indexOf("ctx.bus.on")), false);
  assert.equal(contains(files.get('feature').indexOf("ctx.bus.emit('unsupported")), false);
});

test('actual prompt factory and current screen helper produce census-backed inputs', () => {
  const emitted = [], bus = createBus();
  const original = bus.emit;
  bus.emit = (type, payload) => { emitted.push(type); return original(type, payload); };
  const prompt = createBreakwaterSpurPromptSystem();
  let decision;
  prompt._deck = () => ({ offerDecision(spec) { decision = spec; }, resolveDecision() {} });
  prompt.init({ bus });
  try {
    prompt.offer({ revision: 'rev1', actions: [{ id: 'accept', label: 'Accept' }] });
    decision.onChoose('accept', 'keyboard');
    const screen = Object.assign(Object.create(crucibleDraftScreen), { refresh() {} });
    screen._requestReroll({ bus });
    const currentHelpers = scanLocalEventHelpers(readFileSync(new URL('../src/ui/screens/crucibleDraft.js', import.meta.url), 'utf8'));
    assert.ok(currentHelpers.some(hit => hit.type === emitted[1]));
    assert.equal(emitted.length, 2);
    for (const type of emitted) {
      const row = rows.find(row => row.type === type);
      assert.equal(row?.needsForward, true, `${type} has a main emitter and sim subscriber`);
      assert.equal(computeForwardSet().all.has(type), true);
    }
  } finally { prompt.destroy(); }
});

test('candidate allow-set preserves live inputs in the real forwarder and refuses unsupported traffic', async () => {
  const candidate = computeForwardSet();
  const savedForward = [...MAIN_TO_SIM_BUS_EVENTS], savedKnown = [...KNOWN_UNFORWARDED_BUS_EVENTS];
  // Substitute generated data only in this test process. The shared leaf stays read-only.
  MAIN_TO_SIM_BUS_EVENTS.clear(); KNOWN_UNFORWARDED_BUS_EVENTS.clear();
  for (const type of candidate.all) MAIN_TO_SIM_BUS_EVENTS.add(type);
  for (const type of candidate.knownUnforwarded) KNOWN_UNFORWARDED_BUS_EVENTS.add(type);
  const bus = createBus(), outgoing = [];
  let receive, init, lane;
  try {
    lane = createSimLaneRuntime({ state: createGameState(7), bus, registry: {}, helpers: {},
      flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
      channelFactory: () => ({ onMessage(fn) { receive = fn; }, terminate() {},
        post(message) { if (message.kind === 'init') init = message;
          else if (message.kind === 'clockCommand') outgoing.push(message); } }) });
    receive({ kind: 'ready', seq: init.seq });
    await lane.readyPromise;
    const live = ['cinderglassJob:presentationReady', 'breakwaterSpur:action', 'counterweightCircuit:action',
      'run:draftLockRequested', 'run:draftRerollRequested', 'run:refitFitRequested',
      'run:refitSellRequested', 'run:refitStripRequested', 'ui:unfitModule', 'run:partialBankRequested'];
    for (const type of live) {
      assert.equal(rows.find(row => row.type === type)?.needsForward, true, type);
      bus.emit(type, { requestId: type });
      bus.queue(type, { requestId: `${type}:queued` });
    }
    for (const type of ['counterweightCircuit:inspect', 'unsupported:input', 'race:armed', 'game:started',
      'hud:receiptGeometryChanged', 'station:marketTradeIntentRetired', 'station:marketTradeReceiptRecovered', 'ui:toast']) bus.emit(type, {});
    // The injected channel acknowledges transport batches; it runs no simulation.
    for (let i = 0; i < outgoing.length; i++) receive({ kind: 'clockTick', commandSequence: outgoing[i].commandSequence });
    const sent = outgoing.flatMap(message => message.commands || []).filter(command => command.t === 'bus');
    assert.deepEqual(sent.map(command => command.p.emit), live.flatMap(type => [type, type]));
    assert.ok(sent.every(command => command.p.payload.requestId.startsWith(command.p.emit)));
  } finally {
    lane?.close();
    MAIN_TO_SIM_BUS_EVENTS.clear(); KNOWN_UNFORWARDED_BUS_EVENTS.clear();
    for (const type of savedForward) MAIN_TO_SIM_BUS_EVENTS.add(type);
    for (const type of savedKnown) KNOWN_UNFORWARDED_BUS_EVENTS.add(type);
  }
  const mainBus = createBus(), originalEmit = mainBus.emit;
  assert.equal(createSimLaneRuntime({ state: createGameState(7), bus: mainBus, flags: { lane: 'main' } }), null);
  assert.equal(mainBus.emit, originalEmit, 'default main-lane delivery is untouched');
});
