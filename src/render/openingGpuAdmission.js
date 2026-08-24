// Finite opening GPU admission.
//
// The first-picture census used to collapse many live materials onto a handful of family
// `customProgramCacheKey` strings, then compile those leaves without a real draw. On Intel/ANGLE
// without KHR_parallel_shader_compile, link and bufferData still happen in the first bloomScene.
// This module admits unique materials and geometries one unit at a time against the live target,
// yielding between units so neither cost lands in one presented scene pass.

import { compileSubjectsAcrossPresents } from './compilePresentSlice.js';

function isDrawable(object) {
  return !!(object && (
    object.isMesh === true
    || object.isSkinnedMesh === true
    || object.isInstancedMesh === true
    || object.isPoints === true
    || object.isLine === true
    || object.isSprite === true
  ));
}

function materialList(object) {
  return Array.isArray(object && object.material)
    ? object.material.filter(Boolean)
    : object && object.material ? [object.material] : [];
}

export function uniqueAdmissionUnits(subjects) {
  const programSubjects = [];
  const geometrySubjects = [];
  const seenMaterials = new Set();
  const seenGeometries = new Set();
  const list = Array.isArray(subjects) ? subjects : [subjects];
  for (const object of list) {
    if (!object) continue;
    let addedProgram = false;
    for (const material of materialList(object)) {
      if (seenMaterials.has(material)) continue;
      seenMaterials.add(material);
      if (!addedProgram) {
        programSubjects.push(object);
        addedProgram = true;
      }
    }
    if (object.geometry && !seenGeometries.has(object.geometry)) {
      seenGeometries.add(object.geometry);
      geometrySubjects.push(object);
    }
  }
  return {
    programSubjects,
    geometrySubjects,
    materialCount: seenMaterials.size,
    geometryCount: seenGeometries.size,
  };
}

export function withOnlySubjectsDrawable(scene, subjects, fn) {
  const keep = new Set((Array.isArray(subjects) ? subjects : [subjects]).filter(Boolean));
  const saved = [];
  if (scene && typeof scene.traverse === 'function') {
    scene.traverse((object) => {
      if (!isDrawable(object) || keep.has(object)) return;
      saved.push({ object, visible: object.visible });
      object.visible = false;
    });
  }
  try {
    return fn();
  } finally {
    for (const entry of saved) entry.object.visible = entry.visible;
  }
}

/**
 * Draw one already-compiled subject to the exact HDR/screen target so ANGLE links the program
 * and uploads its buffers. Other drawables stay in the graph for lights but are hidden so this
 * is not a whole-scene discovery pass.
 */
export function touchSubjectOnExactTarget(renderer, renderTarget, subject, camera, lightingScene) {
  if (!renderer || typeof renderer.render !== 'function' || !subject || !lightingScene) {
    return { skipped: true, reason: 'touch unavailable' };
  }
  const previousTarget = typeof renderer.getRenderTarget === 'function'
    ? renderer.getRenderTarget()
    : null;
  const previousAutoClear = renderer.autoClear;
  try {
    renderer.autoClear = false;
    if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(renderTarget || null);
    withOnlySubjectsDrawable(lightingScene, [subject], () => {
      if (typeof subject.updateMatrixWorld === 'function') subject.updateMatrixWorld(true);
      renderer.render(lightingScene, camera);
    });
    return { skipped: false };
  } finally {
    renderer.autoClear = previousAutoClear;
    if (typeof renderer.setRenderTarget === 'function') {
      renderer.setRenderTarget(previousTarget || null);
    }
  }
}

export async function admitOpeningUnitsAcrossSlices(options = {}) {
  const units = options.units || uniqueAdmissionUnits(options.subjects || []);
  const compileOne = typeof options.compileOne === 'function' ? options.compileOne : null;
  const touchOne = typeof options.touchOne === 'function' ? options.touchOne : null;
  const yieldToMain = typeof options.yieldToMain === 'function' ? options.yieldToMain : null;
  const seen = new Set();
  const ordered = [];
  for (const subject of [...(units.programSubjects || []), ...(units.geometrySubjects || [])]) {
    if (!subject || seen.has(subject)) continue;
    seen.add(subject);
    ordered.push(subject);
  }
  const results = await compileSubjectsAcrossPresents(
    ordered,
    async (subject) => {
      const compiled = compileOne ? await compileOne(subject) : null;
      const touched = touchOne ? touchOne(subject) : null;
      return { compiled, touched };
    },
    yieldToMain,
    { budgetMs: 0 },
  );
  return {
    skipped: ordered.length === 0,
    subjects: ordered.length,
    materials: Number(units.materialCount) || (units.programSubjects || []).length,
    geometries: Number(units.geometryCount) || (units.geometrySubjects || []).length,
    results,
  };
}
