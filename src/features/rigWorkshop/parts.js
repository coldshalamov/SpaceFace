// Rig Workshop: six already-authored yard pieces. All dimensions are world units.
// These are real bodies, never inferred build-stat bonuses. The open racks retain
// open collision mouths so a cargo pod can actually pass between their cheeks.
const box = (id, x, z, hx, hz) => Object.freeze({ kind: 'obb', id, x, z, hx, hz, angle: 0 });
const rack = Object.freeze([box('back', -.7, 0, .14, .75), box('port', 0, -.7, .72, .12), box('starboard', 0, .7, .72, .12)]);
const part = (id, label, placeId, radius, mass, hull, purpose, cue, primitives, extra = {}) => Object.freeze({
  id, label, placeId, radius, mass, hull, purpose, description: purpose, cue, cost: 1,
  collision: Object.freeze({ schemaVersion: 1, id: `rigWorkshop:${id}:v1`, referenceRadius: 'radius', primitives: Object.freeze(primitives) }),
  ...extra,
});
export const PARTS = Object.freeze({
  frame: part('frame', 'Keel frame', 'place_construction_frame', 10, 44, 160,
    'A stiff spine with four practical mounting faces.', 'Start here. Put weight on both sides to keep the tow straight.',
    [box('keel', 0, 0, .88, .22), box('crossbeam', 0, 0, .18, .70)]),
  hitch: part('hitch', 'Tow coupling', 'place_tanker_coupling', 5, 14, 100,
    'A clear tow point that leaves room for your ship.', 'Hitch at the rear: the ship pulls the whole rig without sitting inside it.',
    [box('coupling', 0, 0, .72, .48)]),
  cradle: part('cradle', 'Cargo cradle', 'place_container_rack', 13, 48, 180,
    'An open rack that cradles one awkward load.', 'Approach slowly with cargo inside the open mouth, then clamp it.', rack, { captureRadius: 22, cargoCapacity: 1 }),
  collector: part('collector', 'Scrap catcher', 'place_scrap_cage', 10, 35, 140,
    'Two capture points for gathering loose payloads.', 'Catch two small pieces; two loads also mean twice the inertia.', rack, { captureRadius: 18, cargoCapacity: 2 }),
  mover: part('mover', 'Powered mover', 'place_welding_drone', 6, 26, 110,
    'A reversible work drone bolted down as a drive.', 'A side-mounted motor turns the rig. Pair motors to balance the push.',
    [box('drive', 0, 0, .65, .45)], { thrust: 900 }),
  bumper: part('bumper', 'Sacrificial guard', 'place_power_skid_patched', 8, 65, 300,
    'A dense bumper that meets the obstacle before the cargo.', 'Heavy protection buys clearance at the cost of turning mass.',
    [box('guard', 0, 0, .32, .88)]),
});
export const PART_LIST = Object.freeze(Object.values(PARTS));
export const RIG_PARTS = PART_LIST;
export const MOUNTS = Object.freeze({
  front: Object.freeze({ label: 'Front', x: 1, z: 0, extension: 0 }),
  rear: Object.freeze({ label: 'Rear', x: -1, z: 0, extension: 0 }),
  port: Object.freeze({ label: 'Port side', x: 0, z: -1, extension: 0 }),
  starboard: Object.freeze({ label: 'Starboard side', x: 0, z: 1, extension: 0 }),
  reach: Object.freeze({ label: 'Extended front', x: 1, z: 0, extension: 10 }),
});
export const RIG_LIMITS = Object.freeze({ rigs: 2, partsPerRig: 8, cargoPerRig: 3, connectionsPerRig: 12, retiredParts: 24, bodyRecords: 64, editRadius: 150, captureSpeed: 8, attachRetries: 120 });
export const RIG_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'cradle', name: 'Tin Hand', purpose: 'A narrow salvage cradle with a sacrificial nose.',
    parts: Object.freeze([{ type: 'frame', x: 0, z: 0 }, { type: 'hitch', x: -18, z: 0 }, { type: 'cradle', x: 26, z: 0 }, { type: 'bumper', x: 0, z: -21 }]) }),
  Object.freeze({ id: 'sled', name: 'Yard Mule', purpose: 'A powered tow sled: two drive pods share the work.',
    parts: Object.freeze([{ type: 'frame', x: 0, z: 0 }, { type: 'hitch', x: -18, z: 0 }, { type: 'collector', x: 23, z: 0 }, { type: 'mover', x: -2, z: -19 }, { type: 'mover', x: -2, z: 19 }]) }),
]);
export const RIG_COMBAT_PROFILE = Object.freeze({
  id: 'combat_profile_rig_workshop', version: 1, entityTypes: ['payload'],
  heat: { max: 0, dissipationPerTick: 0 }, immunityTags: [], subsystemIds: [],
  sockets: [
    { id: 'rig_mount', tags: ['tether', 'transport_clamp'], localPos: [0, 0], maxAttachments: 32 },
    { id: 'rig_hitch', tags: ['tether_spool', 'tether'], localPos: [-.5, 0], maxAttachments: 4 },
  ],
  capabilities: { drive: false, weapon: false, sensor: false, tether: true, power: false, transport_clamp: true },
});
// This catalog admission only changes the authored restraint envelope. The existing
// combat attachment service and SG-02 owner still create, solve, warn, and break it.
export const RIG_ATTACHMENT_DEF = Object.freeze({
  id: 'rig_workshop_brace', version: 1,
  sourceSocketTags: ['tether'], targetSocketTags: ['tether'],
  ownership: { policy: 'initiator', transferable: false },
  break: { maxTension: 18000, maxImpulse: 2100, maxYank: 5000, graceTicks: 30 },
  spring: { K: 1200, zeta: 1.2, captureS: .25, maxStretchRatio: 1.2, maxForce: 22000 },
  limits: { maxPerOwner: 24 },
  cues: { created: 'combat.attachment.created', broken: 'combat.attachment.broken' },
});
export const RIG_CAPTURE_DEF = Object.freeze({
  id: 'rig_workshop_capture', version: 1,
  sourceSocketTags: ['transport_clamp'], targetSocketTags: ['tether'],
  ownership: { policy: 'initiator', transferable: false },
  break: { maxTension: 42000, maxImpulse: 4000, maxYank: 8000, graceTicks: 30 },
  spring: { K: 640, zeta: 1.15, captureS: .15, maxStretchRatio: .65 },
  limits: { maxPerOwner: 3 },
  cues: { created: 'combat.attachment.created', broken: 'combat.attachment.broken' },
});
export function partBodySpec(type, pos, metadata = {}) {
  const p = PARTS[type];
  if (!p) throw new RangeError(`Unknown workshop part: ${type}`);
  return {
    type: 'payload', pos, rot: Number(metadata.rot) || 0, radius: p.radius, mass: p.mass,
    hull: p.hull, hullMax: p.hull, collides: true, alive: true, ownerId: metadata.ownerId ?? null,
    physicsBody: { schemaVersion: 1, shape: 'ball', dynamic: true, radius: p.radius, mass: p.mass,
      inertiaY: p.mass * p.radius * p.radius / 3, ccd: true, material: 'metal', useMeasuredSkin: false,
      collisionProxyManifest: p.collision, contact: { friction: .45, restitution: .08, angularDamping: .12 }, revision: 0 },
    data: { kind: 'rigWorkshopPart', persistenceOwner: 'rigWorkshop', placeId: p.placeId, poi: true, placeTargetRadius: p.radius,
      scanLabel: p.label, masslineTetherable: true, transientSector: false, persistent: true,
      worldRecordId: metadata.partToken, rigWorkshopOwner: metadata.ownerId,
      combatProfileId: RIG_COMBAT_PROFILE.id,
      rigWorkshop: { rigId: metadata.rigId, partType: type, ownerId: metadata.ownerId, token: metadata.partToken } },
  };
}
