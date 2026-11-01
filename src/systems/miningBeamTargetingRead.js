import { BEAMS } from '../data/mining.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../data/cargoPayloadTypes.js';
import { isCeresWorkfleetHardware } from '../data/ceresWorkfleetIdentity.js';
import { verbAcceptsType } from '../data/interactionDescriptorCatalog.js';
import { presentationAllowsPlayerFacingAction } from '../core/presentationAdmission.js';
import { isHostileToPlayer } from './scanner.js';

// Synchronous beam-read projections shared by the mining owner and its UI readers. Keeping them
// here prevents presentation code from importing the full mining system.
export const BULK_HAUL_MIN_U = 20;
export const BEAM_BY_ID = new Map(BEAMS.map((beam) => [beam.id, beam]));

// Ordinary ore also has opticMaterial surface tags. Only opticStructureId identifies
// a lattice cell; rejecting the surface tag would make metal/crystal ore unmineable (D227).
export function isOpticLatticeCellData(data) {
  return !!(data && typeof data.opticStructureId === 'string' && data.opticStructureId);
}

// Only jettisoned cargo pods split under the beam; other payloads retain their own verbs.
export function isBeamSplittableCargoPod(entity) {
  return !!(entity && entity.type === 'payload' && entity.data
    && entity.data.payloadType === JETTISONED_CARGO_PAYLOAD_TYPE);
}

export function beamRangeFor(player, state) {
  const beam = (player && player.data && player.data.miningBeam)
    || (state && state.player && state.player.miningBeam);
  if (!beam) return null;
  const tier = BEAM_BY_ID.get(beam.tierId) || BEAM_BY_ID.get('beam_mk1');
  const range = beam.range || (tier && tier.range);
  return Number.isFinite(range) ? range : null;
}

export function isBeamTargetEligible(entity, state) {
  if (isCeresWorkfleetHardware(entity)) return false;
  if (!entity || entity.alive === false) return false;
  if (!verbAcceptsType('mine', entity.type) && !isBeamSplittableCargoPod(entity)
    && !weldableHullForBeam(entity, state)) return false;
  if (!presentationAllowsPlayerFacingAction(entity, state)) return false;
  if (entity.type === 'asteroid' && entity.data && entity.data.respawnAt != null) return false;
  if (entity.type === 'asteroid' && isOpticLatticeCellData(entity.data)) return false;
  return true;
}

// Shared acquisition/hold predicate for damaged, live, non-hostile ships and drones.
export function weldableHullForBeam(entity, state) {
  if (!entity || entity.alive === false) return false;
  if (entity.type !== 'ship' && entity.type !== 'drone') return false;
  if (entity.flags && entity.flags.docked) return false;
  const hullMax = Number(entity.hullMax);
  const hull = Number(entity.hull);
  if (!Number.isFinite(hullMax) || hullMax <= 0 || !Number.isFinite(hull)) return false;
  if (hull >= hullMax) return false;
  if (!state || !state.entities) return false;
  const player = state.entities.get(state.playerId);
  if (!player || entity.id === player.id) return false;
  return !isHostileToPlayer(entity, player.team, state);
}
