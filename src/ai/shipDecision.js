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

export class ShipUtilitySelector {
  constructor({ trace = null, config = {} } = {}) {
    this.trace = trace;
    this.config = Object.freeze({ ...DEFAULTS, ...config });
  }

  select({ tick, entityId, perception, directive, actionDefs, current = null }) {
    const self = perception && perception.self;
    if (!self) throw new Error(`ship ${entityId} has no sensor self-frame`);
    const defs = (actionDefs || []).map(normalizeActionDef).filter(Boolean);
    const requestedTarget = directive && directive.objective
      ? (directive.objective.targetId ?? directive.focusTargetId)
      : null;
    const target = resolveTarget(perception, requestedTarget);
    const distance = target ? distance2(self.pos, target.pos) : Infinity;
    const candidates = [];

    for (const def of defs) {
      const candidate = scoreAction(def, self, target, distance, directive, this.config);
      if (!candidate.eligible) continue;
      if (current && current.actionId === def.id) {
        candidate.utility = saturate(candidate.utility + 0.06);
        candidate.reasons.push('current_action_hysteresis');
      }
      candidates.push(candidate);
    }

    candidates.push({
      actionId: null,
      utility: directive && directive.objective.kind === ObjectiveKind.HOLD ? 0.62 : 0.08,
      reasons: ['no_action_hold'],
      targetId: null,
      targetContact: target ? compactTarget(target) : null,
      minCommitTicks: this.config.minCommitTicks,
      switchMargin: this.config.switchMargin,
      maneuver: maneuverFor(null, directive, target),
    });
    candidates.sort((a, b) => b.utility - a.utility || stableId(a.actionId).localeCompare(stableId(b.actionId)));
    const selected = candidates[0];

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
    return Object.freeze(selected);
  }
}

export class BehaviorExecutor {
  constructor({ actionPort, trace = null, config = {} } = {}) {
    if (!actionPort) throw new TypeError('BehaviorExecutor requires the SG-03 action port');
    this.actionPort = actionPort;
    this.trace = trace;
    this.config = Object.freeze({ ...DEFAULTS, ...config });
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
        const interrupted = !!this.actionPort.interrupt(entityId, state.handle, Object.freeze({
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
      const request = Object.freeze({
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
        : refreshFormation(state.maneuver || selected.maneuver, directive);
    }

    const output = Object.freeze({
      tick,
      entityId,
      decision,
      reason,
      actionId: state.actionId,
      targetId: state.targetId,
      status: state.status,
      maneuver: state.actionId ? state.maneuver : selected.maneuver,
    });

    if (this.trace) {
      this.trace.emit({
        tick,
        layer: TraceLayer.BEHAVIOR,
        entityId,
        squadId: directive.squadId,
        decision: 'execute_action_def',
        selected: output,
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

  inspect(entityId = null) {
    if (entityId != null) return freezeState(this.byEntity.get(entityId));
    const out = {};
    for (const id of [...this.byEntity.keys()].sort(idSort)) out[String(id)] = freezeState(this.byEntity.get(id));
    return Object.freeze(out);
  }
}

function scoreAction(def, self, target, distance, directive, config) {
  const tags = new Set(def.tags);
  const objective = directive && directive.objective ? directive.objective.kind : ObjectiveKind.HOLD;
  const reasons = [];
  let utility = 0.05;
  let eligible = true;

  if (tags.has('attack') || tags.has('disable')) {
    if (!target) eligible = false;
    else {
      utility += objective === ObjectiveKind.FOCUS || objective === ObjectiveKind.ENGAGE ? 0.48 : 0.18;
      utility += tags.has('disable') && directive.tactic === 'contain_and_disable' ? 0.26 : 0;
      utility += rangeFit(def, distance) * 0.25;
      reasons.push('hostile_target', 'range_fit');
    }
  }
  if (tags.has('screen')) {
    utility += objective === ObjectiveKind.SCREEN ? 0.72 : 0.08;
    reasons.push('screen_role');
  }
  if (tags.has('tug') || tags.has('attach') || tags.has('steal')) {
    const matches = (tags.has('tug') && objective === ObjectiveKind.TUG) ||
      (tags.has('steal') && objective === ObjectiveKind.STEAL) ||
      (tags.has('attach') && (objective === ObjectiveKind.TUG || objective === ObjectiveKind.STEAL));
    utility += matches ? 0.76 : 0;
    if (!target) eligible = false;
    reasons.push('objective_tether_action');
  }
  if (tags.has('counter_tether_cut')) {
    utility += objective === ObjectiveKind.COUNTER_TETHER_CUT ? 0.94 : 0;
    eligible = eligible && !!target;
    reasons.push('counter_tether_exposed_line');
  }
  if (tags.has('counter_tether_overload')) {
    utility += objective === ObjectiveKind.COUNTER_TETHER_OVERLOAD && self.tethered ? 0.98 : 0;
    if (def.metadata && def.metadata.requiresEscapeAlignment && target) {
      const desired = Math.atan2(self.pos.z - target.pos.z, self.pos.x - target.pos.x);
      const alignmentError = Math.abs(wrapAngleLocal(desired - self.rot));
      if (alignmentError > 0.34) {
        eligible = false;
        reasons.push('escape_heading_not_aligned');
      } else {
        reasons.push('escape_heading_aligned');
      }
    }
    reasons.push('counter_tether_overload');
  }
  if (tags.has('retreat') || tags.has('evade')) {
    const retreat = objective === ObjectiveKind.RETREAT;
    utility += retreat ? 0.8 : 0.08;
    utility += self.hullFraction < 0.3 ? 0.2 : 0;
    reasons.push('survival');
  }
  if (tags.has('repair') || tags.has('cooldown')) {
    utility += self.heatFraction > 0.75 ? 0.58 : 0;
    utility += self.hullFraction < 0.45 ? 0.25 : 0;
    reasons.push('resource_recovery');
  }

  if (tags.has('energy') && self.energyFraction < config.lowEnergyFraction) {
    utility *= 0.15;
    reasons.push('low_energy_penalty');
  }
  if (tags.has('heat') && self.heatFraction >= config.heatLockoutFraction) {
    utility = 0;
    eligible = false;
    reasons.push('heat_lockout');
  }
  if (def.targetKinds.length && target && !def.targetKinds.includes(target.kind)) {
    utility = 0;
    eligible = false;
    reasons.push('target_kind_mismatch');
  }

  return {
    actionId: def.id,
    utility: saturate(utility),
    eligible,
    reasons,
    targetId: target ? target.id : null,
    targetContact: target ? compactTarget(target) : null,
    minCommitTicks: def.minCommitTicks,
    switchMargin: def.switchMargin,
    maneuver: maneuverFor(def, directive, target),
  };
}

function maneuverFor(def, directive, target) {
  const tags = new Set(def ? def.tags : []);
  let kind = ManeuverKind.FORMATION;
  if (directive.objective.kind === ObjectiveKind.RETREAT || tags.has('retreat')) kind = ManeuverKind.RETREAT;
  else if (directive.objective.kind === ObjectiveKind.COUNTER_TETHER_OVERLOAD) kind = ManeuverKind.ESCAPE_TETHER;
  else if (directive.objective.kind === ObjectiveKind.COUNTER_TETHER_CUT) kind = ManeuverKind.CUT_TETHER;
  else if (directive.objective.kind === ObjectiveKind.SCREEN || tags.has('screen')) kind = ManeuverKind.SCREEN;
  else if (directive.objective.kind === ObjectiveKind.TUG || directive.objective.kind === ObjectiveKind.STEAL || tags.has('attach')) kind = ManeuverKind.APPROACH_SOCKET;
  else if (tags.has('attack') || tags.has('disable')) kind = tags.has('ranged') ? ManeuverKind.ORBIT : ManeuverKind.INTERCEPT;
  else if (directive.objective.kind === ObjectiveKind.HOLD) kind = ManeuverKind.HOLD;
  return Object.freeze({
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

function refreshFormation(maneuver, directive) {
  return Object.freeze({
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

function compactTarget(target) {
  return Object.freeze({
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
    maneuverKind: candidate.maneuver.kind,
  };
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
