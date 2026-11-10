import { decideCounterplay } from './decide.js';
import { isCounterplayDoctrineId, counterplayDoctrineById } from './catalog.js';
import { restoreCounterplayMemory } from './memory.js';
import { applyCounterplayIntent, applyCounterplayPhysical } from './adapterPatch.js';
import { capitalScoreControls, capitalBossOrder } from '../capitalBossOrders.js';
import { nemesisFireAllowed } from '../nemesisTactics.js';
import { occupantGenerationOf } from '../../core/entity.js';
import { clearAIFiringIntent } from '../../systems/aiFireIntent.js';

// Only minds normalized and published by this live owner may bypass restoration.
// Saved replacements, doctrine swaps and recycled hulls enter through restore again.
const liveMinds = new WeakMap();

function liveMemoryFor(ai, generation) {
  const cached = liveMinds.get(ai);
  if (cached && cached.memory === ai.counterplayMemory
    && cached.doctrineId === ai.counterplayDoctrineId && cached.generation === generation) return cached.memory;
  const memory = restoreCounterplayMemory(ai.counterplayMemory, ai.counterplayDoctrineId);
  liveMinds.set(ai, { memory, doctrineId: ai.counterplayDoctrineId, generation });
  return memory;
}

export function isCounterplayActor(entity, state) {
  return entity?.id !== state?.playerId && entity?.alive !== false
    && isCounterplayDoctrineId(entity?.data?.ai?.counterplayDoctrineId)
    && !capitalScoreControls(state, entity.id);
}

export function isCounterplayOwned(entity, state) {
  if (isCounterplayActor(entity, state)) return true;
  const controller = state?.entities?.get(entity?.data?.counterplayControllerId);
  return !!controller && isCounterplayActor(controller, state);
}

/** Numeric slots change on save restore; durable cast identity does not. */
export function rebindCounterplayCast(state, entities) {
  const casts = new Map();
  for (const entity of entities || []) {
    const key = entity.data?.counterplayCaseKey;
    if (!key || entity.alive === false) continue;
    const cast = casts.get(key) || new Map();
    cast.set(entity.data.counterplayRole, entity); casts.set(key, cast);
  }
  for (const cast of casts.values()) {
    const owner = cast.get('opponent'), ai = owner?.data?.ai;
    if (!ai) continue;
    for (const role of ['patient', 'packmate']) {
      const mate = cast.get(role); if (mate) mate.data.counterplayControllerId = owner.id;
    }
    const objective = ai.counterplayObjective;
    if (objective) {
      if (cast.has('patient')) objective.patientId = cast.get('patient').id;
      const anchor = cast.get('anchor') || cast.get('orbit_anchor');
      if (anchor) objective.anchorId = anchor.id;
    }
    const memory = ai.counterplayMemory;
    if (memory && memory.notes?.boundGeneration !== occupantGenerationOf(owner)) {
      delete ai.counterplayAction;
      memory.delay = [];
      const targetRole = { swing: 'anchor', release: 'orbit_body', latch_prize: 'prize' }[memory.commit?.id];
      const target = cast.get(targetRole);
      if (target && memory.commit) { memory.commit.targetId = target.id; memory.commit.targetGeneration = occupantGenerationOf(target) ?? 1; }
      memory.notes.boundGeneration = occupantGenerationOf(owner);
    }
  }
}

function body(entity, role) {
  return { id: entity.id, generation: occupantGenerationOf(entity) ?? 1, kind: entity.type,
    role, team: entity.team, pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: entity.vel?.x || 0, z: entity.vel?.z || 0 }, rot: entity.rot || 0,
    radius: entity.radius || 8, hull: entity.hull || 0, shield: entity.shield || 0, alive: entity.alive !== false };
}

/** The existing AI sensor frame is the only source of external poses. */
export function counterplaySensorInput(state, entity, frame) {
  const contacts = [], obstacles = [], tethers = [];
  for (const contact of frame?.contacts || []) {
    if (contact.visible === false || contact.valid === false || contact.alive === false) continue;
    if (contact.kind === 'tether') {
      const attachment = state.combat?.attachments?.byId?.[contact.attachmentId || contact.id];
      if (attachment?.state !== 'active') continue;
      const a = state.entities.get(attachment.ownerId), b = state.entities.get(attachment.targetId);
      if (!a || !b) continue;
      tethers.push({ id: attachment.id, ownerId: attachment.ownerId, targetId: attachment.targetId,
        length: Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z), restLength: attachment.restLength });
      continue;
    }
    const actual = state.entities.get(contact.id);
    // Identity/role metadata is not a current position oracle. Every pose below is the sensor's.
    const role = contact.id === state.playerId ? 'player' : actual?.data?.counterplayRole || contact.classification || '';
    const row = { ...contact, role, generation: occupantGenerationOf(actual) ?? 1 };
    contacts.push(row);
    if (contact.kind === 'hazard' && !['prize', 'orbit_body'].includes(role)) obstacles.push(row);
  }
  return { self: body(entity, 'opponent'), contacts, obstacles, tethers };
}

export function driveCounterplay({ ctx, entities, sensorPort, maneuverPort } = {}) {
  const state = ctx?.state;
  if (!state || state.mode !== 'flight' || !(state.timeScale > 0) || !sensorPort?.frameFor) return;
  for (const entity of entities || []) {
    if (!isCounterplayActor(entity, state)) continue;
    if (entity.data.homeSectorId && entity.data.homeSectorId !== state.world?.currentSectorId) {
      if (entity.data.intent) {
        if (Object.isFrozen(entity.data.intent)) entity.data.intent = { ...entity.data.intent };
        clearAIFiringIntent(entity.data.intent);
      }
      continue;
    }
    const ai = entity.data.ai, frame = sensorPort.frameFor(entity.id, state.tick);
    const generation = occupantGenerationOf(entity);
    const memory = liveMemoryFor(ai, generation);
    if (!ai.counterplayMemory) { memory.phaseSince = state.tick; memory.stallSince = state.tick; }
    memory.notes.boundGeneration = generation;
    const input = counterplaySensorInput(state, entity, frame);
    const decision = decideCounterplay({ ...input, doctrineId: ai.counterplayDoctrineId,
      tick: state.tick, objective: ai.counterplayObjective || {}, memory });
    decision.phaseStartedTick = memory.phaseSince;
    const delay = counterplayDoctrineById(ai.counterplayDoctrineId).reactionDelayTicks;
    let due = null;
    for (let index = memory.delay.length - 1; index >= 0; index--) {
      if (memory.delay[index].tick <= state.tick - delay) { due = memory.delay[index]; break; }
    }
    const sensed = due?.contacts || [];
    const targetRow = sensed.find((row) => row.id === decision.attack?.targetId);
    const target = targetRow && state.entities.get(targetRow.id);
    if (!target || !input.contacts.some((contact) => contact.id === target.id)
      || occupantGenerationOf(target) !== targetRow.generation && occupantGenerationOf(target) != null
      || !nemesisFireAllowed(entity, state) || capitalBossOrder(state, entity.id)?.suppressStockFire) decision.attack = null;
    const result = applyCounterplayIntent({ state, helpers: ctx.helpers, ctx, entity, decision, tick: state.tick, target, maneuverPort });
    const verb = applyCounterplayPhysical({ ctx, entity, decision, sensed, memory, maneuverPort });
    ai.counterplayMemory = memory;
    const previous = entity.data.counterplay;
    entity.data.counterplay = { doctrineId: decision.doctrineId, phase: decision.phase,
      telegraph: decision.telegraph, cue: decision.cue, explain: decision.explain,
      fallback: decision.fallback, fireAuthorized: result.fire.authorized, fireReason: result.fire.reason, verbReason: verb.reason || null };
    if (decision.telegraph?.readable && (!previous?.telegraph || previous.phase !== decision.phase)) ctx.bus?.emit('ai:telegraph', {
      entityId: entity.id, doctrineId: decision.doctrineId, phase: decision.phase,
      kind: decision.telegraph.kind, durationTicks: decision.telegraph.durationTicks || 30, tick: state.tick,
      attackLine: decision.cue || null,
    });
  }
}
