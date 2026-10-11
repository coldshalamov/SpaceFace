import { LAST_ARGUMENT as C } from './lastArgument.js';

// The same authored footprints used by tools/build_last_argument.py. Positive X is the bow.
// Visual pieces remain separate. Native queries share one compact convex skin;
// the narrow seams between pieces are not navigable ship-sized passages.
export const LAST_ARGUMENT_FOOTPRINTS = Object.freeze([
  { id: 'keel', points: [[-158,-27],[-126,-38],[144,-17],[174,-8],[174,8],[144,17],[-126,38],[-158,27]] },
  { id: 'port_armour', points: [[-146,-76],[-95,-84],[148,-23],[122,-12],[-136,-24]] },
  { id: 'starboard_armour', points: [[-146,76],[-136,24],[122,12],[148,23],[-95,84]] },
  { id: 'port_battery', points: [[-82,-87],[37,-63],[36,-47],[-90,-68]] },
  { id: 'starboard_battery', points: [[-82,87],[-90,68],[36,47],[37,63]] },
]);
export const LAST_ARGUMENT_SOCKETS = Object.freeze({
  spine: [174, 5, 0], port: [-22, 6, -75], starboard: [-22, 6, 75],
  aft: [-162, 4, 0], tether: [153, 0, 0],
});
function convexEnvelope(points) {
  const sorted = points.map(p => ({x:p.x,z:p.z})).sort((a,b)=>a.x-b.x||a.z-b.z);
  const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  const half=rows=>{const out=[];for(const p of rows){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
  const lo=half(sorted),hi=half([...sorted].reverse());lo.pop();hi.pop();return lo.concat(hi);
}
export function lastArgumentPhysicalBody() {
  const convexParts = LAST_ARGUMENT_FOOTPRINTS.map(p => ({ id: p.id,
    points: p.points.map(([x,z]) => ({ x: x/C.radius, z: z/C.radius })) }));
  const primitives = convexParts.map(p => {
    const xs = p.points.map(q => q.x), zs = p.points.map(q => q.z);
    const a = Math.min(...xs), b = Math.max(...xs), c = Math.min(...zs), d = Math.max(...zs);
    return { kind: 'obb', id: p.id, x: (a+b)/2, z: (c+d)/2, hx: (b-a)/2, hz: (d-c)/2, angle: 0 };
  });
  // compactHull is the repository's supported exact planar skin path. An invented
  // convexParts field would be silently ignored by projectile/LOS queries.
  const compactHull=convexEnvelope([...convexParts.flatMap(p=>p.points),
    {x:-169/C.radius,z:-68.2/C.radius},{x:-169/C.radius,z:68.2/C.radius}]);
  return { schemaVersion: 1, dynamic: true, mass: C.mass, inertiaY: 210000000,
    radius: C.radius, revision: 0, ccd: true, material: 'ship', shape: 'compound',
    collisionProxyManifest: { schemaVersion: 1, id: 'last-argument:authored:v1',
      referenceRadius: 'radius', compactHull, primitives } };
}
export function lastArgumentFlightModel(base = {}) {
  const body = lastArgumentPhysicalBody();
  return { ...base, flightClass: 'capital', mass: body.mass, inertia: body.inertiaY,
    mainAccel: C.accel, reverseAccel: 1.8, strafeAccel: 0.7,
    maxSpeed: C.maxSpeed, maxYawRate: C.maxYawRate,
    angularAccel: 0.032, angularBrake: 0.075,
    normalMaxSpeedMult: 1, boostMult: 1, boostMaxSpeedMult: 1 };
}
export function isLastArgument(entity) { return entity?.type !== 'wreck' && entity?.data?.lootTableId === C.enemyId; }
/** Only called at the ordinary enemy-spec boundary, BEFORE spawn/physics admission. */
export function applyLastArgumentSpawnSpec(spec, enemyId) {
  if (enemyId !== C.enemyId) return spec;
  const body = lastArgumentPhysicalBody();
  spec.physicsBody = body; spec.mass = body.mass; spec.radius = body.radius;
  spec.visualRadius = C.radius; spec.maxSpeed = C.maxSpeed; spec.thrust = C.accel;
  spec.turnRate = C.maxYawRate;
  // Deliberately fixed encounter balance. Sector level is not another boss-health multiplier.
  spec.hull = spec.hullMax = C.hull; spec.armorHp = spec.armorMax = 340;
  spec.shield = spec.shieldMax = C.shield;
  spec.data ||= {}; spec.data.weapons = []; spec.weapons = [];
  spec.data.authoredAssetId = C.assetId;
  spec.data.combatProfileId = 'combat_profile_last_argument';
  spec.data.name = 'The Last Argument';
  spec.data.visualRadius = C.radius;
  spec.flightModel = lastArgumentFlightModel(spec.flightModel);
  if (spec.data.derived) spec.data.derived.flightModel = lastArgumentFlightModel(spec.data.derived.flightModel);
  return spec;
}
