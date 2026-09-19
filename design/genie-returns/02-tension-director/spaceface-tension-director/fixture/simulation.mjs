/** Fixed-input focused fixture, NOT a full SpaceFace simulation.
 * Real modules: controller, adapter, supplied bus, delivered encounter selection,
 * gate, pressure accrual and legacy/new rhythm consumer.
 * Doubles: content planner, spawn admission, entity materialization, combat and repairs.
 * Every stochastic input passes through this fixture's state.rng. No renderer/AI/physics.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBus } from './eventBus.js';
import { createTensionDirectorSystem } from '../repo/src/systems/tensionDirector.js';
import { loadEncounterConsumer } from './loadEncounterConsumer.mjs';

export const ARCHETYPES = Object.freeze(['hunter', 'prospector', 'improviser']);
export const SEEDS = Object.freeze([4242, 8008]);
export const CATALOG = Object.freeze({
  patrol: { id: 'patrol', deck: 'combat', tier: 'minor', pressureCost: 28, script: 'fixture' },
  ambush: { id: 'ambush', deck: 'combat', tier: 'minor', pressureCost: 35, script: 'fixture' },
  showdown: { id: 'showdown', deck: 'combat', tier: 'major', pressureCost: 60, script: 'fixture' },
  salvage: { id: 'salvage', deck: 'civilian', tier: 'ambient', pressureCost: 14, script: 'fixture' },
  convoy: { id: 'convoy', deck: 'civilian', tier: 'ambient', pressureCost: 18, script: 'fixture' },
});
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rounded = (n) => Math.round(n * 1e6) / 1e6;
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
let consumerPromise;
export function getConsumer() {
  return consumerPromise ||= loadEncounterConsumer({ catalog: CATALOG });
}

export async function runScenario({ archetype = 'hunter', seed = 4242, seconds = 1800,
  enabled = true, checkpointAt = null } = {}) {
  if (!ARCHETYPES.includes(archetype)) throw new TypeError('Unknown fixture archetype');
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) throw new RangeError('seconds: 1..86400');
  if (!Number.isSafeInteger(seed)) throw new TypeError('Seed must be a safe integer');
  const actual = (await getConsumer()).exports;
  const player = { id: 1, alive: true, hull: 100, hullMax: 100, shield: 100, shieldMax: 100,
    pos: { x: 0, y: 0, z: 0 } };
  const state = { simTime: 0, tick: 0, mode: 'flight', playerId: 1,
    player: { flags: {}, credits: 100 }, entities: new Map([[1, player]]),
    settings: { gameplay: { difficulty: 'standard', tensionDirector: enabled } },
    world: { currentSectorId: 'sector_test' }, rng: seeded(seed),
    encounterDirector: { live: {}, pending: [], pressure: { combat: 30, civilian: 20 },
      noise: { mining: 0 }, window: [], cooldowns: {}, stats: { fired: 0, fizzled: 0 },
      lastAmbientAt: -1e9, lastMeaningfulAt: -1e9, lastMajorAt: -1e9, lastEndAt: -1e9 } };
  const bus = createBus(), helpers = {}, d = state.encounterDirector;
  const system = createTensionDirectorSystem({ emitDecisions: false });
  system.init({ state, bus, helpers });
  let entityId = 10, planId = 0, lastRoll = 0, activeHour;
  const timeline = [], changes = [], starvation = [], hours = [], spawnReceipts = [];
  const digest = createHash('sha256');
  let maxSnapshotBytes = 0;
  bus.on('tension:phaseChanged', (p) => changes.push({ ...p }));
  bus.on('tension:starved', (p) => starvation.push({ ...p }));
  // These doubles are intentionally small. The real campaign's gates run BEFORE them.
  const host = Object.assign(Object.create(actual.encounterDirector), {
    state, player: () => player, _currentSectorId: () => 'sector_test', cargoValue: () => 0,
    _spawnAdmissionAvailable: () => state.simTime % 2400 < 600 || state.simTime % 2400 >= 780,
    _fire: (dir, _state, item, shape, now) => {
      const policy = state.tensionDirector.policy;
      if (enabled && shape.deck === 'combat') {
        assert.equal(policy.allowCombat, true, 'combat entered a protected policy window');
        if (shape.tier === 'major') assert.equal(policy.allowMajor, true, 'major bypassed reservation');
      }
      dir.pressure[shape.deck] = Math.max(0, dir.pressure[shape.deck] - shape.pressureCost);
      dir.window.push({ t: now, tier: shape.tier });
      if (shape.tier === 'ambient') dir.lastAmbientAt = now; else dir.lastMeaningfulAt = now;
      if (shape.tier === 'major') dir.lastMajorAt = now;
      const id = ++entityId;
      const entity = { id, alive: true, pos: { x: shape.deck === 'combat' ? 650 : 1200, y: 0, z: 150 } };
      state.entities.set(id, entity);
      dir.live[item.encounterId] = { id: item.encounterId, shapeId: shape.id,
        deck: shape.deck, tier: shape.tier, phase: 'live', sectorId: 'sector_test',
        ids: [id], startedAt: now, lastPlayerExchangeAt: -1e9,
        expiresAt: now + (shape.deck === 'combat' ? (archetype === 'hunter' ? 32 : archetype === 'prospector' ? 105 : 55) : 25) };
      bus.emit('encounter:telegraph', { encounterId: item.encounterId, kind: shape.id,
        deck: shape.deck, tier: shape.tier, sectorId: 'sector_test' });
      bus.emit('encounter:spawned', { encounterId: item.encounterId, kind: shape.id,
        sectorId: 'sector_test', count: 1 });
      dir.stats.fired++;
      activeHour.spawns++; activeHour[shape.deck === 'combat' ? 'combatSpawns' : 'civilianSpawns']++;
      spawnReceipts.push({ t: now, shape: shape.id, deck: shape.deck, phase: enabled ? policy.phase : dir.sessionRhythm.phase });
    },
  });
  function recordDamage(amount, attackerId = 999) {
    const remaining = Math.max(0, amount - player.shield);
    player.shield = Math.max(0, player.shield - amount);
    player.hull = Math.max(1, player.hull - remaining);
    activeHour.damageTaken += amount;
    bus.emit('combat:damage', { targetId: 1, attackerId, applied: amount });
  }
  for (let t = 0; t < seconds; t++) {
    state.simTime = t; state.tick = t * 60;
    lastRoll = state.rng(); // one exogenous random input per second; stable across A/B arms
    const hourIndex = Math.floor(t / 3600);
    if (!hours[hourIndex]) hours[hourIndex] = { hour: hourIndex + 1, seconds: 0,
      spawns: 0, combatSpawns: 0, civilianSpawns: 0, damageTaken: 0, phases: {}, policyDecisions: 0 };
    activeHour = hours[hourIndex]; activeHour.seconds++;
    // Materialization supply deliberately vanishes periodically: the controller must not fake a peak.
    const supplyOff = t % 7200 >= 3000 && t % 7200 < 3360;
    if (supplyOff) d.pending = [];
    if (!supplyOff && t % 45 === 0 && d.pending.length < 20) {
      const index = Math.floor(lastRoll * 5), shape = Object.values(CATALOG)[index];
      d.pending.push({ encounterId: `fixture:${seed}:${++planId}`, shapeId: shape.id,
        deck: shape.deck, dueAt: t + 2, defers: 0, data: {}, sectorId: 'sector_test' });
    }
    let inCombat = false;
    for (const [key, live] of Object.entries(d.live)) {
      if (t >= live.expiresAt) {
        if (live.deck === 'combat') {
          if (archetype !== 'prospector') bus.emit('entity:killed', { id: live.ids[0], killerId: 1 });
          activeHour.resolvedCombat = (activeHour.resolvedCombat || 0) + 1;
        } else if (live.shapeId === 'salvage') {
          bus.emit('pickup:collected', { collectorId: 1, pickupId: live.ids[0] });
        }
        for (const id of live.ids) state.entities.delete(id);
        delete d.live[key]; d.lastEndAt = t;
        bus.emit('encounter:resolved', { encounterId: key, deck: live.deck, outcome: 'fixture_resolved', sectorId: 'sector_test' });
      } else if (live.deck === 'combat') {
        inCombat = true;
        if (t % 6 === 0) {
          live.lastPlayerExchangeAt = t;
          recordDamage(archetype === 'prospector' ? 3.5 : 1.5, live.ids[0]);
          if (archetype !== 'prospector') bus.emit('combat:damage', { targetId: live.ids[0], attackerId: 1, applied: 10 });
        }
      }
    }
    if (!inCombat) { player.shield = Math.min(100, player.shield + 0.65); player.hull = Math.min(100, player.hull + 0.12); }
    if (archetype === 'prospector' && t % 9 === 0) bus.emit('mining:yield', { minerId: 1, qty: 1 });
    if (archetype === 'improviser' && t % 11 === 0) {
      if (t % 22 === 0) bus.emit('tether:attached', { ownerId: 1 });
      else bus.emit('mining:yield', { minerId: 1, qty: 1 });
    }
    if (t % 720 === 350) helpers.tensionDirector.observe({ kind: 'trade', token: `fixture-trade:${t}` });
    if (t % 1500 === 400) bus.emit('poi:discovered', { playerId: 1, poiId: `fixture-poi:${t}` });
    // A known sharp loss forces protected recovery, independent of generated encounter cadence.
    if (t % 3600 === 1500) recordDamage(52);
    // Simulate a station stop without replaying a backlog on undock.
    state.player.flags.docked = t % 1800 >= 1700 && t % 1800 < 1740;
    const beforeSequence = state.tensionDirector.sequence;
    system.update(1, state);
    const model = state.tensionDirector;
    actual.advanceSessionRhythm(d, state, t);
    host._accrue(d, state, 1);
    host._pump(d, state, t);
    bus.flush();
    const phase = enabled ? (model.suspension ? `suspended:${model.suspension}` : model.phase) : d.sessionRhythm.phase;
    activeHour.phases[phase] = (activeHour.phases[phase] || 0) + 1;
    activeHour.policyDecisions += model.sequence - beforeSequence;
    if (enabled && model.policy?.enabled) {
      assert(model.policy.requested >= 0 && model.policy.requested <= 1);
      assert(model.policy.combatRate >= 0.15 && model.policy.combatRate <= 1.25);
    }
    digest.update(JSON.stringify({ t, policy: model.policy, pressure: d.pressure,
      live: Object.keys(d.live), pending: d.pending.map((p) => [p.encounterId, p.dueAt]), hull: player.hull, shield: player.shield }));
    if (t % 10 === 0) timeline.push({ t, phase, motif: enabled ? model.motif : null,
      requested: enabled && model.policy?.enabled ? rounded(model.policy.requested) : null,
      observed: enabled ? rounded(model.observed) : null,
      fatigue: enabled ? rounded(model.fatigue) : null, hull: rounded(player.hull),
      liveCombat: Object.values(d.live).filter((v) => v.deck === 'combat').length,
      pending: d.pending.length, totalSpawns: d.stats.fired });
    if (t % 600 === 0) maxSnapshotBytes = Math.max(maxSnapshotBytes,
      Buffer.byteLength(JSON.stringify(helpers.tensionDirector.serialize())));
    if (checkpointAt === t) {
      // Exact round-trip of the OWNER, while retaining the fixture world/RNG position.
      const snapshot = JSON.parse(JSON.stringify(helpers.tensionDirector.serialize()));
      helpers.tensionDirector.restore(snapshot);
    }
  }
  for (const hour of hours) hour.damageTaken = rounded(hour.damageTaken);
  const result = { schema: 'spaceface.tension.fixture.v1', evidenceClass: 'focused-consumer-with-world-doubles',
    archetype, seed, seconds, enabled, policyHash: digest.digest('hex'),
    summary: { spawns: d.stats.fired, combatSpawns: hours.reduce((n, h) => n + h.combatSpawns, 0),
      phaseTransitions: changes.length, starvationNotices: starvation.length,
      directorDecisions: state.tensionDirector.sequence, maxSnapshotBytes,
      finalArc: state.tensionDirector.arc, finalChapter: state.tensionDirector.chapter,
      finalMotif: state.tensionDirector.motif }, hours, changes, starvation, spawnReceipts, timeline };
  result.receiptsHash = sha({ hours, changes, starvation, spawnReceipts, timeline });
  system.destroy();
  return result;
}
