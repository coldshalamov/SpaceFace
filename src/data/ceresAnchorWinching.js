// Fixed, borrowed worksite winches. The finite Long Plate remains asteroidSites-owned.
// These three masts use an existing measured asset and the ordinary persistent entity codec.
// Old Hob's anchor board is a fourth body at the same admission: the chalked swing
// survives on its scan label through save and Continue.
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
// The board stands inside the same site frame, clear of the three winch lines.
export const CERES_WINCH_BOARD = Object.freeze({ x: -60, z: -580 });
export const CERES_WINCH_BOARD_BIT = 3;
export const ceresWinchIdentity = index => `ceres:second_measure:winch:${index}`;
export const CERES_WINCH_BOARD_IDENTITY = 'ceres:second_measure:winch:board';
export function ceresWinchPoint(index) {
  return ceresWorkfleetPoint({ ...C.sitePlacement.pos, rot: C.sitePlacement.rot }, CERES_WINCH_ANCHORS[index]);
}
export function ceresWinchBoardPoint() {
  return ceresWorkfleetPoint({ ...C.sitePlacement.pos, rot: C.sitePlacement.rot }, CERES_WINCH_BOARD);
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
export function isCeresWinchBoard(e) {
  return e?.type === 'payload' && e.alive !== false && e.hull > 0
    && e.flags?.persistent === true && e.physicsBody?.dynamic === false
    && e.data?.ceresWinchBoard === true && e.data.ceresWinchIdentity === CERES_WINCH_BOARD_IDENTITY
    && e.data.sectorId === C.sectorId;
}

// Old Hob's script — every spoken line eight words or fewer.
export const OLD_HOB_CLIP = 'Easy, girl.';
export const OLD_HOB_SWING = 'Easy. Easy.';
export const OLD_HOB_CLEAR = 'There she goes.';
export const OLD_HOB_FOUL = 'Now look what you did.';
export const OLD_HOB_REFUSED = 'My winch is off.';

// `CLIP · ANCHOR N` — the lent fixed point reads on the world tag, not in speech.
export const ceresWinchAnchorTag = index => `CLIP · ANCHOR ${index + 1}`;

// Durable chalk line on the board: `ANCHOR BOARD · <pilot> · <n> swing(s)`.
export const ceresAnchorBoardLabel = chalk => chalk
  ? `ANCHOR BOARD · ${chalk.pilot || 'you'} · ${chalk.swings} ${chalk.swings === 1 ? 'swing' : 'swings'}`
  : 'ANCHOR BOARD';

function fittedCollision(placeId) {
  const row = modelTruthRow(placeId);
  const measured = modelTruthProxyManifest({ type: 'wreck', radius: 18, data: { placeId } });
  if (!row || !measured) throw new Error('Ceres winch asset has no measured collision skin');
  // Packaged props fit their largest dimension to twice the supplied radius.
  const scale = 2 * row.gameplay.entityRadius / Math.max(...row.bounds.size);
  const center = row.bounds.center, ref = row.gameplay.entityRadius;
  const x = value => (value - center[0] / ref) * scale;
  const z = value => (value - center[2] / ref) * scale;
  return { ...measured, id: `ceres-winching:${placeId}-fit-v1`, primitives: measured.primitives.map(p =>
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
      shape: 'compound', material: 'massline_sensor', ccd: true, revision: 0,
      collisionProxyManifest: fittedCollision('place_extraction_mast') },
    data: { ceresWinchAnchor: index, ceresWinchIdentity: ceresWinchIdentity(index),
      sectorId: C.sectorId, homeSectorId: C.sectorId, transientSector: false,
      name: def.label, scanLabel: ceresWinchAnchorTag(index), role: 'world_site_hardware',
      packagedPropFile: 'places/place_extraction_mast.glb', packagedPropSlot: 'place',
      packagedPropRadius: radius, visualRadius: radius,
      combatProfileId: 'combat_profile_lantern_hardware', masslineTetherable: true,
      physicalCustodyOnly: true, loot: [], salvagePool: {}, lifetimeS: Infinity },
  };
}
export function ceresWinchBoardSpec() {
  const radius = 18;
  return {
    type: 'payload', alive: true, team: 2, factionId: 'faction_free', homeSectorId: C.sectorId,
    pos: ceresWinchBoardPoint(), vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius, mass: 400, hull: 200, hullMax: 200, collides: true,
    collisionMask: Masks.SHIP | Masks.WRECK | Masks.PAYLOAD | Masks.PROJECTILE,
    flags: { persistent: true, missionPinned: true },
    physicsBody: { schemaVersion: 1, dynamic: false, radius, mass: 400,
      shape: 'compound', material: 'massline_sensor', ccd: true, revision: 0,
      collisionProxyManifest: fittedCollision('place_lane_beacon') },
    data: { ceresWinchBoard: true, ceresWinchIdentity: CERES_WINCH_BOARD_IDENTITY,
      sectorId: C.sectorId, homeSectorId: C.sectorId, transientSector: false,
      name: 'ANCHOR BOARD', scanLabel: 'ANCHOR BOARD', role: 'world_site_hardware',
      packagedPropFile: 'places/place_lane_beacon.glb', packagedPropSlot: 'place',
      packagedPropRadius: radius, visualRadius: radius,
      combatProfileId: 'combat_profile_lantern_hardware', masslineTetherable: false,
      physicalCustodyOnly: true, loot: [], salvagePool: {}, lifetimeS: Infinity },
  };
}
