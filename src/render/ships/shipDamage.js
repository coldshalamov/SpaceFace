// Shared ship damage-state driver (AC-18 / spec §9.11).
//
// One resolver and one presentation driver serve every live hull, including the starter Kestrel.
// Named bands are operational, stressed (<75%), damaged (<50%), critical (<25%), disabled, and
// destruction. A live entity.disabled === true outranks hull fraction; hull<=0 without that flag
// is destruction. Player and NPC share the visual language — this module never writes velocity,
// input, control, timeScale, or hull.
//
// Persistent physical dressing (scorch, hot-contact, breach, wake, vent, beacon) lives in
// shipDamageDressing.js and is allocated once at attach. Downward hull changes apply immediately;
// hull increases ease the presentation fraction so station repair clears band-by-band.
import { attachDamageDressing } from './shipDamageDressing.js';

export const REPAIR_EASE_SECONDS = 1.5;

export const DAMAGE_STATES = Object.freeze({
  OPERATIONAL: { id: 'operational', min: 0.75 },
  STRESSED: { id: 'stressed', min: 0.50 },
  DAMAGED: { id: 'damaged', min: 0.25 },
  CRITICAL: { id: 'critical', min: 0 },
  DISABLED: { id: 'disabled', min: null },
  DESTRUCTION: { id: 'destruction', min: -Infinity },
});

// Resolve the current damage-state id. `disabled` must be the boolean true to outrank hull.
export function damageStateFor(hullFrac, disabled) {
  if (disabled === true) return 'disabled';
  const frac = Number(hullFrac);
  if (!Number.isFinite(frac) || frac <= 0) return 'destruction';
  if (frac < 0.25) return 'critical';
  if (frac < 0.50) return 'damaged';
  if (frac < 0.75) return 'stressed';
  return 'operational';
}

function makeShedRng(seed) {
  let s = seed | 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 1000) / 1000; };
}

function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Attach a per-frame damage-state driver to a ship mesh. The update closure is stored on
 * mesh.userData.updateDamageState(entity, nowSec) for the renderer to call each frame.
 *
 * parts = {
 *   navLights:     [Mesh...] — emissive light groups that fail progressively
 *   navLightBase:  [number]  — snapshot of each navLight's resting emissiveIntensity
 *   driveCore:     Mesh      — kept visible through critical; darkened when disabled/wrecked
 *   plume:         Mesh      — hidden when disabled/wrecked; destabilized at critical
 *   plumeBaseOpacity: number
 *   secondary:     [Mesh...] — named parts shed at critical
 *   armor:         [Mesh...] — armor panels displaced at damaged+
 *   sensorSlits:   [Mesh...] — sensor lights that go intermittent at critical
 * }
 */
export function attachDamageStateDriver(root, hullGroup, parts) {
  const navLights = parts.navLights || [];
  const navLightBase = parts.navLightBase && parts.navLightBase.length === navLights.length
    ? parts.navLightBase
    : navLights.map((m) => (m && m.material && m.material.emissiveIntensity) || 1);
  const sensorSlits = parts.sensorSlits || [];
  const sensorBase = sensorSlits.map((m) => (m && m.material && m.material.emissiveIntensity) || 1);
  const armor = parts.armor || [];
  const armorPos = armor.map((m) => (m.position.clone()));
  const secondary = parts.secondary || [];
  const secondaryVisible = secondary.map((m) => m.visible);
  const plumeBaseOpacity = parts.plumeBaseOpacity != null ? parts.plumeBaseOpacity : 0.30;
  const driveCore = parts.driveCore || null;
  const plume = parts.plume || null;
  const plumeWasVisible = !plume || plume.visible !== false;
  const driveCoreBase = driveCore && driveCore.material && 'emissiveIntensity' in driveCore.material
    ? driveCore.material.emissiveIntensity
    : null;

  const rng = makeShedRng((root.uuid.charCodeAt(0) * 97 + 7) | 0);
  const dressing = attachDamageDressing(root, hullGroup);

  let lastVisualState = null;
  let sampled = false;
  let presentFrac = 1;
  let lastNow = 0;
  let easeFrom = 1;
  let easeTo = 1;
  let easeStartNow = 0;

  function stepPresentation(realFrac, now) {
    if (!sampled) {
      sampled = true;
      presentFrac = realFrac;
      lastNow = now;
      easeFrom = realFrac;
      easeTo = realFrac;
      easeStartNow = now;
      return presentFrac;
    }

    if (now < lastNow) {
      easeFrom = presentFrac;
      easeStartNow = now;
    }
    lastNow = now;

    if (realFrac < presentFrac) {
      presentFrac = realFrac;
      easeFrom = realFrac;
      easeTo = realFrac;
      easeStartNow = now;
      return presentFrac;
    }

    if (realFrac > presentFrac) {
      if (realFrac !== easeTo) {
        easeFrom = presentFrac;
        easeTo = realFrac;
        easeStartNow = now;
      }
      const elapsed = now - easeStartNow;
      const u = elapsed <= 0 ? 0 : (elapsed >= REPAIR_EASE_SECONDS ? 1 : elapsed / REPAIR_EASE_SECONDS);
      presentFrac = easeFrom + (easeTo - easeFrom) * u;
      return presentFrac;
    }

    presentFrac = realFrac;
    easeFrom = realFrac;
    easeTo = realFrac;
    return presentFrac;
  }

  function setEmissive(mesh, value) {
    if (mesh && mesh.material && 'emissiveIntensity' in mesh.material) {
      mesh.material.emissiveIntensity = value;
    }
  }

  function setStateVisuals(stateId, now) {
    const flicker = (period, depth) => 1 - depth * (0.5 + 0.5 * Math.sin(now * period));
    const dark = stateId === 'disabled' || stateId === 'destruction';

    if (dark) {
      for (let i = 0; i < navLights.length; i++) setEmissive(navLights[i], 0);
      for (let i = 0; i < sensorSlits.length; i++) setEmissive(sensorSlits[i], 0);
      if (driveCoreBase != null) setEmissive(driveCore, 0);
    } else if (stateId === 'operational' || stateId === 'stressed') {
      for (let i = 0; i < navLights.length; i++) setEmissive(navLights[i], navLightBase[i]);
      for (let i = 0; i < sensorSlits.length; i++) setEmissive(sensorSlits[i], sensorBase[i]);
      if (driveCoreBase != null) setEmissive(driveCore, driveCoreBase);
    } else if (stateId === 'damaged') {
      for (let i = 0; i < navLights.length; i++) setEmissive(navLights[i], navLightBase[i] * 0.10);
      for (let i = 0; i < sensorSlits.length; i++) setEmissive(sensorSlits[i], sensorBase[i]);
      if (driveCoreBase != null) setEmissive(driveCore, driveCoreBase);
    } else {
      for (let i = 0; i < navLights.length; i++) {
        setEmissive(navLights[i], navLightBase[i] * flicker(11 + i * 3, 0.85));
      }
      for (let i = 0; i < sensorSlits.length; i++) {
        setEmissive(sensorSlits[i], sensorBase[i] * flicker(7 + i * 2, 0.7));
      }
      if (driveCoreBase != null) setEmissive(driveCore, driveCoreBase);
    }

    const armorShift = stateId === 'damaged' ? 0.18 : stateId === 'critical' ? 0.34 : 0;
    for (let i = 0; i < armor.length; i++) {
      const base = armorPos[i];
      armor[i].position.set(base.x, base.y + armorShift * 0.2, base.z + armorShift);
      armor[i].rotation.z = armorShift * 0.12 * (i % 2 ? -1 : 1);
    }

    const shedSecondary = stateId === 'critical';
    for (let i = 0; i < secondary.length; i++) {
      secondary[i].visible = shedSecondary ? false : secondaryVisible[i];
    }

    if (driveCore) driveCore.visible = true;
    if (plume) {
      if (dark) {
        plume.visible = false;
      } else {
        plume.visible = plumeWasVisible;
        if (stateId === 'critical' && plume.material) {
          plume.material.opacity = plumeBaseOpacity * (0.5 + 0.4 * rng()) * flicker(13, 0.4);
        }
      }
    }
  }

  root.userData.updateDamageState = function updateDamageState(entity, now) {
    if (!entity || !Number.isFinite(entity.hull) || !Number.isFinite(entity.hullMax) || entity.hullMax <= 0) return;
    const realFrac = clamp01(entity.hull / entity.hullMax);
    const clock = Number.isFinite(now)
      ? now
      : (sampled ? lastNow : 0);
    const shownFrac = stepPresentation(realFrac, clock);
    const stateId = damageStateFor(shownFrac, entity.disabled === true);

    root.userData.damageState = stateId;
    root.userData.hullFrac = realFrac;
    root.userData.damagePresentFrac = shownFrac;

    const steady = (stateId === 'operational' || stateId === 'destruction') && stateId === lastVisualState;
    if (steady) return;

    setStateVisuals(stateId, clock);
    dressing.update(stateId, shownFrac, clock);
    lastVisualState = stateId;
  };

  root.userData.damageParts = {
    navLights, sensorSlits: sensorSlits.length ? sensorSlits : undefined,
    armor: armor.length ? armor : undefined, secondary,
    driveCore, plume,
  };
  root.userData.damageState = 'operational';
  root.userData.damagePresentFrac = 1;
  root.userData.damageDriver = 'shipDamage';
  return root;
}
