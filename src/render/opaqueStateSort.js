// State-sorted opaque draw list (render lead, 2026-11-20).
//
// The opaque list used to draw in raw scene-traversal order (`setOpaqueSort(() => 0)`), so
// consecutive draws kept switching shader program: ~62 program binds for ~100 draws a frame on
// the Helios belt. Every bind makes three re-send the camera block, the whole light block and every
// material uniform — the ~900 uniform calls a frame that made `setProgram` the largest single
// cost inside the scene draw. Engines sort the opaque queue by pipeline state (shader, then
// material) for exactly this reason; depth testing makes the order invisible on screen.
//
// Traversal order was load-bearing in a few places, so the sort is segmented instead of global:
// any draw whose result depends on what drew before it is a BARRIER and never moves, and only the
// ordinary draws between two barriers are reordered among themselves. Barriers:
//   - depth-only draws (colorWrite false): the station depth prepass is prepended before its
//     sources and must still precede them;
//   - draws that skip or do not write depth, use a non-default depth function, or use stencil.
// Within a segment: renderOrder (an author's "draw this big occluder first/last"), then program,
// then program variant and material, then front-to-back distance (early depth rejection), with the original traversal
// order as the final tie-break (stable).
import { LessEqualDepth, LessDepth } from 'three';

function isBarrier(material) {
  return material.colorWrite === false
    || material.depthTest === false
    || material.depthWrite === false
    || material.stencilWrite === true
    || (material.depthFunc !== LessEqualDepth && material.depthFunc !== LessDepth);
}

function byState(a, b) {
  return (a.renderOrder - b.renderOrder) || (a.__sfProgramKey - b.__sfProgramKey)
    || (a.__sfMaterialKey - b.__sfMaterialKey) || (a.z - b.z) || (a.__sfOrder - b.__sfOrder);
}

export function createOpaqueStateSort(renderer) {
  const props = renderer && renderer.properties;
  const scratch = [];
  function programIdOf(material) {
    if (!props || typeof props.get !== 'function') return 0;
    const rec = props.get(material);
    const program = rec && rec.currentProgram;
    // A never-drawn material has no program yet: keep it at the end of its segment.
    return program && Number.isFinite(program.id) ? program.id : 0xfffff;
  }
  function sortRange(list, start, end) {
    const n = end - start;
    if (n < 2) return;
    scratch.length = n;
    for (let i = 0; i < n; i++) {
      const item = list[start + i];
      item.__sfOrder = i;
      item.__sfProgramKey = programIdOf(item.material);
      // One material can draw as several program variants (instanced bucket and direct leaf):
      // keep each variant's draws together so they do not ping-pong between programs.
      item.__sfMaterialKey = (item.materialVariant | 0) * 0x1000000 + (item.material.id & 0xffffff);
      scratch[i] = item;
    }
    scratch.sort(byState);
    for (let i = 0; i < n; i++) list[start + i] = scratch[i];
    scratch.length = 0;
  }
  function opaqueStateSort(list) {
    // An unpatched three (node tests resolve node_modules/three) calls this as a comparator:
    // answer "equal", which is exactly the old traversal-order behaviour.
    if (!Array.isArray(list)) return 0;
    let start = 0;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      if (isBarrier(list[i].material)) {
        sortRange(list, start, i);
        start = i + 1;
      }
    }
    sortRange(list, start, n);
  }
  // Read by the vendored WebGLRenderList.sort: hand over the whole list instead of a comparator.
  opaqueStateSort.sortsWholeList = true;
  return opaqueStateSort;
}

export const __test = { isBarrier };
