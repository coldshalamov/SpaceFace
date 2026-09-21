// Capital scores are shipped ES-module content, not JSON mods. All values are serializable.
export const SCORE_VERSION = 1;
export const SUBSYSTEM_ROLES = Object.freeze({
  thrusters: 'subsystem_drive', turrets: 'subsystem_weapon', bays: 'subsystem_tether_spool',
});
export function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}
export const sector = (heading, halfAngle, inner, outer, aim = 'hull') => ({
  kind: 'sector', aim, heading, halfAngle, inner, outer,
});
export const lane = (heading, start, end, width, lateral = 0, aim = 'hull') => ({
  kind: 'lane', aim, heading, start, end, width, lateral,
});
export const ring = (inner, outer) => sector(0, Math.PI, inner, outer);
export function packet(channels, statuses = [], heat = 0) {
  return { channels: { kinetic: 0, thermal: 0, ion: 0, plasma: 0, phase: 0, ...channels },
    statuses: statuses.map(([id, durationTicks]) => ({ id, stacks: 1, durationTicks })),
    penetration: 0, subsystemShare: 0.15, heat, flags: {} };
}
export function beat(spec) {
  return {
    trackTicks: 24, tellTicks: 132, activeTicks: 24, recoverTicks: 138,
    requires: ['weapon'], motion: { forward: 0.12, brake: false },
    expose: null, ...spec,
  };
}
export function hullActor({ label, archetype, hull, mass, radius, speed, doctrine }) {
  return { role: 'capital_hull', kind: 'ship', count: 1, hostile: true, scanLabel: label,
    archetype, hull, shield: 0, armor: 0, mass, radius, maxSpeed: speed,
    shipClass: 'capital', combatDoctrineId: doctrine, tetherable: true };
}
export function ballast(label, mass, radius = 12) {
  return { role: 'throw_mass', kind: 'asteroid', count: 3, scanLabel: label,
    radius, mass, hull: 160, tetherable: true };
}
export function wingMember(archetype, combatDoctrineId, wingRole) {
  return { archetype, combatDoctrineId, wingRole };
}
// Every boss is damageable at all times. These windows change mass response, not HP routing.
export const THROW_WINDOW = Object.freeze({ status: 'status_unmoored', durationTicks: 90 });
export function score(spec) {
  return { version: SCORE_VERSION, introTicks: 180, transitionTicks: 150,
    resumeTicks: 120, engageRadius: 620, suspendRadius: 900,
    voiceGapTicks: 150, maxWingMembers: 2, ...spec };
}
