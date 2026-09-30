// PB-ORD-A (SF-035+036+037) — the bomb-delivered condition readout.
//
// One pure reader over the combat runtime for the current-target panel. The three drift-bomb
// control payloads all deliver their effect as combat state — status_ionized + wrecked
// subsystems (EMP), status_burning stacks (thermite), status_tumbling (havoc) — and that state
// was invisible: nothing distinguished "this hull's guns are OUT (hardware gone, stays out)"
// from "this hull is REARMING (ionized caps climbing back at a flattened rate, ticking to
// expiry)", or "can't fire" from "can't steer", or a 1-stack splash from a 3-stack committed
// burn. This reader composes those facts from the same records the combat kernel owns, so the
// panel can never disagree with what the payloads actually did.
//
// Law: pure and DOM-free; every clock is (expiresTick − state.tick) / 60 — sim time only, no
// wall clock, no rng, no writes. Expired status keys are treated as absent, matching the
// kernel's own recompute skip (src/combat/subsystems.js recomputeCombatantModifiers).
import { ACTION_DEFS } from '../data/combatDefs.js';

// The powered attack verb the control statuses already govern: the specialists' burst pays
// capacitor, needs weapon+sensor capabilities, and is tag-blocked by tumbling/overheated.
const BURST_DEF = ACTION_DEFS.find((def) => def.id === 'action_burst') || null;
const BURST_CAP_COST = Math.max(0, Number(BURST_DEF && BURST_DEF.costs && BURST_DEF.costs.capacitor) || 0);
const TICK_HZ = 60;

function liveStatus(runtime, statusId, tick) {
  const active = runtime && runtime.statuses && runtime.statuses[statusId];
  if (!active || !Number.isFinite(active.expiresTick) || active.expiresTick <= tick) return null;
  return active;
}

function secondsLeft(expiresTick, tick) {
  return Math.max(0, (Number(expiresTick) - tick) / TICK_HZ);
}

function fmtSeconds(seconds) {
  if (!Number.isFinite(seconds)) return '';
  return `${(Math.round(seconds * 10) / 10).toFixed(1)}s`;
}

function fireGate(runtime, entity, tick) {
  if (!BURST_DEF) return null;
  const capabilities = runtime.capabilities || {};
  // 1. Hardware out: a required capability is false with no timed status as its source.
  //    (Only wrecked subsystems set weapon/sensor capability false durably — status_scrambled
  //    also takes the sensor, and that one is classified below by its own expiry.)
  for (const capability of BURST_DEF.requiresCapabilities || []) {
    if (capabilities[capability] !== false) continue;
    const source = capability === 'sensor' && liveStatus(runtime, 'status_scrambled', tick);
    if (source) {
      return { denied: true, recovering: true, label: 'JAMMED', secondsLeft: secondsLeft(source.expiresTick, tick) };
    }
    return { denied: true, recovering: false, label: 'GUNS OUT', secondsLeft: null };
  }
  // 2. Tag-locked: the kernel blocked the verb's action tags. Tumbling locks guns AND helm —
  //    the steer fact carries the same clock, so the fire row only names the lock here.
  const blocked = new Set(runtime.blockedActionTags || []);
  const tumbling = liveStatus(runtime, 'status_tumbling', tick);
  if (tumbling && (BURST_DEF.tags || []).some((tag) => blocked.has(tag))) {
    return { denied: true, recovering: true, label: 'GUNS LOCKED', secondsLeft: secondsLeft(tumbling.expiresTick, tick) };
  }
  const overheated = liveStatus(runtime, 'status_overheated', tick);
  if (overheated && (BURST_DEF.tags || []).some((tag) => blocked.has(tag))) {
    return { denied: true, recovering: true, label: 'OVERHEATED', secondsLeft: secondsLeft(overheated.expiresTick, tick) };
  }
  // 3. Capacitor denied (SF-035's recovering case): status_ionized flattens regen while the
  //    burst cost stays; the restart window is the refill clock at the CURRENT suppression.
  const cap = Math.max(0, Number(entity && entity.cap) || 0);
  if (cap < BURST_CAP_COST) {
    const regenPerS = Math.max(0, Number(entity && entity.capRegen) || 0)
      * Math.max(0, Number(runtime.multipliers && runtime.multipliers.capRegen) || 1);
    const seconds = regenPerS > 0 ? (BURST_CAP_COST - cap) / regenPerS : null;
    return { denied: true, recovering: true, label: 'REARM', secondsLeft: seconds };
  }
  return null;
}

/**
 * The delivered-condition facts for one target, or null when the target carries no combat
 * runtime (rocks, wrecks, clean hulls before first damage).
 */
export function targetConditionReadout(state, target) {
  if (!state || !target || target.alive === false) return null;
  const table = state.combat && state.combat.entities;
  const runtime = table ? table[String(target.id)] : null;
  if (!runtime) return null;
  const tick = state.tick | 0;

  // STEER: tumbling (the havoc/massline disturbance — helm decontrolled, settling to expiry)
  // or a wrecked drive (stays out until a tender or taut line restores it — no authored clock).
  const tumbling = liveStatus(runtime, 'status_tumbling', tick);
  const drive = runtime.subsystems && runtime.subsystems.subsystem_drive;
  let steer = null;
  if (tumbling) {
    steer = { out: true, label: 'TUMBLING', secondsLeft: secondsLeft(tumbling.expiresTick, tick) };
  } else if ((drive && (drive.destroyed === true || drive.effectiveDisabled === true))
    || (runtime.capabilities && runtime.capabilities.drive === false)) {
    steer = { out: true, label: 'DRIVE OUT', secondsLeft: null };
  }

  const fire = fireGate(runtime, target, tick);

  // BURN (SF-036): the committed stacks and the true remaining window — the same numbers the
  // status bag pays the DoT with, so the read can never outrun the damage.
  const burning = liveStatus(runtime, 'status_burning', tick);
  const burn = burning
    ? { stacks: Math.max(1, Math.min(3, Number(burning.stacks) || 1)), secondsLeft: secondsLeft(burning.expiresTick, tick) }
    : null;

  const parts = [];
  if (steer) {
    // A tumble IS the helm-out fact; a wrecked drive spells it (its lock has no clock).
    parts.push(steer.secondsLeft != null ? `${steer.label} ${fmtSeconds(steer.secondsLeft)}` : `${steer.label} · HELM OUT`);
  }
  if (fire) {
    parts.push(fire.secondsLeft != null
      ? `${fire.label}${fire.label === 'REARM' ? ' ~' : ' '}${fmtSeconds(fire.secondsLeft)}`
      : fire.label);
  }
  if (burn) parts.push(`BURNING ×${burn.stacks} ${fmtSeconds(burn.secondsLeft)}`);

  return Object.freeze({
    steer: steer ? Object.freeze(steer) : null,
    fire: fire ? Object.freeze(fire) : null,
    burn: burn ? Object.freeze(burn) : null,
    text: parts.join(' · '),
  });
}
