// Generalized ship damage-state system (spec §9.11).
//
// The Kestrel originally had a bespoke damage driver (kestrelDamage.js) hardcoded to its specific
// nav-light/armor/utility-pod parts. This module generalizes it so EVERY bespoke ship can show
// readable damage without the HUD hull bar: the builder passes in its own part buckets and this
// driver applies the same 5 named states with the same thresholds and reversible behavior.
//
// The ship must remain RECOGNIZABLE through the critical state; random fragmentation begins only at
// destruction (which is terminal and owned by the VFX entity-death path). So we never hide the core
// hull/drive silhouette — we modulate emissive light groups, destabilize the drive plume, displace
// armor panels, and shed named secondary parts. All visual change is reversible on hull recovery.
//
// THRESHOLDS ARE IDENTICAL to the original kestrelDamage.js so the Kestrel check (which asserts exact
// state strings + the 5-state renderContract array) keeps passing byte-for-byte.
import * as THREE from 'three';

// Hull-fraction thresholds for each named state (spec §9.11). Ordered high→low. Frozen — the Kestrel
// check asserts these exact boundary behaviors, so do not renumber.
export const DAMAGE_STATES = Object.freeze({
  OPERATIONAL: { id: 'operational', min: 0.75 },
  STRESSED: { id: 'stressed', min: 0.50 },
  DAMAGED: { id: 'damaged', min: 0.25 },
  CRITICAL: { id: 'critical', min: 0.05 },
  DESTRUCTION: { id: 'destruction', min: -Infinity },
});

// Resolve the current damage-state id from a hull fraction in [0,1]. Exact string outputs match the
// original Kestrel implementation (check-kestrel-damage.mjs asserts these).
export function damageStateFor(hullFrac) {
  if (hullFrac <= 0) return 'destruction';
  if (hullFrac < 0.05) return 'critical';
  if (hullFrac < 0.25) return 'critical';
  if (hullFrac < 0.50) return 'damaged';
  if (hullFrac < 0.75) return 'stressed';
  return 'operational';
}

// Cache a cheap deterministic RNG per-mesh so flicker/shedding looks stable-ish, not white-noise.
function makeShedRng(seed) {
  let s = seed | 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 1000) / 1000; };
}

/**
 * Attach a per-frame damage-state driver to a ship mesh. The update closure is stored on
 * mesh.userData.updateDamageState(entity, nowSec) for the renderer to call each frame (renderer.js
 * already calls it: `if (m.userData.updateDamageState) m.userData.updateDamageState(e, now)`).
 *
 * parts = {
 *   navLights:     [Mesh...] — emissive light groups that fail progressively (most readable cue)
 *   navLightBase:  [number]  — snapshot of each navLight's resting emissiveIntensity (for restore)
 *   driveCore:     Mesh      — the drive core (kept visible through critical; destabilized glow)
 *   plume:         Mesh      — the drive plume (flickers/dims at critical)
 *   plumeBaseOpacity: number — the plume's resting opacity (restored when not critical)
 *   secondary:     [Mesh...] — named parts shed at critical (utility pods, shoulder plates, antennas)
 *   armor:         [Mesh...] — armor panels displaced outward at damaged+ (exposes substructure)
 *   sensorSlits:   [Mesh...] — sensor brow lights that go intermittent at critical
 * }
 *
 * Any bucket may be empty/missing — the driver no-ops on absent parts, so a ship with only navLights
 * + a plume still gets readable damage. The driver holds no global state and allocates nothing/frame.
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

  const rng = makeShedRng((root.uuid.charCodeAt(0) * 97 + 7) | 0);
  let lastState = 'operational';

  function setStateVisuals(stateId, frac, now) {
    // ----- emissive light groups: failed lights are the most readable damage cue -----
    const flicker = (period, depth) => 1 - depth * (0.5 + 0.5 * Math.sin(now * period)); // 1→(1-depth)
    if (stateId === 'operational' || stateId === 'stressed') {
      for (let i = 0; i < navLights.length; i++) navLights[i].material.emissiveIntensity = navLightBase[i];
      for (let i = 0; i < sensorSlits.length; i++) sensorSlits[i].material.emissiveIntensity = sensorBase[i];
    } else if (stateId === 'damaged') {
      // A nav-light group dims — the most readable non-HUD damage cue (§9.11 #3).
      for (let i = 0; i < navLights.length; i++) navLights[i].material.emissiveIntensity = navLightBase[i] * 0.10;
      for (let i = 0; i < sensorSlits.length; i++) sensorSlits[i].material.emissiveIntensity = sensorBase[i];
    } else { // critical
      for (let i = 0; i < navLights.length; i++) {
        navLights[i].material.emissiveIntensity = navLightBase[i] * flicker(11 + i * 3, 0.85);
      }
      for (let i = 0; i < sensorSlits.length; i++) {
        sensorSlits[i].material.emissiveIntensity = sensorBase[i] * flicker(7 + i * 2, 0.7);
      }
    }

    // ----- displaced armor / exposed substructure (Damaged+, spec §9.11 #3) -----
    const armorShift = stateId === 'damaged' ? 0.18 : stateId === 'critical' ? 0.34 : 0;
    for (let i = 0; i < armor.length; i++) {
      const base = armorPos[i];
      armor[i].position.set(base.x, base.y + armorShift * 0.2, base.z + armorShift);
      armor[i].rotation.z = armorShift * 0.12 * (i % 2 ? -1 : 1);
    }

    // ----- shed named secondary parts at Critical (§9.11 #4 asymmetric debris shedding) -----
    const shedSecondary = stateId === 'critical';
    for (let i = 0; i < secondary.length; i++) {
      secondary[i].visible = shedSecondary ? false : secondaryVisible[i];
    }

    // ----- drive core stays visible through critical (silhouette preserved); plume destabilizes -----
    if (driveCore) driveCore.visible = true;
    if (plume && plume.material) {
      if (stateId === 'critical') {
        plume.material.opacity = plumeBaseOpacity * (0.5 + 0.4 * rng()) * flicker(13, 0.4);
      }
      // For non-critical states the drive-fan onBeforeRender re-asserts plume opacity from speed each
      // frame, so we leave it to that path (don't fight it).
    }
  }

  root.userData.updateDamageState = function updateDamageState(entity, now) {
    if (!entity || !Number.isFinite(entity.hull) || !Number.isFinite(entity.hullMax) || entity.hullMax <= 0) return;
    const frac = Math.max(0, Math.min(1, entity.hull / entity.hullMax));
    const stateId = damageStateFor(frac);
    // Destruction (frac<=0) is terminal: the entity-death path disposes the mesh; we only ensure the
    // last visible frame still reads as "this ship". The VFX system owns the authored fragmentation.
    if (stateId === 'destruction') return;
    if (stateId !== lastState) {
      lastState = stateId;
      root.userData.damageState = stateId;
      root.userData.hullFrac = frac;
    }
    setStateVisuals(stateId, frac, now != null ? now : (typeof performance !== 'undefined' ? performance.now() * 0.001 : 0));
  };

  // Stash the resolved parts + state for inspection/diagnostics (mirrors the Kestrel's surface).
  root.userData.damageParts = {
    navLights, sensorSlits: sensorSlits.length ? sensorSlits : undefined,
    armor: armor.length ? armor : undefined, secondary,
    driveCore, plume,
  };
  root.userData.damageState = 'operational';
  return root;
}
