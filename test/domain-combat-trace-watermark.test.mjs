import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDomainPathUpdate,
  canonicalSignature,
  configureDomainMirroring,
  createDomainDiffer,
  createDomainMirroringProfile,
  DOMAIN_COLD_TICKS,
} from '../scripts/lib/simReadModel.mjs';

const TRACE_PATH = 'combat.trace';
const FULL_TRACE_DIAGNOSTIC_PROFILE = Object.freeze({ combatTraceProjection: false });

function makeEvent(seq, reads, suffix = '') {
  const event = { seq, tick: seq, kind: 'trace.test', payload: null };
  Object.defineProperty(event, 'payload', {
    enumerable: true,
    get() {
      reads.count++;
      return `payload-${seq}-${suffix}-${'x'.repeat(720)}`;
    },
  });
  return event;
}

function makeTrace(reads, { count = 10, capacity = 32, suffix = '' } = {}) {
  const events = Array.from({ length: count }, (_, index) => makeEvent(index + 1, reads, suffix));
  return {
    nextSeq: count + 1,
    capacity,
    events,
    dropped: 0,
    hashU32: 0x811c9dc5,
    digest: '811c9dc5',
  };
}

function traceUpdate(reply) {
  return reply.updates.find((update) => update.segs.join('.') === TRACE_PATH && !update.del);
}

function traceDelete(reply) {
  return reply.updates.find((update) => update.segs.join('.') === TRACE_PATH && update.del);
}

function nextSlotTick(node, modulus, after) {
  let tick = after + 1;
  const slot = node.slot % modulus;
  while (tick % modulus !== slot) tick++;
  return tick;
}

function applyUpdates(domains, reply) {
  for (const update of reply.updates) applyDomainPathUpdate(domains, update, new Set());
}

function assertFullTracePayload(update, trace, message) {
  assert.ok(update, message);
  assert.equal(
    canonicalSignature(update.v),
    canonicalSignature(trace),
    `${message}: shipped payload must remain exact`,
  );
}

test('same-input combat trace cold pass bypasses canonical traversal and preserves payload', () => {
  configureDomainMirroring(FULL_TRACE_DIAGNOSTIC_PROFILE);
  const reads = { count: 0 };
  const trace = makeTrace(reads);
  const state = { combat: { trace } };
  const differ = createDomainDiffer();
  const domains = new Map();

  const initial = differ.diff(state, 0);
  assertFullTracePayload(traceUpdate(initial), trace, 'initial trace');
  applyUpdates(domains, initial);
  const initialReads = reads.count;
  const traceNode = differ.paths.get(TRACE_PATH);
  assert.ok(traceNode && traceNode.bytes > 4096, 'fixture must exercise the cold trace path');

  const coldTick = nextSlotTick(traceNode, DOMAIN_COLD_TICKS, 0);
  const unchanged = differ.diff(state, coldTick);
  assert.equal(reads.count, initialReads, 'unchanged trace must not recurse through event payloads');
  assert.equal(traceUpdate(unchanged), undefined, 'unchanged trace must not ship a duplicate');
  assert.equal(
    canonicalSignature(domains.get('combat').trace),
    canonicalSignature(trace),
    'facade retains the complete previously shipped trace',
  );
});

test('same-input trace bypass stays kernel-only across repeated cold passes', (t) => {
  configureDomainMirroring(FULL_TRACE_DIAGNOSTIC_PROFILE);
  const reads = { count: 0 };
  const state = { combat: { trace: makeTrace(reads) } };
  const differ = createDomainDiffer();
  differ.diff(state, 0);
  const before = reads.count;
  const start = process.hrtime.bigint();
  for (let tick = 1; tick <= DOMAIN_COLD_TICKS * 4; tick++) differ.diff(state, tick);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  t.diagnostic(`same-input kernel-only passes: ${DOMAIN_COLD_TICKS * 4} ticks in ${elapsedMs.toFixed(3)}ms`);
  assert.equal(reads.count, before, 'repeated same-input passes must not re-enter event canonicalization');
});

test('append and capacity trim fall back to the exact full-payload path', () => {
  configureDomainMirroring(FULL_TRACE_DIAGNOSTIC_PROFILE);
  const reads = { count: 0 };
  const trace = makeTrace(reads, { count: 8, capacity: 8 });
  const state = { combat: { trace } };
  const differ = createDomainDiffer();
  const domains = new Map();
  const initial = differ.diff(state, 0);
  applyUpdates(domains, initial);
  const traceNode = differ.paths.get(TRACE_PATH);
  const coldTick = nextSlotTick(traceNode, DOMAIN_COLD_TICKS, 0);
  differ.diff(state, coldTick);
  const readsBeforeAppend = reads.count;

  const appended = makeEvent(trace.nextSeq, reads, 'append');
  trace.events.push(appended);
  trace.events.shift();
  trace.dropped += 1;
  trace.nextSeq += 1;
  trace.hashU32 = (trace.hashU32 + 1) >>> 0;
  trace.digest = '811c9dc6';
  const trimTick = nextSlotTick(traceNode, DOMAIN_COLD_TICKS, coldTick);
  const trimmed = differ.diff(state, trimTick);
  assert.ok(reads.count > readsBeforeAppend, 'trimmed append must re-enter canonical traversal');
  assertFullTracePayload(traceUpdate(trimmed), trace, 'trimmed append');
  applyUpdates(domains, trimmed);
  assert.equal(
    canonicalSignature(domains.get('combat').trace),
    canonicalSignature(trace),
    'trimmed append facade remains exact',
  );
});

test('trace replacement, scalar watermark changes, and unknown shape never bypass exact signing', () => {
  configureDomainMirroring(FULL_TRACE_DIAGNOSTIC_PROFILE);
  const reads = { count: 0 };
  const trace = makeTrace(reads);
  const state = { combat: { trace } };
  const differ = createDomainDiffer();
  const initial = differ.diff(state, 0);
  const traceNode = differ.paths.get(TRACE_PATH);
  let tick = nextSlotTick(traceNode, DOMAIN_COLD_TICKS, 0);
  differ.diff(state, tick);

  const cases = [
    ['capacity', () => { trace.capacity += 1; }],
    ['hashU32', () => { trace.hashU32 = (trace.hashU32 + 7) >>> 0; }],
    ['digest', () => { trace.digest = '811c9dcc'; }],
    ['dropped', () => { trace.dropped += 1; }],
    ['nextSeq', () => { trace.nextSeq += 1; }],
    ['event-array replacement', () => { trace.events = trace.events.slice(); }],
    ['event replacement', () => { trace.events[0] = makeEvent(1, reads, 'replacement'); }],
    ['middle event replacement', () => { trace.events[1] = makeEvent(2, reads, 'middle-replacement'); }],
  ];
  for (const [label, mutate] of cases) {
    const before = reads.count;
    mutate();
    tick = nextSlotTick(traceNode, DOMAIN_COLD_TICKS, tick);
    const reply = differ.diff(state, tick);
    assert.ok(reads.count > before, `${label} must force exact canonical traversal`);
    if (label === 'event-array replacement') {
      assert.equal(traceUpdate(reply), undefined, `${label} keeps identical wire content`);
    } else {
      assertFullTracePayload(traceUpdate(reply), trace, label);
    }
  }

  const beforeUnknown = reads.count;
  trace.futureProducerField = 'unknown';
  tick = nextSlotTick(traceNode, DOMAIN_COLD_TICKS, tick);
  const unknown = differ.diff(state, tick);
  assert.ok(reads.count > beforeUnknown, 'unknown trace fields must disable the watermark');
  assertFullTracePayload(traceUpdate(unknown), trace, 'unknown shape');
});

test('combat trace reset replaces the watermark and ships the new complete record', () => {
  configureDomainMirroring(FULL_TRACE_DIAGNOSTIC_PROFILE);
  const reads = { count: 0 };
  const firstTrace = makeTrace(reads, { suffix: 'first' });
  const state = { combat: { trace: firstTrace } };
  const differ = createDomainDiffer();
  const domains = new Map();
  applyUpdates(domains, differ.diff(state, 0));
  const combatNode = differ.paths.get('combat');
  let tick = nextSlotTick(combatNode, 10, 0);
  state.combat = {};
  const cleared = differ.diff(state, tick);
  assert.ok(traceDelete(cleared), 'reset must delete the old trace path');
  applyUpdates(domains, cleared);

  const replacementReads = { count: 0 };
  const replacement = makeTrace(replacementReads, { suffix: 'reset', count: 11 });
  state.combat = { trace: replacement };
  tick = nextSlotTick(combatNode, 10, tick);
  const restored = differ.diff(state, tick);
  assertFullTracePayload(traceUpdate(restored), replacement, 'reset replacement');
  applyUpdates(domains, restored);
  assert.equal(
    canonicalSignature(domains.get('combat').trace),
    canonicalSignature(replacement),
    'reset replacement facade remains exact',
  );
});

test('station profile projects the newest player impact without cloning the trace', () => {
  configureDomainMirroring(createDomainMirroringProfile('station'));
  const reads = { count: 0 };
  const payload = (label) => {
    const event = {
      seq: label,
      tick: label,
      kind: 'trace.test',
      targetId: 99,
    };
    Object.defineProperty(event, 'payload', {
      enumerable: true,
      get() {
        reads.count++;
        return 'large-' + 'x'.repeat(4096);
      },
    });
    return event;
  };
  const trace = {
    nextSeq: 5,
    capacity: 32,
    events: [
      {
        seq: 1, tick: 3, kind: 'damage.routed', targetId: 7,
        origin: { kind: 'weapon', id: 'wpn_test' }, payload: payload(1),
      },
      {
        seq: 2, tick: 4, kind: 'physics.impulse', targetId: 7,
        reason: 'weapon_hit', payload: payload(2),
      },
      {
        seq: 3, tick: 7, kind: 'damage.routed', targetId: 7,
        origin: { kind: 'impulse_charge', id: 'charge' }, payload: payload(3),
      },
      payload(4),
    ],
    dropped: 0,
    hashU32: 0x811c9dc5,
    digest: '811c9dc5',
  };
  const state = { playerId: 7, combat: { trace } };
  const differ = createDomainDiffer();
  const domains = new Map();
  const initial = differ.diff(state, 0);
  const update = traceUpdate(initial);
  assert.ok(update);
  assert.deepEqual(update.v, {
    playerId: 7,
    latestPlayerImpact: { tick: 7, cause: 'shove' },
  });
  assert.ok(update.bytes < 256, 'presentation payload stays bounded');
  assert.equal(reads.count, 0, 'projection does not read or clone unrelated event payloads');
  applyUpdates(domains, initial);
  assert.deepEqual(domains.get('combat').trace, update.v);

  const traceNode = differ.paths.get(TRACE_PATH);
  const playerSwitchTick = 1;
  state.playerId = 99;
  const switched = differ.diff(state, playerSwitchTick);
  assert.deepEqual(traceUpdate(switched).v, {
    playerId: 99,
    latestPlayerImpact: null,
  }, 'a player identity change invalidates the retained projection');
  assert.equal(reads.count, 0);

  const replacement = {
    nextSeq: 2,
    capacity: 32,
    events: [{
      seq: 1, tick: 42, kind: 'collision.consequence', targetId: 99,
      surface: 'terrain',
    }],
    dropped: 0,
    hashU32: 0x811c9dc5,
    digest: '811c9dc5',
  };
  state.playerId = 99;
  state.combat = { trace: replacement };
  const replacementTick = nextSlotTick(traceNode, 10, playerSwitchTick);
  const restored = differ.diff(state, replacementTick);
  assert.deepEqual(traceUpdate(restored).v, {
    playerId: 99,
    latestPlayerImpact: { tick: 42, cause: 'rock' },
  }, 'a replacement trace gets a fresh immutable presentation snapshot');
  assert.equal(replacement.events.length, 1, 'source trace remains authoritative and intact');
});
