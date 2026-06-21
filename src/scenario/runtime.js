import { explainCondition, readPath } from './conditions.js';
import { migrateScenarioSnapshot, SCENARIO_RUNTIME_VERSION } from './migrations.js';

const MAX_AUTO_TRANSITIONS = 64;
const MAX_EVENT_DRAIN = 256;

export function createScenarioStore() {
  return {
    runtimeVersion: SCENARIO_RUNTIME_VERSION,
    facts: {},
    discoveredLore: [],
    activeIds: [],
    instances: {},
  };
}

export function createScenarioRuntime(options) {
  return new ScenarioRuntime(options);
}

export class ScenarioRuntime {
  constructor({ definition, store, capabilities = {}, extensions = {}, snapshot = null } = {}) {
    if (!definition || typeof definition !== 'object' || !definition.id) {
      throw new TypeError('ScenarioRuntime requires a scenario definition with an id');
    }
    this.definition = definition;
    this.nodes = new Map((definition.nodes || []).map((node) => [node.id, node]));
    this.store = normalizeStore(store || createScenarioStore());
    this.capabilities = normalizeCapabilities(capabilities);
    this.extensions = Object.freeze({ ...extensions });
    this._busy = false;
    this._eventQueue = [];
    this._disposed = false;

    seedFacts(this.store.facts, definition.facts);
    const existing = this.store.instances[definition.id];
    this.instance = existing ? normalizeInstance(existing, definition) : createInstance(definition);
    this.store.instances[definition.id] = this.instance;
    if (snapshot) this.restore(snapshot);
  }

  start({ nodeId, reason = 'start' } = {}) {
    this._assertLive();
    if (this.instance.nodeId) return this.inspect();
    const entry = nodeId || this.definition.entry;
    if (!this.nodes.has(entry)) throw new Error(`Scenario ${this.definition.id} entry node does not exist: ${entry}`);
    if (!this.store.activeIds.includes(this.definition.id)) this.store.activeIds.push(this.definition.id);
    this._goto(entry, reason, false);
    this._resolveAutomaticTransitions();
    return this.inspect();
  }

  choose(choiceId) {
    this._assertLive();
    const node = this.currentNode();
    if (!node) throw new Error(`Scenario ${this.definition.id} has not started`);
    const choice = (node.choices || []).find((item) => item.id === choiceId);
    if (!choice) throw new Error(`Choice ${choiceId} is not present at node ${node.id}`);
    const result = explainCondition(choice.when, this._conditionContext(null));
    if (!result.valid) {
      return { accepted: false, choiceId, nodeId: node.id, blockers: result.blockers };
    }

    this._runActions(choice.actions || [], { kind: 'choice', choiceId, payload: null });
    this._emit('scenario:choiceSelected', {
      scenarioId: this.definition.id,
      nodeId: node.id,
      choiceId,
      localizationId: choice.localizationId || null,
    });
    if (choice.to) this._goto(choice.to, `choice:${choiceId}`, true);
    this._resolveAutomaticTransitions();
    return { accepted: true, choiceId, inspection: this.inspect() };
  }

  abandon(reason = 'player') {
    this._assertLive();
    const nodeId = this.definition.abandonNode;
    if (!nodeId) return false;
    this._goto(nodeId, `abandon:${reason}`, true);
    this._resolveAutomaticTransitions();
    return true;
  }

  dispatch(event, payload = {}) {
    this._assertLive();
    if (typeof event !== 'string' || !event) throw new TypeError('Scenario event name must be a non-empty string');
    this._eventQueue.push({ event, payload: cloneJson(payload) });
    if (this._busy) return this.inspect();

    this._busy = true;
    let drained = 0;
    try {
      while (this._eventQueue.length) {
        if (++drained > MAX_EVENT_DRAIN) throw new Error(`Scenario ${this.definition.id} event queue exceeded ${MAX_EVENT_DRAIN}`);
        const next = this._eventQueue.shift();
        this._dispatchOne(next.event, next.payload);
      }
    } finally {
      this._busy = false;
    }
    return this.inspect();
  }

  tick(dt) {
    this._assertLive();
    if (!(Number.isFinite(dt) && dt >= 0)) throw new RangeError('Scenario dt must be finite and >= 0');
    if (!this.instance.nodeId || isSettledStatus(this.instance.status)) return this.inspect();
    this.instance.clockS = roundTime((this.instance.clockS || 0) + dt);
    const node = this.currentNode();
    if (!node) return this.inspect();

    for (const timer of node.timers || []) {
      const key = scopedKey(node.id, timer.id);
      const record = this.instance.timers[key] || (this.instance.timers[key] = {
        id: timer.id,
        nodeId: node.id,
        elapsedS: 0,
        durationS: timer.durationS,
        status: 'active',
      });
      if (record.status !== 'active') continue;
      record.elapsedS = roundTime(record.elapsedS + dt);
      if (record.elapsedS + 1e-9 < timer.durationS) continue;
      record.elapsedS = timer.durationS;
      record.status = 'elapsed';
      this._runActions(timer.actions || [], { kind: 'timer', timerId: timer.id, payload: null });
      this._emit('scenario:timerElapsed', { scenarioId: this.definition.id, nodeId: node.id, timerId: timer.id });
      if (timer.to) this._goto(timer.to, `timer:${timer.id}`, true);
      if (this.currentNode() !== node) break;
    }
    this._resolveAutomaticTransitions();
    return this.inspect();
  }

  currentNode() {
    return this.instance.nodeId ? (this.nodes.get(this.instance.nodeId) || null) : null;
  }

  inspect() {
    const node = this.currentNode();
    const choices = (node && node.choices ? node.choices : []).map((choice) => {
      const result = explainCondition(choice.when, this._conditionContext(null));
      return {
        id: choice.id,
        localizationId: choice.localizationId || null,
        valid: result.valid,
        blockers: result.valid ? [] : result.blockers,
        to: choice.to || null,
      };
    });
    return {
      scenarioId: this.definition.id,
      contentVersion: this.definition.contentVersion || 1,
      status: this.instance.status,
      phase: this.instance.phase,
      nodeId: this.instance.nodeId,
      nodeKind: node ? (node.kind || 'stage') : null,
      localizationId: node ? (node.localizationId || null) : null,
      speakerActorId: node && node.dialogue ? (node.dialogue.speakerActorId || null) : null,
      outcome: this.instance.outcome || null,
      choices,
      objectives: activeRecordsForNode(this.instance.objectives, this.instance.nodeId),
      timers: activeRecordsForNode(this.instance.timers, this.instance.nodeId),
      actors: cloneJson(this.instance.actors),
      variables: cloneJson(this.instance.variables),
      facts: pickDeclaredFacts(this.store.facts, this.definition.facts),
      historyLength: this.instance.history.length,
    };
  }

  snapshot() {
    return cloneJson({
      runtimeVersion: SCENARIO_RUNTIME_VERSION,
      scenarioId: this.definition.id,
      contentVersion: this.definition.contentVersion || 1,
      facts: this.store.facts,
      discoveredLore: this.store.discoveredLore,
      instance: this.instance,
    });
  }

  restore(input) {
    this._assertLive();
    const snapshot = migrateScenarioSnapshot(this.definition, input);
    this.store.runtimeVersion = SCENARIO_RUNTIME_VERSION;
    this.store.facts = cloneJson(snapshot.facts || {});
    this.store.discoveredLore = Array.isArray(snapshot.discoveredLore) ? cloneJson(snapshot.discoveredLore) : [];
    seedFacts(this.store.facts, this.definition.facts);
    this.instance = normalizeInstance(snapshot.instance, this.definition);
    this.instance.contentVersion = this.definition.contentVersion || 1;
    this.store.instances[this.definition.id] = this.instance;
    if (this.instance.nodeId && !this.store.activeIds.includes(this.definition.id) && !isSettledStatus(this.instance.status)) {
      this.store.activeIds.push(this.definition.id);
    }
    if (this.instance.nodeId && !this.nodes.has(this.instance.nodeId)) {
      throw new Error(`Restored scenario ${this.definition.id} references missing node ${this.instance.nodeId}`);
    }
    return this.inspect();
  }

  dispose() {
    this._disposed = true;
    this._eventQueue.length = 0;
  }

  _dispatchOne(event, payload) {
    if (!this.instance.nodeId || isSettledStatus(this.instance.status)) return;
    this.instance.lastEvent = { name: event, payload: cloneJson(payload), sequence: ++this.instance.sequence };

    for (const rule of this.definition.eventRules || []) {
      if (rule.event !== event) continue;
      const onceKey = `eventRule:${rule.id}`;
      if (rule.once && this.instance.once[onceKey]) continue;
      if (!explainCondition(rule.when, this._conditionContext(payload)).valid) continue;
      if (rule.once) this.instance.once[onceKey] = true;
      this._runActions(rule.actions || [], { kind: 'eventRule', event, payload });
    }

    const beforeInterruptNode = this.currentNode();
    const interrupt = this._matchingInterrupt(event, payload);
    if (interrupt) {
      const onceKey = `interrupt:${interrupt.id}`;
      if (interrupt.once) this.instance.once[onceKey] = true;
      this._runActions(interrupt.actions || [], { kind: 'interrupt', event, payload });
      this._emit('scenario:interrupted', {
        scenarioId: this.definition.id,
        nodeId: beforeInterruptNode && beforeInterruptNode.id,
        interruptId: interrupt.id,
        event,
      });
      if (interrupt.to) this._goto(interrupt.to, `interrupt:${interrupt.id}`, true);
      this._resolveAutomaticTransitions(payload);
      return;
    }

    const node = this.currentNode();
    if (!node) return;
    for (const objective of node.objectives || []) {
      if (objective.event !== event) continue;
      const key = scopedKey(node.id, objective.id);
      const record = this.instance.objectives[key] || createObjectiveRecord(node.id, objective);
      this.instance.objectives[key] = record;
      if (record.status !== 'active') continue;
      if (objective.actorId && !eventMatchesActor(objective, payload, this.instance.actors)) continue;
      if (!explainCondition(objective.where, this._conditionContext(payload)).valid) continue;

      const amount = resolveAmount(objective.amount, payload);
      record.progress = clampProgress(record.progress + amount, record.target);
      record.lastEvent = event;
      this._emit('scenario:objectiveProgress', {
        scenarioId: this.definition.id,
        nodeId: node.id,
        objectiveId: objective.id,
        progress: record.progress,
        target: record.target,
      });
      if (record.progress + 1e-9 < record.target) continue;

      record.status = 'complete';
      if (objective.completeFact) this.store.facts[objective.completeFact] = true;
      this._runActions(objective.actions || [], { kind: 'objective', objectiveId: objective.id, event, payload });
      this._emit('scenario:objectiveCompleted', {
        scenarioId: this.definition.id,
        nodeId: node.id,
        objectiveId: objective.id,
      });
      if (objective.to) this._goto(objective.to, `objective:${objective.id}`, true);
      if (this.currentNode() !== node) break;
    }
    this._resolveAutomaticTransitions(payload);
  }

  _matchingInterrupt(event, payload) {
    const node = this.currentNode();
    const candidates = [...(this.definition.interrupts || []), ...((node && node.interrupts) || [])]
      .filter((item) => item && item.event === event)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    for (const interrupt of candidates) {
      const onceKey = `interrupt:${interrupt.id}`;
      if (interrupt.once && this.instance.once[onceKey]) continue;
      if (explainCondition(interrupt.when, this._conditionContext(payload)).valid) return interrupt;
    }
    return null;
  }

  _goto(nodeId, reason, leaveCurrent) {
    const next = this.nodes.get(nodeId);
    if (!next) throw new Error(`Scenario ${this.definition.id} transition targets missing node ${nodeId}`);
    const previous = this.currentNode();
    if (leaveCurrent && previous) this._runActions(previous.onExit || [], { kind: 'exit', nodeId: previous.id, payload: null });

    this.instance.nodeId = next.id;
    this.instance.phase = next.phase || this.instance.phase || 'active';
    this.instance.status = statusForNode(next);
    if (next.outcome) this.instance.outcome = next.outcome;
    this.instance.history.push({
      sequence: ++this.instance.sequence,
      nodeId: next.id,
      phase: this.instance.phase,
      status: this.instance.status,
      reason,
      clockS: this.instance.clockS,
    });
    this._initializeNodeRecords(next);
    this._runActions(next.onEnter || [], { kind: 'enter', nodeId: next.id, payload: null });

    this._emit('scenario:nodeEntered', {
      scenarioId: this.definition.id,
      nodeId: next.id,
      phase: this.instance.phase,
      status: this.instance.status,
      localizationId: next.localizationId || null,
      reason,
    });
    if (next.dialogue) {
      this._emit('scenario:dialogue', {
        scenarioId: this.definition.id,
        nodeId: next.id,
        speakerActorId: next.dialogue.speakerActorId || null,
        localizationId: next.dialogue.localizationId || next.localizationId || null,
        choices: (next.choices || []).map((choice) => ({ id: choice.id, localizationId: choice.localizationId || null })),
      });
    }
    if (next.terminal) this._settleTerminal(next);
  }

  _settleTerminal(node) {
    removeValue(this.store.activeIds, this.definition.id);
    const payload = {
      scenarioId: this.definition.id,
      nodeId: node.id,
      phase: this.instance.phase,
      status: this.instance.status,
      outcome: this.instance.outcome || node.outcome || null,
    };
    if (node.phase === 'fail') this._emit('scenario:failed', payload);
    else if (node.phase === 'abandon') this._emit('scenario:abandoned', payload);
    else this._emit('scenario:settled', payload);
  }

  _initializeNodeRecords(node) {
    for (const objective of node.objectives || []) {
      const key = scopedKey(node.id, objective.id);
      if (!this.instance.objectives[key]) this.instance.objectives[key] = createObjectiveRecord(node.id, objective);
    }
    for (const timer of node.timers || []) {
      const key = scopedKey(node.id, timer.id);
      if (!this.instance.timers[key]) {
        this.instance.timers[key] = {
          id: timer.id,
          nodeId: node.id,
          elapsedS: 0,
          durationS: timer.durationS,
          status: 'active',
        };
      }
    }
  }

  _resolveAutomaticTransitions(payload = null) {
    let guard = 0;
    while (guard++ < MAX_AUTO_TRANSITIONS) {
      const node = this.currentNode();
      if (!node || node.terminal) return;
      const transition = (node.transitions || []).find((item) =>
        explainCondition(item.when, this._conditionContext(payload)).valid);
      if (!transition) return;
      this._runActions(transition.actions || [], { kind: 'transition', transitionId: transition.id, payload });
      this._goto(transition.to, `transition:${transition.id || 'auto'}`, true);
    }
    throw new Error(`Scenario ${this.definition.id} exceeded ${MAX_AUTO_TRANSITIONS} automatic transitions`);
  }

  _runActions(actions, cause) {
    for (const action of actions) {
      const onceKey = action && action.once ? `action:${action.once}` : null;
      if (onceKey && this.instance.once[onceKey]) continue;
      if (onceKey) this.instance.once[onceKey] = true;
      this._runAction(action, cause);
    }
  }

  _runAction(action, cause) {
    if (!action || typeof action !== 'object') throw new TypeError('Scenario actions must be objects');
    const instance = this.instance;
    const facts = this.store.facts;
    switch (action.type) {
      case 'setFact':
        facts[action.fact] = materialize(action.value === undefined ? true : action.value, this._valueContext(cause.payload));
        break;
      case 'clearFact':
        facts[action.fact] = false;
        break;
      case 'setVar':
        instance.variables[action.var] = materialize(action.value, this._valueContext(cause.payload));
        break;
      case 'incrementVar': {
        const amount = Number(materialize(action.amount == null ? 1 : action.amount, this._valueContext(cause.payload))) || 0;
        instance.variables[action.var] = (Number(instance.variables[action.var]) || 0) + amount;
        break;
      }
      case 'appendVar': {
        const list = Array.isArray(instance.variables[action.var]) ? instance.variables[action.var] : [];
        const value = materialize(action.value, this._valueContext(cause.payload));
        if (!action.unique || !list.some((item) => deepEqual(item, value))) list.push(value);
        instance.variables[action.var] = list;
        break;
      }
      case 'removeVarValue': {
        const list = Array.isArray(instance.variables[action.var]) ? instance.variables[action.var] : [];
        const value = materialize(action.value, this._valueContext(cause.payload));
        instance.variables[action.var] = list.filter((item) => !deepEqual(item, value));
        break;
      }
      case 'bindActor':
        instance.actors[action.actorId] = normalizeActorBinding(materialize(action.binding || {}, this._valueContext(cause.payload)), action.actorId);
        break;
      case 'unbindActor':
        delete instance.actors[action.actorId];
        break;
      case 'spawn': {
        const spec = materialize(action.spec || {}, this._valueContext(cause.payload));
        const result = this.capabilities.spawn({ scenarioId: this.definition.id, actorId: action.actorId || null, spec });
        if (action.actorId) instance.actors[action.actorId] = normalizeActorBinding(result, action.actorId);
        break;
      }
      case 'despawn': {
        const binding = action.actorId ? instance.actors[action.actorId] : null;
        this.capabilities.despawn({ scenarioId: this.definition.id, actorId: action.actorId || null, binding, reason: action.reason || cause.kind });
        if (action.actorId) delete instance.actors[action.actorId];
        break;
      }
      case 'emit':
        this._emit(action.event, materialize(action.payload || {}, this._valueContext(cause.payload)));
        break;
      case 'consequence':
        this.capabilities.consequence({
          scenarioId: this.definition.id,
          subsystem: action.subsystem,
          effect: action.effect,
          payload: materialize(action.payload || {}, this._valueContext(cause.payload)),
        });
        break;
      case 'directorBeat':
        this.capabilities.directorBeat({
          scenarioId: this.definition.id,
          beatId: action.beatId,
          payload: materialize(action.payload || {}, this._valueContext(cause.payload)),
        });
        break;
      case 'cue':
        this.capabilities.cue({
          scenarioId: this.definition.id,
          cueId: action.cueId,
          payload: materialize(action.payload || {}, this._valueContext(cause.payload)),
        });
        break;
      case 'discoverLore':
        this._discoverLore(action.loreId);
        break;
      case 'recordOutcome':
        instance.outcome = action.outcome;
        break;
      case 'extension':
        this._runExtension(action, cause);
        break;
      case 'noop':
        break;
      default:
        throw new Error(`Unsupported scenario action: ${action.type || '<missing>'}`);
    }
  }

  _runExtension(action, cause) {
    const extension = this.extensions[action.extensionId];
    if (typeof extension !== 'function') throw new Error(`Scenario extension is not registered: ${action.extensionId}`);
    const api = Object.freeze({
      getFact: (id) => cloneJson(this.store.facts[id]),
      setFact: (id, value) => { this.store.facts[id] = cloneJson(value); },
      getVar: (id) => cloneJson(this.instance.variables[id]),
      setVar: (id, value) => { this.instance.variables[id] = cloneJson(value); },
      actor: (id) => cloneJson(this.instance.actors[id] || null),
      readState: (path) => cloneJson(this.capabilities.readState(path)),
      emit: (event, payload) => this._emit(event, cloneJson(payload || {})),
      spawn: (actorId, spec) => {
        const result = this.capabilities.spawn({ scenarioId: this.definition.id, actorId, spec: cloneJson(spec || {}) });
        if (actorId) this.instance.actors[actorId] = normalizeActorBinding(result, actorId);
        return cloneJson(result);
      },
      despawn: (actorId, reason) => {
        const binding = this.instance.actors[actorId] || null;
        this.capabilities.despawn({ scenarioId: this.definition.id, actorId, binding, reason });
        delete this.instance.actors[actorId];
      },
      consequence: (subsystem, effect, payload) => this.capabilities.consequence({
        scenarioId: this.definition.id, subsystem, effect, payload: cloneJson(payload || {}),
      }),
      directorBeat: (beatId, payload) => this.capabilities.directorBeat({
        scenarioId: this.definition.id, beatId, payload: cloneJson(payload || {}),
      }),
      discoverLore: (loreId) => this._discoverLore(loreId),
    });
    extension(api, cloneJson(action.args || {}), Object.freeze({ kind: cause.kind }));
  }

  _discoverLore(loreId) {
    if (!this.store.discoveredLore.includes(loreId)) this.store.discoveredLore.push(loreId);
    this.capabilities.discoverLore({ scenarioId: this.definition.id, loreId });
  }

  _conditionContext(payload) {
    return {
      facts: this.store.facts,
      variables: this.instance.variables,
      actors: this.instance.actors,
      payload,
      readState: this.capabilities.readState,
    };
  }

  _valueContext(payload) {
    return {
      facts: this.store.facts,
      variables: this.instance.variables,
      actors: this.instance.actors,
      payload,
      readState: this.capabilities.readState,
    };
  }

  _emit(event, payload) {
    if (!event) return;
    this.capabilities.emit(event, cloneJson(payload || {}));
  }

  _assertLive() {
    if (this._disposed) throw new Error(`Scenario runtime ${this.definition.id} is disposed`);
  }
}

export function collectScenarioEvents(definition) {
  const events = new Set();
  for (const rule of definition.eventRules || []) if (rule && rule.event) events.add(rule.event);
  for (const interrupt of definition.interrupts || []) if (interrupt && interrupt.event) events.add(interrupt.event);
  for (const node of definition.nodes || []) {
    for (const objective of node.objectives || []) if (objective && objective.event) events.add(objective.event);
    for (const interrupt of node.interrupts || []) if (interrupt && interrupt.event) events.add(interrupt.event);
  }
  return [...events].sort();
}

function createInstance(definition) {
  const variables = {};
  for (const [id, decl] of Object.entries(definition.variables || {})) {
    variables[id] = cloneJson(decl && Object.prototype.hasOwnProperty.call(decl, 'default') ? decl.default : null);
  }
  return {
    scenarioId: definition.id,
    contentVersion: definition.contentVersion || 1,
    nodeId: null,
    phase: null,
    status: 'idle',
    outcome: null,
    variables,
    actors: {},
    objectives: {},
    timers: {},
    once: {},
    history: [],
    clockS: 0,
    sequence: 0,
    lastEvent: null,
  };
}

function normalizeInstance(input, definition) {
  const base = createInstance(definition);
  const instance = { ...base, ...(cloneJson(input || {})) };
  instance.variables = { ...base.variables, ...(instance.variables || {}) };
  instance.actors = instance.actors || {};
  instance.objectives = instance.objectives || {};
  instance.timers = instance.timers || {};
  instance.once = instance.once || {};
  instance.history = Array.isArray(instance.history) ? instance.history : [];
  instance.sequence = Number.isInteger(instance.sequence) ? instance.sequence : instance.history.length;
  instance.clockS = Number.isFinite(instance.clockS) ? instance.clockS : 0;
  return instance;
}

function normalizeStore(store) {
  if (!store || typeof store !== 'object') store = createScenarioStore();
  if (!store.facts || typeof store.facts !== 'object') store.facts = {};
  if (!Array.isArray(store.discoveredLore)) store.discoveredLore = [];
  if (!Array.isArray(store.activeIds)) store.activeIds = [];
  if (!store.instances || typeof store.instances !== 'object') store.instances = {};
  store.runtimeVersion = SCENARIO_RUNTIME_VERSION;
  return store;
}

function normalizeCapabilities(capabilities) {
  const noop = () => undefined;
  return Object.freeze({
    spawn: typeof capabilities.spawn === 'function' ? capabilities.spawn : (() => null),
    despawn: typeof capabilities.despawn === 'function' ? capabilities.despawn : noop,
    emit: typeof capabilities.emit === 'function' ? capabilities.emit : noop,
    consequence: typeof capabilities.consequence === 'function' ? capabilities.consequence : noop,
    directorBeat: typeof capabilities.directorBeat === 'function' ? capabilities.directorBeat : noop,
    cue: typeof capabilities.cue === 'function' ? capabilities.cue : noop,
    discoverLore: typeof capabilities.discoverLore === 'function' ? capabilities.discoverLore : noop,
    readState: typeof capabilities.readState === 'function' ? capabilities.readState : (() => undefined),
  });
}

function seedFacts(target, declarations) {
  for (const [id, decl] of Object.entries(declarations || {})) {
    if (!Object.prototype.hasOwnProperty.call(target, id)) {
      target[id] = cloneJson(decl && Object.prototype.hasOwnProperty.call(decl, 'default') ? decl.default : false);
    }
  }
}

function statusForNode(node) {
  switch (node.phase) {
    case 'offer': return 'offered';
    case 'active': return 'active';
    case 'fail': return 'failed';
    case 'abandon': return 'abandoned';
    case 'complete': return 'completed';
    case 'aftermath': return 'aftermath';
    default: return node.terminal ? 'settled' : 'active';
  }
}

function isSettledStatus(status) {
  return status === 'failed' || status === 'abandoned' || status === 'aftermath' || status === 'settled';
}

function createObjectiveRecord(nodeId, objective) {
  return {
    id: objective.id,
    nodeId,
    progress: 0,
    target: Number.isFinite(objective.target) && objective.target > 0 ? objective.target : 1,
    status: 'active',
    lastEvent: null,
  };
}

function eventMatchesActor(objective, payload, actors) {
  const binding = actors[objective.actorId];
  if (!binding) return false;
  const actual = readPath(payload, objective.payloadField || 'id');
  const expected = binding.entityId != null ? binding.entityId : binding.id;
  return actual === expected;
}

function resolveAmount(spec, payload) {
  if (spec == null) return 1;
  if (Number.isFinite(spec)) return Math.max(0, spec);
  if (spec && typeof spec === 'object' && typeof spec.payload === 'string') {
    const value = Number(readPath(payload, spec.payload));
    return Number.isFinite(value) && value >= 0 ? value : (Number(spec.default) || 0);
  }
  return 1;
}

function materialize(value, context) {
  if (Array.isArray(value)) return value.map((item) => materialize(item, context));
  if (!value || typeof value !== 'object') return value;
  if (Object.keys(value).length === 1 && typeof value.$fact === 'string') return cloneJson(Object.prototype.hasOwnProperty.call(context.facts, value.$fact) ? context.facts[value.$fact] : readPath(context.facts, value.$fact));
  if (Object.keys(value).length === 1 && typeof value.$var === 'string') return cloneJson(Object.prototype.hasOwnProperty.call(context.variables, value.$var) ? context.variables[value.$var] : readPath(context.variables, value.$var));
  if (typeof value.$actor === 'string') {
    const binding = readPath(context.actors, value.$actor);
    return cloneJson(value.field ? readPath(binding, value.field) : binding);
  }
  if (Object.keys(value).length === 1 && typeof value.$state === 'string') return cloneJson(context.readState(value.$state));
  if (Object.keys(value).length === 1 && typeof value.$payload === 'string') return cloneJson(readPath(context.payload, value.$payload));
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = materialize(child, context);
  return out;
}

function normalizeActorBinding(value, actorId) {
  if (value == null) return { actorId, entityId: null };
  if (typeof value === 'number' || typeof value === 'string') return { actorId, entityId: value };
  if (typeof value === 'object') {
    const binding = cloneJson(value);
    if (!Object.prototype.hasOwnProperty.call(binding, 'actorId')) binding.actorId = actorId;
    if (!Object.prototype.hasOwnProperty.call(binding, 'entityId') && Object.prototype.hasOwnProperty.call(binding, 'id')) {
      binding.entityId = binding.id;
    }
    return binding;
  }
  return { actorId, entityId: null };
}

function activeRecordsForNode(records, nodeId) {
  return Object.values(records || {})
    .filter((record) => record && record.nodeId === nodeId)
    .map((record) => cloneJson(record))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function pickDeclaredFacts(facts, declarations) {
  const out = {};
  for (const id of Object.keys(declarations || {}).sort()) out[id] = cloneJson(facts[id]);
  return out;
}

function scopedKey(nodeId, id) { return `${nodeId}:${id}`; }
function roundTime(value) { return Math.round(value * 1e9) / 1e9; }
function clampProgress(value, target) { return Math.min(target, Math.max(0, value)); }
function removeValue(array, value) { const i = array.indexOf(value); if (i >= 0) array.splice(i, 1); }

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((key, i) => key === bk[i] && deepEqual(a[key], b[key]));
}
