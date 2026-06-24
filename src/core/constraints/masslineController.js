// SpaceFace Flight V3 — Massline / tractor-tether controller.
//
// This is not a second physics solver. Rapier owns momentum exchange and the
// relative response of light/heavy bodies. This controller owns the winch,
// elasticity policy, heat, energy, overload/break logic, and presentation signals.
// It consumes measured attachment telemetry from the authoritative physics owner
// and emits a new rest length or a cut command.

export const MASSLINE_SCHEMA_VERSION = 1;

export const DEFAULT_MASSLINE_DEF = Object.freeze({
  id: 'attachment_massline_s',
  minLength: 8,
  maxLength: 220,
  defaultLength: 70,
  reelInSpeed: 28,
  reelOutSpeed: 42,
  reelAcceleration: 90,
  holdCompliance: 0.035,
  damping: 18,
  maxTension: 8200,
  maxImpulse: 165,
  overloadGraceS: 0.18,
  catastrophicRatio: 1.75,
  heatPerWork: 0.00012,
  idleHeatPerS: 0.08,
  coolingPerS: 4.0,
  maxHeat: 100,
  overheatResume: 62,
  efficiency: 0.72,
  energyPerIdleS: 0.16,
  integrityDamagePerOverloadS: 0.16,
  integrityRecoveryPerS: 0.008,
  visual: Object.freeze({
    coreRadius: 0.16,
    haloRadius: 0.52,
    pulseSpeed: 3.4,
    noiseAmplitude: 0.65,
    slackSag: 5.5,
  }),
});

export function createMasslineRuntime(defLike = DEFAULT_MASSLINE_DEF) {
  const def = normalizeDef(defLike);
  return {
    schemaVersion: MASSLINE_SCHEMA_VERSION,
    state: 'idle',
    restLength: def.defaultLength,
    targetLength: def.defaultLength,
    reelVelocity: 0,
    heat: 0,
    integrity: 1,
    overloadS: 0,
    overheatLatched: false,
    workJ: 0,
    lastTension: 0,
    lastImpulse: 0,
    cutReason: null,
  };
}

/**
 * Advance the winch/controller state.
 *
 * @param {Object} args
 * @param {number} args.dt fixed simulation step
 * @param {Object} args.def attachment definition
 * @param {Object} args.runtime previous serialized runtime
 * @param {Object} args.telemetry physics attachment telemetry
 * @param {Object} args.command {reel:-1..1, hold:boolean, cut:boolean, overdrive:boolean}
 * @param {Object} args.ownerBody optional mass/velocity data
 * @param {Object} args.targetBody optional mass/velocity data
 */
export function stepMassline(args = {}) {
  const dt = clamp(finite(args.dt), 0, 0.25);
  const def = normalizeDef(args.def);
  const prev = normalizeRuntime(args.runtime, def);
  const t = normalizeTelemetry(args.telemetry, prev.restLength);
  const command = normalizeCommand(args.command);
  const events = [];

  if (!(dt > 0)) return buildResult(prev, def, t, command, events, false);
  if (command.cut) {
    const next = { ...prev, state: 'cut', cutReason: 'pilot', reelVelocity: 0 };
    events.push({ type: 'attachment:cut', attachmentId: t.attachmentId, reason: 'pilot' });
    return buildResult(next, def, t, command, events, true);
  }

  let heat = Math.max(0, prev.heat - def.coolingPerS * dt);
  let integrity = clamp(prev.integrity + def.integrityRecoveryPerS * dt, 0, 1);
  let overheatLatched = prev.overheatLatched;
  if (heat >= def.maxHeat) overheatLatched = true;
  if (overheatLatched && heat <= def.overheatResume) overheatLatched = false;

  const permitted = !overheatLatched && integrity > 0;
  const requestedReel = permitted ? command.reel : 0;
  const reelMax = requestedReel < 0 ? def.reelInSpeed : def.reelOutSpeed;
  const overdriveMult = command.overdrive ? 1.45 : 1;
  const desiredReelVelocity = requestedReel * reelMax * overdriveMult;
  const reelVelocity = approach(prev.reelVelocity, desiredReelVelocity, def.reelAcceleration * dt);
  const targetLength = clamp(prev.targetLength + reelVelocity * dt, def.minLength, def.maxLength);

  // The joint length is smoothed rather than teleported. Under high tension, the
  // winch also loses authority; this is what makes a heavy target feel heavy without
  // writing ad-hoc velocity corrections.
  const tensionRatio = t.tension / Math.max(def.maxTension, 1);
  const stall = clamp(1 - Math.max(0, tensionRatio - 0.65) / 0.75, 0.08, 1);
  const lengthRate = Math.abs(reelVelocity) * stall;
  const restLength = moveToward(prev.restLength, targetLength, lengthRate * dt);

  const radialWork = Math.max(0, t.tension * Math.abs(restLength - prev.restLength));
  const idleEnergy = def.energyPerIdleS * dt;
  const mechanicalEnergy = radialWork / Math.max(def.efficiency, 0.05);
  const energyCost = idleEnergy + mechanicalEnergy;
  heat += def.idleHeatPerS * dt + mechanicalEnergy * def.heatPerWork * (command.overdrive ? 1.55 : 1);

  let overloadS = prev.overloadS;
  const impulseRatio = t.impulse / Math.max(def.maxImpulse, 1e-6);
  const overloadRatio = Math.max(tensionRatio, impulseRatio);
  if (overloadRatio > 1) {
    overloadS += dt;
    integrity -= Math.max(0, overloadRatio - 1) * def.integrityDamagePerOverloadS * dt;
  } else {
    overloadS = Math.max(0, overloadS - dt * 1.8);
  }
  integrity = clamp(integrity, 0, 1);

  const catastrophic = overloadRatio >= def.catastrophicRatio;
  const fatiguedBreak = overloadS >= def.overloadGraceS || integrity <= 0;
  const shouldCut = catastrophic || fatiguedBreak;
  let state = 'holding';
  let cutReason = null;
  if (shouldCut) {
    state = 'broken';
    cutReason = catastrophic ? 'catastrophic-overload' : integrity <= 0 ? 'integrity-failure' : 'sustained-overload';
    events.push({
      type: 'attachment:broken',
      attachmentId: t.attachmentId,
      reason: cutReason,
      tension: t.tension,
      impulse: t.impulse,
      overloadRatio,
    });
  } else if (overheatLatched) {
    state = 'overheated';
  } else if (requestedReel < -0.01) {
    state = 'reeling-in';
  } else if (requestedReel > 0.01) {
    state = 'paying-out';
  } else if (t.distance < restLength - 0.2) {
    state = 'slack';
  }

  if (!prev.overheatLatched && overheatLatched) events.push({ type: 'attachment:overheated', attachmentId: t.attachmentId });
  if (prev.overheatLatched && !overheatLatched) events.push({ type: 'attachment:cooled', attachmentId: t.attachmentId });

  const next = {
    schemaVersion: MASSLINE_SCHEMA_VERSION,
    state,
    restLength,
    targetLength,
    reelVelocity: shouldCut ? 0 : reelVelocity,
    heat,
    integrity,
    overloadS,
    overheatLatched,
    workJ: prev.workJ + mechanicalEnergy,
    lastTension: t.tension,
    lastImpulse: t.impulse,
    cutReason,
  };
  return buildResult(next, def, t, command, events, shouldCut, energyCost, overloadRatio, args.ownerBody, args.targetBody);
}

/**
 * Approximate qualitative mass response for HUD/AI only. The solver remains the
 * source of truth. A ratio near 0 means the owner is the anchor; near 1 means the
 * owner will be moved far more than the target.
 */
export function estimateMasslineResponse(ownerMass, targetMass) {
  const a = positive(ownerMass, 1);
  const b = positive(targetMass, 1);
  const sum = a + b;
  return {
    ownerMotionShare: b / sum,
    targetMotionShare: a / sum,
    reducedMass: a * b / sum,
    massRatio: a / b,
  };
}

function buildResult(runtime, def, telemetry, command, events, cut, energyCost = 0, overloadRatio = 0, ownerBody = null, targetBody = null) {
  const slack = Math.max(0, runtime.restLength - telemetry.distance);
  const tensionFraction = clamp(telemetry.tension / Math.max(def.maxTension, 1), 0, 2);
  const relative = estimateMasslineResponse(ownerBody && ownerBody.mass, targetBody && targetBody.mass);
  return {
    schemaVersion: MASSLINE_SCHEMA_VERSION,
    runtime,
    action: {
      cut,
      restLength: runtime.restLength,
      // Rapier rope joints are rebuilt only when the change is meaningful; this
      // threshold prevents needless allocation churn at 60 Hz.
      shouldUpdateJoint: !cut && Math.abs(runtime.restLength - telemetry.restLength) >= 0.015,
    },
    resourceDelta: { energy: -Math.max(0, energyCost), heat: Math.max(0, runtime.heat) },
    events,
    telemetry: {
      attachmentId: telemetry.attachmentId,
      state: runtime.state,
      distance: telemetry.distance,
      restLength: runtime.restLength,
      targetLength: runtime.targetLength,
      slack,
      tension: telemetry.tension,
      impulse: telemetry.impulse,
      tensionFraction,
      overloadRatio,
      heatFraction: clamp(runtime.heat / def.maxHeat, 0, 1.5),
      integrity: runtime.integrity,
      reelVelocity: runtime.reelVelocity,
      massResponse: relative,
    },
    visual: {
      coreRadius: def.visual.coreRadius * (1 + 0.45 * tensionFraction),
      haloRadius: def.visual.haloRadius * (1 + 0.75 * tensionFraction),
      pulseSpeed: def.visual.pulseSpeed * (1 + 1.2 * tensionFraction),
      noiseAmplitude: def.visual.noiseAmplitude * (1 - clamp(tensionFraction, 0, 1) * 0.72),
      sag: def.visual.slackSag * clamp(slack / Math.max(runtime.restLength, 1), 0, 1),
      overload: overloadRatio > 1,
      broken: cut,
    },
  };
}

function normalizeDef(defLike = {}) {
  const d = { ...DEFAULT_MASSLINE_DEF, ...(defLike || {}), visual: { ...DEFAULT_MASSLINE_DEF.visual, ...((defLike && defLike.visual) || {}) } };
  d.minLength = positive(d.minLength, DEFAULT_MASSLINE_DEF.minLength);
  d.maxLength = Math.max(d.minLength, positive(d.maxLength, DEFAULT_MASSLINE_DEF.maxLength));
  d.defaultLength = clamp(positive(d.defaultLength, DEFAULT_MASSLINE_DEF.defaultLength), d.minLength, d.maxLength);
  return d;
}

function normalizeRuntime(runtime, def) {
  const r = runtime && typeof runtime === 'object' ? runtime : createMasslineRuntime(def);
  return {
    schemaVersion: MASSLINE_SCHEMA_VERSION,
    state: String(r.state || 'idle'),
    restLength: clamp(finite(r.restLength, def.defaultLength), def.minLength, def.maxLength),
    targetLength: clamp(finite(r.targetLength, def.defaultLength), def.minLength, def.maxLength),
    reelVelocity: finite(r.reelVelocity),
    heat: Math.max(0, finite(r.heat)),
    integrity: clamp(finite(r.integrity, 1), 0, 1),
    overloadS: Math.max(0, finite(r.overloadS)),
    overheatLatched: !!r.overheatLatched,
    workJ: Math.max(0, finite(r.workJ)),
    lastTension: Math.max(0, finite(r.lastTension)),
    lastImpulse: Math.max(0, finite(r.lastImpulse)),
    cutReason: r.cutReason == null ? null : String(r.cutReason),
  };
}

function normalizeTelemetry(t = {}, fallbackLength) {
  return {
    attachmentId: t.attachmentId == null ? null : String(t.attachmentId),
    restLength: positive(t.restLength, fallbackLength),
    distance: Math.max(0, finite(t.distance, fallbackLength)),
    stretch: Math.max(0, finite(t.stretch)),
    relativeSpeed: finite(t.relativeSpeed),
    tension: Math.max(0, finite(t.tension)),
    impulse: Math.max(0, finite(t.impulse)),
  };
}

function normalizeCommand(command = {}) {
  return {
    reel: clamp(finite(command.reel), -1, 1),
    hold: command.hold !== false,
    cut: !!command.cut,
    overdrive: !!command.overdrive,
  };
}

function approach(cur, target, amount) { return moveToward(cur, target, Math.abs(amount)); }
function moveToward(cur, target, amount) { const d = target - cur; return Math.abs(d) <= amount ? target : cur + Math.sign(d) * amount; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function finite(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }
function positive(v, fallback) { return Number.isFinite(v) && v > 0 ? v : fallback; }
