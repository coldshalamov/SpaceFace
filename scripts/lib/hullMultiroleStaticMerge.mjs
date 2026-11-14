// These LOD0 siblings are static, identically tagged pieces of the same hull. Group only
// same-material leaves; the original semantic nodes, all other LODs and mounts remain.
const GROUPS = Object.freeze([
  Object.freeze({ material: 'Material_Hull', names: Object.freeze([
    'LOD0_HULL_MULTIROLE_MAIN', 'LOD0_DET_field_repair',
    'LOD0_DET_mismatched_panel', 'LOD0_DET_salvage_patch',
  ]) }),
  Object.freeze({ material: 'Material_Mechanical', names: Object.freeze([
    'LOD0_DET_antenna_jury', 'LOD0_DET_cargo_rig',
    'LOD0_DET_jury_weld', 'LOD0_DET_smuggler_hatch',
  ]) }),
]);
const EXPECTED_EXTRAS = JSON.stringify({
  spaceface_chamfered: true, spacefaceLod: 'lod0',
  spaceface: { lod: 'lod0', tint: 'hull', chamfered: true },
});

export function configureHullMultiroleStaticMerge(pilot, semanticNodes, meshNodes, mergeGroups) {
  if (pilot?.key !== 'hull-multirole' || pilot.assetId !== 'sf.render.hull-multirole'
    || pilot.runtimeAssetId !== 'SF_HULL_MULTIROLE' || pilot.slot !== 'hull') return false;

  const prepared = [];
  for (const group of GROUPS) {
    const records = group.names.map(name => semanticNodes.filter(record => record.node === name));
    const nodes = group.names.map(name => meshNodes.filter(node => node.getName() === name));
    if (records.some(list => list.length !== 1) || nodes.some(list => list.length !== 1)) return false;
    const selected = records.map(([record]) => record), source = nodes.map(([node]) => node);
    const parent = source[0].getParentNode();
    if (!parent || parent.getName() !== 'HULL_MULTIROLE_ROOT'
      || selected.some(record => record.role !== 'immutable' || record.parentId !== `${pilot.assetId}.root`
        || record.pipelineKey !== 'opaque' || record.transparency !== 'opaque' || record.independentlyCulled
        || record.cullingGroup !== selected[0].cullingGroup || record.spatialClusterId !== selected[0].spatialClusterId)
      || source.some(node => node.getParentNode() !== parent || node.listChildren().length || node.getWeights().length
        || JSON.stringify(node.getExtras()) !== EXPECTED_EXTRAS)) return false;
    const lists = source.map(node => node.getMesh()?.listPrimitives());
    if (lists.some(list => list?.length !== 1)) return false;
    const primitives = lists.map(([primitive]) => primitive), material = primitives[0].getMaterial();
    if (!material || material.getName() !== group.material || primitives.some(primitive =>
      primitive.getMaterial() !== material || primitive.getMode() !== 4
      || !primitive.getIndices() || primitive.listTargets().length)) return false;
    const signature = primitive => JSON.stringify({
      index: [primitive.getIndices().getComponentType(), primitive.getIndices().getNormalized()],
      attributes: primitive.listSemantics().sort().map(semantic => {
        const accessor = primitive.getAttribute(semantic);
        return [semantic, accessor.getType(), accessor.getComponentType(), accessor.getNormalized()];
      }),
    });
    if (primitives.some(primitive => signature(primitive) !== signature(primitives[0]))) return false;
    prepared.push({ group, selected });
  }

  for (const { group, selected } of prepared) {
    const boundary = `hull-multirole-lod0-${group.material}`;
    for (const record of selected) record.mergeBoundary = boundary;
    mergeGroups.push({ id: `${pilot.assetId}.${group.material}`, nodeIds: selected.map(record => record.id) });
  }
  return true;
}
