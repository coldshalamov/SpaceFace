import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { TECH_NODES } from '../src/data/tech.js';
import { LEGACY47A_FEATURES, PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { masslineImpactDamage } from '../src/systems/masslineImpactDamage.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';
import { statSnippet } from '../src/ui/screens/outfitting.js';

const DT = 1 / 60;
const STANDARD = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');
const SWEEP = MODULES.find((def) => def.id === 'mod_monofilament_sweep_m');
const ELASTIC = MODULES.find((def) => def.id === 'mod_elastic_whip_m');
const DRIFTER = SHIPS.find((def) => def.id === 'ship_drifter');

test('Monofilament Sweep is reachable, exclusive, flagged, and leaves ordinary rope physics intact', () => {
  const fittings = fittingsFromDefaultModules(DRIFTER.id, [SWEEP.id]);
  const derived = getDerivedStats(DRIFTER.id, fittings, null);
  const production = effectiveTetherPolicy(STANDARD, { data: { derived } }, PRODUCTION_FEATURES);
  const legacy = effectiveTetherPolicy(STANDARD, { data: { derived } }, LEGACY47A_FEATURES);
  const fireControl = TECH_NODES.find((node) => node.id === SWEEP.requiresTech);

  assert.ok(fittings.includes(SWEEP.id), 'the M utility head fits a production hull');
  assert.ok(fireControl.unlocks.modules.includes(SWEEP.id), 'Fire Control exposes the head to station stock');
  assert.equal(derived.masslineHeadId, 'monofilament_sweep');
  assert.equal(PRODUCTION_FEATURES.massline2.masslineHeadMonofilamentSweep, true);
  assert.equal(LEGACY47A_FEATURES.massline2.masslineHeadMonofilamentSweep, false);
  assert.equal(production.headId, 'monofilament_sweep');
  assert.deepEqual(production.spring, STANDARD.spring,
    'the head snapshots the standard spring without changing rope force');
  assert.equal(legacy.headId, undefined, 'flag-off removes only Monofilament admission');
  assert.equal(legacy.spring, undefined, 'flag-off keeps the ordinary standard-line policy');
  assert.match(statSnippet(SWEEP), /hostile-cut sweep head/i);

  const forward = fittingsFromDefaultModules(DRIFTER.id, [ELASTIC.id, SWEEP.id]);
  const reversed = fittingsFromDefaultModules(DRIFTER.id, [SWEEP.id, ELASTIC.id]);
  assert.equal(getDerivedStats(DRIFTER.id, forward, null).masslineHeadId, 'monofilament_sweep');
  assert.equal(getDerivedStats(DRIFTER.id, reversed, null).masslineHeadId, 'monofilament_sweep',
    'defensive arbitration must not inherit fitting-slot order');
});

test('a loaded Monofilament line cuts each crossed hostile once per latch without steering bodies', () => {
  const h = createSweepHarness();
  const before = bodyMotionSnapshot(h.state);
  h.system.update(DT, h.state);

  assert.equal(h.sweeps.length, 1, 'a loaded moving line crossing a hostile must emit one cut');
  const cut = h.sweeps[0];
  assert.equal(cut.headId, 'monofilament_sweep');
  assert.equal(cut.targetId, h.target.id);
  assert.equal(cut.victimId, h.victim.id);
  assert.equal(cut.transverseSpeed, 60);
  assert.equal(cut.reducedMass, 60);
  assert.equal(cut.momentum, 3600);
  assert.equal(cut.rating, 'solid');
  assert.deepEqual(bodyMotionSnapshot(h.state), before,
    'the observer must never write position, velocity, facing, thrust, or braking');
  assert.deepEqual(h.state.player.masslineImpacts.latestSweep, cut);

  h.state.tick += 1;
  h.state.simTime += DT;
  h.system.update(DT, h.state);
  assert.equal(h.sweeps.length, 1, 'sustained contact must not deal damage every tick');

  const nextTarget = {
    ...h.target,
    id: 4,
    pos: { ...h.target.pos },
    vel: { ...h.target.vel },
  };
  h.state.entities.set(nextTarget.id, nextTarget);
  h.state.player.tether.targetId = nextTarget.id;
  h.state.combat.attachments.byId.att_sweep.targetId = nextTarget.id;
  h.state.tick += 1;
  h.state.simTime += DT;
  h.system.update(DT, h.state);
  assert.equal(h.sweeps.length, 2, 'a genuinely new latch re-arms the same hostile');
  assert.equal(h.sweeps[1].targetId, nextTarget.id);
});

test('sweep admission is taut, transverse, hostile-only, and swept between fixed-step samples', () => {
  const denied = [
    createSweepHarness({ phase: 'slack' }),
    createSweepHarness({ headId: 'elastic_whip' }),
    createSweepHarness({ features: LEGACY47A_FEATURES }),
    createSweepHarness({ ownerVel: { x: 60, z: 0 }, targetVel: { x: 60, z: 0 } }),
    createSweepHarness({ victim: { team: 0 } }),
    createSweepHarness({ victim: { team: 2 } }),
    createSweepHarness({ victim: { type: 'station' } }),
  ];
  for (const h of denied) {
    h.system.update(DT, h.state);
    assert.equal(h.sweeps.length, 0, 'slack, wrong-head, flag-off, along-line, friendly, neutral, and station cases stay safe');
  }

  const tunneled = createSweepHarness({
    ownerVel: { x: 0, z: 0 },
    targetVel: { x: 0, z: 0 },
    victim: { radius: 0.5, pos: { x: 50, z: 2.5 }, vel: { x: 0, z: 300 } },
  });
  tunneled.system.update(DT, tunneled.state);
  assert.equal(tunneled.sweeps.length, 1,
    'a fast hostile crossing from one side of the line to the other must not tunnel between ticks');
});

test('an active Monofilament line queries a bounded corridor instead of scanning the world', () => {
  const h = createSweepHarness({
    ownerVel: { x: 0, z: 60 },
    targetVel: { x: 0, z: 0 },
  });
  const decoys = [];
  for (let i = 0; i < 4096; i++) {
    decoys.push({
      id: 1000 + i,
      type: 'asteroid',
      alive: true,
      collides: true,
      radius: 8,
      pos: { x: 5000 + i * 20, z: 5000 },
      vel: { x: 0, z: 0 },
    });
  }
  h.state.entityList.push(...decoys);
  for (const decoy of decoys) h.state.entities.set(decoy.id, decoy);
  assert.equal(h.state.entities.size, 4099, 'the regression world is intentionally dense');
  h.state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    ready: true,
    shipLike: [h.player, h.victim],
  };

  const queries = [];
  h.state.spatialHash = {
    diagnostics: { activeBuckets: 1 },
    queryRadius(x, z, radius, out) {
      queries.push({ x, z, radius });
      out.push(h.victim);
      return out;
    },
  };
  Object.defineProperty(h.state.entities, 'values', {
    value() { throw new Error('Monofilament performed an all-entity scan'); },
  });

  h.system.update(DT, h.state);

  assert.equal(h.sweeps.length, 1, 'the same crossing still produces its cut');
  assert.equal(queries.length, 1, 'one spatial query owns candidate admission');
  assert.ok(queries[0].radius > 50 && queries[0].radius < 96,
    `the 100-wu line stays inside a local corridor query, got radius ${queries[0].radius}`);
});

test('a fast Massline payload queries local impact candidates instead of scanning the world', () => {
  const h = createSweepHarness({
    headId: 'elastic_whip',
    targetVel: { x: 0, z: 60 },
    victim: { pos: { x: 100, z: 0 } },
  });
  const decoys = [];
  for (let i = 0; i < 4096; i++) {
    decoys.push({
      id: 6000 + i,
      type: 'asteroid',
      alive: true,
      collides: true,
      radius: 8,
      pos: { x: 8000 + i * 20, z: 8000 },
      vel: { x: 0, z: 0 },
    });
  }
  h.state.entityList.push(...decoys);
  for (const decoy of decoys) h.state.entities.set(decoy.id, decoy);
  assert.equal(h.state.entities.size, 4099, 'the regression world is intentionally dense');
  h.state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    ready: true,
    collidables: h.state.entityList,
    spatialDynamics: [h.player, h.target, h.victim],
    shipLike: [h.player, h.victim],
  };

  const queries = [];
  h.state.spatialHash = {
    diagnostics: { activeBuckets: 1 },
    queryRadius(x, z, radius, out) {
      queries.push({ x, z, radius });
      out.push(h.victim);
      return out;
    },
  };
  Object.defineProperty(h.state.entities, 'values', {
    value() { throw new Error('Massline impact detection performed an all-entity scan'); },
  });
  const impacts = [];
  h.bus.on('tether:whipImpact', (payload) => impacts.push(payload));

  h.system.update(DT, h.state);

  assert.equal(impacts.length, 1, 'the same physical contact still produces its whip impact');
  assert.equal(impacts[0].victimId, h.victim.id);
  assert.equal(queries.length, 1, 'one spatial query owns impact candidate admission');
  assert.ok(queries[0].radius > 40 && queries[0].radius < 48,
    `the moving payload stays inside a local impact query, got radius ${queries[0].radius}`);
});

test('Monofilament damage is hostile-only, momentum-bounded, player-attributed, and kernel-routed', () => {
  const h = createSweepHarness();
  const routed = [];
  const damage = Object.create(masslineImpactDamage);
  damage.init({
    state: h.state,
    bus: h.bus,
    registry: {
      get(name) {
        return name === 'combat'
          ? { kernel: { routeDamage(input) { routed.push(input); return { ok: true }; } } }
          : null;
      },
    },
  });
  try {
    h.bus.emit('massline:sweepImpact', sweepPayload(h, { momentum: 16000 }));
    assert.equal(routed.length, 1);
    assert.equal(routed[0].attackerId, h.player.id);
    assert.equal(routed[0].targetId, h.victim.id);
    assert.equal(routed[0].packet.channels.kinetic, 10);
    assert.equal(routed[0].origin.kind, 'massline_monofilament_sweep');
    assert.deepEqual(routed[0].packet.flags, { ignoreFriendlyFire: true, allowAnyTarget: true });

    h.bus.emit('massline:sweepImpact', sweepPayload(h, { momentum: 1e9 }));
    assert.equal(routed.at(-1).packet.channels.kinetic, 35, 'the cut has a hard damage ceiling');

    const routedBeforeSafety = routed.length;
    h.bus.emit('massline:sweepImpact', sweepPayload(h, {
      transverseSpeed: 40,
      momentum: 2400,
      rating: 'glance',
    }));
    h.victim.team = h.player.team;
    h.bus.emit('massline:sweepImpact', sweepPayload(h));
    h.victim.team = 1;
    h.bus.emit('massline:sweepImpact', sweepPayload(h, { victimId: h.player.id }));
    h.state.runtime.features = LEGACY47A_FEATURES;
    h.bus.emit('massline:sweepImpact', sweepPayload(h));
    assert.equal(routed.length, routedBeforeSafety,
      'glancing, friendly, player, and flag-off payloads must never reach the damage writer');
  } finally {
    damage.destroy();
  }
});

test('Monofilament sweep reuses the accepted player-facing Massline impact feedback budget', () => {
  const h = createSweepHarness();
  const cues = [];
  h.bus.on('presentation:cue', (payload) => cues.push(payload));
  const presenter = Object.create(presentationOrchestrator);
  presenter.init({ state: h.state, bus: h.bus });
  try {
    h.bus.emit('massline:sweepImpact', sweepPayload(h));
    assert.equal(cues.length, 1);
    assert.equal(cues[0].id, 'tether.whip_impact');
    assert.equal(cues[0].sourceEvent, 'massline:sweepImpact');
    assert.equal(cues[0].targetId, h.victim.id);
    assert.ok(cues[0].tags.includes('monofilament') && cues[0].tags.includes('sweep'));
    assert.ok(cues[0].playerRelevance >= 0.88);
  } finally {
    for (const off of presenter._subscriptions || []) if (typeof off === 'function') off();
  }
});

test('an active Monofilament head snapshots through combat save and Continue', () => {
  const policy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: 'monofilament_sweep' } },
  }, PRODUCTION_FEATURES);
  const player = { id: 1, alive: true, flags: {} };
  const payload = { id: 2, alive: true, flags: { persistent: true } };
  const state = {
    playerId: player.id,
    entityList: [player, payload],
    entities: new Map([[player.id, player], [payload.id, payload]]),
    combat: {
      attachments: {
        nextId: 2,
        byId: {
          att_000001: {
            id: 'att_000001',
            defId: 'tether_standard',
            ownerId: player.id,
            targetId: payload.id,
            state: 'active',
            restLength: 80,
            tetherPolicy: policy,
          },
        },
      },
      entities: {},
      actions: { nextRequestSeq: 1, nextInstanceSeq: 1, requests: [], activeByActor: {}, cooldownReadyTickByActor: {} },
      statusNextPendingSeq: 1,
    },
  };

  const saved = serializeCombatState(state);
  assert.equal(saved.attachments.byId.att_000001.tetherPolicy.headId, 'monofilament_sweep');
  assert.deepEqual(saved.attachments.byId.att_000001.tetherPolicy.spring, STANDARD.spring);

  const restored = {};
  const summary = restoreCombatState(restored, saved, (ref) => {
    if (ref && ref.kind === 'player') return player.id;
    if (ref && ref.kind === 'persistent' && ref.saveId === String(payload.id)) return payload.id;
    return null;
  });
  assert.equal(summary.restoredAttachments, 1);
  assert.deepEqual(restored.combat.attachments.byId.att_000001.tetherPolicy, policy);
});

function createSweepHarness(options = {}) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    mass: 80,
    radius: 6,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 60, ...(options.ownerVel || {}) },
    rot: 0,
    data: {},
  };
  const target = {
    id: 2,
    type: 'asteroid',
    alive: true,
    team: 2,
    mass: 240,
    radius: 8,
    pos: { x: 100, z: 0 },
    vel: { x: 0, z: 60, ...(options.targetVel || {}) },
    rot: 0,
    data: {},
  };
  const victimOptions = options.victim || {};
  const victim = {
    id: 3,
    type: 'ship',
    alive: true,
    team: 1,
    mass: 45,
    radius: 4,
    pos: { x: 50, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { ai: { forcePlayerTarget: true } },
    ...victimOptions,
    pos: { x: 50, z: 0, ...(victimOptions.pos || {}) },
    vel: { x: 0, z: 0, ...(victimOptions.vel || {}) },
    data: {
      ai: { forcePlayerTarget: true },
      ...(victimOptions.data || {}),
    },
  };
  const bus = createImmediateBus();
  const sweeps = [];
  bus.on('massline:sweepImpact', (payload) => sweeps.push(payload));
  const state = {
    mode: 'flight',
    tick: 120,
    simTime: 2,
    playerId: player.id,
    player: {
      tether: {
        active: true,
        targetId: target.id,
        attachmentId: 'att_sweep',
        phase: options.phase || 'loaded',
      },
    },
    entities: new Map([[player.id, player], [target.id, target], [victim.id, victim]]),
    entityList: [player, target, victim],
    combat: {
      attachments: {
        byId: {
          att_sweep: {
            id: 'att_sweep',
            state: 'active',
            targetId: target.id,
            tetherPolicy: { headId: options.headId || 'monofilament_sweep' },
          },
        },
      },
    },
    runtime: { features: options.features || PRODUCTION_FEATURES },
  };
  const system = Object.create(masslineImpacts);
  system.init({ state, bus });
  return { state, bus, system, sweeps, player, target, victim };
}

function createImmediateBus() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      for (const fn of [...(listeners.get(type) || [])]) fn(payload);
    },
  };
}

function bodyMotionSnapshot(state) {
  return [...state.entities.values()].map((entity) => ({
    id: entity.id,
    pos: { ...entity.pos },
    vel: { ...entity.vel },
    rot: entity.rot,
  }));
}

function sweepPayload(harness, overrides = {}) {
  return {
    headId: 'monofilament_sweep',
    targetId: harness.target.id,
    victimId: harness.victim.id,
    transverseSpeed: 60,
    reducedMass: 60,
    momentum: 3600,
    pos: { x: 50, z: 0 },
    severity: 60 / 95,
    rating: 'solid',
    playerRelevance: 0.88,
    tick: harness.state.tick,
    time: harness.state.simTime,
    ...overrides,
  };
}
