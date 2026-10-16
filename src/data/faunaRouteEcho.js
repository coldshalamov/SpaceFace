// One frozen fragment of a dead host's lane.
// The pointer wraps. The step never stores a path and never lengthens the lane.

export const ECHO_REACH = 40;

const ECHO_WORDS = Object.freeze({
  lane: 'repeating a lane',
});

export function echoWord(flag) {
  return ECHO_WORDS[flag] || null;
}

export function echoApplies(species, site) {
  if (!species || species.migrates || species.chainFollow) return false;
  const points = site && site.routeEcho && site.routeEcho.waypoints;
  return Array.isArray(points) && points.length > 0;
}

export function stepEchoIndex(pos, points, index) {
  const n = points.length;
  let i = Number.isFinite(index) ? Math.abs(Math.floor(index)) % n : 0;
  const wp = points[i];
  const dx = (pos && pos.x || 0) - wp.x;
  const dz = (pos && pos.z || 0) - wp.z;
  if (dx * dx + dz * dz < ECHO_REACH * ECHO_REACH) i = (i + 1) % n;
  return i;
}
