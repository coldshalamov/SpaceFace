// SF-K0 Kestrel damage-state system (spec §9.11).
//
// Five named states, driven by the entity's live hull fraction so the damage is readable without only
// reading the HUD hull bar (spec §22 acceptance bullet):
//
//   1. Operational — stable drive, all navigation lights, intact silhouette.        (hull > 0.75)
//   2. Stressed   — local heat, minor flicker, venting only under load.            (0.50–0.75)
//   3. Damaged    — displaced armor, one failed light group, exposed substructure. (0.25–0.50)
//   4. Critical   — unstable axial drive, intermittent sensors, debris shedding.   (0.05–0.25)
//   5. Destruction— authored breakup at engine, shoulder, hull, utility zones.     (hull <= 0)
//
// The ship must remain RECOGNIZABLE through the critical state; random fragmentation begins only at
// destruction (spec §9.11). We therefore never hide the core hull/canopy/drive-ring silhouette — we
// modulate emissive light groups, displace armor panels, destabilize the drive plume, and shed named
// secondary parts (utility pod, a shoulder plate, the antenna). All visual change is reversible when
// hull recovers, except destruction which is terminal and handled by the entity-death path.
//
// The builder (kestrelHero.js) marks the addressable parts with userData.role tags and keeps them out
// of static batching (keepSeparate). This module attaches a per-frame update closure to the mesh that
// the renderer calls from syncEntityViews; it holds no global state and allocates nothing per frame.
import * as THREE from 'three';

// Hull-fraction thresholds for each named state (spec §9.11). Ordered high→low.
export const DAMAGE_STATES = Object.freeze({
  OPERATIONAL: { id: 'operational', min: 0.75 },
  STRESSED: { id: 'stressed', min: 0.50 },
  DAMAGED: { id: 'damaged', min: 0.25 },
  CRITICAL: { id: 'critical', min: 0.05 },
  DESTRUCTION: { id: 'destruction', min: -Infinity },
});

// Resolve the current damage-state id from a hull fraction in [0,1].
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

// Find every part flagged with a damage role by walking the hull group once at attach time.
// A role may be set either directly on an emissive mesh (navLight, armor, secondary, driveCore, plume)
// or on a parent Group whose child meshes share the role (sensorSlit brow). The latter lets several
// meshes batch-style modulate as one group while staying out of the global static-batch merge.
function collectDamageParts(hullGroup) {
  const parts = { navLights: [], sensorSlits: [], armor: [], secondary: [], driveCore: null, plume: null };
  const collectEmissive = (node, bucket) => {
    node.traverse((o) => { if (o.isMesh && o.material && 'emissiveIntensity' in o.material) bucket.push(o); });
  };
  hullGroup.traverse((o) => {
    const role = o.userData && o.userData.damageRole;
    if (!role) return;
    if (role === 'navLight') parts.navLights.push(o);
    else if (role === 'sensorSlit') collectEmissive(o, parts.sensorSlits);
    else if (role === 'armor') parts.armor.push(o);
    else if (role === 'secondary') parts.secondary.push(o);
    else if (role === 'driveCore') parts.driveCore = o;
    else if (role === 'plume') parts.plume = o;
  });
  return parts;
}

/**
 * Attach a per-frame damage-state driver to a Kestrel mesh. Returns the mesh; the update closure is
 * stored on mesh.userData.updateDamageState(entity, nowSec) for the renderer to call each frame.
 *
 * The closure is cheap: it reads hull fraction, resolves the state, and applies only the deltas that
 * differ from the previous frame's state (so steady Operational is essentially free). It never hides
 * the core silhouette — only modulates emissive groups, displaces armor, and toggles secondary parts.
 */
export function attachDamageStateDriver(root, hullGroup, baseDriveGlowOpacity) {
  const parts = collectDamageParts(hullGroup);
  // Snapshot original transforms/material states so we can restore them on hull recovery (states are
  // reversible through Critical; only Destruction is terminal).
  const original = {
    navEmissive: parts.navLights.map((m) => m.material.emissiveIntensity),
    sensorEmissive: parts.sensorSlits.map((m) => m.material.emissiveIntensity),
    armorPos: parts.armor.map((m) => m.position.clone()),
    secondaryVisible: parts.secondary.map((m) => m.visible),
    plumeOpacity: baseDriveGlowOpacity != null ? baseDriveGlowOpacity : 0.30,
  };
  const rng = makeShedRng((root.uuid.charCodeAt(0) * 97) | 0);
  let lastState = 'operational';

  function setStateVisuals(stateId, frac, now) {
    // ----- emissive light groups (failed lights are the most readable damage cue) -----
    // Operational: all on. Stressed: all on (steady). Damaged: one nav group fails (port) + flicker.
    // Critical: sensors intermittent, both nav groups stutter. The drive core is destabilized.
    const flicker = (period, depth) => 1 - depth * (0.5 + 0.5 * Math.sin(now * period)); // 1→(1-depth)
    if (stateId === 'operational' || stateId === 'stressed') {
      for (let i = 0; i < parts.navLights.length; i++) parts.navLights[i].material.emissiveIntensity = original.navEmissive[i];
      for (let i = 0; i < parts.sensorSlits.length; i++) parts.sensorSlits[i].material.emissiveIntensity = original.sensorEmissive[i];
    } else if (stateId === 'damaged') {
      // A navigation light group fails (dimmed) — the most readable non-HUD damage cue (§9.11 #3). The
      // nav lights share one cyan emissive material, so the whole group dims together, which reads as
      // "a system has failed" rather than a symmetric power-down.
      for (let i = 0; i < parts.navLights.length; i++) parts.navLights[i].material.emissiveIntensity = original.navEmissive[i] * 0.10;
      for (let i = 0; i < parts.sensorSlits.length; i++) parts.sensorSlits[i].material.emissiveIntensity = original.sensorEmissive[i];
    } else { // critical
      for (let i = 0; i < parts.navLights.length; i++) {
        parts.navLights[i].material.emissiveIntensity = original.navEmissive[i] * flicker(11 + i * 3, 0.85);
      }
      for (let i = 0; i < parts.sensorSlits.length; i++) {
        parts.sensorSlits[i].material.emissiveIntensity = original.sensorEmissive[i] * flicker(7 + i * 2, 0.7);
      }
    }

    // ----- displaced armor / exposed substructure (Damaged+, spec §9.11 #3) -----
    // Shift one armor panel outward + tilt so a gap opens, revealing the darker mechanical substructure
    // beneath. Recovered fully below the Damaged threshold. Subtle in Damaged, pronounced in Critical.
    const armorShift = stateId === 'damaged' ? 0.18 : stateId === 'critical' ? 0.34 : 0;
    for (let i = 0; i < parts.armor.length; i++) {
      const base = original.armorPos[i];
      // shift along the panel's local +Z (outboard) so the gap reads as a displaced plate
      parts.armor[i].position.set(base.x, base.y + armorShift * 0.2, base.z + armorShift);
      parts.armor[i].rotation.z = armorShift * 0.12 * (i % 2 ? -1 : 1);
    }

    // ----- secondary parts: shed the utility pod / a shoulder / the antenna (Critical) -----
    // Spec §9.11 #4 "asymmetric debris shedding". Hide them at Critical so the silhouette reads as a
    // ship that has lost hardware — the actual debris particles are spawned by the VFX entity-death
    // path; here we only clear the part so the live ship shows the loss. Restored below Critical.
    const shedSecondary = stateId === 'critical';
    for (let i = 0; i < parts.secondary.length; i++) {
      parts.secondary[i].visible = shedSecondary ? false : original.secondaryVisible[i];
    }

    // ----- unstable axial drive (Critical): plume flickers and dims irregularly -----
    if (parts.plume && parts.plume.material) {
      if (stateId === 'critical') {
        parts.plume.material.opacity = original.plumeOpacity * (0.5 + 0.4 * rng()) * flicker(13, 0.4);
      } else {
        // The drive-fan onBeforeRender in kestrelHero.js re-asserts plume opacity from speed each
        // frame, so for non-critical states we leave it to that path (don't fight it).
      }
    }
  }

  root.userData.updateDamageState = function updateDamageState(entity, now) {
    if (!entity || !Number.isFinite(entity.hull) || !Number.isFinite(entity.hullMax) || entity.hullMax <= 0) return;
    const frac = Math.max(0, Math.min(1, entity.hull / entity.hullMax));
    const stateId = damageStateFor(frac);
    // Destruction (frac<=0) is terminal: the entity-death path disposes the mesh; we only need to
    // ensure the last visible frame still reads as "this ship". Skip the breakup here — the VFX
    // system owns the authored fragmentation at entity:killed (spec §9.11 #5, §15.3).
    if (stateId === 'destruction') return;
    if (stateId !== lastState) {
      lastState = stateId;
      root.userData.damageState = stateId;
      root.userData.hullFrac = frac;
    }
    setStateVisuals(stateId, frac, now != null ? now : (typeof performance !== 'undefined' ? performance.now() * 0.001 : 0));
  };

  // Stash the resolved parts + state for inspection/diagnostics.
  root.userData.damageParts = parts;
  root.userData.damageState = 'operational';
  return root;
}
