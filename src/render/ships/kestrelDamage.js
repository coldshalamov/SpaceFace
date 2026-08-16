// SF-K0 Kestrel damage adapter (AC-18).
//
// The starter hull still tags nav lights, drive, plume, and secondary parts with userData.damageRole.
// This module collects those parts once and delegates to the shared shipDamage driver so the player
// Kestrel uses the same bands, dressing, and repair easing as every other live ship.
import {
  DAMAGE_STATES,
  damageStateFor,
  attachDamageStateDriver as attachSharedDamageStateDriver,
} from './shipDamage.js';

export { DAMAGE_STATES, damageStateFor };

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
 * Attach the shared damage driver to a Kestrel mesh. Signature stays
 * (root, hullGroup, baseDriveGlowOpacity) so kestrelHero does not need a seam change.
 */
export function attachDamageStateDriver(root, hullGroup, baseDriveGlowOpacity) {
  const parts = collectDamageParts(hullGroup);
  parts.plumeBaseOpacity = baseDriveGlowOpacity != null ? baseDriveGlowOpacity : 0.30;
  return attachSharedDamageStateDriver(root, hullGroup, parts);
}
