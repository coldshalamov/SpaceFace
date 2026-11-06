import { CERES_WORKFLEET_CONTRACT as C } from '../data/ceresWorkfleet.js';

// The package compiler preserves the named semantic node as a carrier and moves
// its drawable into an identity-transform child. Restore the drawable's authored
// name before material/LOD specialization, without moving geometry or changing
// the semantic locator and motion-bank references held by the package instance.
export function normalizeCeresWorkfleetPackageNodes(assetId, planNodes, tagsByName) {
  const role = Object.keys(C.assets).find(key => C.assets[key].assetId === assetId);
  if (!role) return null;
  const expected = role === 'cradle'
    ? new Set([0, 1, 2].flatMap(lod => ['Armor', 'BrushedMetal', 'Warning']
      .map(finish => `LOD${lod}_HOOK_CERES_DEPTH_KEEPER_${finish}`)))
    : new Set(C.assets[role].propulsion.channels.flatMap(channel => channel.coreMeshes));
  const overrides = new WeakMap();
  for (const carrier of planNodes) {
    const name = carrier.name;
    if (!expected.has(name) || carrier.isMesh || carrier.children.length !== 1
      || carrier.userData?.spacefaceRenderPackageSemantic?.rawNodeName !== name) continue;
    const mesh = carrier.children[0];
    if (!mesh.isMesh || mesh.children.length || !mesh.name.startsWith(`${name}_`)
      || mesh.position.lengthSq() !== 0 || mesh.quaternion.x !== 0 || mesh.quaternion.y !== 0
      || mesh.quaternion.z !== 0 || mesh.quaternion.w !== 1
      || mesh.scale.x !== 1 || mesh.scale.y !== 1 || mesh.scale.z !== 1) continue;
    const tags = tagsByName.get(mesh.name) || mesh.userData?.spacefaceTags || {};
    overrides.set(mesh, { ...tags, instance: false, ...(role === 'cradle' ? {} : { drive: 'core' }) });
    carrier.name = `CeresPackageCarrier_${role}`;
    mesh.name = name;
  }
  return overrides;
}
