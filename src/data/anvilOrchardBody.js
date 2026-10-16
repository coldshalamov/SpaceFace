// New Forge reconstruction. Generated source geometry owns all physical coordinates.
import geometry from './anvilOrchardGeometry.json' with { type: 'json' };

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
export const ORCHARD_GEOMETRY = freeze(geometry);
export const ORCHARD_FRAME_BODY_ID = 'anvil-orchard:frame:source-v1';
export const ORCHARD_POD_BODY_ID = 'anvil-orchard:pod:source-v1';
export const ORCHARD_FRAME_RADIUS = geometry.radius;
export const ORCHARD_POD_RADIUS = geometry.pod.radius;

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid Orchard body revision');
  return value;
}
function manifest(id, parts, radius, glbHash) {
  return {
    schemaVersion: 1, id, referenceRadius: 'radius',
    sourceSha: geometry.sourceSha, sourceRevision: geometry.sourceRevision,
    sourceGlbSha256: glbHash,
    flags: { collides: true, renderable: false, targetable: false, radarVisible: false },
    // Root-local +Y-up source is projected into native XZ by the ordinary planar owner.
    // Never replace this set with a union hull: the sockets and inter-fin lanes are real gaps.
    // The ordinary manifest validator requires primitive query bounds. These are
    // conservative per-part bounds only; native contacts select convexParts below.
    primitives: parts.map(part => {
      const xs = part.points.map(p => p[0]), zs = part.points.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minZ = Math.min(...zs), maxZ = Math.max(...zs);
      return { id: part.id, kind: 'obb', x: (minX+maxX)/(2*radius),
        z: (minZ+maxZ)/(2*radius), hx: (maxX-minX)/(2*radius),
        hz: (maxZ-minZ)/(2*radius), angleDeg: 0 };
    }),
    convexParts: parts.map(part => ({
      id: part.id,
      points: part.points.map(([x,z]) => ({ x: x/radius, z: z/radius })),
      sourceMinY: part.minY, sourceMaxY: part.maxY,
    })),
  };
}

// The entity producer must also stamp data.masslineTetherable=false. Ordinary
// physics normalization adds a default anchor even when attachmentPoints is empty.
export function orchardFrameBodySpec(bodyRevision = 1) {
  return {
    schemaVersion: 1, dynamic: false, mass: 1000000, inertiaY: 2450000000,
    radius: ORCHARD_FRAME_RADIUS, visualRadius: ORCHARD_FRAME_RADIUS,
    revision: revision(bodyRevision), ccd: false, material: 'station', shape: 'compound',
    centerOfMass: { x: 0, y: 0, z: 0 }, thrusters: [], attachmentPoints: {},
    useMeasuredSkin: false, anchorRecoil: false,
    collisionProxyManifest: manifest(ORCHARD_FRAME_BODY_ID, geometry.parts,
      ORCHARD_FRAME_RADIUS, geometry.sourceGlbSha256),
  };
}

/** The existing owner changes fixed/dynamic custody and supplies each increasing revision. */
export function orchardPodBodySpec({ dynamic = false, revision: bodyRevision = 1 } = {}) {
  if (typeof dynamic !== 'boolean') throw new TypeError('Invalid Orchard pod dynamic mode');
  return {
    schemaVersion: 1, dynamic, mass: geometry.pod.mass, inertiaY: 16.2,
    radius: ORCHARD_POD_RADIUS, visualRadius: ORCHARD_POD_RADIUS,
    revision: revision(bodyRevision), ccd: true, material: 'pod', shape: 'compound',
    centerOfMass: { x: 0, y: 0, z: 0 }, thrusters: [], useMeasuredSkin: false,
    attachmentPoints: { massline: { x: 2, y: 0, z: 0 } },
    collisionProxyManifest: manifest(ORCHARD_POD_BODY_ID, geometry.pod.parts,
      ORCHARD_POD_RADIUS, geometry.pod.sourceGlbSha256),
  };
}
