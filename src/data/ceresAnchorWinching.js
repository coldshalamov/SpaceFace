// Fixed, borrowed worksite winches. The finite Long Plate remains asteroidSites-owned.
// These three masts use an existing measured asset and the ordinary persistent entity codec.
import { CERES_WORKFLEET_CONTRACT as C, ceresWorkfleetPoint } from './ceresWorkfleet.js';
import { modelTruthProxyManifest, modelTruthRow } from './modelTruth.js';
import { Masks } from '../core/entity.js';

export const CERES_WINCH_MODE = 'ceres_anchor_winch';
export const CERES_WINCH_SPAN = 480;
export const CERES_WINCH_ANCHORS = Object.freeze([
  Object.freeze({ index: 0, label: 'MOUTH WINCH', x: 100, z: -300 }),
  Object.freeze({ index: 1, label: 'APRON WINCH', x: -200, z: -720 }),
  Object.freeze({ index: 2, label: 'CRADLE WINCH', x: -620, z: -450 }),
]);
export const ceresWinchIdentity = index => `ceres:second_measure:winch:${index}`;
export function ceresWinchPoint(index) {
  return ceresWorkfleetPoint({ ...C.sitePlacement.pos, rot: C.sitePlacement.rot }, CERES_WINCH_ANCHORS[index]);
}
export function isCeresWinchAnchor(e, index = e?.data?.ceresWinchAnchor) {
  return Number.isInteger(index) && index >= 0 && index < CERES_WINCH_ANCHORS.length
    && e?.type === 'payload' && e.alive !== false && e.hull > 0 && e.mass === 6000
    && e.flags?.persistent === true && e.physicsBody?.dynamic === false
    && e.data?.ceresWinchAnchor === index && e.data.ceresWinchIdentity === ceresWinchIdentity(index)
    && e.data.combatProfileId === 'combat_profile_lantern_hardware'
    && e.data.sectorId === C.sectorId && !e.playerOwned && !e.data.playerOwned
    && !e.data.controlLease && !e.data.disabled;
}
function anchorCollision() {
  const row = modelTruthRow('place_extraction_mast');
  const measured = modelTruthProxyManifest({ type: 'wreck', radius: 18, data: { placeId: 'place_extraction_mast' } });
  if (!row || !measured) throw new Error('Ceres winch asset has no measured collision skin');
  // Packaged props fit their largest dimension to twice the supplied radius.
  const scale = 2 * row.gameplay.entityRadius / Math.max(...row.bounds.size);
  const center = row.bounds.center, ref = row.gameplay.entityRadius;
  const x = value => (value - center[0] / ref) * scale;
  const z = value => (value - center[2] / ref) * scale;
  return { ...measured, id: 'ceres-winching:mast-fit-v1', primitives: measured.primitives.map(p =>
    p.kind === 'capsule' ? { ...p, ax:x(p.ax), az:z(p.az), bx:x(p.bx), bz:z(p.bz), r:p.r*scale }
      : p.kind === 'circle' ? { ...p, x:x(p.x), z:z(p.z), r:p.r*scale }
        : { ...p, x:x(p.x), z:z(p.z), hx:p.hx*scale, hz:p.hz*scale }) };
}
export function ceresWinchAnchorSpec(index) {
  const def = CERES_WINCH_ANCHORS[index];
  if (!def) throw new RangeError('Unknown Ceres winch');
  const radius = 18;
  return {
    type: 'payload', alive: true, team: 2, factionId: 'faction_free', homeSectorId: C.sectorId,
    pos: ceresWinchPoint(index), vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius, mass: 6000, hull: 600, hullMax: 600, collides: true,
    collisionMask: Masks.SHIP | Masks.WRECK | Masks.PAYLOAD | Masks.PROJECTILE,
    flags: { persistent: true, missionPinned: true },
    physicsBody: { schemaVersion: 1, dynamic: false, radius, mass: 6000,
      shape: 'compound', material: 'wreck', ccd: true, revision: 0,
      collisionProxyManifest: anchorCollision() },
    data: { ceresWinchAnchor: index, ceresWinchIdentity: ceresWinchIdentity(index),
      sectorId: C.sectorId, homeSectorId: C.sectorId, transientSector: false,
      name: def.label, scanLabel: def.label, role: 'world_site_hardware',
      packagedPropFile: 'places/place_extraction_mast.glb', packagedPropSlot: 'place',
      packagedPropRadius: radius, visualRadius: radius,
      combatProfileId: 'combat_profile_lantern_hardware', masslineTetherable: true,
      physicalCustodyOnly: true, loot: [], salvagePool: {}, lifetimeS: Infinity },
  };
}
