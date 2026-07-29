import { types as utilTypes } from 'node:util';

export const AUTHORITATIVE_SIMULATION_RECORD_SCHEMA =
  'spaceface.authoritativeSimulationRecord.v1';
export const SIMULATION_EQUIVALENCE_SCHEMA =
  'spaceface.performanceSimulationEquivalence.v1';
export const PRESENTATION_SEMANTIC_RECORD_SCHEMA =
  'spaceface.presentationSemanticRecord.v1';
export const PRESENTATION_SEMANTIC_PROJECTION_SCHEMA =
  'spaceface.presentationSemanticProjection.v1';
export const PRESENTATION_SEMANTIC_COMPARISON_SCHEMA =
  'spaceface.presentationSemanticComparison.v1';
export const PERFORMANCE_VERDICT_SCHEMA =
  'spaceface.performanceVerdict.v1';

export const AUTHORITATIVE_SIMULATION_DOMAINS = Object.freeze([
  'player',
  'npcs',
  'activeEntities',
  'economy',
  'missions',
  'factions',
  'sectorOwnership',
  'rng',
]);

export const PRESENTATION_SEMANTIC_DOMAINS = Object.freeze([
  'identity',
  'transform',
  'visibilityCullLod',
  'geometryDrawBounds',
  'materialTextureColorSpace',
  'attachmentSocket',
  'orderingBlendDepth',
  'animation',
  'hudAccessibility',
]);

export const PERFORMANCE_EQUIVALENCE_LIMITS = Object.freeze({
  maxSeriesRecords: 100_000,
  maxPresentationRecords: 20_000,
  maxTreeDepth: 32,
  maxTreeNodes: 2_000_000,
  maxTreeEdges: 4_000_000,
  maxArrayItems: 100_000,
  maxObjectKeys: 512,
  maxStringLength: 16_384,
  maxKeyLength: 256,
  maxSnapshotBytes: 64 * 1024 * 1024,
  maxDiagnosticIssues: 64,
  maxDiagnosticBytes: 16 * 1024,
  maxDiagnosticMessageBytes: 512,
  maxDiagnosticValueBytes: 512,
  maxPathLength: 2_048,
  maxContextTicks: 120,
  maxContextInputEvents: 256,
  maxContextInputFrames: 128,
  maxContextGameplayEvents: 512,
  maxProjectionEntities: 20_000,
  maxProjectionNodes: 200_000,
  maxProjectionDepth: 64,
  maxMaterialsPerNode: 32,
  maxTexturesPerMaterial: 32,
  maxVerdictReasons: 32,
});

const PRESENTATION_DOMAIN_FIELDS = Object.freeze({
  identity: 'identity',
  transform: 'transform',
  visibilityCullLod: 'visibility',
  geometryDrawBounds: 'geometry',
  materialTextureColorSpace: 'material',
  attachmentSocket: 'attachments',
  orderingBlendDepth: 'ordering',
  animation: 'animation',
  hudAccessibility: 'hud',
});

const CHECKPOINT_EVIDENCE_POLICY = Object.freeze({
  role: 'diagnostic-only',
  promotedToExact: false,
  reason:
    'lab deterministic-covered and semantic hashes are coverage-bounded; '
    + 'exact equivalence uses raw authoritative records',
});

const TEXTURE_SLOTS = Object.freeze([
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'thicknessMap',
  'transmissionMap',
]);

const INVALID = Symbol('invalid-performance-equivalence-value');
const MISSING = Symbol('missing-performance-equivalence-value');
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_JOIN = Function.call.bind(Array.prototype.join);
const ARRAY_PUSH = Function.call.bind(Array.prototype.push);
const ARRAY_SORT = Function.call.bind(Array.prototype.sort);
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const IS_PROXY = utilTypes.isProxy;
const JSON_STRINGIFY = JSON.stringify;
const NUMBER_IS_FINITE = Number.isFinite;
const NUMBER_IS_INTEGER = Number.isInteger;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const NUMBER_TO_STRING = Function.call.bind(Number.prototype.toString);
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS = Object.is;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_KEYS = Object.keys;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const SET_ADD = Function.call.bind(Set.prototype.add);
const SET_HAS = Function.call.bind(Set.prototype.has);
const STRING_SLICE = Function.call.bind(String.prototype.slice);
const STRING_TRIM = Function.call.bind(String.prototype.trim);
const WEAK_SET_ADD = Function.call.bind(WeakSet.prototype.add);
const WEAK_SET_DELETE = Function.call.bind(WeakSet.prototype.delete);
const WEAK_SET_HAS = Function.call.bind(WeakSet.prototype.has);

export function compareAuthoritativeSimulationRecords(
  baselineRecords,
  candidateRecords,
  options = {},
) {
  const inspected = inspectComparisonOptions(options);
  const limits = resolveLimits(inspected.limits);
  const issues = createIssueCollector(limits);
  const baselineSnapshot = snapshotEvidence(
    baselineRecords,
    'baseline',
    issues,
    limits,
    limits.maxSeriesRecords,
  );
  const candidateSnapshot = snapshotEvidence(
    candidateRecords,
    'candidate',
    issues,
    limits,
    limits.maxSeriesRecords,
  );
  const inputTapeSnapshot = snapshotEvidence(
    inspected.inputTape ?? { events: [], frames: [] },
    'inputTape',
    issues,
    limits,
    limits.maxArrayItems,
  );
  const baseline = validateAuthoritativeSeries(
    baselineSnapshot,
    'baseline',
    issues,
  );
  const candidate = validateAuthoritativeSeries(
    candidateSnapshot,
    'candidate',
    issues,
  );
  const normalizedTape = normalizeDiagnosticTape(
    inputTapeSnapshot,
    issues,
  );
  const contextTicks = normalizeContextTicks(
    inspected.contextTicks,
    limits,
    issues,
  );
  const diagnostics = diagnosticsResult(issues, limits);

  if (issues.count > 0) {
    return deepFreeze({
      schema: SIMULATION_EQUIVALENCE_SCHEMA,
      valid: false,
      equivalent: false,
      authority: 'exact-authoritative-records',
      authoritativeDomains: AUTHORITATIVE_SIMULATION_DOMAINS,
      checkpointEvidence: cloneCheckpointPolicy(),
      comparedTicks: 0,
      lastMatchingTick: null,
      firstDivergence: null,
      failures: diagnostics.failures,
      diagnostics,
    });
  }

  const commonLength = Math.min(baseline.length, candidate.length);
  let lastMatchingTick = null;

  for (let index = 0; index < commonLength; index += 1) {
    const baselineRecord = baseline[index];
    const candidateRecord = candidate[index];
    if (!OBJECT_IS(baselineRecord.tick, candidateRecord.tick)) {
      const tick = Math.min(baselineRecord.tick, candidateRecord.tick);
      return simulationDivergenceResult({
        baseline,
        candidate,
        normalizedTape,
        contextTicks,
        limits,
        comparedTicks: index,
        lastMatchingTick,
        tick,
        index,
        field: 'tick',
        baselineValue: baselineRecord.tick,
        candidateValue: candidateRecord.tick,
        kind: 'tick-misalignment',
        diagnostics,
      });
    }

    const difference = firstDifference(
      authoritativePayload(baselineRecord),
      authoritativePayload(candidateRecord),
      '',
      limits,
    );
    if (difference) {
      return simulationDivergenceResult({
        baseline,
        candidate,
        normalizedTape,
        contextTicks,
        limits,
        comparedTicks: index,
        lastMatchingTick,
        tick: baselineRecord.tick,
        index,
        field: difference.path,
        baselineValue: difference.left,
        candidateValue: difference.right,
        kind: 'authoritative-field',
        raw: difference.raw,
        diagnostics,
      });
    }
    lastMatchingTick = baselineRecord.tick;
  }

  if (baseline.length !== candidate.length) {
    const firstExtra = baseline[commonLength] ?? candidate[commonLength];
    const tick = firstExtra?.tick
      ?? (lastMatchingTick == null ? 0 : lastMatchingTick + 1);
    return simulationDivergenceResult({
      baseline,
      candidate,
      normalizedTape,
      contextTicks,
      limits,
      comparedTicks: commonLength,
      lastMatchingTick,
      tick,
      index: commonLength,
      field: 'series.length',
      baselineValue: baseline.length,
      candidateValue: candidate.length,
      kind: 'series-length',
      diagnostics,
    });
  }

  return deepFreeze({
    schema: SIMULATION_EQUIVALENCE_SCHEMA,
    valid: true,
    equivalent: true,
    authority: 'exact-authoritative-records',
    authoritativeDomains: AUTHORITATIVE_SIMULATION_DOMAINS,
    checkpointEvidence: cloneCheckpointPolicy(),
    comparedTicks: baseline.length,
    lastMatchingTick,
    firstDivergence: null,
    failures: [],
    diagnostics,
  });
}

export function comparePresentationSemanticRecords(
  baselineRecords,
  candidateRecords,
  options = {},
) {
  const inspected = inspectComparisonOptions(options);
  const limits = resolveLimits(inspected.limits);
  const issues = createIssueCollector(limits);
  const baselineSnapshot = snapshotEvidence(
    baselineRecords,
    'baseline',
    issues,
    limits,
    limits.maxPresentationRecords,
  );
  const candidateSnapshot = snapshotEvidence(
    candidateRecords,
    'candidate',
    issues,
    limits,
    limits.maxPresentationRecords,
  );
  const coverage = presentationCoverage(
    baselineSnapshot,
    candidateSnapshot,
  );
  const baseline = validatePresentationRecords(
    baselineSnapshot,
    'baseline',
    issues,
  );
  const candidate = validatePresentationRecords(
    candidateSnapshot,
    'candidate',
    issues,
  );
  const diagnostics = diagnosticsResult(issues, limits);

  if (issues.count > 0) {
    return deepFreeze({
      schema: PRESENTATION_SEMANTIC_COMPARISON_SCHEMA,
      valid: false,
      equivalent: false,
      coverage,
      comparedObjects: 0,
      firstDivergence: null,
      failures: diagnostics.failures,
      diagnostics,
    });
  }

  const baselineById = indexPresentationRecords(baseline);
  const candidateById = indexPresentationRecords(candidate);
  const objectIds = mergedSortedKeys(baselineById, candidateById);

  for (let index = 0; index < objectIds.length; index += 1) {
    const objectId = objectIds[index];
    const baselineRecord = ownValue(baselineById, objectId);
    const candidateRecord = ownValue(candidateById, objectId);
    if (baselineRecord === MISSING || candidateRecord === MISSING) {
      return presentationDivergence({
        coverage,
        comparedObjects: 0,
        objectId,
        domain: 'identity',
        field: 'stableObjectId',
        baselineValue: baselineRecord === MISSING
          ? MISSING
          : baselineRecord.stableObjectId,
        candidateValue: candidateRecord === MISSING
          ? MISSING
          : candidateRecord.stableObjectId,
        kind: 'object-presence',
        limits,
        diagnostics,
      });
    }
  }

  let comparedObjects = 0;
  for (let objectIndex = 0; objectIndex < objectIds.length; objectIndex += 1) {
    const objectId = objectIds[objectIndex];
    const baselineRecord = ownValue(baselineById, objectId);
    const candidateRecord = ownValue(candidateById, objectId);
    for (
      let domainIndex = 0;
      domainIndex < PRESENTATION_SEMANTIC_DOMAINS.length;
      domainIndex += 1
    ) {
      const domain = PRESENTATION_SEMANTIC_DOMAINS[domainIndex];
      const difference = firstDifference(
        presentationDomainValue(baselineRecord, domain),
        presentationDomainValue(candidateRecord, domain),
        '',
        limits,
      );
      if (difference) {
        return presentationDivergence({
          coverage,
          comparedObjects,
          objectId,
          domain,
          field: difference.path,
          baselineValue: difference.left,
          candidateValue: difference.right,
          raw: difference.raw,
          kind: 'semantic-field',
          limits,
          diagnostics,
        });
      }
    }
    comparedObjects += 1;
  }

  return deepFreeze({
    schema: PRESENTATION_SEMANTIC_COMPARISON_SCHEMA,
    valid: true,
    equivalent: true,
    coverage,
    comparedObjects,
    firstDivergence: null,
    failures: [],
    diagnostics,
  });
}

export function projectRenderEntityFramePresentation(
  source,
  options = {},
) {
  const inspected = inspectProjectionOptions(options);
  const limits = resolveLimits(inspected.limits);
  const issues = createIssueCollector(limits);
  const records = [];

  if (!isSafeObject(source, true)) {
    issues.add('presentation projection source must be a plain non-Proxy object');
  }

  const entityFrame = readOwnData(
    source,
    'entityFrame',
    'source.entityFrame',
    issues,
    true,
  );
  const interpolationAlpha = readOwnData(
    source,
    'interpolationAlpha',
    'source.interpolationAlpha',
    issues,
    true,
  );
  const hudSource = readOwnData(
    source,
    'hud',
    'source.hud',
    issues,
    false,
  );

  if (
    typeof interpolationAlpha !== 'number'
    || !NUMBER_IS_FINITE(interpolationAlpha)
    || interpolationAlpha < 0
    || interpolationAlpha > 1
  ) {
    issues.add('source.interpolationAlpha must be a finite number in [0, 1]');
  }

  const frameId = readOwnData(
    entityFrame,
    'frameId',
    'source.entityFrame.frameId',
    issues,
    true,
  );
  if (!isNonNegativeSafeInteger(frameId)) {
    issues.add('source.entityFrame.frameId must be a non-negative safe integer');
  }
  const frameRecords = readOwnData(
    entityFrame,
    'records',
    'source.entityFrame.records',
    issues,
    true,
  );
  const recordItems = readArrayItems(
    frameRecords,
    'source.entityFrame.records',
    issues,
    limits.maxProjectionEntities,
  );
  const projectionState = {
    issues,
    limits,
    frameId,
    interpolationAlpha,
    seenNodes: new WeakSet(),
    ancestorNodes: new WeakSet(),
    nodeIds: new Set(),
    projectionNodes: 0,
  };

  for (let index = 0; index < recordItems.length; index += 1) {
    const projected = projectEntityRecord(
      recordItems[index],
      index,
      projectionState,
    );
    if (projected !== INVALID) append(records, projected);
  }

  if (hudSource !== undefined && hudSource !== null) {
    const hudSnapshot = snapshotEvidence(
      hudSource,
      'source.hud',
      issues,
      limits,
      limits.maxArrayItems,
    );
    if (hudSnapshot !== INVALID) {
      if (!isPlainSnapshotObject(hudSnapshot)) {
        issues.add('source.hud must be a plain semantic object');
      } else {
        requireOwnSnapshot(
          hudSnapshot,
          'semanticTree',
          'source.hud',
          issues,
        );
        requireOwnSnapshot(
          hudSnapshot,
          'accessibility',
          'source.hud',
          issues,
        );
        append(records, createHudPresentationRecord(hudSnapshot));
      }
    }
  }

  ARRAY_SORT(records, comparePresentationRecordId);
  const diagnostics = diagnosticsResult(issues, limits);
  if (issues.count > 0) {
    return deepFreeze({
      schema: PRESENTATION_SEMANTIC_PROJECTION_SCHEMA,
      valid: false,
      records: [],
      failures: diagnostics.failures,
      diagnostics,
    });
  }

  return deepFreeze({
    schema: PRESENTATION_SEMANTIC_PROJECTION_SCHEMA,
    valid: true,
    frameId,
    interpolationAlpha,
    records,
    failures: [],
    diagnostics,
  });
}

export function composePerformanceVerdict(options = {}) {
  const limits = resolveLimits(null);
  const dimensions = Object.create(null);
  const names = [
    'equivalence',
    'measurementValidity',
    'improvement',
    'absoluteBudget',
  ];

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const value = readOwnDataSilently(options, name);
    Object.defineProperty(dimensions, name, {
      value: normalizeVerdictDimension(name, value, limits),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  const failures = [];
  let pass = true;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const dimension = dimensions[name];
    if (dimension.pass) continue;
    pass = false;
    if (dimension.reasons.length === 0) {
      append(failures, `${name}: ${name} failed`);
      continue;
    }
    for (
      let reasonIndex = 0;
      reasonIndex < dimension.reasons.length;
      reasonIndex += 1
    ) {
      append(failures, `${name}: ${dimension.reasons[reasonIndex]}`);
    }
  }

  return deepFreeze({
    schema: PERFORMANCE_VERDICT_SCHEMA,
    equivalence: dimensions.equivalence,
    measurementValidity: dimensions.measurementValidity,
    improvement: dimensions.improvement,
    absoluteBudget: dimensions.absoluteBudget,
    pass,
    status: pass ? 'pass' : 'fail',
    failures,
  });
}

function inspectComparisonOptions(options) {
  if (options == null) return { inputTape: null, contextTicks: null, limits: null };
  assertOrdinaryOptions(options, 'performance equivalence options');
  return {
    inputTape: readOwnOption(options, 'inputTape') ?? null,
    contextTicks: readOwnOption(options, 'contextTicks') ?? null,
    limits: readOwnOption(options, 'limits') ?? null,
  };
}

function inspectProjectionOptions(options) {
  if (options == null) return { limits: null };
  assertOrdinaryOptions(options, 'presentation projection options');
  return { limits: readOwnOption(options, 'limits') ?? null };
}

function assertOrdinaryOptions(value, label) {
  if (!isSafeObject(value, true)) {
    throw new TypeError(`${label} must be a plain non-Proxy object`);
  }
}

function readOwnOption(options, key) {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(options, key);
  if (!descriptor) return undefined;
  if (!OBJECT_HAS_OWN(descriptor, 'value')) {
    throw new TypeError(`performance equivalence option ${key} must be a data property`);
  }
  return descriptor.value;
}

function resolveLimits(overrides) {
  const limits = { ...PERFORMANCE_EQUIVALENCE_LIMITS };
  if (overrides == null) return limits;
  assertOrdinaryOptions(overrides, 'performance equivalence limits');
  const keys = OBJECT_KEYS(PERFORMANCE_EQUIVALENCE_LIMITS);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(overrides, key);
    if (!descriptor) continue;
    if (!OBJECT_HAS_OWN(descriptor, 'value')) {
      throw new TypeError(`performance equivalence limit ${key} must be a data property`);
    }
    const value = descriptor.value;
    if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) continue;
    limits[key] = Math.min(limits[key], value);
  }
  return limits;
}

function snapshotEvidence(value, path, issues, limits, rootArrayLimit) {
  const state = {
    issues,
    limits,
    rootArrayLimit,
    seen: new WeakSet(),
    ancestors: new WeakSet(),
    nodes: 0,
    edges: 0,
    bytes: 0,
    halted: false,
  };
  return snapshotValue(value, path, state, 0, true);
}

function snapshotValue(value, path, state, depth, root = false) {
  if (state.halted) return INVALID;
  if (!chargeNode(state)) return INVALID;

  if (value === null) {
    chargeBytes(state, 4);
    return null;
  }
  if (typeof value === 'boolean') {
    chargeBytes(state, value ? 4 : 5);
    return value;
  }
  if (typeof value === 'number') {
    chargeBytes(state, 8);
    return value;
  }
  if (typeof value === 'string') return snapshotString(value, path, state);
  if (typeof value !== 'object') {
    state.issues.add(
      `${path} must contain exact data values; ${typeof value} is not allowed`,
    );
    return INVALID;
  }
  if (depth > state.limits.maxTreeDepth) {
    state.issues.add(
      `${path} exceeds tree depth limit ${state.limits.maxTreeDepth}`,
    );
    return INVALID;
  }
  if (IS_PROXY(value)) {
    state.issues.add(`${path} must not contain a Proxy`);
    return INVALID;
  }
  if (WEAK_SET_HAS(state.seen, value)) {
    state.issues.add(WEAK_SET_HAS(state.ancestors, value)
      ? `${path} must contain acyclic evidence values`
      : `${path} contains a repeated reference alias; exact evidence must be a tree`);
    return INVALID;
  }

  WEAK_SET_ADD(state.seen, value);
  WEAK_SET_ADD(state.ancestors, value);
  let snapshot;
  if (ARRAY_IS_ARRAY(value)) {
    snapshot = snapshotArray(value, path, state, depth, root);
  } else if (hasOrdinaryObjectPrototype(value)) {
    snapshot = snapshotObject(value, path, state, depth);
  } else {
    state.issues.add(
      `${path} must contain a plain object with Object.prototype or null prototype`,
    );
    snapshot = INVALID;
  }
  WEAK_SET_DELETE(state.ancestors, value);
  return snapshot;
}

function snapshotString(value, path, state) {
  if (value.length > state.limits.maxStringLength) {
    state.issues.add(
      `${path} string exceeds limit ${state.limits.maxStringLength}`,
    );
    state.issues.markTruncated();
    chargeBytes(state, Math.min(value.length, state.limits.maxSnapshotBytes + 1));
    return INVALID;
  }
  chargeBytes(state, BUFFER_BYTE_LENGTH(value, 'utf8'));
  return value;
}

function snapshotArray(value, path, state, depth, root) {
  if (OBJECT_GET_PROTOTYPE_OF(value) !== Array.prototype) {
    state.issues.add(`${path} must be an ordinary array with Array.prototype`);
    return INVALID;
  }
  const lengthDescriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
  const length = lengthDescriptor?.value;
  if (!NUMBER_IS_SAFE_INTEGER(length) || length < 0) {
    state.issues.add(`${path} must have an ordinary safe array length`);
    return INVALID;
  }
  const limit = root ? state.rootArrayLimit : state.limits.maxArrayItems;
  if (length > limit) state.issues.add(`${path} exceeds array item limit ${limit}`);

  const ownKeys = REFLECT_OWN_KEYS(value);
  if (ownKeys.length > Math.min(length, limit) + 1) {
    state.issues.add(`${path} arrays must not contain extra own properties`);
  }
  for (let keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
    const key = ownKeys[keyIndex];
    if (typeof key === 'symbol') {
      state.issues.add(`${path} arrays must not contain symbol properties`);
      continue;
    }
    if (key === 'length') continue;
    const numeric = canonicalArrayIndex(key);
    if (numeric == null || numeric >= length) {
      state.issues.add(`${propertyPath(path, key, state.limits)} is not an array index`);
    }
  }

  const count = Math.min(length, limit);
  const result = new Array(count);
  for (let index = 0; index < count && !state.halted; index += 1) {
    if (!chargeEdge(state)) break;
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, `${index}`);
    const itemPath = `${path}[${index}]`;
    if (!descriptor) {
      state.issues.add(`${itemPath} is sparse and is not exact evidence`);
      defineArrayValue(result, index, INVALID);
      continue;
    }
    if (!OBJECT_HAS_OWN(descriptor, 'value')) {
      state.issues.add(`${itemPath} must use a data property, not an accessor`);
      defineArrayValue(result, index, INVALID);
      continue;
    }
    if (!descriptor.enumerable) {
      state.issues.add(`${itemPath} must be an own enumerable data property`);
      defineArrayValue(result, index, INVALID);
      continue;
    }
    defineArrayValue(
      result,
      index,
      snapshotValue(descriptor.value, itemPath, state, depth + 1),
    );
  }
  return result;
}

function snapshotObject(value, path, state, depth) {
  const ownKeys = REFLECT_OWN_KEYS(value);
  if (ownKeys.length > state.limits.maxObjectKeys) {
    state.issues.add(
      `${path} exceeds own-key limit ${state.limits.maxObjectKeys}`,
    );
    state.halted = true;
    return INVALID;
  }

  const keys = [];
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (typeof key === 'symbol') {
      state.issues.add(`${path} must not contain symbol properties`);
      continue;
    }
    if (key.length > state.limits.maxKeyLength) {
      state.issues.add(
        `${path} contains a key exceeding limit ${state.limits.maxKeyLength}`,
      );
      continue;
    }
    append(keys, key);
  }
  ARRAY_SORT(keys);

  const result = Object.create(null);
  for (let index = 0; index < keys.length && !state.halted; index += 1) {
    const key = keys[index];
    const childPath = propertyPath(path, key, state.limits);
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value')) {
      state.issues.add(`${childPath} must use a data property, not an accessor`);
      continue;
    }
    if (!descriptor.enumerable) {
      state.issues.add(`${childPath} must be an own enumerable data property`);
      continue;
    }
    if (!chargeEdge(state)) break;
    Object.defineProperty(result, key, {
      value: snapshotValue(
        descriptor.value,
        childPath,
        state,
        depth + 1,
      ),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function chargeNode(state) {
  state.nodes += 1;
  if (state.nodes <= state.limits.maxTreeNodes) return true;
  state.issues.addOnce(
    'tree-nodes',
    `evidence exceeds tree node limit ${state.limits.maxTreeNodes}`,
  );
  state.halted = true;
  return false;
}

function chargeEdge(state) {
  state.edges += 1;
  if (state.edges <= state.limits.maxTreeEdges) return true;
  state.issues.addOnce(
    'tree-edges',
    `evidence exceeds tree edge limit ${state.limits.maxTreeEdges}`,
  );
  state.halted = true;
  return false;
}

function chargeBytes(state, bytes) {
  if (state.halted) return false;
  state.bytes += bytes;
  if (state.bytes <= state.limits.maxSnapshotBytes) return true;
  state.issues.addOnce(
    'snapshot-bytes',
    `evidence exceeds snapshot byte limit ${state.limits.maxSnapshotBytes}`,
  );
  state.halted = true;
  return false;
}

function validateAuthoritativeSeries(records, label, issues) {
  if (!ARRAY_IS_ARRAY(records)) {
    issues.add(`${label} exact authoritative records must be an array`);
    return [];
  }
  let previousTick = -1;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const prefix = `${label}[${index}]`;
    if (!isPlainSnapshotObject(record)) {
      issues.add(`${prefix} must be an exact authoritative record object`);
      continue;
    }
    if (record.schema !== AUTHORITATIVE_SIMULATION_RECORD_SCHEMA) {
      issues.add(`${prefix}.schema must be ${AUTHORITATIVE_SIMULATION_RECORD_SCHEMA}`);
    }
    if (!isNonNegativeSafeInteger(record.tick)) {
      issues.add(`${prefix}.tick must be a non-negative safe integer`);
    } else if (record.tick <= previousTick) {
      issues.add(
        `${label} ticks must be strictly increasing; ${record.tick} follows ${previousTick}`,
      );
    } else {
      previousTick = record.tick;
    }
    if (!isPlainSnapshotObject(record.authoritative)) {
      issues.add(
        `${prefix} must include raw exact authoritative state; checkpoint/hash surfaces are insufficient`,
      );
    } else {
      for (
        let domainIndex = 0;
        domainIndex < AUTHORITATIVE_SIMULATION_DOMAINS.length;
        domainIndex += 1
      ) {
        const domain = AUTHORITATIVE_SIMULATION_DOMAINS[domainIndex];
        if (!OBJECT_HAS_OWN(record.authoritative, domain)) {
          issues.add(`${prefix}.authoritative.${domain} is required for exact coverage`);
        }
      }
    }
    if (!OBJECT_HAS_OWN(record, 'events') || !ARRAY_IS_ARRAY(record.events)) {
      issues.add(`${prefix}.events must be an own ordered array`);
    }
    if (
      !OBJECT_HAS_OWN(record, 'input')
      || (record.input !== null && !isPlainSnapshotObject(record.input))
    ) {
      issues.add(`${prefix}.input must be an own object or null`);
    }
  }
  return records;
}

function normalizeDiagnosticTape(tape, issues) {
  if (!isPlainSnapshotObject(tape)) {
    issues.add('inputTape must be a plain object');
    return { events: [], frames: [] };
  }
  const events = normalizeTapeRecords(tape.events, 'inputTape.events', issues);
  const frames = normalizeTapeRecords(tape.frames, 'inputTape.frames', issues);
  return { events, frames };
}

function normalizeTapeRecords(records, path, issues) {
  if (!ARRAY_IS_ARRAY(records)) {
    issues.add(`${path} must be an ordered array`);
    return [];
  }
  const decorated = new Array(records.length);
  const seen = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!isPlainSnapshotObject(record)) {
      issues.add(`${path}[${index}] must be a plain object`);
      defineArrayValue(decorated, index, { record, index, tick: 0, sequence: 0 });
      continue;
    }
    const tick = record.tick;
    const sequence = record.sequence;
    if (!isNonNegativeSafeInteger(tick)) {
      issues.add(`${path}[${index}].tick must be a non-negative safe integer`);
    }
    if (!isNonNegativeSafeInteger(sequence)) {
      issues.add(`${path}[${index}].sequence must be a non-negative safe integer`);
    }
    const identity = `${NUMBER_TO_STRING(tick || 0)}:${NUMBER_TO_STRING(sequence || 0)}`;
    if (SET_HAS(seen, identity)) {
      issues.add(`${path} contains duplicate tick/sequence identity ${identity}`);
    } else {
      SET_ADD(seen, identity);
    }
    defineArrayValue(decorated, index, { record, index, tick, sequence });
  }
  ARRAY_SORT(decorated, compareTapeRecord);
  const normalized = new Array(decorated.length);
  for (let index = 0; index < decorated.length; index += 1) {
    defineArrayValue(normalized, index, decorated[index].record);
  }
  return normalized;
}

function compareTapeRecord(left, right) {
  if (left.tick !== right.tick) return left.tick - right.tick;
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  return left.index - right.index;
}

function normalizeContextTicks(value, limits, issues) {
  if (value == null) return Math.min(2, limits.maxContextTicks);
  if (!isNonNegativeSafeInteger(value) || value > limits.maxContextTicks) {
    issues.add(`contextTicks must be an integer in [0, ${limits.maxContextTicks}]`);
    return Math.min(2, limits.maxContextTicks);
  }
  return value;
}

function authoritativePayload(record) {
  const result = Object.create(null);
  defineOwn(result, 'authoritative', record.authoritative);
  defineOwn(result, 'events', record.events);
  defineOwn(result, 'input', record.input);
  return result;
}

function simulationDivergenceResult({
  baseline,
  candidate,
  normalizedTape,
  contextTicks,
  limits,
  comparedTicks,
  lastMatchingTick,
  tick,
  index,
  field,
  baselineValue,
  candidateValue,
  raw = null,
  kind,
  diagnostics,
}) {
  return deepFreeze({
    schema: SIMULATION_EQUIVALENCE_SCHEMA,
    valid: true,
    equivalent: false,
    authority: 'exact-authoritative-records',
    authoritativeDomains: AUTHORITATIVE_SIMULATION_DOMAINS,
    checkpointEvidence: cloneCheckpointPolicy(),
    comparedTicks,
    lastMatchingTick,
    firstDivergence: {
      kind,
      tick,
      index,
      lastMatchingTick,
      field,
      baselineValue: diagnosticValue(baselineValue, limits),
      candidateValue: diagnosticValue(candidateValue, limits),
      raw,
      context: buildDivergenceContext(
        baseline,
        candidate,
        normalizedTape,
        tick,
        contextTicks,
        limits,
      ),
    },
    failures: [],
    diagnostics,
  });
}

function buildDivergenceContext(
  baseline,
  candidate,
  tape,
  tick,
  contextTicks,
  limits,
) {
  const fromTick = Math.max(0, tick - contextTicks);
  const inputEvents = selectTapeWindow(
    tape.events,
    fromTick,
    tick,
    limits.maxContextInputEvents,
  );
  const inputFrames = selectTapeWindow(
    tape.frames,
    fromTick,
    tick,
    limits.maxContextInputFrames,
  );
  const baselineEvents = eventWindow(
    baseline,
    fromTick,
    tick,
    limits.maxContextGameplayEvents,
  );
  const candidateEvents = eventWindow(
    candidate,
    fromTick,
    tick,
    limits.maxContextGameplayEvents,
  );
  return {
    window: { fromTick, toTick: tick },
    input: {
      events: inputEvents.values,
      frames: inputFrames.values,
      activeFrame: resolveActiveFrame(tape.frames, tick),
    },
    events: {
      baseline: baselineEvents.value,
      candidate: candidateEvents.value,
    },
    truncated:
      inputEvents.truncated
      || inputFrames.truncated
      || baselineEvents.truncated
      || candidateEvents.truncated,
  };
}

function selectTapeWindow(records, fromTick, toTick, limit) {
  const values = [];
  let matched = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.tick < fromTick) continue;
    if (record.tick > toTick) break;
    matched += 1;
    if (values.length < limit) append(values, record);
  }
  return { values, truncated: matched > values.length };
}

function resolveActiveFrame(frames, tick) {
  let active = null;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame.tick > tick) break;
    active = frame;
  }
  return active;
}

function eventWindow(records, fromTick, toTick, limit) {
  const preceding = [];
  const atTick = [];
  let matched = 0;
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    if (record.tick < fromTick || record.tick > toTick) continue;
    const events = record.events;
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      matched += 1;
      const target = record.tick === toTick ? atTick : preceding;
      if (preceding.length + atTick.length >= limit) continue;
      if (record.tick === toTick) {
        append(target, events[eventIndex]);
      } else {
        append(target, eventWithTick(events[eventIndex], record.tick));
      }
    }
  }
  return {
    value: { preceding, atTick },
    truncated: matched > preceding.length + atTick.length,
  };
}

function eventWithTick(event, tick) {
  const result = Object.create(null);
  if (isPlainSnapshotObject(event)) {
    const keys = OBJECT_KEYS(event);
    for (let index = 0; index < keys.length; index += 1) {
      defineOwn(result, keys[index], event[keys[index]]);
    }
  }
  defineOwn(result, 'tick', tick);
  return result;
}

function validatePresentationRecords(records, label, issues) {
  if (!ARRAY_IS_ARRAY(records)) {
    issues.add(`${label} presentation semantic records must be an array`);
    return [];
  }
  const seen = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const prefix = `${label}[${index}]`;
    if (!isPlainSnapshotObject(record)) {
      issues.add(`${prefix} must be a presentation semantic record object`);
      continue;
    }
    if (record.schema !== PRESENTATION_SEMANTIC_RECORD_SCHEMA) {
      issues.add(`${prefix}.schema must be ${PRESENTATION_SEMANTIC_RECORD_SCHEMA}`);
    }
    if (!isNonemptyString(record.stableObjectId)) {
      issues.add(`${prefix}.stableObjectId is required`);
    } else if (SET_HAS(seen, record.stableObjectId)) {
      issues.add(
        `${label} contains duplicate stableObjectId ${previewValue(record.stableObjectId)}`,
      );
    } else {
      SET_ADD(seen, record.stableObjectId);
    }
    if (
      !OBJECT_HAS_OWN(record, 'parentStableObjectId')
      || (record.parentStableObjectId !== null
        && !isNonemptyString(record.parentStableObjectId))
    ) {
      issues.add(`${prefix}.parentStableObjectId must be a string or null`);
    }
    for (
      let domainIndex = 0;
      domainIndex < PRESENTATION_SEMANTIC_DOMAINS.length;
      domainIndex += 1
    ) {
      const domain = PRESENTATION_SEMANTIC_DOMAINS[domainIndex];
      const field = PRESENTATION_DOMAIN_FIELDS[domain];
      if (!OBJECT_HAS_OWN(record, field)) {
        issues.add(`${prefix}.${field} is required for ${domain} coverage`);
      }
    }
  }
  return records;
}

function presentationCoverage(baseline, candidate) {
  const coverage = Object.create(null);
  for (
    let domainIndex = 0;
    domainIndex < PRESENTATION_SEMANTIC_DOMAINS.length;
    domainIndex += 1
  ) {
    defineOwn(coverage, PRESENTATION_SEMANTIC_DOMAINS[domainIndex], true);
  }
  updatePresentationCoverage(coverage, baseline);
  updatePresentationCoverage(coverage, candidate);
  return coverage;
}

function updatePresentationCoverage(coverage, records) {
  if (!ARRAY_IS_ARRAY(records)) {
    for (
      let domainIndex = 0;
      domainIndex < PRESENTATION_SEMANTIC_DOMAINS.length;
      domainIndex += 1
    ) coverage[PRESENTATION_SEMANTIC_DOMAINS[domainIndex]] = false;
    return;
  }
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    if (!isPlainSnapshotObject(record)) {
      for (
        let domainIndex = 0;
        domainIndex < PRESENTATION_SEMANTIC_DOMAINS.length;
        domainIndex += 1
      ) coverage[PRESENTATION_SEMANTIC_DOMAINS[domainIndex]] = false;
      continue;
    }
    if (
      !OBJECT_HAS_OWN(record, 'parentStableObjectId')
      || !OBJECT_HAS_OWN(record, 'identity')
    ) coverage.identity = false;
    for (
      let domainIndex = 1;
      domainIndex < PRESENTATION_SEMANTIC_DOMAINS.length;
      domainIndex += 1
    ) {
      const domain = PRESENTATION_SEMANTIC_DOMAINS[domainIndex];
      if (!OBJECT_HAS_OWN(record, PRESENTATION_DOMAIN_FIELDS[domain])) {
        coverage[domain] = false;
      }
    }
  }
}

function indexPresentationRecords(records) {
  const result = Object.create(null);
  for (let index = 0; index < records.length; index += 1) {
    defineOwn(result, records[index].stableObjectId, records[index]);
  }
  return result;
}

function presentationDomainValue(record, domain) {
  if (domain === 'identity') {
    const value = Object.create(null);
    defineOwn(value, 'parentStableObjectId', record.parentStableObjectId);
    defineOwn(value, 'identity', record.identity);
    return value;
  }
  return record[PRESENTATION_DOMAIN_FIELDS[domain]];
}

function presentationDivergence({
  coverage,
  comparedObjects,
  objectId,
  domain,
  field,
  baselineValue,
  candidateValue,
  raw = null,
  kind,
  limits,
  diagnostics,
}) {
  return deepFreeze({
    schema: PRESENTATION_SEMANTIC_COMPARISON_SCHEMA,
    valid: true,
    equivalent: false,
    coverage,
    comparedObjects,
    firstDivergence: {
      kind,
      objectId,
      domain,
      field,
      baselineValue: diagnosticValue(baselineValue, limits),
      candidateValue: diagnosticValue(candidateValue, limits),
      raw,
    },
    failures: [],
    diagnostics,
  });
}

function firstDifference(left, right, prefix, limits) {
  if (OBJECT_IS(left, right)) return null;
  if (left === MISSING || right === MISSING) {
    return differenceResult(prefix, left, right, limits);
  }
  const leftType = valueType(left);
  const rightType = valueType(right);
  if (leftType !== rightType) {
    return differenceResult(prefix, left, right, limits);
  }
  if (leftType !== 'object' && leftType !== 'array') {
    return differenceResult(prefix, left, right, limits);
  }
  if (leftType === 'array') {
    const commonLength = Math.min(left.length, right.length);
    for (let index = 0; index < commonLength; index += 1) {
      const difference = firstDifference(
        left[index],
        right[index],
        appendIndexPath(prefix, index, limits),
        limits,
      );
      if (difference) return difference;
    }
    if (left.length !== right.length) {
      return differenceResult(
        appendPropertyPath(prefix, 'length', limits),
        left.length,
        right.length,
        limits,
      );
    }
    return null;
  }

  const keys = mergedSortedKeys(left, right);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const leftValue = ownValue(left, key);
    const rightValue = ownValue(right, key);
    const difference = firstDifference(
      leftValue,
      rightValue,
      appendPropertyPath(prefix, key, limits),
      limits,
    );
    if (difference) return difference;
  }
  return null;
}

function differenceResult(path, left, right, limits) {
  const result = {
    path: path || '(root)',
    left,
    right,
    raw: {
      leftType: valueType(left),
      rightType: valueType(right),
    },
  };
  if (
    typeof left === 'number'
    && typeof right === 'number'
    && NUMBER_IS_FINITE(left)
    && NUMBER_IS_FINITE(right)
  ) result.raw.delta = right - left;
  if (result.path.length > limits.maxPathLength) {
    result.path = `${STRING_SLICE(result.path, 0, Math.max(0, limits.maxPathLength - 1))}…`;
  }
  return result;
}

function valueType(value) {
  if (value === MISSING) return 'missing';
  if (value === null) return 'null';
  if (ARRAY_IS_ARRAY(value)) return 'array';
  return typeof value;
}

function mergedSortedKeys(left, right) {
  const leftKeys = OBJECT_KEYS(left);
  const rightKeys = OBJECT_KEYS(right);
  const seen = new Set();
  const keys = [];
  for (let index = 0; index < leftKeys.length; index += 1) {
    SET_ADD(seen, leftKeys[index]);
    append(keys, leftKeys[index]);
  }
  for (let index = 0; index < rightKeys.length; index += 1) {
    const key = rightKeys[index];
    if (SET_HAS(seen, key)) continue;
    SET_ADD(seen, key);
    append(keys, key);
  }
  ARRAY_SORT(keys);
  return keys;
}

function projectEntityRecord(record, index, state) {
  const prefix = `source.entityFrame.records[${index}]`;
  if (!isSafeObject(record, true)) {
    state.issues.add(`${prefix} must be a plain non-Proxy record`);
    return INVALID;
  }
  const seenFrame = readOwnData(
    record,
    'seenFrame',
    `${prefix}.seenFrame`,
    state.issues,
    true,
  );
  if (seenFrame !== state.frameId) {
    state.issues.add(`${prefix}.seenFrame must match entityFrame.frameId`);
  }
  const id = readOwnData(record, 'id', `${prefix}.id`, state.issues, true);
  const entity = readOwnData(
    record,
    'entity',
    `${prefix}.entity`,
    state.issues,
    true,
  );
  const mesh = readOwnData(
    record,
    'mesh',
    `${prefix}.mesh`,
    state.issues,
    true,
  );
  const entityType = readOwnData(
    entity,
    'type',
    `${prefix}.entity.type`,
    state.issues,
    false,
  );
  const idToken = stableScalarToken(id);
  if (idToken == null) state.issues.add(`${prefix}.id must be a stable string or safe integer`);
  const typeToken = isNonemptyString(entityType) ? entityType : 'entity';
  const stableObjectId = `entity:${typeToken}:${idToken ?? 'invalid'}`;
  const identity = projectRootIdentity(
    id,
    typeToken,
    entity,
    mesh,
    prefix,
    state.issues,
  );

  const rootTransform = projectRootTransform(
    record,
    entity,
    prefix,
    state,
  );
  const visible = readBoolean(
    record,
    'visible',
    `${prefix}.visible`,
    state.issues,
  );
  const viewCulled = readBoolean(
    record,
    'viewCulled',
    `${prefix}.viewCulled`,
    state.issues,
  );
  const lodLevel = readOwnData(
    record,
    'lodLevel',
    `${prefix}.lodLevel`,
    state.issues,
    true,
  );
  if (lodLevel !== null && !isNonemptyString(lodLevel)) {
    state.issues.add(`${prefix}.lodLevel must be a string or null`);
  }

  const collections = {
    transforms: [],
    visibility: [],
    geometry: [],
    material: [],
    attachments: [],
    ordering: [],
    animation: [],
  };
  visitRenderNode(
    mesh,
    stableObjectId,
    stableObjectId,
    0,
    0,
    true,
    collections,
    state,
    prefix,
  );
  sortProjectionCollections(collections);

  return {
    schema: PRESENTATION_SEMANTIC_RECORD_SCHEMA,
    stableObjectId,
    parentStableObjectId: 'scene:world',
    identity,
    transform: {
      world: rootTransform.world,
      interpolation: rootTransform.interpolation,
      nodes: collections.transforms,
    },
    visibility: {
      visible,
      viewCulled,
      effectiveVisible: visible && !viewCulled,
      lodLevel,
      nodes: collections.visibility,
    },
    geometry: { nodes: collections.geometry },
    material: { nodes: collections.material },
    attachments: collections.attachments,
    ordering: { nodes: collections.ordering },
    animation: {
      mode: 'state-driven-hooks',
      hooks: collections.animation,
    },
    hud: null,
  };
}

function projectRootIdentity(id, typeToken, entity, mesh, prefix, issues) {
  const rawEntityData = readOwnData(
    entity,
    'data',
    `${prefix}.entity.data`,
    issues,
    false,
  );
  let entityData = null;
  if (rawEntityData != null) {
    if (isSafeObject(rawEntityData, true)) entityData = rawEntityData;
    else issues.add(`${prefix}.entity.data must be a plain non-Proxy object`);
  }
  const userData = readUserData(mesh, `${prefix}.mesh.userData`, issues);
  return {
    kind: 'entity',
    gameplayEntityId: id,
    entityType: typeToken,
    definitionId: readOptionalString(
      entityData,
      'defId',
      `${prefix}.entity.data.defId`,
      issues,
    ),
    rootName: readOptionalString(
      mesh,
      'name',
      `${prefix}.mesh.name`,
      issues,
    ),
    assetId: readOptionalString(
      userData,
      'assetId',
      `${prefix}.mesh.userData.assetId`,
      issues,
    ),
    placeId: readOptionalString(
      userData,
      'placeId',
      `${prefix}.mesh.userData.placeId`,
      issues,
    ),
    authoredCompositionId: readOptionalString(
      userData,
      'authoredCompositionId',
      `${prefix}.mesh.userData.authoredCompositionId`,
      issues,
    ),
    partUrl: readOptionalString(
      userData,
      'spacefacePartUrl',
      `${prefix}.mesh.userData.spacefacePartUrl`,
      issues,
    ),
  };
}

function projectRootTransform(record, entity, prefix, state) {
  const world = {
    position: [
      readFiniteNumber(record, 'x', `${prefix}.x`, state.issues),
      readFiniteNumber(record, 'y', `${prefix}.y`, state.issues),
      readFiniteNumber(record, 'z', `${prefix}.z`, state.issues),
    ],
    rotationEuler: [
      readFiniteNumber(record, 'rx', `${prefix}.rx`, state.issues),
      readFiniteNumber(record, 'ry', `${prefix}.ry`, state.issues),
      readFiniteNumber(record, 'rz', `${prefix}.rz`, state.issues),
    ],
    scale: [
      readFiniteNumber(record, 'sx', `${prefix}.sx`, state.issues),
      readFiniteNumber(record, 'sy', `${prefix}.sy`, state.issues),
      readFiniteNumber(record, 'sz', `${prefix}.sz`, state.issues),
    ],
  };
  const flags = readOwnData(
    entity,
    'flags',
    `${prefix}.entity.flags`,
    state.issues,
    false,
  );
  const noInterp = flags && isSafeObject(flags, true)
    ? readOwnData(flags, 'noInterp', `${prefix}.entity.flags.noInterp`, state.issues, false) === true
    : false;
  const previousPosition = projectXZ(
    readOwnData(entity, 'prevPos', `${prefix}.entity.prevPos`, state.issues, false),
    `${prefix}.entity.prevPos`,
    state.issues,
  );
  const currentPosition = projectXZ(
    readOwnData(entity, 'pos', `${prefix}.entity.pos`, state.issues, false),
    `${prefix}.entity.pos`,
    state.issues,
  );
  const previousRotation = readOptionalFiniteNumber(
    entity,
    'prevRot',
    `${prefix}.entity.prevRot`,
    state.issues,
  );
  const currentRotation = readOptionalFiniteNumber(
    entity,
    'rot',
    `${prefix}.entity.rot`,
    state.issues,
  );
  return {
    world,
    interpolation: {
      mode: noInterp ? 'snap' : 'fixed-tick-linear',
      alpha: state.interpolationAlpha,
      previous: {
        position: previousPosition,
        rotation: previousRotation,
      },
      current: {
        position: currentPosition,
        rotation: currentRotation,
      },
    },
  };
}

function visitRenderNode(
  node,
  rootId,
  parentNodeId,
  childIndex,
  depth,
  isRoot,
  collections,
  state,
  path,
) {
  if (!isObject(node) || IS_PROXY(node)) {
    state.issues.add(`${path} must contain non-Proxy render objects`);
    return;
  }
  if (depth > state.limits.maxProjectionDepth) {
    state.issues.add(
      `${path} exceeds render hierarchy depth limit ${state.limits.maxProjectionDepth}`,
    );
    return;
  }
  state.projectionNodes += 1;
  if (state.projectionNodes > state.limits.maxProjectionNodes) {
    state.issues.addOnce(
      'projection-nodes',
      `render hierarchy exceeds node limit ${state.limits.maxProjectionNodes}`,
    );
    return;
  }
  if (WEAK_SET_HAS(state.seenNodes, node)) {
    state.issues.add(WEAK_SET_HAS(state.ancestorNodes, node)
      ? `${path} contains a render hierarchy cycle`
      : `${path} contains a repeated render-node alias`);
    return;
  }
  WEAK_SET_ADD(state.seenNodes, node);
  WEAK_SET_ADD(state.ancestorNodes, node);

  const userData = readUserData(node, `${path}.userData`, state.issues);
  const name = readOwnData(node, 'name', `${path}.name`, state.issues, false);
  const geometry = readOwnData(
    node,
    'geometry',
    `${path}.geometry`,
    state.issues,
    false,
  );
  const material = readOwnData(
    node,
    'material',
    `${path}.material`,
    state.issues,
    false,
  );
  const attachment = attachmentKind(
    userData,
    `${path}.userData`,
    state.issues,
  );
  const semanticSegment = isRoot
    ? null
    : semanticNodeSegment(
      name,
      userData,
      childIndex,
      geometry != null || material != null || attachment != null,
      path,
      state.issues,
    );
  const nodeId = isRoot ? rootId : `${parentNodeId}/${semanticSegment}`;
  if (SET_HAS(state.nodeIds, nodeId)) {
    state.issues.add(`${path} resolves duplicate semantic node identity ${previewValue(nodeId)}`);
  } else {
    SET_ADD(state.nodeIds, nodeId);
  }

  if (!isRoot && attachment == null) {
    append(collections.transforms, {
      nodeId,
      ...projectLocalTransform(node, path, state.issues),
    });
  }
  if (!isRoot) {
    append(collections.visibility, {
      nodeId,
      visible: readOptionalBoolean(
        node,
        'visible',
        `${path}.visible`,
        state.issues,
        true,
      ),
    });
  }

  if (geometry != null) {
    append(collections.geometry, projectGeometry(
      geometry,
      nodeId,
      userData,
      path,
      state,
    ));
  }

  const renderOrder = material == null
    ? null
    : readOptionalFiniteNumber(
      node,
      'renderOrder',
      `${path}.renderOrder`,
      state.issues,
    );
  const materials = material == null
    ? []
    : (ARRAY_IS_ARRAY(material)
      ? readArrayItems(
        material,
        `${path}.material`,
        state.issues,
        state.limits.maxMaterialsPerNode,
      )
      : [material]);
  for (let materialIndex = 0; materialIndex < materials.length; materialIndex += 1) {
    const projectedMaterial = projectMaterial(
      materials[materialIndex],
      nodeId,
      materialIndex,
      renderOrder,
      userData,
      `${path}.material[${materialIndex}]`,
      state,
    );
    append(collections.material, projectedMaterial.semantic);
    append(collections.ordering, projectedMaterial.ordering);
  }

  if (attachment != null) {
    append(collections.attachments, projectAttachment(
      node,
      nodeId,
      rootId,
      parentNodeId,
      attachment,
      userData,
      path,
      state.issues,
    ));
  }

  const animationHook = projectAnimationHook(
    node,
    nodeId,
    userData,
    path,
    state.issues,
  );
  if (animationHook) append(collections.animation, animationHook);

  const children = readOwnData(
    node,
    'children',
    `${path}.children`,
    state.issues,
    false,
  );
  const childItems = children == null
    ? []
    : readArrayItems(
      children,
      `${path}.children`,
      state.issues,
      state.limits.maxProjectionNodes,
    );
  for (let index = 0; index < childItems.length; index += 1) {
    visitRenderNode(
      childItems[index],
      rootId,
      nodeId,
      index,
      depth + 1,
      false,
      collections,
      state,
      `${path}.children[${index}]`,
    );
  }

  WEAK_SET_DELETE(state.ancestorNodes, node);
}

function semanticNodeSegment(
  name,
  userData,
  childIndex,
  requiresStableIdentity,
  path,
  issues,
) {
  const mountKey = firstOwnString(userData, [
    'spacefaceMountKey',
    'spacefaceMount',
  ], `${path}.userData`, issues);
  if (mountKey) return `mount:${mountKey}`;
  const partUrl = firstOwnString(
    userData,
    ['spacefacePartUrl'],
    `${path}.userData`,
    issues,
  );
  if (partUrl && isNonemptyString(name)) return `part:${partUrl}#${name}`;
  if (isNonemptyString(name)) return `name:${name}`;
  const assetId = firstOwnString(userData, [
    'assetId',
    'placeId',
    'authoredCompositionId',
  ], `${path}.userData`, issues);
  if (assetId) return `asset:${assetId}`;
  if (requiresStableIdentity) {
    issues.add(
      `${path} must expose a stable semantic node identity; Three.js UUID fallback is forbidden`,
    );
  }
  return `group:${childIndex}`;
}

function projectGeometry(geometry, nodeId, nodeUserData, path, state) {
  if (!isObject(geometry) || IS_PROXY(geometry)) {
    state.issues.add(`${path}.geometry must be a non-Proxy geometry object`);
    return { nodeId, identity: 'invalid', type: null };
  }
  const userData = readUserData(
    geometry,
    `${path}.geometry.userData`,
    state.issues,
  );
  const explicitIdentity = firstOwnString(userData, [
    'spacefaceBatchKey',
    'spacefaceGeometryId',
    'spacefaceContentHash',
  ], `${path}.geometry.userData`, state.issues);
  const geometryName = readOwnData(
    geometry,
    'name',
    `${path}.geometry.name`,
    state.issues,
    false,
  );
  const geometryType = readOwnData(
    geometry,
    'type',
    `${path}.geometry.type`,
    state.issues,
    false,
  );
  const partUrl = firstOwnString(
    nodeUserData,
    ['spacefacePartUrl'],
    `${path}.userData`,
    state.issues,
  );
  const identity = explicitIdentity
    || (isNonemptyString(geometryName) ? `geometry-name:${geometryName}` : null)
    || (partUrl ? `part:${partUrl}:${nodeId}:geometry` : null);
  if (!identity) {
    state.issues.add(
      `${path}.geometry must expose stable semantic identity; Three.js UUID fallback is forbidden`,
    );
  }

  const index = readOwnData(
    geometry,
    'index',
    `${path}.geometry.index`,
    state.issues,
    false,
  );
  const indexCount = index == null
    ? 0
    : readCount(index, `${path}.geometry.index`, state.issues);
  const attributes = readOwnData(
    geometry,
    'attributes',
    `${path}.geometry.attributes`,
    state.issues,
    false,
  );
  const attributeRecords = projectGeometryAttributes(
    attributes,
    `${path}.geometry.attributes`,
    state.issues,
    state.limits,
  );
  let vertexCount = 0;
  for (let indexValue = 0; indexValue < attributeRecords.length; indexValue += 1) {
    if (attributeRecords[indexValue].name === 'position') {
      vertexCount = attributeRecords[indexValue].count;
      break;
    }
  }
  const drawRange = projectDrawRange(
    readOwnData(
      geometry,
      'drawRange',
      `${path}.geometry.drawRange`,
      state.issues,
      false,
    ),
    `${path}.geometry.drawRange`,
    state.issues,
  );
  const bounds = projectBounds(geometry, path, state.issues);

  return {
    nodeId,
    identity: identity ?? 'invalid',
    type: isNonemptyString(geometryType) ? geometryType : null,
    indexCount,
    vertexCount,
    attributes: attributeRecords,
    drawRange,
    bounds,
  };
}

function projectGeometryAttributes(attributes, path, issues, limits) {
  if (attributes == null) return [];
  if (!isSafeObject(attributes, true)) {
    issues.add(`${path} must be a plain non-Proxy object`);
    return [];
  }
  const keys = OBJECT_KEYS(attributes);
  if (keys.length > limits.maxObjectKeys) {
    issues.add(`${path} exceeds attribute limit ${limits.maxObjectKeys}`);
    return [];
  }
  ARRAY_SORT(keys);
  const result = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const attribute = readOwnData(
      attributes,
      key,
      `${path}.${key}`,
      issues,
      true,
    );
    append(result, {
      name: key,
      count: readCount(attribute, `${path}.${key}`, issues),
      itemSize: readOptionalFiniteNumber(
        attribute,
        'itemSize',
        `${path}.${key}.itemSize`,
        issues,
      ),
      normalized: readOptionalBoolean(
        attribute,
        'normalized',
        `${path}.${key}.normalized`,
        issues,
        false,
      ),
    });
  }
  return result;
}

function projectDrawRange(value, path, issues) {
  if (value == null) return null;
  if (!isObject(value) || IS_PROXY(value)) {
    issues.add(`${path} must be a non-Proxy object or null`);
    return null;
  }
  return {
    start: readOptionalFiniteNumber(value, 'start', `${path}.start`, issues),
    count: readOptionalFiniteNumber(value, 'count', `${path}.count`, issues),
  };
}

function projectBounds(geometry, path, issues) {
  const box = readOwnData(
    geometry,
    'boundingBox',
    `${path}.geometry.boundingBox`,
    issues,
    false,
  );
  const sphere = readOwnData(
    geometry,
    'boundingSphere',
    `${path}.geometry.boundingSphere`,
    issues,
    false,
  );
  return {
    box: box == null ? null : [
      ...projectVector3(
        readOwnData(box, 'min', `${path}.geometry.boundingBox.min`, issues, true),
        `${path}.geometry.boundingBox.min`,
        issues,
      ),
      ...projectVector3(
        readOwnData(box, 'max', `${path}.geometry.boundingBox.max`, issues, true),
        `${path}.geometry.boundingBox.max`,
        issues,
      ),
    ],
    sphere: sphere == null ? null : [
      ...projectVector3(
        readOwnData(sphere, 'center', `${path}.geometry.boundingSphere.center`, issues, true),
        `${path}.geometry.boundingSphere.center`,
        issues,
      ),
      readFiniteNumber(
        sphere,
        'radius',
        `${path}.geometry.boundingSphere.radius`,
        issues,
      ),
    ],
  };
}

function projectMaterial(
  material,
  nodeId,
  materialIndex,
  renderOrder,
  nodeUserData,
  path,
  state,
) {
  if (!isObject(material) || IS_PROXY(material)) {
    state.issues.add(`${path} must be a non-Proxy material object`);
    return {
      semantic: {
        nodeId,
        materialIndex,
        identity: 'invalid',
        pipelineKey: 'invalid',
        color: null,
        emissive: null,
        emissiveIntensity: null,
        opacity: null,
        textures: [],
      },
      ordering: invalidOrdering(nodeId, materialIndex),
    };
  }
  const userData = readUserData(material, `${path}.userData`, state.issues);
  const type = readOwnData(material, 'type', `${path}.type`, state.issues, false);
  const name = readOwnData(material, 'name', `${path}.name`, state.issues, false);
  const explicitIdentity = firstOwnString(userData, [
    'spacefaceBatchKey',
    'spacefaceMaterialId',
  ], `${path}.userData`, state.issues);
  const partUrl = firstOwnString(
    nodeUserData,
    ['spacefacePartUrl'],
    `${path}.ownerUserData`,
    state.issues,
  );
  const identity = explicitIdentity
    || (isNonemptyString(name) ? `material-name:${name}` : null)
    || (partUrl ? `part:${partUrl}:${nodeId}:material:${materialIndex}` : null);
  if (!identity) {
    state.issues.add(
      `${path} must expose stable semantic identity; Three.js UUID fallback is forbidden`,
    );
  }

  const transparent = readOptionalBoolean(
    material,
    'transparent',
    `${path}.transparent`,
    state.issues,
    false,
  );
  const blending = readOptionalPrimitive(
    material,
    'blending',
    `${path}.blending`,
    state.issues,
  );
  const premultipliedAlpha = readOptionalBoolean(
    material,
    'premultipliedAlpha',
    `${path}.premultipliedAlpha`,
    state.issues,
    false,
  );
  const side = readOptionalPrimitive(
    material,
    'side',
    `${path}.side`,
    state.issues,
  );
  const depthTest = readOptionalBoolean(
    material,
    'depthTest',
    `${path}.depthTest`,
    state.issues,
    true,
  );
  const depthWrite = readOptionalBoolean(
    material,
    'depthWrite',
    `${path}.depthWrite`,
    state.issues,
    true,
  );
  const depthFunc = readOptionalPrimitive(
    material,
    'depthFunc',
    `${path}.depthFunc`,
    state.issues,
  );
  const alphaTest = readOptionalFiniteNumber(
    material,
    'alphaTest',
    `${path}.alphaTest`,
    state.issues,
  );
  const vertexColors = readOptionalBoolean(
    material,
    'vertexColors',
    `${path}.vertexColors`,
    state.issues,
    false,
  );
  const wireframe = readOptionalBoolean(
    material,
    'wireframe',
    `${path}.wireframe`,
    state.issues,
    false,
  );
  const toneMapped = readOptionalBoolean(
    material,
    'toneMapped',
    `${path}.toneMapped`,
    state.issues,
    true,
  );
  const textures = projectMaterialTextures(material, path, state);
  const color = projectOptionalColor(
    readOwnData(material, 'color', `${path}.color`, state.issues, false),
    `${path}.color`,
    state.issues,
  );
  const emissive = projectOptionalColor(
    readOwnData(material, 'emissive', `${path}.emissive`, state.issues, false),
    `${path}.emissive`,
    state.issues,
  );
  const emissiveIntensity = readOptionalFiniteNumber(
    material,
    'emissiveIntensity',
    `${path}.emissiveIntensity`,
    state.issues,
  );
  const opacity = readOptionalFiniteNumber(
    material,
    'opacity',
    `${path}.opacity`,
    state.issues,
  );
  const pipelineKey = ARRAY_JOIN([
    isNonemptyString(type) ? type : 'material',
    `transparent:${primitiveToken(transparent)}`,
    `blending:${primitiveToken(blending)}`,
    `premultiplied:${primitiveToken(premultipliedAlpha)}`,
    `side:${primitiveToken(side)}`,
    `depthTest:${primitiveToken(depthTest)}`,
    `depthWrite:${primitiveToken(depthWrite)}`,
    `depthFunc:${primitiveToken(depthFunc)}`,
    `alphaTest:${primitiveToken(alphaTest)}`,
    `vertexColors:${primitiveToken(vertexColors)}`,
    `wireframe:${primitiveToken(wireframe)}`,
    `toneMapped:${primitiveToken(toneMapped)}`,
  ], '|');

  return {
    semantic: {
      nodeId,
      materialIndex,
      identity: identity ?? 'invalid',
      pipelineKey,
      color,
      emissive,
      emissiveIntensity,
      opacity,
      textures,
    },
    ordering: {
      nodeId,
      materialIndex,
      renderOrder,
      blend: {
        mode: blending,
        premultipliedAlpha,
        transparent,
      },
      depth: {
        test: depthTest,
        write: depthWrite,
        function: depthFunc,
      },
    },
  };
}

function projectMaterialTextures(material, path, state) {
  const textures = [];
  for (let slotIndex = 0; slotIndex < TEXTURE_SLOTS.length; slotIndex += 1) {
    const slot = TEXTURE_SLOTS[slotIndex];
    const texture = readOwnData(
      material,
      slot,
      `${path}.${slot}`,
      state.issues,
      false,
    );
    if (texture == null) continue;
    if (textures.length >= state.limits.maxTexturesPerMaterial) {
      state.issues.add(
        `${path} exceeds texture limit ${state.limits.maxTexturesPerMaterial}`,
      );
      break;
    }
    append(textures, projectTexture(texture, slot, `${path}.${slot}`, state));
  }
  return textures;
}

function projectTexture(texture, slot, path, state) {
  if (!isObject(texture) || IS_PROXY(texture)) {
    state.issues.add(`${path} must be a non-Proxy texture object`);
    return { slot, identity: 'invalid', colorSpace: null };
  }
  const userData = readUserData(texture, `${path}.userData`, state.issues);
  let identity = firstOwnString(userData, [
    'spacefaceSourceKey',
    'spacefaceBatchKey',
    'spacefaceTextureId',
  ], `${path}.userData`, state.issues);
  if (!identity) {
    const image = readOwnData(texture, 'image', `${path}.image`, state.issues, false);
    identity = firstOwnString(
      image,
      ['currentSrc', 'src'],
      `${path}.image`,
      state.issues,
    );
  }
  if (!identity) {
    const source = readOwnData(texture, 'source', `${path}.source`, state.issues, false);
    const data = readOwnData(source, 'data', `${path}.source.data`, state.issues, false);
    identity = firstOwnString(
      data,
      ['currentSrc', 'src'],
      `${path}.source.data`,
      state.issues,
    );
  }
  if (!identity) {
    state.issues.add(
      `${path} texture must expose stable semantic identity; Three.js UUID fallback is forbidden`,
    );
  }
  return {
    slot,
    identity: identity ?? 'invalid',
    colorSpace: readOptionalPrimitive(
      texture,
      'colorSpace',
      `${path}.colorSpace`,
      state.issues,
    ),
    mapping: readOptionalPrimitive(
      texture,
      'mapping',
      `${path}.mapping`,
      state.issues,
    ),
    wrapS: readOptionalPrimitive(
      texture,
      'wrapS',
      `${path}.wrapS`,
      state.issues,
    ),
    wrapT: readOptionalPrimitive(
      texture,
      'wrapT',
      `${path}.wrapT`,
      state.issues,
    ),
    minFilter: readOptionalPrimitive(
      texture,
      'minFilter',
      `${path}.minFilter`,
      state.issues,
    ),
    magFilter: readOptionalPrimitive(
      texture,
      'magFilter',
      `${path}.magFilter`,
      state.issues,
    ),
    flipY: readOptionalBoolean(
      texture,
      'flipY',
      `${path}.flipY`,
      state.issues,
      false,
    ),
    premultiplyAlpha: readOptionalBoolean(
      texture,
      'premultiplyAlpha',
      `${path}.premultiplyAlpha`,
      state.issues,
      false,
    ),
  };
}

function projectAttachment(
  node,
  nodeId,
  rootId,
  parentNodeId,
  kind,
  userData,
  path,
  issues,
) {
  const name = readOwnData(node, 'name', `${path}.name`, issues, false);
  const mountKey = firstOwnString(userData, [
    'spacefaceMountKey',
    'spacefaceMount',
  ], `${path}.userData`, issues);
  const token = mountKey || (isNonemptyString(name) ? name : null);
  if (!token) {
    issues.add(
      `${path} attachment must expose a stable name or mount key; UUID fallback is forbidden`,
    );
  }
  const transform = projectLocalTransform(node, path, issues);
  return {
    kind,
    stableId: `${rootId}/${kind}:${token ?? 'invalid'}`,
    parentStableObjectId: parentNodeId,
    nodeId,
    role: firstOwnString(
      userData,
      ['role', 'spacefaceMount'],
      `${path}.userData`,
      issues,
    ) ?? null,
    transform,
    forward: projectForward(
      readOwnData(userData, 'forward', `${path}.userData.forward`, issues, false),
      `${path}.userData.forward`,
      issues,
    ),
  };
}

function projectAnimationHook(node, nodeId, userData, path, issues) {
  const tags = readOwnData(
    userData,
    'spacefaceTags',
    `${path}.userData.spacefaceTags`,
    issues,
    false,
  );
  const morph = readOwnData(
    node,
    'morphTargetInfluences',
    `${path}.morphTargetInfluences`,
    issues,
    false,
  );
  const tagSnapshot = tags == null ? null : projectTagState(tags, path, issues);
  const morphSnapshot = morph == null
    ? null
    : projectNumberArray(morph, `${path}.morphTargetInfluences`, issues, 256);
  if (tagSnapshot == null && morphSnapshot == null) return null;
  return {
    nodeId,
    tags: tagSnapshot,
    morphTargetInfluences: morphSnapshot,
  };
}

function projectTagState(tags, path, issues) {
  if (!isSafeObject(tags, true)) {
    issues.add(`${path}.userData.spacefaceTags must be a plain non-Proxy object`);
    return null;
  }
  const keys = [
    'drive',
    'damageRole',
    'lod',
    'mount',
    'mountKey',
    'socket',
    'socketRole',
  ];
  const result = Object.create(null);
  let count = 0;
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(tags, keys[index]);
    if (!descriptor) continue;
    if (!OBJECT_HAS_OWN(descriptor, 'value')) {
      issues.add(`${path}.userData.spacefaceTags.${keys[index]} must be a data property`);
      continue;
    }
    const value = descriptor.value;
    if (!isPrimitive(value)) {
      issues.add(`${path}.userData.spacefaceTags.${keys[index]} must be primitive`);
      continue;
    }
    defineOwn(result, keys[index], value);
    count += 1;
  }
  return count > 0 ? result : null;
}

function attachmentKind(userData, path, issues) {
  if (!userData) return null;
  const socket = readOwnData(
    userData,
    'spacefaceSocket',
    `${path}.spacefaceSocket`,
    issues,
    false,
  );
  if (socket != null && typeof socket !== 'boolean') {
    issues.add(`${path}.spacefaceSocket must be boolean when present`);
  }
  if (socket === true) return 'socket';
  if (
    readOptionalString(
      userData,
      'spacefaceMountKey',
      `${path}.spacefaceMountKey`,
      issues,
    )
    || readOptionalString(
      userData,
      'spacefaceMount',
      `${path}.spacefaceMount`,
      issues,
    )
  ) return 'mount';
  const tags = readOwnData(
    userData,
    'spacefaceTags',
    `${path}.spacefaceTags`,
    issues,
    false,
  );
  if (tags == null) return null;
  if (!isSafeObject(tags, true)) {
    issues.add(`${path}.spacefaceTags must be a plain non-Proxy object`);
    return null;
  }
  const tagSocket = readOwnData(
    tags,
    'socket',
    `${path}.spacefaceTags.socket`,
    issues,
    false,
  );
  if (tagSocket != null && typeof tagSocket !== 'boolean') {
    issues.add(`${path}.spacefaceTags.socket must be boolean when present`);
  }
  if (tagSocket === true) return 'socket';
  return readOptionalString(
    tags,
    'mount',
    `${path}.spacefaceTags.mount`,
    issues,
  ) ? 'mount' : null;
}

function projectLocalTransform(node, path, issues) {
  return {
    position: projectVector3(
      readOwnData(node, 'position', `${path}.position`, issues, true),
      `${path}.position`,
      issues,
    ),
    quaternion: projectQuaternion(
      readOwnData(node, 'quaternion', `${path}.quaternion`, issues, true),
      `${path}.quaternion`,
      issues,
    ),
    scale: projectVector3(
      readOwnData(node, 'scale', `${path}.scale`, issues, true),
      `${path}.scale`,
      issues,
    ),
  };
}

function projectVector3(value, path, issues) {
  if (!isObject(value) || IS_PROXY(value)) {
    issues.add(`${path} must be a non-Proxy vector object`);
    return [0, 0, 0];
  }
  return [
    readFiniteNumber(value, 'x', `${path}.x`, issues),
    readFiniteNumber(value, 'y', `${path}.y`, issues),
    readFiniteNumber(value, 'z', `${path}.z`, issues),
  ];
}

function projectQuaternion(value, path, issues) {
  if (!isObject(value) || IS_PROXY(value)) {
    issues.add(`${path} must be a non-Proxy quaternion object`);
    return [0, 0, 0, 1];
  }
  return [
    readQuaternionComponent(value, 'x', '_x', `${path}.x`, issues),
    readQuaternionComponent(value, 'y', '_y', `${path}.y`, issues),
    readQuaternionComponent(value, 'z', '_z', `${path}.z`, issues),
    readQuaternionComponent(value, 'w', '_w', `${path}.w`, issues),
  ];
}

function readQuaternionComponent(value, publicKey, privateKey, path, issues) {
  const publicDescriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, publicKey);
  if (publicDescriptor) {
    if (!OBJECT_HAS_OWN(publicDescriptor, 'value')) {
      issues.add(`${path} must be an own data property`);
      return 0;
    }
    return finiteProjectionNumber(publicDescriptor.value, path, issues);
  }
  const privateDescriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, privateKey);
  if (!privateDescriptor || !OBJECT_HAS_OWN(privateDescriptor, 'value')) {
    issues.add(`${path} must be represented by own ${publicKey} or ${privateKey} data`);
    return 0;
  }
  return finiteProjectionNumber(privateDescriptor.value, path, issues);
}

function projectForward(value, path, issues) {
  if (value == null) return [1, 0, 0];
  if (ARRAY_IS_ARRAY(value)) return projectNumberArray(value, path, issues, 3, 3);
  return projectVector3(value, path, issues);
}

function projectNumberArray(value, path, issues, limit, exactLength = null) {
  const values = readArrayItems(value, path, issues, limit);
  if (exactLength != null && values.length !== exactLength) {
    issues.add(`${path} must contain exactly ${exactLength} values`);
  }
  const result = new Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    defineArrayValue(
      result,
      index,
      finiteProjectionNumber(values[index], `${path}[${index}]`, issues),
    );
  }
  return result;
}

function projectOptionalColor(value, path, issues) {
  if (value == null) return null;
  if (!isObject(value) || IS_PROXY(value)) {
    issues.add(`${path} must be a non-Proxy color object or null`);
    return null;
  }
  return [
    readFiniteNumber(value, 'r', `${path}.r`, issues),
    readFiniteNumber(value, 'g', `${path}.g`, issues),
    readFiniteNumber(value, 'b', `${path}.b`, issues),
  ];
}

function projectXZ(value, path, issues) {
  if (value == null) return null;
  if (!isObject(value) || IS_PROXY(value)) {
    issues.add(`${path} must be a non-Proxy XZ object or null`);
    return null;
  }
  return [
    readFiniteNumber(value, 'x', `${path}.x`, issues),
    readFiniteNumber(value, 'z', `${path}.z`, issues),
  ];
}

function createHudPresentationRecord(hud) {
  return {
    schema: PRESENTATION_SEMANTIC_RECORD_SCHEMA,
    stableObjectId: 'hud:root',
    parentStableObjectId: null,
    identity: { kind: 'hud', rootId: 'hud' },
    transform: null,
    visibility: null,
    geometry: null,
    material: null,
    attachments: [],
    ordering: null,
    animation: null,
    hud,
  };
}

function sortProjectionCollections(collections) {
  ARRAY_SORT(collections.transforms, compareNodeId);
  ARRAY_SORT(collections.visibility, compareNodeId);
  ARRAY_SORT(collections.geometry, compareNodeIdentity);
  ARRAY_SORT(collections.material, compareNodeMaterial);
  ARRAY_SORT(collections.attachments, compareAttachmentId);
  ARRAY_SORT(collections.ordering, compareNodeMaterial);
  ARRAY_SORT(collections.animation, compareNodeId);
}

function comparePresentationRecordId(left, right) {
  return compareStrings(left.stableObjectId, right.stableObjectId);
}

function compareNodeId(left, right) {
  return compareStrings(left.nodeId, right.nodeId);
}

function compareNodeIdentity(left, right) {
  const node = compareStrings(left.nodeId, right.nodeId);
  return node || compareStrings(left.identity, right.identity);
}

function compareNodeMaterial(left, right) {
  const node = compareStrings(left.nodeId, right.nodeId);
  if (node) return node;
  return (left.materialIndex ?? 0) - (right.materialIndex ?? 0);
}

function compareAttachmentId(left, right) {
  return compareStrings(left.stableId, right.stableId);
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function invalidOrdering(nodeId, materialIndex) {
  return {
    nodeId,
    materialIndex,
    renderOrder: null,
    blend: { mode: null, premultipliedAlpha: null, transparent: null },
    depth: { test: null, write: null, function: null },
  };
}

function readArrayItems(value, path, issues, limit) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value)) {
    issues.add(`${path} must be an ordinary non-Proxy array`);
    return [];
  }
  if (OBJECT_GET_PROTOTYPE_OF(value) !== Array.prototype) {
    issues.add(`${path} must use Array.prototype`);
    return [];
  }
  const lengthDescriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
  const length = lengthDescriptor?.value;
  if (!NUMBER_IS_SAFE_INTEGER(length) || length < 0) {
    issues.add(`${path} must have an ordinary safe length`);
    return [];
  }
  if (length > limit) issues.add(`${path} exceeds limit ${limit}`);
  const count = Math.min(length, limit);
  const result = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, `${index}`);
    if (!descriptor) {
      issues.add(`${path}[${index}] is sparse`);
      defineArrayValue(result, index, INVALID);
      continue;
    }
    if (!OBJECT_HAS_OWN(descriptor, 'value')) {
      issues.add(`${path}[${index}] must be a data property, not an accessor`);
      defineArrayValue(result, index, INVALID);
      continue;
    }
    defineArrayValue(result, index, descriptor.value);
  }
  return result;
}

function readUserData(object, path, issues) {
  const userData = readOwnData(object, 'userData', path, issues, false);
  if (userData == null) return null;
  if (!isSafeObject(userData, true)) {
    issues.add(`${path} must be a plain non-Proxy object`);
    return null;
  }
  return userData;
}

function readOwnData(object, key, path, issues, required) {
  if (!isObject(object) || IS_PROXY(object)) {
    if (required) issues.add(`${path} must be an own data property`);
    return undefined;
  }
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(object, key);
  if (!descriptor) {
    if (required) issues.add(`${path} is required as an own data property`);
    return undefined;
  }
  if (!OBJECT_HAS_OWN(descriptor, 'value')) {
    issues.add(`${path} must be an own data property, not an accessor`);
    return undefined;
  }
  return descriptor.value;
}

function readOwnDataSilently(object, key) {
  if (!isObject(object) || IS_PROXY(object)) return undefined;
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(object, key);
  return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

function readOptionalString(object, key, path, issues) {
  const value = readOwnData(object, key, path, issues, false);
  if (value == null || value === '') return null;
  if (!isNonemptyString(value)) {
    issues.add(`${path} must be a non-empty string when present`);
    return null;
  }
  return value;
}

function readBoolean(object, key, path, issues) {
  const value = readOwnData(object, key, path, issues, true);
  if (typeof value !== 'boolean') {
    issues.add(`${path} must be boolean`);
    return false;
  }
  return value;
}

function readOptionalBoolean(object, key, path, issues, fallback) {
  const value = readOwnData(object, key, path, issues, false);
  if (value == null) return fallback;
  if (typeof value !== 'boolean') {
    issues.add(`${path} must be boolean when present`);
    return fallback;
  }
  return value;
}

function readFiniteNumber(object, key, path, issues) {
  return finiteProjectionNumber(
    readOwnData(object, key, path, issues, true),
    path,
    issues,
  );
}

function readOptionalFiniteNumber(object, key, path, issues) {
  const value = readOwnData(object, key, path, issues, false);
  if (value == null) return null;
  return finiteProjectionNumber(value, path, issues);
}

function finiteProjectionNumber(value, path, issues) {
  if (typeof value !== 'number' || !NUMBER_IS_FINITE(value)) {
    issues.add(`${path} must be a finite number`);
    return 0;
  }
  return value;
}

function readOptionalPrimitive(object, key, path, issues) {
  const value = readOwnData(object, key, path, issues, false);
  if (value == null) return null;
  if (!isPrimitive(value)) {
    issues.add(`${path} must be primitive when present`);
    return null;
  }
  return value;
}

function readCount(object, path, issues) {
  const value = readOwnData(object, 'count', `${path}.count`, issues, false);
  if (value == null) return 0;
  if (!isNonNegativeSafeInteger(value)) {
    issues.add(`${path}.count must be a non-negative safe integer`);
    return 0;
  }
  return value;
}

function firstOwnString(object, keys, path, issues) {
  if (!isObject(object)) return null;
  if (IS_PROXY(object)) {
    issues.add(`${path} must not be a Proxy`);
    return null;
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(object, key);
    if (!descriptor) continue;
    if (!OBJECT_HAS_OWN(descriptor, 'value')) {
      issues.add(`${path}.${key} must be an own data property, not an accessor`);
      continue;
    }
    if (descriptor.value == null || descriptor.value === '') continue;
    if (isNonemptyString(descriptor.value)) return descriptor.value;
    issues.add(`${path}.${key} must be a non-empty string when present`);
  }
  return null;
}

function normalizeVerdictDimension(name, value, limits) {
  if (typeof value === 'boolean') return { pass: value, reasons: [] };
  if (!isSafeObject(value, true)) {
    return { pass: false, reasons: [`missing ${name} verdict`] };
  }
  const issues = createIssueCollector(limits);
  const snapshot = snapshotEvidence(
    value,
    name,
    issues,
    limits,
    limits.maxArrayItems,
  );
  if (!isPlainSnapshotObject(snapshot) || issues.count > 0) {
    return { pass: false, reasons: [`invalid ${name} verdict`] };
  }
  const pass = snapshot.pass;
  if (typeof pass !== 'boolean') {
    return { pass: false, reasons: [`missing ${name} verdict`] };
  }
  const reasons = [];
  if (snapshot.reasons != null) {
    if (!ARRAY_IS_ARRAY(snapshot.reasons)) {
      return { pass: false, reasons: [`invalid ${name} reasons`] };
    }
    const count = Math.min(snapshot.reasons.length, limits.maxVerdictReasons);
    for (let index = 0; index < count; index += 1) {
      if (!isNonemptyString(snapshot.reasons[index])) continue;
      append(reasons, snapshot.reasons[index]);
    }
    if (snapshot.reasons.length > limits.maxVerdictReasons) {
      append(reasons, `${name} reasons truncated`);
    }
  }
  const result = Object.create(null);
  const keys = OBJECT_KEYS(snapshot);
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] === 'reasons' || keys[index] === 'pass') continue;
    defineOwn(result, keys[index], snapshot[keys[index]]);
  }
  defineOwn(result, 'pass', pass);
  defineOwn(result, 'reasons', reasons);
  return result;
}

function diagnosticsResult(issues, limits) {
  const omittedIssueCount = Math.max(0, issues.count - issues.values.length);
  return {
    issueCount: issues.count,
    emittedIssueCount: issues.values.length,
    omittedIssueCount,
    utf8Bytes: issues.usedBytes,
    truncated:
      omittedIssueCount > 0
      || issues.truncatedMessageCount > 0
      || issues.truncatedEvidenceCount > 0,
    failures: [...issues.values],
    limits: { ...limits },
  };
}

function createIssueCollector(limits) {
  const once = new Set();
  return {
    count: 0,
    values: [],
    usedBytes: 0,
    truncatedMessageCount: 0,
    truncatedEvidenceCount: 0,
    markTruncated() {
      this.truncatedEvidenceCount += 1;
    },
    add(message) {
      this.count += 1;
      if (this.values.length >= limits.maxDiagnosticIssues) return;
      const separatorBytes = this.values.length > 0 ? 1 : 0;
      const available = limits.maxDiagnosticBytes - this.usedBytes - separatorBytes;
      if (available <= 0) return;
      const bounded = truncateUtf8(
        message,
        Math.min(limits.maxDiagnosticMessageBytes, available),
      );
      if (!bounded) return;
      if (bounded !== message) this.truncatedMessageCount += 1;
      append(this.values, bounded);
      this.usedBytes += separatorBytes + BUFFER_BYTE_LENGTH(bounded, 'utf8');
    },
    addOnce(key, message) {
      if (SET_HAS(once, key)) return;
      SET_ADD(once, key);
      this.add(message);
    },
  };
}

function diagnosticValue(value, limits) {
  if (value === MISSING) return '<missing>';
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
  ) return value;
  if (typeof value === 'string') {
    return truncateUtf8(value, limits.maxDiagnosticValueBytes);
  }
  const preview = boundedStructuralPreview(value, limits);
  return truncateUtf8(preview, limits.maxDiagnosticValueBytes);
}

function boundedStructuralPreview(value, limits) {
  if (ARRAY_IS_ARRAY(value)) return `<array length=${value.length}>`;
  if (isPlainSnapshotObject(value)) {
    return `<object keys=${Math.min(OBJECT_KEYS(value).length, limits.maxObjectKeys)}>`;
  }
  return `<${valueType(value)}>`;
}

function truncateUtf8(value, maxBytes) {
  if (maxBytes <= 0) return '';
  if (BUFFER_BYTE_LENGTH(value, 'utf8') <= maxBytes) return value;
  const ellipsis = maxBytes >= 3 ? '…' : '';
  const targetBytes = maxBytes - BUFFER_BYTE_LENGTH(ellipsis, 'utf8');
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = STRING_SLICE(value, 0, mid);
    if (BUFFER_BYTE_LENGTH(candidate, 'utf8') <= targetBytes) low = mid;
    else high = mid - 1;
  }
  let end = low;
  if (end > 0) {
    const code = value.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  }
  return `${STRING_SLICE(value, 0, end)}${ellipsis}`;
}

function propertyPath(prefix, key, limits) {
  const path = appendPropertyPath(prefix, key, limits);
  return path || '(root)';
}

function appendPropertyPath(prefix, key, limits) {
  const simple = isSimplePathKey(key);
  const suffix = simple ? `.${key}` : `[${previewValue(key)}]`;
  const result = prefix ? `${prefix}${suffix}` : (simple ? key : suffix);
  if (result.length <= limits.maxPathLength) return result;
  return `${STRING_SLICE(result, 0, Math.max(0, limits.maxPathLength - 1))}…`;
}

function appendIndexPath(prefix, index, limits) {
  const result = `${prefix}[${index}]`;
  if (result.length <= limits.maxPathLength) return result;
  return `${STRING_SLICE(result, 0, Math.max(0, limits.maxPathLength - 1))}…`;
}

function isSimplePathKey(key) {
  if (!key || key.length > 64) return false;
  const first = key.charCodeAt(0);
  const firstValid = first === 36 || first === 95
    || (first >= 65 && first <= 90)
    || (first >= 97 && first <= 122);
  if (!firstValid) return false;
  for (let index = 1; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    if (
      code === 36
      || code === 95
      || (code >= 48 && code <= 57)
      || (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
    ) continue;
    return false;
  }
  return true;
}

function previewValue(value) {
  if (typeof value === 'string') {
    const bounded = value.length > 64
      ? `${STRING_SLICE(value, 0, 64)}…`
      : value;
    return JSON_STRINGIFY(bounded);
  }
  if (typeof value === 'number') return NUMBER_TO_STRING(value);
  if (typeof value === 'boolean' || value == null) return `${value}`;
  return `<${typeof value}>`;
}

function canonicalArrayIndex(key) {
  if (key === '') return null;
  if (key === '0') return 0;
  if (key.charCodeAt(0) === 48) return null;
  let value = 0;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    if (code < 48 || code > 57) return null;
    value = value * 10 + (code - 48);
    if (!NUMBER_IS_SAFE_INTEGER(value)) return null;
  }
  return value;
}

function requireOwnSnapshot(object, key, prefix, issues) {
  if (OBJECT_HAS_OWN(object, key)) return true;
  issues.add(`${prefix}.${key} is required`);
  return false;
}

function stableScalarToken(value) {
  if (isNonemptyString(value)) return value;
  if (NUMBER_IS_SAFE_INTEGER(value) && !OBJECT_IS(value, -0)) {
    return NUMBER_TO_STRING(value);
  }
  return null;
}

function primitiveToken(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return NUMBER_TO_STRING(value);
  if (typeof value === 'string') return value;
  return 'missing';
}

function isPrimitive(value) {
  return value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string';
}

function isNonNegativeSafeInteger(value) {
  return NUMBER_IS_SAFE_INTEGER(value) && !OBJECT_IS(value, -0) && value >= 0;
}

function isNonemptyString(value) {
  return typeof value === 'string'
    && value.length > 0
    && STRING_TRIM(value).length > 0;
}

function isObject(value) {
  return value != null && (typeof value === 'object' || typeof value === 'function');
}

function hasOrdinaryObjectPrototype(value) {
  if (!isObject(value) || ARRAY_IS_ARRAY(value)) return false;
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeObject(value, requireOrdinaryPrototype) {
  if (!isObject(value) || IS_PROXY(value) || ARRAY_IS_ARRAY(value)) return false;
  return !requireOrdinaryPrototype || hasOrdinaryObjectPrototype(value);
}

function isPlainSnapshotObject(value) {
  return value !== INVALID && hasOrdinaryObjectPrototype(value);
}

function ownValue(object, key) {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(object, key);
  return descriptor && OBJECT_HAS_OWN(descriptor, 'value')
    ? descriptor.value
    : MISSING;
}

function cloneCheckpointPolicy() {
  return {
    role: CHECKPOINT_EVIDENCE_POLICY.role,
    promotedToExact: CHECKPOINT_EVIDENCE_POLICY.promotedToExact,
    reason: CHECKPOINT_EVIDENCE_POLICY.reason,
  };
}

function defineOwn(object, key, value) {
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function defineArrayValue(array, index, value) {
  Object.defineProperty(array, `${index}`, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function append(array, value) {
  ARRAY_PUSH(array, value);
}

function deepFreeze(value) {
  if (!isObject(value) || OBJECT_IS_FROZEN(value)) return value;
  if (ARRAY_IS_ARRAY(value)) {
    for (let index = 0; index < value.length; index += 1) {
      deepFreeze(value[index]);
    }
  } else if (value instanceof Map || value instanceof Set || value instanceof WeakMap || value instanceof WeakSet) {
    return value;
  } else {
    const keys = OBJECT_KEYS(value);
    for (let index = 0; index < keys.length; index += 1) {
      deepFreeze(value[keys[index]]);
    }
  }
  return OBJECT_FREEZE(value);
}
