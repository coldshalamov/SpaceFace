// Frame-cost lane fixes (2026-11-28): the three reply-application hitches on the worker lane.
//   rosterSplit  — a live weapon-VFX projectile used to rebuild state.entityList O(entities)
//                  every reply; the roster list now refills on roster change only.
//   mirrorStep   — the reply's mirror phase (pack, spawnInfos, fold, vitals, aux, domains)
//                  used to land atomically before events; it now applies in ~4 ms stages and
//                  still finishes before that reply's first event replays.
//   drainCap + shedCosmetics — a deep backlog used to drop the wall-clock budget and drain
//                  in one 40 ms task; the budget is now a hard cap and stale replies shed
//                  fire-and-forget cue events.
// These drive the lane through the same injected channel the other sim-lane tests use:
// clockTick replies are fed to the channel handler and frames are pumped with
// prepareWithoutAdvance(), which is the real per-frame drain boundary.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A proxy on state.entityList counts every `length` write: a refill always writes
// length (the `length = 0` clear plus each push), a skipped reconcile writes nothing.
function makeLane(t, { entityListSpy = false } = {}) {
  const posts = [];
  let receive = null;
  const lengthWrites = [];
  const state = {
    entities: new Map(),
    entityList: entityListSpy ? new Proxy([], {
      set(target, prop, value) {
        if (prop === 'length') lengthWrites.push(value);
        return Reflect.set(target, prop, value);
      },
    }) : [],
    settings: { controls: { mouse: {} } }, mode: 'flight',
    meta: { seed: 1 }, input: {}, ui: { screenStack: [] },
    tick: 0, simTime: 0, accumulator: 0, timeScale: 1, world: {},
  };
  const bus = createBus();
  const lane = createSimLaneRuntime({
    state, registry: {}, bus,
    flags: { lane: 'worker', warnings: [], sab: false, sabEnvelope: false },
    clockMode: 'worker-local',
    channelFactory: () => ({
      post(msg) { posts.push(msg); },
      onMessage(h) { receive = h; },
      terminate() {},
    }),
  });
  assert.ok(lane, 'worker lane runtime installed');
  t.after(() => {
    try { lane.close(); } catch (_) { /* teardown is best-effort */ }
    delete globalThis.__sfRfx;
  });
  receive({ kind: 'ready', seq: posts[0].seq });
  const diag = () => lane.getDiagnostics();
  const pump = () => lane.runner.prepareWithoutAdvance();
  // Any reply may park mid-mirror when the host is contended (node --test runs
  // files in parallel): drain it before asserting the mirror it produced.
  const finish = () => {
    let guard = 0;
    while (diag().replySlices.open && guard++ < 4000) pump();
  };
  return {
    posts, lane, state, bus, lengthWrites,
    pump, finish, diag,
    receive: (msg) => receive(msg),
  };
}

const clockReply = (seq, extra = {}) => ({
  kind: 'clockTick', clockSequence: seq, lifecycleGeneration: 0,
  stateTick: seq, simTime: seq / 60, journalStart: 0, journalEnd: 0,
  pack: { count: 0, start: 0, end: 0 },
  ...extra,
});

// The nested `data` payload gives canonicalClone real work so a few thousand
// spawnInfos reliably exceed the 4 ms mirror slice on any host.
const spawn = (id, extra = {}) => ({
  entityId: id, type: 'ship', alive: true, team: 1,
  x: id, z: id * 2, rot: 0, radius: 1,
  data: { name: 'n' + id, cargo: { hold: [1, 2, 3, 4, 5], meta: { tag: 'pad'.repeat(12) } } },
  ...extra,
});
const spawnBatch = (base, count) => Array.from({ length: count }, (_, i) => spawn(base + i));

const vfx = (id, extra = {}) => ({
  entityId: id, type: 'projectile', alive: true, team: 1,
  x: 1, z: 1, vx: 10, vz: 0, rot: 0, radius: 0.2, weaponId: 'beam',
  ...extra,
});

// Wire pack columns (simLaneJournal layout): 18 scalars per record, kinds 1=SPAWN
// 2=DESTROY 3=TRANSFORM 4=VISUAL.
const pack = (start, records) => {
  const scalars = new Float64Array(records.length * 18);
  const kinds = new Uint8Array(records.length);
  const typeIndex = new Uint16Array(records.length);
  records.forEach((r, i) => {
    const o = i * 18;
    scalars[o] = 1;                 // tick
    scalars[o + 1] = start + i;     // sequence
    scalars[o + 2] = r.entityId;
    scalars[o + 3] = r.generation ?? 1;
    scalars[o + 5] = r.x ?? 0;
    scalars[o + 7] = r.z ?? 0;
    scalars[o + 11] = r.rot ?? 0;
    kinds[i] = r.kind;
  });
  return { count: records.length, start, end: start + records.length, scalars, kinds, typeIndex, typeTable: [] };
};

test('rosterSplit: combat replies keep entityList stable while the VFX list moves', (t) => {
  const { state, pump, receive, finish, lengthWrites } = makeLane(t, { entityListSpy: true });
  pump();
  receive(clockReply(1, {
    spawnInfos: [spawn(1), spawn(2)],
    weaponVfxProjectiles: [vfx(101)],
  }));
  finish();
  assert.deepEqual([...state.entities.keys()], [1, 2]);
  assert.equal(state.entityList.length, 2);
  assert.equal(state.weaponVfxProjectiles.length, 1);
  assert.ok(lengthWrites.length > 0, 'the first roster fill rewrote entityList');
  lengthWrites.length = 0;

  // Same roster, a second live projectile: only the VFX list is allowed to move.
  receive(clockReply(2, { weaponVfxProjectiles: [vfx(101), vfx(102)] }));
  finish();
  assert.equal(lengthWrites.length, 0,
    'entityList refilled for a VFX-only change — the combat hitch is back');
  assert.equal(state.weaponVfxProjectiles.length, 2);
  assert.equal(state.weaponVfxProjectiles[1].id, 102);

  // An alive flip on a VFX row still rebuilds the presented list (membership filter).
  receive(clockReply(3, { weaponVfxProjectiles: [vfx(101), vfx(102, { alive: false })] }));
  finish();
  assert.equal(lengthWrites.length, 0, 'entityList refilled on an alive flip');
  assert.deepEqual(state.weaponVfxProjectiles.map((r) => r.id), [101]);

  // A roster change is what refills entityList — the only thing that should.
  receive(clockReply(4, { spawnInfos: [spawn(3)], weaponVfxProjectiles: [] }));
  finish();
  assert.ok(lengthWrites.length > 0, 'a spawn did not refill entityList');
  assert.equal(state.entityList.length, 3);
  assert.equal(state.weaponVfxProjectiles.length, 0);
});

test('rosterSplit off: the combined reconcile refills both lists on VFX changes', (t) => {
  globalThis.__sfRfx = { rosterSplit: false };
  const { state, pump, receive, finish, lengthWrites } = makeLane(t, { entityListSpy: true });
  pump();
  receive(clockReply(1, { spawnInfos: [spawn(1)], weaponVfxProjectiles: [vfx(101)] }));
  finish();
  lengthWrites.length = 0;
  receive(clockReply(2, { weaponVfxProjectiles: [vfx(101), vfx(102)] }));
  finish();
  assert.ok(lengthWrites.length > 0, 'the flag did not restore the combined reconcile');
});

test('mirrorStep: a mass-spawn reply suspends mid-mirror and events still see applied state', (t) => {
  const { state, bus, pump, receive, diag } = makeLane(t);
  const seen = [];
  bus.on('probe:mirror', () => seen.push(state.entities.size));
  pump();
  receive(clockReply(1, {
    spawnInfos: spawnBatch(1000, 8000),
    events: [{ t: 'probe:mirror', p: {} }],
  }));
  const diagAfter = diag();
  if (!diagAfter.replySlices.open) {
    // Exceptionally fast host: the whole mirror fit in one slice. The ordering
    // contract is what matters — the event still saw the complete roster.
    assert.equal(seen[0], 8000);
    return;
  }
  assert.equal(seen.length, 0, 'an event replayed before its reply\'s mirror finished');
  let guard = 0;
  while (seen.length === 0 && guard++ < 2000) pump();
  assert.equal(seen[0], 8000, 'the first event observed the fully applied roster');
  assert.ok(diag().replySlices.resumed > 0, 'the parked mirror never resumed');
});

test('mirrorStep: a lifecycle reply steps its mirror, then replays events atomically', (t) => {
  const { state, bus, pump, receive, diag } = makeLane(t);
  const seen = [];
  bus.on('probe:mirror', () => seen.push('probe:mirror'));
  bus.on('sector:enter', () => seen.push('sector:enter'));
  pump();
  receive(clockReply(1, {
    spawnInfos: spawnBatch(2000, 8000),
    // sector:enter is a lifecycle boundary — its reply's events may not split, but its
    // mirror still slices. Trailing probes make the atomic block provably long.
    events: [{ t: 'sector:enter', p: {} },
      ...Array.from({ length: 40 }, () => ({ t: 'probe:mirror', p: {} }))],
  }));
  if (!diag().replySlices.open) {
    assert.equal(seen.length, 41, 'fast host: events still replayed after the mirror');
    return;
  }
  assert.equal(seen.length, 0, 'lifecycle events replayed before the mirror finished');
  let guard = 0;
  while (seen.length === 0 && guard++ < 2000) pump();
  assert.equal(seen[0], 'sector:enter', 'event order changed');
  assert.equal(seen.length, 41, 'a sliceable-looking gap split an atomic event block');
  assert.equal(state.entities.size, 8000);
});

test('mirrorStep: windowed journal folds visit every record exactly once', (t) => {
  const { state, pump, receive, finish } = makeLane(t);
  pump();
  receive(clockReply(1, { spawnInfos: [spawn(5), spawn(6)] }));
  finish();
  // 2000 transform records cross several MIRROR_RECORD_WINDOW boundaries.
  const records = Array.from({ length: 2000 }, (_, i) => ({
    kind: 3, entityId: 5, x: i, z: i * 0.5, generation: 1,
  }));
  records.push({ kind: 2, entityId: 6 });
  receive(clockReply(2, { journalStart: 10, journalEnd: 10 + records.length, pack: pack(10, records) }));
  // The fold may have parked mid-window; drain it before asserting the mirror.
  finish();
  assert.equal(state.entities.get(5).pos.x, 1999,
    'the last transform did not fold — a window was skipped or doubled');
  assert.equal(state.entities.has(6), false, 'the destroy record did not fold');
  assert.deepEqual([...state.entities.keys()], [5]);
});

test('drainCap: a deep backlog drains at the wall-clock cap, in order', (t) => {
  const { bus, pump, receive, diag } = makeLane(t);
  const emitted = [];
  bus.on('probe:drain', (p) => emitted.push(p.i));
  pump();
  // A heavy reply parks mid-mirror; twenty modest replies queue behind it.
  receive(clockReply(1, { spawnInfos: spawnBatch(4000, 8000) }));
  assert.ok(diag().replySlices.open, 'the heavy reply did not park — test premise failed');
  for (let i = 2; i <= 21; i++) {
    receive(clockReply(i, {
      spawnInfos: spawnBatch(20000 + i * 3000, 2000),
      events: [{ t: 'probe:drain', p: { i } }],
    }));
  }
  // A later receive may finish the parked reply and spend leftover budget on the
  // head of the queue — legal, as long as nothing emits out of order.
  let guard = 0;
  while (diag().replySlices.open && guard++ < 2000) pump();
  // The task that finishes the parked reply may spend its remaining cap on queued
  // replies — that is the design — but every event must still be in reply order.
  assert.deepEqual(emitted, Array.from({ length: emitted.length }, (_, k) => k + 2),
    'a queued reply jumped the parked one or drain order changed');
  // Hard cap on: a single drain task cannot land the whole remaining backlog —
  // every queued reply carries real mirror work, so the ~6 ms cap binds.
  globalThis.__sfRfx = { drainCap: true };
  pump();
  assert.ok(emitted.length < 20, `hard cap drained all ${emitted.length}/20 in one task`);
  assert.deepEqual(emitted, Array.from({ length: emitted.length }, (_, k) => k + 2),
    'drain order changed under the cap');
  // Cap off: the queue->8 tail releases the per-task budget, so several more
  // frames converge on an empty queue — the pre-fix shape.
  globalThis.__sfRfx = { drainCap: false };
  guard = 0;
  while (emitted.length < 20 && guard++ < 500) pump();
  assert.equal(emitted.length, 20, 'without the cap the backlog did not converge');
  assert.deepEqual(emitted, Array.from({ length: 20 }, (_, k) => k + 2));
});

test('shedCosmetics: a stale reply drops fire-and-forget cues, keeps state events', async (t) => {
  const run = async (shedOn) => {
    globalThis.__sfRfx = { shedCosmetics: shedOn };
    const { bus, pump, receive, diag } = makeLane(t);
    const seen = [];
    for (const type of ['audio:cue', 'presentation:vfxCue', 'camera:shake',
      'probe:keep', 'entity:killed', 'physics:impact']) {
      bus.on(type, (p) => seen.push([type, p && p.playerInvolved === true ? 'player' : 'other']));
    }
    // Reply 1 parks in its event phase for >250 ms so reply 2 ages past the stale gate.
    const spin = () => { const t0 = performance.now(); while (performance.now() - t0 < 1.5) { /* cue cost */ } };
    bus.on('probe:slow', spin);
    pump();
    receive(clockReply(1, {
      events: Array.from({ length: 200 }, () => ({ t: 'probe:slow', p: {} })),
    }));
    receive(clockReply(2, {
      events: [
        { t: 'audio:cue', p: { id: 'engine' } },
        { t: 'presentation:vfxCue', p: { id: 'spark' } },
        { t: 'camera:shake', p: { amount: 1 } },
        { t: 'physics:impact', p: { playerInvolved: false } },
        { t: 'probe:keep', p: {} },
        { t: 'entity:killed', p: { id: 7 } },
        { t: 'physics:impact', p: { playerInvolved: true } },
      ],
    }));
    // Let the drain timers age reply 2 past the 250 ms stale window, then finish reply 1.
    let guard = 0;
    while (!seen.some(([type]) => type === 'probe:keep') && guard++ < 500) {
      pump();
      await sleep(10);
    }
    const types = seen.filter(([type]) => type !== 'probe:slow').map(([type]) => type);
    return { types, shed: diag().replyQueue.cosmeticShed, kept: seen };
  };

  const on = await run(true);
  assert.deepEqual(on.types, ['probe:keep', 'entity:killed', 'physics:impact'],
    'a stale reply kept cosmetic cues it should have shed');
  assert.deepEqual(on.kept.filter(([t]) => t === 'physics:impact').map(([, k]) => k), ['player'],
    'the non-player impact should shed, the player impact must not');
  assert.ok(on.shed >= 4, `expected >=4 shed events, got ${on.shed}`);

  const off = await run(false);
  assert.deepEqual(off.types, ['audio:cue', 'presentation:vfxCue', 'camera:shake',
    'probe:keep', 'entity:killed', 'physics:impact'],
    'the flag-off path must keep cosmetic cues (only stale impacts shed)');
});

// replyOnFrame (2026-11-22): while a real animation-frame loop is running, a reply that arrives
// between frames is only enqueued; the next frame boundary applies it. With no frame loop
// (headless, hidden tab, a test feeding replies by hand) a reply still applies as it arrives.
test('replyOnFrame: with animation frames arriving a reply waits for the frame boundary', (t) => {
  const h = makeLane(t);
  const seen = [];
  h.bus.on('probe:event', (p) => seen.push(p.n));
  const reply = (seq, n) => clockReply(seq, { events: [{ t: 'probe:event', p: { n }, m: 'flight' }] });

  h.receive(reply(1, 1));
  assert.deepEqual(seen, [1], 'no frame loop: the reply applies on arrival');

  h.lane.runner.noteAnimationFrame();
  h.pump();
  h.receive(reply(2, 2));
  h.receive(reply(3, 3));
  assert.deepEqual(seen, [1], 'frame loop live: the message task only enqueues');
  assert.equal(h.diag().replyQueue.pending, 2);
  assert.equal(h.diag().replyOnFrame.deferredToFrame, 2);

  h.lane.runner.noteAnimationFrame();
  h.pump();
  h.finish();
  assert.deepEqual(seen, [1, 2, 3], 'the frame boundary applies them, in order');
  assert.equal(h.diag().replyQueue.pending, 0);
});

test('replyOnFrame off: a reply applies on arrival even with frames arriving', (t) => {
  globalThis.__sfRfx = { replyOnFrame: false };
  const h = makeLane(t);
  const seen = [];
  h.bus.on('probe:event', (p) => seen.push(p.n));
  h.lane.runner.noteAnimationFrame();
  h.pump();
  h.receive(clockReply(1, { events: [{ t: 'probe:event', p: { n: 1 }, m: 'flight' }] }));
  assert.deepEqual(seen, [1]);
});
