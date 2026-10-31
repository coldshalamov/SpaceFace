// Opening submission census and exact compile/upload identity planning.
import { collectOpeningSubmissionLeaves, openingProgramSubjectKey } from '../openingSubmissionPlan.js';

/**
 * Return only attached entity roots that can contribute to the current first camera picture.
 * Render residency intentionally lives elsewhere: this census observes the final mesh pose and
 * visibility selected by syncEntityViews() and never builds, stamps, or mutates a root.
 */
export function collectOpeningEntityRootCandidates(meshes, entities, options = {}) {
  const iterator = collectOpeningEntityRootCandidatesSteps(meshes, entities, options);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

// Stepped twin: yields every 32 scanned mesh-map rows so the opening plan's
// drives pace the census under their own slice clocks — identical visit order,
// predicates, and output shape to the sync collector.
export function* collectOpeningEntityRootCandidatesSteps(meshes, entities, options = {}) {
  const candidates = [];
  const playerId = options.playerId;
  const scene = options.scene || null;
  const camera = options.camera || null;
  if (!meshes || typeof meshes[Symbol.iterator] !== 'function') return candidates;
  let censusVisited = 0;
  // Row-granular yields alone under-pace: each visited row pays a
  // whole-subtree collectOpeningSubmissionLeaves traverse, so one 32-row
  // stride can still blow the frame wallet — a fat stride yields early on
  // wall clock too. Visit order and output stay identical.
  const censusNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now());
  // Every census/sweep generator in this file stamps its stride clock AFTER the yield: a driver that awaits a
  // present per yield resumes a frame later, and a clock stamped before that wait reads over the 2 ms limit on
  // the next row, so each following row would yield too.
  let censusStrideAt = censusNow();
  for (const [id, mesh] of meshes) {
    if ((++censusVisited % 32) === 0 || censusNow() - censusStrideAt >= 2) {
      yield;
      censusStrideAt = censusNow();
    }
    if (!mesh || (playerId != null && id === playerId) || mesh.visible === false) continue;
    // _meshes is the entity ownership map, but a prepared/deferred boundary may still be mounted in
    // the scene without becoming an entity root. Only direct live roots belong to this census.
    if (scene && mesh.parent !== scene) continue;
    const entity = entities && typeof entities.get === 'function' ? entities.get(id) : null;
    if (!entity || entity.alive === false || entity._noMesh) continue;
    const authoredState = mesh.userData && mesh.userData.authoredAssetState;
    // Boundaries still waiting on authored GLB admission only expose a temporary marker (or
    // nothing). They must not block the opening submission plan; mid-flight admission owns them.
    if (authoredState === 'awaiting-authored-admission' || authoredState === 'loading') continue;
    const leaves = collectOpeningSubmissionLeaves(mesh, { camera });
    if (leaves.length === 0) continue;
    candidates.push({
      root: mesh,
      role: entity.type === 'station' ? 'tableStationShell' : 'opening-entity-root',
      startupRole: 'first-picture-entity-root',
      blocking: true,
      reason: 'currently-visible-first-picture-entity-root',
    });
  }
  return candidates;
}

/**
 * Roots outside the main camera can still be submitted by the opening directional-shadow pass.
 * Include their complete root because createOpeningSubmissionPlan has one main-camera census; the
 * root's cast-shadow leaf is the reason, while includeOffscreen keeps its exact siblings available
 * to the bounded compile/residency admission rather than dropping the candidate as empty.
 */
export function collectOpeningShadowCasterRootCandidates(meshes, entities, options = {}) {
  const iterator = collectOpeningShadowCasterRootCandidatesSteps(meshes, entities, options);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

// Stepped twin: same cadence contract as the entity-root census — per-32-row
// yields, identical visit order and output to the sync collector.
export function* collectOpeningShadowCasterRootCandidatesSteps(meshes, entities, options = {}) {
  const candidates = [];
  const playerId = options.playerId;
  const scene = options.scene || null;
  const camera = options.camera || null;
  const alreadyIncluded = new Set(Array.isArray(options.alreadyIncluded)
    ? options.alreadyIncluded.filter(Boolean) : []);
  if (!camera || !meshes || typeof meshes[Symbol.iterator] !== 'function') return candidates;
  let censusVisited = 0;
  // Row-granular yields alone under-pace: each visited row pays a
  // whole-subtree collectOpeningSubmissionLeaves traverse, so one 32-row
  // stride can still blow the frame wallet — a fat stride yields early on
  // wall clock too. Visit order and output stay identical.
  const censusNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now());
  let censusStrideAt = censusNow();
  for (const [id, root] of meshes) {
    if ((++censusVisited % 32) === 0 || censusNow() - censusStrideAt >= 2) {
      yield;
      censusStrideAt = censusNow();
    }
    if (!root || alreadyIncluded.has(root) || root.visible === false
        || (playerId != null && id === playerId)) continue;
    if (scene && root.parent !== scene) continue;
    const entity = entities && typeof entities.get === 'function' ? entities.get(id) : null;
    if (!entity || entity.alive === false || entity._noMesh) continue;
    const authoredState = root.userData && root.userData.authoredAssetState;
    if (authoredState === 'awaiting-authored-admission' || authoredState === 'loading') continue;
    const shadowLeaves = collectOpeningSubmissionLeaves(root, { camera });
    if (!shadowLeaves.some((leaf) => leaf && leaf.castShadow === true)) continue;
    candidates.push({
      root,
      role: 'firstFrameShadowCaster',
      startupRole: 'first-shadow-pass-caster',
      blocking: true,
      reason: 'first-shadow-pass-caster-outside-main-camera',
      includeOffscreen: true,
    });
  }
  return candidates;
}

// Compile-issue signature. Admission units dedupe by material OBJECT, so the bounded roster
// warm's palette clones (~3000 unique materials sharing a handful of program signatures) each
// issued their own compile — ~4 ms of reveal/env/compile JS per unit. The linked program is
// keyed by signature, not material identity, so one issue per signature links the cohort.
const _compileIssueMaterialKeys = new WeakMap();

function compileIssueMaterialKey(material) {
  if (!material || typeof material !== 'object') return null;
  const cached = _compileIssueMaterialKeys.get(material);
  if (cached !== undefined) return cached;
  let key = null;
  try {
    // Producer-side subject key: material type + customProgramCacheKey + defines + blending +
    // texture identities + shader source. Never customProgramCacheKey alone — authored
    // families share that string across distinct maps/defines (openingSubmissionPlan §key).
    key = openingProgramSubjectKey(material) || null;
  } catch (_) { key = null; }
  if (key) {
    // three's program cache keys on the FULL customProgramCacheKey() — the default returns
    // onBeforeCompile.toString(), so two same-length patches with equal sampled chars still
    // link separate programs. A partial fingerprint would merge them and skip the compile
    // the round then pays mid-flight; the whole string is the only honest dedupe.
    try {
      const cpck = typeof material.customProgramCacheKey === 'function'
        ? String(material.customProgramCacheKey() || '')
        : '';
      key += `|cpck:${cpck}`;
    } catch (_) { key = null; }
  }
  _compileIssueMaterialKeys.set(material, key);
  return key;
}

/**
 * Program signature for one compile subject, or null when any material cannot be keyed —
 * null never dedupes, so an unkeyable subject always issues its own compile. Object and
 * geometry features that change the linked program while the material stays identical
 * (instancing, skinning, morphs, the vertex attribute set) ride in the same key.
 * Exported for the focused dedupe-key tests.
 */
export function openingCompileIssueKey(subject) {
  if (!subject || typeof subject !== 'object') return null;
  const materials = Array.isArray(subject.material)
    ? subject.material.filter(Boolean)
    : (subject.material ? [subject.material] : []);
  if (materials.length === 0) return null;
  // Each material's full signature is multi-KB (shader source + customProgramCacheKey). Interned to
  // a compact id once per distinct signature, so a subject's key is short: the dedupe Set hashes a
  // few dozen characters per subject instead of rebuilding and hashing KBs for every one of the
  // thousands of subjects an opening cook walks (0.9 s of main thread in the 2026-10-13 launch profile).
  let parts = '';
  for (let i = 0; i < materials.length; i++) {
    const key = compileIssueMaterialKey(materials[i]);
    if (!key) return null;
    parts += (i > 0 ? ',' : '') + internCompileIssueKey(key);
  }
  const geometry = subject.geometry;
  const { attributes, morphs } = compileIssueGeometrySignature(geometry);
  const drawClass = (subject.isInstancedMesh === true ? 'I' : '')
    + (subject.isSkinnedMesh === true ? 'S' : '')
    + (subject.isBatchedMesh === true ? 'B' : '')
    + (subject.isPoints === true ? 'P' : '')
    + (subject.isLine === true ? 'L' : '')
    + (subject.isSprite === true ? 'R' : '')
    + (subject.isMesh === true ? 'M' : '');
  return `${drawClass}|${attributes}|${morphs}`
    + `|${geometry && geometry.morphTargetsRelative === true ? 'rel' : ''}`
    + `${subject.isInstancedMesh === true && subject.instanceColor != null ? '|ic' : ''}`
    + `${subject.isInstancedMesh === true && subject.morphTexture != null ? '|im' : ''}`
    + `${subject.isBatchedMesh === true && subject._colorsTexture != null ? '|bc' : ''}`
    + `|m${parts}`;
}

/** Exact preparation is reusable only while this leaf's upload and program inputs stay unchanged. */
const openingResourceIds = new WeakMap();
let nextOpeningResourceId = 0;
function openingResourceVersion(resource) {
  if (!resource || typeof resource !== 'object') return '';
  if (!openingResourceIds.has(resource)) openingResourceIds.set(resource, ++nextOpeningResourceId);
  return `${openingResourceIds.get(resource)}:${resource.version || resource.data?.version || 0}`
    + `:${resource.array ? openingResourceVersion(resource.array) : ''}`;
}
export function openingPreparedLeafKey(subject, context = '') {
  const program = openingCompileIssueKey(subject);
  if (!program || !subject.geometry) return null;
  const geometry = subject.geometry;
  const versions = Object.entries(geometry.attributes || {}).map(([name, attribute]) => (
    `${name}:${openingResourceVersion(attribute)}:${attribute.count || 0}`
  )).join('|');
  const materials = (Array.isArray(subject.material) ? subject.material : [subject.material]).filter(Boolean);
  const materialState = materials.map((material) => {
    const textures = Object.values(material).filter((value) => value?.isTexture)
      .map((texture) => `${texture.uuid}:${texture.version}`).join(',');
    return `${material.uuid}:${material.version}:${textures}`;
  }).join('|');
  const morphs = Object.values(geometry.morphAttributes || {}).flat().map(openingResourceVersion).join('|');
  return `${context};${program};${geometry.uuid};${openingResourceVersion(geometry.index)};${versions};${morphs};${materialState}`
    + `;${openingResourceVersion(subject.instanceMatrix)}:${openingResourceVersion(subject.instanceColor)}:${subject.count ?? ''}`;
}

/** Reuse a cook-owned drawable census only while it still belongs to this scene and generation. */
export function resolveTouchDrawableSession(census, scene, generation = 0) {
  return census && census.scene === scene && census.generation === (generation || 0)
    ? census : null;
}

/** Required leaves stay strict; extra pool coverage only admits live, potentially drawn resources. */
export function openingAdmissionSubjects(required, pooled, scene, { mobileFirstPicture = false } = {}) {
  const requiredLeaves = new Set(required);
  return required.concat(pooled.filter((subject) => {
    if (!subject || requiredLeaves.has(subject) || subject.geometry?.id == null || !subject.material) return false;
    // Immediate first-use producers publish on ordinary events/input without an async admission
    // owner. They owe their live material's first draw while mobile loading owns the picture;
    // other dormant effects keep their bounded on-use path outside the opening cohort.
    if (mobileFirstPicture && subject.userData?.spacefaceOpeningImmediateFirstUse !== true) return false;
    for (let owner = subject; owner; owner = owner.parent) {
      const data = owner.userData;
      // Warm exemplars have their own cook. Hidden authored fallbacks never present, while
      // dormant real pools (count/range 0, hidden emitter parents) still owe their first draw.
      if (data?.rosterPrewarm != null
          || (data?.authoredReadableFallbackLayer === true && owner.visible === false)) return false;
      if (owner === scene) return true;
    }
    return false; // A retired/detached pool is not a producer in this scene.
  }));
}

// Long material signature -> compact id. Equal signatures share an id, so the key still dedupes
// exactly the subjects whose full signatures were equal; the table holds one string per distinct
// signature instead of one composite per subject.
const _compileIssueKeyIds = new Map();
// Ids are monotonic and never reused, so clearing the table can never alias two different signatures; the table is capped
// because a long session that mints fresh canvas textures or custom program keys would otherwise retain every full
// signature string forever (a few hundred distinct signatures is a normal cook, 20 000 is already pathological). The
// only cost of a clear is that an equal signature interned on the other side of it gets a new id: one extra dedupe miss.
const COMPILE_ISSUE_KEY_TABLE_CAP = 20000;
let _compileIssueKeyNextId = 1;

export function internCompileIssueKey(longKey) {
  let id = _compileIssueKeyIds.get(longKey);
  if (id === undefined) {
    if (_compileIssueKeyIds.size >= COMPILE_ISSUE_KEY_TABLE_CAP) _compileIssueKeyIds.clear();
    id = _compileIssueKeyNextId++;
    _compileIssueKeyIds.set(longKey, id);
  }
  return id;
}

/** Table size, for the retention test. */
export function compileIssueKeyTableSize() {
  return _compileIssueKeyIds.size;
}

// A geometry's attribute/morph signature, memoized per geometry. An opening cook keys thousands of
// subjects that share a few hundred geometries; sorting and joining the attribute names for each one
// was the largest self-time in the key builder. A hit is proven exactly, not by an aggregate: the
// recorded names and widths (attributes) or lengths (morphs) are compared with the live tables in
// order, with no allocation. An aggregate (count plus width sum) cannot tell `normal` swapped for
// `color` apart, and three selects different programs for those (review R03).
const _compileIssueGeometrySignatures = new WeakMap();

function attributeWidth(attribute) {
  return attribute && typeof attribute.itemSize === 'number' ? attribute.itemSize : -1;
}

function morphListLength(list) {
  return list && typeof list.length === 'number' ? list.length : -1;
}

// True when `table` still has exactly the recorded names, in order, each with the recorded size.
function tableMatchesRecord(table, names, sizes, measure) {
  let index = 0;
  for (const name in table) {
    if (index >= names.length || names[index] !== name || sizes[index] !== measure(table[name])) return false;
    index++;
  }
  return index === names.length;
}

function recordTable(table, measure) {
  const names = [];
  const sizes = [];
  if (table) {
    for (const name in table) {
      names.push(name);
      sizes.push(measure(table[name]));
    }
  }
  return { names, sizes };
}

function describeTable(record) {
  const order = record.names.map((_, i) => i).sort((a, b) => (record.names[a] < record.names[b] ? -1 : 1));
  return order.map((i) => `${record.names[i]}:${record.sizes[i] < 0 ? '' : record.sizes[i]}`).join(',');
}

function compileIssueGeometrySignature(geometry) {
  if (!geometry) return { attributes: '', morphs: '' };
  const attrs = geometry.attributes;
  const morphAttrs = geometry.morphAttributes;
  const memo = _compileIssueGeometrySignatures.get(geometry);
  if (memo && memo.attrs === attrs && memo.morphAttrs === morphAttrs
    && tableMatchesRecord(attrs, memo.attrRecord.names, memo.attrRecord.sizes, attributeWidth)
    && tableMatchesRecord(morphAttrs, memo.morphRecord.names, memo.morphRecord.sizes, morphListLength)) {
    return memo;
  }
  const attrRecord = recordTable(attrs, attributeWidth);
  const morphRecord = recordTable(morphAttrs, morphListLength);
  const fresh = {
    attrs,
    morphAttrs,
    attrRecord,
    morphRecord,
    attributes: describeTable(attrRecord),
    morphs: describeTable(morphRecord),
  };
  _compileIssueGeometrySignatures.set(geometry, fresh);
  return fresh;
}
