import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneDomEvent } from '../src/core/simLaneCommands.js';

function fixture(t, mode = 'flight') {
  const posts = [], bus = createBus();
  let receive;
  const state = { mode, entities: new Map(), entityList: [], settings: { controls: { mouse: {} } },
    meta: { seed: 4242 }, input: {}, ui: { screenStack: [] }, tick: 0, simTime: 0,
    accumulator: 0, timeScale: mode === 'paused' ? 0 : 1 };
  const lane = createSimLaneRuntime({ state, bus, registry: {},
    flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
    channelFactory: () => ({ post: message => posts.push(structuredClone(message)),
      onMessage: handler => { receive = handler; }, terminate() {} }),
  });
  t.after(() => lane.close());
  receive({ kind: 'ready', seq: posts[0].seq });
  lane.runner.setClockActive(true);
  let clockSequence = 0;
  return { state, bus, lane, posts, commands: () => posts.filter(p => p.kind === 'clockCommand'),
    ack(sequence) { receive({ kind: 'clockTick', seq: `clock-${++clockSequence}`, clockSequence,
      commandSequence: sequence, stateTick: clockSequence, simTime: clockSequence / 60,
      journalStart: 0, journalEnd: 0, pack: { count: 0, start: 0, end: 0 } }); },
  };
}

function timedFixture(t) {
  let clock = 0;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'performance', descriptor);
    else delete globalThis.performance;
  });
  return { ...fixture(t),
    dispatch(ms = 100) { clock += ms; t.mock.timers.tick(ms); },
    unavailable(ms) { clock += ms; },
    runDue(ms = 100) { t.mock.timers.tick(ms); },
  };
}

test('advancing flight sends readiness and key release before an older reply without inventing an ACK', t => {
  const f = fixture(t);
  laneDomEvent({ type: 'keydown', code: 'KeyW' });
  const first = f.commands()[0];
  const receipt = { attemptId: 2, generation: 3, bodies: [{ id: 41, generation: 52 }] };
  f.bus.emit('counterweightCircuit:presentationReady', receipt);
  laneDomEvent({ type: 'keyup', code: 'KeyW' });
  const batches = f.commands();
  assert.equal(batches.length, 3);
  assert.deepEqual(batches.map(b => b.commandSequence), [1, 2, 3]);
  assert.deepEqual(batches[1].commands[0].p, { emit: 'counterweightCircuit:presentationReady', payload: receipt });
  assert.equal(batches[2].commands[0].p.d.type, 'keyup');
  assert.equal(f.posts.some(p => p.kind === 'clockAck'), false, 'only received worker frames may be acknowledged');

  f.ack(first.commandSequence);
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, true, 'old ACK cannot clear the newer flight');
  f.ack(0);
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, true, 'stale watermark cannot clear it either');
  f.ack(3);
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, false);
  f.ack(2);
  assert.equal(f.lane.getDiagnostics().workerClockLastAppliedCommandSequence, 3);
  assert.equal(f.commands().length, 3, 'ACK-only replies cannot generate empty command floods');
});

test('paused and loading routes retain their coalesced ordered follow-up', t => {
  for (const mode of ['paused', 'loading']) {
    const f = fixture(t, mode);
    laneDomEvent({ type: 'keydown', code: 'KeyW' });
    f.bus.emit('counterweightCircuit:presentationReady', { attemptId: 1, generation: 1, bodies: [] });
    laneDomEvent({ type: 'keyup', code: 'KeyW' });
    assert.equal(f.commands().length, 1, mode);
    f.ack(1);
    assert.equal(f.commands().length, 2, mode);
    assert.deepEqual(f.commands()[1].commands.map(c => c.t), ['bus', 'dom']);
    f.ack(2);
    f.lane.close();
  }
});

test('new live sends never renew a silent worker watchdog', t => {
  const f = timedFixture(t);
  laneDomEvent({ type: 'keydown', code: 'KeyW' });
  for (let i = 0; i < 49; i++) {
    f.dispatch();
    laneDomEvent({ type: 'keyup', code: 'KeyW' });
  }
  assert.equal(f.lane.runner.isClosed(), false);
  f.dispatch(); f.runDue(0);
  assert.equal(f.lane.runner.isClosed(), true);
  assert.match(f.lane.getDiagnostics().error, /clock command stalled >5000ms.*commandSequence 1/);
});

test('a genuine older ACK hands off the newer original sent-time budget', t => {
  const f = timedFixture(t);
  laneDomEvent({ type: 'keydown', code: 'KeyW' });
  for (let i = 0; i < 9; i++) f.dispatch();
  laneDomEvent({ type: 'keyup', code: 'KeyW' });
  for (let i = 0; i < 31; i++) f.dispatch();
  f.ack(1);
  assert.equal(f.lane.getDiagnostics().workerClockCommandResponsiveMs, 3100);
  for (let i = 0; i < 18; i++) f.dispatch();
  assert.equal(f.lane.runner.isClosed(), false);
  f.dispatch(); f.runDue(0);
  assert.equal(f.lane.runner.isClosed(), true);
  assert.match(f.lane.getDiagnostics().error, /commandSequence 2/);
});

test('main-thread unavailability also follows the retained newer flight', t => {
  const f = timedFixture(t);
  laneDomEvent({ type: 'keydown', code: 'KeyW' });
  for (let i = 0; i < 9; i++) f.dispatch();
  laneDomEvent({ type: 'keyup', code: 'KeyW' });
  f.unavailable(6000); f.runDue();
  f.ack(1);
  assert.equal(f.lane.getDiagnostics().workerClockCommandResponsiveMs, 100);
  for (let i = 0; i < 48; i++) f.dispatch();
  assert.equal(f.lane.runner.isClosed(), false);
  f.dispatch(); f.runDue(0);
  assert.equal(f.lane.runner.isClosed(), true);
});
