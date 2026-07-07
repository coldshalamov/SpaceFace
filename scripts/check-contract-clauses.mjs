// BP-12 packet COLLATERAL_AND_CLAUSES ("Contract Fine Print") acceptance check.
//
// Contract (src/data/contractClauses.js + src/systems/contractClauses.js):
//   - Every clause's `event` is in OBSERVED_CLAUSE_EVENTS (entity:killed / player:scannedByPatrol),
//     EXCEPT time_limit which is resolved internally via the deadline tick (a sentinel event a system
//     DOES observe — missions.update()'s m.deadline_s check). A clause a system can't observe is
//     forbidden (the named failureMode).
//   - attachClauses is SEEDED (hash32(seed, offerId, 'clause')) and clause-free is the common case
//     (ATTACH_PROB). A clause-free offer is bit-identical to today.
//   - On breach the system emits `contract:clauseBroken` { missionId, clauseId, event } EXACTLY ONCE
//     per clause (flagged). It NEVER writes credits/cargo/rep — breach routes through the ONE shipped
//     collateral-forfeit path (double-penalizing is the failureMode).
//   - HONOR: a clause-bearing mission that completes clean emits `contract:clauseHonored`.
import assert from 'node:assert/strict';

import {
  CONTRACT_CLAUSES, OBSERVED_CLAUSE_EVENTS, CLAUSE_IDS, clauseById,
} from '../src/data/contractClauses.js';
import {
  contractClausesSystem, attachClauses,
} from '../src/systems/contractClauses.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in contract-clauses path'); };
  Date.now = () => { throw new Error('Date.now in contract-clauses path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

testAllClausesMapToObservedEvents();
testCatalogContents();
guarded(testAttachIsSeededAndOftenClauseFree);
guarded(testAttachOnlyObservedEventTypeAppropriate);
guarded(testAttachDeterminism);
testBreachEmitsOnceAndNeverWritesCredits();
testCleanCompletionEmitsHonored();
testClauseFreeOfferUnchanged();

console.log('Contract-clauses checks OK');

// ── 1. every clause maps to an event a system can observe ───────────────────────────────────
function testAllClausesMapToObservedEvents() {
  const observed = new Set(OBSERVED_CLAUSE_EVENTS);
  for (const id of CLAUSE_IDS) {
    const c = CONTRACT_CLAUSES[id];
    assert.ok(c.event, `${id} has an event`);
    // time_limit is the one internally-resolved sentinel (missions.update deadline tick); all others
    // MUST be a directly-observed bus event.
    assert.ok(observed.has(c.event) || c.event === 'time_limit',
      `${id}.event (${c.event}) is observable by missions (a clause a system can't observe is forbidden)`);
  }
}

// ── 2. catalog has the spec's named clauses + reward modifiers ───────────────────────────────
function testCatalogContents() {
  for (const id of ['no_kills', 'cargo_intact', 'no_scan', 'time_limit', 'rescue_priority']) {
    const c = clauseById(id);
    assert.ok(c, `${id} in catalog`);
    assert.ok(typeof c.breachOn === 'function', `${id} has a breachOn predicate`);
    assert.ok(c.rewardMult >= 1, `${id} rewardMult >= 1 (honor bonus, not a penalty)`);
    assert.ok(c.label && c.prose, `${id} has label + prose`);
  }
}

// ── 3. attach is seeded + clause-free is the common case ────────────────────────────────────
function testAttachIsSeededAndOftenClauseFree() {
  const offer = { id: 'm1', type: 'cargo_delivery', reward_cr: 1000 };
  let withClause = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const o = attachClauses({ ...offer, id: `m${i}` }, 7);
    if (o.clauses && o.clauses.length) withClause++;
  }
  // ~35% attach, so we expect SOME but not all, and not zero (the seeded stream must hit attach
  // sometimes across 200 distinct offer ids). Loose bounds to avoid flakiness.
  assert.ok(withClause > 0 && withClause < N, `attach is seeded + partial: ${withClause}/${N}`);
}

// ── 4. attached clauses are observed-event + type-appropriate ───────────────────────────────
function testAttachOnlyObservedEventTypeAppropriate() {
  const observed = new Set(OBSERVED_CLAUSE_EVENTS);
  // cargo_delivery: should only get scan/cargo clauses, NOT no_kills
  const cargo = attachClauses({ id: 'cargoA', type: 'cargo_delivery' }, 99);
  if (cargo.clauses) {
    for (const c of cargo.clauses) {
      assert.ok(observed.has(c.event) || c.event === 'time_limit', 'attached clause event is observed');
      assert.ok(c.id !== 'no_kills', 'cargo_delivery never gets no_kills (type-inappropriate)');
    }
  }
  // escort: can get no_kills / rescue_priority
  const escort = attachClauses({ id: 'escA', type: 'escort' }, 99);
  if (escort.clauses) {
    for (const c of escort.clauses) {
      assert.ok(observed.has(c.event) || c.event === 'time_limit', 'attached clause event is observed');
    }
  }
}

// ── 5. determinism ─────────────────────────────────────────────────────────────────────────
function testAttachDeterminism() {
  const offer = { id: 'det1', type: 'escort' };
  assert.deepStrictEqual(attachClauses(offer, 7), attachClauses(offer, 7),
    'pure: same (seed, offerId) → same attachment');
}

// ── 6. breach emits clauseBroken ONCE; NEVER writes credits/cargo/rep ───────────────────────
function testBreachEmitsOnceAndNeverWritesCredits() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { emitted.push({ evt, p }); for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  const state = {
    simTime: 100, playerId: 'player1',
    missions: { active: [{ id: 'm_kill', type: 'escort', clauses: [{ id: 'no_kills', event: 'entity:killed', label: 'No kills', rewardMult: 1.15 }] }] },
  };
  const sys = { ...contractClausesSystem };
  sys.init({ bus, state, helpers: { voice: { say() { return true; } } } });

  // Two player kills → clauseBroken fires ONCE (flagged on instance).
  bus.emit('entity:killed', { id: 'enemy1', killerId: 'player1' });
  bus.emit('entity:killed', { id: 'enemy2', killerId: 'player1' });
  const breaches = emitted.filter((e) => e.evt === 'contract:clauseBroken');
  assert.equal(breaches.length, 1, 'breach fires exactly once (flagged)');
  assert.equal(breaches[0].p.clauseId, 'no_kills');
  assert.equal(breaches[0].p.missionId, 'm_kill');

  // NEVER writes credits/cargo/rep — single-writer honored.
  const writes = emitted.filter((e) => /economy:(charge|grant)Credits|faction:repDelta|cargo:/.test(e.evt));
  assert.equal(writes.length, 0, 'system NEVER writes credits/cargo/rep — breach routes through the one shipped path');
  sys.destroy();
}

// ── 7. clean completion emits clauseHonored ─────────────────────────────────────────────────
function testCleanCompletionEmitsHonored() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { emitted.push({ evt, p }); for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  const state = {
    simTime: 100, playerId: 'p1',
    missions: { active: [{ id: 'm_clean', type: 'escort', clauses: [{ id: 'no_kills', event: 'entity:killed', label: 'No kills', rewardMult: 1.15 }] }] },
  };
  const sys = { ...contractClausesSystem };
  sys.init({ bus, state, helpers: { voice: { say() { return true; } } } });
  // No kills occur → complete clean → clauseHonored
  bus.emit('mission:completed', { missionId: 'm_clean' });
  const honored = emitted.filter((e) => e.evt === 'contract:clauseHonored');
  assert.equal(honored.length, 1, 'clean completion honors the unbreached clause');
  assert.equal(honored[0].p.clauseId, 'no_kills');
  assert.equal(honored[0].p.rewardMult, 1.15);
  sys.destroy();
}

// ── 8. clause-free offer is bit-identical to today ──────────────────────────────────────────
function testClauseFreeOfferUnchanged() {
  // Force clause-free by using a seed/offerId combo that rolls above ATTACH_PROB. We verify the
  // returned offer has NO clauses key added (beyond the spread copy).
  const base = { id: 'free1', type: 'cargo_delivery', reward_cr: 500, params: { qty: 5 } };
  // Try several seeds to find a clause-free one (the common case).
  let free = null;
  for (let s = 1; s < 50 && !free; s++) {
    const o = attachClauses(base, s);
    if (!o.clauses) free = o;
  }
  assert.ok(free, 'a clause-free attachment exists (the common case)');
  assert.equal(free.clauses, undefined, 'clause-free offer has no clauses key');
  assert.deepEqual(free.params, base.params, 'clause-free offer preserves all original fields');
}
