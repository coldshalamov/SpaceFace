#!/usr/bin/env node
// check-mission-conditions.mjs — BEHAVIOURAL regression for the physics-aware mission condition
// language (design/PHYSICAL_PLAY_GRAMMAR.md §9.9 / §9.9.1).
//
// WHAT THIS PROTECTS. Before this language existed a mission could express success in exactly two
// ways — `counter >= N` or `docked at station X` — and `missions.update()` evaluated nothing per
// frame except the deadline. Eleven mission types therefore collapsed onto eleven verbs. The fix is
// one array (`mission.clauses`, now carrying physics terms as well as fine print) plus one observer.
//
// HOW IT TESTS. Every assertion below DRIVES THE LIVE SYSTEMS on a real simulation and asserts an
// OUTCOME — a mission failed, a payout multiplied, a turn-in refused, an alert spoken. There is
// exactly one source-text assertion in this file (emitter reachability) and it is justified in place
// against the packet's own named failure mode; everything else is behaviour.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { attachConditions, contractClausesSystem } from '../src/systems/contractClauses.js';
import {
  MISSION_CONDITIONS,
  MISSION_CONDITION_IDS,
  MISSION_CONDITION_EVENTS,
  TICK_CONDITION_IDS,
  STEADY_SPEED_LIMIT,
  BERTH_RANGE_WU,
  BERTH_SPEED,
} from '../src/data/missionConditions.js';
import { settleContractClauses, unsatisfiedRequiredConditions } from '../src/data/contractClauses.js';
import { MISSION_TYPES } from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';

// A small, stable slice of the real world graph — enough stations to guarantee conditioned offers
// without walking all 47 sectors on every CI run.
const SECTORS_FOR_LEGIBILITY = SECTORS.slice(0, 10);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(typeof window, 'undefined', 'this check must run headless');

// ── harness ───────────────────────────────────────────────────────────────────────────────────
function boot(seed = 8081) {
  const sim = createSimulation({ seed, systems: [missions, contractClausesSystem] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 6, hull: 100, hullMax: 100, collides: true, data: {},
  });
  state.playerId = player.id;
  state.player.credits = 100000;
  const emitted = [];
  const rawEmit = sim.bus.emit.bind(sim.bus);
  sim.bus.emit = (evt, p) => { emitted.push({ evt, p }); return rawEmit(evt, p); };
  return {
    sim, state, player, emitted,
    missionsSys: sim.registry.get('missions'),
    clear: () => { emitted.length = 0; },
    of: (evt) => emitted.filter((e) => e.evt === evt),
  };
}

/** Push a live active mission carrying the named condition ids. */
function activate(h, { type, conditions, destStationId = null, objectiveTarget = 1, reward = 1000 }) {
  const rows = conditions.map((id) => {
    const c = MISSION_CONDITIONS[id];
    return {
      id: c.id, conditionId: c.id, kind: c.kind, event: c.event || null,
      label: c.label, prose: c.prose, rewardMult: c.rewardMult,
    };
  });
  const mission = {
    id: `m_test_${type}_${conditions.join('_')}`,
    type, status: 'active', factionId: 'faction_mts',
    params: {}, objectiveProgress: 0, objectiveTarget,
    reward_cr: reward, collateral_cr: 0, riskTier: 2,
    destStationId, destSectorId: null, distance: 400,
    targetEntityIds: [], acceptedAt_s: 0, deadline_s: null,
    title: 'Test contract', clauses: rows,
  };
  h.state.missions.active.push(mission);
  return mission;
}

function step(h, seconds) {
  const ticks = Math.max(1, Math.round(seconds / SIM_DT));
  for (let i = 0; i < ticks; i++) h.sim.step(SIM_DT);
}

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in the mission-condition path'); };
  Date.now = () => { throw new Error('Date.now in the mission-condition path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────
testEveryConditionEventHasALiveEmitter();
testNoKillEventTermOnAKillCountedType();
testEveryConditionReachesARealMissionType();
guarded(testAttachIsSeededAndDeterministic);
guarded(testTermFreeOfferIsUnchanged);
guarded(testRiskTierIsAVerbModifier);
testForbidEventTermFailsTheContractThroughTheShippedPath();
testTickTermWarnsBeforeItTripsAndOnlyForfeitsThePremium();
testBlockingRequireTermRefusesTheTurnInThenSettles();
testMultiCountRequireTermCountsUpAndPaysThePremium();
testConditionRuntimeStateSurvivesSerialization();
testTermsAreLegibleBeforeAndAtAccept();

console.log(`Mission conditions OK — ${MISSION_CONDITION_IDS.length} physics terms, `
  + `${MISSION_CONDITION_EVENTS.length} observed events, ${TICK_CONDITION_IDS.length} per-tick predicates.`);

// ── 1. every condition keys off an event something actually emits ─────────────────────────────
// THE ONE SOURCE SCAN IN THIS FILE, and it exists for a cited failure, not for taste. The packet
// that introduced contract terms names "a clause whose predicate a system can't observe" as its
// failure mode, and grammar §9.9 records that ~60 physics events are emitted and evaluated by
// nothing — the exact inverse mistake is authoring a term on an event nothing emits, which produces
// a `require` the player can never satisfy. Behaviour cannot catch that: the observer wires up fine,
// the term simply never fires. So we assert the producer exists.
function testEveryConditionEventHasALiveEmitter() {
  const sources = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (full.endsWith('.js')) sources.push(readFileSync(full, 'utf8'));
    }
  })(join(ROOT, 'src'));
  const blob = sources.join('\n');
  for (const event of MISSION_CONDITION_EVENTS) {
    assert.ok(blob.includes(`emit('${event}'`),
      `condition event ${event} must have a live emitter in src/ — a term nothing emits is a term the player cannot satisfy`);
  }
}

// ── 2. no kill-keyed term on a type whose objective counts kills ──────────────────────────────
// CITED HAZARD, verified in the live tree: missions._onKill skips objective progress entirely for a
// mission that observes `entity:killed` (missions.js, `missionObservesClauseEvent(m, 'entity:killed')`),
// so a kill-keyed term on bounty_hunt / patrol_clear makes that contract permanently uncompletable.
function testNoKillEventTermOnAKillCountedType() {
  const killCounted = new Set(['bounty_hunt', 'patrol_clear']);
  for (const id of MISSION_CONDITION_IDS) {
    const c = MISSION_CONDITIONS[id];
    if (c.event !== 'entity:killed') continue;
    for (const type of c.appliesTo) {
      assert.ok(!killCounted.has(type),
        `${id} keys off entity:killed and would freeze ${type}'s kill counter — see missions._onKill`);
    }
  }
}

// ── 3. no orphan terms ────────────────────────────────────────────────────────────────────────
function testEveryConditionReachesARealMissionType() {
  const known = new Set(MISSION_TYPES.map((t) => t.type));
  known.add('bulk_haul'); // the tether-haul type is minted by missions.js, not MISSION_TYPES
  for (const id of MISSION_CONDITION_IDS) {
    const c = MISSION_CONDITIONS[id];
    assert.ok(Array.isArray(c.appliesTo) && c.appliesTo.length, `${id} names at least one mission type`);
    for (const type of c.appliesTo) {
      assert.ok(known.has(type), `${id} applies to unknown mission type ${type}`);
    }
    assert.ok(c.label && c.prose && c.brief, `${id} must be legible before accept (label/prose/brief)`);
    if (c.kind === 'forbid') assert.ok(c.breachText, `${id} must tell the player the moment it trips`);
    if (c.kind === 'require') assert.ok(c.pendingText, `${id} must explain an unmet requirement`);
    assert.ok(c.rewardMult >= 1, `${id} pays a premium; it is never a penalty multiplier`);
  }
}

// ── 4. attachment is seeded and reproduces exactly ────────────────────────────────────────────
function testAttachIsSeededAndDeterministic() {
  const offer = { id: 'mo_x_1_0', type: 'cargo_delivery', riskTier: 3, params: { cmdtyId: 'cmdty_food', qty: 8 } };
  const a = attachConditions(offer, 991, { isFragile: () => false });
  const b = attachConditions(offer, 991, { isFragile: () => false });
  assert.deepEqual(a.clauses, b.clauses, 'the same (seed, offerId) must reproduce the same terms exactly');
  let drew = 0;
  for (let i = 0; i < 240; i++) {
    const o = attachConditions({ ...offer, id: `mo_x_1_${i}` }, 991, { isFragile: () => false });
    if (o.clauses && o.clauses.length) drew++;
  }
  assert.ok(drew > 0, 'risk-3 cargo offers must be able to draw a physics term');
  assert.ok(drew < 240, 'a physics term must never be certain — "every job has terms" is its own monotony');
}

// ── 5. a term-free offer is the SAME OBJECT SHAPE as before ───────────────────────────────────
function testTermFreeOfferIsUnchanged() {
  const base = { id: 'mo_none', type: 'recon_scan', riskTier: 0, params: { scanTargets: 2 } };
  let free = null;
  for (let s = 1; s < 200 && !free; s++) {
    const o = attachConditions(base, s, { isFragile: () => false });
    if (!o.clauses) free = o;
  }
  assert.ok(free, 'a term-free attachment must exist');
  assert.equal(free, base, 'a no-draw must return the ORIGINAL offer object — nothing may perturb a golden');
}

// ── 6. risk tier is a verb modifier, not just a payout multiplier ─────────────────────────────
function testRiskTierIsAVerbModifier() {
  const draws = [0, 4].map((riskTier) => {
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const o = attachConditions(
        { id: `mo_r${riskTier}_${i}`, type: 'cargo_delivery', riskTier, params: { cmdtyId: 'cmdty_food', qty: 8 } },
        4242, { isFragile: () => false },
      );
      if (o.clauses && o.clauses.length) n++;
    }
    return n;
  });
  assert.ok(draws[1] > draws[0] * 1.5,
    `high-risk offers must carry physical terms far more often than safe ones (R0 ${draws[0]} vs R4 ${draws[1]})`);
}

// ── 7. forbid + fail: the ONE shipped penalty path, exactly once, no credit writes ────────────
function testForbidEventTermFailsTheContractThroughTheShippedPath() {
  const h = boot();
  const m = activate(h, { type: 'escort', conditions: ['weapons_cold'] });
  h.clear();

  // Someone else shooting must not touch the contract.
  h.sim.bus.emit('combat:fire', { ownerId: 'npc_7', weaponId: 'w_pulse' });
  assert.equal(h.state.missions.active.includes(m), true, 'an NPC firing must not void a weapons-cold run');

  // The player firing does, once.
  h.sim.bus.emit('combat:fire', { ownerId: h.state.playerId, weaponId: 'w_pulse' });
  h.sim.bus.emit('combat:fire', { ownerId: h.state.playerId, weaponId: 'w_pulse' });

  assert.equal(h.of('contract:clauseBroken').length, 1, 'breach fires exactly once (latched on the instance)');
  assert.equal(h.of('mission:conditionBroken').length, 1, 'the condition reports itself exactly once');
  assert.equal(h.of('mission:failed').length, 1, 'a fail-grade term routes through the canonical mission fail path');
  assert.equal(h.state.missions.active.includes(m), false, 'the failed contract leaves the active list');
  const observerWrites = h.of('economy:grantCredits').concat(h.of('economy:chargeCredits'))
    .filter((e) => String(e.p && e.p.reason || '').includes('condition'));
  assert.equal(observerWrites.length, 0, 'the observer never writes credits — one penalty path, never two');
}

// ── 8. tick term: warned at t=0, trips only after the hold window, premium-only consequence ───
function testTickTermWarnsBeforeItTripsAndOnlyForfeitsThePremium() {
  const h = boot();
  const m = activate(h, { type: 'cargo_delivery', conditions: ['steady_hands'], reward: 1000 });
  h.clear();

  // Under the ceiling: nothing at all happens, and no runtime state is invented.
  h.player.vel = { x: STEADY_SPEED_LIMIT - 10, z: 0 };
  step(h, 4);
  assert.equal(h.of('alert').length, 0, 'a compliant run must be silent');
  assert.equal(h.of('mission:conditionBroken').length, 0, 'a compliant run must not trip the term');

  // Over the ceiling, but for less than the hold window: warned, NOT breached.
  h.player.vel = { x: STEADY_SPEED_LIMIT + 25, z: 0 };
  step(h, MISSION_CONDITIONS.steady_hands.holdS * 0.5);
  const warns = h.of('alert').filter((e) => e.p && e.p.key === 'mission-term-steady_hands');
  assert.ok(warns.length >= 1, 'the player must be warned the instant the watched state goes bad');
  assert.equal(h.of('mission:conditionBroken').length, 0,
    'a brief overshoot inside the grace window must never void a term — trackpad fairness');

  // Drop back under: the hold resets, so an intermittent overshoot never accumulates.
  h.player.vel = { x: 0, z: 0 };
  step(h, 1);
  assert.equal(h.of('mission:conditionBroken').length, 0, 'the hold window must reset when the state recovers');

  // Sustained: now it trips.
  h.player.vel = { x: STEADY_SPEED_LIMIT + 25, z: 0 };
  step(h, MISSION_CONDITIONS.steady_hands.holdS + 0.5);
  assert.equal(h.of('mission:conditionBroken').length, 1, 'sustained violation trips the term exactly once');
  assert.equal(h.of('mission:failed').length, 0, 'a forfeit-grade term must NOT void the contract');
  assert.equal(h.state.missions.active.includes(m), true, 'the player keeps the contract and keeps playing');

  // ...and the premium is gone from the settlement, not the base reward.
  const settled = settleContractClauses(m);
  assert.equal(settled.rewardMult, 1, 'a broken term pays no premium');
  assert.equal(settled.rewardCr, 1000, 'the base reward is untouched by a forfeited premium');
  assert.deepEqual([...settled.breached], ['steady_hands'], 'the receipt names the broken term');
}

// ── 9. blocking require: the turn-in is REFUSED with a reason, then settles ───────────────────
function testBlockingRequireTermRefusesTheTurnInThenSettles() {
  const h = boot();
  const berth = h.sim.spawn({
    type: 'station', pos: { x: 4000, z: 0 }, radius: 60, collides: false,
    data: { stationId: 'station_helios' },
  });
  const m = activate(h, {
    type: 'cargo_delivery', conditions: ['soft_berth'], destStationId: 'station_helios', reward: 800,
  });
  m.objectiveProgress = 1;
  h.clear();

  // Objective met, term unmet: completing is refused and the player is told why.
  h.missionsSys._completeMission(m, h.state.missions.active.indexOf(m));
  assert.equal(h.of('mission:completed').length, 0, 'a blocking physics term must refuse the turn-in');
  assert.equal(h.of('mission:conditionPending').length, 1, 'the refusal must name the term');
  const pendingToast = h.of('toast').find((e) => /alongside/i.test(String(e.p && e.p.text || '')));
  assert.ok(pendingToast, 'the refusal must tell the player what to actually do about it');
  assert.equal(m.status, 'active', 'a refused turn-in leaves the contract alive');
  assert.equal(unsatisfiedRequiredConditions(m).length, 1, 'the term is still outstanding');

  // Arrive alongside, under control, and hold.
  h.player.pos = { x: berth.pos.x - (BERTH_RANGE_WU - 100), z: 0 };
  h.player.vel = { x: BERTH_SPEED - 10, z: 0 };
  step(h, MISSION_CONDITIONS.soft_berth.holdS + 0.4);

  assert.equal(h.of('mission:conditionSatisfied').length, 1, 'coming alongside under control satisfies the term');
  assert.equal(unsatisfiedRequiredConditions(m).length, 0, 'nothing is outstanding once satisfied');
  assert.equal(h.of('mission:completed').length, 1,
    'a contract held back only on a physics term settles the moment the term latches — no second dock');
  const settled = settleContractClauses(m);
  assert.ok(settled.rewardMult > 1, 'a satisfied require term pays its premium');
}

// ── 10. multi-count require: visible progress, then the premium ───────────────────────────────
function testMultiCountRequireTermCountsUpAndPaysThePremium() {
  const h = boot();
  const m = activate(h, { type: 'mining_quota', conditions: ['vent_rhythm'], reward: 500 });
  const need = MISSION_CONDITIONS.vent_rhythm.count;
  h.clear();

  // Someone else's beam does not count.
  h.sim.bus.emit('mining:ventBonus', { minerId: 'npc_3', qty: 4 });
  assert.equal(h.of('mission:conditionProgress').length, 0, 'another miner must not fill the player\'s quota term');

  for (let i = 0; i < need - 1; i++) {
    h.sim.bus.emit('mining:ventBonus', { minerId: h.state.playerId, qty: 3, depth: 0.5 });
  }
  assert.equal(h.of('mission:conditionProgress').length, need - 1, 'partial progress is reported every time');
  assert.equal(h.of('mission:conditionSatisfied').length, 0, 'the term does not latch early');

  h.sim.bus.emit('mining:ventBonus', { minerId: h.state.playerId, qty: 3, depth: 0.9 });
  assert.equal(h.of('mission:conditionSatisfied').length, 1, 'the Nth occurrence latches the term');

  // A satisfied require pays; an unsatisfied one pays nothing but is not a breach.
  const settled = settleContractClauses(m);
  assert.equal(settled.rewardCr, Math.round(500 * MISSION_CONDITIONS.vent_rhythm.rewardMult),
    'the premium multiplies the base reward');
  assert.equal(settled.breached.length, 0, 'a satisfied require term is not a breach');

  const untouched = activate(h, { type: 'mining_quota', conditions: ['core_on_the_line'], reward: 500 });
  const unmet = settleContractClauses(untouched);
  assert.equal(unmet.rewardCr, 500, 'an unmet require term simply pays no premium');
  assert.deepEqual([...unmet.unmet], ['core_on_the_line'], 'and it is reported as unmet, not as a breach');
  assert.equal(unmet.breached.length, 0, 'an unmet require term must never read as a broken contract');
}

// ── 11. condition progress is save-safe ───────────────────────────────────────────────────────
function testConditionRuntimeStateSurvivesSerialization() {
  const h = boot();
  const m = activate(h, { type: 'mining_quota', conditions: ['vent_rhythm'], reward: 500 });
  h.sim.bus.emit('mining:ventBonus', { minerId: h.state.playerId, qty: 3 });

  const blob = JSON.parse(JSON.stringify(h.missionsSys.serialize()));
  const restored = (blob.active || []).find((a) => a.id === m.id);
  assert.ok(restored, 'the mission survives serialization');
  assert.deepEqual(restored.clauses, m.clauses, 'physics terms are plain JSON and round-trip exactly');
  assert.equal(restored._clauseState.vent_rhythm.count, 1,
    'in-progress term counts round-trip — a reload must not silently reset contract progress');

  h.missionsSys.deserialize(blob);
  const live = h.state.missions.active.find((a) => a.id === m.id);
  assert.equal(live._clauseState.vent_rhythm.count, 1, 'and they are restored on load');
}

// ── 12. the rule is told UP FRONT, on real generated offers ───────────────────────────────────
// "A hidden condition is a bug." The two surfaces that exist before the player commits are the
// station dossier's clause tag row (label + prose tooltip, rendered straight from `offer.clauses`)
// and the one-line brief the Mission Log and star chart print. Both are asserted on offers produced
// by the REAL board generator, not on hand-built fixtures.
function testTermsAreLegibleBeforeAndAtAccept() {
  const h = boot(4711);
  let checked = 0;
  let acceptChecked = 0;
  for (const sector of SECTORS_FOR_LEGIBILITY) {
    for (const station of sector.stations || []) {
      const board = h.missionsSys.ensureBoard(station.id);
      for (const offer of (board && board.slots) || []) {
        const rows = (offer.clauses || []).filter((r) => r && r.conditionId);
        if (!rows.length) continue;
        checked++;
        for (const row of rows) {
          const def = MISSION_CONDITIONS[row.conditionId];
          assert.ok(row.label && row.label === def.label,
            `${offer.id} tag row must carry the dossier label for ${row.conditionId}`);
          assert.ok(row.prose && row.prose === def.prose,
            `${offer.id} tag row must carry the dossier tooltip prose for ${row.conditionId}`);
          assert.ok(String(offer.brief || '').includes(def.brief),
            `${offer.id} brief must name the term before accept — got: ${offer.brief}`);
        }
        if (acceptChecked === 0) {
          // ...and again in the accept confirmation, for a player who never opened the dossier.
          h.state.missions.active.length = 0;
          h.clear();
          assert.equal(h.missionsSys.acceptMission(offer.id), true, `probe should accept ${offer.id}`);
          const accepted = h.of('toast').map((e) => String(e.p && e.p.text || '')).find((t) => t.startsWith('Mission accepted'));
          assert.ok(accepted, 'accepting must confirm through the shipped transaction toast');
          for (const row of rows) {
            assert.ok(accepted.includes(MISSION_CONDITIONS[row.conditionId].brief),
              `the accept confirmation must repeat the terms — got: ${accepted}`);
          }
          acceptChecked++;
        }
      }
    }
  }
  assert.ok(checked >= 20, `real boards must actually produce conditioned offers (saw ${checked})`);
  assert.equal(acceptChecked, 1, 'at least one conditioned offer must be acceptable end to end');
}
