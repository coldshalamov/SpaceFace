import { formatScenarioIssue, validateScenarioDocument } from '../contracts/scenarioSchemas.js';
import { FIGURES } from '../data/narrative.js';

export const SCENARIO_RUNTIME_SCHEMA_VERSION = 1;
const SCENARIO_EVIDENCE_EVENT_CAP = 512;

export const scenarioRuntime = {
  name: 'scenarioRuntime',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._contract = this.helpers.scenarioContract || null;
    this._contractPath = normalizePath(this.helpers.scenarioContractPath || '');
    this._contractHash = this.helpers.scenarioContractHash || null;
    this._lastBeatId = null;
    this.helpers.applyScenarioBranch = (branchId, options = {}) => applyScenarioBranch(this, branchId, options);
    this._subscriptions = [
      this.bus.on('combat:actionStarted', (payload) => recordScenarioEvidenceEvent(this, 'combat:actionStarted', payload || {})),
      this.bus.on('tether:attached', (payload) => recordScenarioEvidenceEvent(this, 'tether:attached', payload || {})),
      this.bus.on('tether:broken', (payload) => recordScenarioEvidenceEvent(this, 'tether:broken', payload || {})),
    ];
    ensureScenarioState(this.state);

    if (this._contract) {
      const report = validateScenarioDocument(this._contract, { file: this._contractPath || this._contract.id || 'scenario' });
      if (!report.ok) {
        throw new Error('Scenario contract rejected by runtime:\n' + report.issues.map(formatScenarioIssue).join('\n'));
      }
    }
  },

  update() {
    if (!this._contract) return;
    const scenario = ensureScenarioState(this.state);
    const active = scenario.active;
    if (!active || active.id !== this._contract.id || active.contractHash !== this._contractHash) {
      activateScenario(this, this._contract);
    }
    updateActiveBeat(this, this._contract);
    evaluateBranchPredicates(this, this._contract);
  },

  serialize() {
    return clonePlain(ensureScenarioState(this.state));
  },

  deserialize(data) {
    this.state.scenario = normalizeScenarioState(data);
    this._lastBeatId = this.state.scenario.active && this.state.scenario.active.activeBeatId
      ? this.state.scenario.active.activeBeatId
      : null;
  },

  dispose() {
    while (this._subscriptions && this._subscriptions.length) {
      const unsub = this._subscriptions.pop();
      try { unsub(); } catch (_err) {}
    }
  },
};

function activateScenario(runtime, contract) {
  const state = runtime.state;
  const facts = {};
  for (const fact of contract.facts || []) {
    facts[fact.id] = {
      value: fact.initial == null ? null : fact.initial,
      initial: fact.initial == null ? null : fact.initial,
      owner: fact.owner || null,
    };
  }

  const actorBindings = {};
  const unresolvedActorIds = [];
  for (const actor of contract.actors || []) {
    const binding = bindActor(state, actor);
    actorBindings[actor.id] = binding;
    if (binding.status !== 'bound') unresolvedActorIds.push(actor.id);
  }

  state.scenario = {
    schemaVersion: SCENARIO_RUNTIME_SCHEMA_VERSION,
    active: {
      id: contract.id,
      name: contract.scenario,
      contractSchema: contract.schema,
      contractVersion: contract.version,
      contractHash: runtime._contractHash,
      contractPath: runtime._contractPath,
      sourceSpec: contract.sourceSpec,
      status: contract.status,
      tickRate: contract.tickRate,
      durationSeconds: contract.durationSeconds,
      beatCount: Array.isArray(contract.beats) ? contract.beats.length : 0,
      branchCount: Array.isArray(contract.branches) ? contract.branches.length : 0,
      actorCount: Array.isArray(contract.actors) ? contract.actors.length : 0,
      factCount: Array.isArray(contract.facts) ? contract.facts.length : 0,
      activeBeatId: null,
      activeBeatOrder: null,
      activeBeatWindowS: null,
    },
    facts,
    actorBindings,
    unresolvedActorIds,
    enteredBeatIds: [],
    evidence: { schemaVersion: SCENARIO_RUNTIME_SCHEMA_VERSION, events: [] },
  };
  runtime._lastBeatId = null;

  runtime.bus.emit('scenario:loaded', {
    scenarioId: contract.id,
    name: contract.scenario,
    contractHash: runtime._contractHash,
    beatCount: contract.beats.length,
    branchCount: contract.branches.length,
    actorCount: contract.actors.length,
    factCount: contract.facts.length,
    status: contract.status,
  });
  runtime.bus.emit('scenario:factsInitialized', {
    scenarioId: contract.id,
    factCount: contract.facts.length,
    factIds: contract.facts.map((fact) => fact.id),
  });
  runtime.bus.emit('scenario:actorBindings', {
    scenarioId: contract.id,
    boundActorIds: Object.entries(actorBindings).filter(([, binding]) => binding.status === 'bound').map(([id]) => id),
    unresolvedActorIds,
  });
}

function updateActiveBeat(runtime, contract) {
  const scenario = ensureScenarioState(runtime.state);
  if (!scenario.active) return;
  const beat = beatForTime(contract.beats || [], contract.status === 'skeleton' ? 0 : (runtime.state.simTime || 0));
  if (!beat || beat.id === runtime._lastBeatId) return;
  scenario.active.activeBeatId = beat.id;
  scenario.active.activeBeatOrder = beat.order;
  scenario.active.activeBeatWindowS = [beat.timeStartS, beat.timeEndS];
  if (!scenario.enteredBeatIds.includes(beat.id)) scenario.enteredBeatIds.push(beat.id);
  runtime._lastBeatId = beat.id;
  runtime.bus.emit('scenario:beatEntered', {
    scenarioId: contract.id,
    beatId: beat.id,
    order: beat.order,
    title: beat.title,
    timeStartS: beat.timeStartS,
    timeEndS: beat.timeEndS,
    proofMetricIds: (beat.proofMetricIds || []).slice(),
    presentationEventIds: (beat.presentationEventIds || []).slice(),
  });
  emitBeatDialogue(runtime, contract, beat);
}

function recordScenarioEvidenceEvent(runtime, type, payload) {
  const scenario = ensureScenarioState(runtime.state);
  if (!scenario.active) return;
  const event = normalizeScenarioEvidenceEvent(runtime.state, type, payload);
  if (!event) return;
  const evidence = ensureScenarioEvidence(scenario);
  evidence.events.push(event);
  if (evidence.events.length > SCENARIO_EVIDENCE_EVENT_CAP) {
    evidence.events.splice(0, evidence.events.length - SCENARIO_EVIDENCE_EVENT_CAP);
  }
}

function normalizeScenarioEvidenceEvent(state, type, payload) {
  const event = {
    type,
    tick: Number.isSafeInteger(state && state.tick) ? state.tick : 0,
    simTime: Number.isFinite(state && state.simTime) ? round6(state.simTime) : 0,
  };
  if (type === 'combat:actionStarted') {
    event.actionId = stableString(payload.actionId);
    event.actorId = scenarioActorIdForEntity(state, payload.actorId);
    const target = payload.target || {};
    if (target.kind) event.targetKind = stableString(target.kind);
    if (target.kind === 'entity') {
      event.targetActorId = scenarioActorIdForEntity(state, target.entityId);
    } else if (target.kind === 'attachment') {
      const attachmentId = stableString(target.attachmentId);
      const attachment = getAttachment(state, attachmentId);
      event.attachmentId = attachmentId;
      if (attachment) {
        event.ownerActorId = scenarioActorIdForEntity(state, attachment.ownerId);
        event.targetActorId = scenarioActorIdForEntity(state, attachment.targetId);
      }
    }
    if (payload.source && typeof payload.source === 'object') {
      event.sourceKind = stableString(payload.source.kind);
      event.sourceControllerId = payload.source.controllerId == null ? null : stableString(payload.source.controllerId);
    }
  } else if (type === 'tether:attached' || type === 'tether:broken') {
    event.actorId = scenarioActorIdForEntity(state, payload.actorId);
    event.ownerActorId = event.actorId;
    event.targetActorId = scenarioActorIdForEntity(state, payload.targetId);
    event.attachmentId = stableString(payload.attachmentId);
    if (payload.reason != null) event.reason = stableString(payload.reason);
  } else {
    return null;
  }
  return event;
}

function emitBeatDialogue(runtime, contract, beat) {
  const lines = Array.isArray(contract.dialogue) ? contract.dialogue : [];
  for (const line of lines) {
    if (!line || line.beatId !== beat.id) continue;
    runtime.bus.emit('scenario:dialogueLine', {
      scenarioId: contract.id,
      beatId: beat.id,
      lineId: line.id,
      speakerActorId: line.speakerActorId,
      speaker: line.speaker,
      channel: line.channel,
      text: line.text,
      presentationEventId: line.presentationEventId,
      source: 'scenario-dialogue',
    });
  }
}

function evaluateBranchPredicates(runtime, contract) {
  const scenario = ensureScenarioState(runtime.state);
  if (!scenario.active || (scenario.resolution && scenario.resolution.branchId)) return;
  const matches = [];
  for (const branch of contract.branches || []) {
    if (!branch || !branch.resolutionPredicate) continue;
    if (!isBranchUnlocked(scenario, branch)) continue;
    const result = evaluatePredicate(runtime.state, scenario, branch.resolutionPredicate);
    if (result.ok) matches.push({ branch, predicate: branch.resolutionPredicate, evidence: result.evidence });
  }
  if (matches.length > 1) {
    const branchIds = matches.map((match) => match.branch.id).sort().join(', ');
    throw new Error(`Scenario branch predicate ambiguity: ${branchIds}`);
  }
  if (matches.length === 1) {
    const match = matches[0];
    applyScenarioBranch(runtime, match.branch.id, {
      source: match.predicate.source || 'live-state',
      predicateId: match.predicate.id,
      predicateEvidence: match.evidence,
    });
  }
}

function evaluatePredicate(state, scenario, predicate) {
  const evidence = [];
  for (const condition of predicate.all || []) {
    const result = evaluatePredicateCondition(state, scenario, condition || {});
    if (!result.ok) return { ok: false, evidence };
    evidence.push(result.evidence);
  }
  return {
    ok: true,
    evidence: {
      predicateId: predicate.id || null,
      conditions: evidence,
    },
  };
}

function evaluatePredicateCondition(state, scenario, condition) {
  if (condition.kind === 'beatEntered') {
    const entered = Array.isArray(scenario.enteredBeatIds) && scenario.enteredBeatIds.includes(condition.beatId);
    return {
      ok: entered,
      evidence: { kind: condition.kind, beatId: condition.beatId, entered },
    };
  }
  if (condition.kind === 'actionStarted') {
    const events = scenarioEvidenceEvents(scenario).filter((event) =>
      event.type === 'combat:actionStarted' && eventMatchesCondition(event, condition));
    return countConditionResult(events.length, condition, 1, {
      kind: condition.kind,
      actorId: condition.actorId || null,
      actionId: condition.actionId || null,
      targetActorId: condition.targetActorId || null,
      count: events.length,
      latestTick: latestTick(events),
    });
  }
  if (condition.kind === 'attachmentActive') {
    const attachments = activeAttachmentsForCondition(state, condition);
    return countConditionResult(attachments.length, condition, 1, {
      kind: condition.kind,
      ownerActorId: condition.ownerActorId || null,
      targetActorId: condition.targetActorId || null,
      count: attachments.length,
      attachmentIds: attachments.map((attachment) => attachment.id).sort(),
    });
  }
  if (condition.kind === 'actorDistance') {
    const actor = entityForScenarioActor(state, condition.actorId);
    const target = entityForScenarioActor(state, condition.targetActorId);
    const distance = actor && target && actor.alive && target.alive
      ? distance2d(actor.pos, target.pos)
      : null;
    const maxDistance = Number(condition.maxDistance);
    return {
      ok: Number.isFinite(distance) && Number.isFinite(maxDistance) && distance <= maxDistance,
      evidence: {
        kind: condition.kind,
        actorId: condition.actorId || null,
        targetActorId: condition.targetActorId || null,
        distance: Number.isFinite(distance) ? round6(distance) : null,
        maxDistance: Number.isFinite(maxDistance) ? round6(maxDistance) : null,
      },
    };
  }
  if (condition.kind === 'eventCount') {
    const events = scenarioEvidenceEvents(scenario).filter((event) =>
      (!condition.eventType || event.type === condition.eventType) && eventMatchesCondition(event, condition));
    return countConditionResult(events.length, condition, condition.maxCount == null ? 1 : 0, {
      kind: condition.kind,
      eventType: condition.eventType || null,
      actorId: condition.actorId || null,
      ownerActorId: condition.ownerActorId || null,
      targetActorId: condition.targetActorId || null,
      actionId: condition.actionId || null,
      count: events.length,
      latestTick: latestTick(events),
    });
  }
  return { ok: false, evidence: { kind: condition.kind || 'unknown', reason: 'unsupported_condition' } };
}

function countConditionResult(count, condition, defaultMin, evidence) {
  const minCount = Number.isSafeInteger(condition.minCount) ? condition.minCount : defaultMin;
  const maxCount = Number.isSafeInteger(condition.maxCount) ? condition.maxCount : null;
  const ok = count >= minCount && (maxCount == null || count <= maxCount);
  return {
    ok,
    evidence: {
      ...evidence,
      minCount,
      maxCount,
    },
  };
}

function eventMatchesCondition(event, condition) {
  if (condition.actionId && event.actionId !== condition.actionId) return false;
  if (condition.actorId && event.actorId !== condition.actorId) return false;
  if (condition.ownerActorId && event.ownerActorId !== condition.ownerActorId) return false;
  if (condition.targetActorId && event.targetActorId !== condition.targetActorId) return false;
  return true;
}

function activeAttachmentsForCondition(state, condition) {
  const owner = entityForScenarioActor(state, condition.ownerActorId);
  const target = entityForScenarioActor(state, condition.targetActorId);
  if (!owner || !target) return [];
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId || {};
  return Object.values(attachments).filter((attachment) =>
    attachment && attachment.state === 'active'
    && attachment.ownerId === owner.id
    && attachment.targetId === target.id);
}

function isBranchUnlocked(scenario, branch) {
  const active = scenario.active || {};
  return active.activeBeatId === branch.unlockedByBeat
    || (Array.isArray(scenario.enteredBeatIds) && scenario.enteredBeatIds.includes(branch.unlockedByBeat));
}

function applyScenarioBranch(runtime, branchId, options = {}) {
  const scenario = ensureScenarioState(runtime.state);
  const active = scenario.active;
  const contract = runtime._contract;
  if (!contract || !active || active.id !== contract.id) {
    return { ok: false, reason: 'scenario_not_active' };
  }
  if (scenario.resolution && scenario.resolution.branchId) {
    return { ok: false, reason: 'already_resolved', branchId: scenario.resolution.branchId };
  }

  const branch = (contract.branches || []).find((item) => item && item.id === branchId);
  if (!branch) return { ok: false, reason: 'unknown_branch', branchId };
  const unlocked = active.activeBeatId === branch.unlockedByBeat
    || (Array.isArray(scenario.enteredBeatIds) && scenario.enteredBeatIds.includes(branch.unlockedByBeat));
  if (!unlocked) {
    return {
      ok: false,
      reason: 'branch_locked',
      branchId,
      activeBeatId: active.activeBeatId || null,
      unlockedByBeat: branch.unlockedByBeat,
    };
  }

  const effects = [];
  for (const effect of branch.worldFactEffects || []) {
    const result = applyWorldFactEffect(scenario, effect);
    if (!result.ok) return { ok: false, reason: result.reason, branchId, factId: effect && effect.factId };
    effects.push(result.effect);
    runtime.bus.emit('scenario:factChanged', {
      scenarioId: contract.id,
      branchId: branch.id,
      policyId: branch.policyId,
      factId: result.effect.factId,
      op: result.effect.op,
      before: clonePlain(result.effect.before),
      after: clonePlain(result.effect.after),
      source: options.source || branch.policyId || 'policy',
    });
  }

  const resolution = {
    branchId: branch.id,
    policyId: branch.policyId,
    source: options.source || branch.policyId || 'policy',
    tick: Number.isSafeInteger(runtime.state.tick) ? runtime.state.tick : 0,
    simTime: Number.isFinite(runtime.state.simTime) ? runtime.state.simTime : 0,
    outcomeTags: Array.isArray(branch.outcomeTags) ? branch.outcomeTags.slice() : [],
    lifecycle: clonePlain(branch.lifecycle || {}),
    effects,
  };
  if (options.predicateId) resolution.predicateId = options.predicateId;
  if (options.predicateEvidence) resolution.predicateEvidence = clonePlain(options.predicateEvidence);
  scenario.resolution = clonePlain(resolution);
  runtime.bus.emit('scenario:branchResolved', {
    scenarioId: contract.id,
    branchId: branch.id,
    policyId: branch.policyId,
    summary: branch.summary,
    outcomeTags: resolution.outcomeTags.slice(),
    lifecycle: clonePlain(resolution.lifecycle),
    effects: clonePlain(effects),
    source: resolution.source,
    predicateId: options.predicateId || null,
    predicateEvidence: options.predicateEvidence ? clonePlain(options.predicateEvidence) : null,
  });
  return { ok: true, ...clonePlain(resolution) };
}

function applyWorldFactEffect(scenario, effect) {
  if (!effect || !effect.factId || !scenario.facts || !scenario.facts[effect.factId]) {
    return { ok: false, reason: 'unknown_fact' };
  }
  const fact = scenario.facts[effect.factId];
  const before = clonePlain(fact.value);
  let after;
  if (effect.op === 'set') {
    after = clonePlain(effect.value);
  } else if (effect.op === 'increment') {
    const a = Number(fact.value || 0);
    const b = Number(effect.value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, reason: 'invalid_increment' };
    after = a + b;
  } else if (effect.op === 'append') {
    const list = Array.isArray(fact.value) ? fact.value.slice() : [];
    list.push(clonePlain(effect.value));
    after = list;
  } else {
    return { ok: false, reason: 'unsupported_fact_op' };
  }
  fact.value = after;
  return {
    ok: true,
    effect: {
      factId: effect.factId,
      op: effect.op,
      before,
      after: clonePlain(after),
    },
  };
}

function beatForTime(beats, simTime) {
  if (!Array.isArray(beats) || beats.length === 0) return null;
  const t = Math.max(0, Number(simTime) || 0);
  for (const beat of beats) {
    if (t >= beat.timeStartS && t < beat.timeEndS) return beat;
  }
  return t >= beats[beats.length - 1].timeEndS ? beats[beats.length - 1] : beats[0];
}

function bindActor(state, actor) {
  const narrativeBinding = bindNarrativeActor(actor);
  if (narrativeBinding) return narrativeBinding;
  const entity = findActorEntity(state, actor);
  if (entity) {
    return {
      status: 'bound',
      entityId: entity.id,
      role: actor.role,
      assetRef: actor.assetRef || null,
    };
  }
  return {
    status: 'unresolved',
    entityId: null,
    role: actor.role,
    assetRef: actor.assetRef || null,
  };
}

function bindNarrativeActor(actor) {
  if (!actor || actor.role !== 'remote_contact') return null;
  const assetRef = typeof actor.assetRef === 'string' ? actor.assetRef : '';
  const prefix = 'lore.contact.';
  if (!assetRef.startsWith(prefix)) return null;
  const figureId = assetRef.slice(prefix.length);
  const figure = FIGURES && FIGURES[figureId];
  if (!figure) return null;
  return {
    status: 'bound',
    entityId: null,
    role: actor.role,
    assetRef: actor.assetRef || null,
    source: {
      kind: 'narrativeFigure',
      figureId,
      name: figure.name || figureId,
    },
  };
}

function findActorEntity(state, actor) {
  if (!state || !actor) return null;
  if (actor.id === 'player_kestrel' && state.playerId && state.entities) {
    const player = state.entities.get(state.playerId);
    if (player) return player;
  }
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  for (const entity of list) {
    const data = entity && entity.data || {};
    if (data.scenarioActorId === actor.id) return entity;
    if (data.scenarioRole === actor.role) return entity;
    if (actor.assetRef && (data.assetRef === actor.assetRef || data.defId === actor.assetRef)) return entity;
  }
  return null;
}

function scenarioActorIdForEntity(state, entityId) {
  if (entityId == null || !state) return null;
  const id = Number(entityId);
  if (!Number.isSafeInteger(id)) return null;
  const entity = state.entities && state.entities.get(id);
  const direct = entity && entity.data && entity.data.scenarioActorId;
  if (typeof direct === 'string' && direct) return direct;
  const bindings = state.scenario && state.scenario.actorBindings || {};
  for (const [actorId, binding] of Object.entries(bindings)) {
    if (binding && binding.entityId === id) return actorId;
  }
  return null;
}

function entityForScenarioActor(state, actorId) {
  if (!state || !actorId) return null;
  const binding = state.scenario && state.scenario.actorBindings && state.scenario.actorBindings[actorId];
  if (binding && binding.status === 'bound' && binding.entityId != null && state.entities) {
    const entity = state.entities.get(binding.entityId);
    if (entity) return entity;
  }
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  return list.find((entity) => entity && entity.data && entity.data.scenarioActorId === actorId) || null;
}

function getAttachment(state, attachmentId) {
  const attachments = state && state.combat && state.combat.attachments && state.combat.attachments.byId || {};
  return attachmentId == null ? null : attachments[String(attachmentId)] || null;
}

function ensureScenarioState(state) {
  if (!state.scenario || typeof state.scenario !== 'object' || Array.isArray(state.scenario)) {
    state.scenario = normalizeScenarioState(null);
  } else {
    state.scenario = normalizeScenarioState(state.scenario);
  }
  return state.scenario;
}

function normalizeScenarioState(data) {
  const src = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const out = {
    schemaVersion: SCENARIO_RUNTIME_SCHEMA_VERSION,
    active: src.active && typeof src.active === 'object' ? clonePlain(src.active) : null,
    facts: src.facts && typeof src.facts === 'object' && !Array.isArray(src.facts) ? clonePlain(src.facts) : {},
    actorBindings: src.actorBindings && typeof src.actorBindings === 'object' && !Array.isArray(src.actorBindings)
      ? clonePlain(src.actorBindings)
      : {},
    unresolvedActorIds: Array.isArray(src.unresolvedActorIds) ? src.unresolvedActorIds.filter((id) => typeof id === 'string') : [],
    enteredBeatIds: Array.isArray(src.enteredBeatIds) ? src.enteredBeatIds.filter((id) => typeof id === 'string') : [],
    evidence: normalizeScenarioEvidence(src.evidence),
  };
  if (src.resolution && typeof src.resolution === 'object' && !Array.isArray(src.resolution)) {
    out.resolution = clonePlain(src.resolution);
  }
  return out;
}

function ensureScenarioEvidence(scenario) {
  if (!scenario.evidence || typeof scenario.evidence !== 'object' || Array.isArray(scenario.evidence)) {
    scenario.evidence = { schemaVersion: SCENARIO_RUNTIME_SCHEMA_VERSION, events: [] };
  } else {
    scenario.evidence = normalizeScenarioEvidence(scenario.evidence);
  }
  return scenario.evidence;
}

function normalizeScenarioEvidence(data) {
  const src = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const events = Array.isArray(src.events)
    ? src.events.map(normalizeStoredEvidenceEvent).filter(Boolean).slice(-SCENARIO_EVIDENCE_EVENT_CAP)
    : [];
  return {
    schemaVersion: SCENARIO_RUNTIME_SCHEMA_VERSION,
    events,
  };
}

function normalizeStoredEvidenceEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {
    type: stableString(value.type),
    tick: Number.isSafeInteger(value.tick) ? value.tick : 0,
    simTime: Number.isFinite(value.simTime) ? round6(value.simTime) : 0,
  };
  for (const key of [
    'actionId',
    'actorId',
    'targetKind',
    'targetActorId',
    'ownerActorId',
    'attachmentId',
    'sourceKind',
    'sourceControllerId',
    'reason',
  ]) {
    if (value[key] != null) out[key] = stableString(value[key]);
  }
  return out.type ? out : null;
}

function scenarioEvidenceEvents(scenario) {
  return scenario && scenario.evidence && Array.isArray(scenario.evidence.events)
    ? scenario.evidence.events
    : [];
}

function latestTick(events) {
  let tick = null;
  for (const event of events) {
    if (Number.isSafeInteger(event.tick) && (tick == null || event.tick > tick)) tick = event.tick;
  }
  return tick;
}

function distance2d(a, b) {
  if (!a || !b) return null;
  const ax = Number(a.x), az = Number(a.z), bx = Number(b.x), bz = Number(b.z);
  if (![ax, az, bx, bz].every(Number.isFinite)) return null;
  return Math.hypot(ax - bx, az - bz);
}

function stableString(value) {
  if (value == null) return null;
  const text = String(value);
  return text ? text : null;
}

function round6(value) {
  return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
}

function clonePlain(value) {
  if (value == null) return value;
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? value : 0;
  if (t === 'string' || t === 'boolean') return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  if (t === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const cloned = clonePlain(value[key]);
      if (cloned !== undefined) out[key] = cloned;
    }
    return out;
  }
  return undefined;
}

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}
