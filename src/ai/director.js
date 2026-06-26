import { DirectorPhase, TraceLayer, clamp, finiteInt, saturate } from './contracts.js';

const DEFAULT_CONFIG = Object.freeze({
  minPressure: 0.12,
  maxPressure: 0.82,
  initialPressure: 0.22,
  pressureRisePerTick: 0.0035,
  pressureFallPerTick: 0.006,
  buildMinTicks: 180,
  buildMaxTicks: 720,
  peakMinTicks: 120,
  peakMaxTicks: 420,
  respiteMinTicks: 150,
  respiteMaxTicks: 600,
  retreatMinTicks: 120,
  peakThreshold: 0.68,
  respiteThreshold: 0.28,
  distressThreshold: 0.58,
  reinforceThreshold: 0.52,
  reinforcementCooldownTicks: 240,
  maxReinforcementBudget: 4,
  narrativeCooldownTicks: 300,
});

export class EncounterDirector {
  constructor({ config = {}, trace = null, encounterPort = null } = {}) {
    this.config = validateConfig({ ...DEFAULT_CONFIG, ...config });
    this.freeze = config.freezeResults === false ? identity : Object.freeze;
    this.trace = trace;
    this.encounterPort = encounterPort;
    this.state = {
      phase: DirectorPhase.RESPITE,
      phaseTick: 0,
      pressure: this.config.initialPressure,
      targetPressure: this.config.initialPressure,
      reinforcementBudget: this.config.maxReinforcementBudget,
      reinforcementCooldown: 0,
      narrativeCooldown: 0,
      beatIndex: 0,
      lastDecision: 'initial_respite',
    };
  }

  update(tick, telemetry = {}, authored = {}) {
    const cfg = this.config;
    const s = this.state;
    s.phaseTick++;
    s.reinforcementCooldown = Math.max(0, s.reinforcementCooldown - 1);
    s.narrativeCooldown = Math.max(0, s.narrativeCooldown - 1);

    const freeze = this.freeze;
    const envelope = normalizeEnvelope(authored.threatEnvelope, cfg, freeze);
    const distress = saturate(
      (telemetry.friendlyDisabledFraction || 0) * 0.55 +
      (telemetry.friendlyLowHullFraction || 0) * 0.25 +
      (telemetry.recentDamage || 0) * 0.2,
    );
    const dominance = saturate(
      (telemetry.visibleThreat || 0) * 0.45 +
      Math.min(1, (telemetry.hostileContacts || 0) / 6) * 0.25 +
      (telemetry.objectiveProgress || 0) * 0.2 +
      Math.min(1, (telemetry.tetherThreats || 0) / 2) * 0.1,
    );
    const authoredBias = clamp(Number(authored.pressureBias) || 0, -0.35, 0.35);
    const target = clamp(0.22 + dominance * 0.62 - distress * 0.48 + authoredBias, envelope.min, envelope.max);
    s.targetPressure = target;
    const delta = target - s.pressure;
    const slew = delta >= 0 ? cfg.pressureRisePerTick : cfg.pressureFallPerTick;
    s.pressure = clamp(s.pressure + clamp(delta, -slew, slew), envelope.min, envelope.max);

    const candidates = [];
    const push = (id, utility, reason) => candidates.push({ id, utility: saturate(utility), reason });
    push('hold_phase', 0.35, 'minimum phase dwell or no stronger transition');

    if (s.phase === DirectorPhase.RESPITE) {
      push('begin_build', s.phaseTick >= cfg.respiteMinTicks ? saturate((target - cfg.respiteThreshold) * 1.8) : 0, 'pressure target recovered');
      if (s.phaseTick >= cfg.respiteMaxTicks) push('begin_build', 1, 'maximum respite elapsed');
    } else if (s.phase === DirectorPhase.BUILD) {
      push('enter_peak', s.phaseTick >= cfg.buildMinTicks ? saturate((s.pressure - cfg.peakThreshold) * 3 + dominance * 0.4) : 0, 'pressure reached authored peak band');
      if (s.phaseTick >= cfg.buildMaxTicks) push('enter_peak', 1, 'maximum build elapsed');
      push('retreat', distress >= cfg.distressThreshold ? distress : 0, 'observed squad distress');
    } else if (s.phase === DirectorPhase.PEAK) {
      push('begin_respite', s.phaseTick >= cfg.peakMinTicks ? saturate((cfg.peakThreshold - target) * 2 + distress * 0.8) : 0, 'peak delivered or squad distressed');
      if (s.phaseTick >= cfg.peakMaxTicks) push('begin_respite', 1, 'maximum peak elapsed');
      push('retreat', distress >= cfg.distressThreshold + 0.15 ? distress : 0, 'critical observed squad distress');
    } else if (s.phase === DirectorPhase.RETREAT) {
      push('begin_respite', s.phaseTick >= cfg.retreatMinTicks ? 0.8 : 0, 'retreat window complete');
    }

    if (s.phase === DirectorPhase.BUILD && s.reinforcementBudget > 0 && s.reinforcementCooldown === 0) {
      push('reinforce', dominance >= cfg.reinforceThreshold && distress < 0.45 ? dominance : 0, 'visible opposition supports escalation');
    }
    if (authored.narrativeBeatReady && s.narrativeCooldown === 0 && s.phase !== DirectorPhase.PEAK) {
      push('narrative_beat', 0.72, 'authored beat gate open outside peak');
    }

    candidates.sort((a, b) => b.utility - a.utility || a.id.localeCompare(b.id));
    const selected = candidates[0];
    const command = this._applyDecision(selected.id, tick, authored);
    s.lastDecision = selected.id;

    if (this.trace) {
      this.trace.emit({
        tick,
        layer: TraceLayer.DIRECTOR,
        decision: 'pace_encounter',
        selected: { ...selected, phase: s.phase, pressure: s.pressure, command },
        candidates,
        context: { telemetry, distress, dominance, envelope, targetPressure: target },
      });
    }

    return freeze({
      tick,
      phase: s.phase,
      pressure: s.pressure,
      targetPressure: s.targetPressure,
      reinforcementBudget: s.reinforcementBudget,
      command,
    });
  }

  _applyDecision(id, tick, authored) {
    const s = this.state;
    const cfg = this.config;
    const freeze = this.freeze;
    let command = { type: 'hold', phase: s.phase };
    if (id === 'begin_build') {
      this._setPhase(DirectorPhase.BUILD);
      command = { type: 'phase', phase: s.phase };
    } else if (id === 'enter_peak') {
      this._setPhase(DirectorPhase.PEAK);
      command = { type: 'phase', phase: s.phase };
    } else if (id === 'begin_respite') {
      this._setPhase(DirectorPhase.RESPITE);
      s.reinforcementBudget = Math.min(cfg.maxReinforcementBudget, s.reinforcementBudget + 1);
      command = { type: 'phase', phase: s.phase };
    } else if (id === 'retreat') {
      this._setPhase(DirectorPhase.RETREAT);
      command = { type: 'order_retreat', reason: 'observed_distress' };
    } else if (id === 'reinforce') {
      s.reinforcementBudget--;
      s.reinforcementCooldown = cfg.reinforcementCooldownTicks;
      command = {
        type: 'request_reinforcement',
        packageId: authored.reinforcementPackageId || null,
        budgetRemaining: s.reinforcementBudget,
      };
    } else if (id === 'narrative_beat') {
      s.narrativeCooldown = cfg.narrativeCooldownTicks;
      command = { type: 'narrative_beat', beatIndex: s.beatIndex++ };
    }
    if (this.encounterPort && command.type !== 'hold') this.encounterPort.issue(freeze({ tick, ...command }));
    return freeze(command);
  }

  _setPhase(phase) {
    this.state.phase = phase;
    this.state.phaseTick = 0;
  }

  inspect() {
    return Object.freeze({ version: 1, config: Object.freeze({ ...this.config }), state: Object.freeze({ ...this.state }) });
  }
}

function validateConfig(config) {
  if (!(config.minPressure >= 0 && config.maxPressure <= 1 && config.minPressure < config.maxPressure)) {
    throw new RangeError('director pressure envelope must satisfy 0 <= min < max <= 1');
  }
  const out = { ...config };
  for (const key of Object.keys(out)) {
    if (key.endsWith('Ticks') || key.endsWith('Budget')) out[key] = Math.max(0, finiteInt(out[key], DEFAULT_CONFIG[key] || 0));
  }
  out.initialPressure = clamp(out.initialPressure, out.minPressure, out.maxPressure);
  return Object.freeze(out);
}

function normalizeEnvelope(value, config, freeze = Object.freeze) {
  const rawMin = Number(value && value.min);
  const rawMax = Number(value && value.max);
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax) || rawMin >= rawMax) {
    return freeze({ min: config.minPressure, max: config.maxPressure });
  }
  const min = clamp(rawMin, config.minPressure, config.maxPressure);
  const max = clamp(rawMax, min, config.maxPressure);
  if (min >= max) return freeze({ min: config.minPressure, max: config.maxPressure });
  return freeze({ min, max });
}

function identity(value) {
  return value;
}
