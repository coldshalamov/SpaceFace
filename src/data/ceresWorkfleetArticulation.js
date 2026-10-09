// One accepted fixed-step fraction drives native contacts, query proxies and authored rigs.
// No simulation state is advanced here; all geometry comes from the frozen workfleet boxes.
import { CERES_WORKFLEET_CONTRACT as C, ceresWorkfleetCollision } from './ceresWorkfleet.js';

export const CERES_WORKFLEET_SLIDE_SECONDS = 3;
export const clampCeresWorkfleetSlide = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
export const ceresWorkfleetSlide = entity => clampCeresWorkfleetSlide(entity?.data?.ceresWorkfleetSlide);
const roles = ['breaker', 'cradle'];
const recipes = Object.fromEntries([['breaker','keepers-v2'],['cradle','open-v1'],['cradle','keepers-v2']].map(([role,layout])=>{
  const open=ceresWorkfleetCollision(role,'open',layout),retained=ceresWorkfleetCollision(role,'retained',layout);
  return [open.id,{role,layout,open:open.primitives,retained:retained.primitives}];
}));
const recipeFor = manifest => recipes[manifest?.id?.replace(':retained:',':open:')];
const endpoints = Object.fromEntries(roles.map(role=>[role,recipeFor(ceresWorkfleetCollision(role))]));

/** Explicit identity AND authored compound opt-in; ordinary ships/wrecks never articulate. */
export function ceresWorkfleetSlideRole(entity, manifest = entity?.physicsBody?.collisionProxyManifest) {
  const role = entity?.data?.ceresWorkfleetRole;
  if (!roles.includes(role) || entity.data.worldRecordId !== C.identities[role === 'breaker' ? 'worker' : role]) return null;
  const recipe=recipeFor(manifest);if(recipe?.role!==role)return null;
  const rest=recipe.open;
  if (!Array.isArray(manifest.primitives) || manifest.primitives.length !== rest.length
    || manifest.primitives.some((p, i) => p.kind !== 'obb' || p.id !== rest[i].id)) return null;
  return role;
}

/** Pure normalized OBB pose. Rams interpolate extent as well as their centre. */
export function poseCeresWorkfleetPrimitive(primitive, role, fraction) {
  const pair = endpoints[role], index = pair?.open.findIndex(p => p.id === primitive.id) ?? -1;
  if (index < 0) return { ...primitive };
  const a = pair.open[index], b = pair.retained[index], f = clampCeresWorkfleetSlide(fraction);
  const p = { ...primitive };
  for (const key of ['x', 'z', 'hx', 'hz']) p[key] = a[key] + (b[key] - a[key]) * f;
  return p;
}

export function ceresWorkfleetPosePrimitives(entity) {
  const role = ceresWorkfleetSlideRole(entity);
  return role ? recipeFor(entity.physicsBody.collisionProxyManifest).open.map(p => poseCeresWorkfleetPrimitive(p, role, ceresWorkfleetSlide(entity))) : [];
}

export function ceresWorkfleetMovingPrimitives(role, manifest=null) {
  const pair = manifest?recipeFor(manifest):endpoints[role];
  return pair ? pair.open.map((primitive, index) => ({ primitive, index }))
    .filter(({ primitive: a, index }) => ['x', 'z', 'hx', 'hz'].some(key => a[key] !== pair.retained[index][key])) : [];
}

/** Exact swept box for these one-axis linear slides, including changing ram lengths. */
export function sweepCeresWorkfleetPrimitive(primitive, role, from, to) {
  const a = poseCeresWorkfleetPrimitive(primitive, role, from), b = poseCeresWorkfleetPrimitive(primitive, role, to);
  const x0 = Math.min(a.x - a.hx, b.x - b.hx), x1 = Math.max(a.x + a.hx, b.x + b.hx);
  const z0 = Math.min(a.z - a.hz, b.z - b.hz), z1 = Math.max(a.z + a.hz, b.z + b.hz);
  return { ...a, x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2 };
}

/** Authored root-local rig transform, in source glTF units (WU/sourceScale). */
export function ceresWorkfleetRigPose(rig, fraction, sourceScale = C.sourceScale) {
  const f = clampCeresWorkfleetSlide(fraction), axis = rig.runtimeAxis;
  const position = { x: rig.pivotWU[0] / sourceScale, y: rig.pivotWU[1] / sourceScale, z: rig.pivotWU[2] / sourceScale };
  const scale = { x: 1, y: 1, z: 1 };
  position[axis] += rig.retainedDeltaWU * f / sourceScale;
  scale[axis] = 1 + (rig.retainedScale - 1) * f;
  return { position, scale };
}
