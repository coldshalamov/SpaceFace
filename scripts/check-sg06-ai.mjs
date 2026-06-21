#!/usr/bin/env node
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  AIInspectionEndpoint,
  ContactKind,
  ExplainabilityTrace,
  ManeuverKind,
  TacticalAIStack,
  TraceLayer,
  toTacticalActionDef,
  wrapAngle,
} from '../src/ai/index.js';
import { ACTION_DEFS } from '../src/data/combatDefs.js';

const RUNS = readInt('--runs', 100);
const TICKS = readInt('--ticks', 600);
const BASE_SEED = readInt('--seed', 0x5f060000);

const tacticalDefs = ACTION_DEFS.map(toTacticalActionDef);
assert.deepEqual(tacticalDefs.map((def) => def.id), ACTION_DEFS.map((def) => def.id), 'SG-06 must consume canonical SG-03 ActionDef IDs without substitutes');
assert.ok(tacticalDefs.find((def) => def.id === 'action_cut').tags.includes('counter_tether_cut'));
assert.ok(tacticalDefs.find((def) => def.id === 'action_dash').tags.includes('counter_tether_overload'));
assert.equal(tacticalDefs.some((def) => def.id.startsWith('act_')), false, 'synthetic privileged action IDs are forbidden');
if (RUNS < 1 || TICKS < 520) throw new RangeError('SG-06 seed suite requires --runs>=1 and --ticks>=520');

assert.throws(() => new TacticalAIStack({ ports: {} }), /required/, 'dependency ports must fail closed');
const ringProbe = new ExplainabilityTrace({ capacity: 64 });
for (let tick = 0; tick < 70; tick++) ringProbe.emit({ tick, layer: TraceLayer.DIRECTOR, decision: 'ring_probe' });
const ringEntries = ringProbe.query({ limit: 100 });
assert.equal(ringEntries.length, 64, 'trace ring must retain exactly its capacity');
assert.equal(ringEntries[0].sequence, 6, 'trace ring must evict oldest entries in order');
assert.equal(ringEntries.at(-1).sequence, 69, 'trace ring must retain newest entry');

const startedAt = performance.now();
const summaries = [];
const determinismSamples = Math.min(5, RUNS);
for (let index = 0; index < RUNS; index++) {
  const seed = (BASE_SEED + index) >>> 0;
  const first = runSeed(seed, TICKS);
  if (index < determinismSamples) {
    const second = runSeed(seed, TICKS);
    assert.deepStrictEqual(second, first, `seed ${seed} must be deterministic`);
  }
  summaries.push(first);
}

const tactics = new Set(summaries.flatMap((run) => Object.values(run.tactics).flat()));
const counterActions = new Set(summaries.flatMap((run) => run.counterActions));
assert.ok(tactics.size >= 3, 'suite must demonstrate at least three materially different tactics');
assert.ok(counterActions.has('action_cut'), 'suite must demonstrate an owned-line cut through SG-03 ActionDef');
assert.ok(counterActions.has('action_dash'), 'suite must demonstrate a tether-overload escape through SG-03 ActionDef');

const report = {
  schema: 'spaceface.sg06.acceptance.v1',
  contract: 'SG-06',
  mode: 'canonical-sg03-actiondef-port-harness',
  integrationStatus: {
    sg02DynamicBodies: 'required_on_master',
    sg03ActionRuntime: 'integrated_on_master_canonical_actiondefs_consumed',
    sg03LiveAdapter: 'delivered_createSG03ActionPort',
    productionRegistration: 'explicit_sg06_tactical_backend_proved_default_replacement_gated',
    masslineThresholdBreak: 'opted_in_sg06_dash_armed_overload_proved_default_replacement_gated',
    activeEncounterOwner: 'covered_by_check_sg06_encounter_owner',
    transientEncounterSaveLoadReset: 'covered_by_check_gameplay_core',
    runtimeCapabilityGating: 'covered_by_check_sg06_production_ports',
  },
  deterministic: true,
  determinismSamples,
  seeds: RUNS,
  ticksPerSeed: TICKS,
  tactics: [...tactics].sort(),
  counterTetherActions: [...counterActions].sort(),
  maxActionTransitions: Math.max(...summaries.map((run) => run.maxActionTransitions)),
  maxCommandedStationaryTicks: Math.max(...summaries.map((run) => run.maxCommandedStationaryTicks)),
  formationRecoveryRequests: summaries.reduce((sum, run) => sum + run.formationRecoveryRequests, 0),
  physicalFormationConvergence: 'covered_by_check_sg06_formation',
  directorPressure: {
    minimum: round6(Math.min(...summaries.map((run) => run.minPressure))),
    maximum: round6(Math.max(...summaries.map((run) => run.maxPressure))),
    authoredEnvelope: [0.16, 0.76],
  },
  traceLayers: Object.values(TraceLayer).sort(),
  elapsedMs: round6(performance.now() - startedAt),
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');

function runSeed(seed, ticks) {
  const world = makeWorld(seed);
  const actionDefs = makeActionDefs();
  const actions = makeActionPort(world, actionDefs);
  const maneuver = makeManeuverPort(world);
  const encounterCommands = [];
  const ports = {
    sensors: { frameFor: (entityId, tick) => sensorFrame(world, entityId, tick) },
    actions,
    maneuver,
    roster: { listSquads: () => world.roster },
    encounter: { issue: (command) => encounterCommands.push(command) },
  };
  const stack = new TacticalAIStack({
    seed,
    ports,
    config: {
      trace: { capacity: 32768 },
      perception: { memoryTicks: 18, confidenceFloor: 0.05 },
      squad: { minTacticTicks: 70, switchMargin: 0.02, formationBound: 170, breakTicks: 75 },
      behavior: { minCommitTicks: 12, switchMargin: 0.06 },
      director: {
        pressureRisePerTick: 0.014,
        pressureFallPerTick: 0.018,
        respiteMinTicks: 30,
        respiteMaxTicks: 90,
        buildMinTicks: 30,
        buildMaxTicks: 90,
        peakMinTicks: 30,
        peakMaxTicks: 90,
        retreatMinTicks: 30,
        reinforcementCooldownTicks: 60,
        narrativeCooldownTicks: 80,
      },
    },
  });

  const tacticsByDoctrine = { scavenger: new Set(), official: new Set() };
  const roleBaseline = new Map();
  const pressure = [];
  let formationRecoveryRequests = 0;

  for (let tick = 0; tick < ticks; tick++) {
    world.tick = tick;
    world.pendingRequests.clear();
    const result = stack.update(tick, {
      threatEnvelope: { min: 0.16, max: 0.76 },
      pressureBias: phaseAt(tick) === 'hostile' ? 0.08 : 0,
      reinforcementPackageId: 'fixture_wing_pair',
      narrativeBeatReady: tick > 0 && tick % 160 === 80,
    });
    pressure.push(result.director.pressure);
    assert.ok(result.director.pressure >= 0.16 - 1e-9 && result.director.pressure <= 0.76 + 1e-9,
      `seed ${seed} tick ${tick}: director escaped authored envelope`);

    for (const squadResult of result.squads) {
      const doctrine = world.squadById.get(squadResult.squadId).doctrine;
      tacticsByDoctrine[doctrine].add(squadResult.tactic);
      for (const directive of squadResult.directives) {
        const baselineKey = `${directive.squadId}:${directive.memberId}`;
        if (!roleBaseline.has(baselineKey)) roleBaseline.set(baselineKey, directive.role);
        assert.equal(directive.role, roleBaseline.get(baselineKey), `role changed without roster mutation: ${baselineKey}`);
      }
    }

    for (const decision of result.decisions) {
      const entity = world.entities.get(decision.entityId);
      const formationDistance = distance(entity.pos, decision.directive.formation.slot);
      if (!decision.directive.formation.breakFormation && formationDistance > decision.directive.formation.bound + 1e-9) {
        formationRecoveryRequests++;
        assert.equal(decision.maneuver.kind, ManeuverKind.FORMATION,
          `seed ${seed} tick ${tick}: out-of-bounds member did not re-form`);
      }
    }

    integrate(world);
  }

  for (const [doctrine, set] of Object.entries(tacticsByDoctrine)) {
    assert.ok(set.size >= 3, `seed ${seed}: ${doctrine} wing produced fewer than three tactics`);
  }
  const counterActions = new Set(actions.starts.filter((entry) => entry.counterTether).map((entry) => entry.actionId));
  assert.ok(counterActions.has('action_cut'), `seed ${seed}: owned-line cut condition did not invoke action_cut`);
  assert.ok(counterActions.has('action_dash'), `seed ${seed}: overload escape condition did not invoke action_dash`);

  let maxTransitions = 0;
  for (const entity of world.entities.values()) {
    const sequence = compress(actions.starts.filter((entry) => entry.entityId === entity.id).map((entry) => entry.actionId));
    const transitions = Math.max(0, sequence.length - 1);
    maxTransitions = Math.max(maxTransitions, transitions);
    assert.ok(transitions <= 8, `seed ${seed}: action-state transition threshold exceeded for ${entity.id}`);
    assert.equal(hasAlternatingOscillation(sequence), false, `seed ${seed}: A/B action oscillation detected for ${entity.id}`);
  }

  const finalTickEntries = stack.trace.query({ sinceTick: ticks - 1, untilTick: ticks - 1, limit: 2048 });
  const finalLayers = new Set(finalTickEntries.map((entry) => entry.layer));
  for (const layer of Object.values(TraceLayer)) assert.ok(finalLayers.has(layer), `seed ${seed}: missing ${layer} trace`);
  for (const entity of world.entities.values()) {
    const entityLayers = new Set(finalTickEntries.filter((entry) => entry.entityId === entity.id).map((entry) => entry.layer));
    for (const layer of [TraceLayer.PERCEPTION, TraceLayer.UTILITY, TraceLayer.BEHAVIOR, TraceLayer.MANEUVER]) {
      assert.ok(entityLayers.has(layer), `seed ${seed}: entity ${entity.id} missing ${layer} trace`);
    }
  }
  const endpoint = new AIInspectionEndpoint(stack);
  const contractResponse = endpoint.handle({ method: 'ai.contract' });
  assert.equal(contractResponse.ok, true);
  assert.equal(contractResponse.result.actionRule, 'sg03_action_port_only');
  const inspectResponse = endpoint.handle({ method: 'ai.inspect', params: { entityId: 101, trace: { limit: 8 } } });
  assert.equal(inspectResponse.ok, true);
  assert.equal(inspectResponse.result.behavior.actionId != null || inspectResponse.result.behavior.status === 'idle' || inspectResponse.result.behavior.status === 'blocked', true);
  assert.equal(endpoint.handle({ method: 'ai.unknown' }).ok, false);

  assert.ok(world.maxCommandedStationaryTicks < 180,
    `seed ${seed}: unintentionally stationary ship reached ${world.maxCommandedStationaryTicks} ticks`);
  assert.ok(encounterCommands.length > 0, `seed ${seed}: director emitted no authored encounter commands`);
  assert.ok(actions.starts.every((entry) => entry.source === 'ai' && entry.viaActionPort),
    `seed ${seed}: privileged action path detected`);

  return {
    seed,
    tactics: Object.fromEntries(Object.entries(tacticsByDoctrine).map(([key, value]) => [key, [...value].sort()])),
    counterActions: [...counterActions].sort(),
    maxActionTransitions: maxTransitions,
    maxCommandedStationaryTicks: world.maxCommandedStationaryTicks,
    formationRecoveryRequests,
    minPressure: round6(Math.min(...pressure)),
    maxPressure: round6(Math.max(...pressure)),
    encounterCommandTypes: [...new Set(encounterCommands.map((command) => command.type))].sort(),
    traceSequence: stack.trace.sequence,
  };
}

function makeWorld(seed) {
  const rng = mulberry32(seed);
  const entities = new Map();
  const scavenger = makeSquad('sq_scavenger', 'scavenger', -150, -60, 0, 100, rng);
  const official = makeSquad('sq_official', 'official', 150, 60, Math.PI, 200, rng);
  for (const entity of [...scavenger.entities, ...official.entities]) entities.set(entity.id, entity);
  const roster = [scavenger.definition, official.definition];
  return {
    seed,
    rng,
    tick: 0,
    entities,
    roster,
    squadById: new Map(roster.map((squad) => [squad.id, squad])),
    pendingRequests: new Map(),
    stationary: new Map(),
    maxCommandedStationaryTicks: 0,
    target: { id: 900, pos: { x: (rng() - 0.5) * 16, z: (rng() - 0.5) * 16 }, vel: { x: 0, z: 0 } },
  };
}

function makeSquad(id, doctrine, x, z, rot, idBase, rng) {
  const capabilities = [
    ['attack', 'drive', 'weapon', 'sensor'],
    ['tug', 'counter_tether_overload', 'drive', 'tether', 'weapon', 'sensor'],
    ['steal', 'screen', 'drive', 'tether', 'weapon', 'sensor'],
    ['ranged', 'disable', 'counter_tether_cut', 'drive', 'tether', 'weapon', 'sensor'],
  ];
  const preferredRoles = [null, 'tug', 'thief', 'support'];
  const entities = [];
  const slots = initialFormationSlots({ x, z }, rot, 4, 72);
  for (let index = 0; index < 4; index++) {
    entities.push({
      id: idBase + index + 1,
      team: 1,
      pos: { x: slots[index].x, z: slots[index].z },
      vel: { x: 0, z: 0 },
      rot,
      radius: 12,
      hullFraction: 0.86 + rng() * 0.12,
      energyFraction: 0.72 + rng() * 0.25,
      heatFraction: rng() * 0.12,
      disabled: false,
      tethered: false,
      capabilities: capabilities[index],
      subsystemFractions: { drive: 1, sensors: 1, weapons: 1, tether_spool: 1 },
    });
  }
  return {
    entities,
    definition: Object.freeze({
      id,
      doctrine,
      faction: doctrine === 'official' ? 'faction_scn' : 'faction_vael',
      formation: doctrine === 'official' ? 'line' : 'wedge',
      formationSpacing: 72,
      formationBound: 170,
      members: Object.freeze(entities.map((entity, index) => Object.freeze({
        id: entity.id,
        preferredRole: preferredRoles[index],
        capabilities: Object.freeze(entity.capabilities.slice()),
      }))),
    }),
  };
}

function sensorFrame(world, entityId, tick) {
  const entity = world.entities.get(entityId);
  assert.ok(entity, `sensor requested unknown entity ${entityId}`);
  const phase = phaseAt(tick);
  entity.tethered = phase === 'tethered' && (entityId === 102 || entityId === 202);
  const contacts = [];
  if (phase === 'hostile') {
    contacts.push({
      id: world.target.id,
      kind: ContactKind.SHIP,
      team: 0,
      classification: 'player_ship_sensor_track',
      pos: { ...world.target.pos },
      vel: { ...world.target.vel },
      radius: 15,
      confidence: 0.96,
      threat: 0.62 + (world.seed % 23) / 100,
      tags: ['armed'],
    });
  } else if (phase === 'objective') {
    contacts.push({
      id: 800,
      kind: ContactKind.OBJECTIVE,
      team: null,
      classification: 'salvage_payload',
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 18,
      confidence: 0.98,
      objectiveValue: 1,
      massClass: 3,
      tags: ['tether_socket'],
    });
  } else if (phase === 'exposed_tether' || phase === 'tethered') {
    contacts.push({
      id: phase === 'exposed_tether' ? 'att_700' : 'att_hostile_701',
      attachmentId: phase === 'exposed_tether' ? 'att_700' : 'att_hostile_701',
      kind: ContactKind.TETHER,
      team: 0,
      classification: 'massline',
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 2,
      confidence: 0.99,
      threat: 0.85,
      targetId: entity.tethered ? entity.id : 800,
      ownerId: 900,
      exposed: phase === 'exposed_tether',
      tethered: entity.tethered,
      ownedBySelf: phase === 'exposed_tether',
      tags: phase === 'exposed_tether'
        ? ['severable', 'owned_by_self', 'cuttable_by_self']
        : ['overloadable', 'hostile'],
    });
  }

  const frame = {
    tick,
    self: {
      id: entity.id,
      team: entity.team,
      pos: { ...entity.pos },
      vel: { ...entity.vel },
      rot: entity.rot,
      radius: entity.radius,
      hullFraction: entity.hullFraction,
      energyFraction: entity.energyFraction,
      heatFraction: entity.heatFraction,
      disabled: entity.disabled,
      tethered: entity.tethered,
      capabilities: entity.capabilities.slice(),
      subsystemFractions: { ...entity.subsystemFractions },
    },
    contacts,
    events: [],
  };
  Object.defineProperty(frame, 'hiddenPlayerState', {
    enumerable: false,
    get() { throw new Error('AI attempted to read hidden player state'); },
  });
  return frame;
}

function phaseAt(tick) {
  if (tick < 100) return 'respite';
  if (tick < 200) return 'hostile';
  if (tick < 300) return 'objective';
  if (tick < 400) return 'exposed_tether';
  if (tick < 500) return 'tethered';
  return 'hostile';
}

function makeActionDefs() {
  return ACTION_DEFS;
}

function makeActionPort(world, defs) {
  const byId = new Map(defs.map((def) => [def.id, def]));
  const active = new Map();
  const starts = [];
  let sequence = 0;
  const available = (entityId) => {
    const caps = new Set(world.entities.get(entityId).capabilities);
    return defs.filter((def) => (def.requiresCapabilities || []).every((capability) => caps.has(capability)));
  };
  return {
    starts,
    list(entityId) { return available(entityId).map(toTacticalActionDef); },
    canStart(entityId, actionId, request) {
      const entity = world.entities.get(entityId);
      const def = byId.get(actionId);
      if (!def || !available(entityId).some((candidate) => candidate.id === actionId)) return { ok: false, reason: 'action_not_installed' };
      const capCost = Number(def.costs && def.costs.capacitor) || 0;
      const heatCost = Number(def.costs && def.costs.heat) || 0;
      if (entity.energyFraction * 100 < capCost) return { ok: false, reason: 'insufficient_capacitor' };
      if (entity.heatFraction * 100 + heatCost > 100) return { ok: false, reason: 'heat_limit' };
      if (def.target && def.target.required && request.targetId == null) return { ok: false, reason: 'target_required' };
      if (def.target && def.target.ownedByActor) {
        const tags = new Set(request.target && request.target.tags || []);
        if (!request.target || (!request.target.ownedBySelf && !tags.has('owned_by_self') && !tags.has('cuttable_by_self'))) {
          return { ok: false, reason: 'not_attachment_owner' };
        }
      }
      return { ok: true, reason: 'canonical_action_gate_fixture' };
    },
    start(entityId, actionId, request) {
      const def = byId.get(actionId);
      assert.ok(def && available(entityId).some((candidate) => candidate.id === actionId), `AI started unavailable ActionDef ${actionId}`);
      const entity = world.entities.get(entityId);
      const handle = `${entityId}:${++sequence}`;
      const totalTicks = ['startupTicks', 'activeTicks', 'recoveryTicks']
        .reduce((sum, key) => sum + Math.max(0, Number(def.phases && def.phases[key]) || 0), 0);
      const rec = {
        handle, entityId, actionId, startedTick: world.tick,
        cancelOpenTick: world.tick + Math.max(1, totalTicks - 1),
        endTick: world.tick + Math.max(1, totalTicks), status: 'running',
      };
      active.set(entityId, rec);
      entity.energyFraction = Math.max(0, entity.energyFraction - (Number(def.costs && def.costs.capacitor) || 0) / 100);
      entity.heatFraction = Math.min(1, entity.heatFraction + (Number(def.costs && def.costs.heat) || 0) / 100);
      const counterTether = (actionId === 'action_cut' && phaseAt(world.tick) === 'exposed_tether')
        || (actionId === 'action_dash' && phaseAt(world.tick) === 'tethered');
      starts.push(Object.freeze({
        entityId, actionId, targetId: request.targetId, tick: world.tick,
        source: request.source, viaActionPort: true, counterTether,
      }));
      return handle;
    },
    status(entityId, handle) {
      const rec = active.get(entityId);
      if (!rec || rec.handle !== handle) return 'cancelled';
      if (rec.status !== 'running') return rec.status;
      if (world.tick >= rec.endTick) rec.status = 'completed';
      return rec.status;
    },
    interrupt(entityId, handle) {
      const rec = active.get(entityId);
      if (!rec || rec.handle !== handle || rec.status !== 'running') return false;
      if (world.tick < rec.cancelOpenTick) return false;
      rec.status = 'cancelled';
      return true;
    },
  };
}

function makeManeuverPort(world) {
  return {
    request(request) {
      assert.equal(request.version, 1);
      assert.ok(world.entities.has(request.entityId), `maneuver request for unknown entity ${request.entityId}`);
      for (const value of [request.forceLocal.forward, request.forceLocal.right, request.torqueYaw]) {
        assert.ok(Number.isFinite(value) && Math.abs(value) <= 1, 'maneuver request outside normalized physical envelope');
      }
      world.pendingRequests.set(request.entityId, request);
    },
  };
}

function integrate(world) {
  const dt = 1 / 60;
  for (const entity of world.entities.values()) {
    const request = world.pendingRequests.get(entity.id);
    if (!request) continue;
    const turn = clamp(wrapAngle(request.targetHeading - entity.rot), -0.22, 0.22);
    entity.rot = wrapAngle(entity.rot + turn * 0.62 + request.torqueYaw * 0.025);
    const c = Math.cos(entity.rot), s = Math.sin(entity.rot);
    const forward = request.forceLocal.forward;
    const right = request.forceLocal.right;
    const accel = request.boost ? 250 : 190;
    entity.vel.x += (c * forward - s * right) * accel * dt;
    entity.vel.z += (s * forward + c * right) * accel * dt;
    const drag = request.brake ? 0.72 : 0.91;
    entity.vel.x *= drag;
    entity.vel.z *= drag;
    const maxSpeed = request.boost ? 58 : 42;
    const speed = Math.hypot(entity.vel.x, entity.vel.z);
    if (speed > maxSpeed) {
      entity.vel.x *= maxSpeed / speed;
      entity.vel.z *= maxSpeed / speed;
    }
    entity.pos.x += entity.vel.x * dt;
    entity.pos.z += entity.vel.z * dt;
    entity.energyFraction = Math.min(1, entity.energyFraction + 0.0035);
    entity.heatFraction = Math.max(0, entity.heatFraction - 0.0045);

    const force = Math.hypot(request.forceLocal.forward, request.forceLocal.right);
    const commandedStationary = force > 0.2 && Math.hypot(entity.vel.x, entity.vel.z) < 0.25;
    const count = commandedStationary ? (world.stationary.get(entity.id) || 0) + 1 : 0;
    world.stationary.set(entity.id, count);
    world.maxCommandedStationaryTicks = Math.max(world.maxCommandedStationaryTicks, count);
  }
}

function initialFormationSlots(base, rot, count, spacing) {
  const out = [];
  for (let index = 0; index < count; index++) {
    if (index === 0) { out.push({ ...base }); continue; }
    const rank = Math.ceil(index / 2);
    const side = index % 2 === 0 ? 1 : -1;
    const localX = side * rank * spacing * 0.72;
    const localZ = -rank * spacing;
    const c = Math.cos(rot), s = Math.sin(rot);
    out.push({ x: base.x + c * localZ - s * localX, z: base.z + s * localZ + c * localX });
  }
  return out;
}

function compress(values) {
  const out = [];
  for (const value of values) if (out[out.length - 1] !== value) out.push(value);
  return out;
}

function hasAlternatingOscillation(sequence) {
  for (let i = 0; i + 4 < sequence.length; i++) {
    if (sequence[i] === sequence[i + 2] && sequence[i] === sequence[i + 4] && sequence[i + 1] === sequence[i + 3] && sequence[i] !== sequence[i + 1]) return true;
  }
  return false;
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function clamp(value, min, max) { return value < min ? min : (value > max ? max : value); }
function round6(value) { return Math.round(value * 1e6) / 1e6; }
function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = value + 0x6d2b79f5 | 0;
    let t = Math.imul(value ^ value >>> 15, 1 | value);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function readInt(name, fallback) {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!arg) return fallback;
  const value = Number(arg.slice(prefix.length));
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return value;
}
