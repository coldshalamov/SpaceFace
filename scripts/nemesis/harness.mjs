// Focused fixture host, NOT SpaceFace's production manifest or full combat/physics simulation.
// The event bus is deliberately strict: unlike production it propagates handler exceptions.
import { createNemesisSystem } from '../../src/systems/nemesis.js';
import { createNemesisEncounterHost } from '../../src/nemesis/encounterHost.js';
import { LIMITS, clone } from '../../src/nemesis/model.js';
import { shapeNemesisManeuverRequest } from '../../src/ai/nemesisTactics.js';

export function strictBus() {
  const listeners = new Map();
  return {
    on(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn); },
    emit(name, p) { for (const fn of [...listeners.get(name) || []]) fn(p); },
    count() { return [...listeners.values()].reduce((sum, rows) => sum + rows.size, 0); },
  };
}
const ARCHETYPES = new Set(['lancer_sniper', 'quiet_ghost', 'tether_control_raider',
  'field_anchor_controller', 'pd_screen_escort', 'bruiser_brawler']);

export function boot({ seed = 4242, approve = true, budgetCap = 3, withHost = true,
  failSpawnAt = 0, blockPlacement = false, sensors = false, engineDefinition = null } = {}) {
  let nextId = 10, spawned = 0, rngState = seed >>> 0, rngCalls = 0;
  const bus = strictBus(), rows = [], calls = [], allocations = new Map();
  const state = { simTime: 0, tick: 0, mode: 'flight', meta: { seed },
    world: { currentSectorId: 'sector_helios_prime' }, playerId: 1, entities: new Map(),
    rng() { rngCalls++; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 4294967296; } };
  const player = { id: 1, type: 'ship', hull: 100, hullMax: 100, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: { intent: {} } };
  state.entities.set(1, player);
  const helpers = {
    canStartNemesisEncounter: approve == null ? undefined : () => approve,
    queryRadius() { return blockPlacement ? [{ id: 999 }] : []; },
    spawnBudget: {
      request(wanted, id) { const n = Math.min(wanted, budgetCap); allocations.set(id, n); return n; },
      releaseSome(id, n) { if (allocations.has(id)) allocations.set(id, Math.max(0, allocations.get(id) - n)); },
      release(id) { allocations.delete(id); },
    },
    spawnEntity(spec) {
      spawned++;
      if (failSpawnAt && spawned === failSpawnAt) throw new Error('injected spawn failure');
      const ship = { ...clone(spec), id: nextId++, alive: true };
      state.entities.set(ship.id, ship); bus.emit('entity:spawned', { id: ship.id, entity: ship }); return ship;
    },
    removeEntity(id) {
      const ship = state.entities.get(id); if (!ship) return false;
      ship.alive = false;
      // Production's lifetime sweep defers actual membership removal; the fixture makes the
      // removal explicit and emits the same observed destruction receipt, without a kill.
      state.entities.delete(id); bus.emit('entity:destroyed', { id }); return true;
    },
  };
  if (sensors) helpers.aiSensors = { frameFor(id) {
    const self = state.entities.get(id);
    return { self, contacts: [...state.entities.values()].filter((e) => e.id !== id).map((e) => ({
      id: e.id, pos: clone(e.pos), vel: clone(e.vel), rot: e.rot, kind: 'ship',
      visible: e.visible !== false, valid: true, alive: e.alive !== false, confidence: 1,
    })) };
  } };
  const makeSpawnSpec = (archetype, level, pos, opts) => {
    if (!ARCHETYPES.has(archetype)) throw new Error(`Unknown contract archetype ${archetype}`);
    calls.push({ archetype, level, pos: clone(pos), opts: clone(opts) });
    return { type: 'ship', hull: 100, hullMax: 100, pos, vel: { x: 0, z: 0 }, rot: 0,
      radius: 12, mass: 100, data: { enemyTypeId: archetype, intent: {}, ai: {
        combatDoctrineId: 'ranged_disengager', capabilities: ['drive', 'sensor', 'weapon'],
      }, weapons: [{ defId: 'fixture-catalogue-weapon' }] } };
  };
  const engine = engineDefinition ? Object.create(engineDefinition) : createNemesisSystem();
  const host = withHost ? createNemesisEncounterHost({ makeSpawnSpec }) : null;
  const ctx = { state, bus, helpers, registry: { get(name) { return name === 'nemesis' ? engine : name === 'nemesisEncounter' ? host : null; } } };
  for (const name of ['nemesis:announced', 'nemesis:encounterRequested', 'nemesis:encounterRejected',
    'nemesis:engaged', 'nemesis:voice', 'nemesis:retreatRequested', 'nemesis:actChanged',
    'nemesis:surrenderOffered', 'nemesis:encounterEnded', 'nemesis:resolved', 'namedAce:appeared',
    'namedAce:fled', 'namedAce:defeated']) bus.on(name, (p) => rows.push({ event: name, payload: clone(p) }));
  engine.init(ctx); if (host) host.init(ctx);
  const t = { state, bus, helpers, engine, host, rows, calls, allocations, player, ctx,
    rngCalls: () => rngCalls,
    tick(n = 1) { for (let i = 0; i < n; i++) { state.tick++; state.simTime = state.tick / 60;
      engine.update(1 / 60, state); if (host) host.update(1 / 60, state); } },
    advance(seconds) { t.tick(Math.ceil(seconds * 60)); },
    until(predicate, maxSeconds = 400) {
      const limit = Math.ceil(maxSeconds * 60);
      for (let i = 0; i < limit && !predicate(); i++) t.tick();
      if (!predicate()) throw new Error('Fixture condition timed out');
    },
    start() { t.until(() => !!state.nemesis.active, 450); return state.nemesis.active; },
    kill(style, id = 10000 + rows.length, extra = {}) {
      const a = state.nemesis.active;
      bus.emit('entity:killed', { id, killerId: state.playerId, type: 'ship', killStyle: style,
        witnessIds: a ? [a.bossId] : [], ...extra });
    },
    observe(style, extra = {}) {
      const a = state.nemesis.active;
      bus.emit('nemesis:observation', { encounterId: a.id, actorId: state.playerId,
        style, witnessIds: [a.bossId], ...extra });
    },
    escape() {
      const a = state.nemesis.active, boss = state.entities.get(a.bossId);
      boss.hull = 28; t.advance(9); // fixture applies a damage result; no HP writes in production engine
      if (a.retreatAt == null) throw new Error('Rival did not request retreat');
      boss.pos = { x: player.pos.x + 1900, z: player.pos.z }; t.advance(6.5);
      if (state.nemesis.active) throw new Error('Rival did not complete geometric escape');
    },
    leave() { state.world.currentSectorId = state.world.currentSectorId === 'sector_helios_prime'
      ? 'sector_ceres_belt' : 'sector_helios_prime'; bus.emit('sector:enter', { sectorId: state.world.currentSectorId });
      t.tick(); },
    destroy() { engine.destroy(); if (host) host.destroy(); },
  };
  return t;
}

export function playStyle(style, seed = 4242, cycles = 3) {
  const t = boot({ seed });
  for (let encounter = 0; encounter < cycles; encounter++) {
    t.start();
    for (let i = 0; i < 6; i++) t.kill(style, 50000 + encounter * 100 + i);
    t.escape();
  }
  t.start();
  return t;
}

/** A small kinematic probe, NOT the production collision/physics kernel. Real policy in both paths. */
export function steeringProbe(t, kit = null, steps = 120) {
  const a = t.state.nemesis.active, ship = t.state.entities.get(a.bossId);
  const localState = { ...t.state, nemesis: clone(t.state.nemesis), entities: new Map(t.state.entities) };
  const probe = clone(ship); probe.pos = { x: -500, z: 0 }; probe.vel = { x: 0, z: 0 }; probe.rot = 0;
  localState.entities.set(probe.id, probe);
  if (kit) localState.nemesis.active.plan.primary = kit;
  const trajectory = [];
  for (let i = 0; i < steps; i++) {
    const req = shapeNemesisManeuverRequest({ entityId: probe.id, tick: i, kind: 'intercept',
      forceLocal: { forward: 1, right: 0 }, torqueYaw: 0, targetHeading: 0, brake: false,
      boost: false, reason: 'fixture' }, localState, { contacts: [{ id: t.state.playerId,
        visible: true, valid: true, alive: true, confidence: 1, pos: { x: 0, z: 0 },
        vel: { x: 100, z: 0 }, rot: 0 }] });
    const dt = 1 / 60;
    probe.rot += req.torqueYaw * 1.8 * dt;
    const c = Math.cos(probe.rot), s = Math.sin(probe.rot);
    probe.vel.x += ((c * req.forceLocal.forward - s * req.forceLocal.right) * 170 - probe.vel.x * 0.8) * dt;
    probe.vel.z += ((s * req.forceLocal.forward + c * req.forceLocal.right) * 170 - probe.vel.z * 0.8) * dt;
    probe.pos.x += probe.vel.x * dt; probe.pos.z += probe.vel.z * dt;
    if (i % 10 === 0) trajectory.push({ x: probe.pos.x, z: probe.pos.z });
  }
  return { end: clone(probe.pos), trajectory };
}
