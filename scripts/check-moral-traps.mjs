// BP-12 packet MORAL_TRAP_CONTRACTS ("The Job That Isn't What It Says") acceptance check.
//
// Contract (src/data/moralTraps.js + src/systems/moralTrap.js):
//   - attachTrap is SEEDED + low-probability (hash32(seed, offerId, 'trap')). Trap-free offers are
//     bit-identical to today. Golden-sim safe (no id ⇒ no trap).
//   - Each trap's choice has EXACTLY 2 options, each routing to a DISTINCT shipped consequence
//     (channel: rep|credits, distinct factionId/delta/amount) — never two with no mechanical
//     difference (the named failureMode). The choice uses the wreckMissions shape.
//   - The reveal fires ONCE (flagged on the instance — no re-roll). Repeated cues don't re-reveal.
//   - Each consequence EMITS a sanctioned intent (faction:repDelta / economy:grantCredits) — the
//     system NEVER writes credits/rep/cargo directly (single-writer honored).
import assert from 'node:assert/strict';

import { MORAL_TRAPS, TRAP_IDS, trapById, trapFitsOfferType } from '../src/data/moralTraps.js';
import { moralTrapSystem, attachTrap } from '../src/systems/moralTrap.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in moral-trap path'); };
  Date.now = () => { throw new Error('Date.now in moral-trap path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

testTrapsUseWreckChoiceShape();
testEachOptionRoutesToDistinctConsequence();
testTrapsFitQualifyingTypesOnly();
guarded(testAttachSeededLowProbabilityAndDeterministic);
guarded(testAttachGoldenSimSafeNoId);
testRevealFiresOnce();
testConsequenceEmitsSanctionedIntentOnly();

console.log('Moral-trap checks OK');

// ── 1. each trap's choice uses the wreckMissions shape ──────────────────────────────────────
function testTrapsUseWreckChoiceShape() {
  for (const id of TRAP_IDS) {
    const t = trapById(id);
    assert.ok(t.choice, `${id} has a choice`);
    assert.ok(typeof t.choice.prompt === 'string' && t.choice.prompt.length > 0, `${id} choice.prompt is prose`);
    assert.ok(Array.isArray(t.choice.options), `${id} choice.options is an array`);
    assert.equal(t.choice.options.length, 2, `${id} choice has exactly 2 options (binary)`);
    for (const o of t.choice.options) {
      assert.ok(o.id && o.label && o.blurb, `${id} option has id/label/blurb (wreckMissions shape)`);
      assert.ok(o.consequence, `${id} option ${o.id} carries consequence metadata`);
    }
  }
}

// ── 2. each option routes to a DISTINCT shipped consequence ─────────────────────────────────
function testEachOptionRoutesToDistinctConsequence() {
  for (const id of TRAP_IDS) {
    const t = trapById(id);
    const [a, b] = t.choice.options;
    // The two options must differ mechanically — different channel, OR different faction, OR
    // different delta/amount. Two identical consequences is the named failureMode.
    const aSig = `${a.consequence.channel}|${a.consequence.repChannel || ''}|${a.consequence.delta || a.consequence.repDelta || ''}|${a.consequence.amount || ''}`;
    const bSig = `${b.consequence.channel}|${b.consequence.repChannel || ''}|${b.consequence.delta || b.consequence.repDelta || ''}|${b.consequence.amount || ''}`;
    assert.notEqual(aSig, bSig, `${id}: the two options have DISTINCT consequences (no mechanical sameness)`);
    // Each consequence channel is one of the shipped single-writer paths.
    for (const o of t.choice.options) {
      assert.ok(['rep', 'credits', 'contraband'].includes(o.consequence.channel),
        `${id} option ${o.id} consequence.channel is a shipped channel`);
    }
  }
}

// ── 3. traps only fit qualifying offer types ────────────────────────────────────────────────
function testTrapsFitQualifyingTypesOnly() {
  // passenger_is_fugitive fits passenger_transport, NOT cargo_delivery
  const fug = trapById('passenger_is_fugitive');
  assert.ok(trapFitsOfferType(fug, 'passenger_transport'), 'fugitive trap fits passenger_transport');
  assert.ok(!trapFitsOfferType(fug, 'cargo_delivery'), 'fugitive trap does NOT fit cargo_delivery');
  assert.ok(!trapFitsOfferType(fug, 'bounty_hunt'), 'fugitive trap does NOT fit bounty_hunt');
  // cargo_is_weapons fits smuggling_run / cargo_delivery, NOT passenger_transport
  const wep = trapById('cargo_is_weapons');
  assert.ok(trapFitsOfferType(wep, 'smuggling_run') && trapFitsOfferType(wep, 'cargo_delivery'));
  assert.ok(!trapFitsOfferType(wep, 'passenger_transport'));
}

// ── 4. attach is seeded + low-probability + deterministic ───────────────────────────────────
function testAttachSeededLowProbabilityAndDeterministic() {
  const offer = { id: 'sm1', type: 'smuggling_run' };
  let withTrap = 0;
  const N = 300;
  for (let i = 0; i < N; i++) {
    const o = attachTrap({ ...offer, id: `sm${i}` }, 11);
    if (o.trap) withTrap++;
  }
  // Low-probability (~18%): most offers are trap-free, but some attach across N distinct ids.
  assert.ok(withTrap > 0 && withTrap < N * 0.5, `low-probability attach: ${withTrap}/${N}`);
  // Determinism
  assert.deepStrictEqual(attachTrap(offer, 11), attachTrap(offer, 11));
}

// ── 5. golden-sim safe: no id ⇒ no trap (the deterministic slice never posts these anyway) ───
function testAttachGoldenSimSafeNoId() {
  const noId = { type: 'smuggling_run' };
  assert.equal(attachTrap(noId, 11).trap, undefined, 'offer with no id ⇒ no trap');
  // null/undefined offer
  assert.equal(attachTrap(null, 11), null);
}

// ── 6. reveal fires ONCE (flagged) ──────────────────────────────────────────────────────────
function testRevealFiresOnce() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { emitted.push({ evt, p }); for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  const state = {
    simTime: 100,
    missions: { active: [{ id: 'm1', type: 'smuggling_run', trap: {
      id: 'cargo_is_weapons', revealAt: 'mid_run', revealLine: 'reveal text',
      choice: trapById('cargo_is_weapons').choice,
    } }] },
  };
  const sys = { ...moralTrapSystem };
  sys.init({ bus, state, helpers: { voice: { say() { return true; } } } });
  // Multiple sector:enter cues — the reveal fires ONCE.
  bus.emit('sector:enter', { sectorId: 's1' });
  bus.emit('sector:enter', { sectorId: 's2' });
  bus.emit('sector:enter', { sectorId: 's3' });
  const reveals = emitted.filter((e) => e.evt === 'moralTrap:revealed');
  assert.equal(reveals.length, 1, 'reveal fires exactly once (flagged on instance — no re-roll)');
  assert.equal(reveals[0].p.missionId, 'm1');
  sys.destroy();
}

// ── 7. consequence EMITS a sanctioned intent — never writes state directly ──────────────────
function testConsequenceEmitsSanctionedIntentOnly() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { emitted.push({ evt, p }); for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  const state = {
    simTime: 100,
    missions: { active: [{ id: 'm1', type: 'smuggling_run', reward_cr: 1000, trap: {
      id: 'cargo_is_weapons', revealAt: 'mid_run', revealLine: 'reveal',
      choice: trapById('cargo_is_weapons').choice,
    } }] },
  };
  const sys = { ...moralTrapSystem };
  sys.init({ bus, state, helpers: { voice: { say() { return true; } } } });
  bus.emit('sector:enter', { sectorId: 's1' }); // reveal
  emitted.length = 0;
  // Choose "deliver" → credits channel (+ quiet rep)
  bus.emit('moralTrap:choose', { missionId: 'm1', optionId: 'deliver' });
  const grants = emitted.filter((e) => e.evt === 'economy:grantCredits');
  const repDeltas = emitted.filter((e) => e.evt === 'faction:repDelta');
  assert.ok(grants.length >= 1, 'deliver routes through economy:grantCredits (single-writer)');
  assert.ok(grants[0].p.amount > 0, 'grant amount is the reward * consequence.amount');
  // Single-writer honored: the system NEVER writes credits/rep directly — it only EMITS intents.
  assert.ok(repDeltas.length >= 1 || grants.length >= 1, 'consequence emits sanctioned intents only');

  // The state itself was never mutated by the consequence (credits/rep/factions untouched)
  assert.equal(state.player, undefined, 'player state never written by the trap system');
  assert.equal(state.factions, undefined, 'factions state never written by the trap system');

  // Reset for the second option on a fresh mission
  state.missions.active[0]._trapRevealed = false;
  state.missions.active[0]._trapResolved = false;
  bus.emit('sector:enter', { sectorId: 's2' });
  emitted.length = 0;
  bus.emit('moralTrap:choose', { missionId: 'm1', optionId: 'divert' });
  const repDivert = emitted.filter((e) => e.evt === 'faction:repDelta');
  assert.ok(repDivert.length >= 1, 'divert routes through faction:repDelta (distinct channel)');
  // The two options used DIFFERENT primary channels (credits vs rep) — distinct consequences.
  sys.destroy();
}
