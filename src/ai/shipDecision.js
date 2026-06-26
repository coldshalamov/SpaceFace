import {
  ManeuverKind,
  ObjectiveKind,
  TraceLayer,
  distance2,
  normalizeActionDef,
  saturate,
  stableId,
} from './contracts.js';

const DEFAULTS = Object.freeze({
  minCommitTicks: 18,
  switchMargin: 0.1,
  emergencyHullFraction: 0.16,
  heatLockoutFraction: 0.92,
  lowEnergyFraction: 0.14,
});
const EMPTY_REASONS = Object.freeze([]);

export class ShipUtilitySelector {
  constructor({ trace = null, config = {} } = {}) {
    this.trace = trace;
    this.config = Object.freeze({ ...DEFAULTS, ...config });
    this.freeze = config.freezeResults === false ? identity : Object.freeze;
  }

  select({ tick, entityId, perception, directive, actionDefs, current = null }) {
    const self = perception && perception.self;
    if (!self) throw new Error(`ship ${entityId} has no sensor self-frame`);
    const defs = preparedActionDefs(actionDefs);
    const requestedTarget = directive && directive.objective
      ? (directive.objective.targetId ?? directive.focusTargetId)
      : null;
    const target = resolveTarget(perception, requestedTarget);
    const distance = target ? distance2(self.pos, target.pos) : Infinity;
    const candidates = this.trace ? [] : null;
    let selected = null;
    const freeze = this.freeze;
    const consider = (candidate) => {
      if (candidates) candidates.push(candidate);
      if (!selected || candidateBetter(candidate, selected)) selected = candidate;
    };

    for (const def of defs) {
      const candidate = scoreAction(def, self, target, distance, directive, this.config, !!this.trace);
      if (!candidate.eligible) continue;
      if (current && current.actionId === def.id) {
        candidate.utility = saturate(candidate.utility + 0.06);
        if (candidate.reasons !== EMPTY_REASONS) candidate.reasons.push('current_action_hysteresis');
      }
      consider(candidate);
    }

    consider(attachActionMetadata({
      actionId: null,
      utility: directive && directive.objective.kind === ObjectiveKind.HOLD ? 0.62 : 0.08,
      reasons: ['no_action_hold'],
      targetId: null,
      targetContact: null,
      minCommitTicks: this.config.minCommitTicks,
      switchMargin: this.config.switchMargin,
    }, null, directive));
    if (candidates) {
      candidates.sort((a, b) => b.utility - a.utility || stableId(a.actionId).localeCompare(stableId(b.actionId)));
      selected = candidates[0];
    }
    const selectedActionDef = selected ? selected.__spacefaceActionDef || null : null;
    if (selected && target && !selected.targetContact && (selected.targetId != null || selected.actionId == null)) {
      selected.targetContact = compactTarget(target, freeze);
    }
    if (selected) selected.maneuver = maneuverFor(selectedActionDef, directive, target, freeze);
    if (selected) stripActionMetadata(selected);

    if (this.trace) {
      this.trace.emit({
        tick,
        layer: TraceLayer.UTILITY,
        entityId,
        squadId: directive && directive.squadId,
        decision: 'select_action_def',
        selected,
        candidates: candidates.map(compactCandidate),
        context: {
          objective: directive && directive.objective,
          role: directive && directive.role,
          tactic: directive && directive.tactic,
          self: {
            hullFraction: self.hullFraction,
            energyFraction: self.energyFraction,
            heatFraction: self.heatFraction,
            tethered: self.tethered,
          },
          target: target ? { id: target.id, kind: target.kind, confidence: target.confidence, distance } : null,
        },
      });
    }
    return this.freeze(selected);
  }
}

export class BehaviorExecutor {
  constructor({ actionPort, trace = null, config = {} } = {}) {
    if (!actionPort) throw new TypeError('BehaviorExecutor requires the SG-03 action port');
    this.actionPort = actionPort;
    this.trace = trace;
    this.config = Object.freeze({ ...DEFAULTS, ...config });
    this.freeze = config.freezeResults === false ? identity : Object.freeze;
    this.traceTransitionsOnly = isBehaviorOnlyTrace(trace);
    this.byEntity = new Map();
  }

  update({ tick, entityId, selected, directive, perception }) {
    let state = this.byEntity.get(entityId);
    if (!state) {
      state = { actionId: null, targetId: null, startedTick: -Infinity, utility: 0, status: 'idle', handle: null, maneuver: null, lastReason: 'init' };
      this.byEntity.set(entityId, state);
    }

    let status = state.actionId ? normalizeStatus(this.actionPort.status(entityId, state.handle)) : 'idle';
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      state.actionId = null;
      state.handle = null;
      state.maneuver = null;
      state.status = status;
    }

    const emergency = perception.self.disabled || perception.self.hullFraction <= this.config.emergencyHullFraction;
    const same = state.actionId === selected.actionId && state.targetId === selected.targetId;
    const dwell = tick - state.startedTick;
    let decision = 'continue';
    let reason = same ? 'same_selection' : 'selection_changed';

    if (state.actionId && !same) {
      const minCommit = Math.max(this.config.minCommitTicks, selected.minCommitTicks || 0);
      const margin = Math.max(this.config.switchMargin, selected.switchMargin || 0);
      const maySwitch = emergency || dwell >= minCommit;
      const worthSwitch = emergency || selected.utility >= state.utility + margin;
      if (!maySwitch || !worthSwitch) {
        decision = 'hold_current';
        reason = !maySwitch ? 'minimum_commit_window' : 'switch_margin';
      } else {
        const interruptReason = emergency ? 'emergency_interrupt' : `utility_switch:${selected.actionId || 'hold'}`;
        const interrupted = !!this.actionPort.interrupt(entityId, state.handle, this.freeze({
          tick, reason: interruptReason, source: 'ai', nextActionId: selected.actionId, nextTargetId: selected.targetId,
        }));
        if (interrupted) {
          state.actionId = null;
          state.handle = null;
          state.maneuver = null;
          state.status = 'interrupted';
          decision = 'interrupt';
          reason = interruptReason;
        } else {
          decision = 'hold_current';
          reason = 'action_cancel_window_closed';
        }
      }
    }

    if (!state.actionId && selected.actionId != null) {
      const request = this.freeze({
        source: 'ai',
        tick,
        actionId: selected.actionId,
        actorId: entityId,
        targetId: selected.targetId,
        target: selected.targetContact || null,
        objective: directive.objective.kind,
        squadId: directive.squadId,
      });
      const gate = normalizeGate(this.actionPort.canStart(entityId, selected.actionId, request));
      if (gate.ok) {
        const startResult = this.actionPort.start(entityId, selected.actionId, request);
        const started = normalizeStart(startResult);
        if (!started.ok) {
          state.targetId = selected.targetId;
          state.utility = selected.utility;
          state.status = 'blocked';
          state.maneuver = selected.maneuver;
          decision = 'blocked';
          reason = started.reason;
        } else {
          state.actionId = selected.actionId;
          state.targetId = selected.targetId;
          state.startedTick = tick;
          state.utility = selected.utility;
          state.status = 'running';
          state.handle = started.handle;
          state.maneuver = selected.maneuver;
          decision = 'start';
          reason = 'action_port_started';
        }
      } else {
        state.targetId = selected.targetId;
        state.utility = selected.utility;
        state.status = 'blocked';
        state.maneuver = selected.maneuver;
        decision = 'blocked';
        reason = gate.reason;
      }
    } else if (!state.actionId && selected.actionId == null) {
      state.targetId = null;
      state.utility = selected.utility;
      state.status = 'idle';
      state.maneuver = selected.maneuver;
      decision = 'hold';
      reason = 'no_action_selected';
    } else if (state.actionId) {
      state.status = status === 'idle' ? 'running' : status;
    }
    state.lastReason = reason;
    if (state.actionId) {
      state.maneuver = same
        ? selected.maneuver
        : refreshFormation(state.maneuver || selected.maneuver, directive, this.freeze);
    }

    const output = this.freeze({
      tick,
      entityId,
      decision,
      reason,
      actionId: state.actionId,
      targetId: state.targetId,
      status: state.status,
      maneuver: state.actionId ? state.maneuver : selected.maneuver,
    });

    if (this.trace && shouldEmitBehaviorTrace(this.traceTransitionsOnly, state, output)) {
      this.trace.emit({
        tick,
        layer: TraceLayer.BEHAVIOR,
        entityId,
        squadId: directive.squadId,
        decision: 'execute_action_def',
        selected: compactBehaviorOutput(output),
        candidates: [{ actionId: selected.actionId, utility: selected.utility }],
        context: {
          dwellTicks: state.actionId ? tick - state.startedTick : 0,
          emergency,
          objective: directive.objective.kind,
          actionStatus: status,
        },
      });
    }
    return output;
  }

  forget(entityId) {
    this.byEntity.delete(entityId);
  }

  current(entityId) {
    return this.byEntity.get(entityId) || null;
  }

  inspect(entityId = null) {
    if (entityId != null) return freezeState(this.byEntity.get(entityId));
    const out = {};
    for (const id of [...this.byEntity.keys()].sort(idSort)) out[String(id)] = freezeState(this.byEntity.get(id));
    return Object.freeze(out);
  }
}

function scoreAction(def, self, target, distance, directive, config, collectReasons = true) {
  const objective = directive && directive.objective ? directive.objective.kind : ObjectiveKind.HOLD;
  const reasons = collectReasons ? [] : EMPTY_REASONS;
  const note = (...items) => { if (collectReasons) reasons.push(...items); };
  let utility = 0.05;
  let eligible = true;

  if (hasTag(def, 'attack') || hasTag(def, 'disable')) {
    if (!target) eligible = false;
    else {
      utility += objective === ObjectiveKind.FOCUS || objective === ObjectiveKind.ENGAGE ? 0.48 : 0.18;
      utility += hasTag(def, 'disable') && directive.tactic === 'contain_and_disable' ? 0.26 : 0;
      utility += rangeFit(def, distance) * 0.25;
      note('hostile_target', 'range_fit');
    }
  }
  if (hasTag(def, 'screen')) {
    utility += objective === ObjectiveKind.SCREEN ? 0.72 : 0.08;
    note('screen_role');
  }
  if (hasTag(def, 'tug') || hasTag(def, 'attach') || hasTag(def, 'steal')) {
    const matches = (hasTag(def, 'tug') && objective === ObjectiveKind.TUG) ||
      (hasTag(def, 'steal') && objective === ObjectiveKind.STEAL) ||
      (hasTag(def, 'attach') && (objective === ObjectiveKind.TUG || objective === ObjectiveKind.STEAL));
    utility += matches ? 0.76 : 0;
    if (!target) eligible = false;
    note('objective_tether_action');
  }
  if (hasTag(def, 'counter_tether_cut')) {
    utility += objective === ObjectiveKind.COUNTER_TETHER_CUT ? 0.94 : 0;
    eligible = eligible && !!target;
    note('counter_tether_exposed_line');
  }
  if (hasTag(def, 'counter_tether_overload')) {
    utility += objective === ObjectiveKind.COUNTER_TETHER_OVERLOAD && self.tethered ? 0.98 : 0;
    if (def.metadata && def.metadata.requiresEscapeAlignment && target) {
      const desired = Math.atan2(self.pos.z - target.pos.z, self.pos.x - target.pos.x);
      const alignmentError = Math.abs(wrapAngleLocal(desired - self.rot));
      if (alignmentError > 0.34) {
        eligible = false;
        note('escape_heading_not_aligned');
      } else {
        note('escape_heading_aligned');
      }
    }
    note('counter_tether_overload');
  }
  if (hasTag(def, 'retreat') || hasTag(def, 'evade')) {
    const retreat = objective === ObjectiveKind.RETREAT;
    utility += retreat ? 0.8 : 0.08;
    utility += self.hullFraction < 0.3 ? 0.2 : 0;
    note('survival');
  }
  if (hasTag(def, 'repair') || hasTag(def, 'cooldown')) {
    utility += self.heatFraction > 0.75 ? 0.58 : 0;
    utility += self.hullFraction < 0.45 ? 0.25 : 0;
    note('resource_recovery');
  }

  if (hasTag(def, 'energy') && self.energyFraction < config.lowEnergyFraction) {
    utility *= 0.15;
    note('low_energy_penalty');
  }
  if (hasTag(def, 'heat') && self.heatFraction >= config.heatLockoutFraction) {
    utility = 0;
    eligible = false;
    note('heat_lockout');
  }
  if (def.targetKinds.length && target && !def.targetKinds.includes(target.kind)) {
    utility = 0;
    eligible = false;
    note('target_kind_mismatch');
  }

  return attachActionMetadata({
    actionId: def.id,
    utility: saturate(utility),
    eligible,
    reasons,
    targetId: target ? target.id : null,
    targetContact: null,
    minCommitTicks: def.minCommitTicks,
    switchMargin: def.switchMargin,
  }, def, directive);
}

function maneuverFor(def, directive, target, freeze = Object.freeze) {
  const kind = maneuverKindFor(def, directive);
  return freeze({
    kind,
    targetId: target ? target.id : null,
    preferredRange: def ? def.preferredRange : 0,
    formationSlot: directive.formation.slot,
    formationVelocity: directive.formation.velocity,
    formationBound: directive.formation.bound,
    breakFormation: directive.formation.breakFormation,
    reason: directive.objective.reason,
  });
}

function maneuverKindFor(def, directive) {
  let kind = ManeuverKind.FORMATION;
  if (directive.objective.kind === ObjectiveKind.RETREAT || hasTag(def, 'retreat')) kind = ManeuverKind.RETREAT;
  else if (directive.objective.kind === ObjectiveKind.COUNTER_TETHER_OVERLOAD) kind = ManeuverKind.ESCAPE_TETHER;
  else if (directive.objective.kind === ObjectiveKind.COUNTER_TETHER_CUT) kind = ManeuverKind.CUT_TETHER;
  else if (directive.objective.kind === ObjectiveKind.SCREEN || hasTag(def, 'screen')) kind = ManeuverKind.SCREEN;
  else if (directive.objective.kind === ObjectiveKind.TUG || directive.objective.kind === ObjectiveKind.STEAL || hasTag(def, 'attach')) kind = ManeuverKind.APPROACH_SOCKET;
  else if (hasTag(def, 'attack') || hasTag(def, 'disable')) kind = hasTag(def, 'ranged') ? ManeuverKind.ORBIT : ManeuverKind.INTERCEPT;
  else if (directive.objective.kind === ObjectiveKind.HOLD) kind = ManeuverKind.HOLD;
  return kind;
}

function refreshFormation(maneuver, directive, freeze = Object.freeze) {
  return freeze({
    ...maneuver,
    formationSlot: directive.formation.slot,
    formationVelocity: directive.formation.velocity,
    formationBound: directive.formation.bound,
    breakFormation: directive.formation.breakFormation,
  });
}

function resolveTarget(perception, targetId) {
  if (targetId == null || !perception) return null;
  return perception.contacts.find((contact) => contact.id === targetId) || null;
}

function rangeFit(def, distance) {
  const preferred = Math.max(1, def.preferredRange || def.range || 1);
  const error = Math.abs(distance - preferred) / preferred;
  return saturate(1 - error);
}

function compactTarget(target, freeze = Object.freeze) {
  return freeze({
    id: target.id, kind: target.kind, pos: target.pos, ownerId: target.ownerId,
    attachmentId: target.attachmentId, sourceSocketId: target.sourceSocketId, targetSocketId: target.targetSocketId,
    ownedBySelf: target.ownedBySelf, tags: target.tags,
  });
}

function wrapAngleLocal(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function compactCandidate(candidate) {
  return {
    actionId: candidate.actionId,
    utility: candidate.utility,
    reasons: candidate.reasons,
    targetId: candidate.targetId,
    maneuverKind: candidate.maneuver ? candidate.maneuver.kind : candidate.__spacefaceManeuverKind,
  };
}

function compactBehaviorOutput(output) {
  return {
    decision: output.decision,
    reason: output.reason,
    actionId: output.actionId,
    targetId: output.targetId,
    status: output.status,
  };
}

function isBehaviorOnlyTrace(trace) {
  return !!(trace && trace.layers && trace.layers.size === 1 && trace.layers.has(TraceLayer.BEHAVIOR));
}

function shouldEmitBehaviorTrace(transitionsOnly, state, output) {
  if (!transitionsOnly) return true;
  const signature = [
    output.decision,
    output.reason,
    output.actionId == null ? '' : output.actionId,
    output.targetId == null ? '' : output.targetId,
    output.status,
  ].join('|');
  if (state.lastTraceSignature === signature) return false;
  state.lastTraceSignature = signature;
  return true;
}

function candidateBetter(candidate, current) {
  if (candidate.utility !== current.utility) return candidate.utility > current.utility;
  return stableId(candidate.actionId).localeCompare(stableId(current.actionId)) < 0;
}

function preparedActionDefs(actionDefs) {
  if (!Array.isArray(actionDefs) || actionDefs.length === 0) return [];
  let prepared = true;
  for (const def of actionDefs) {
    if (!def || def.__spacefaceTacticalActionDef !== true) {
      prepared = false;
      break;
    }
  }
  if (prepared) return actionDefs;
  const out = [];
  for (const def of actionDefs) {
    const normalized = normalizeActionDef(def);
    if (normalized) out.push(normalized);
  }
  return out;
}

function hasTag(def, tag) {
  return !!(def && Array.isArray(def.tags) && def.tags.includes(tag));
}

function attachActionMetadata(candidate, def, directive) {
  candidate.__spacefaceActionDef = def || null;
  candidate.__spacefaceManeuverKind = maneuverKindFor(def, directive);
  return candidate;
}

function stripActionMetadata(candidate) {
  delete candidate.__spacefaceActionDef;
  delete candidate.__spacefaceManeuverKind;
}

function normalizeStart(value) {
  if (value == null || value === false) return { ok: false, handle: null, reason: 'action_port_start_rejected' };
  if (value && typeof value === 'object' && 'ok' in value) {
    return value.ok
      ? { ok: true, handle: value.handle ?? value.requestId ?? value.id ?? value, reason: 'ok' }
      : { ok: false, handle: null, reason: String(value.reason || 'action_port_start_rejected') };
  }
  return { ok: true, handle: value, reason: 'ok' };
}

function normalizeStatus(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.status === 'string') return value.status;
  return 'running';
}

function normalizeGate(value) {
  if (value === true) return { ok: true, reason: 'ok' };
  if (value === false || value == null) return { ok: false, reason: 'action_port_rejected' };
  return { ok: !!value.ok, reason: String(value.reason || (value.ok ? 'ok' : 'action_port_rejected')) };
}

function freezeState(state) {
  return state ? Object.freeze({ ...state }) : null;
}

function idSort(a, b) {
  return stableId(a).localeCompare(stableId(b));
}

function identity(value) {
  return value;
}
