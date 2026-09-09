// PQ-165.03 — with reduce-motion on, these facts still have a non-vestibular channel.
// Shake, FOV punch and hit-stop may go; direction, side, taut line and a starved mill may not.

export const REDUCED_MOTION_INFORMATION_CUES = Object.freeze([
  Object.freeze({
    id: 'impactDirection',
    sourceEvent: 'combat:damage',
    vestibular: ['camera trauma', 'FOV punch', 'hit-stop'],
    information: 'directional damage chevron + S/A/H layer glyph',
    owner: 'src/ui/damageIndicators.js',
  }),
  Object.freeze({
    id: 'telegraphs',
    sourceEvent: 'ai:telegraph',
    vestibular: ['tell pulse animation'],
    information: 'FLYBY / TETHER / CHARGE tell chip and off-screen direction',
    owner: 'src/ui/hud.js',
  }),
  Object.freeze({
    id: 'shieldSide',
    sourceEvent: 'combat:damage',
    vestibular: ['schematic flash'],
    information: 'damage marker layer glyph S on the impact bearing',
    owner: 'src/ui/damageIndicators.js',
  }),
  Object.freeze({
    id: 'loadedLine',
    sourceEvent: 'tether:strain',
    vestibular: ['tether hum pitch', 'cable swirl'],
    information: 'TETHER status line keyed to tether.load / tether.phase',
    owner: 'src/ui/hud.js',
  }),
  Object.freeze({
    id: 'blockedOutput',
    sourceEvent: 'site:machineStatus',
    vestibular: [],
    information: 'OUTPUT BLOCKED status pill on the flight HUD; mill goes dark with a want chip in Asteroid Works',
    owner: 'src/ui/alerts.js',
  }),
  Object.freeze({
    id: 'contactDirection',
    sourceEvent: 'collision',
    vestibular: ['collision trauma', 'collision FOV', 'collision hit-stop'],
    information: 'same directional marker as a hull hit (shake may accompany it when motion is on)',
    owner: 'src/ui/damageIndicators.js',
  }),
]);

export function buildReducedMotionContactCue(payload, playerId) {
  if (!payload) return null;
  if (payload.aId !== playerId && payload.bId !== playerId) return null;
  const otherId = payload.aId === playerId ? payload.bId : payload.aId;
  const pos = payload.otherPos || payload.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  return {
    targetId: playerId,
    attackerId: otherId,
    applied: 1,
    dominantLayer: 'hull',
    attackerPos: pos,
    isPlayer: true,
  };
}
