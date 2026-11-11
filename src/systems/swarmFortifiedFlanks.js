// A paid defense must meet the approach, not watch the pack appear behind it.
// Placement only. Fortify owns the fixed field; Brood still owns every finite life.
import { SWARM_FORTIFY_SOCKETS } from '../data/swarmFortify.js';
import { swarmPlacementIsClear } from './swarmSafety.js';

const PACK_RADIUS = 30;
const PILOT_LEASH = 120;
// Outside the outer socket, with room for the entire arriving pack and hardware.
const DISTANCE = Math.max(...Object.values(SWARM_FORTIFY_SOCKETS).map(s => s.distance)) + 100;
// In the opening course frame these mean starboard, port, then front.
const GATES = Object.freeze(['front', 'rear', 'diagonal_a']);

export function planSwarmFortifiedFlanks(state, run, wave, plan, radius, ingress) {
  if (wave !== 2 || run?.ruleset !== 'swarm' || run.arenaId !== 'helios_core'
    || run.arenaMutators?.length || run.telemetry?.circuit
    || ingress?.gateGroupPolicy !== 'fortify-three-corridor-v1'
    || !(Number.isFinite(radius) && radius > 0)
    || (plan?.find(part => part.id === 'mite')?.count || 0) < 36) return null;
  const anchor = ingress.anchor;
  if (!Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.z)
    || !Number.isFinite(anchor?.rotation)) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)
    || Math.hypot(player.pos.x - anchor.x, player.pos.z - anchor.z) > PILOT_LEASH) return null;
  const ux = Math.cos(anchor.rotation), uz = Math.sin(anchor.rotation);
  for (const [dx, dz] of [[ux, uz], [-ux, -uz], [uz, -ux]]) {
    if (!swarmPlacementIsClear(state, {
      x: anchor.x + dx * DISTANCE, z: anchor.z + dz * DISTANCE,
    }, PACK_RADIUS + radius, { clearance: 8 })) return null;
  }
  return { x: anchor.x, z: anchor.z, ux, uz, distance: DISTANCE,
    maxPlayerDistance: DISTANCE + PACK_RADIUS + PILOT_LEASH,
    gates: GATES, player };
}
