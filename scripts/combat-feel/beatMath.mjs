// Pure timing math for the combat-feel bench. No Three, no DOM, no wall clock.
//
// The harness uses the same functions as this Node-testable module: a shot's flight is quantized
// to the 60 Hz presentation clock exactly the way the production weapons lab reports it, and the
// manifest's beat list is derived from those quantized times. That keeps a captured frame and a
// manifest row on one clock.
import { FIXED_ARENA, STEP_SECONDS, weaponForShot } from './catalog.mjs';

const FRAMES_PER_SECOND = 1 / STEP_SECONDS;

export function roundTime(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

export function frameForTime(value) {
  return Math.max(0, Math.round(Number(value) * FRAMES_PER_SECOND));
}

export function snapTime(value) {
  return roundTime(frameForTime(value) * STEP_SECONDS);
}

/** Authored socket X in world space for the fixed arena fixture. */
export function arenaShotEndpoints(weapon, contact = 'hull') {
  const startX = FIXED_ARENA.ownerX + FIXED_ARENA.ownerNoseOffsetWu;
  const contactRadius = contact === 'shield'
    ? FIXED_ARENA.targetRadius
    : FIXED_ARENA.targetHullHalfExtentWu;
  const endX = FIXED_ARENA.targetX - contactRadius;
  return {
    start: { x: roundTime(startX), z: 0 },
    end: { x: roundTime(endX), z: 0 },
    distanceWu: roundTime(Math.max(0, endX - startX)),
    axis: { x: 1, z: 0 },
    speedWu: weapon && Number(weapon.projSpeed) > 0 ? Number(weapon.projSpeed) : 0,
  };
}

/**
 * Resolve one shot's real flight interval for a weapon row. Projectile flight is quantized up to
 * whole presentation frames (the first birth frame is retained even for a contact closer than one
 * step). Continuous beams have no travelling body: contact begins on the fire frame.
 */
export function resolveShotTiming(weapon, { fireAt = 0, start = null, end = null, contact = 'hull' } = {}) {
  if (!weapon) throw new Error('resolveShotTiming requires a weapon row');
  const endpoints = arenaShotEndpoints(weapon, contact);
  const from = start || endpoints.start;
  const to = end || endpoints.end;
  const distanceWu = Math.hypot(Number(to.x) - Number(from.x), Number(to.z) - Number(from.z));
  const beam = weapon.continuous === true;
  const speed = Number(weapon.projSpeed);
  if (!beam && !(speed > 0)) {
    throw new Error(`Weapon ${weapon.id} has no finite projectile speed`);
  }
  const rawTravel = beam ? 0 : distanceWu / speed;
  const flightFrames = beam ? 0 : Math.max(1, Math.ceil(rawTravel / STEP_SECONDS - 1e-8));
  const travelSeconds = roundTime(flightFrames * STEP_SECONDS);
  const contactAt = roundTime(Number(fireAt) + travelSeconds);
  const releaseAt = beam
    ? roundTime(Number(fireAt) + Math.max(0.1, Number(weapon.releaseAfterSeconds) || 1.2))
    : contactAt;
  return {
    weaponId: weapon.id,
    fireAt: roundTime(fireAt),
    contactAt,
    releaseAt,
    travelSeconds,
    flightFrames,
    rawTravelSeconds: roundTime(rawTravel),
    distanceWu: roundTime(distanceWu),
    beam,
  };
}

/**
 * Build the deterministic shot plan for a scenario. `releaseAfterSeconds` on a beam shot is a
 * fixture-only authored interval (the production weapon row is hitscan/continuous).
 */
export function buildShotPlan(scenario, { fireAtOverride = {} } = {}) {
  if (!scenario) return [];
  return scenario.shots.map((shot, index) => {
    const weapon = weaponForShot(scenario, index);
    if (!weapon) throw new Error(`${scenario.id}: no weapon for shot ${index}`);
    const fireAt = Object.prototype.hasOwnProperty.call(fireAtOverride, index)
      ? fireAtOverride[index]
      : shot.fireAt;
    const timing = resolveShotTiming(weapon, { fireAt, contact: shot.contact });
    return {
      index,
      weaponId: weapon.id,
      weapon,
      contact: shot.contact,
      fireAt: timing.fireAt,
      contactAt: timing.contactAt,
      releaseAt: shot.contact === 'hull' && weapon.continuous
        ? roundTime(fireAt + Math.max(0.1, Number(shot.releaseAfterSeconds) || 1.2))
        : timing.contactAt,
      travelSeconds: timing.travelSeconds,
      flightFrames: timing.flightFrames,
      distanceWu: timing.distanceWu,
      beam: timing.beam,
      socketMode: 'pending authored socket read',
    };
  });
}

export function primaryHullShot(shotPlan) {
  return shotPlan.find((shot) => shot.contact === 'hull') || shotPlan[0] || null;
}

export function primaryContactShot(shotPlan) {
  return shotPlan[0] || null;
}

/**
 * Named visual beats for one scenario. All times are 60 Hz-quantized and sorted by time; a beat is
 * a sample request, not a simulation event. The harness may also inspect a beat's first-seen time
 * from the rolling evidence tracker.
 */
export function buildBeatTimes(scenario, shotPlan = null) {
  if (!scenario) throw new Error('buildBeatTimes requires a scenario');
  const shots = shotPlan || buildShotPlan(scenario);
  const first = primaryContactShot(shots);
  const hull = primaryHullShot(shots);
  if (!first) throw new Error(`${scenario.id}: no shots`);
  const firstContact = first.contactAt;
  const hullContact = hull ? hull.contactAt : firstContact;
  // A continuous beam has no travelling body: its production contact starts on the fire frame.
  // The named visual beats still step through muzzle -> painted beam -> working contact.
  const firstContactBeat = first.beam ? roundTime(first.fireAt + 0.12) : firstContact;
  const hullContactBeat = hull && hull.beam ? roundTime(hull.fireAt + 0.16) : hullContact;
  const shotTravelSeconds = Math.max(0, first.travelSeconds || 0);
  const travelAt = first.beam
    ? roundTime(first.fireAt + 0.06)
    : roundTime(first.fireAt + shotTravelSeconds * 0.5);
  const releaseAt = hull ? hull.releaseAt : firstContact;
  const coolingBase = hull && hull.beam ? releaseAt : hullContact;
  const beats = [
    { beat: 'muzzle', atS: roundTime(first.fireAt) },
    { beat: 'travel', atS: travelAt },
    { beat: 'contact', atS: roundTime(firstContactBeat) },
    { beat: 'reaction', atS: roundTime(hullContactBeat + 0.10) },
    { beat: 'light', atS: roundTime(hullContactBeat + 0.04) },
    { beat: 'debris', atS: roundTime(hullContactBeat + 0.20) },
    { beat: 'cooling', atS: roundTime(coolingBase + (hull && hull.beam ? 0.55 : 0.85)) },
    { beat: 'aftermath', atS: roundTime(scenario.durationSeconds - 0.35) },
  ];
  if (scenario.tumble) {
    beats.push({ beat: 'tumble', atS: roundTime(hullContactBeat + 0.40) });
  }
  // Stable chronological order; equal times keep authored beat order.
  beats.sort((a, b) => a.atS - b.atS || a.beat.localeCompare(b.beat));
  for (const beat of beats) {
    beat.frame = frameForTime(beat.atS);
    beat.atS = roundTime(beat.frame * STEP_SECONDS);
  }
  return beats;
}

export function beatIds(beats) {
  return beats.map((beat) => beat.beat);
}

export function shotPlanSummary(shotPlan) {
  return shotPlan.map((shot) => ({
    weaponId: shot.weaponId,
    contact: shot.contact,
    fireAt: shot.fireAt,
    contactAt: shot.contactAt,
    releaseAt: shot.releaseAt,
    travelSeconds: shot.travelSeconds,
    flightFrames: shot.flightFrames,
    distanceWu: shot.distanceWu,
    beam: shot.beam,
  }));
}

export function estimateTumbleYaw(law, durationS, { dragPerSecond = 0.05 } = {}) {
  const spin = law && Number.isFinite(law.entrySpin) ? law.entrySpin : 0;
  if (!(spin > 0) || !(durationS > 0)) return 0;
  const drag = Math.max(1e-6, Number(dragPerSecond) || 0.05);
  return (spin / drag) * (1 - Math.exp(-drag * durationS));
}
