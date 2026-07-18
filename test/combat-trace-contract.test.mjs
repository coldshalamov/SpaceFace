/**
 * W02 combat-trace contract suite.
 *
 * Pins append / order / filter / ring-drop / reset-resume reality / repeated-run
 * equality / canonicalize edges / purity / API surface for src/combat/trace.js.
 *
 * Save/load intentionally does NOT carry combat.trace (see serializeCombatState);
 * §5 characterizes that current intentional semantics, not a defect.
 *
 * Packet: design/program/roadmap/04_WORLD_CONTENT_RELEASE.md W02
 * Base: 4c367cd7
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import * as combatTrace from '../src/combat/trace.js';
import {
  appendCombatTrace,
  canonicalize,
  ensureCombatTrace,
  readCombatTrace,
  stableStringify,
} from '../src/combat/trace.js';

const TRACE_MODULE_PATH = join(dirname(fileURLToPath(import.meta.url)), '../src/combat/trace.js');

/** FNV-1a offset basis as 8-char hex (empty-trace digest). */
const FNV_OFFSET_HEX = '811c9dc5';

/** Exact public export names — any change is a deliberate contract change. */
const EXPECTED_EXPORTS = [
  'appendCombatTrace',
  'canonicalize',
  'ensureCombatTrace',
  'readCombatTrace',
  'stableStringify',
];

/**
 * §1 fixed append sequence fields (insertion shapes vary; canonicalize sorts).
 * Nested object, Set, Map, undefined field, float needing 1e6 rounding.
 */
const CANONICAL_SEQUENCE = [
  {
    tick: 10,
    kind: 'hit',
    fields: {
      actorId: 'a1',
      targetId: 't1',
      damage: 12.3456789,
      tags: new Set(['b', 'a']),
      meta: { z: 1, a: 2 },
      dropped: undefined,
    },
  },
  {
    tick: 11,
    kind: 'miss',
    fields: {
      actorId: 'a1',
      reason: 'range',
    },
  },
  {
    tick: 12,
    kind: 'hit',
    fields: {
      actorId: 'a2',
      targetId: 't1',
      damage: 1.0000004,
      bag: new Map([
        ['y', 2],
        ['x', 1],
      ]),
    },
  },
  {
    tick: 13,
    kind: 'kill',
    fields: {
      actorId: 'a2',
      targetId: 't1',
    },
  },
];

/**
 * Hard-coded pre-digest stableStringify vectors (hash input without event.digest).
 * Derived once from the real module; frozen as independent literals.
 */
const EXPECTED_EVENT_JSON = [
  '{"actorId":"a1","damage":12.345679,"kind":"hit","meta":{"a":2,"z":1},"seq":1,"tags":["a","b"],"targetId":"t1","tick":10}',
  '{"actorId":"a1","kind":"miss","reason":"range","seq":2,"tick":11}',
  '{"actorId":"a2","bag":[["x",1],["y",2]],"damage":1,"kind":"hit","seq":3,"targetId":"t1","tick":12}',
  '{"actorId":"a2","kind":"kill","seq":4,"targetId":"t1","tick":13}',
];

/** Cumulative digest hex after each append in CANONICAL_SEQUENCE. */
const EXPECTED_DIGESTS = ['4092a6cc', 'd0f78039', '9ec5a9bc', '6041e6ee'];

/** Ring probe: capacity 4, six simple appends — digests after 4 and after 6. */
const RING_DIGEST_AFTER_4 = 'd7a6fbb1';
const RING_DIGEST_AFTER_6 = '119590e3';

function payloadWithoutDigest(event) {
  const { digest: _digest, ...payload } = event;
  return payload;
}

function appendCanonicalSequence(combat) {
  const events = [];
  for (const step of CANONICAL_SEQUENCE) {
    events.push(appendCombatTrace(combat, step.tick, step.kind, step.fields));
  }
  return events;
}

// ---------------------------------------------------------------------------
// §1 CANONICAL VECTORS
// ---------------------------------------------------------------------------
describe('§1 CANONICAL VECTORS', () => {
  it('pins stableStringify encodings and cumulative digests for a fixed 4-event sequence', () => {
    const combat = {};
    ensureCombatTrace(combat);

    for (let i = 0; i < CANONICAL_SEQUENCE.length; i++) {
      const step = CANONICAL_SEQUENCE[i];
      const event = appendCombatTrace(combat, step.tick, step.kind, step.fields);

      assert.equal(
        stableStringify(payloadWithoutDigest(event)),
        EXPECTED_EVENT_JSON[i],
        `event ${i + 1} encoding`,
      );
      assert.equal(event.digest, EXPECTED_DIGESTS[i], `event ${i + 1} digest`);
      assert.equal(combat.trace.digest, EXPECTED_DIGESTS[i], `cumulative digest after append ${i + 1}`);
    }

    assert.equal(combat.trace.digest, '6041e6ee');
    assert.equal(combat.trace.nextSeq, 5);
    assert.equal(combat.trace.dropped, 0);
    assert.equal(combat.trace.events.length, 4);
  });
});
// ---------------------------------------------------------------------------
// §2 EVENT ORDER
// ---------------------------------------------------------------------------
describe('§2 EVENT ORDER', () => {
  it('starts seq at 1 and increments monotonically; read order equals append order', () => {
    const combat = {};
    ensureCombatTrace(combat);
    const kinds = ['alpha', 'bravo', 'charlie', 'delta'];
    const appended = kinds.map((kind, i) => appendCombatTrace(combat, 100 + i, kind, { i }));

    assert.deepEqual(
      appended.map((e) => e.seq),
      [1, 2, 3, 4],
    );
    for (let i = 1; i < appended.length; i++) {
      assert.ok(appended[i].seq > appended[i - 1].seq, 'seq strictly increases');
    }

    const read = readCombatTrace(combat);
    assert.deepEqual(
      read.events.map((e) => e.seq),
      [1, 2, 3, 4],
    );
    assert.deepEqual(
      read.events.map((e) => e.kind),
      kinds,
    );
  });

  it('interleaved kinds preserve global append order', () => {
    const combat = {};
    ensureCombatTrace(combat);
    appendCombatTrace(combat, 1, 'hit', { actorId: 'a' });
    appendCombatTrace(combat, 2, 'miss', { actorId: 'b' });
    appendCombatTrace(combat, 3, 'hit', { actorId: 'c' });
    appendCombatTrace(combat, 4, 'kill', { actorId: 'd' });
    appendCombatTrace(combat, 5, 'miss', { actorId: 'e' });

    const read = readCombatTrace(combat);
    assert.deepEqual(
      read.events.map((e) => ({ seq: e.seq, kind: e.kind, actorId: e.actorId })),
      [
        { seq: 1, kind: 'hit', actorId: 'a' },
        { seq: 2, kind: 'miss', actorId: 'b' },
        { seq: 3, kind: 'hit', actorId: 'c' },
        { seq: 4, kind: 'kill', actorId: 'd' },
        { seq: 5, kind: 'miss', actorId: 'e' },
      ],
    );
  });
});

// ---------------------------------------------------------------------------
// §3 FILTERS
// ---------------------------------------------------------------------------
describe('§3 FILTERS', () => {
  function seededCombat() {
    const combat = {};
    ensureCombatTrace(combat);
    appendCombatTrace(combat, 1, 'hit', { actorId: 'a1', targetId: 't1' });
    appendCombatTrace(combat, 2, 'miss', { actorId: 'a1', targetId: 't2' });
    appendCombatTrace(combat, 3, 'hit', { actorId: 'a2', targetId: 't1' });
    appendCombatTrace(combat, 4, 'kill', { actorId: 'a2', targetId: 't1' });
    appendCombatTrace(combat, 5, 'hit', { actorId: 'a1', targetId: 't3' });
    return combat;
  }

  it('filters by sinceSeq (boundary sinceSeq == seq pinned from both sides)', () => {
    const combat = seededCombat();

    // sinceSeq == 2 excludes seq 2 (event.seq <= sinceSeq); includes 3+
    const at2 = readCombatTrace(combat, { sinceSeq: 2 });
    assert.deepEqual(
      at2.events.map((e) => e.seq),
      [3, 4, 5],
    );

    // one below: sinceSeq == 1 still includes seq 2
    const at1 = readCombatTrace(combat, { sinceSeq: 1 });
    assert.deepEqual(
      at1.events.map((e) => e.seq),
      [2, 3, 4, 5],
    );

    // one above: sinceSeq == 3 drops seq 3
    const at3 = readCombatTrace(combat, { sinceSeq: 3 });
    assert.deepEqual(
      at3.events.map((e) => e.seq),
      [4, 5],
    );
  });

  it('filters by kinds', () => {
    const combat = seededCombat();
    const hits = readCombatTrace(combat, { kinds: ['hit'] });
    assert.deepEqual(
      hits.events.map((e) => e.seq),
      [1, 3, 5],
    );
    const multi = readCombatTrace(combat, { kinds: ['miss', 'kill'] });
    assert.deepEqual(
      multi.events.map((e) => ({ seq: e.seq, kind: e.kind })),
      [
        { seq: 2, kind: 'miss' },
        { seq: 4, kind: 'kill' },
      ],
    );
  });

  it('filters by actorId', () => {
    const combat = seededCombat();
    const a1 = readCombatTrace(combat, { actorId: 'a1' });
    assert.deepEqual(
      a1.events.map((e) => e.seq),
      [1, 2, 5],
    );
  });

  it('filters by targetId', () => {
    const combat = seededCombat();
    const t1 = readCombatTrace(combat, { targetId: 't1' });
    assert.deepEqual(
      t1.events.map((e) => e.seq),
      [1, 3, 4],
    );
  });

  it('filters by limit', () => {
    const combat = seededCombat();
    const limited = readCombatTrace(combat, { limit: 2 });
    assert.equal(limited.events.length, 2);
    assert.deepEqual(
      limited.events.map((e) => e.seq),
      [1, 2],
    );
    const one = readCombatTrace(combat, { limit: 1 });
    assert.deepEqual(
      one.events.map((e) => e.seq),
      [1],
    );
    // Current implementation checks limit after push, so limit:0 still yields one
    // matching event when any exist (characterize reality; see integration note).
    const zero = readCombatTrace(combat, { limit: 0 });
    assert.equal(zero.events.length, 1);
    assert.equal(zero.events[0].seq, 1);
  });

  it('applies combined sinceSeq + kinds + actorId + targetId + limit', () => {
    const combat = seededCombat();
    // After seq 1: hits by a1 on any target, cap 1
    // candidates: seq 5 hit a1 t3 (seq 1 excluded by sinceSeq)
    const combined = readCombatTrace(combat, {
      sinceSeq: 1,
      kinds: ['hit'],
      actorId: 'a1',
      limit: 1,
    });
    assert.equal(combined.events.length, 1);
    assert.equal(combined.events[0].seq, 5);
    assert.equal(combined.events[0].kind, 'hit');
    assert.equal(combined.events[0].actorId, 'a1');

    // tighter: hit by a2 on t1 after seq 2 → only seq 3
    const tight = readCombatTrace(combat, {
      sinceSeq: 2,
      kinds: ['hit'],
      actorId: 'a2',
      targetId: 't1',
      limit: 10,
    });
    assert.deepEqual(
      tight.events.map((e) => e.seq),
      [3],
    );
  });

  it('returns schema envelope with nextSeq, dropped, digest', () => {
    const combat = seededCombat();
    const read = readCombatTrace(combat);
    assert.equal(read.schemaVersion, 1);
    assert.equal(read.nextSeq, 6);
    assert.equal(read.dropped, 0);
    assert.equal(typeof read.digest, 'string');
    assert.equal(read.digest.length, 8);
  });
});

// ---------------------------------------------------------------------------
// §4 RING/DROP
// ---------------------------------------------------------------------------
describe('§4 RING/DROP', () => {
  it('capacity 4 + 6 appends drops oldest 2; digest still reflects all 6', () => {
    const combat = {};
    ensureCombatTrace(combat, 4);
    assert.equal(combat.trace.capacity, 4);

    for (let i = 0; i < 4; i++) {
      appendCombatTrace(combat, i + 1, `k${i}`, { n: i });
    }
    assert.equal(combat.trace.events.length, 4);
    assert.equal(combat.trace.dropped, 0);
    assert.equal(combat.trace.digest, RING_DIGEST_AFTER_4);

    for (let i = 4; i < 6; i++) {
      appendCombatTrace(combat, i + 1, `k${i}`, { n: i });
    }

    assert.equal(combat.trace.events.length, 4);
    assert.equal(combat.trace.dropped, 2);
    assert.deepEqual(
      combat.trace.events.map((e) => e.seq),
      [3, 4, 5, 6],
    );
    assert.equal(combat.trace.digest, RING_DIGEST_AFTER_6);
    assert.notEqual(RING_DIGEST_AFTER_6, RING_DIGEST_AFTER_4);

    const read = readCombatTrace(combat);
    assert.equal(read.dropped, 2);
    assert.equal(read.digest, RING_DIGEST_AFTER_6);
    assert.equal(read.events.length, 4);
    assert.equal(read.nextSeq, 7);
  });
});

// ---------------------------------------------------------------------------
// §5 RESET/RESUME REALITY (save/load starts a fresh trace — intentional)
// ---------------------------------------------------------------------------
describe('§5 RESET/RESUME REALITY: save/load starts a fresh trace (current intentional semantics)', () => {
  it('fresh combat bag + ensureCombatTrace after "load" has empty events, nextSeq 1, FNV offset digest', () => {
    // Session A: live combat with a non-empty trace
    const combatA = {};
    ensureCombatTrace(combatA);
    appendCanonicalSequence(combatA);
    assert.equal(combatA.trace.events.length, 4);
    assert.equal(combatA.trace.digest, '6041e6ee');
    assert.equal(combatA.trace.nextSeq, 5);

    // Simulate what load does today: serializeCombatState does not carry trace;
    // restore rebuilds a fresh combat object and ensureCombatTrace initializes empty.
    const combatB = {};
    const traceB = ensureCombatTrace(combatB);

    assert.deepEqual(traceB.events, []);
    assert.equal(traceB.nextSeq, 1);
    assert.equal(traceB.dropped, 0);
    assert.equal(traceB.digest, FNV_OFFSET_HEX);
    assert.equal(traceB.hashU32, 0x811c9dc5);

    const readB = readCombatTrace(combatB);
    assert.equal(readB.schemaVersion, 1);
    assert.equal(readB.nextSeq, 1);
    assert.equal(readB.dropped, 0);
    assert.equal(readB.digest, FNV_OFFSET_HEX);
    assert.deepEqual(readB.events, []);

    // Resume appends restart seq at 1 on the loaded bag (no continuity with A).
    const first = appendCombatTrace(combatB, 99, 'resume', { note: 'after-load' });
    assert.equal(first.seq, 1);
    assert.notEqual(combatB.trace.digest, combatA.trace.digest);
  });
});

// ---------------------------------------------------------------------------
// §6 REPEATED-RUN EQUALITY
// ---------------------------------------------------------------------------
describe('§6 REPEATED-RUN EQUALITY', () => {
  it('same append sequence on two fresh bags yields byte-equal readCombatTrace and equal digests', () => {
    const bagA = {};
    const bagB = {};
    ensureCombatTrace(bagA);
    ensureCombatTrace(bagB);
    appendCanonicalSequence(bagA);
    appendCanonicalSequence(bagB);

    const readA = readCombatTrace(bagA);
    const readB = readCombatTrace(bagB);
    assert.equal(JSON.stringify(readA), JSON.stringify(readB));
    assert.equal(readA.digest, readB.digest);
    assert.equal(readA.digest, '6041e6ee');
  });

  it('field insertion order is irrelevant for event encoding and digest', () => {
    const bagA = {};
    const bagB = {};
    ensureCombatTrace(bagA);
    ensureCombatTrace(bagB);
    appendCombatTrace(bagA, 1, 'hit', { a: 1, b: 2, c: 3 });
    appendCombatTrace(bagB, 1, 'hit', { c: 3, b: 2, a: 1 });

    assert.equal(
      stableStringify(payloadWithoutDigest(bagA.trace.events[0])),
      stableStringify(payloadWithoutDigest(bagB.trace.events[0])),
    );
    assert.equal(bagA.trace.digest, bagB.trace.digest);
    assert.equal(JSON.stringify(readCombatTrace(bagA)), JSON.stringify(readCombatTrace(bagB)));
  });

  it('float rounding: deltas <= 1e-7 collapse equal; 1e-5 stays distinct (hard-coded)', () => {
    // 1e6 rounding: Math.round(v * 1e6) / 1e6
    assert.equal(canonicalize(1), 1);
    assert.equal(canonicalize(1 + 1e-7), 1);
    assert.equal(stableStringify(1), stableStringify(1 + 1e-7));
    assert.equal(stableStringify(1), '1');

    assert.equal(canonicalize(1 + 1e-5), 1.00001);
    assert.equal(stableStringify(1 + 1e-5), '1.00001');
    assert.notEqual(stableStringify(1), stableStringify(1 + 1e-5));

    const bagClose = {};
    const bagSame = {};
    ensureCombatTrace(bagClose);
    ensureCombatTrace(bagSame);
    appendCombatTrace(bagClose, 1, 'dmg', { amount: 1 + 1e-7 });
    appendCombatTrace(bagSame, 1, 'dmg', { amount: 1 });
    assert.equal(bagClose.trace.digest, bagSame.trace.digest);

    const bagFar = {};
    ensureCombatTrace(bagFar);
    appendCombatTrace(bagFar, 1, 'dmg', { amount: 1 + 1e-5 });
    assert.notEqual(bagFar.trace.digest, bagSame.trace.digest);
  });
});

// ---------------------------------------------------------------------------
// §7 CANONICALIZE EDGES
// ---------------------------------------------------------------------------
describe('§7 CANONICALIZE EDGES', () => {
  it('non-finite numbers become string form (pinned literals)', () => {
    assert.equal(canonicalize(NaN), 'NaN');
    assert.equal(canonicalize(Infinity), 'Infinity');
    assert.equal(canonicalize(-Infinity), '-Infinity');
    assert.equal(stableStringify(NaN), '"NaN"');
    assert.equal(stableStringify(Infinity), '"Infinity"');
    assert.equal(stableStringify(-Infinity), '"-Infinity"');
  });

  it('Map and Set produce sorted canonical output (pinned)', () => {
    assert.equal(stableStringify(new Map([
      ['b', 2],
      ['a', 1],
    ])), '[["a",1],["b",2]]');
    assert.equal(stableStringify(new Set([3, 1, 2])), '[1,2,3]');
  });

  it('undefined fields are dropped; nested object keys are sorted (pinned)', () => {
    assert.equal(
      stableStringify({ z: 1, a: 2, skip: undefined, keep: true }),
      '{"a":2,"keep":true,"z":1}',
    );
    assert.equal(
      stableStringify({ z: { b: 1, a: 2 }, m: 0 }),
      '{"m":0,"z":{"a":2,"b":1}}',
    );
  });

  it('integerTick clamps tick -3 and 2.7 to 0; tick 3 stays 3 (both sides)', () => {
    const combat = {};
    ensureCombatTrace(combat);
    const neg = appendCombatTrace(combat, -3, 'neg');
    const frac = appendCombatTrace(combat, 2.7, 'frac');
    const ok = appendCombatTrace(combat, 3, 'ok');
    const zero = appendCombatTrace(combat, 0, 'zero');

    assert.equal(neg.tick, 0);
    assert.equal(frac.tick, 0);
    assert.equal(ok.tick, 3);
    assert.equal(zero.tick, 0);

    // both sides of the integer boundary around 3
    const combat2 = {};
    ensureCombatTrace(combat2);
    const below = appendCombatTrace(combat2, 2.999999, 'below');
    const exact = appendCombatTrace(combat2, 3, 'exact');
    const above = appendCombatTrace(combat2, 4, 'above');
    assert.equal(below.tick, 0);
    assert.equal(exact.tick, 3);
    assert.equal(above.tick, 4);
  });
});

// ---------------------------------------------------------------------------
// §8 PURITY (static)
// ---------------------------------------------------------------------------
describe('§8 PURITY (static)', () => {
  it('trace module has no ambient time/random, no three import, no NUL bytes', () => {
    const source = readFileSync(TRACE_MODULE_PATH);
    assert.equal(source.includes(0x00), false, 'module must not contain raw NUL bytes');

    const text = source.toString('utf8');
    const forbidden = [
      'Math.random',
      'Date.now',
      'performance.now',
      'new Date(',
      'setTimeout',
    ];
    for (const needle of forbidden) {
      assert.equal(text.includes(needle), false, `must not contain ${needle}`);
    }
    assert.equal(/from\s+['"]three['"]/.test(text), false, "must not import from 'three'");
    assert.equal(/require\s*\(\s*['"]three['"]\s*\)/.test(text), false, "must not require 'three'");
  });
});

// ---------------------------------------------------------------------------
// §9 API SURFACE HONESTY
// ---------------------------------------------------------------------------
describe('§9 API SURFACE HONESTY', () => {
  it('exports exactly the known public set and has NO reset export', () => {
    const names = Object.keys(combatTrace).sort();
    assert.deepEqual(names, EXPECTED_EXPORTS);
    assert.equal(Object.hasOwn(combatTrace, 'reset'), false);
    assert.equal(Object.hasOwn(combatTrace, 'resetCombatTrace'), false);
    assert.equal(typeof combatTrace.reset, 'undefined');
  });
});
