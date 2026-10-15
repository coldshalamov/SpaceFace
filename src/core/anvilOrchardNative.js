import {prepareEntityPhysicsIndexPublication} from './coreSystem.js';
// Exact-source native collars. Construction may pose newly allocated colliders; reads and
// snapshot validation never repair live geometry. Motor authority requires explicit owned state.
import { ANVIL_ORCHARD, normalizeOrchardRecord, orchardHistoryFitsTick, orchardPhase, orchardLotId } from '../data/anvilOrchard.js';
import { ORCHARD_GEOMETRY as G, ORCHARD_FRAME_BODY_ID, ORCHARD_POD_BODY_ID, orchardFrameBodySpec, orchardPodBodySpec } from '../data/anvilOrchardBody.js';
import { ensurePhysicsBodySpec, preparePhysicsBodyNormalizationAdoption, preparePhysicsBodyNormalizationReplacement, resolvePhysicsBodySpec, consumePhysicsCommand, consumeProjectileContinuation } from './physicsAuthority.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { prepareOrchardNativeObservation, orchardPairClearance, observeOrchardNativeObjects, observeOrchardWorld, orchardPlacementClearance } from './anvilOrchardCollarQuery.js';
import { planarProxyPrismHalfHeight } from './planarProxyGeometry.js';

const canonical = ensurePhysicsBodySpec({ type: 'wreck', radius: G.radius, data: {}, physicsBody: orchardFrameBodySpec() });
const leases = new WeakMap(), preparations = new WeakSet(), recoveryViews = new WeakMap();
const rigByPart = new Map(G.rigs.map(r => [r.partId, r]));
let nextRevision = 1;
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x);
const same = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
};
const close = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 8 * 2 ** -23 * Math.max(1, Math.abs(b));
const vectorEqual = (a, b) => Object.keys(b).every(k => close(a?.[k], b[k]));
const ints = (a, max) => Array.isArray(a) && a.length === 3 && a.every(n => Number.isSafeInteger(n) && n >= 0 && n <= max);

export function createOrchardCollarState(progress = [0, 0, 0], cycles = [0, 0, 0]) {
  if (!ints(progress, 30) || !ints(cycles, 4)) throw new TypeError('Invalid Orchard collar pose');
  return { schemaVersion: 1, sourceSha: G.sourceSha, sourceRevision: G.sourceRevision,
    progress: [...progress], cycles: [...cycles] };
}

export function claimsOrchardFrame(entity) {
  return entity?.data?.orchardCollars !== undefined
    || (entity?.data?.orchardId === 'anvil_storm_orchard' && entity?.data?.orchardKind === 'frame')
    || entity?.physicsBody?.collisionProxyManifest?.id === ORCHARD_FRAME_BODY_ID;
}

export function claimsOrchardPod(entity) {
  return (entity?.data?.orchardId === 'anvil_storm_orchard' && entity?.data?.orchardKind === 'pod')
    || entity?.physicsBody?.collisionProxyManifest?.id === ORCHARD_POD_BODY_ID;
}

function inertTree(value, seen = new Set()) {
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return true;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  if (Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype)) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !d || !('value' in d) || !inertTree(d.value, seen)) return false;
  }
  seen.delete(value); return true;
}
function ownData(value, keys) {
  return !!value && keys.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return d && 'value' in d; });
}
function supportedSourceStorage(entity) {
  if (!ownData(entity, ['id', 'type', 'alive', 'collides', 'hull', 'occupantGeneration', 'pos', 'rot', 'radius', 'data', 'physicsBody'])) return false;
  if (!ownData(entity.pos, ['x', 'z']) || !ownData(entity.data, ['orchardId', 'orchardKind', 'masslineTetherable', 'worldRecordId', 'orchardCollars'])) return false;
  return inertTree(entity.physicsBody) && inertTree(entity.data.orchardCollars);
}

function authored(entity, normalizedBody = null) {
  if (!supportedSourceStorage(entity)) return null;
  const s = entity?.data?.orchardCollars;
  return entity && entity.type === 'wreck' && entity.data?.orchardId === 'anvil_storm_orchard'
    && entity.data?.orchardKind === 'frame' && entity.data.masslineTetherable === false
    && entity.data.worldRecordId === G.worldRecordId && entity.alive !== false && entity.collides !== false
    && Number.isFinite(entity.hull) && entity.hull > 0
    && Number.isSafeInteger(entity.occupantGeneration) && entity.occupantGeneration > 0
    && Number.isFinite(entity.pos?.x) && Number.isFinite(entity.pos?.z) && Number.isFinite(entity.rot)
    && entity.radius === G.radius && same(normalizedBody || entity.physicsBody, canonical)
    && plain(s) && Object.keys(s).length === 5 && s.schemaVersion === 1
    && s.sourceSha === G.sourceSha && s.sourceRevision === G.sourceRevision
    && ints(s.progress, 30) && ints(s.cycles, 4) ? s : null;
}

export function orchardPartPose(index, progress) {
  const rig = rigByPart.get(G.parts[index].id);
  if (!rig) return { translation: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
  const angle = rig.yawSign * Math.PI / 2 * progress[rig.socket] / 30;
  const c = Math.cos(angle), s = Math.sin(angle), { x, z } = rig.pivot;
  return { translation: { x: x - c * x - s * z, y: 0, z: z + s * x - c * z },
    rotation: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) } };
}

function retainInertTree(value) {
  if(value===null || typeof value!=='object')return {value};
  return {prototype:Object.getPrototypeOf(value),entries:Reflect.ownKeys(value).map(key=>[key,retainInertTree(Object.getOwnPropertyDescriptor(value,key).value)])};
}
function inertTreeUnchanged(value,tree) {
  if(!tree.entries)return Object.is(value,tree.value);
  if(!value || typeof value!=='object' || Object.getPrototypeOf(value)!==tree.prototype || Reflect.ownKeys(value).length!==tree.entries.length)return false;
  return tree.entries.every(([key,child])=>{const d=Object.getOwnPropertyDescriptor(value,key);return d && 'value' in d && inertTreeUnchanged(d.value,child);});
}

function capture(entity) {
  const state = authored(entity);
  if (!state) throw new Error('invalid_orchard_frame_source');
  return { entity, id:entity.id, life: entity.occupantGeneration, data: entity.data, spec: entity.physicsBody,
    state, finiteMarker: Object.getOwnPropertyDescriptor(entity.data,'orchardFiniteCustody'), progress: state.progress, cycles: state.cycles,
    bodyTree:retainInertTree(entity.physicsBody), contract: JSON.stringify(entity.physicsBody), stateContract: JSON.stringify(state),
    values: [...state.progress], root: { x: entity.pos.x, z: entity.pos.z, rot: entity.rot } };
}

function retained(p) {
  const e = p.entity;
  // Construction already proved canonical values. One descriptor-only comparison of
  // that retained inert tree preserves every subsequent source value without repeating
  // normalization, canonical comparison and JSON serialization on each pose read.
  return ownData(e,['id','type','alive','collides','hull','occupantGeneration','pos','rot','radius','data','physicsBody'])
    && ownData(e.pos,['x','z']) && ownData(e.data,['orchardId','orchardKind','masslineTetherable','worldRecordId','orchardCollars'])
    && e.id===p.id && e.type==='wreck' && e.alive!==false && e.collides!==false && Number.isFinite(e.hull) && e.hull>0 && e.radius===G.radius
    && e.data.orchardId==='anvil_storm_orchard' && e.data.orchardKind==='frame' && e.data.masslineTetherable===false && e.data.worldRecordId===G.worldRecordId
    && e.pos.x===p.root.x && e.pos.z===p.root.z && e.rot===p.root.rot && e.occupantGeneration===p.life
    && e.data===p.data && e.physicsBody===p.spec && e.data.orchardCollars===p.state
    && finiteMarkerCurrent(p) && inertTreeUnchanged(p.spec,p.bodyTree) && inertTree(p.state) && p.state.progress===p.progress && p.state.cycles===p.cycles
    && JSON.stringify(p.state)===p.stateContract;
}

export function prepareOrchardFrameConstruction(entity, owner = null) {
  if (!claimsOrchardFrame(entity)) return null;
  const p = capture(entity),claim=motorStates.get(p.state)?.claim,ctx=ownerContexts.get(owner);
  const dormant=ctx?.dormantFrames.get(entity);
  if(dormant && dormant===claim && dormantFrameCurrent(ctx,dormant)){p.residentPredecessor=dormant;}
  if(claim && p.residentPredecessor!==claim && !(ctx?.constructionRehomes?.get(entity)===claim.entity)
    && !(recoveryViews.has(owner) && claim.data===p.data && claim.id===p.id && claim.life===p.life))throw new Error('orchard_motor_storage_already_claimed');
  preparations.add(p); return p;
}

function nativeAccess(owner, body, entityLease) {
  const world = owner.world, records = owner.records, queue = owner._eventQueue, colliderOwners = owner._colliderOwners;
  if(!ownData(owner,['_frameOrigin','_frameOriginSeq']) || !ownData(owner._frameOrigin,['x','z']))throw Error('orchard_origin_accessor');
  const origin = owner._frameOrigin, originX = origin.x, originZ = origin.z, sequence = owner._frameOriginSeq;
  const record = records.get(entityLease.entity.id), recordBody = record?.body, recordSpec = record?.spec;
  const recordEntity = record?.entity, primaryCollider = record?.collider;
  const recordColliders = record?.colliders, members = recordColliders && [...recordColliders];
  const entries = members?.map(collider => {
    const entry = colliderOwners.get(collider.handle);
    return { collider, entry, rec: entry?.rec, owned: entry?.collider };
  });
  const basic = () => (!recoveryViews.has(owner) || recoveryViews.get(owner).references()) && owner.world === world && owner.records === records && owner._eventQueue === queue
    && owner._colliderOwners === colliderOwners && (!entries || entries.every(r => colliderOwners.get(r.collider.handle) === r.entry
      && r.entry?.rec === r.rec && r.entry?.collider === r.owned))
    && ownData(origin,['x','z']) && owner._frameOrigin === origin && origin.x === originX && origin.z === originZ && owner._frameOriginSeq === sequence
    && records.get(entityLease.entity.id) === record && (!record || (record.entity === recordEntity && record.collider === primaryCollider
      && record.body === recordBody && record.spec === recordSpec
      && record.colliders === recordColliders && recordColliders.length === members.length
      && members.every((collider, i) => recordColliders[i] === collider)))
    && ownData(entityLease.entity, ['occupantGeneration', 'data', 'physicsBody'])
    && entityLease.entity.occupantGeneration === entityLease.life
    && entityLease.entity.data === entityLease.data && entityLease.entity.physicsBody === entityLease.spec;
  const lookup = (method, handle) => {
    if (!basic()) throw new Error('orchard_native_owner_changed');
    if (Object.hasOwn(world, method)) throw new Error('orchard_native_dispatch_changed');
    const dispatch = world[method];
    if (!basic()) throw new Error('orchard_native_owner_changed');
    const result = dispatch.call(world, handle);
    if (!basic()) throw new Error('orchard_native_owner_changed');
    return result;
  };
  const current = () => basic() && lookup('getRigidBody', body.handle) === body && basic();
  const call = (object, method, ...args) => {
    if (!current()) throw new Error('orchard_native_owner_changed');
    if (object !== body && lookup('getCollider', object.handle) !== object) throw new Error('orchard_native_collider_retired');
    // Instrumented instance read surfaces are outside this pose-only source contract.
    if (Object.hasOwn(object, method)) throw new Error('orchard_native_dispatch_changed');
    if (method.startsWith('set') && (!retained(entityLease) || (recoveryViews.has(owner) && !recoveryViews.get(owner).full()))) throw new Error('orchard_source_changed');
    const dispatch = object[method];
    if (!current()) throw new Error('orchard_native_owner_changed');
    const result = dispatch.call(object, ...args);
    if (!current()) throw new Error('orchard_native_owner_changed');
    if (method.startsWith('set') && (!retained(entityLease) || (recoveryViews.has(owner) && !recoveryViews.get(owner).full()))) throw new Error('orchard_source_changed');
    return result;
  };
  return { world, current, call, lookup };
}

function convexHull(points) {
  const ordered = [...new Map(points.map(p => [p.join(','), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half = rows => { const out=[]; for (const p of rows) {
    while(out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop(); out.push(p);
  } return out; };
  return [...half(ordered).slice(0, -1), ...half(ordered.toReversed()).slice(0, -1)];
}
const hulls = canonical.collisionProxyManifest.convexParts.map(part => {
  const points = part.points.map(p => [Math.fround(p.x * G.radius), Math.fround(p.z * G.radius)]);
  return { points: convexHull(points), halfY: Math.fround(planarProxyPrismHalfHeight(part.points, G.radius)),
    margin: 8 * 2 ** -23 * Math.max(1, ...points.flat().map(Math.abs)) };
});
function contained(points, hull, margin) {
  return hull.length >= 3 && points.every(p => hull.every((a, i) => {
    const b = hull[(i+1) % hull.length];
    return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]) >= -margin * Math.hypot(b[0]-a[0], b[1]-a[1]);
  }));
}

function geometryMatches(owner, rec, p) {
  const { body, colliders } = rec, a = nativeAccess(owner, body, p);
  if (!a.call(body, 'isFixed') || !a.call(body, 'isEnabled') || a.call(body, 'numColliders') !== G.parts.length
    || colliders.length !== G.parts.length) return false;
  const root = a.call(body, 'translation'), rotation = a.call(body, 'rotation');
  if (root.x !== Math.fround(p.root.x - owner._frameOrigin.x) || root.y !== 0
    || root.z !== Math.fround(p.root.z - owner._frameOrigin.z) || rotation.x !== 0 || rotation.z !== 0
    || rotation.y !== Math.fround(-Math.sin(p.root.rot / 2)) || rotation.w !== Math.fround(Math.cos(p.root.rot / 2))
    || a.call(body, 'isCcdEnabled') !== false) return false;
  for (let i = 0; i < colliders.length; i++) {
    const collider = colliders[i], pose = orchardPartPose(i, p.values);
    if (a.lookup('getCollider', collider.handle) !== collider || a.call(collider, 'parent') !== body
      || a.call(collider, 'shapeType') !== owner.RAPIER.ShapeType.ConvexPolyhedron
      || a.call(collider, 'isSensor') || !a.call(collider, 'isEnabled')
      || a.call(collider, 'contactSkin') !== 0 || a.call(collider, 'density') !== 0
      || a.call(collider, 'collisionGroups') !== 0x0004000f || a.call(collider, 'solverGroups') !== 0xffffffff
      || a.call(collider, 'activeCollisionTypes') !== owner.RAPIER.ActiveCollisionTypes.DEFAULT
      || a.call(collider, 'friction') !== Math.fround(PHYSICS_MATERIALS[canonical.material].friction)
      || a.call(collider, 'restitution') !== Math.fround(PHYSICS_MATERIALS[canonical.material].restitution)
      || a.call(collider, 'frictionCombineRule') !== owner.RAPIER.CoefficientCombineRule.Average
      || a.call(collider, 'restitutionCombineRule') !== owner.RAPIER.CoefficientCombineRule.Average
      || !vectorEqual(a.call(collider, 'translationWrtParent'), pose.translation)
      || !vectorEqual(a.call(collider, 'rotationWrtParent'), pose.rotation)) return false;
    const vertices = a.call(collider, 'vertices'), h = hulls[i], upper = [], lower = [];
    if (!vertices || vertices.length < 18 || vertices.length % 3) return false;
    for (let j = 0; j < vertices.length; j += 3) {
      if (!Number.isFinite(vertices[j]) || !Number.isFinite(vertices[j+2]) || Math.abs(vertices[j+1]) !== h.halfY) return false;
      (vertices[j+1] > 0 ? upper : lower).push([vertices[j], vertices[j+2]]);
    }
    // Both complete faces are required. A pyramid shares the combined XZ hull and Y
    // extrema with a prism but omits real solid volume at the other face.
    for (const face of [upper, lower]) {
      const actual = convexHull(face);
      if (!contained(actual, h.points, h.margin) || !contained(h.points, actual, h.margin)) return false;
    }
  }
  return a.current() && retained(p);
}

export function initializeOrchardFrame(owner, entity, body, colliders, p) {
  if (!p) return;
  if (!preparations.delete(p) || p.entity !== entity || !retained(p)) throw new Error('invalid_orchard_preparation');
  const a = nativeAccess(owner, body, p);
  if (colliders.some(c => owner._colliderOwners.has(c.handle))) throw new Error('orchard_collider_already_owned');
  for (let i = 0; i < colliders.length; i++) {
    if (!rigByPart.has(G.parts[i]?.id)) continue;
    const pose = orchardPartPose(i, p.values);
    a.call(colliders[i], 'setTranslationWrtParent', pose.translation);
    a.call(colliders[i], 'setRotationWrtParent', pose.rotation);
  }
  if (!geometryMatches(owner, { body, colliders }, p)) throw new Error('invalid_orchard_native_geometry');
}

// Match the owner's point-window cache for these verified convex prisms without another
// callback-capable native read after allocation validation. Their local axis is pure yaw.
export function orchardFrameSpines(prepared) {
  return G.parts.map((_, i) => {
    const pose = orchardPartPose(i, prepared.values);
    return { ox: Math.fround(pose.translation.x), oz: Math.fround(pose.translation.z), ux: 1, uz: 0, halfLen: 0 };
  });
}

export function retainConstructedOrchardFrame(owner, record, prepared) {
  if (prepared) {
    const p={ ...prepared, owner, world: owner.world, body: record.body,
      recordSpec:record.spec, colliders: [...record.colliders], bindingRevision: nextRevision++, provenance: 'constructed',
      spines:record.coincidentSpines, spineMembers:[...record.coincidentSpines], lastTicks:[null,null,null], intents:[null,null,null] };
    const ctx=ownerContexts.get(owner);p.watch=observeOrchardNativeObjects(ctx?.lane,[record.body,...record.colliders]);
    const prior=prepared.residentPredecessor;
    if(prior){if(!dormantFrameCurrent(ctx,prior))throw Error('orchard_residency_predecessor_changed');p.finite=prior.finite;p.lastTicks=[...prior.lastTicks];p.intents=[...prior.intents];ctx.dormantFrames.delete(record.entity);}
    const brand=motorStates.get(p.state);if(brand && (!brand.claim || brand.claim===prior))brand.claim=p;
    leases.set(record,p);ctx?.sources.add(record);ctx?.gate?.enable();
  }
}

export function readOrchardFramePose(owner, entity, options = {}) {
  const rec = owner.records.get(entity?.id), p = leases.get(rec);
  try {
    const ctx=ownerContexts.get(owner);
    if(!p || entity!==p.entity || rec.entity!==entity)return null;
    if(ctx && (!contextCurrent(ctx) || ctx.quarantine || ['motor','custody'].includes(ctx.phase)))return null;
    if(p && !options.fresh && p.presentation && cachedPoseCurrent(ctx,rec,p))return p.presentation.receipt;
    if(p?.completedReceipt && !options.fresh) {
      if(!sourceRecordCurrent(ctx,rec,p) || ctx.quarantine || !['idle','contacts'].includes(ctx.phase))return null;
      if(!ownData(owner,['_frameOrigin','_frameOriginSeq']) || !ownData(owner._frameOrigin,['x','z']))throw Error('orchard_origin_accessor');
  const originRef=owner._frameOrigin,origin={x:originRef.x,z:originRef.z},sequence=owner._frameOriginSeq;
      const observation=prepareOrchardNativeObservation(owner,ctx.lane,rec);
      if(!sourceRecordCurrent(ctx,rec,p) || owner._frameOrigin!==originRef || !ownData(originRef,['x','z']) || originRef.x!==origin.x || originRef.z!==origin.z || owner._frameOriginSeq!==sequence)return null;
      const snapshot=observation.scan();
      return observationMatches(snapshot.byHandle.get(p.body.handle),p,origin,ctx.lane.constants)?p.completedReceipt:null;
    }
    if (!p || p.owner !== owner || p.world !== owner.world || rec.entity !== p.entity || entity !== p.entity
      || rec.body !== p.body || rec.colliders.length !== p.colliders.length
      || rec.colliders.some((c, i) => c !== p.colliders[i] || owner._colliderOwners.get(c.handle)?.rec !== rec)
      || !retained(p) || !geometryMatches(owner, rec, p)) return null;
    return Object.freeze({ kind: 'pose-only', provenance: p.provenance, sourceSha: G.sourceSha,
      bindingRevision: p.bindingRevision, progress: Object.freeze([...p.values]), completedNativeTick: null });
  } catch (_) { return null; }
}

export function orchardFrameSnapshotReady(owner, record) {
  if (!leases.has(record) && !claimsOrchardFrame(record.entity)) return true;
  return !!readOrchardFramePose(owner, record.entity, {fresh:true});
}


export function retainAdoptedOrchardFrame(owner, record) {
  if (!claimsOrchardFrame(record.entity)) return;
  const p = capture(record.entity);
  if (!geometryMatches(owner, record, p)) throw new Error('invalid_orchard_adopted_geometry');
  leases.set(record, { ...p, owner, world: owner.world, body: record.body,
    recordSpec:record.spec, colliders: [...record.colliders], bindingRevision: nextRevision++, provenance: 'cold-adopted',
    spines:record.coincidentSpines,spineMembers:[...record.coincidentSpines],lastTicks:[null,null,null],intents:[null,null,null] });
  const ctx=ownerContexts.get(owner),lease=leases.get(record);
  lease.watch=observeOrchardNativeObjects(ctx?.lane,[record.body,...record.colliders]);
  ctx?.sources.add(record);ctx?.gate?.enable();
}

// One input boundary for the existing successful restore context, shared by native
// adoption and scalar fallback. A retry cannot turn a replaced input into new authority.
const coldInputContexts=new WeakMap(),coldInputPlans=new WeakMap();
function orchardRestoreCensusMember(entity){
 if(!entity || typeof entity!=='object')return false;
 const dataCell=Object.getOwnPropertyDescriptor(entity,'data');
 if(dataCell && !('value' in dataCell))return true;
 const data=dataCell?.value;
 if(data && typeof data==='object'){
  const id=Object.getOwnPropertyDescriptor(data,'orchardId'),collars=Object.getOwnPropertyDescriptor(data,'orchardCollars');
  if(id && !('value' in id) || collars && !('value' in collars))return true;
  if(id?.value==='anvil_storm_orchard' || (collars && collars.value!==undefined))return true;
 }
 const bodyCell=Object.getOwnPropertyDescriptor(entity,'physicsBody');
 if(bodyCell && !('value' in bodyCell))return true;
 const body=bodyCell?.value;
 if(body && typeof body==='object'){
  const manifestCell=Object.getOwnPropertyDescriptor(body,'collisionProxyManifest');
  if(manifestCell && !('value' in manifestCell))return true;
  const manifest=manifestCell?.value;
  if(manifest && typeof manifest==='object'){
   const id=Object.getOwnPropertyDescriptor(manifest,'id');
   if(id && !('value' in id))return true;
   if(id?.value===ORCHARD_FRAME_BODY_ID || id?.value===ORCHARD_POD_BODY_ID)return true;
  }
 }
 return false;
}
function orchardRestoreCensus(map){
 const census=new Map();
 Map.prototype.forEach.call(map,(entity,key)=>{if(orchardRestoreCensusMember(entity))Map.prototype.set.call(census,key,entity);});
 return census;
}
function orchardRestoreCensusCurrent(map,census){
 let count=0,current=true;
 Map.prototype.forEach.call(map,(entity,key)=>{
  if(!orchardRestoreCensusMember(entity))return;
  count++;
  if(!Map.prototype.has.call(census,key) || Map.prototype.get.call(census,key)!==entity)current=false;
 });
 return current && count===census.size;
}
// Ordinary saves need no Orchard authority. Inspect only descriptor values here;
// an opaque selector cannot establish that the Orchard boundary is absent.
export function orchardRestoreInputsRequired(state,entities){
 const cell=(object,key)=>object && typeof object==='object'?Object.getOwnPropertyDescriptor(object,key):null;
 const opaque=d=>!!d && !('value' in d);
 const sites=cell(state,'sites'),row=cell(sites?.value,'anvilOrchard');
 if(opaque(sites) || opaque(row) || row?.value!=null)return true;
 const orchardEntity=entity=>{
  const data=cell(entity,'data');if(opaque(data))return true;
  const id=cell(data?.value,'orchardId'),collars=cell(data?.value,'orchardCollars');
  if(opaque(id) || opaque(collars) || id?.value==='anvil_storm_orchard' || collars?.value!==undefined)return true;
  const spec=cell(entity,'physicsBody'),manifest=cell(spec?.value,'collisionProxyManifest'),bodyId=cell(manifest?.value,'id');
  return opaque(spec) || opaque(manifest) || opaque(bodyId) || bodyId?.value===ORCHARD_FRAME_BODY_ID || bodyId?.value===ORCHARD_POD_BODY_ID;
 };
 if(!Array.isArray(entities))return true;
 for(let i=0;i<entities.length;i++){
  const entry=cell(entities,String(i));if(opaque(entry) || orchardEntity(entry?.value))return true;
 }
 const membership=cell(state,'entities');if(opaque(membership))return true;
 if(membership?.value!=null){
  let found=false;
  try{Map.prototype.forEach.call(membership.value,entity=>{if(!found && orchardEntity(entity))found=true;});}catch(_){return true;}
  if(found)return true;
 }
 return false;
}
export function captureOrchardRestoreInputs(context,state,entities,facade,capability){
 if(!context || typeof context!=='object' || !capability || !ownData(facade,['_sg02']))return null;
 const destination=Object.getOwnPropertyDescriptor(facade,'_sg02').value,destinationContext=ownerContexts.get(destination);
 if(!destinationContext || destinationContext.restoreCapability!==capability || !contextCurrent(destinationContext))return null;
 const existing=coldInputContexts.get(context);
 if(existing){const captured=coldInputPlans.get(existing);return captured?.facade===facade && captured.destination===destination && captured.destinationContext===destinationContext && captured.capability===capability?existing:null;}
 const claim={facade,destination,destinationContext,capability};
 const plan=Object.freeze({});coldInputContexts.set(context,plan);
 try{
  if(!ownData(state,['sites','entities','world','mode','tick']))throw Error('orchard_restore_state');
  const facadeKeys=['state','_sg02','_sg02Token','_nativeRestoreContext','_pendingSg02Snapshot','_nativeRestorePending','_nativeRestoreDeferred'];
  if(!ownData(facade,facadeKeys))throw Error('orchard_restore_facade');
  const facadeCells=facadeKeys.map(key=>[key,Object.getOwnPropertyDescriptor(facade,key).value]);
  if(facadeCells.find(([k])=>k==='state')[1]!==state || facadeCells.find(([k])=>k==='_nativeRestoreContext')[1]!==context)throw Error('orchard_restore_epoch');
  const epochCurrent=()=>ownerContexts.get(destination)===destinationContext && destinationContext.restoreCapability===capability && contextCurrent(destinationContext) && facadeCells.every(([key,value])=>{const d=Object.getOwnPropertyDescriptor(facade,key);return d && 'value' in d && d.value===value;});
  const sites=state.sites,map=state.entities,world=state.world,cell=finiteCell(sites,'anvilOrchard'),row=cell?.value;
  const census=orchardRestoreCensus(map),censusCurrent=()=>orchardRestoreCensusCurrent(map,census);
  if(row==null){coldInputPlans.set(plan,{...claim,state,current:()=>epochCurrent() && ownData(state,['sites','entities']) && state.sites===sites && state.entities===map && finiteCell(sites,'anvilOrchard')?.value==null,rows:[],map,census,censusCurrent});return plan;}
  if(!inertTree(row) || !normalizeOrchardRecord(row) || !orchardHistoryFitsTick(row,state.tick) || !ownData(world,['currentSectorId']))throw Error('orchard_restore_row');
  const tree=retainInertTree(row),tick=state.tick,mode=state.mode,sector=world.currentSectorId,rows=[];
  for(const entity of Map.prototype.values.call(map)){
   const dataCell=entity && Object.getOwnPropertyDescriptor(entity,'data'),data=dataCell && 'value' in dataCell?dataCell.value:null;
   if(!data || !ownData(data,['orchardId','orchardKind']) || data.orchardId!=='anvil_storm_orchard' || !['frame','pod'].includes(data.orchardKind))continue;
   const keys=['id','occupantGeneration','alive','type','hull','collides','radius','physicsBody','data','pos','vel','rot','angVel'];
   if(!ownData(entity,keys) || !inertTree(data) || !inertTree(entity.physicsBody) || !ownData(entity.pos,['x','z']) || !ownData(entity.vel,['x','z']))throw Error('orchard_restore_entity');
   const cells=keys.map(key=>[key,Object.getOwnPropertyDescriptor(entity,key)]),spec=entity.physicsBody;
   const flight=retainOptionalInertField(entity,'flightModel');if(!flight)throw Error('orchard_restore_normalization_accessor');
   const projection=Object.create(Object.getPrototypeOf(entity),Object.getOwnPropertyDescriptors(entity));
   const resolved=resolvePhysicsBodySpec(projection);
   rows.push({entity,id:entity.id,cells,spec,data,resolved,flight,specTree:retainInertTree(spec),dataTree:retainInertTree(data),pos:{x:entity.pos.x,z:entity.pos.z},vel:{x:entity.vel.x,z:entity.vel.z}});
  }
  const current=()=>epochCurrent() && ownData(state,['sites','entities','world','mode','tick']) && state.sites===sites && state.entities===map && state.world===world && state.mode===mode && state.tick===tick
    && ownData(world,['currentSectorId']) && world.currentSectorId===sector && finiteCell(sites,'anvilOrchard')?.value===row && inertTreeUnchanged(row,tree);
  coldInputPlans.set(plan,{...claim,state,current,rows,map,census,censusCurrent,nativeEntities:new Set(entities)});return plan;
 }catch(_){coldInputPlans.set(plan,{...claim,invalid:true});return plan;}
}
function restoreInputsCurrent(plan,mapping=null,published=false,checkCensus=true){
 const captured=coldInputPlans.get(plan);if(!captured || captured.invalid)return false;
 let valid=false;try{valid=captured.current() && (!checkCensus || captured.censusCurrent()) && captured.rows.every(r=>{
  const projected=mapping?.get(r.entity),spec=published && projected?projected.spec:r.spec,data=published && projected?projected.data:r.data;
  return optionalInertFieldUnchanged(r.entity,'flightModel',r.flight) && r.cells.every(([key,d])=>{const now=Object.getOwnPropertyDescriptor(r.entity,key),value=key==='physicsBody'?spec:key==='data'?data:d.value;return now && 'value' in now && now.value===value && now.writable===d.writable && now.configurable===d.configurable && now.enumerable===d.enumerable;})
   && Map.prototype.get.call(captured.map,r.id)===r.entity && inertTreeUnchanged(spec,published && projected?projected.specTree:r.specTree) && inertTreeUnchanged(data,published && projected?projected.dataTree:r.dataTree)
   && ownData(r.entity.pos,['x','z']) && ownData(r.entity.vel,['x','z']) && r.entity.pos.x===r.pos.x && r.entity.pos.z===r.pos.z && r.entity.vel.x===r.vel.x && r.entity.vel.z===r.vel.z;
 });}catch(_){valid=false;}if(!valid)captured.invalid=true;return valid;
}
export function orchardRestoreInputsCurrent(plan,destination=null){
 const captured=coldInputPlans.get(plan);
 return (!destination || captured?.destination===destination && ownerContexts.get(destination)===captured.destinationContext) && restoreInputsCurrent(plan);
}
export function orchardRestoreContextCurrent(context){const plan=context && coldInputContexts.get(context);return !plan || restoreInputsCurrent(plan);}
export function resolveOrchardRestoreBody(plan,entity){
 if(!plan)return null;const captured=coldInputPlans.get(plan);if(!captured || !restoreInputsCurrent(plan,null,false,false))throw Error('orchard_restore_inputs_changed');
 const row=captured.rows.find(r=>r.entity===entity);return row?{spec:row.resolved}:null;
}

export function prepareOrchardFrameTransfer(candidate, destination, originalContracts = new Map(), options = {}) {
  if(options.restoreInputs && !orchardRestoreInputsCurrent(options.restoreInputs,destination))throw Error('orchard_restore_inputs_changed');
  const candidateContext=ownerContexts.get(candidate),destinationContext=ownerContexts.get(destination);
  const rows = [],sourceRecords=[...Map.prototype.values.call(candidate.records)];
  const semanticFrames=options.coldMotor===true && options.restoreInputs
    ? (coldInputPlans.get(options.restoreInputs)?.rows || []).filter(r=>r.data.orchardKind==='frame').map(r=>r.entity)
    : [...Map.prototype.keys.call(destinationContext.dormantFrames)];
  for(const entity of semanticFrames)if(!sourceRecords.some(r=>r.entity===entity))sourceRecords.push({entity,dormant:true});
  for (const record of sourceRecords) {
    const old = record.dormant ? capture(record.entity) : leases.get(record);
    if (!old && !claimsOrchardFrame(record.entity)) continue;
    if (!old || (!record.dormant && (old.owner !== candidate || old.world !== candidate.world || record.body !== old.body
      || !geometryMatches(candidate, record, old))) || !retained(old)) throw new Error('invalid_orchard_staged_lease');
    const entity = record.entity, source = originalContracts.get(entity);
    if (entity.data !== old.data || entity.data?.orchardCollars !== old.state
      || entity.occupantGeneration !== old.life || entity.pos?.x !== old.root.x
      || entity.pos?.z !== old.root.z || entity.rot !== old.root.rot
      || (source && (entity.physicsBody !== source.spec || entity.data !== source.data
        || entity.occupantGeneration !== source.life))) throw new Error('orchard_original_replaced');
    if(options.restoreInputs && !restoreInputsCurrent(options.restoreInputs))throw Error('orchard_restore_inputs_changed');
    const cache = preparePhysicsBodyNormalizationAdoption(entity, old.spec);
    if (!cache) throw new Error('invalid_orchard_cold_normalization');
    const predecessor=leases.get(destination.records.get(entity.id)) || destinationContext.dormantFrames.get(entity);
    const continued=predecessor && predecessor.entity===entity && predecessor.state===old.state
      && predecessor.data===old.data && predecessor.life===old.life && retained(predecessor) && motorStorageCurrent(predecessor);
    const priorBrand=motorStates.get(old.state);
    if(priorBrand?.claim && priorBrand.claim!==old && !continued)throw new Error('orchard_motor_storage_already_claimed');
    let nextData=old.data,nextState=old.state;
    if(options.coldMotor===true && !motorStates.has(nextState)) {
      nextState=createOrchardMotorState(old.values,old.cycles);
      const descriptors=Object.getOwnPropertyDescriptors(old.data);
      if(!descriptors.orchardCollars || !('value' in descriptors.orchardCollars)) throw new Error('orchard_cold_storage');
      descriptors.orchardCollars={...descriptors.orchardCollars,value:nextState};
      nextData=Object.create(Object.getPrototypeOf(old.data),descriptors);
    }
    const finiteState=options.finiteState,coldFinite=options.coldMotor===true && ownData(finiteState,['sites']) && finiteCell(finiteState.sites,'anvilOrchard')?.value!=null;
    if(coldFinite && !old.finiteMarker){const descriptors=Object.getOwnPropertyDescriptors(nextData);descriptors.orchardFiniteCustody={value:1,writable:true,configurable:true,enumerable:true};nextData=Object.create(Object.getPrototypeOf(nextData),descriptors);}
    const next={...old,entity,owner:destination,spec:cache.body,data:nextData,state:nextState,finiteMarker:Object.getOwnPropertyDescriptor(nextData,'orchardFiniteCustody'),
      progress:nextState.progress,cycles:nextState.cycles,stateContract:JSON.stringify(nextState),provenance:'cold-adopted',
      bindingRevision:nextRevision++,completedReceipt:null,presentation:null,
      lastTicks:continued?[...predecessor.lastTicks]:[null,null,null],
      intents:continued?[...predecessor.intents]:[null,null,null],finite:continued?predecessor.finite:null};
    if(next.finiteMarker){
      if(continued){if(!finiteRetained(next.finite,predecessor))throw Error('orchard_finite_predecessor_changed');}
      else if(options.coldMotor===true && options.finiteState){next.finite=finiteContext(options.finiteState,next,options.restoreInputs);if(!next.finite)throw Error('orchard_finite_cold_mismatch');}
    }
    rows.push({record:record.dormant?null:record,old,entity,cache,sourceSpec:entity.physicsBody,next,brandClaim:motorStates.get(next.state)?.claim});
  }
  const restoreInputs=options.restoreInputs,restoreMapping=new Map(rows.map(r=>[r.entity,{spec:r.next.spec,data:r.next.data,specTree:retainInertTree(r.next.spec),dataTree:retainInertTree(r.next.data)}]));
  if(restoreInputs && !restoreInputsCurrent(restoreInputs))throw Error('orchard_restore_inputs_changed');
  const readyRows=[],readySources=rows.map(r=>r.next);
  // Released cargo retains its lot after its source is removed. This carrier grants no
  // source motor authority and never substitutes for the current pod's native validation.
  if(!readySources.length){
    const prior=[...destinationContext.readyPods][0];
    const f=options.coldMotor===true && restoreInputs ? finiteRowContext(options.finiteState,restoreInputs) : prior?.f;
    if(f && finiteRowRetained(f))readySources.push({id:null,root:{x:0,z:0,rot:0},finite:f});
  }
  for(const p of readySources){
    const f=p.finite;if(!f)continue;
    for(const slot of f.row.sockets){
      if(slot.handoff!=='ready' || slot.status!=='drifting')continue;
      if(options.coldMotor===true && !restoreInputs)throw Error('orchard_restore_input_plan_missing');
      let entity=null,record=null;
      const inputs=options.coldMotor===true ? coldInputPlans.get(restoreInputs)?.rows.map(r=>r.entity) : [...destinationContext.readyPods].map(q=>q.entity);
      for(const e of inputs || []){
        if(!ownData(e,['data']) || !inertTree(e.data))throw Error('orchard_ready_cold_storage');
        if(e.data.worldRecordId===slot.lotId){if(entity)throw Error('orchard_ready_ambiguous_lot');entity=e;}
      }
      if(!entity)throw Error('orchard_ready_missing_pod');
      record=Map.prototype.get.call(candidate.records,entity.id) || null;
      if(options.coldMotor===true && !record && coldInputPlans.get(restoreInputs).nativeEntities.has(entity))throw Error('orchard_ready_missing_native_pod');
      const oldReady=podHandoffs.get(entity);
      if(options.coldMotor!==true && (!oldReady || oldReady.owner!==destination || oldReady.ctx!==destinationContext
        || !readyPodReferences(oldReady)))throw Error('orchard_ready_live_replacement');
      const next=makeReadyPodLease(destination,candidateContext,record,entity,p,slot.socket,f.state,entity.physicsBody,entity.data,options.coldMotor===true?'cold-adopted':'live-rehomed');
      if(!next)throw Error('orchard_ready_cold_mismatch');
      if(restoreInputs && !restoreInputsCurrent(restoreInputs))throw Error('orchard_restore_inputs_changed');
      const cache=preparePhysicsBodyNormalizationAdoption(entity,next.spec);if(!cache)throw Error('orchard_ready_cold_cache');
      readyRows.push({next,cache,oldReady});
    }
  }
  let used = false;
  return {
    mirrors: rows.flatMap(r => [
      ...(r.sourceSpec!==r.cache.body?[{entity:r.entity,key:'physicsBody',value:r.cache.body}]:[]),
      ...(r.old.data!==r.next.data?[{entity:r.entity,key:'data',value:r.next.data}]:[]),
    ]),
    current(published = false) {
      return !used && (!restoreInputs || restoreInputsCurrent(restoreInputs,restoreMapping,published)) && ownerContexts.get(candidate)===candidateContext && contextCurrent(candidateContext)
        && ownerContexts.get(destination)===destinationContext && contextCurrent(destinationContext) && rows.every(r => !!authored(r.entity, r.cache.body) && r.cache.current(published)
        && r.entity.data===(published?r.next.data:r.old.data) && r.entity.data?.orchardCollars===(published?r.next.state:r.old.state)
        && r.entity.occupantGeneration===r.old.life && r.entity.pos?.x===r.old.root.x && r.entity.pos?.z===r.old.root.z && r.entity.rot===r.old.root.rot
        && r.old.state.progress===r.old.progress && r.old.state.cycles===r.old.cycles && JSON.stringify(r.old.state)===r.old.stateContract
        && (!published || finiteMarkerCurrent(r.next)) && (!r.next.finite || finiteRetained(r.next.finite,r.next)) && motorStates.get(r.next.state)?.claim===r.brandClaim && r.next.state.progress===r.next.progress && r.next.state.cycles===r.next.cycles && JSON.stringify(r.next.state)===r.next.stateContract)
        && readyRows.every(r=>readyPodReferences(r.next,candidate) && r.cache.current(published) && readyPodReferences(r.next,candidate) && (options.coldMotor===true || podHandoffs.get(r.next.entity)===r.oldReady && readyPodReferences(r.oldReady))) && (!restoreInputs || restoreInputsCurrent(restoreInputs,restoreMapping,published));
    },
    nativeCurrent() {
      if(used || !rows.every(r => !r.record || geometryMatches(candidate, r.record, r.next)))return false;
      if(!readyRows.some(r=>r.next.resident))return true;
      try{const observation=prepareOrchardNativeObservation(candidate,candidateContext.lane);
        if(!readyRows.every(r=>readyPodReferences(r.next,candidate)))return false;
        const ccd=readyRows.map(r=>r.next.record?.ccdEnabled),snapshot=observation.scan();return readyRows.every((r,i)=>!r.next.resident || readyPodNativeMatches(snapshot.byHandle.get(r.next.bodyHandle),r.next,candidateContext.lane.constants,ccd[i]));
      }catch(_){return false;}
    },
    commit() {
      if (used) return false;
      used = true;
      for (const r of rows) { r.cache.commit(); const brand=motorStates.get(r.next.state);if(brand)brand.claim=r.next;if(r.record)leases.set(r.record, r.next);else candidateContext.dormantFrames.set(r.entity,r.next); }
      destinationContext.retired=true;destinationContext.gate?.retire();for(const rec of destinationContext.sources)leases.get(rec)?.watch?.retire();candidateContext.owner=destination;
      candidateContext.restoreCapability=destinationContext.restoreCapability;
      ownerContexts.set(destination,candidateContext);ownerContexts.delete(candidate);
      for(const r of readyRows){r.cache.commit();podHandoffs.set(r.next.entity,r.next);if(r.next.record)readyRecordLeases.set(r.next.record,r.next);candidateContext.readyPods.add(r.next);}
      return true;
    },
  };
}


// Generic adoption compares scalar yaw exactly. A fixed authored frame instead compares the
// exact f32 quaternion that its canonical descriptor created, without weakening other bodies.
export function orchardFrameRootMatches(owner, body, entity) {
  if (!claimsOrchardFrame(entity)) return false;
  try {
    const p = capture(entity), a = nativeAccess(owner, body, p);
    if (!a.call(body, 'isFixed')) return false;
    const t = a.call(body, 'translation'), q = a.call(body, 'rotation');
    const v = a.call(body, 'linvel'), w = a.call(body, 'angvel');
    const x = Math.fround(entity.pos.x - owner._frameOrigin.x), z = Math.fround(entity.pos.z - owner._frameOrigin.z);
    return t.x === x && t.y === 0 && t.z === z && q.x === 0 && q.z === 0
      && q.y === Math.fround(-Math.sin(entity.rot / 2)) && q.w === Math.fround(Math.cos(entity.rot / 2))
      && v.x === 0 && v.y === 0 && v.z === 0 && w.x === 0 && w.y === 0 && w.z === 0
      && retained(p);
  } catch (_) { return false; }
}


export function orchardConstructionCurrent(owner, prepared, world) {
  return owner.world === world && (!prepared || retained(prepared));
}


// A pure check over the copied result of the trusted native scan. All authored reads
// and source-reference checks belong before that scan, never after its last observation.
function observationMatches(body, p, origin, constants) {
  if (!body || body.type !== constants.RigidBodyType.Fixed || !body.enabled || body.ccd
    || body.colliders.length !== G.parts.length || body.object !== p.body
    || body.t.x !== Math.fround(p.root.x-origin.x) || body.t.y !== 0 || body.t.z !== Math.fround(p.root.z-origin.z)
    || body.q.x !== 0 || body.q.z !== 0 || body.q.y !== Math.fround(-Math.sin(p.root.rot/2))
    || body.q.w !== Math.fround(Math.cos(p.root.rot/2))) return false;
  for (let i=0;i<body.colliders.length;i++) {
    const c=body.colliders[i], pose=orchardPartPose(i,p.values), h=hulls[i];
    if(c.object!==p.colliders[i] || c.shape!==constants.ShapeType.ConvexPolyhedron || !c.enabled || c.sensor
      || c.skin!==0 || c.density!==0 || c.groups!==0x0004000f || c.solverGroups!==0xffffffff
      || c.activeTypes!==constants.ActiveCollisionTypes.DEFAULT
      || c.friction!==Math.fround(PHYSICS_MATERIALS[canonical.material].friction)
      || c.restitution!==Math.fround(PHYSICS_MATERIALS[canonical.material].restitution)
      || c.frictionRule!==constants.CoefficientCombineRule.Average || c.restitutionRule!==constants.CoefficientCombineRule.Average
      || !vectorEqual(c.local,pose.translation) || !vectorEqual(c.rotation,pose.rotation)) return false;
    const upper=[],lower=[],vertices=c.vertices;
    if(!vertices || vertices.length<18 || vertices.length%3) return false;
    for(let j=0;j<vertices.length;j+=3) {
      if(!Number.isFinite(vertices[j]) || !Number.isFinite(vertices[j+2]) || Math.abs(vertices[j+1])!==h.halfY) return false;
      (vertices[j+1]>0?upper:lower).push([vertices[j],vertices[j+2]]);
    }
    for(const face of [upper,lower]) {
      const actual=convexHull(face);
      if(!contained(actual,h.points,h.margin) || !contained(h.points,actual,h.margin)) return false;
    }
  }
  return true;
}

const ownerContexts = new WeakMap();
/** Called once by the real owner constructor before it exposes itself. Repeated registration
 * cannot acquire a capability for an existing owner. The capability stays in SG02 private state. */
export function registerOrchardOwner(owner, capability, lane, restoreCapability = null) {
  if (ownerContexts.has(owner) || !capability || typeof capability !== 'object') return false;
  ownerContexts.set(owner, { owner, capability, restoreCapability, lane, world: owner.world, records: owner.records,
    queue: owner._eventQueue, gate:observeOrchardWorld(lane), sources: new Set(), readyPods:new Set(), dormantFrames:new Map(), phase: 'idle', pendingTail: null, retired: false, quarantine: null });
  return true;
}
export function resetOrchardOwnerWorld(owner, capability, lane) {
  const ctx=ownerContexts.get(owner);
  if (!ctx || ctx.capability!==capability || ctx.retired || owner.records.size) return false;
  ctx.gate?.retire();ctx.gate=observeOrchardWorld(lane);ctx.world=owner.world; ctx.records=owner.records; ctx.queue=owner._eventQueue; ctx.lane=lane;
  ctx.sources.clear();ctx.readyPods.clear();ctx.pendingTail=null;ctx.phase='idle';return true;
}
export function retireOrchardOwner(owner, capability) {
  const ctx=ownerContexts.get(owner);
  if(!ctx || ctx.capability!==capability) return false;
  ctx.retired=true;ctx.pendingTail=null;ctx.gate?.retire();for(const rec of ctx.sources)leases.get(rec)?.watch?.retire();return true;
}
function contextCurrent(ctx) {
  return !!ctx && !ctx.retired && ownData(ctx.owner,['world','records','_eventQueue','_colliderOwners','_frameOrigin','_frameOriginSeq','attachments','_suspendedAttachments']) && ctx.owner.world===ctx.world && ctx.owner.records===ctx.records
    && ctx.owner._eventQueue===ctx.queue;
}
export function orchardOwnerAvailable(owner) {
  const ctx=ownerContexts.get(owner);
  return !ctx || (contextCurrent(ctx) && !ctx.quarantine && ctx.phase==='idle');
}
const motorStates=new WeakMap();
/** Explicit fresh motor storage; recurring binding never brands an arbitrary live copy. */
export function createOrchardMotorState(progress=[0,0,0],cycles=[0,0,0]) {
  const state=createOrchardCollarState(progress,cycles);
  for(let i=0;i<3;i++) Object.defineProperty(state.progress,String(i),{value:progress[i],enumerable:true,writable:true,configurable:false});
  Object.defineProperty(state.progress,'length',{writable:false});Object.preventExtensions(state.progress);
  Object.freeze(state.cycles);Object.freeze(state);
  motorStates.set(state,{progress:state.progress,cycles:state.cycles});return state;
}
function motorStorageCurrent(p) {
  const brand=motorStates.get(p.state);
  return brand && brand.claim===p && brand.progress===p.progress && brand.cycles===p.cycles
    && p.progress.every((value,i)=>{const d=Object.getOwnPropertyDescriptor(p.progress,String(i));return d && 'value' in d && d.writable && !d.configurable && value===p.values[i];});
}

function sourceRecordCurrent(ctx,rec,p) {
  return ownData(ctx.owner,['world','records','_eventQueue','_colliderOwners','_frameOrigin','_frameOriginSeq'])
    && ownData(rec,['entity','body','spec','collider','colliders','coincidentSpines']) && contextCurrent(ctx) && leases.get(rec)===p && p.owner===ctx.owner && p.world===ctx.world
    && ctx.records.get(p.id)===rec && rec.entity===p.entity && rec.body===p.body
    && rec.spec===p.recordSpec && rec.colliders.length===p.colliders.length && rec.collider===p.colliders[0]
    && rec.colliders.every((c,i)=>c===p.colliders[i] && ctx.owner._colliderOwners.get(c.handle)?.rec===rec
      && ctx.owner._colliderOwners.get(c.handle)?.collider===c) && retained(p) && contextCurrent(ctx);
}
function spineCurrent(rec,p) {
  return ownData(rec,['coincidentSpines']) && rec.coincidentSpines===p.spines && p.spines.length===p.spineMembers.length
    && p.spineMembers.every((spine,i)=>Object.getOwnPropertyDescriptor(p.spines,String(i))?.value===spine && ['ox','oz','ux','uz','halfLen'].every(key=>{
      const d=Object.getOwnPropertyDescriptor(spine,key);return d && 'value' in d && d.writable;
    }));
}
// A source-specific finite context is acquired only by explicit intake/cold transactions.
// Its row is a retained plain publication cell, never a callback or a recurring rebind.
function finiteMarkerCurrent(p){const d=Object.getOwnPropertyDescriptor(p.data,'orchardFiniteCustody'),old=p.finiteMarker;return old ? d && 'value' in d && d.value===1 && old.value===1 && d.writable===old.writable && d.configurable===old.configurable && d.enumerable===old.enumerable : d===undefined;}
function finiteCell(object,key){const d=Object.getOwnPropertyDescriptor(object,key);return d && 'value' in d?d:null;}
function finiteRowContext(state,restoreInputs=null){
 if(!ownData(state,['mode','tick','entities','sites','world']))return null;
 const sites=state.sites,entities=state.entities,world=state.world,cell=finiteCell(sites,'anvilOrchard');
 if(!cell?.writable || !inertTree(cell.value) || !ownData(world,['currentSectorId']))return null;
 const row=normalizeOrchardRecord(cell.value);
 // Only a validated private cold-adoption plan can retain custody while the visual
 // Continue gate holds loading. This does not authorize any live Orchard action.
 const loadingRestore=!!restoreInputs && coldInputPlans.get(restoreInputs)?.state===state
  && restoreInputsCurrent(restoreInputs);
 if(!row || !orchardHistoryFitsTick(row,state.tick) || (state.mode!=='flight' && !(state.mode==='loading' && loadingRestore)))return null;
 return {state,sites,entities,world,cell,row:cell.value,tree:retainInertTree(cell.value),loadingRestore};
}
function finiteContext(state,p,restoreInputs=null){
 const f=finiteRowContext(state,restoreInputs);
 return f && f.row.frameStatus==='intact' && f.row.sockets.every((s,i)=>s.cycle===p.cycles[i] && s.progress===p.values[i])
  && Map.prototype.get.call(f.entities,p.id)===p.entity ? f : null;
}
// Durable custody survives leaving the source sector. This grants no active intake,
// motor, collection or handoff authority; those use finiteRowCurrent below.
function finiteRowRetained(f,tick=null){
 if(!f || !ownData(f.state,['mode','tick','entities','sites','world']) || !ownData(f.world,['currentSectorId']))return false;
 const d=finiteCell(f.sites,'anvilOrchard');
 return (f.state.mode==='flight' || (f.state.mode==='loading' && f.loadingRestore===true)) && Number.isSafeInteger(f.state.tick) && f.state.tick>=0 && (tick===null || f.state.tick===tick)
  && f.state.entities===f.entities && f.state.sites===f.sites && f.state.world===f.world
  && d && d.value===f.row && d.writable===f.cell.writable && d.configurable===f.cell.configurable && d.enumerable===f.cell.enumerable
  && inertTreeUnchanged(f.row,f.tree) && orchardHistoryFitsTick(f.row,f.state.tick);
}
function finiteRowCurrent(f,tick=null){
 return finiteRowRetained(f,tick) && f.state.mode==='flight' && f.world.currentSectorId===ANVIL_ORCHARD.sectorId;
}
function finiteRetained(f,p,tick=null){
 return finiteRowRetained(f,tick) && Map.prototype.get.call(f.entities,p.id)===p.entity
  && f.row.sockets.every((s,i)=>s.cycle===p.cycles[i] && s.progress===p.values[i]);
}
function finiteCurrent(f,p,tick=null){
 return finiteRowCurrent(f,tick) && Map.prototype.get.call(f.entities,p.id)===p.entity
  && f.row.sockets.every((s,i)=>s.cycle===p.cycles[i] && s.progress===p.values[i]);
}
function finitePublication(f,next){
 const normalized=normalizeOrchardRecord(next);
 if(!normalized || !orchardHistoryFitsTick(normalized,f.state.tick))return null;
 const cell={...f.cell,value:normalized},successor={...f,cell,row:normalized,tree:retainInertTree(normalized)};
 return {next:normalized,publish(p){Object.defineProperty(f.sites,'anvilOrchard',cell);Object.assign(f,successor);p.finite=f;}};
}
function finiteIntake(p,state,socket,pod,amount,insertion){
 if(state===undefined)return p.finite || p.finiteMarker?null:{current:()=>true,publish:()=>{}};
 if(!ownData(state,['tick']))return null;
 const f=p.finite || finiteContext(state,p),tick=state.tick;
 if(!f || f.state!==state || !finiteCurrent(f,p,tick) || orchardPhase(f.row,tick)?.phase!=='calm')return null;
 const slot=f.row.sockets[socket],next=normalizeOrchardRecord(f.row);
 if(!slot || slot.operation!=='closed' || slot.progress!==0 || f.row.sourceRemaining<amount || pod.data.commodityId!==ANVIL_ORCHARD.commodityId)return null;
 if(insertion){
  if(!['empty','delivered','lost'].includes(slot.status) || slot.cycle>=4 || pod.cycle!==slot.cycle+1 || pod.data.amount!==amount)return null;
  const lotId=orchardLotId(socket,pod.cycle);next.lots.push({id:lotId,socket,cycle:pod.cycle,units:amount,outcome:'retained'});
  next.sockets[socket]={socket,cycle:pod.cycle,lotId,status:'stowed',operation:'closed',progress:0,handoff:'fixed',targetRevision:null,acceptedTick:null,completedTick:null,openedTick:null,readyTick:null,mountLostWork:0,mountLostTick:null};
 }else{
  const lot=next.lots.find(l=>l.id===slot.lotId);
  if(slot.status!=='stowed' || !lot || lot.units!==pod.data.amount || lot.units+amount>4)return null;
  lot.units+=amount;
 }
 next.sourceRemaining-=amount;const publication=finitePublication(f,next);if(!publication)return null;
 return {current:()=>finiteCurrent(f,p,tick),publish:publication.publish};
}
function finiteStep(p,socket,intent,token,nextValues){
 if(!p.finite)return {current:()=>true,publish:()=>{}};
 const f=p.finite,tick=token.canonicalTick;
 if(!finiteCurrent(f,p,tick) || orchardPhase(f.row,tick)?.phase!=='calm')return null;
 const slot=f.row.sockets[socket];
 const closing=intent.target===0 && ['delivered','lost'].includes(slot.status) && slot.handoff==='ready' && slot.operation==='closing';
 const opening=intent.target===30 && slot.status==='releasing' && slot.operation==='opening' && slot.handoff==='fixed';
 if((!opening && !closing) || slot.acceptedTick!==intent.acceptedTick || tick<=intent.admittedTick || slot.cycle!==intent.cycle)return null;
 const next=normalizeOrchardRecord(f.row),s=next.sockets[socket];s.progress=nextValues[socket];s.completedTick=tick;
 if(s.progress===30 && opening){s.operation='open';s.openedTick=tick;}
 if(s.progress===0 && closing)s.operation='closed';
 const publication=finitePublication(f,next);if(!publication)return null;
 return {current:()=>finiteCurrent(f,p,tick),publish:publication.publish};
}

/** Prepare a one-shot, exact native collection of a released finite Orchard lot. */
export function prepareOrchardPodCollection(owner,capability,entity,state){
 const ctx=ownerContexts.get(owner),q=podHandoffs.get(entity);
 if(!ctx || ctx.capability!==capability || !ctx.lane?.observationEnabled || !q || q.owner!==owner || q.ctx!==ctx
  || !q.resident || q.entity!==entity || q.state!==state || !orchardOwnerAvailable(owner))return null;
 const p=q.p,rec=Map.prototype.get.call(owner.records,p.id),f=p?.finite;
 if(!p || !rec || leases.get(rec)!==p || !f || f.state!==state || !finiteCurrent(f,p,state.tick)
  || !sourceRecordCurrent(ctx,rec,p) || !motorStorageCurrent(p))return null;
 const slot=f.row.sockets[q.socket],lot=slot && f.row.lots.find(l=>l.id===slot.lotId);
 if(!slot || slot.status!=='drifting' || slot.operation!=='open' || slot.handoff!=='ready'
  || !lot || lot.outcome!=='retained' || lot.units!==q.data.amount || q.data.commodityId!==ANVIL_ORCHARD.commodityId
  || !Number.isSafeInteger(state.tick) || !readOrchardPodReady(owner,entity,state))return null;
 const before=normalizeOrchardRecord(f.row);if(!before)return null;
 const next=normalizeOrchardRecord(before),nextSlot=next.sockets[q.socket],nextLot=next.lots.find(l=>l.id===nextSlot.lotId);
 nextLot.outcome='delivered';nextSlot.status='delivered';
 const publication=finitePublication(f,next);if(!publication)return null;
 const tick=state.tick;
 let status='pending';
 const current=()=>status==='pending' && ownerContexts.get(owner)===ctx && contextCurrent(ctx) && orchardOwnerAvailable(owner)
  && podHandoffs.get(entity)===q && q.owner===owner && q.ctx===ctx && q.entity===entity && q.state===state
  && Map.prototype.get.call(owner.records,p.id)===rec && leases.get(rec)===p && finiteCurrent(f,p,tick)
  && sourceRecordCurrent(ctx,rec,p) && motorStorageCurrent(p) && f.row.sockets[q.socket].status==='drifting'
  && f.row.sockets[q.socket].lotId===lot.id && f.row.lots.find(l=>l.id===lot.id)?.outcome==='retained'
  && readOrchardPodReady(owner,entity,state);
 return {preflight:current,commit(){if(!current())return false;publication.publish(p);status='committed';
   ctx.readyPods.delete(q);podHandoffs.delete(entity);if(q.record)readyRecordLeases.delete(q.record);entity.alive=false;return true;},abort(){if(status!=='pending')return false;status='aborted';return true;}};
}

/** Settle loss only from the ordinary destruction event for this exact resident ready pod. */
export function commitOrchardPodLoss(owner,capability,frame,entity,state,receipt){
 try{
  const ctx=ownerContexts.get(owner),q=podHandoffs.get(entity),rec=Map.prototype.get.call(owner.records,frame?.id),p=leases.get(rec),f=p?.finite;
  if(!ctx || ctx.capability!==capability || !ctx.lane?.observationEnabled || !orchardOwnerAvailable(owner)
   || !q || q.owner!==owner || q.ctx!==ctx || !q.resident || q.entity!==entity || q.state!==state || q.p!==p || !p || !f
   || !ownData(frame,['id','alive']) || frame!==p.entity || rec.entity!==frame || frame.alive===false
   || !ownData(state,['world','entities']) || !ownData(state.world,['currentSectorId'])
   || state.world.currentSectorId!==ANVIL_ORCHARD.sectorId || Map.prototype.get.call(state.entities,frame.id)!==frame
   || f.state!==state || !finiteCurrent(f,p,state.tick) || !sourceRecordCurrent(ctx,rec,p) || !motorStorageCurrent(p)
   || !ownData(entity,['id','alive','data']) || entity.alive!==false || Map.prototype.get.call(state.entities,entity.id)===entity
   || !ownData(receipt,['id','entity']) || receipt.id!==entity.id || receipt.entity!==entity
   || entity.data!==q.data || !Set.prototype.has.call(ctx.readyPods,q) || Map.prototype.get.call(owner.records,q.id)!==q.record || q.record?.entity!==entity)return false;
  const slot=f.row.sockets[q.socket],lot=slot && f.row.lots.find(l=>l.id===slot.lotId);
  if(!slot || slot.status!=='drifting' || slot.operation!=='open' || slot.handoff!=='ready'
   || !lot || lot.outcome!=='retained' || lot.units!==q.data.amount || q.data.commodityId!==ANVIL_ORCHARD.commodityId
   || q.receipt?.lotId!==slot.lotId || q.receipt?.cycle!==slot.cycle)return false;
  const next=normalizeOrchardRecord(f.row);if(!next)return false;
  next.lots.find(l=>l.id===slot.lotId).outcome='lost';next.sockets[q.socket].status='lost';
  const publication=finitePublication(f,next);if(!publication || !finiteCurrent(f,p,state.tick)
   || podHandoffs.get(entity)!==q || Map.prototype.get.call(owner.records,q.id)!==q.record)return false;
  publication.publish(p);Set.prototype.delete.call(ctx.readyPods,q);WeakMap.prototype.delete.call(podHandoffs,entity);
  if(q.record)WeakMap.prototype.delete.call(readyRecordLeases,q.record);return true;
 }catch(_){return false;}
}

/** Admit a close only from a fresh normal-service observation, never from saved history. */
export function requestOrchardFiniteClose(owner,capability,entity,socket,state){
 const ctx=ownerContexts.get(owner),rec=Map.prototype.get.call(owner.records,entity?.id),p=leases.get(rec),f=p?.finite;
 try{
  if(!ctx || ctx.capability!==capability || !ctx.lane || !orchardOwnerAvailable(owner) || !p || entity!==p.entity || !f
   || state!==f.state || !Number.isInteger(socket) || socket<0 || socket>2 || !finiteCurrent(f,p,state.tick)
   || !sourceRecordCurrent(ctx,rec,p) || !motorStorageCurrent(p) || !spineCurrent(rec,p)
   || orchardPhase(f.row,state.tick)?.phase!=='calm')return false;
  const slot=f.row.sockets[socket];
  if(!['delivered','lost'].includes(slot.status) || slot.handoff!=='ready' || !['open','closing'].includes(slot.operation))return false;
  const existing=p.intents[socket],repeated=slot.operation==='closing' && existing?.target===0 && existing.cycle===slot.cycle;
  if(existing && !repeated)return false;
  if(!repeated){const next=normalizeOrchardRecord(f.row);next.sockets[socket].operation='closing';
   const publication=finitePublication(f,next),intent=Object.freeze({target:0,acceptedTick:slot.acceptedTick,admittedTick:state.tick,cycle:slot.cycle});
   if(!publication || !finiteCurrent(f,p,state.tick) || !sourceRecordCurrent(ctx,rec,p) || !motorStorageCurrent(p))return false;
   publication.publish(p);p.intents[socket]=intent;
  }
  return true;
 }catch(_){return false;}
}
/** Explicit accepted release. Saved history cannot start a native motor on its own. */
export function requestOrchardFiniteRelease(owner,capability,entity,socket,state){
 const ctx=ownerContexts.get(owner);
 if(!ctx || ctx.capability!==capability || !ctx.lane || !orchardOwnerAvailable(owner) || !ownData(entity,['id']) || !Number.isInteger(socket) || socket<0 || socket>2)return false;
 const rec=Map.prototype.get.call(owner.records,entity.id),p=leases.get(rec),f=p?.finite;
 try{
  if(!p || entity!==p.entity || !f || state!==f.state || !finiteCurrent(f,p) || orchardPhase(f.row,state.tick)?.phase!=='calm'
   || !sourceRecordCurrent(ctx,rec,p) || !motorStorageCurrent(p) || !spineCurrent(rec,p))return false;
  const tick=state.tick,slot=f.row.sockets[socket];
  const resuming=slot.status==='releasing' && slot.operation==='opening' && slot.handoff==='fixed';
  const existing=p.intents[socket],repeated=resuming && existing?.acceptedTick===slot.acceptedTick && existing.target===30 && existing.cycle===slot.cycle;
  if(!resuming && (slot.status!=='stowed' || slot.operation!=='closed' || slot.handoff!=='fixed' || slot.progress!==0) || existing && !repeated)return false;
  let pod=null;Map.prototype.forEach.call(f.entities,e=>{const d=finiteCell(e,'data'),id=d && finiteCell(d.value,'worldRecordId');if(id?.value===slot.lotId){if(pod)throw Error('duplicate_orchard_lot');pod=e;}});
  const captured=pod && captureInsertionPod(pod,p,socket,p.cycles[socket]),podRec=captured && Map.prototype.get.call(owner.records,captured.id);
  if(!captured || !podRec || !ownData(podRec,['entity','body','spec','revision','collider','colliders']) || podRec.entity!==pod
   || captured.data.commodityId!==ANVIL_ORCHARD.commodityId || captured.data.amount!==f.row.lots.find(l=>l.id===slot.lotId)?.units)return false;
  const podRefs={body:podRec.body,spec:podRec.spec,collider:podRec.collider,colliders:podRec.colliders,revision:podRec.revision};
  const podCurrent=()=>captured.current() && ownData(podRec,['entity','body','spec','revision','collider','colliders']) && podRec.entity===pod
   && Object.keys(podRefs).every(k=>podRec[k]===podRefs[k]) && Map.prototype.get.call(owner.records,captured.id)===podRec && Map.prototype.get.call(f.entities,captured.id)===pod;
  if(!ownData(owner,['_frameOrigin','_frameOriginSeq']) || !ownData(owner._frameOrigin,['x','z']))throw Error('orchard_origin_accessor');
  const originRef=owner._frameOrigin,origin={x:originRef.x,z:originRef.z},sequence=owner._frameOriginSeq,observation=prepareOrchardNativeObservation(owner,ctx.lane);
  const next=normalizeOrchardRecord(f.row);if(!resuming)Object.assign(next.sockets[socket],{status:'releasing',operation:'opening',acceptedTick:tick});
  const publication=finitePublication(f,next),intent=Object.freeze({target:30,acceptedTick:next.sockets[socket].acceptedTick,admittedTick:tick,cycle:p.cycles[socket]});
  if(!publication || !sourceRecordCurrent(ctx,rec,p) || !motorStorageCurrent(p) || !finiteCurrent(f,p,tick) || !podCurrent()
   || !noRecoveryConstraints(owner,rec,p) || !noRecoveryConstraints(owner,podRec,{id:captured.id,body:podRefs.body})
   || owner._frameOrigin!==originRef || !ownData(originRef,['x','z']) || originRef.x!==origin.x || originRef.z!==origin.z || owner._frameOriginSeq!==sequence)return false;
  const snapshot=observation.scan();
  if(!observationMatches(snapshot.byHandle.get(p.body.handle),p,origin,ctx.lane.constants)
   || !insertionPodMatches(snapshot.byHandle.get(podRefs.body.handle),expectedOrchardPod(p,socket,origin,ctx.lane.constants),podRec,ctx.lane.constants)
   || snapshot.attached.get(p.body.handle)?.length || snapshot.attached.get(podRefs.body.handle)?.length)return false;
  if(!repeated){publication.publish(p);p.intents[socket]=intent;}return true;
 }catch(_){return false;}
}

export function requestOrchardMotion(owner,capability,entity,socket,target,canonicalTick) {
  const ctx=ownerContexts.get(owner),rec=owner.records.get(entity?.id),p=leases.get(rec);
  try {
    if(!ctx || ctx.capability!==capability || !ctx.lane || ctx.phase!=='idle' || ctx.quarantine
      || !p || p.finite || p.finiteMarker || entity!==p.entity || rec.entity!==entity || !Number.isSafeInteger(socket) || socket<0 || socket>2 || ![0,30].includes(target)
      || !Number.isSafeInteger(canonicalTick) || canonicalTick<0 || !sourceRecordCurrent(ctx,rec,p)
      || !motorStorageCurrent(p) || !spineCurrent(rec,p)) return false;
    if(p.values[socket]===target) return true;
    const existing=p.intents[socket];
    if(existing && existing.target===target) return true;
    p.intents[socket]=Object.freeze({target,acceptedTick:canonicalTick,cycle:p.cycles[socket]});return true;
  } catch(_){return false;}
}
export function beginOrchardOwnerStep(owner,capability) {
  const ctx=ownerContexts.get(owner);
  if(!ctx || ctx.capability!==capability || !contextCurrent(ctx) || ctx.quarantine) return null;
  if(ctx.phase!=='idle') {if(ctx.pendingTail)ctx.pendingTail.cancelled=true;return null;}
  ctx.pendingTail=null;ctx.phase='solve';ctx.gate?.phase('solve');
  return {context:ctx,world:ctx.world,records:ctx.records,queue:ctx.queue,firstTick:owner.tick};
}
export function orchardStepCurrent(owner,capability,boundary) {
  const ctx=ownerContexts.get(owner);
  return !!boundary && ctx===boundary.context && ctx.capability===capability && contextCurrent(ctx)
    && ctx.phase==='solve' && owner.world===boundary.world && owner.records===boundary.records && owner._eventQueue===boundary.queue;
}
export function finishOrchardOwnerStep(owner,capability,boundary,canonicalTick,completed) {
  if(!orchardStepCurrent(owner,capability,boundary)) return null;
  const ctx=boundary.context;ctx.phase='idle';ctx.gate?.phase('idle');
  if(!completed || !Number.isSafeInteger(canonicalTick) || canonicalTick<0) return null;
  const token=Object.freeze({nativeTick:owner.tick,canonicalTick});
  ctx.pendingTail={token,cancelled:false,worldSerial:ctx.gate?.serial(),contacts:owner._contactImpacts};return token;
}
export function cancelOrchardOwnerStep(owner,capability,boundary) {
  const ctx=ownerContexts.get(owner);
  if(ctx===boundary?.context && ctx.capability===capability && contextCurrent(ctx)) {ctx.phase='idle';ctx.gate?.phase('idle');ctx.pendingTail=null;}
}
function nativeContract(snapshot,skip=new Set()) {
  return JSON.stringify(snapshot.bodies.map(body=>({handle:body.handle,t:body.t,q:body.q,v:body.v,w:body.w,
    enabled:body.enabled,type:body.type,ccd:body.ccd,gravityScale:body.gravityScale,
    mass:body.mass,localCom:body.localCom,principalInertia:body.principalInertia,principalFrame:body.principalFrame,effectiveInvMass:body.effectiveInvMass,effectiveInvInertia:body.effectiveInvInertia,linearDamping:body.linearDamping,angularDamping:body.angularDamping,
    colliders:body.colliders.map(({body:parent,object,...c})=>skip.has(c.handle)?{...c,local:null,rotation:null}:c)})));
}
function advanceOrchardPair(ctx,rec,p,socket,intent,token) {
  const owner=ctx.owner;
  if(!sourceRecordCurrent(ctx,rec,p) || !motorStorageCurrent(p) || !spineCurrent(rec,p)) return false;
  if(!ownData(owner,['_frameOrigin','_frameOriginSeq']) || !ownData(owner._frameOrigin,['x','z']))return false;
  const origin={x:owner._frameOrigin.x,z:owner._frameOrigin.z},originRef=owner._frameOrigin,originSeq=owner._frameOriginSeq;
  const current=()=>sourceRecordCurrent(ctx,rec,p) && motorStorageCurrent(p) && spineCurrent(rec,p)
    && ownData(owner,['_frameOrigin','_frameOriginSeq']) && ownData(originRef,['x','z'])
    && owner._frameOrigin===originRef && originRef.x===origin.x && originRef.z===origin.z && owner._frameOriginSeq===originSeq;
  const observation=prepareOrchardNativeObservation(owner,ctx.lane);
  if(!current()) return false;
  for(const attachment of [...owner.attachments.values(),...owner._suspendedAttachments.values()]) {
    if(attachment.owner===rec || attachment.target===rec || attachment.ownerId===p.entity.id || attachment.targetId===p.entity.id)return false;
  }
  if(!current())return false;
  const before=observation.scan(),frame=before.byHandle.get(p.body.handle);
  if(before.attached.get(p.body.handle)?.length)return false;
  if(!observationMatches(frame,p,origin,ctx.lane.constants)) return false;
  const direction=Math.sign(intent.target-p.values[socket]),nextValues=[...p.values];nextValues[socket]+=direction;
  const finite=finiteStep(p,socket,intent,token,nextValues);if(!finite)return false;
  const moves=G.rigs.filter(r=>r.socket===socket).map(r=>{const index=G.parts.findIndex(part=>part.id===r.partId);
    return {index,...orchardPartPose(index,nextValues),pivot:r.pivot,angle:direction*r.yawSign*Math.PI/60};});
  const clearance=orchardPairClearance(before,p.body.handle,moves,ctx.lane.constants,G);
  if(!clearance.clear) {p.lastRefusal=clearance;return false;}
  const selected=new Set(moves.map(m=>p.colliders[m.index].handle));
  const beforeContract=nativeContract(before,selected),nextStateContract=JSON.stringify({...p.state,progress:nextValues});
  const oldPoses=moves.map(m=>orchardPartPose(m.index,p.values)), recoveryBoundary=retainRecoveryBoundary(ctx,rec,p);
  const motorDispatchCurrent=()=>ctx.lane.verify() && ctx.lane.matchesObject('bodies',p.body,p.body.handle)
    && moves.every(move=>{const c=p.colliders[move.index];return ctx.lane.matchesObject('colliders',c,c.handle);});
  const privateContextCurrent=()=>ownerContexts.get(owner)===ctx && !ctx.retired && ctx.world===p.world && leases.get(rec)===p;
  const quarantine=error=>{ctx.quarantine={record:rec,lease:p,reason:String(error.message),token,before,moves,originRef,origin,originSeq,recoveryBoundary,removed:new Set(),expectedOrder:[...p.colliders],ticket:null};};
  let touched=false;
  ctx.phase='motor';ctx.gate?.phase('motor');
  try {
    for(const move of moves) {
      if(!current() || !finite.current() || !motorDispatchCurrent()) throw new Error('orchard_motor_source_changed');
      const collider=p.colliders[move.index];
      touched=true;collider.setTranslationWrtParent(move.translation);
      if(!current() || !finite.current() || !motorDispatchCurrent()) throw new Error('orchard_motor_source_changed');
      collider.setRotationWrtParent(move.rotation);
      if(!current() || !finite.current() || !motorDispatchCurrent()) throw new Error('orchard_motor_source_changed');
    }
    // Callback-capable authored preflight ends here. The scan and everything after it
    // use retained native dispatch, copied observations and private owned storage only.
    if(!observation.current() || !current() || !finite.current() || !noRecoveryConstraints(owner,rec,p)) throw new Error('orchard_motor_source_changed');
    const after=observation.scan();
    if(JSON.stringify(after.joints)!==JSON.stringify(before.joints) || after.attached.get(p.body.handle)?.length
      || nativeContract(after,selected)!==beforeContract || !observationMatches(after.byHandle.get(p.body.handle),{...p,values:nextValues},origin,ctx.lane.constants)) throw new Error('orchard_motor_native_changed');
    finite.publish(p);p.progress[socket]=nextValues[socket];p.values=nextValues;p.stateContract=nextStateContract;
    p.lastTicks[socket]=token.canonicalTick;p.poseRevision=(p.poseRevision||0)+1;
    for(const move of moves) {const spine=p.spineMembers[move.index];spine.ox=Math.fround(move.translation.x);spine.oz=Math.fround(move.translation.z);}
    if(nextValues[socket]===intent.target)p.intents[socket]=null;
    p.completedReceipt=Object.freeze({kind:'completed-step',provenance:'native-tail',sourceSha:G.sourceSha,
      bindingRevision:p.bindingRevision,poseRevision:p.poseRevision,progress:Object.freeze([...nextValues]),
      completedNativeTick:token.nativeTick,canonicalTick:token.canonicalTick});
    if(p.watch)retainPosePublication(ctx,rec,p,after.byHandle.get(p.body.handle),origin,originSeq,originRef);
    return true;
  } catch(error) {
    if(!contextCurrent(ctx)) {if(touched && privateContextCurrent())quarantine(error);return false;}
    let restored=!touched;
    if(touched) try {
      for(let i=0;i<moves.length;i++) {
        if(!current() || !motorDispatchCurrent())throw new Error('orchard_rollback_source_changed');
        p.colliders[moves[i].index].setTranslationWrtParent(oldPoses[i].translation);
        if(!current() || !motorDispatchCurrent())throw new Error('orchard_rollback_source_changed');
        p.colliders[moves[i].index].setRotationWrtParent(oldPoses[i].rotation);
      }
      if(!current() || !observation.current())throw new Error('orchard_rollback_source_changed');
      const rollback=observation.scan();restored=nativeContract(rollback)===nativeContract(before)
        && JSON.stringify(rollback.joints)===JSON.stringify(before.joints) && !rollback.attached.get(p.body.handle)?.length
        && noRecoveryConstraints(owner,rec,p);
    } catch(_){restored=false;}
    if(!restored)quarantine(error);
    return false;
  } finally {if(privateContextCurrent()){ctx.phase='idle';ctx.gate?.phase(ctx.quarantine?'quarantine':'idle');}}
}
export function publishOrchardCompletedContacts(owner,capability,token,publisher) {
  const ctx=ownerContexts.get(owner);
  if(!ctx || ctx.capability!==capability || !contextCurrent(ctx) || ctx.quarantine || ctx.phase!=='idle' || typeof publisher!=='function') return null;
  const pending=ctx.pendingTail;
  if(pending ? pending.token!==token : token!==null) return null;
  ctx.phase='contacts';ctx.gate?.phase('contacts');
  let result;
  try {result=publisher();}
  catch(error){if(contextCurrent(ctx)){ctx.pendingTail=null;ctx.phase='idle';ctx.gate?.phase('idle');}throw error;}
  if(!contextCurrent(ctx))return null;
  ctx.phase='idle';ctx.gate?.phase('idle');ctx.pendingTail=null;
  if(!pending || pending.cancelled || ctx.gate?.serial()!==pending.worldSerial || owner.tick!==token.nativeTick
    || owner._contactImpacts!==pending.contacts || pending.contacts.length)return result;
  for(const rec of [...ctx.sources]) {
    const p=leases.get(rec);
    if(!p || !sourceRecordCurrent(ctx,rec,p))continue;
    for(let socket=0;socket<3;socket++) {
      const intent=p.intents?.[socket];
      if(!intent || token.canonicalTick<=(intent.admittedTick??intent.acceptedTick) || token.canonicalTick<=p.lastTicks[socket]
        || intent.cycle!==p.cycles[socket])continue;
      try {advanceOrchardPair(ctx,rec,p,socket,intent,token);} catch(_){/* A refusal leaves the pending intent and scalar pose unchanged. */}
      if(!contextCurrent(ctx) || ctx.quarantine)return result;
    }
  }
  return result;
}

export function orchardNativeExportReady(owner) {
  const ctx=ownerContexts.get(owner);
  return !ctx || (contextCurrent(ctx) && !ctx.quarantine && (ctx.phase==='idle' || ctx.phase==='contacts'));
}

function cachedPoseCurrent(ctx,rec,p) {
  const cached=p.presentation,lane=ctx?.lane;
  if(!cached || !p.watch || !sourceRecordCurrent(ctx,rec,p) || ctx.quarantine || ctx.phase==='motor' || ctx.phase==='solve'
    || p.watch.serial()!==cached.serial || ctx.owner._frameOrigin!==cached.origin
    || !ownData(cached.origin,['x','z']) || cached.origin.x!==cached.x || cached.origin.z!==cached.z || ctx.owner._frameOriginSeq!==cached.sequence
    || !lane.verify() || !lane.matchesObject('bodies',p.body,p.body.handle)
    || p.colliders.some(c=>!lane.matchesObject('colliders',c,c.handle)))return false;
  if(!lane.rawRead('bodies','contains',p.body.handle) || lane.rawRead('bodies','rbNumColliders',p.body.handle)!==p.colliders.length)return false;
  for(let i=0;i<p.colliders.length;i++)if(!lane.rawRead('colliders','contains',p.colliders[i].handle)
    || lane.rawRead('colliders','coParent',p.colliders[i].handle)!==p.body.handle
    || lane.rawRead('bodies','rbCollider',p.body.handle,i)!==p.colliders[i].handle)return false;
  const t=lane.converted('bodies','rbTranslation',p.body.handle),q=lane.converted('bodies','rbRotation',p.body.handle,true);
  return Object.keys(cached.root.t).every(key=>t?.[key]===cached.root.t[key])
    && Object.keys(cached.root.q).every(key=>q?.[key]===cached.root.q[key]);
}
function retainPosePublication(ctx,rec,p,body,origin,sequence,originRef) {
  const receipt=p.completedReceipt || Object.freeze({kind:'pose-only',provenance:p.provenance,sourceSha:G.sourceSha,
    bindingRevision:p.bindingRevision,poseRevision:p.poseRevision||0,progress:Object.freeze([...p.values]),completedNativeTick:null});
  p.presentation={receipt,serial:p.watch.serial(),origin:originRef,x:origin.x,z:origin.z,sequence,root:{t:body.t,q:body.q}};
}
/** Simulation publication is distinct from snapshot validation and completed-step authority. */
export function publishOrchardPoseReceipts(owner,capability) {
  const ctx=ownerContexts.get(owner);
  if(!ctx || ctx.capability!==capability || !contextCurrent(ctx) || !ctx.lane || ctx.phase!=='idle' || ctx.quarantine)return false;
  for(const rec of ctx.sources) {
    const p=leases.get(rec);
    try {
      if(!p?.watch || !sourceRecordCurrent(ctx,rec,p))continue;
      if(p.presentation && cachedPoseCurrent(ctx,rec,p))continue;
      p.presentation=null;
      if(!ownData(owner,['_frameOrigin','_frameOriginSeq']) || !ownData(owner._frameOrigin,['x','z']))throw Error('orchard_origin_accessor');
  const originRef=owner._frameOrigin,origin={x:originRef.x,z:originRef.z},sequence=owner._frameOriginSeq;
      const observation=prepareOrchardNativeObservation(owner,ctx.lane,rec),serial=p.watch.serial();
      if(!sourceRecordCurrent(ctx,rec,p) || owner._frameOrigin!==originRef || !ownData(originRef,['x','z']) || originRef.x!==origin.x || originRef.z!==origin.z || owner._frameOriginSeq!==sequence)continue;
      const snapshot=observation.scan(),body=snapshot.byHandle.get(p.body.handle);
      if(!observationMatches(body,p,origin,ctx.lane.constants) || p.watch.serial()!==serial)continue;
      retainPosePublication(ctx,rec,p,body,origin,sequence,originRef);
    }catch(_){if(p)p.presentation=null;}
  }
  return true;
}
function dormantFrameCurrent(ctx,p){
 return contextCurrent(ctx) && ctx.dormantFrames.get(p.entity)===p && retained(p) && motorStorageCurrent(p)
  && (!p.finite || finiteRetained(p.finite,p)) && Map.prototype.get.call(ctx.records,p.id)===undefined;
}
export function prepareOrchardResidencyRetirement(owner,record){
 const ctx=ownerContexts.get(owner),p=leases.get(record),q=readyRecordLeases.get(record);
 if(!contextCurrent(ctx) || !ctx.lane || ctx.phase!=='idle' || (!p && !q))return null;
 if(p && (!sourceRecordCurrent(ctx,record,p) || (p.finite && !finiteRetained(p.finite,p)) || !motorStorageCurrent(p)))return null;
 if(q && !readyPodReferences(q))return null;
 const world=ctx.world,entity=record.entity,id=entity.id,body=record.body,handle=body.handle,array=record.colliders;
 const spec=record.spec,colliders=array.map(c=>[c,Object.getOwnPropertyDescriptor(c,'handle')?.value]);
 const maps=owner._colliderOwners,dynamic=owner.dynamicRecords,workfleet=owner.ceresWorkfleetRecords;
 const entries=colliders.map(([c,h])=>[h,Map.prototype.get.call(maps,h),c]);let running=false,done=false;
 const current=()=>contextCurrent(ctx) && ownData(owner,['_colliderOwners','dynamicRecords','ceresWorkfleetRecords'])
  && owner._colliderOwners===maps && owner.dynamicRecords===dynamic && owner.ceresWorkfleetRecords===workfleet
  && ownData(record,['entity','body','spec','collider','colliders']) && record.entity===entity && record.body===body && record.spec===spec && record.colliders===array && record.collider===colliders[0][0]
  && Map.prototype.get.call(ctx.records,id)===record && Object.getOwnPropertyDescriptor(body,'handle')?.value===handle
  && Object.getOwnPropertyDescriptor(array,'length')?.value===colliders.length && colliders.every(([c,h],i)=>Object.getOwnPropertyDescriptor(array,String(i))?.value===c && Object.getOwnPropertyDescriptor(c,'handle')?.value===h)
  && entries.every(([h,e,c])=>Map.prototype.get.call(maps,h)===e && ownData(e,['rec','collider']) && e.rec===record && e.collider===c)
  && (!p || retained(p) && (!p.finite || finiteRetained(p.finite,p)) && motorStorageCurrent(p)) && (!q || readyPodCustodyCurrent(q));
 const raw=(kind,name,...args)=>ctx.lane.rawRead(kind,name,...args);
 const claimed=()=>{
  let result=false;
  Map.prototype.forEach.call(ctx.records,r=>{if(r!==record){const b=Object.getOwnPropertyDescriptor(r,'body'),cs=Object.getOwnPropertyDescriptor(r,'colliders');
   if(b && 'value' in b && b.value===body)result=true;
   if(cs && 'value' in cs && Array.isArray(cs.value))for(let i=0;i<cs.value.length;i++)if(colliders.some(([c])=>Object.getOwnPropertyDescriptor(cs.value,String(i))?.value===c))result=true;
  }});
  if(raw('bodies','contains',handle)){
   for(const kind of ['impulseJoints','multibodyJoints'])raw(kind,'forEachJointAttachedToRigidBody',handle,()=>{result=true;});
   const count=raw('bodies','rbNumColliders',handle);for(let i=0;i<count;i++)if(!colliders.some(([,h])=>h===raw('bodies','rbCollider',handle,i)))result=true;
  }
  return result;
 };
 const release=()=>{if(contextCurrent(ctx) && ctx.residency===ticket){ctx.residency=null;ctx.phase='idle';ctx.gate?.phase('idle');}};
 const ticket={run(){
  if(done || running || !current() || (ctx.residency && ctx.residency!==ticket))return false;
  running=true;ctx.residency=ticket;ctx.phase='custody';ctx.pendingTail=null;ctx.gate?.enable();ctx.gate?.phase('custody');
  try{
   if(claimed())return false;
   for(const [c,h] of colliders){
    if(!current() || claimed())return false;
    if(raw('colliders','contains',h)){world.removeCollider(c,false);if(!current())return false;}
   }
   if(!current() || claimed())return false;
   if(raw('bodies','contains',handle)){world.removeRigidBody(body);if(!current())return false;}
   if(raw('bodies','contains',handle) || colliders.some(([,h])=>raw('colliders','contains',h)) || !current())return false;
   // The exact old allocation is gone. All public owner bookkeeping and the private
   // same-life return permission publish together through retained built-in storage.
   detachOrchardFrame(owner,record);
   Set.prototype.delete.call(dynamic,record);Set.prototype.delete.call(workfleet,record);
   for(const [,h] of colliders)Map.prototype.delete.call(maps,h);
   Map.prototype.delete.call(ctx.records,id);
   if(p)ctx.dormantFrames.set(entity,p);
   if(q){q.resident=false;q.record=null;podHandoffs.set(entity,q);ctx.readyPods.add(q);}
   done=true;release();return true;
  }catch(error){
   // A failure before the first native change keeps the original lease usable and may
   // retry normally. Partial retirement stays no-solve and resumes this exact ticket.
   if(current() && raw('bodies','contains',handle) && colliders.every(([,h])=>raw('colliders','contains',h)))release();
   throw error;
  }finally{running=false;}
 }};
 return ticket;
}
export function retainOrchardResidentPod(owner,record){
 const ctx=ownerContexts.get(owner),prior=podHandoffs.get(record.entity);
 if(!prior || prior.resident || prior.ctx!==ctx || !contextCurrent(ctx) || !readyPodCustodyCurrent(prior))return false;
 const p={...prior.p,finite:prior.f},next=makeReadyPodLease(owner,ctx,record,record.entity,p,prior.socket,prior.state,prior.spec,prior.data,'resident-return');
 if(!next)return false;
 try{const observation=prepareOrchardNativeObservation(owner,ctx.lane);if(!readyPodCustodyCurrent(prior) || !readyPodReferences(next) || !contextCurrent(ctx))return false;
  const ccd=record.ccdEnabled,snapshot=observation.scan();if(!readyPodNativeMatches(snapshot.byHandle.get(next.bodyHandle),next,ctx.lane.constants,ccd))return false;
  ctx.readyPods.delete(prior);ctx.readyPods.add(next);podHandoffs.set(next.entity,next);readyRecordLeases.set(record,next);return true;
 }catch(_){return false;}
}

export function detachOrchardFrame(owner,record) {
  const ctx=ownerContexts.get(owner),p=leases.get(record),ready=readyRecordLeases.get(record);
  if(ready?.owner===owner && Map.prototype.get.call(owner.records,ready.id)===record){ctx?.readyPods.delete(ready);if(podHandoffs.get(ready.entity)===ready)podHandoffs.delete(ready.entity);readyRecordLeases.delete(record);}
  if(p?.owner!==owner || Map.prototype.get.call(owner.records,p.id)!==record)return;
  p.watch?.retire();p.presentation=null;ctx?.sources.delete(record);if(ctx && !ctx.sources.size)ctx.gate?.enable(false);leases.delete(record);
}

export function permitOrchardNativeSolve(owner,capability) {
 const ctx=ownerContexts.get(owner);
 if(!ctx || ctx.capability!==capability || !contextCurrent(ctx) || ctx.phase!=='solve' || ctx.quarantine)return false;
 return ctx.gate?ctx.gate.permit():true;
}

export function orchardNativeMutationReady(owner) {
 const ctx=ownerContexts.get(owner);
 return !ctx || (contextCurrent(ctx) && !ctx.quarantine && !['motor','custody'].includes(ctx.phase));
}

// Retained before the first tentative setter. Recovery cannot recapture a successor or a
// same-world source replacement, even when every public scalar happens to compare equal.
function recoveryTransientStorage(entity,data) {
  // Only the vectors and angular velocity consumed by the private constructor are
  // inspected here. Descriptor values include non-enumerable coordinates: vector3
  // reads y even though the simulation is planar.
  const angular=Object.getOwnPropertyDescriptor(entity,'angVel');
  if(!angular || !('value' in angular) || !Number.isFinite(angular.value))return false;
  // The fixed-frame constructor still visits the ordinary Ceres classifier. Missing
  // optional role data must stay absent, rather than fall through to a prototype getter.
  const role=Object.getOwnPropertyDescriptor(data,'ceresWorkfleetRole');
  if(role ? !('value' in role) : 'ceresWorkfleetRole' in data)return false;
  return ['pos','prevPos','vel'].every(key=>{
    const d=Object.getOwnPropertyDescriptor(entity,key);
    if(!d)return !(key in entity);
    if(!('value' in d))return false;
    if(d.value==null)return true;
    const vector=d.value;
    return typeof vector==='object' && Reflect.ownKeys(vector).every(axis=>'value' in Object.getOwnPropertyDescriptor(vector,axis))
      && ['x','y','z'].every(axis=>{
        const coordinate=Object.getOwnPropertyDescriptor(vector,axis);
        return coordinate ? 'value' in coordinate && Number.isFinite(coordinate.value) : axis==='y' && !(axis in vector);
      });
  });
}
function recoveryRecordStorage(record) {
  return Reflect.ownKeys(record).every(key=>{
    const d=Object.getOwnPropertyDescriptor(record,key);
    return !d.enumerable || 'value' in d;
  });
}
function retainRecoveryBoundary(ctx,rec,p) {
  const owner=ctx.owner, maps=['records','_colliderOwners','attachments','_suspendedAttachments'];
  const rows=maps.map(key=>({key,map:owner[key],entries:[...owner[key]]}));
  const sets=['dynamicRecords','ceresWorkfleetRecords'].map(key=>({key,value:owner[key],members:[...Set.prototype.values.call(owner[key])]}));
  const handles=[p.body,...p.colliders].map(object=>({object,handle:Object.getOwnPropertyDescriptor(object,'handle')?.value}));
  const records=[...owner.records.values()].map(r=>({r,entity:r.entity,body:r.body,spec:r.spec,collider:r.collider,array:r.colliders,members:[...r.colliders]}));
  const entries=[...owner._colliderOwners.values()].map(e=>({e,rec:e.rec,collider:e.collider}));
  const references=()=>ownData(owner,['world','records','_eventQueue','_colliderOwners','attachments','_suspendedAttachments','_frameOrigin','_frameOriginSeq','dynamicRecords','ceresWorkfleetRecords'])
    && sets.every(x=>owner[x.key]===x.value && Object.getOwnPropertyDescriptor(Set.prototype,'size').get.call(x.value)===x.members.length
      && [...Set.prototype.values.call(x.value)].every((member,i)=>member===x.members[i]))
    && handles.every(x=>{const d=Object.getOwnPropertyDescriptor(x.object,'handle');return d && 'value' in d && d.value===x.handle;})
    && contextCurrent(ctx) && leases.get(rec)===p && ownData(rec,['entity','body','spec','collider','colliders','coincidentSpines'])
    && recoveryRecordStorage(rec) && recoveryTransientStorage(p.entity,p.data)
    && rec.entity===p.entity && rec.body===p.body
    && ownData(p.entity,['id','occupantGeneration','data','physicsBody','pos','rot']) && ownData(p.entity.pos,['x','z'])
    && ownData(p.data,['orchardCollars']) && p.entity.id===p.id && p.entity.occupantGeneration===p.life
    && p.entity.data===p.data && p.entity.physicsBody===p.spec && p.data.orchardCollars===p.state
    && p.entity.pos.x===p.root.x && p.entity.pos.z===p.root.z && p.entity.rot===p.root.rot
    && rows.every(r=>owner[r.key]===r.map && Object.getOwnPropertyDescriptor(Map.prototype,'size').get.call(r.map)===r.entries.length && r.entries.every(([key,v])=>Map.prototype.get.call(r.map,key)===v))
    && records.every(x=>ownData(x.r,['entity','body','spec','collider','colliders']) && x.r.entity===x.entity && x.r.body===x.body && x.r.spec===x.spec && x.r.collider===x.collider
      && x.r.colliders===x.array && x.array.length===x.members.length && x.members.every((c,i)=>Object.getOwnPropertyDescriptor(x.array,String(i))?.value===c))
    && entries.every(x=>ownData(x.e,['rec','collider']) && x.e.rec===x.rec && x.e.collider===x.collider);
  const full=()=>references() && sourceRecordCurrent(ctx,rec,p) && motorStorageCurrent(p) && spineCurrent(rec,p) && retained(p) && references();
  full.references=references;return full;
}
function noRecoveryConstraints(owner,rec,p) {
  if(!ownData(owner,['attachments','_suspendedAttachments']))return false;
  const read=(object,key)=>{const d=object && Object.getOwnPropertyDescriptor(object,key);if(d && !('value' in d))throw new Error('orchard_attachment_accessor');return d?.value;};
  const touches=a=>a && (read(a,'owner')===rec || read(a,'target')===rec || read(a,'ownerId')===p.id || read(a,'targetId')===p.id
    || read(read(a,'owner'),'body')===p.body || read(read(a,'target'),'body')===p.body);
  return [read(owner,'attachments'),read(owner,'_suspendedAttachments')].every(map=>[...Map.prototype.values.call(map)].every(a=>!touches(a) && !touches(read(a,'attachment'))));
}
function recoveryView(owner,q,ticket) {
  const view=Object.create(Object.getPrototypeOf(owner));
  Object.defineProperties(view,Object.getOwnPropertyDescriptors(owner));
  view.records=new Map(Map.prototype.entries.call(owner.records));view._colliderOwners=new Map(Map.prototype.entries.call(owner._colliderOwners));
  view.dynamicRecords=new Set(Set.prototype.values.call(owner.dynamicRecords));view.ceresWorkfleetRecords=new Set(Set.prototype.values.call(owner.ceresWorkfleetRecords));
  view._frameScratch={x:0,z:0};view._globalScratch={x:0,z:0};
  // A private view has no owner capability and never solves, exports, or disposes its world.
  recoveryViews.set(view,{references:ticket.references || ticket.current,full:ticket.current});return view;
}
function recoverySnapshot(ctx,q,guard) {
  const owner=ctx.owner,view=recoveryView(owner,q,{current:()=>true}),p=q.lease;
  const remaining=q.expectedOrder;
  if(q.bodyRemoved)view.records.delete(p.id);
  else {const retained={entity:p.entity,body:p.body,spec:p.recordSpec,colliders:remaining,collider:remaining[0]};view.records.set(p.id,retained);
    for(const c of remaining)view._colliderOwners.set(c.handle,{rec:retained,collider:c});}
  for(const c of q.removed)view._colliderOwners.delete(c.handle);
  const t=q.ticket;
  if(t?.record) {
    const key=Symbol('orchard-recovery-stage');view.records.set(key,t.record);
    for(const c of t.record.colliders)view._colliderOwners.set(c.handle,Map.prototype.get.call(t.view._colliderOwners,c.handle));
  }
  const observation=prepareOrchardNativeObservation(view,ctx.lane);
  if(!guard())throw new Error('orchard_recovery_source_changed');
  return observation.scan();
}
function recoveryExpectedContract(q) {
  const p=q.lease;
  return nativeContract({bodies:q.before.bodies.filter(b=>!q.bodyRemoved || b.handle!==p.body.handle).map(b=>b.handle!==p.body.handle?b:
    {...b,colliders:q.expectedOrder.map(c=>b.colliders.find(row=>row.object===c))})},new Set(q.moves.map(m=>p.colliders[m.index].handle)));
}
function recoveryNativeCurrent(ctx,q,snapshot) {
  const p=q.lease,t=q.ticket,selected=new Set(q.moves.map(m=>p.colliders[m.index].handle));
  if(snapshot.attached.get(p.body.handle)?.length || (t?.body && snapshot.attached.get(t.body.handle)?.length))return false;
  if(JSON.stringify(snapshot.joints)!==JSON.stringify(q.before.joints))return false;
  const peers={bodies:snapshot.bodies.filter(b=>b.object!==t?.body)};
  if(nativeContract(peers,selected)!==recoveryExpectedContract(q))return false;
  if(t?.record) {
    const staged=leases.get(t.record);
    if(!staged || !observationMatches(snapshot.byHandle.get(t.body.handle),staged,q.origin,ctx.lane.constants))return false;
  }
  return true;
}
/** Same-world, fixed-frame-only recovery. A failure keeps quarantine and exact allocation
 * custody for a later retry or a deliberate cold-world replacement. No solve occurs here. */
export function recoverOrchardFrame(owner,capability,createRecord,allocationClaimed) {
  const residency=ownerContexts.get(owner);if(residency?.capability===capability && residency.residency){try{return residency.residency.run();}catch(_){return false;}}
  const ctx=ownerContexts.get(owner),q=ctx?.quarantine;
  if(!q || ctx.capability!==capability || !contextCurrent(ctx) || ctx.phase!=='idle' || !ctx.lane)return false;
  const p=q.lease,rec=q.record,lane=ctx.lane;
  const references=()=>contextCurrent(ctx) && ctx.quarantine===q && q.recoveryBoundary.references()
    && ownData(q.originRef,['x','z']) && owner._frameOrigin===q.originRef && q.originRef.x===q.origin.x && q.originRef.z===q.origin.z && owner._frameOriginSeq===q.originSeq;
  const current=()=>references() && q.recoveryBoundary() && noRecoveryConstraints(owner,rec,p) && lane.verify();
  const cleanup=()=>{
    const t=q.ticket;if(!t?.body){q.ticket=null;return true;}
    if(!current() || allocationClaimed(t.body,t.colliders) || !current())return false;
    if(lane.rawRead('bodies','contains',t.body.handle)) {
      if(!lane.matchesObject('bodies',t.body,t.body.handle))return false;
      ctx.world.removeRigidBody(t.body);
      if(!current())return false;
    }
    if(lane.rawRead('bodies','contains',t.body.handle))return false;
    t.watch?.retire();if(t.record){leases.get(t.record)?.watch?.retire();leases.delete(t.record);}
    q.ticket=null;return true;
  };
  try {
    if(!current())return false;
    if(q.ticket && !q.ticket.record && !cleanup())return false;
    if(!recoveryNativeCurrent(ctx,q,recoverySnapshot(ctx,q,current)))return false;
    if(!q.ticket) {
      const ticket={body:null,colliders:[],record:null,view:null,current,references};q.ticket=ticket;
      const scratch=Object.create(Object.getPrototypeOf(p.entity),Object.getOwnPropertyDescriptors(p.entity));
      for(const key of ['pos','prevPos','vel']) {
        const d=Object.getOwnPropertyDescriptor(p.entity,key);
        if(d?.value && typeof d.value==='object')Object.defineProperty(scratch,key,{...d,
          value:Object.create(Object.getPrototypeOf(d.value),Object.getOwnPropertyDescriptors(d.value))});
      }
      ticket.view=recoveryView(owner,q,ticket);
      try {ticket.record=createRecord(ticket.view,scratch,rec.spec,rec,ticket);}
      catch(error){q.lastRecoveryError=String(error.message);cleanup();return false;}
      // The source remains original. Only the private staged entity copy was constructed.
      ticket.view.records.set(p.id,ticket.record);
      if(!current() || !recoveryNativeCurrent(ctx,q,recoverySnapshot(ctx,q,current)))return false;
    }
    const t=q.ticket;
    // Removal has no callbacks in the supported sealed dispatch lane. Retain an explicit
    // removal set anyway, so a genuine native throw resumes this exact candidate safely.
    for(const collider of p.colliders)if(!q.removed.has(collider)) {
      if(!current() || !recoveryNativeCurrent(ctx,q,recoverySnapshot(ctx,q,current)))return false;
      try {ctx.world.removeCollider(collider,false);}
      finally {if(contextCurrent(ctx) && lane.verify() && !lane.rawRead('colliders','contains',collider.handle)){q.removed.add(collider);const i=q.expectedOrder.indexOf(collider);q.expectedOrder[i]=q.expectedOrder.at(-1);q.expectedOrder.pop();}}
      if(!current())return false;
    }
    if(!q.bodyRemoved) {
      if(!current() || !recoveryNativeCurrent(ctx,q,recoverySnapshot(ctx,q,current)))return false;
      try {ctx.world.removeRigidBody(p.body);}
      finally {if(contextCurrent(ctx) && lane.verify() && !lane.rawRead('bodies','contains',p.body.handle))q.bodyRemoved=true;}
    }
    if(!current())return false;
    const snapshot=recoverySnapshot(ctx,q,current);
    if(!recoveryNativeCurrent(ctx,q,snapshot))return false;
    const staged=leases.get(t.record),next={...p,body:t.body,colliders:[...t.colliders],recordSpec:rec.spec,
      bindingRevision:nextRevision++,spines:t.record.coincidentSpines,spineMembers:[...t.record.coincidentSpines],
      presentation:null,watch:null,completedReceipt:null,provenance:'recovered-committed-pose',poseRevision:(p.poseRevision||0)+1};
    // Register before the final trusted observation; no validate-to-subscribe gap.
    next.watch=t.watch || observeOrchardNativeObjects(lane,[t.body,...t.colliders]);t.watch=next.watch;
    if(lane.observationEnabled && !next.watch)return false;
    const entitySlot=Object.getOwnPropertyDescriptor(t.record,'entity');
    if(!entitySlot || !('value' in entitySlot) || !entitySlot.writable || entitySlot.value!==staged.entity || !current())return false;
    const final=recoverySnapshot(ctx,q,current);
    if(!recoveryNativeCurrent(ctx,q,final))return false;
    // Only private/plain owner-created cells follow the last native observation.
    p.watch?.retire();leases.delete(rec);leases.delete(t.record);
    t.record.entity=p.entity;Map.prototype.set.call(owner.records,p.id,t.record);
    for(const c of p.colliders)Map.prototype.delete.call(owner._colliderOwners,c.handle);
    for(const c of t.colliders)Map.prototype.set.call(owner._colliderOwners,c.handle,{rec:t.record,collider:c});
    Set.prototype.delete.call(owner.dynamicRecords,rec);Set.prototype.delete.call(owner.ceresWorkfleetRecords,rec);
    ctx.sources.delete(rec);ctx.sources.add(t.record);leases.set(t.record,next);
    motorStates.get(p.state).claim=next;ctx.quarantine=null;ctx.pendingTail=null;ctx.gate?.phase('idle');
    if(next.watch)retainPosePublication(ctx,t.record,next,final.byHandle.get(t.body.handle),q.origin,q.originSeq,q.originRef);
    return true;
  }catch(error){if(contextCurrent(ctx))q.lastRecoveryError=String(error.message);return false;}
}

export function permitOrchardConstructionRehomes(owner,capability,originals) {
 const ctx=ownerContexts.get(owner);
 if(!ctx || ctx.capability!==capability || !contextCurrent(ctx) || ctx.sources.size || ctx.constructionRehomes)return false;
 ctx.constructionRehomes=new Map(originals);return true;
}

const canonicalPod=ensurePhysicsBodySpec({type:'payload',radius:G.pod.radius,data:{},physicsBody:orchardPodBodySpec()});
function expectedOrchardPod(p,socket,origin,constants){
 const slot=G.pods[socket],c=Math.cos(p.root.rot),s=Math.sin(p.root.rot),angle=p.root.rot+slot.yaw;
 const body={enabled:true,t:{x:Math.fround(p.root.x+c*slot.pos.x-s*slot.pos.z-origin.x),y:0,z:Math.fround(p.root.z+s*slot.pos.x+c*slot.pos.z-origin.z)},q:{x:0,y:Math.fround(-Math.sin(angle/2)),z:0,w:Math.fround(Math.cos(angle/2))},colliders:[]};
 for(const part of canonicalPod.collisionProxyManifest.convexParts){const halfY=Math.fround(planarProxyPrismHalfHeight(part.points,G.pod.radius)),vertices=[];
  for(const y of [-halfY,halfY])for(const {x,z} of part.points)vertices.push(Math.fround(x*G.pod.radius),y,Math.fround(z*G.pod.radius));
  body.colliders.push({body,shape:constants.ShapeType.ConvexPolyhedron,vertices,skin:0,enabled:true,sensor:false,groups:0x0004000f,local:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1}});
 }
 return body;
}
/** Readiness is a current read, never a reservation or a native handoff receipt. */
export function queryOrchardPodCavity(owner,capability,entity,socket){
 const ctx=ownerContexts.get(owner);
 if(!ctx || !ownData(owner,['_frameOrigin','_frameOriginSeq','records']) || !ownData(owner._frameOrigin,['x','z']) || !ownData(entity,['id']))return null;
 if(!ownData(owner,['_frameOrigin','_frameOriginSeq']) || !ownData(owner._frameOrigin,['x','z']))throw Error('orchard_origin_accessor');
  const originRef=owner._frameOrigin,origin={x:originRef.x,z:originRef.z},sequence=owner._frameOriginSeq;
 const rec=Map.prototype.get.call(owner.records,entity.id),p=rec && leases.get(rec);
 if(!ctx || ctx.capability!==capability || !ctx.lane || !p || entity!==p.entity || !Number.isInteger(socket) || socket<0 || socket>2 || !orchardOwnerAvailable(owner))return null;
 try{
  if(!sourceRecordCurrent(ctx,rec,p) || owner._frameOrigin!==originRef || !ownData(originRef,['x','z']) || originRef.x!==origin.x || originRef.z!==origin.z || owner._frameOriginSeq!==sequence)return null;
  const candidate=expectedOrchardPod(p,socket,origin,ctx.lane.constants),observation=prepareOrchardNativeObservation(owner,ctx.lane);
  if(!sourceRecordCurrent(ctx,rec,p) || owner._frameOrigin!==originRef || !ownData(originRef,['x','z']) || originRef.x!==origin.x || originRef.z!==origin.z || owner._frameOriginSeq!==sequence)return null;
  const snapshot=observation.scan();
  if(!observationMatches(snapshot.byHandle.get(p.body.handle),p,origin,ctx.lane.constants))return null;
  const result=orchardPlacementClearance(snapshot,candidate,ctx.lane.constants);
  return Object.freeze({...result,socket,sourceSha:G.sourceSha,bindingRevision:p.bindingRevision,progress:Object.freeze([...p.values])});
 }catch(_){return null;}
}

function captureInsertionPod(entity,p,socket,cycle=p.cycles[socket]+1){
 if(!ownData(entity,['id','occupantGeneration','alive','type','hull','collides','radius','physicsBody','data','pos','vel','rot','angVel'])
   || !ownData(entity.pos,['x','z']) || !ownData(entity.vel,['x','z']) || !inertTree(entity.physicsBody) || !inertTree(entity.data))return null;
 const slot=G.pods[socket],lot=`anvil_storm_orchard:${socket}:${cycle}`,d=entity.data;
 const c=Math.cos(p.root.rot),s=Math.sin(p.root.rot),x=p.root.x+c*slot.pos.x-s*slot.pos.z,z=p.root.z+s*slot.pos.x+c*slot.pos.z;
 if(!Number.isSafeInteger(entity.id) || entity.id<=0 || !Number.isSafeInteger(entity.occupantGeneration) || entity.occupantGeneration<=0
  || entity.alive!==true || entity.type!=='payload' || !Number.isFinite(entity.hull) || entity.hull<=0 || entity.collides!==true
  || entity.radius!==G.pod.radius || !same(entity.physicsBody,canonicalPod) || entity.pos.x!==x || entity.pos.z!==z || entity.rot!==p.root.rot+slot.yaw
  || entity.vel.x!==0 || entity.vel.z!==0 || entity.angVel!==0 || d.orchardId!=='anvil_storm_orchard' || d.orchardKind!=='pod'
  || d.masslineTetherable!==false || d.worldRecordId!==lot || d.identityKey!==lot || d.authoredAssetId!==G.pod.assetId || d.authoredPayloadAssetId!==G.pod.assetId
  || !Number.isSafeInteger(d.amount) || d.amount<1 || d.amount>4)return null;
 const refs={id:entity.id,life:entity.occupantGeneration,data:d,spec:entity.physicsBody,pos:entity.pos,vel:entity.vel};
 const state={type:entity.type,hull:entity.hull,collides:entity.collides,radius:entity.radius,rot:entity.rot,angVel:entity.angVel};
 const trees={data:retainInertTree(d),spec:retainInertTree(entity.physicsBody),pos:retainInertTree({x:entity.pos.x,z:entity.pos.z}),vel:retainInertTree({x:entity.vel.x,z:entity.vel.z})};
 const current=()=>ownData(entity,['id','occupantGeneration','alive','type','hull','collides','radius','physicsBody','data','pos','vel','rot','angVel'])
  && ownData(entity.pos,['x','z']) && ownData(entity.vel,['x','z']) && entity.id===refs.id && entity.occupantGeneration===refs.life && entity.alive===true
  && entity.data===refs.data && entity.physicsBody===refs.spec && entity.pos===refs.pos && entity.vel===refs.vel
  && Object.keys(state).every(k=>entity[k]===state[k]) && inertTreeUnchanged(entity.data,trees.data) && inertTreeUnchanged(entity.physicsBody,trees.spec)
  && inertTreeUnchanged({x:entity.pos.x,z:entity.pos.z},trees.pos) && inertTreeUnchanged({x:entity.vel.x,z:entity.vel.z},trees.vel);
 return {...refs,current,cycle};
}
/** Snapshot adoption of a fixed source capsule uses the exact f32 authored pose, just
 * as its fixed source frame does. The caller still independently checks full geometry. */
export function orchardFixedPodRootMatches(owner,body,entity){
 try{
  if(!ownData(entity,['data']) || !inertTree(entity.data) || entity.data.orchardKind!=='pod')return false;
  const match=/^anvil_storm_orchard:([0-2]):([1-4])$/.exec(entity.data.worldRecordId);if(!match)return false;
  const socket=Number(match[1]),cycle=Number(match[2]);let p=null;
  Map.prototype.forEach.call(owner.records,rec=>{const lease=leases.get(rec);if(lease?.cycles[socket]===cycle){if(p)throw Error('ambiguous_orchard_frame');p=lease;}});
  if(!p)return false;const pod=captureInsertionPod(entity,p,socket,cycle);if(!pod)return false;
  const access=nativeAccess(owner,body,p),read=name=>{if(!pod.current())throw Error('orchard_pod_changed');const out=access.call(body,name);if(!pod.current())throw Error('orchard_pod_changed');return out;};
  if(!read('isFixed'))return false;
  const t=read('translation'),q=read('rotation'),v=read('linvel'),w=read('angvel');
  return t.x===Math.fround(entity.pos.x-owner._frameOrigin.x) && t.y===0 && t.z===Math.fround(entity.pos.z-owner._frameOrigin.z)
   && q.x===0 && q.z===0 && q.y===Math.fround(-Math.sin(entity.rot/2)) && q.w===Math.fround(Math.cos(entity.rot/2))
   && v.x===0 && v.y===0 && v.z===0 && w.x===0 && w.y===0 && w.z===0 && retained(p) && pod.current();
 }catch(_){return false;}
}

function insertionPodMatches(body,expected,record,constants){
 if(!body || body.object!==record.body || body.type!==constants.RigidBodyType.Fixed || !body.enabled || body.ccd!==canonicalPod.ccd
  || !Object.keys(expected.t).every(k=>body.t[k]===expected.t[k]) || !Object.keys(expected.q).every(k=>body.q[k]===expected.q[k]) || !vectorEqual(body.v,{x:0,y:0,z:0}) || !vectorEqual(body.w,{x:0,y:0,z:0})
  || body.colliders.length!==expected.colliders.length)return false;
 return body.colliders.every((c,i)=>{
  const e=expected.colliders[i],halfY=e.vertices[1],upper=[],lower=[],points=[];
  if(c.object!==record.colliders[i] || c.shape!==e.shape || !c.enabled || c.sensor || c.skin!==0 || c.density!==0 || c.groups!==e.groups || c.solverGroups!==0xffffffff
   || c.friction!==Math.fround(PHYSICS_MATERIALS.pod.friction) || c.restitution!==Math.fround(PHYSICS_MATERIALS.pod.restitution)
   || c.activeTypes!==constants.ActiveCollisionTypes.DEFAULT || c.frictionRule!==constants.CoefficientCombineRule.Average || c.restitutionRule!==constants.CoefficientCombineRule.Average
   || !vectorEqual(c.local,e.local) || !vectorEqual(c.rotation,e.rotation) || !c.vertices?.length || c.vertices.length%3)return false;
  for(let j=0;j<e.vertices.length;j+=3)points.push([e.vertices[j],e.vertices[j+2]]);
  for(let j=0;j<c.vertices.length;j+=3){if(Math.abs(c.vertices[j+1])!==Math.abs(halfY))return false;(c.vertices[j+1]>0?upper:lower).push([c.vertices[j],c.vertices[j+2]]);}
  const hull=convexHull(points),margin=8*2**-23*Math.max(1,...points.flat().map(Math.abs));
  return [upper,lower].every(face=>{const h=convexHull(face);return contained(h,hull,margin) && contained(hull,h,margin);});
 });
}
function insertionAllocationClaimed(ctx,ticket,pod){
 const owner=ctx.owner,read=(object,key)=>{if(!object)return undefined;const d=Object.getOwnPropertyDescriptor(object,key);if(d && !('value' in d))throw Error('orchard_insertion_claim_accessor');return d?.value;};
 const members=new Set(ticket.colliders),touches=r=>!!r && (read(r,'body')===ticket.body || members.has(read(r,'collider'))
  || (()=>{const list=read(r,'colliders');if(!list)return false;const length=read(list,'length');if(!Number.isSafeInteger(length))throw Error('orchard_insertion_claim_array');for(let i=0;i<length;i++)if(members.has(read(list,String(i))))return true;return false;})());
 const endpoint=a=>!!a && (touches(read(a,'owner')) || touches(read(a,'target')) || read(a,'ownerId')===pod.id || read(a,'targetId')===pod.id);
 try{
  let claimed=false;
  for(const key of ['records','_colliderOwners','attachments','_suspendedAttachments']){
   const map=read(owner,key);Map.prototype.forEach.call(map,entry=>{
    if(key==='records')claimed ||= touches(entry);
    else if(key==='_colliderOwners')claimed ||= touches(read(entry,'rec')) || members.has(read(entry,'collider'));
    else claimed ||= endpoint(entry) || endpoint(read(entry,'attachment'));
   });
  }
  if(claimed)return true;
  if(ctx.lane.rawRead('bodies','contains',ticket.bodyHandle))for(const kind of ['impulseJoints','multibodyJoints'])ctx.lane.rawRead(kind,'forEachJointAttachedToRigidBody',ticket.bodyHandle,()=>{claimed=true;});
  return claimed;
 }catch(_){return true;}
}
/** Private fixed-body insertion using the existing owner factory and the core's staged
 * publication contract. Nothing is public until commit; abort retains claimed allocations. */
export function prepareOrchardPodInsertion(owner,capability,frame,entity,socket,spec,createRecord,finiteState){
 const ctx=ownerContexts.get(owner),rec=owner.records.get(frame?.id),p=leases.get(rec);
 if(!ctx || ctx.capability!==capability || !ctx.lane?.observationEnabled || !ctx.gate || !orchardOwnerAvailable(owner)
  || !p || frame!==p.entity || !Number.isInteger(socket) || socket<0 || socket>2 || p.values[socket]!==0 || p.cycles[socket]>=4
  || p.intents[socket] || !motorStorageCurrent(p) || !sourceRecordCurrent(ctx,rec,p))return null;
 const pod=captureInsertionPod(entity,p,socket);if(!pod || !inertTree(spec) || Map.prototype.has.call(owner.records,pod.id))return null;
 const finite=finiteIntake(p,finiteState,socket,pod,pod.data.amount,true);if(!finite)return null;
 const specTree=retainInertTree(spec);
 const stagedRecordCurrent=()=>{const r=ticket.record;if(!r)return true;
  if(!ownData(r,['entity','spec','revision','body','collider','colliders','coincidentSpines']) || r.entity!==entity || r.spec!==spec || r.revision!==spec.revision
   || r.body!==ticket.body || r.collider!==ticket.colliders[0] || !Array.isArray(r.colliders) || r.colliders.length!==ticket.colliders.length
   || !Array.isArray(r.coincidentSpines) || r.coincidentSpines.length!==ticket.colliders.length)return false;
  for(let i=0;i<ticket.colliders.length;i++){
   const member=Object.getOwnPropertyDescriptor(r.colliders,String(i)),spine=Object.getOwnPropertyDescriptor(r.coincidentSpines,String(i));
   if(!member || !('value' in member) || member.value!==ticket.colliders[i] || !spine || !('value' in spine)
    || !ownData(spine.value,['ox','oz','ux','uz','halfLen']) || spine.value.ox!==0 || spine.value.oz!==0 || spine.value.ux!==1 || spine.value.uz!==0 || spine.value.halfLen!==0)return false;
  }return true;};
 if(!ownData(owner,['_frameOrigin','_frameOriginSeq']) || !ownData(owner._frameOrigin,['x','z']))return null;
 const boundary=retainRecoveryBoundary(ctx,rec,p),originRef=owner._frameOrigin,origin={x:originRef.x,z:originRef.z},sequence=owner._frameOriginSeq;
 const expected=expectedOrchardPod(p,socket,origin,ctx.lane.constants),serial=ctx.gate.serial(),ticket={body:null,bodyHandle:null,colliders:[],colliderHandles:[],record:null,view:null};
 let status='pending',before=null,publicationSlots=null,preparedObservation=null;
 const ownerCurrent=()=>ownData(owner,['world','records','_eventQueue']) && ownerContexts.get(owner)===ctx && contextCurrent(ctx);
 const slotsCurrent=()=>!publicationSlots || publicationSlots.every(([object,key,prior])=>{const d=Object.getOwnPropertyDescriptor(object,key);return d && 'value' in d && d.value===prior.value && d.writable===prior.writable && d.enumerable===prior.enumerable && d.configurable===prior.configurable;});
 const references=()=>status==='pending' && ownerCurrent() && ctx.custody===ticket && ctx.phase==='custody' && ctx.gate.serial()===serial && boundary.references()
  && owner._frameOrigin===originRef && ownData(originRef,['x','z']) && originRef.x===origin.x && originRef.z===origin.z && owner._frameOriginSeq===sequence
  && finite.current() && !Map.prototype.has.call(owner.records,pod.id) && pod.current() && inertTreeUnchanged(spec,specTree) && stagedRecordCurrent() && slotsCurrent();
 const current=()=>references() && boundary() && noRecoveryConstraints(owner,rec,p) && ctx.lane.verify() && references();
 ticket.current=current;ticket.references=references;
 const release=()=>{if(ownerCurrent() && ctx.custody===ticket){ctx.custody=null;ctx.phase='idle';ctx.gate.phase('idle');}};
 const abort=()=>{
  if(status==='committed')return false;status='aborted';
  if(!ownerCurrent() || ctx.custody!==ticket)return false;
  try{
   if(ticket.body){
    if(!ctx.lane.verify() || insertionAllocationClaimed(ctx,ticket,pod) || !ownerCurrent() || ctx.custody!==ticket)return false;
    if(ctx.lane.rawRead('bodies','contains',ticket.bodyHandle)){
     if(!ctx.lane.matchesObject('bodies',ticket.body,ticket.bodyHandle))return false;
     const count=ctx.lane.rawRead('bodies','rbNumColliders',ticket.bodyHandle);
     for(let i=0;i<count;i++){const handle=ctx.lane.rawRead('bodies','rbCollider',ticket.bodyHandle,i),c=ticket.colliders[ticket.colliderHandles.indexOf(handle)];
      if(!c || !ctx.lane.matchesObject('colliders',c,handle))return false;}
     for(let i=0;i<ticket.colliders.length;i++){const c=ticket.colliders[i],handle=ticket.colliderHandles[i];if(ctx.lane.rawRead('colliders','contains',handle)
       && (!ctx.lane.matchesObject('colliders',c,handle) || ctx.lane.rawRead('colliders','coParent',handle)!==ticket.bodyHandle))return false;}
     ctx.world.removeRigidBody(ticket.body);
     if(!ownerCurrent() || ctx.custody!==ticket || !ctx.lane.verify())return false;
    }
    if(ctx.lane.rawRead('bodies','contains',ticket.bodyHandle))return false;
   }
   release();return true;
  }catch(_){return false;}
 };
 ticket.abort=abort;ctx.custody=ticket;ctx.phase='custody';ctx.gate.phase('custody');ctx.pendingTail=null;
 const prepareObservation=()=>{
  const view=recoveryView(owner,null,ticket);
  if(ticket.record){view.records.set(pod.id,ticket.record);for(let i=0;i<ticket.colliders.length;i++)view._colliderOwners.set(ticket.colliderHandles[i],{rec:ticket.record,collider:ticket.colliders[i]});}
  const observation=prepareOrchardNativeObservation(view,ctx.lane);
  if(!current())throw Error('orchard_insertion_source_changed');
  return observation;
 };
 const snapshot=()=>prepareObservation().scan();
 const observationValid=observed=>{
  const actual=observed.byHandle.get(ticket.bodyHandle);
  if(!insertionPodMatches(actual,expected,ticket.record,ctx.lane.constants) || observed.attached.get(ticket.bodyHandle)?.length
   || observed.attached.get(p.body.handle)?.length || JSON.stringify(observed.joints)!==JSON.stringify(before.joints)
   || nativeContract({bodies:observed.bodies.filter(b=>b.object!==ticket.body)})!==nativeContract(before)
   || !observationMatches(observed.byHandle.get(p.body.handle),p,origin,ctx.lane.constants))return false;
  return orchardPlacementClearance(observed,actual,ctx.lane.constants,ticket.bodyHandle).clear;
 };
 // All callback-capable ownership preparation belongs to preflight. The core may still
 // refuse its own prepared index after this returns; no native publication has happened.
 const validate=()=>{preparedObservation=null;try{
  if(status!=='pending' || !ticket.record || !current())return false;
  const observation=prepareObservation();
  if(!observationValid(observation.scan()))return false;
  preparedObservation=observation;return true;
 }catch(_){return false;}};
 try{
  before=snapshot();if(!observationMatches(before.byHandle.get(p.body.handle),p,origin,ctx.lane.constants) || !orchardPlacementClearance(before,expected,ctx.lane.constants).clear){abort();return null;}
  ticket.view=recoveryView(owner,null,ticket);
  ticket.record=createRecord(ticket.view,entity,spec,null,ticket);
  if(!validate()){abort();return null;}
  const cycles=[...p.cycles];cycles[socket]=pod.cycle;
  const state=createOrchardMotorState(p.values,cycles),descriptors=Object.getOwnPropertyDescriptors(p.data);
  descriptors.orchardCollars={...descriptors.orchardCollars,value:state};
  if(finiteState!==undefined)descriptors.orchardFiniteCustody={value:1,writable:true,enumerable:true,configurable:true};
  const data=Object.create(Object.getPrototypeOf(p.data),descriptors),dataSlot=Object.getOwnPropertyDescriptor(frame,'data');
  const staticSlot=Object.getOwnPropertyDescriptor(owner,'_staticLayerVersion');
  if(!dataSlot || !('value' in dataSlot) || !dataSlot.writable || !staticSlot || !('value' in staticSlot) || !staticSlot.writable){abort();return null;}
  publicationSlots=[[frame,'data',dataSlot],[owner,'_staticLayerVersion',staticSlot]];
  const next={...p,data,state,finiteMarker:descriptors.orchardFiniteCustody,progress:state.progress,cycles:state.cycles,stateContract:JSON.stringify(state),bindingRevision:nextRevision++,
   completedReceipt:null,presentation:null,provenance:'closed-cycle-insertion',lastTicks:[...p.lastTicks],intents:[...p.intents]};
  preparedObservation=null;
  const commit=()=>{
   const observation=preparedObservation;preparedObservation=null;
   try{
    // This is the core's callback-free commit boundary. Never reacquire an observation,
    // dispatch owner Map methods or re-enter callback-capable sourceRecordCurrent here.
    // Descriptor-only source/destination checks precede the retained trusted native scan.
    if(!observation || !references() || !ownData(rec,['coincidentSpines']) || !retained(p)
      || !motorStorageCurrent(p) || !spineCurrent(rec,p) || !noRecoveryConstraints(owner,rec,p)
      || !references() || !observationValid(observation.scan()))return false;
   }catch(_){return false;}
   // The final observation is followed only by private/plain publication cells.
   Object.defineProperty(frame,'data',{...dataSlot,value:data});
   finite.publish(next);motorStates.get(state).claim=next;leases.set(rec,next);
   Map.prototype.set.call(owner.records,pod.id,ticket.record);
   for(let i=0;i<ticket.colliders.length;i++)Map.prototype.set.call(owner._colliderOwners,ticket.colliderHandles[i],{rec:ticket.record,collider:ticket.colliders[i]});
   Object.defineProperty(owner,'_staticLayerVersion',{...staticSlot,value:null});
   status='committed';release();return true;
  };
  return Object.freeze({preflight:validate,commit,abort,get committed(){return status==='committed';}});
 }catch(_){abort();return null;}
}
export function cancelOrchardPodInsertion(owner,capability){const ctx=ownerContexts.get(owner);return !!ctx && ctx.capability===capability && !!ctx.custody && ctx.custody.abort();}

/** More accepted finite material in an already-owned fixed capsule. No native body,
 * shape, mass or pose is changed; exact fixed geometry is revalidated before publication. */
export function prepareOrchardPodFill(owner,capability,frame,entity,socket,amount,finiteState){
 const ctx=ownerContexts.get(owner);
 if(!ctx || ctx.capability!==capability || !ctx.lane?.observationEnabled || !ctx.gate || !orchardOwnerAvailable(owner)
  || !ownData(frame,['id']) || !ownData(entity,['id']) || !Number.isInteger(socket) || socket<0 || socket>2 || !Number.isInteger(amount) || amount<1 || amount>4)return null;
 const rec=Map.prototype.get.call(owner.records,frame.id),p=leases.get(rec),podRecord=Map.prototype.get.call(owner.records,entity.id);
 if(!p || frame!==p.entity || p.values[socket]!==0 || p.cycles[socket]<1 || p.intents[socket] || !motorStorageCurrent(p) || !sourceRecordCurrent(ctx,rec,p)
  || !podRecord || !ownData(podRecord,['entity','spec','revision','body','collider','colliders']) || podRecord.entity!==entity)return null;
 const pod=captureInsertionPod(entity,p,socket,p.cycles[socket]);
 if(!pod || pod.data.amount+amount>4 || !inertTree(podRecord.spec) || podRecord.spec.dynamic!==false || podRecord.revision!==pod.spec.revision)return null;
 const finite=finiteIntake(p,finiteState,socket,pod,amount,false);if(!finite)return null;
 const body=podRecord.body,bodyHandle=Object.getOwnPropertyDescriptor(body,'handle')?.value,spec=podRecord.spec,specTree=retainInertTree(spec);
 if(typeof bodyHandle!=='number')return null;
 if(!ownData(owner,['_frameOrigin','_frameOriginSeq']) || !ownData(owner._frameOrigin,['x','z']))return null;
 const boundary=retainRecoveryBoundary(ctx,rec,p),originRef=owner._frameOrigin,origin={x:originRef.x,z:originRef.z},sequence=owner._frameOriginSeq;
 const expected=expectedOrchardPod(p,socket,origin,ctx.lane.constants),serial=ctx.gate.serial();
 const slot=Object.getOwnPropertyDescriptor(entity,'data');if(!slot || !('value' in slot) || !slot.writable)return null;
 const descriptors=Object.getOwnPropertyDescriptors(pod.data);descriptors.amount={...descriptors.amount,value:pod.data.amount+amount};
 const data=Object.create(Object.getPrototypeOf(pod.data),descriptors),ticket={};let status='pending',observation=null,before=null;
 const ownerCurrent=()=>ownData(owner,['world','records','_eventQueue']) && ownerContexts.get(owner)===ctx && contextCurrent(ctx);
 const references=()=>status==='pending' && ownerCurrent() && ctx.custody===ticket && ctx.phase==='custody' && ctx.gate.serial()===serial
  && boundary.references() && ownData(originRef,['x','z']) && owner._frameOrigin===originRef && ownData(originRef,['x','z']) && originRef.x===origin.x && originRef.z===origin.z && owner._frameOriginSeq===sequence
  && finite.current() && pod.current() && inertTreeUnchanged(spec,specTree) && Map.prototype.get.call(owner.records,pod.id)===podRecord
  && ownData(podRecord,['entity','spec','revision','body','collider','colliders']) && podRecord.entity===entity && podRecord.spec===spec && podRecord.revision===pod.spec.revision && podRecord.body===body
  && (()=>{const d=Object.getOwnPropertyDescriptor(entity,'data');return d && 'value' in d && d.value===slot.value && d.writable===slot.writable && d.configurable===slot.configurable && d.enumerable===slot.enumerable;})();
 const constraints=()=>noRecoveryConstraints(owner,rec,p) && noRecoveryConstraints(owner,podRecord,{id:pod.id,body});
 const current=()=>references() && boundary() && constraints() && references();ticket.current=current;ticket.references=references;
 const release=()=>{if(ownerCurrent() && ctx.custody===ticket){ctx.custody=null;ctx.phase='idle';ctx.gate.phase('idle');}};
 const abort=()=>{if(status==='committed')return false;status='aborted';release();return true;};ticket.abort=abort;
 ctx.custody=ticket;ctx.phase='custody';ctx.gate.phase('custody');ctx.pendingTail=null;
 const valid=snapshot=>insertionPodMatches(snapshot.byHandle.get(bodyHandle),expected,podRecord,ctx.lane.constants)
  && observationMatches(snapshot.byHandle.get(p.body.handle),p,origin,ctx.lane.constants)
  && !snapshot.attached.get(bodyHandle)?.length && !snapshot.attached.get(p.body.handle)?.length
  && (!before || nativeContract(snapshot)===nativeContract(before));
 const preflight=()=>{observation=null;try{if(!current())return false;const view=recoveryView(owner,null,ticket),next=prepareOrchardNativeObservation(view,ctx.lane);
  if(!current())return false;const snapshot=next.scan();if(!valid(snapshot))return false;before??=snapshot;observation=next;return true;}catch(_){return false;}};
 try{if(!preflight()){abort();return null;}observation=null;
  const commit=()=>{const next=observation;observation=null;try{if(!next || !references() || !retained(p) || !motorStorageCurrent(p) || !spineCurrent(rec,p)
    || !constraints() || !references() || !valid(next.scan()))return false;}catch(_){return false;}
   Object.defineProperty(entity,'data',{...slot,value:data});finite.publish(p);status='committed';release();return true;};
  return Object.freeze({preflight,commit,abort,get committed(){return status==='committed';}});
 }catch(_){abort();return null;}
}

// Same-world fixed capsule handoff. The requested mode is private until the replacement,
// core index and finite ledger can publish together. Partial retirement retains no-solve
// custody and the same candidate for an explicit retry; it never drops a foreign claim.
const podHandoffs=new WeakMap(),readyRecordLeases=new WeakMap();
export function orchardReadyTransferEntryCurrent(owner){const ctx=ownerContexts.get(owner);if(!ctx)return true;if(!contextCurrent(ctx))return false;for(const q of ctx.readyPods)if(podHandoffs.get(q.entity)!==q || !readyPodReferences(q))return false;return true;}
// Readiness is reacquired only by a successful handoff or the staged cold owner transfer.
// It is never inferred by a recurring read from copied saved scalars.
function optionalInertField(object,key){
 let node=object;for(let i=0;node && i<8;i++,node=Object.getPrototypeOf(node)){const d=Object.getOwnPropertyDescriptor(node,key);if(d)return 'value' in d && inertTree(d.value)?{owner:node,descriptor:d}:null;}
 return node?null:{owner:null,descriptor:null};
}
function retainOptionalInertField(object,key){
 const field=optionalInertField(object,key);if(!field)return null;
 return {...field,prototype:Object.getPrototypeOf(object),tree:field.descriptor?retainInertTree(field.descriptor.value):null};
}
function optionalInertFieldUnchanged(object,key,retained){
 if(!retained || Object.getPrototypeOf(object)!==retained.prototype)return false;
 const current=optionalInertField(object,key);if(!current || current.owner!==retained.owner)return false;
 const a=retained.descriptor,b=current.descriptor;
 return a ? !!b && a.value===b.value && a.writable===b.writable && a.configurable===b.configurable && a.enumerable===b.enumerable && inertTreeUnchanged(b.value,retained.tree) : b===null;
}
function makeReadyPodLease(owner,ctx,record,entity,p,socket,state,spec,data,provenance){
 if(!ownData(entity,['id','occupantGeneration']) || (record && !ownData(record,['entity','body','spec','revision','collider','colliders']))
  || !inertTree(spec) || !inertTree(data) || (record && !inertTree(record.spec)))return null;
 const flight=optionalInertField(entity,'flightModel');if(!flight)return null;const flightModel=flight.descriptor;
 const slot=p.finite?.row.sockets[socket],lot=p.finite?.row.lots.find(l=>l.id===slot?.lotId);
 if(!slot || slot.handoff!=='ready' || slot.status!=='drifting' || slot.targetRevision!==spec.revision || slot.readyTick===null
  || spec.dynamic!==true || !same(spec,ensurePhysicsBodySpec({type:'payload',radius:G.pod.radius,data:{},physicsBody:orchardPodBodySpec({dynamic:true,revision:slot.targetRevision})}))
  || data.orchardId!=='anvil_storm_orchard' || data.orchardKind!=='pod' || data.masslineTetherable!==true
  || data.worldRecordId!==slot.lotId || data.identityKey!==slot.lotId || data.commodityId!==ANVIL_ORCHARD.commodityId || data.amount!==lot?.units
  || data.authoredAssetId!==G.pod.assetId || data.authoredPayloadAssetId!==G.pod.assetId || (record && (record.spec.dynamic!==true || record.revision!==slot.targetRevision)))return null;
 const colliders=record?[...record.colliders]:[];
 if(record && (!ownData(record.body,['handle']) || !colliders.every(c=>ownData(c,['handle']))))return null;
 const bodyHandle=record?.body.handle,colliderHandles=colliders.map(c=>c.handle);
 return {owner,ctx,record,resident:!!record,entity,p,f:p.finite,socket,state,bodyHandle,colliderHandles,id:entity.id,life:entity.occupantGeneration,body:record?.body,primary:record?.collider,array:record?.colliders,colliders,
  spec,data,prototype:Object.getPrototypeOf(entity),flightOwner:flight.owner,flightModel,flightModelTree:flightModel?retainInertTree(flightModel.value):null,recordSpec:record?.spec,specTree:retainInertTree(spec),dataTree:retainInertTree(data),recordTree:record?retainInertTree(record.spec):null,
  receipt:Object.freeze({kind:'native-dynamic-ready',provenance,sourceSha:G.sourceSha,lotId:slot.lotId,socket,cycle:slot.cycle,revision:slot.targetRevision,readyTick:slot.readyTick,openedTick:slot.openedTick,bindingRevision:nextRevision++,completedNativeTick:null})};
}
function readyPodCustodyCurrent(q){
 const e=q.entity,f=q.f;
 if(!ownData(e,['id','occupantGeneration','alive','hull','type','collides','radius','physicsBody','data']))return false;
 const flight=optionalInertField(e,'flightModel'),flightModel=flight?.descriptor;
 if(Object.getPrototypeOf(e)!==q.prototype || !flight || flight.owner!==q.flightOwner || (q.flightModel ? !flightModel || flightModel.value!==q.flightModel.value || !inertTreeUnchanged(flightModel.value,q.flightModelTree) : flightModel!==null))return false;
 return e.id===q.id && e.occupantGeneration===q.life && e.alive===true && Number.isFinite(e.hull) && e.hull>0 && e.type==='payload' && e.collides===true && e.radius===G.pod.radius
  && e.physicsBody===q.spec && e.data===q.data && inertTreeUnchanged(q.spec,q.specTree) && inertTreeUnchanged(q.data,q.dataTree)
  && f?.state===q.state && finiteRowRetained(f) && Map.prototype.get.call(f.entities,q.id)===e
  && f.row.sockets[q.socket].handoff==='ready' && f.row.sockets[q.socket].status==='drifting'
  && f.row.sockets[q.socket].lotId===q.receipt.lotId && f.row.sockets[q.socket].targetRevision===q.receipt.revision
  && f.row.sockets[q.socket].cycle===q.receipt.cycle && f.row.sockets[q.socket].openedTick===q.receipt.openedTick
  && f.row.sockets[q.socket].readyTick===q.receipt.readyTick && f.row.lots.find(l=>l.id===q.receipt.lotId)?.units===q.data.amount;
}
function readyPodReferences(q,owner=q.owner){
 const e=q.entity,r=q.record;
 if(!readyPodCustodyCurrent(q) || !ownData(owner,['records','_colliderOwners']))return false;
 if(!q.resident)return Map.prototype.get.call(owner.records,q.id)===undefined;
 if(!ownData(r,['entity','body','spec','revision','collider','colliders','ccdEnabled'])
  || Object.getOwnPropertyDescriptor(q.body,'handle')?.value!==q.bodyHandle || !q.colliders.every((c,i)=>Object.getOwnPropertyDescriptor(c,'handle')?.value===q.colliderHandles[i]))return false;
 const length=Object.getOwnPropertyDescriptor(q.array,'length');
 return Map.prototype.get.call(owner.records,q.id)===r && r.entity===e && r.body===q.body && r.spec===q.recordSpec && r.revision===q.receipt.revision
  && r.collider===q.primary && r.colliders===q.array && length?.value===q.colliders.length && q.colliders.every((c,i)=>{
   const d=Object.getOwnPropertyDescriptor(q.array,String(i)),entry=Map.prototype.get.call(owner._colliderOwners,q.colliderHandles[i]);
   return d && 'value' in d && d.value===c && ownData(entry,['rec','collider']) && entry.rec===r && entry.collider===c;
  }) && inertTreeUnchanged(q.recordSpec,q.recordTree);
}
function readyPodNativeMatches(body,q,constants,ccd){
 if(!body || body.object!==q.body || body.type!==constants.RigidBodyType.Dynamic || !body.enabled || body.mass!==10 || body.gravityScale!==1 || body.ccd!==ccd
  || !vectorEqual(body.localCom,{x:0,y:0,z:0}) || !vectorEqual(body.principalInertia,{x:1,y:16.2,z:1}) || !vectorEqual(body.principalFrame,{x:0,y:0,z:0,w:1})
  || !vectorEqual(body.effectiveInvMass,{x:.1,y:0,z:.1}) || body.effectiveInvInertia?.length!==6 || !body.effectiveInvInertia.every((v,i)=>close(v,i===3?1/16.2:0))
  || body.linearDamping!==0 || body.angularDamping!==Math.fround(.15) || ![body.t,body.q,body.v,body.w].every(v=>v && Object.values(v).every(Number.isFinite))
  || body.t.y!==0 || body.q.x!==0 || body.q.z!==0 || body.v.y!==0 || body.w.x!==0 || body.w.z!==0)return false;
 const expected=expectedOrchardPod(q.p,q.socket,{x:0,z:0},constants);expected.t=body.t;expected.q=body.q;
 return insertionPodMatches({...body,type:constants.RigidBodyType.Fixed,ccd:canonicalPod.ccd,v:{x:0,y:0,z:0},w:{x:0,y:0,z:0}},expected,q.record,constants);
}
export function readOrchardPodReady(owner,entity,state){
 try{
  const q=podHandoffs.get(entity),ctx=ownerContexts.get(owner);
  if(!q || !q.resident || q.entity!==entity || q.owner!==owner || q.ctx!==ctx || q.state!==state || !orchardOwnerAvailable(owner) || !ctx?.lane?.observationEnabled)return null;
  const source=Map.prototype.get.call(owner.records,q.p.id),rec=source && Object.getOwnPropertyDescriptor(source,'entity')?.value===q.p.entity?source:null,p=leases.get(rec)||q.p;
  const sourceCurrent=()=>!rec || leases.get(rec)===p && sourceRecordCurrent(ctx,rec,p);
  if(!sourceCurrent() || !finiteRowCurrent(q.f) || !readyPodReferences(q))return null;
  const originRef=owner._frameOrigin;if(!ownData(originRef,['x','z']))return null;const origin={x:originRef.x,z:originRef.z},seq=owner._frameOriginSeq;
  const observation=prepareOrchardNativeObservation(owner,ctx.lane);
  if(!sourceCurrent() || !finiteRowCurrent(q.f) || !readyPodReferences(q) || !contextCurrent(ctx) || owner._frameOrigin!==originRef || !ownData(originRef,['x','z']) || originRef.x!==origin.x || originRef.z!==origin.z || owner._frameOriginSeq!==seq)return null;
  const ccd=q.record.ccdEnabled,snapshot=observation.scan();
  if((rec && !observationMatches(snapshot.byHandle.get(p.body.handle),p,origin,ctx.lane.constants)) || !readyPodNativeMatches(snapshot.byHandle.get(q.bodyHandle),q,ctx.lane.constants,ccd))return null;
  return q.receipt;
 }catch(_){return null;}
}

export function prepareOrchardPodHandoff(owner,capability,frame,entity,socket,state,createRecord){
 const ctx=ownerContexts.get(owner);
 if(!ctx || ctx.capability!==capability || !ctx.lane?.observationEnabled || !ctx.gate || !orchardOwnerAvailable(owner)
  || !ownData(frame,['id']) || !ownData(entity,['id']) || !Number.isInteger(socket) || socket<0 || socket>2)return null;
 const rec=Map.prototype.get.call(owner.records,frame.id),p=leases.get(rec),f=p?.finite,old=Map.prototype.get.call(owner.records,entity.id);
 if(!p || frame!==p.entity || !f || state!==f.state || !finiteCurrent(f,p) || !sourceRecordCurrent(ctx,rec,p)
  || !motorStorageCurrent(p) || p.values[socket]!==30 || p.intents[socket])return null;
 const slot=f.row.sockets[socket],tick=state.tick;
 if(slot.status!=='releasing' || slot.operation!=='open' || slot.handoff!=='fixed' || slot.openedTick===null
  || orchardPhase(f.row,tick)?.phase!=='calm')return null;
 const pod=captureInsertionPod(entity,p,socket,p.cycles[socket]);
 if(!pod || !old || !ownData(old,['entity','body','spec','revision','collider','colliders']) || old.entity!==entity
  || old.revision!==pod.spec.revision || !inertTree(old.spec) || old.spec.dynamic!==false
  || pod.data.commodityId!==ANVIL_ORCHARD.commodityId || pod.data.amount!==f.row.lots.find(l=>l.id===slot.lotId)?.units)return null;
 const originRef=owner._frameOrigin,origin={x:originRef.x,z:originRef.z},originSeq=owner._frameOriginSeq;
 const oldSpecTree=retainInertTree(old.spec);
 const oldBody=old.body,oldBodyHandle=oldBody.handle,oldColliders=[...old.colliders],oldHandles=oldColliders.map(c=>c.handle),expected=expectedOrchardPod(p,socket,origin,ctx.lane.constants);
 const boundary=retainRecoveryBoundary(ctx,rec,p),serial=ctx.gate.serial(),dynamic=owner.dynamicRecords,workfleet=owner.ceresWorkfleetRecords;
 const dynamicBefore=[...Set.prototype.values.call(dynamic)],workfleetBefore=[...Set.prototype.values.call(workfleet)];
 const publicationCells=['physicsBody','data','vel','angVel','rot','physicsSleeping','_physicsPartition'].map(key=>[entity,key,Object.getOwnPropertyDescriptor(entity,key)]);
 publicationCells.push([owner,'_staticLayerVersion',Object.getOwnPropertyDescriptor(owner,'_staticLayerVersion')]);
 if(publicationCells.some(([object,key,d])=>!d ? !['physicsSleeping','_physicsPartition'].includes(key) || !Object.isExtensible(object) : !('value' in d) || !d.writable))return null;
 const nextRow=normalizeOrchardRecord(f.row),nextSlot=nextRow.sockets[socket];
 Object.assign(nextSlot,{status:'drifting',handoff:'ready',targetRevision:pod.spec.revision+1,readyTick:tick});
 const finite=finitePublication(f,nextRow);if(!finite)return null;
 const ticket={kind:'pod-handoff',body:null,bodyHandle:null,colliders:[],colliderHandles:[],record:null,view:null,removed:new Set(),remaining:[...oldColliders],oldBodyRemoved:false};
 let status='pending',before=null,scratch=null,spec=null,cache=null,index=null,prepared=null,initialVelocity=null,initialAngular=null,stagedTree=null,nativeYaw=null;
 const ownerCurrent=()=>ownerContexts.get(owner)===ctx && contextCurrent(ctx);
 const cellCurrent=()=>publicationCells.every(([object,key,d])=>{const n=Object.getOwnPropertyDescriptor(object,key);return d ? n && 'value' in n && n.value===d.value && n.writable===d.writable && n.configurable===d.configurable && n.enumerable===d.enumerable : n===undefined && Object.isExtensible(object);});
 const setSame=(set,rows)=>Object.getOwnPropertyDescriptor(Set.prototype,'size').get.call(set)===rows.length && rows.every(r=>Set.prototype.has.call(set,r));
 const originalSets=()=>ownData(owner,['dynamicRecords','ceresWorkfleetRecords']) && owner.dynamicRecords===dynamic && owner.ceresWorkfleetRecords===workfleet && setSame(dynamic,dynamicBefore) && setSame(workfleet,workfleetBefore);
 const stagedCurrent=()=>!scratch || ownData(scratch,['physicsBody','data','pos','vel','rot','angVel','occupantGeneration'])
  && scratch.physicsBody===cache.body && scratch.data===pod.data && scratch.occupantGeneration===pod.life
  && ownData(scratch.pos,['x','z']) && ownData(scratch.vel,['x','z']) && scratch.pos.x===pod.pos.x && scratch.pos.z===pod.pos.z && scratch.rot===entity.rot
  && scratch.vel.x===initialVelocity.x && scratch.vel.z===initialVelocity.z && scratch.angVel===-initialAngular.y && inertTreeUnchanged(spec,stagedTree)
  && (!ticket.record || ownData(ticket.record,['entity','spec','revision','body','collider','colliders']) && ticket.record.entity===scratch && ticket.record.spec===spec
   && ticket.record.revision===spec.revision && ticket.record.body===ticket.body && ticket.record.collider===ticket.colliders[0]
   && Array.isArray(ticket.record.colliders) && ticket.record.colliders.length===ticket.colliders.length && ticket.colliders.every((c,i)=>Object.getOwnPropertyDescriptor(ticket.record.colliders,String(i))?.value===c));
 const references=()=>status==='pending' && ownerCurrent() && ctx.custody===ticket && ctx.phase==='custody' && ctx.gate.serial()===serial
  && boundary.references() && originalSets() && cellCurrent() && finiteCurrent(f,p,tick) && pod.current() && Map.prototype.get.call(f.entities,pod.id)===entity
  && ownData(old,['entity','spec','revision','body','collider','colliders']) && old.revision===pod.spec.revision && inertTreeUnchanged(old.spec,oldSpecTree)
  && owner._frameOrigin===originRef && ownData(originRef,['x','z']) && originRef.x===origin.x && originRef.z===origin.z && owner._frameOriginSeq===originSeq
  && (!cache || cache.current()) && (!index || index.current()) && stagedCurrent();
 const constraints=()=>noRecoveryConstraints(owner,rec,p) && noRecoveryConstraints(owner,old,{id:pod.id,body:oldBody});
 const current=()=>references() && boundary() && constraints() && ctx.lane.verify() && references();
 ticket.references=references;ticket.current=current;
 const release=()=>{if(ownerCurrent() && ctx.custody===ticket){ctx.custody=null;ctx.phase='idle';ctx.gate.phase('idle');}};
 const abort=()=>{
  if(status==='committed' || ticket.removed.size || ticket.oldBodyRemoved)return false;
  status='aborted';
  if(!ownerCurrent() || ctx.custody!==ticket)return false;
  try{
   if(ticket.body){
    if(!ctx.lane.verify() || insertionAllocationClaimed(ctx,ticket,pod) || !ownerCurrent())return false;
    if(ctx.lane.rawRead('bodies','contains',ticket.bodyHandle)){
     if(!ctx.lane.matchesObject('bodies',ticket.body,ticket.bodyHandle))return false;
     const count=ctx.lane.rawRead('bodies','rbNumColliders',ticket.bodyHandle);
     for(let i=0;i<count;i++){const handle=ctx.lane.rawRead('bodies','rbCollider',ticket.bodyHandle,i);if(!ticket.colliderHandles.includes(handle))return false;}
     ctx.world.removeRigidBody(ticket.body);if(!ownerCurrent() || !ctx.lane.verify())return false;
    }
    if(ctx.lane.rawRead('bodies','contains',ticket.bodyHandle))return false;
   }
   release();return true;
  }catch(_){return false;}
 };
 ticket.abort=abort;ctx.custody=ticket;ctx.phase='custody';ctx.gate.phase('custody');ctx.pendingTail=null;
 const observation=()=>{
  const view=recoveryView(owner,null,ticket);
  for(const h of oldHandles)Map.prototype.delete.call(view._colliderOwners,h);
  if(ticket.oldBodyRemoved)Map.prototype.delete.call(view.records,pod.id);
  else if(ticket.removed.size){const row={...old,collider:ticket.remaining[0],colliders:[...ticket.remaining]};Map.prototype.set.call(view.records,pod.id,row);for(const c of ticket.remaining)Map.prototype.set.call(view._colliderOwners,c.handle,{rec:row,collider:c});}
  else for(const c of oldColliders)Map.prototype.set.call(view._colliderOwners,c.handle,Map.prototype.get.call(owner._colliderOwners,c.handle));
  if(ticket.record){Map.prototype.set.call(view.records,Symbol('orchard-dynamic-stage'),ticket.record);for(let i=0;i<ticket.colliders.length;i++)Map.prototype.set.call(view._colliderOwners,ticket.colliderHandles[i],{rec:ticket.record,collider:ticket.colliders[i]});}
  const scan=prepareOrchardNativeObservation(view,ctx.lane);if(!current())throw Error('orchard_handoff_superseded');return scan;
 };
 const dynamicMatches=b=>!!b && b.type===ctx.lane.constants.RigidBodyType.Dynamic && b.enabled && b.ccd===false && b.mass===10
  && vectorEqual(b.localCom,{x:0,y:0,z:0}) && vectorEqual(b.principalInertia,{x:1,y:16.2,z:1}) && vectorEqual(b.principalFrame,{x:0,y:0,z:0,w:1})
  && vectorEqual(b.effectiveInvMass,{x:.1,y:0,z:.1}) && b.effectiveInvInertia?.every((v,i)=>close(v,i===3?1/16.2:0))
  && b.linearDamping===0 && b.angularDamping===Math.fround(.15) && vectorEqual(b.v,initialVelocity) && vectorEqual(b.w,initialAngular)
  && insertionPodMatches({...b,type:ctx.lane.constants.RigidBodyType.Fixed,ccd:canonicalPod.ccd,v:{x:0,y:0,z:0},w:{x:0,y:0,z:0}},expected,ticket.record,ctx.lane.constants);
 const valid=snapshot=>{
  if(!observationMatches(snapshot.byHandle.get(p.body.handle),p,origin,ctx.lane.constants) || snapshot.attached.get(p.body.handle)?.length
   || snapshot.attached.get(oldBodyHandle)?.length || ticket.body && snapshot.attached.get(ticket.bodyHandle)?.length
   || JSON.stringify(snapshot.joints)!==JSON.stringify(before.joints))return false;
  const peers=snapshot.bodies.filter(b=>b.object!==ticket.body),expectedPeers=before.bodies.filter(b=>!ticket.oldBodyRemoved || b.object!==oldBody).map(b=>b.object!==oldBody?b:{...b,colliders:ticket.remaining.map(c=>b.colliders.find(x=>x.object===c))});
  if(nativeContract({bodies:peers})!==nativeContract({bodies:expectedPeers}))return false;
  if(ticket.record && !dynamicMatches(snapshot.byHandle.get(ticket.bodyHandle)))return false;
  return true;
 };
 const preflight=()=>{prepared=null;try{if(!ticket.record || !current())return false;const next=observation(),snapshot=next.scan();if(!valid(snapshot))return false;const q=snapshot.byHandle.get(ticket.bodyHandle).q;nativeYaw=-Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));prepared=next;return true;}catch(_){return false;}};
 try{
  const first=observation();before=first.scan();
  if(!insertionPodMatches(before.byHandle.get(oldBodyHandle),expected,old,ctx.lane.constants) || !valid(before)){abort();return null;}
  initialVelocity=ctx.lane.pointVelocity(p.body.handle,expected.t);initialAngular={...before.byHandle.get(p.body.handle).w};
  if(!vectorEqual(initialVelocity,{x:0,y:0,z:0}) || !vectorEqual(initialAngular,{x:0,y:0,z:0})){abort();return null;}
  const descriptors=Object.getOwnPropertyDescriptors(entity);
  descriptors.physicsBody={...descriptors.physicsBody,value:orchardPodBodySpec({dynamic:true,revision:nextSlot.targetRevision})};
  descriptors.pos={...descriptors.pos,value:{...pod.pos}};descriptors.prevPos={...descriptors.prevPos,value:{...pod.pos}};
  descriptors.vel={...descriptors.vel,value:{x:initialVelocity.x,y:0,z:initialVelocity.z}};descriptors.angVel={...descriptors.angVel,value:-initialAngular.y};descriptors.physicsSleeping={writable:true,configurable:true,enumerable:true,...descriptors.physicsSleeping,value:false};
  scratch=Object.create(Object.getPrototypeOf(entity),descriptors);ensurePhysicsBodySpec(scratch);
  cache=preparePhysicsBodyNormalizationReplacement(entity,scratch);if(!cache){scratch=null;abort();return null;}
  spec=resolvePhysicsBodySpec(scratch);stagedTree=retainInertTree(spec);index=prepareEntityPhysicsIndexPublication(state,entity,cache.body);if(!index){abort();return null;}
  ticket.view=recoveryView(owner,null,ticket);ticket.record=createRecord(ticket.view,scratch,spec,old,ticket);
  if(!preflight()){abort();return null;}
  const nextData=Object.create(Object.getPrototypeOf(pod.data),{...Object.getOwnPropertyDescriptors(pod.data),masslineTetherable:{...Object.getOwnPropertyDescriptor(pod.data,'masslineTetherable'),value:true}});
  const readyProjection={...p,finite:{...f,row:finite.next}};
  const ready=makeReadyPodLease(owner,ctx,ticket.record,entity,readyProjection,socket,state,cache.body,nextData,'live-handoff');
  if(!ready){abort();return null;}ready.p=p;
  const commit=()=>{
   if(status!=='pending')return false;
   try{
    if(!preflight())return false;
    for(const collider of oldColliders)if(!ticket.removed.has(collider)){
     if(!current() || !valid(observation().scan()))return false;
     try{ctx.world.removeCollider(collider,false);}finally{if(ownerCurrent() && ctx.lane.verify() && !ctx.lane.rawRead('colliders','contains',collider.handle)){ticket.removed.add(collider);const i=ticket.remaining.indexOf(collider);ticket.remaining[i]=ticket.remaining.at(-1);ticket.remaining.pop();}}
     if(!current())return false;
    }
    if(!ticket.oldBodyRemoved){
     if(!current() || !valid(observation().scan()))return false;
     try{ctx.world.removeRigidBody(oldBody);}finally{if(ownerCurrent() && ctx.lane.verify() && !ctx.lane.rawRead('bodies','contains',oldBodyHandle))ticket.oldBodyRemoved=true;}
    }
    if(!current())return false;
    const final=observation();if(!references() || !retained(p) || !motorStorageCurrent(p) || !constraints() || !references() || !valid(final.scan()))return false;
    // No native or callback-capable source operation follows this observation.
    ticket.record.entity=entity;
    Map.prototype.set.call(owner.records,pod.id,ticket.record);for(const h of oldHandles)Map.prototype.delete.call(owner._colliderOwners,h);
    for(let i=0;i<ticket.colliders.length;i++)Map.prototype.set.call(owner._colliderOwners,ticket.colliderHandles[i],{rec:ticket.record,collider:ticket.colliders[i]});
    Set.prototype.delete.call(dynamic,old);Set.prototype.add.call(dynamic,ticket.record);Set.prototype.delete.call(workfleet,old);
    for(const [object,key,d] of publicationCells){const value=key==='physicsBody'?cache.body:key==='data'?nextData:key==='vel'?scratch.vel:key==='angVel'?scratch.angVel:key==='rot'?nativeYaw:key==='physicsSleeping'?false:key==='_physicsPartition'?undefined:null;Object.defineProperty(object,key,{writable:true,configurable:true,enumerable:true,...d,value});}
    // The fixed-to-dynamic publication invalidates the derived activity partition above.
    // Its next ordinary classify owns recomputing the partition and global epoch; retaining
    // the old static byte would retire this newly released native body on the next tick.
    cache.commit();index.publish();consumePhysicsCommand(entity);consumeProjectileContinuation(entity);finite.publish(p);ready.f=p.finite;
    podHandoffs.set(entity,ready);readyRecordLeases.set(ticket.record,ready);ctx.readyPods.add(ready);status='committed';release();return true;
   }catch(_){return false;}
  };
  ticket.resume=commit;
  return Object.freeze({preflight,commit,abort,get committed(){return status==='committed';}});
 }catch(_){abort();return null;}
}
export function resumeOrchardPodHandoff(owner,capability){const ctx=ownerContexts.get(owner);return !!ctx && ctx.capability===capability && ctx.custody?.kind==='pod-handoff' && !!ctx.custody.resume?.();}
