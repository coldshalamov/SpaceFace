import { ORCHARD_GEOMETRY as G } from '../data/anvilOrchardBody.js';
// Native observation support for the exact Orchard adapter. The default shared loader seals
// these installed-library dispatch identities before returning its runtime. Custom importers
// remain ordinary physics runtimes, but do not receive this adapter's trusted observation lane.
const SET_TYPES = Object.freeze({ bodies: 'RigidBodySet', colliders: 'ColliderSet', impulseJoints: 'ImpulseJointSet', multibodyJoints: 'MultibodyJointSet' });
const CLASS_NAMES = Object.freeze(['World', 'RigidBody', 'Collider', 'RigidBodySet', 'ColliderSet',
  'ImpulseJointSet', 'MultibodyJointSet', 'ImpulseJoint', 'UnitImpulseJoint', 'RevoluteImpulseJoint',
  'PrismaticImpulseJoint', 'FixedImpulseJoint', 'SphericalImpulseJoint', 'RopeImpulseJoint',
  'MultibodyJoint', 'UnitMultibodyJoint', 'RevoluteMultibodyJoint', 'PrismaticMultibodyJoint',
  'FixedMultibodyJoint', 'SphericalMultibodyJoint', 'VectorOps', 'RotationOps', 'RigidBodyDesc']);
const READ_METHODS = Object.freeze({
  bodies: new Set(['contains', 'len', 'rbTranslation', 'rbRotation', 'rbLinvel', 'rbAngvel', 'rbBodyType',
    'rbIsEnabled', 'rbIsCcdEnabled', 'rbIsSleeping', 'rbGravityScale', 'rbNumColliders', 'rbCollider',
    'rbMass', 'rbLocalCom', 'rbPrincipalInertia', 'rbPrincipalInertiaLocalFrame', 'rbEffectiveInvMass',
    'rbEffectiveWorldInvInertia', 'rbLinearDamping', 'rbAngularDamping', 'rbVelocityAtPoint']),
  colliders: new Set(['contains', 'len', 'coParent', 'coTranslationWrtParent', 'coRotationWrtParent', 'coShapeType',
    'coVertices', 'coHalfExtents', 'coRadius', 'coHalfHeight', 'coRoundRadius', 'coIsEnabled', 'coIsSensor',
    'coCollisionGroups', 'coSolverGroups', 'coContactSkin', 'coDensity', 'coFriction', 'coRestitution',
    'coActiveCollisionTypes', 'coFrictionCombineRule', 'coRestitutionCombineRule']),
  impulseJoints: new Set(['contains', 'len', 'forEachJointHandle', 'forEachJointAttachedToRigidBody',
    'jointBodyHandle1', 'jointBodyHandle2', 'jointType', 'jointAnchor1', 'jointAnchor2', 'jointFrameX1', 'jointFrameX2', 'jointContactsEnabled']),
  multibodyJoints: new Set(['contains', 'forEachJointHandle', 'forEachJointAttachedToRigidBody',
    'jointType', 'jointAnchor1', 'jointAnchor2', 'jointFrameX1', 'jointFrameX2', 'jointContactsEnabled']),
});
const own = (object, key) => Object.getOwnPropertyDescriptor(object, key);
const value = (object, key) => {
  const descriptor = object && own(object, key);
  if (!descriptor || !('value' in descriptor)) throw new Error(`orchard_native_storage:${key}`);
  return descriptor.value;
};
const sameDescriptor = (a, b) => a && b && a.value === b.value && a.get === b.get && a.set === b.set
  && a.writable === b.writable && a.enumerable === b.enumerable && a.configurable === b.configurable;
// Ordinary stations and other default-shaped bodies may have no authored override:
// A staged rebuild normalizes scratch entities before rebinding records to the
// originals. Observe that exact absence rather than inventing authoring, and
// never invoke an inherited getter.
const optionalOwnData = (object, key) => {
  const descriptor = object && own(object, key);
  if (descriptor ? !('value' in descriptor) : !object || key in object) {
    throw new Error(`orchard_native_storage:${key}`);
  }
  return descriptor || null;
};
const optionalOwnDataCurrent = (object, key, descriptor, prototype) => {
  if (Object.getPrototypeOf(object) !== prototype) return false;
  const current = optionalOwnData(object, key);
  return descriptor === null ? current === null : sameDescriptor(current, descriptor);
};
const signatures = objects => Object.freeze([...new Set(objects)].map(object => {
  const descriptors = Object.getOwnPropertyDescriptors(object);
  for (const key of Reflect.ownKeys(descriptors)) Object.freeze(descriptors[key]);
  return Object.freeze({ object, prototype: Object.getPrototypeOf(object), descriptors: Object.freeze(descriptors) });
}));
function unchanged(rows) {
  return rows.every(row => Object.getPrototypeOf(row.object) === row.prototype
    && Reflect.ownKeys(row.object).length === Reflect.ownKeys(row.descriptors).length
    && Reflect.ownKeys(row.descriptors).every(key => sameDescriptor(own(row.object, key), row.descriptors[key])));
}
function chain(object) {
  const out = [];
  for (let p = object; p && p !== Object.prototype && p !== Function.prototype; p = Object.getPrototypeOf(p)) out.push(p);
  return out;
}
function method(object, name) {
  for (const prototype of chain(object)) {
    const descriptor = own(prototype, name);
    if (descriptor) {
      if (typeof descriptor.value !== 'function') throw new Error(`orchard_native_dispatch:${name}`);
      return descriptor.value;
    }
  }
  throw new Error(`orchard_native_missing:${name}`);
}
function instanceSurface(object, prototype) {
  if (!object || Object.getPrototypeOf(object) !== prototype) return false;
  for (const parent of chain(prototype)) {
    for (const key of Reflect.ownKeys(parent)) {
      if (key !== 'constructor' && Object.hasOwn(object, key)) return false;
    }
  }
  return true;
}

/** Loader-only result storage supplies provenance; calling this alone grants no owner authority. */
export function captureOrchardRapierBaseline(R) {
  const resources = [], objects = [], raw = {}, maps = {}, temporarySets = {};
  try {
    const runtime = Object.freeze(CLASS_NAMES.filter(name => typeof R[name] === 'function')
      .map(name => Object.freeze([name, R[name], Object.freeze(own(R, name))])));
    for (const [, Class] of runtime) objects.push(Class, ...chain(Class.prototype));
    for (const [key, name] of Object.entries(SET_TYPES)) {
      const set = new R[name](); resources.push(set); temporarySets[key]=set;
      raw[key] = Object.getPrototypeOf(set.raw); maps[key] = Object.getPrototypeOf(set.map);
      objects.push(...chain(raw[key]), raw[key].constructor, ...chain(maps[key]), maps[key].constructor);
    }
    const vector = R.VectorOps.intoRaw({ x: 0, y: 0, z: 0 }); resources.push(vector);
    const rotation = R.RotationOps.intoRaw({ x: 0, y: 0, z: 0, w: 1 }); resources.push(rotation);
    const vectorPrototype = Object.getPrototypeOf(vector), rotationPrototype = Object.getPrototypeOf(rotation);
    objects.push(...chain(vectorPrototype), vectorPrototype.constructor, ...chain(rotationPrototype), rotationPrototype.constructor);
    // Capture the installed matrix conversion before runtime exposure, using the already
    // private temporary sets. No World, SG02 owner or solver is created.
    const temporaryBody=temporarySets.bodies.createRigidBody(temporarySets.colliders,R.RigidBodyDesc.dynamic());
    const matrix=temporarySets.bodies.raw.rbEffectiveWorldInvInertia(temporaryBody.handle);resources.push(matrix);
    const matrixPrototype=Object.getPrototypeOf(matrix);
    objects.push(...chain(matrixPrototype),matrixPrototype.constructor);
    const matrixElements=method(matrixPrototype,'elements'),matrixFree=method(matrixPrototype,'free');
    const vectorIntoRaw=method(R.VectorOps,'intoRaw');
    const rows = signatures(objects);
    const rawMethods = Object.fromEntries(Object.entries(raw).map(([key, prototype]) => [key,
      Object.fromEntries(Reflect.ownKeys(prototype).filter(name => typeof own(prototype, name).value === 'function')
        .map(name => [name, own(prototype, name).value]))]));
    const vectorReads = Object.fromEntries(['x', 'y', 'z'].map(key => [key, own(vectorPrototype, key).get]));
    const rotationReads = Object.fromEntries(['x', 'y', 'z', 'w'].map(key => [key, own(rotationPrototype, key).get]));
    for (const methods of Object.values(rawMethods)) Object.freeze(methods);
    return Object.freeze({ observationEnabled:!!mutatorInstallations.get(R)?.every(row=>sameDescriptor(own(row.prototype,row.name),row.installed)), runtime, rows, raw: Object.freeze(raw), rawMethods: Object.freeze(rawMethods), maps: Object.freeze(maps),
      constants: Object.freeze({ ShapeType: Object.freeze({ ...R.ShapeType }), RigidBodyType: Object.freeze({ ...R.RigidBodyType }), ActiveCollisionTypes: Object.freeze({ ...R.ActiveCollisionTypes }), CoefficientCombineRule: Object.freeze({ ...R.CoefficientCombineRule }) }),
      vectorPrototype, rotationPrototype, vectorReads: Object.freeze(vectorReads), rotationReads: Object.freeze(rotationReads),
      vectorFree: method(vectorPrototype, 'free'), rotationFree: method(rotationPrototype, 'free'),
      matrixPrototype,matrixElements,matrixFree,vectorIntoRaw });
  } finally {
    // Temporary raw resources and the disposable body inside its set are released here.
    // No World, SG02 owner, collider or solver was allocated.
    let cleanupError=null;
    for (let i=resources.length-1;i>=0;i--)try{resources[i].free();}catch(error){cleanupError ||= error;}
    if(cleanupError)throw cleanupError;
  }
}

/** Constructed at the existing owner boundary. It never replaces caller methods. */
export function createOrchardNativeLane(R, world, baseline) {
  if (!baseline) return null;
  try {
    const sets = {};
    for (const key of Object.keys(SET_TYPES)) {
      const set = value(world, key), raw = value(set, 'raw'), map = value(set, 'map');
      sets[key] = { set, raw, map, data: value(map, 'data'), pointer: value(raw, '__wbg_ptr') };
    }
    const verify = () => {
      if (!baseline.runtime.every(([name, , descriptor]) => sameDescriptor(own(R, name), descriptor)) || !unchanged(baseline.rows)
        || !instanceSurface(world, R.World.prototype)) return false;
      return Object.entries(sets).every(([key, row]) => value(world, key) === row.set
        && instanceSurface(row.set, R[SET_TYPES[key]].prototype)
        && value(row.set, 'raw') === row.raw && Object.getPrototypeOf(row.raw) === baseline.raw[key]
        && value(row.raw, '__wbg_ptr') === row.pointer && row.pointer !== 0
        && instanceSurface(row.raw, baseline.raw[key]) && value(row.set, 'map') === row.map
        && instanceSurface(row.map, baseline.maps[key]) && value(row.map, 'data') === row.data
        && Array.isArray(row.data) && Object.getPrototypeOf(row.data) === Array.prototype);
    };
    if (!verify()) return null;
    const rawRead = (key, name, ...args) => {
      if (!READ_METHODS[key]?.has(name)) throw new Error('orchard_native_read_only');
      const row = sets[key], dispatch = baseline.rawMethods[key]?.[name];
      if (!row || !dispatch || value(world, key) !== row.set || value(row.set, 'raw') !== row.raw
        || value(row.raw, '__wbg_ptr') !== row.pointer || row.pointer === 0) throw new Error('orchard_native_lane_retired');
      return dispatch.call(row.raw, ...args);
    };
    const convertNative = (native,isRotation=false) => {
      if (!native) return null;
      const prototype = isRotation ? baseline.rotationPrototype : baseline.vectorPrototype;
      const readers = isRotation ? baseline.rotationReads : baseline.vectorReads;
      const free = isRotation ? baseline.rotationFree : baseline.vectorFree;
      try {
        if (!instanceSurface(native, prototype) || !Number.isFinite(value(native, '__wbg_ptr'))) throw new Error('orchard_native_conversion_changed');
        return Object.fromEntries(Object.entries(readers).map(([key, get]) => [key, get.call(native)]));
      } finally { free.call(native); }
    };
    const converted=(key,name,handle,isRotation=false)=>convertNative(rawRead(key,name,handle),isRotation);
    const convertedMatrix=(handle)=>{
      const native=rawRead('bodies','rbEffectiveWorldInvInertia',handle);
      if(!native)return null;
      try{
        if(!instanceSurface(native,baseline.matrixPrototype) || !Number.isFinite(value(native,'__wbg_ptr')))throw Error('orchard_native_matrix_changed');
        const elements=baseline.matrixElements.call(native);
        if(Object.getPrototypeOf(elements)!==Float32Array.prototype || elements.length!==6)throw Error('orchard_native_matrix_storage');
        return [elements[0],elements[1],elements[2],elements[3],elements[4],elements[5]];
      }finally{baseline.matrixFree.call(native);}
    };
    const pointVelocity=(handle,point)=>{
      const x=value(point,'x'),y=value(point,'y'),z=value(point,'z');
      if(![x,y,z].every(Number.isFinite))throw Error('orchard_native_point');
      const native=baseline.vectorIntoRaw.call(R.VectorOps,{x,y,z});
      try{
        if(!instanceSurface(native,baseline.vectorPrototype))throw Error('orchard_native_point_dispatch');
        return convertNative(rawRead('bodies','rbVelocityAtPoint',handle,native));
      }finally{baseline.vectorFree.call(native);}
    };
    const fconv = new Float64Array(1), uconv = new Uint32Array(fconv.buffer);
    const matchesObject = (key, object, handle) => {
      const Class = key === 'bodies' ? R.RigidBody : R.Collider;
      if (!instanceSurface(object, Class.prototype) || value(object, 'handle') !== handle
        || value(object, 'colliderSet') !== sets.colliders.set) return false;
      if (key === 'bodies' && value(object, 'rawSet') !== sets.bodies.raw) return false;
      fconv[0] = handle;
      return own(sets[key].data, String(uconv[0]))?.value === object;
    };
    return Object.freeze({ world, observationEnabled:baseline.observationEnabled, verify, rawRead, converted, convertedMatrix, pointVelocity, matchesObject, constants: baseline.constants, sets });
  } catch (_) { return null; }
}

export const ORCHARD_QUERY_LIMITS = Object.freeze({ bodies: 1024, colliders: 8192, vertices: 65536, verticesPerHull: 2048, joints: 4096 });
const fail = reason => { throw new Error(`orchard_query:${reason}`); };
const transformPoint = (p, q, t) => {
  const x = 2 * (q.y * p.z - q.z * p.y), y = 2 * (q.z * p.x - q.x * p.z), z = 2 * (q.x * p.y - q.y * p.x);
  return { x: p.x + q.w * x + q.y * z - q.z * y + t.x,
    y: p.y + q.w * y + q.z * x - q.x * z + t.y,
    z: p.z + q.w * z + q.x * y - q.y * x + t.z };
};
const finitePose = (p, rotation = false) => p && ['x', 'y', 'z', ...(rotation ? ['w'] : [])].every(key => Number.isFinite(p[key]));

/** Prepare all JS ownership/source facts BEFORE the callback-free scan. Returned input is
 * private copied storage. The caller finishes its authored preflight before invoking scan. */
export function prepareOrchardNativeObservation(owner, lane, sourceRecord = null) {
  if (!lane || lane.world !== owner.world) fail('untrusted_runtime');
  const world = owner.world, records = owner.records, owners = owner._colliderOwners, queue = owner._eventQueue;
  if (Object.getOwnPropertyDescriptor(Map.prototype,'size').get.call(records) > ORCHARD_QUERY_LIMITS.bodies) fail('body_budget');
  const rows = [], handles = new Set(), colliderHandles = new Set();
  for (const [id, rec] of sourceRecord ? [[sourceRecord.entity.id,sourceRecord]] : records) {
    const body = value(rec, 'body'), entity = value(rec, 'entity'), spec = value(rec, 'spec');
    const array = value(rec, 'colliders'), handle = value(body, 'handle');
    if (!Array.isArray(array) || handles.has(handle)) fail('body_identity');
    handles.add(handle);
    const cols = array.map(collider => {
      const h = value(collider, 'handle'), entry = owners.get(h);
      if (!entry || value(entry, 'rec') !== rec || value(entry, 'collider') !== collider || colliderHandles.has(h)) fail('collider_identity');
      colliderHandles.add(h); return { collider, handle: h, entry };
    });
    rows.push({ id, rec, body, entity, spec, array, handle, cols, life:value(entity,'occupantGeneration'),data:value(entity,'data'),authored:optionalOwnData(entity,'physicsBody'),prototype:Object.getPrototypeOf(entity) });
  }
  // The ordinary owner keeps disabled projectile allocations for reuse. They remain in
  // native inventory and must remain disabled; an arbitrary extra body is never omitted.
  const pooled = [];
  for (const bucket of sourceRecord ? [] : owner._ghostProjectilePool.values()) for (const entry of bucket) {
    const body = entry.body, handle = value(body, 'handle');
    if (handles.has(handle)) fail('pooled_body_identity');
    handles.add(handle);
    const cols = entry.colliders.map(collider => {
      const h = value(collider, 'handle'); if (colliderHandles.has(h)) fail('pooled_collider_identity');
      colliderHandles.add(h); return { collider, handle: h };
    });
    pooled.push({ body, handle, cols, pooled: true });
  }
  if (handles.size > ORCHARD_QUERY_LIMITS.bodies || colliderHandles.size > ORCHARD_QUERY_LIMITS.colliders) fail('inventory_budget');
  const copied = [...rows, ...pooled];
  const current = () => value(owner,'world') === world && value(owner,'records') === records && value(owner,'_colliderOwners') === owners
    && value(owner,'_eventQueue') === queue && (sourceRecord || Object.getOwnPropertyDescriptor(Map.prototype,'size').get.call(records) === rows.length) && rows.every(r => Map.prototype.get.call(records,r.id) === r.rec
      && value(r.rec, 'body') === r.body && value(r.rec, 'entity') === r.entity && value(r.rec, 'spec') === r.spec
      && value(r.entity,'occupantGeneration')===r.life && value(r.entity,'data')===r.data && optionalOwnDataCurrent(r.entity,'physicsBody',r.authored,r.prototype)
      && value(r.rec, 'colliders') === r.array && value(r.array,'length') === r.cols.length
      && r.cols.every((c, i) => value(r.array,String(i)) === c.collider && Map.prototype.get.call(owners,c.handle) === c.entry
        && value(c.entry, 'rec') === r.rec && value(c.entry, 'collider') === c.collider));
  const scan = () => {
    if (!current() || !lane.verify() || copied.some(r => !lane.matchesObject('bodies', r.body, r.handle)
      || r.cols.some(c => !lane.matchesObject('colliders', c.collider, c.handle)))) fail('native_dispatch_changed');
    // No entity/source/owner getter follows this point. Native storage links and all actual
    // native properties are observed through captured read functions and copied handles.
    if (!sourceRecord && (lane.rawRead('bodies', 'len') !== copied.length || lane.rawRead('colliders', 'len') !== colliderHandles.size)) fail('unowned_native_objects');
    const output = [], byHandle = new Map(); let vertexCount = 0;
    for (const row of copied) {
      if (!lane.rawRead('bodies', 'contains', row.handle)) fail('retired_body');
      const t = lane.converted('bodies', 'rbTranslation', row.handle), q = lane.converted('bodies', 'rbRotation', row.handle, true);
      const v = lane.converted('bodies', 'rbLinvel', row.handle), w = lane.converted('bodies', 'rbAngvel', row.handle);
      if (!finitePose(t) || !finitePose(q, true) || !finitePose(v) || !finitePose(w)) fail('nonfinite_body');
      const body = { object: row.body, handle: row.handle, t, q, v, w,
        ccd: lane.rawRead('bodies', 'rbIsCcdEnabled', row.handle), gravityScale: lane.rawRead('bodies', 'rbGravityScale', row.handle),
        enabled: lane.rawRead('bodies', 'rbIsEnabled', row.handle), type: lane.rawRead('bodies', 'rbBodyType', row.handle),
        mass:lane.rawRead('bodies','rbMass',row.handle),localCom:lane.converted('bodies','rbLocalCom',row.handle),
        principalInertia:lane.converted('bodies','rbPrincipalInertia',row.handle),principalFrame:lane.converted('bodies','rbPrincipalInertiaLocalFrame',row.handle,true),
        effectiveInvMass:lane.converted('bodies','rbEffectiveInvMass',row.handle),effectiveInvInertia:lane.convertedMatrix(row.handle),
        linearDamping:lane.rawRead('bodies','rbLinearDamping',row.handle),angularDamping:lane.rawRead('bodies','rbAngularDamping',row.handle),colliders: [] };
      if (row.pooled && body.enabled) fail('active_pooled_body');
      if (lane.rawRead('bodies', 'rbNumColliders', row.handle) !== row.cols.length) fail('body_colliders_changed');
      for (let i = 0; i < row.cols.length; i++) {
        const c = row.cols[i], h = c.handle;
        if (!lane.rawRead('colliders', 'contains', h) || lane.rawRead('colliders', 'coParent', h) !== row.handle
          || lane.rawRead('bodies', 'rbCollider', row.handle, i) !== h) fail('collider_parent_changed');
        const local = lane.converted('colliders', 'coTranslationWrtParent', h), rotation = lane.converted('colliders', 'coRotationWrtParent', h, true);
        if (!finitePose(local) || !finitePose(rotation, true)) fail('nonfinite_collider');
        const shape = lane.rawRead('colliders', 'coShapeType', h), vertices = lane.rawRead('colliders', 'coVertices', h);
        if (vertices && (vertices.length % 3 || vertices.length / 3 > ORCHARD_QUERY_LIMITS.verticesPerHull
          || (vertexCount += vertices.length / 3) > ORCHARD_QUERY_LIMITS.vertices)) fail('vertex_budget');
        const collider = { object: c.collider, handle: h, body, local, rotation, shape,
          enabled: lane.rawRead('colliders', 'coIsEnabled', h), sensor: lane.rawRead('colliders', 'coIsSensor', h),
          groups: lane.rawRead('colliders', 'coCollisionGroups', h), skin: lane.rawRead('colliders', 'coContactSkin', h),
          density: lane.rawRead('colliders', 'coDensity', h), friction: lane.rawRead('colliders', 'coFriction', h),
          restitution: lane.rawRead('colliders', 'coRestitution', h), solverGroups: lane.rawRead('colliders', 'coSolverGroups', h),
          activeTypes: lane.rawRead('colliders', 'coActiveCollisionTypes', h),
          frictionRule: lane.rawRead('colliders', 'coFrictionCombineRule', h), restitutionRule: lane.rawRead('colliders', 'coRestitutionCombineRule', h), vertices: vertices && [...vertices],
          halfExtents: lane.converted('colliders', 'coHalfExtents', h), radius: lane.rawRead('colliders', 'coRadius', h),
          halfHeight: lane.rawRead('colliders', 'coHalfHeight', h), roundRadius: lane.rawRead('colliders', 'coRoundRadius', h) };
        if (!Number.isFinite(collider.skin) || collider.skin < 0 || collider.vertices?.some(v => !Number.isFinite(v))) fail('collider_values');
        body.colliders.push(collider);
      }
      output.push(body); byHandle.set(row.handle, body);
    }
    const joints = [];
    for (const key of ['impulseJoints', 'multibodyJoints']) {
      const hs = []; lane.rawRead(key, 'forEachJointHandle', h => hs.push(h));
      if (hs.length + joints.length > ORCHARD_QUERY_LIMITS.joints) fail('joint_budget');
      for (const handle of hs) {
        const endpoints = key === 'impulseJoints'
          ? [lane.rawRead(key, 'jointBodyHandle1', handle), lane.rawRead(key, 'jointBodyHandle2', handle)] : null;
        joints.push({ kind: key, handle, endpoints });
      }
    }
    const attached = new Map();
    for (const row of copied) {
      const list = [];
      for (const key of ['impulseJoints', 'multibodyJoints']) lane.rawRead(key, 'forEachJointAttachedToRigidBody', row.handle, handle => list.push([key, handle]));
      attached.set(row.handle, list);
    }
    return { bodies: output, byHandle, joints, attached };
  };
  return { current, scan, rows };
}

/** Build current projected support geometry from fresh local native poses, never stale
 * collider world-transform caches. Every omitted 3D dimension only makes this conservative. */
export function orchardColliderProjection(collider, constants, parentLocal = false) {
  const shape = constants.ShapeType, vertices = [], unit = { x: 0, y: 0, z: 0 };
  let round = collider.skin;
  if (collider.shape === shape.Ball) { vertices.push(unit); round += collider.radius; }
  else if (collider.shape === shape.Capsule) {
    vertices.push({ x: 0, y: collider.halfHeight, z: 0 }, { x: 0, y: -collider.halfHeight, z: 0 }); round += collider.radius;
  } else if (collider.shape === shape.Cuboid || collider.shape === shape.RoundCuboid) {
    const h = collider.halfExtents; if (!finitePose(h)) fail('cuboid');
    for (const x of [-h.x, h.x]) for (const y of [-h.y, h.y]) for (const z of [-h.z, h.z]) vertices.push({ x, y, z });
    if (collider.shape === shape.RoundCuboid) round += collider.roundRadius;
  } else if (collider.shape === shape.ConvexPolyhedron || collider.shape === shape.RoundConvexPolyhedron) {
    if (!collider.vertices?.length) fail('convex');
    for (let i = 0; i < collider.vertices.length; i += 3) vertices.push({ x: collider.vertices[i], y: collider.vertices[i + 1], z: collider.vertices[i + 2] });
    if (collider.shape === shape.RoundConvexPolyhedron) round += collider.roundRadius;
  } else fail('unsupported_shape');
  if (!Number.isFinite(round) || round < 0) fail('shape_radius');
  const points = vertices.map(p => {
    const local = transformPoint(p, collider.rotation, collider.local);
    const output = parentLocal ? local : transformPoint(local, collider.body.q, collider.body.t);
    return [output.x, output.z];
  });
  return { points, round };
}

const cross2 = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function orchardConvexHull(points) {
  const rows = [...new Map(points.map(p => [p.join(','), p])).values()].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  if (rows.length < 3) return rows;
  const half = input => { const out=[]; for (const p of input) {
    while (out.length > 1 && cross2(out.at(-2),out.at(-1),p) <= 0) out.pop(); out.push(p);
  } return out; };
  return [...half(rows).slice(0,-1), ...half(rows.toReversed()).slice(0,-1)];
}
function segmentDistance(p,a,b) {
  const dx=b[0]-a[0], dz=b[1]-a[1], length=dx*dx+dz*dz;
  const t=length ? Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length)) : 0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
}
function pointInside(p,hull) { return hull.length>=3 && hull.every((a,i)=>cross2(a,hull[(i+1)%hull.length],p)>=0); }
function segmentsMeet(a,b,c,d) {
  const ac=cross2(a,b,c), ad=cross2(a,b,d), ca=cross2(c,d,a), cb=cross2(c,d,b);
  return ac*ad<=0 && ca*cb<=0 && Math.max(a[0],b[0])>=Math.min(c[0],d[0])
    && Math.max(c[0],d[0])>=Math.min(a[0],b[0]) && Math.max(a[1],b[1])>=Math.min(c[1],d[1])
    && Math.max(c[1],d[1])>=Math.min(a[1],b[1]);
}
export function orchardHullDistance(left,right) {
  const a=orchardConvexHull(left), b=orchardConvexHull(right);
  if (!a.length || !b.length) fail('empty_projection');
  if (pointInside(a[0],b) || pointInside(b[0],a)) return 0;
  let result=Infinity;
  for (let i=0;i<a.length;i++) for(let j=0;j<b.length;j++) {
    const aa=a[i], ab=a[(i+1)%a.length], ba=b[j], bb=b[(j+1)%b.length];
    if(segmentsMeet(aa,ab,ba,bb)) return 0;
    result=Math.min(result,segmentDistance(aa,ba,bb),segmentDistance(ba,aa,ab));
  }
  return result;
}
const interactions = (a,b) => ((a>>>16)&b&0xffff)!==0 && ((b>>>16)&a&0xffff)!==0;
const floatPadding = points => 8 * 2 ** -23 * Math.max(1,...points.flat().map(Math.abs));

// Only the source-certified internal pin/sleeve pair can use this planar domain.
// The caller has already validated the full current source against G. Separate native
// parents always retain complete conservative proxies, including the bearing volume.
function sourceBearingPairs() {
  if (!G.bearingDomains) return new Map();
  if (G.bearingContractRevision!=='orchard-internal-bearing-domain-v1'
    || G.bearingDomains.length!==6) return null;
  const result=new Map(),fixedParts=new Set();
  for (const domain of G.bearingDomains) {
    const rig=G.rigs.find(r=>r.bearingDomainId===domain.id);
    const fixedIndex=G.parts.findIndex(p=>p.id===domain.fixedPartId);
    const movingIndex=G.parts.findIndex(p=>p.id===domain.movingPartId);
    const box=domain.planarBox, pivot=domain.pivot;
    if (!rig || !Number.isInteger(rig.socket) || rig.socket<0 || rig.socket>2
      || !['port','starboard'].includes(rig.side)
      || domain.id!==`orchard_s${rig.socket}_${rig.side}_bearing`
      || domain.fixedPartId!==`s${rig.socket}-shoulder-${rig.side}`
      || domain.movingPartId!==`s${rig.socket}-jaw-${rig.side}`
      || rig.partId!==domain.movingPartId || fixedIndex<0 || movingIndex<0
      || G.rigs.some(r=>r.partId===domain.fixedPartId) || result.has(movingIndex) || fixedParts.has(fixedIndex)
      || domain.nativeY!=='full-owner-planar-prism-extrusion'
      || !finitePose(pivot) || ['x','y','z'].some(k=>pivot[k]!==rig.pivot[k])
      || !box || box.minX!==pivot.x-.70 || box.maxX!==pivot.x+.70
      || box.minZ!==pivot.z-.70 || box.maxZ!==pivot.z+.70) return null;
    result.set(movingIndex,{fixedIndex,rig,box});fixedParts.add(fixedIndex);
  }
  return result.size===6 ? result : null;
}
// A future unsupported source contract refuses only opted-in clearance. It cannot
// make ordinary physics bootstrap fail while importing this optional query module.
const bearingPairs=sourceBearingPairs();
const poseNear=(a,b)=>Number.isFinite(a) && Math.abs(a-b)<=8*2**-23*Math.max(1,Math.abs(b));
function bearingPoseProgress(pose,rig) {
  const q=pose.rotation,t=pose.local || pose.translation;
  if (!finitePose(q,true) || !finitePose(t) || !poseNear(q.x,0) || !poseNear(q.z,0)) return null;
  const angle=2*Math.atan2(q.y,q.w), n=Math.round(angle/(rig.yawSign*Math.PI/60));
  if(n<0 || n>30) return null;
  const a=rig.yawSign*n*Math.PI/60,c=Math.cos(a),s=Math.sin(a),p=rig.pivot;
  return poseNear(q.y,Math.sin(a/2)) && poseNear(q.w,Math.cos(a/2)) && poseNear(t.y,0)
    && poseNear(t.x,p.x-c*p.x-s*p.z) && poseNear(t.z,p.z+s*p.x-c*p.z) ? n : null;
}
function clipHalfPlane(points,axis,edge,sign) {
  const output=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length], da=sign*(a[axis]-edge),db=sign*(b[axis]-edge);
    if(da>=0) output.push(a);
    if((da<0 && db>0) || (da>0 && db<0)) {
      const t=da/(da-db);output.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);
    }
  }
  return orchardConvexHull(output);
}
function bearingOutsidePieces(projected,box,reserve) {
  // Contract the exception domain before clipping: inflation of an inside fixed
  // point cannot escape the source-certified box without being checked outside it.
  const hull=orchardConvexHull(projected.points);
  return [[0,box.minX+reserve,-1],[0,box.maxX-reserve,1],
    [1,box.minZ+reserve,-1],[1,box.maxZ-reserve,1]]
    .map(([axis,edge,sign])=>clipHalfPlane(hull,axis,edge,sign)).filter(p=>p.length);
}

/** Operator-split clearance: ordinary solving has finished with the old jaws. This
 * certifies the next angular slice against fresh stationary post-solve peers. It does
 * not claim continuous motion of those peers during the earlier ordinary solve. */
export function orchardPairClearance(observation, sourceHandle, moves, constants, bearingGeometry = null) {
  if(bearingGeometry!==null && bearingGeometry!==G) fail('bearing_source');
  const frame=observation.byHandle.get(sourceHandle);
  if(!frame?.enabled || moves.length!==2 || new Set(moves.map(m=>m.index)).size!==2) fail('moving_pair');
  const moving=new Map(moves.map(move=>[frame.colliders[move.index]?.handle,move]));
  const domains=new Map();
  if(bearingGeometry && !bearingPairs) fail('bearing_source');
  if(bearingGeometry && bearingPairs.size) {
    if(frame.type!==constants.RigidBodyType.Fixed || frame.colliders.length!==G.parts.length) fail('bearing_source');
    for(const move of moves) {
      const pair=bearingPairs.get(move.index),collider=frame.colliders[move.index];
      if(!pair || ['x','y','z'].some(k=>move.pivot?.[k]!==pair.rig.pivot[k])) fail('bearing_pair');
      const from=bearingPoseProgress(collider,pair.rig),to=bearingPoseProgress(move,pair.rig);
      if(from===null || to===null || Math.abs(to-from)!==1
        || Math.abs(move.angle-(to-from)*pair.rig.yawSign*Math.PI/60)>1e-12) fail('bearing_motion');
      domains.set(collider.handle,pair);
    }
  }
  if(moving.has(undefined)) fail('moving_index');
  function sweep(collider,move,parentLocal) {
    const start=orchardColliderProjection(collider,constants,parentLocal);
    const end=orchardColliderProjection({...collider,local:move.translation,rotation:move.rotation},constants,parentLocal);
    if(!Number.isFinite(move.angle) || Math.abs(move.angle)>Math.PI/60+1e-12 || !finitePose(move.pivot)) fail('moving_angle');
    let radius=0;
    for(let i=0;i<collider.vertices.length;i+=3) radius=Math.max(radius,Math.hypot(collider.vertices[i]-move.pivot.x,collider.vertices[i+2]-move.pivot.z));
    const points=orchardConvexHull([...start.points,...end.points]);
    // The convex hull of endpoint support contains each chord; the sagitta contains
    // the intervening arc. Native f32 geometry and each body's transform reserve remain.
    return {points,round:Math.max(start.round,end.round)+radius*(1-Math.cos(Math.abs(move.angle)/2))+floatPadding(points)};
  }
  let minimum=Infinity, blocker=null;
  for(const [handle,move] of moving) {
    const collider=frame.colliders[move.index];
    for(const body of observation.bodies) {
      if(!body.enabled) continue;
      const sameParent=body.object===frame.object;
      const swept=sweep(collider,move,sameParent);
      for(const peer of body.colliders) {
        if(peer.handle===handle || !peer.enabled || peer.sensor || !interactions(collider.groups,peer.groups)) continue;
        const peerMove=sameParent && moving.get(peer.handle);
        const projected=peerMove ? sweep(peer,peerMove,true) : orchardColliderProjection(peer,constants,sameParent);
        const padding=peerMove ? 0 : floatPadding(projected.points);
        const domain=domains.get(handle);
        const pieces=sameParent && !peerMove && domain && peer===frame.colliders[domain.fixedIndex]
          ? bearingOutsidePieces(projected,domain.box,projected.round+padding) : [projected.points];
        for(const points of pieces) {
          const clearance=orchardHullDistance(swept.points,points)-swept.round-projected.round-padding;
          if(clearance<minimum) {minimum=clearance;blocker=peer.handle;}
        }
      }
    }
  }
  return Object.freeze({ clear: minimum>0, minimum, blocker:minimum>0?null:blocker });
}

// Installed Rapier 0.19 public mutation inventory. This is an explicit dependency
// contract, not a promise that a name prefix recognizes mutators in future versions.
export const ORCHARD_PUBLIC_MUTATORS = Object.freeze({
  World: Object.freeze(['step']),
  RigidBody: Object.freeze(['finalizeDeserialization','lockTranslations','lockRotations','setEnabledTranslations',
    'restrictTranslations','setEnabledRotations','restrictRotations','setDominanceGroup','setAdditionalSolverIterations',
    'enableCcd','setSoftCcdPrediction','setTranslation','setLinvel','setGravityScale','setRotation','setAngvel',
    'setNextKinematicTranslation','setNextKinematicRotation','sleep','wakeUp','setEnabled','setBodyType','setLinearDamping',
    'recomputeMassPropertiesFromColliders','setAdditionalMass','setAdditionalMassProperties','setAngularDamping',
    'resetForces','resetTorques','addForce','applyImpulse','addTorque','applyTorqueImpulse','addForceAtPoint','applyImpulseAtPoint']),
  Collider: Object.freeze(['finalizeDeserialization','clearShapeCache','setSensor','setShape','setEnabled','setRestitution',
    'setFriction','setFrictionCombineRule','setRestitutionCombineRule','setCollisionGroups','setSolverGroups','setContactSkin',
    'setActiveHooks','setActiveEvents','setContactForceEventThreshold','setActiveCollisionTypes','setDensity','setMass',
    'setMassProperties','setTranslation','setTranslationWrtParent','setRotation','setRotationWrtParent','setHalfExtents',
    'setRadius','setRoundRadius','setHalfHeight','setVoxel','propagateVoxelChange','combineVoxelStates']),
});
const observedObjects=new WeakMap(),mutatorInstallations=new WeakMap(),worldGates=new WeakMap();
/** Bootstrap-only observation. The default loader calls this before publishing its runtime.
 * Original receiver, arguments, return and exception flow are preserved. Unregistered objects
 * have no observer, and no observer runs user callbacks. Private raw-WASM writes are unsupported. */
export function installOrchardMutationObservation(R) {
  const existing=mutatorInstallations.get(R);
  if(existing) return existing.every(row=>sameDescriptor(own(row.prototype,row.name),row.installed));
  const rows=[];
  for(const [className,names] of Object.entries(ORCHARD_PUBLIC_MUTATORS)) for(const name of names) {
    const prototype=R[className]?.prototype,descriptor=prototype && own(prototype,name);
    if(!descriptor || typeof descriptor.value!=='function' || !descriptor.configurable) return false;
    rows.push({prototype,name,descriptor,className});
  }
  let written=0;
  try {
    for(const row of rows) {
      const original=row.descriptor.value;
      const wrapper=function(...args) {
        const gate=row.className==='World' && worldGates.get(this);
        if(gate?.active && gate.enabled) {
          if(gate.phase==='solve' && gate.permit)gate.permit=false;
          else if(gate.phase==='idle')gate.serial++;
          else {gate.serial++;return undefined;}
        }
        const observer=observedObjects.get(this);
        if(observer?.active)observer.serial++;
        try{return Reflect.apply(original,this,args);}
        finally{if(observer?.active)observer.serial++;}
      };
      Object.defineProperty(wrapper,'name',{value:original.name,configurable:true});
      Object.defineProperty(wrapper,'length',{value:original.length,configurable:true});
      row.installed={...row.descriptor,value:wrapper};
      Object.defineProperty(row.prototype,row.name,row.installed);written++;
    }
    mutatorInstallations.set(R,rows);return true;
  }catch(error){
    for(let i=written-1;i>=0;i--)Object.defineProperty(rows[i].prototype,rows[i].name,rows[i].descriptor);
    return false;
  }
}
/** A new private subscription cannot replace or retrieve another lease's observer. Its
 * returned retirement capability is retained only by the subscribing source lease. */
export function observeOrchardNativeObjects(lane,objects) {
  if(!lane?.observationEnabled || !lane.verify() || !Array.isArray(objects) || !objects.length || objects.some(object=>observedObjects.has(object)))return null;
  const state={active:true,serial:0},members=[...objects];
  for(const object of members)observedObjects.set(object,state);
  return Object.freeze({
    serial:()=>state.active?state.serial:null,
    retire(){if(!state.active)return false;state.active=false;for(const object of members)if(observedObjects.get(object)===state)observedObjects.delete(object);return true;},
  });
}

/** Only the constructor receives this world's private scheduling gate. Repeated calls
 * cannot retrieve or replace it. Unregistered worlds keep ordinary Rapier step behavior. */
export function observeOrchardWorld(lane) {
 if(!lane?.observationEnabled || !lane.verify() || worldGates.has(lane.world))return null;
 const gate={active:true,enabled:false,phase:'idle',permit:false,serial:0};worldGates.set(lane.world,gate);
 return Object.freeze({
  enable(value=true){if(gate.active)gate.enabled=value===true;},
  phase(value){if(gate.active){gate.phase=value;gate.permit=false;}},
  permit(){if(!gate.active || gate.phase!=='solve')return false;gate.permit=true;return true;},
  serial:()=>gate.serial,
  retire(){if(!gate.active)return false;gate.active=false;if(worldGates.get(lane.world)===gate)worldGates.delete(lane.world);return true;},
 });
}

/** Fixed future volume against every current solid peer, using full native support. The
 * caller must validate source identity and root pose before the final trusted observation. */
export function orchardPlacementClearance(observation,candidate,constants,excludedHandle=null) {
  if(!candidate?.enabled || !candidate.colliders?.length)fail('placement_body');
  let minimum=Infinity,blocker=null;
  for(const collider of candidate.colliders){
    const placed=orchardColliderProjection(collider,constants),pad=floatPadding(placed.points);
    for(const body of observation.bodies){
      if(!body.enabled || body.handle===excludedHandle)continue;
      for(const peer of body.colliders){
        if(!peer.enabled || peer.sensor || !interactions(collider.groups,peer.groups))continue;
        const support=orchardColliderProjection(peer,constants);
        const clearance=orchardHullDistance(placed.points,support.points)-placed.round-support.round-pad-floatPadding(support.points);
        if(clearance<minimum){minimum=clearance;blocker=peer.handle;}
      }
    }
  }
  return Object.freeze({clear:minimum>0,minimum,blocker:minimum>0?null:blocker});
}
