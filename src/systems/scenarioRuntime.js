import { formatScenarioIssue, validateScenarioDocument } from '../contracts/scenarioSchemas.js';
import { FIGURES } from '../data/narrative.js';

export const SCENARIO_RUNTIME_SCHEMA_VERSION = 1;

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
  };
  if (src.resolution && typeof src.resolution === 'object' && !Array.isArray(src.resolution)) {
    out.resolution = clonePlain(src.resolution);
  }
  return out;
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
