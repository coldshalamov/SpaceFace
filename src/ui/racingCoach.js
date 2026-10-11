// Read-only advice from the fitted V3 drive. It never steers, brakes or grants speed.
import { estimateBrakingSolution } from '../core/flight/flightTelemetry.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { gateApproach } from '../systems/racingGeometry.js';

export function readRacingCoach(params, player, gates, state) {
  if (!player?.pos || !player.vel || !gates?.length) return null;
  const next = Math.max(0, Math.min(gates.length - 1, params?.nextGate | 0));
  const gate = gates[next], approach = gateApproach(gates, next);
  if (!gate || !approach) return null;
  const profile = resolvePropulsionProfile(player, state);
  const braking = estimateBrakingSolution(player, profile);
  const speed = Math.hypot(player.vel.x || 0, player.vel.z || 0);
  const dx = gate.x - player.pos.x, dz = gate.z - player.pos.z;
  const distance = Math.hypot(dx, dz);
  const radius = Math.max(1, (Number(params.gateRadiusWU) || 90) - (Number(player.radius) || 0));
  const closing = player.vel.x * approach.nx + player.vel.z * approach.nz;
  const planeDistance = dx * approach.nx + dz * approach.nz;
  const secondsToPlane = closing > 1 && planeDistance > 0 ? planeDistance / closing : null;
  const driftMiss = secondsToPlane !== null && secondsToPlane < 8
    ? Math.abs((player.pos.x + player.vel.x * secondsToPlane - gate.x) * -approach.nz
      + (player.pos.z + player.vel.z * secondsToPlane - gate.z) * approach.nx) : null;
  let cornerSpeed = Infinity;
  if (next + 1 < gates.length) {
    const exitX = gates[next + 1].x - gate.x, exitZ = gates[next + 1].z - gate.z;
    const exitLength = Math.hypot(exitX, exitZ);
    if (exitLength > 1) {
      const cosine = Math.max(-1, Math.min(1, (exitX * approach.nx + exitZ * approach.nz) / exitLength));
      const angle = Math.acos(cosine);
      if (angle > 0.15) cornerSpeed = Math.max(30,
        (Number(profile.maxYawRate) || 2.5) * radius / Math.max(0.15, Math.tan(angle / 2)));
    }
  }
  const brakingDistance = speed > cornerSpeed && braking.directAccel > 0
    ? (speed * speed - cornerSpeed * cornerSpeed) / (2 * braking.directAccel) : 0;
  const brakeNow = closing > 0 && brakingDistance > 0 && distance <= brakingDistance + speed * 0.35;
  return { brakeNow, cornerSpeed, brakingDistance, driftMiss,
    projectedMiss: driftMiss !== null && driftMiss > radius,
    hint: brakeNow ? 'BRAKE FOR TURN' : driftMiss !== null && driftMiss > radius ? 'CORRECT YOUR DRIFT' : '' };
}
