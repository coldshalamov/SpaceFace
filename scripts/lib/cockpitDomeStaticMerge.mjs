// These four opaque detail meshes are static siblings using the same mechanical material.
// Preserve their semantic nodes; the compiler can join their compatible primitives without
// changing the canopy, mount collar, LOD behavior, or any moving/damage boundary.
const DETAIL_NAMES = Object.freeze(['DET_frame_rib_L', 'DET_frame_rib_R', 'DET_mount_bolt', 'DET_mount_bolt.001']);

export function configureCockpitDomeStaticMerge(pilot, semanticNodes, meshNodes, mergeGroups) {
  if (pilot?.key !== 'cockpit-dome' || pilot.assetId !== 'sf.render.cockpit-dome'
    || pilot.runtimeAssetId !== 'SF_COCKPIT_DOME' || pilot.slot !== 'cockpit') return false;
  const records = DETAIL_NAMES.map((name) => semanticNodes.filter((node) => node.node === name));
  const nodes = DETAIL_NAMES.map((name) => meshNodes.filter((node) => node.getName() === name));
  if (records.some((list) => list.length !== 1) || nodes.some((list) => list.length !== 1)) return false;
  const selected = records.map(([record]) => record), source = nodes.map(([node]) => node);
  if (selected.some((record) => record.role !== 'immutable' || record.parentId !== null
      || record.pipelineKey !== 'opaque' || record.transparency !== 'opaque' || record.independentlyCulled
      || record.cullingGroup !== selected[0].cullingGroup || record.spatialClusterId !== selected[0].spatialClusterId)) return false;
  if (source.some((node) => node.getParentNode() || node.listChildren().length || node.getWeights().length
      || JSON.stringify(node.getExtras()) !== '{"spaceface_chamfered":true}')) return false;
  const primitives = source.map((node) => node.getMesh()?.listPrimitives());
  if (primitives.some((list) => list?.length !== 1)) return false;
  const parts = primitives.map(([primitive]) => primitive), material = parts[0].getMaterial();
  if (!material || material.getName() !== 'Material_Mechanical' || parts.some((part) => part.getMaterial() !== material
      || part.getMode() !== 4 || !part.getIndices() || part.listTargets().length)) return false;
  const signature = (part) => JSON.stringify({
    index: [part.getIndices().getComponentType(), part.getIndices().getNormalized()],
    attributes: part.listSemantics().sort().map((semantic) => {
      const accessor = part.getAttribute(semantic);
      return [semantic, accessor.getType(), accessor.getComponentType(), accessor.getNormalized()];
    }),
  });
  if (parts.some((part) => signature(part) !== signature(parts[0]))) return false;
  const boundary = 'cockpit-dome-static-mechanical-details';
  for (const record of selected) record.mergeBoundary = boundary;
  mergeGroups.push({ id: `${pilot.assetId}.static-mechanical-details`, nodeIds: selected.map((record) => record.id) });
  return true;
}
