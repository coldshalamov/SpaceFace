// r2-m18-honest-shortcut.test.mjs — M18 "honest shortcut" delivery punctuality bonus.
//
// Row 389: a DELIVERY contract where local geometry knowledge (anchor sling plus honest
// braking and runout) earns a BOUNDED punctuality bonus on top of base pay — never replacing
// it. Slice: one new mission condition (`honest_sling`) on `cargo_delivery` that pays a bounded
// premium when the player logged a clean/razor Massline release (the anchor sling) and still
// delivers early while under control at the berth (honest braking and runout).
//
// Drives the REAL systems: missions + contractClausesSystem on a real simulation, the real
// `tether:releaseRated` event the tether owner emits, the real settleContractClauses payout.
// Fixed seed 4242.
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import {
  MISSION_CONDITIONS,
  HONEST_SLING_SLING_WINDOW_S,
  HONEST_SLING_EARLY_FRACTION,
} from '../src/data/missionConditions.js';
import { settleContractClauses } from '../src/data/contractClauses.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

function boot(seed = 4242) {
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
    of: (evt) => emitted.filter((e) => e.evt === evt),
    clear: () => { emitted.length = 0; },
  };
}

/** Push a live active cargo_delivery carrying the honest-sling term. */
function activateDelivery(h, { reward = 1000, acceptedAt = 100, durationS = 600 } = {}) {
  const def = MISSION_CONDITIONS.honest_sling;
  const mission = {
    id: 'm_r2m18_honest',
    type: 'cargo_delivery', status: 'active', factionId: 'faction_mts',
    params: { cmdtyId: 'cmdty_food', qty: 8 },
    objectiveProgress: 1, objectiveTarget: 1,
    reward_cr: reward, collateral_cr: 0, riskTier: 2,
    destStationId: 'station_helios', destSectorId: null, distance: 400,
    targetEntityIds: [], acceptedAt_s: acceptedAt, deadline_s: acceptedAt + durationS,
    title: 'Test delivery', clauses: [{
      id: def.id, conditionId: def.id, kind: def.kind, event: def.event || null,
      label: def.label, prose: def.prose, rewardMult: def.rewardMult,
    }],
  };
  h.state.missions.active.push(mission);
  return mission;
}

function step(h, seconds) {
  const ticks = Math.max(1, Math.round(seconds / SIM_DT));
  for (let i = 0; i < ticks; i++) h.sim.step(SIM_DT);
}

// ── positive: sling + early controlled delivery pays base + bounded bonus ────────────────
{
  const h = boot();
  const m = activateDelivery(h, { reward: 1000, acceptedAt: 100, durationS: 600 });
  const berth = h.sim.spawn({
    type: 'station', pos: { x: 4000, z: 0 }, radius: 60, collides: false,
    data: { stationId: 'station_helios' },
  });
  h.clear();

  // Run the clock to mid-window first: a sling fired at the epoch start must still read as
  // fresh, and the arrival below must land well inside the window.
  h.state.simTime = 100 + 10;
  // The anchor sling: a deliberate clean release from the player's own line, through the
  // REAL tether:releaseRated event the tether owner emits. It stamps the sling half (1 of 2);
  // the arrival half latches on the tick below.
  h.sim.bus.emit('tether:releaseRated', {
    sourceId: h.state.playerId, targetId: 999,
    classification: 'clean', deliberate: true,
  });
  assert.equal((m._clauseState.honest_sling || {}).count, 1,
    'a clean player release must stamp the sling half of the honest shortcut');
  assert.equal(h.of('mission:conditionSatisfied').length, 0,
    'the sling alone must not satisfy the term — arrival must follow');

  // Honest braking and runout: hold alongside the berth, under control, well inside the
  // window. The per-tick arrival half samples live state, so park the player at a live berth.
  h.player.pos = { x: berth.pos.x - 600, z: 0 };
  h.player.vel = { x: 10, z: 0 };
  step(h, 1.5);
  assert.equal(h.of('mission:conditionSatisfied').length, 1,
    'early controlled arrival after the sling must latch the honest shortcut');
  const settled = settleContractClauses(m);
  const expect = Math.round(1000 * MISSION_CONDITIONS.honest_sling.rewardMult);
  assert.equal(settled.rewardCr, expect,
    `early slung delivery must pay base + bounded bonus (1000 -> ${expect}), got ${settled.rewardCr}`);
  assert.ok(settled.rewardCr > 1000, 'the bonus lands ON TOP of base pay — never replacing it');
  assert.ok(settled.rewardCr <= Math.round(1000 * 1.5),
    'the punctuality premium must stay bounded (cap 1.5x)');
}

// ── negative: no sling, no bonus — base pay only ──────────────────────────────────────────
{
  const h = boot();
  const m = activateDelivery(h, { reward: 1000, acceptedAt: 100, durationS: 600 });
  h.clear();

  // Nobody touched the line. Delivering early and under control alone earns nothing extra.
  h.state.simTime = 100 + 600 * HONEST_SLING_EARLY_FRACTION - 10;
  const settled = settleContractClauses(m);
  assert.equal(settled.rewardCr, 1000, 'delivery without the sling pays exactly base pay');
  assert.deepEqual([...settled.unmet], ['honest_sling'], 'the unearned term reads as unmet, never a breach');
  assert.equal(settled.breached.length, 0, 'missing the shortcut must never fail or void the contract');
  assert.equal(m.status, 'active', 'the contract stays live — the shortcut is premium-only');
}

// ── negative: sloppy release, no bonus ────────────────────────────────────────────────────
{
  const h = boot();
  const m = activateDelivery(h, { reward: 1000, acceptedAt: 100, durationS: 600 });
  h.clear();

  // A messy cut is not local-geometry knowledge.
  h.sim.bus.emit('tether:releaseRated', {
    sourceId: h.state.playerId, targetId: 999,
    classification: 'messy', deliberate: true,
  });
  assert.equal(h.of('mission:conditionSatisfied').length, 0,
    'a messy release must not latch the sling half');
  h.state.simTime = 100 + 10;
  assert.equal(settleContractClauses(m).rewardCr, 1000,
    'a sloppy release earns no shortcut premium');
}

// ── negative: someone else's line, no bonus ──────────────────────────────────────────────
{
  const h = boot();
  const m = activateDelivery(h, { reward: 1000, acceptedAt: 100, durationS: 600 });
  h.clear();

  h.sim.bus.emit('tether:releaseRated', {
    sourceId: 'npc_7', targetId: 999,
    classification: 'razor', deliberate: true,
  });
  assert.equal(h.of('mission:conditionSatisfied').length, 0,
    "another pilot's release must not credit the player's contract");
  assert.equal(settleContractClauses(m).rewardCr, 1000, 'base pay only');
}

// ── the term is told up front, in plain words ─────────────────────────────────────────────
{
  const def = MISSION_CONDITIONS.honest_sling;
  assert.ok(def && def.appliesTo.includes('cargo_delivery'), 'the shortcut prices delivery runs');
  assert.ok(def.kind === 'require' && def.blocking !== true, 'premium-only: never blocks the turn-in');
  assert.ok(def.rewardMult > 1 && def.rewardMult <= 1.5, 'a bounded premium on top of base pay');
  assert.ok(def.pendingText && !/[_]/.test(def.pendingText.split('—')[0]),
    'the unmet line must read as plain words, never a raw id');
  assert.ok(/sling/i.test(def.prose) && /brak/i.test(def.prose),
    'the dossier prose must name the sling and the controlled arrival');
  assert.ok(Number.isFinite(HONEST_SLING_SLING_WINDOW_S) && Number.isFinite(HONEST_SLING_EARLY_FRACTION),
    'the tuning thresholds must be exported numbers');
}

// ── the sling receipt goes stale: an old swing is not punctuality ─────────────────────────
{
  const h = boot();
  const m = activateDelivery(h, { reward: 1000, acceptedAt: 100, durationS: 600 });
  const berth = h.sim.spawn({
    type: 'station', pos: { x: 4000, z: 0 }, radius: 60, collides: false,
    data: { stationId: 'station_helios' },
  });
  h.clear();

  // Sling mid-window, then sit at the berth under control — but ride the clock past the
  // sling window before the arrival half can hold for its grace period. The tick arm's
  // staleness gate refuses the stamp, so settlement finds 1 of 2: unmet, never a breach.
  h.state.simTime = 100 + 10;
  h.sim.bus.emit('tether:releaseRated', {
    sourceId: h.state.playerId, targetId: 999,
    classification: 'razor', deliberate: true,
  });
  assert.equal((m._clauseState.honest_sling || {}).count, 1, 'the release stamps the sling half');
  h.player.pos = { x: berth.pos.x - 600, z: 0 };
  h.player.vel = { x: 10, z: 0 };
  h.state.simTime = 100 + HONEST_SLING_SLING_WINDOW_S + 30;
  step(h, 1.5);
  assert.equal(h.of('mission:conditionSatisfied').length, 0,
    'a stale swing must never latch the arrival half');
  const settled = settleContractClauses(m);
  assert.equal(settled.rewardCr, 1000, 'a stale sling pays no shortcut premium');
  assert.deepEqual([...settled.unmet], ['honest_sling'], 'the stale term reads as unmet, never a breach');
}

// ── two releases alone must never satisfy the term (fix-r3b-6 finding 13) ──────────
// Drives the REAL producer path: the tether owner's tether:releaseRated event through
// contractClauses._scoreCondition into the shared tally. Two clean deliberate releases at
// times 90 and 91 — both AFTER the 60 s early window — must leave the term at 1 of 2.
{
  const h = boot();
  const m = activateDelivery(h, { reward: 1000, acceptedAt: 0, durationS: 100 });
  h.clear();
  h.state.simTime = 90;
  h.sim.bus.emit('tether:releaseRated', {
    sourceId: h.state.playerId, targetId: 999,
    classification: 'clean', deliberate: true,
  });
  h.state.simTime = 91;
  h.sim.bus.emit('tether:releaseRated', {
    sourceId: h.state.playerId, targetId: 999,
    classification: 'clean', deliberate: true,
  });
  const rt = m._clauseState.honest_sling || {};
  assert.equal(rt.count, 1,
    'the second release must refresh the swing, not stamp arrival — two releases are 1 of 2');
  assert.ok(!rt.satisfied,
    'two releases with no arrival must never satisfy the honest shortcut');
  assert.equal(settleContractClauses(m).rewardCr, 1000,
    'a late double-release with no arrival pays exactly base pay');
}

// ── release then LATE arrival earns no premium (fix-r3b-6 finding 13) ────────────
// Fresh clean release at t=10, then an under-control berth arrival at t=90 — after the
// 60 s early window. The arrival half's window gate refuses the stamp: 1 of 2, base pay.
{
  const h = boot();
  const m = activateDelivery(h, { reward: 1000, acceptedAt: 0, durationS: 100 });
  const berth = h.sim.spawn({
    type: 'station', pos: { x: 4000, z: 0 }, radius: 60, collides: false,
    data: { stationId: 'station_helios' },
  });
  h.clear();
  h.state.simTime = 10;
  h.sim.bus.emit('tether:releaseRated', {
    sourceId: h.state.playerId, targetId: 999,
    classification: 'clean', deliberate: true,
  });
  h.state.simTime = 90;
  h.player.pos = { x: berth.pos.x - 600, z: 0 };
  h.player.vel = { x: 10, z: 0 };
  step(h, 2);
  const rt = m._clauseState.honest_sling || {};
  assert.equal(rt.count, 1, 'a late arrival must not stamp the arrival half');
  assert.ok(!rt.satisfied, 'a late arrival must not satisfy the honest shortcut');
  assert.equal(settleContractClauses(m).rewardCr, 1000,
    'a fresh release followed by a late arrival pays exactly base pay');
}

console.log('r2-m18 honest shortcut OK — sling + early controlled delivery pays a bounded bonus on top of base pay.');
