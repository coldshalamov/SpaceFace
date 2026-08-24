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

function programIdentity(program) {
  if (!program) return '';
  return String(program.cacheKey || program.name || (program.id != null ? `id:${program.id}` : ''));
}

function rendererProgramKeys(renderer) {
  const programs = renderer && renderer.info && renderer.info.programs;
  return new Set(Array.isArray(programs) ? programs.map(programIdentity).filter(Boolean) : []);
}

function materialProgramKeys(renderer, material) {
  if (!renderer || !material || !renderer.properties
      || typeof renderer.properties.get !== 'function') return new Set();
  let properties = null;
  try { properties = renderer.properties.get(material); } catch (_) { return new Set(); }
  const keys = new Set();
  const programs = properties && properties.programs;
  if (programs && typeof programs.keys === 'function') {
    for (const key of programs.keys()) if (key != null && String(key)) keys.add(String(key));
  }
  const current = properties && properties.currentProgram;
  const currentKey = programIdentity(current);
  if (currentKey) keys.add(currentKey);
  return keys;
}

function geometryDisposeListenerCount(geometry) {
  const listeners = geometry && geometry._listeners && geometry._listeners.dispose;
  if (Array.isArray(listeners)) return listeners.length;
  return listeners && Number.isFinite(listeners.size) ? listeners.size : 0;
}

function admissionRoot(object, scene) {
  let root = object || null;
  while (root && root.parent && root.parent !== scene) root = root.parent;
  return root || object || null;
}

function objectLabel(object) {
  return String(object && (object.name || object.type || object.uuid) || 'unnamed-object');
}

function materialLabel(material) {
  return String(material && (material.name || material.type || material.uuid) || 'no-material');
}

export function openingProgramFamilyKey(key) {
  const value = String(key || 'unknown').trim();
  if (!value) return 'unknown';
  if (value === 'physical' || value.startsWith('physical,STANDARD')) return 'physical,STANDARD';
  const comma = value.indexOf(',');
  return comma >= 0 ? value.slice(0, comma) : value;
}

/**
 * Capture the one-frame identity baseline used to attribute a renderer.info count delta back to
 * production objects. Three does not expose WebGLGeometries, so the geometry marker observes the
 * dispose listener installed by WebGLGeometries.get() on first admission. This is diagnostic only;
 * the aggregate renderer.info delta remains the gate authority.
 */
export function captureOpeningAdmissionIdentity(renderer, scene, plan = null) {
  const planned = new Set(Array.isArray(plan && plan.compileSubjects)
    ? plan.compileSubjects.filter(Boolean) : []);
  const objects = new Map();
  if (scene && typeof scene.traverse === 'function') {
    scene.traverse((object) => {
      if (!isDrawable(object)) return;
      const materials = new Map();
      for (const material of materialList(object)) {
        materials.set(material, materialProgramKeys(renderer, material));
      }
      objects.set(object, {
        geometry: object.geometry || null,
        geometryDisposeListeners: geometryDisposeListenerCount(object.geometry),
        materials,
        planned: planned.has(object),
      });
    });
  }
  return {
    programKeys: rendererProgramKeys(renderer),
    objects,
  };
}

function exemptionFor(row, exemptions) {
  for (const exemption of exemptions || []) {
    const reason = String(exemption && exemption.reason || '').trim();
    if (!reason) continue;
    if (exemption.root != null && String(exemption.root) !== row.root) continue;
    if (exemption.object != null && String(exemption.object) !== row.object) continue;
    if (exemption.material != null && String(exemption.material) !== row.material) continue;
    if (exemption.programFamilyKey != null
        && !row.programFamilyKeys.includes(String(exemption.programFamilyKey))) continue;
    return reason;
  }
  return null;
}

/** Name every scene-owned object/material that acquired geometry or a new program on first draw. */
export function describeOpeningAdmissionIdentityDelta(
  before, renderer, scene, plan = null, options = {},
) {
  const baseline = before || { programKeys: new Set(), objects: new Map() };
  const afterProgramKeys = rendererProgramKeys(renderer);
  const newProgramKeys = [...afterProgramKeys]
    .filter((key) => !baseline.programKeys.has(key))
    .sort();
  const newProgramSet = new Set(newProgramKeys);
  const newProgramFamilyKeys = [...new Set(newProgramKeys.map(openingProgramFamilyKey))].sort();
  const planned = new Set(Array.isArray(plan && plan.compileSubjects)
    ? plan.compileSubjects.filter(Boolean) : []);
  const lateAdmissions = [];
  const attributedProgramKeys = new Set();

  if (scene && typeof scene.traverse === 'function') {
    scene.traverse((object) => {
      if (!isDrawable(object)) return;
      const prior = baseline.objects.get(object);
      const geometryAdmitted = !!object.geometry && (
        !prior
        || prior.geometry !== object.geometry
        || geometryDisposeListenerCount(object.geometry) > prior.geometryDisposeListeners
      );
      const materials = materialList(object);
      const rows = materials.length > 0 ? materials : [null];
      for (const material of rows) {
        const priorKeys = prior && prior.materials.get(material) || new Set();
        const programKeys = [...materialProgramKeys(renderer, material)]
          .filter((key) => newProgramSet.has(key) && !priorKeys.has(key))
          .sort();
        if (!geometryAdmitted && programKeys.length === 0) continue;
        for (const key of programKeys) attributedProgramKeys.add(key);
        const root = admissionRoot(object, scene);
        const row = {
          root: objectLabel(root),
          object: objectLabel(object),
          material: materialLabel(material),
          materialType: String(material && material.type || 'Material'),
          geometryAdmitted,
          programFamilyKeys: [...new Set(programKeys.map(openingProgramFamilyKey))].sort(),
          programKeys,
          planned: planned.has(object) || !!(prior && prior.planned),
          exempted: false,
          exemptionReason: null,
        };
        const reason = exemptionFor(row, options.exemptions);
        if (reason) {
          row.exempted = true;
          row.exemptionReason = reason;
        }
        lateAdmissions.push(row);
      }
    });
  }

  lateAdmissions.sort((a, b) => (
    a.root.localeCompare(b.root)
    || a.object.localeCompare(b.object)
    || a.material.localeCompare(b.material)
  ));
  const unattributedProgramKeys = newProgramKeys
    .filter((key) => !attributedProgramKeys.has(key));
  const unattributedProgramFamilyKeys = [...new Set(
    unattributedProgramKeys.map(openingProgramFamilyKey),
  )].sort();
  const exemptedProgramFamilyKeys = [];
  const unexplainedProgramFamilies = [];
  for (const family of unattributedProgramFamilyKeys) {
    const exemption = exemptionFor({
      root: '', object: '', material: '', programFamilyKeys: [family],
    }, options.exemptions);
    if (exemption) exemptedProgramFamilyKeys.push({ family, reason: exemption });
    else unexplainedProgramFamilies.push(family);
  }
  return {
    newProgramKeys,
    newProgramFamilyKeys,
    lateAdmissions,
    unattributedProgramKeys,
    unattributedProgramFamilyKeys: unexplainedProgramFamilies,
    exemptedProgramFamilyKeys,
    unexplained: lateAdmissions.some((row) => row.exempted !== true)
      || unexplainedProgramFamilies.length > 0,
  };
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
