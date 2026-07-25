// Checkpoint series compare + first-divergence localization (§15 Phase 4).
// Never rounds FP divergence away and calls it exact — raw values are recorded.
// exactWithin.crossRuntime remains false; this reports match-within-coverage OR first divergence.

/**
 * @typedef {{ tick: number, hash?: string, surface?: object, semanticHash?: string }} CheckpointPoint
 * @typedef {{
 *   match: boolean,
 *   firstDivergence: null | object,
 *   lastMatchingTick: number | null,
 *   classification: string | null,
 *   seriesLength: { node: number, chromium: number },
 *   exactWithin: { crossRuntime: false, sameCoverage: boolean },
 * }} CompareResult
 */

/**
 * Compare two ordered checkpoint series (Node vs Chromium).
 * Series items should include { tick, hash } and preferably { surface } for field localization.
 *
 * @param {CheckpointPoint[]} nodeSeries
 * @param {CheckpointPoint[]} chromiumSeries
 * @param {object} [options]
 * @returns {CompareResult}
 */
export function compareCheckpoints(nodeSeries, chromiumSeries, options = {}) {
  const node = Array.isArray(nodeSeries) ? nodeSeries : [];
  const chrome = Array.isArray(chromiumSeries) ? chromiumSeries : [];
  const exactWithin = {
    crossRuntime: false,
    sameCoverage: true,
  };

  if (node.length === 0 && chrome.length === 0) {
    return {
      match: true,
      firstDivergence: null,
      lastMatchingTick: null,
      classification: null,
      seriesLength: { node: 0, chromium: 0 },
      exactWithin,
    };
  }

  // Walk the common prefix first so a later length mismatch reports the correct
  // missing/extra tick (and lastMatchingTick of agreeing points), not the first tick.
  let lastMatchingTick = null;
  const commonLen = Math.min(node.length, chrome.length);
  for (let i = 0; i < commonLen; i++) {
    const a = node[i];
    const b = chrome[i];
    if ((a.tick | 0) !== (b.tick | 0)) {
      return {
        match: false,
        firstDivergence: {
          kind: 'tick-misalign',
          tick: a.tick | 0,
          index: i,
          field: 'tick',
          nodeValue: a.tick | 0,
          chromiumValue: b.tick | 0,
          raw: { nodeTick: a.tick, chromiumTick: b.tick },
        },
        lastMatchingTick,
        classification: 'order',
        seriesLength: { node: node.length, chromium: chrome.length },
        exactWithin,
      };
    }

    const hashA = a.hash || null;
    const hashB = b.hash || null;
    const hashesMatch = hashA != null && hashB != null
      ? hashA === hashB
      : surfacesEqual(a.surface, b.surface);

    if (hashesMatch) {
      lastMatchingTick = a.tick | 0;
      continue;
    }

    // First differing checkpoint — localize field if surfaces present.
    const fieldDiff = a.surface && b.surface
      ? firstDifferingField(a.surface, b.surface, '')
      : null;

    const classification = classifyDivergence({
      field: fieldDiff && fieldDiff.path,
      nodePoint: a,
      chromiumPoint: b,
      options,
    });

    return {
      match: false,
      firstDivergence: {
        kind: 'checkpoint',
        tick: a.tick | 0,
        index: i,
        field: fieldDiff ? fieldDiff.path : (hashA != null ? 'hash' : 'surface'),
        nodeValue: fieldDiff ? fieldDiff.left : hashA,
        chromiumValue: fieldDiff ? fieldDiff.right : hashB,
        nodeHash: hashA,
        chromiumHash: hashB,
        // Raw values — never rounded for the report even if surfaces used round6.
        raw: fieldDiff
          ? { path: fieldDiff.path, node: fieldDiff.left, chromium: fieldDiff.right, leftType: typeof fieldDiff.left, rightType: typeof fieldDiff.right }
          : { nodeHash: hashA, chromiumHash: hashB },
        precedingInputWindow: options.inputWindowAtTick
          ? options.inputWindowAtTick(a.tick | 0)
          : null,
        candidateWriters: guessCandidateWriters(fieldDiff && fieldDiff.path),
      },
      lastMatchingTick,
      classification,
      seriesLength: { node: node.length, chromium: chrome.length },
      exactWithin,
    };
  }

  if (node.length !== chrome.length) {
    exactWithin.sameCoverage = false;
    const longer = node.length > chrome.length ? node : chrome;
    const missingSide = node.length > chrome.length ? 'chromium' : 'node';
    const extraSide = node.length > chrome.length ? 'node' : 'chromium';
    const firstExtra = longer[commonLen];
    const divergeTick = firstExtra?.tick ?? (lastMatchingTick != null ? lastMatchingTick + 1 : 0);
    return {
      match: false,
      firstDivergence: {
        kind: 'series-length',
        tick: divergeTick | 0,
        index: commonLen,
        nodeLength: node.length,
        chromiumLength: chrome.length,
        field: 'series.length',
        nodeValue: node.length,
        chromiumValue: chrome.length,
        missingSide,
        extraSide,
        raw: {
          nodeLength: node.length,
          chromiumLength: chrome.length,
          lastMatchingTick,
          firstExtraTick: firstExtra?.tick ?? null,
        },
      },
      lastMatchingTick,
      classification: 'setup',
      seriesLength: { node: node.length, chromium: chrome.length },
      exactWithin,
    };
  }

  return {
    match: true,
    firstDivergence: null,
    lastMatchingTick,
    classification: null,
    seriesLength: { node: node.length, chromium: chrome.length },
    exactWithin,
  };
}

/**
 * Binary-search the first differing tick between two dense tick→surface maps
 * over [lo, hi] (inclusive), when only endpoint checkpoints are known to differ.
 * Caller supplies getSurface(runtime, tick) via precomputed maps for offline use.
 *
 * @param {Map<number, object>|object[]} nodeByTick
 * @param {Map<number, object>|object[]} chromiumByTick
 * @param {{ lo: number, hi: number }} range
 */
export function localizeFirstDivergingTick(nodeByTick, chromiumByTick, range) {
  let lo = range.lo | 0;
  let hi = range.hi | 0;
  const get = (src, tick) => {
    if (src instanceof Map) return src.get(tick);
    if (Array.isArray(src)) return src.find((p) => (p.tick | 0) === tick)?.surface ?? src[tick];
    return src[tick];
  };

  // Ensure endpoints: find first mid where surfaces differ after lo matched.
  while (lo < hi) {
    const mid = (lo + Math.floor((hi - lo) / 2)) | 0;
    if (mid === lo) break;
    const a = get(nodeByTick, mid);
    const b = get(chromiumByTick, mid);
    if (surfacesEqual(a, b)) lo = mid;
    else hi = mid;
  }

  const a = get(nodeByTick, hi);
  const b = get(chromiumByTick, hi);
  const fieldDiff = a && b ? firstDifferingField(a, b, '') : null;
  return {
    tick: hi,
    lastMatchingTick: lo,
    field: fieldDiff ? fieldDiff.path : null,
    nodeValue: fieldDiff ? fieldDiff.left : a,
    chromiumValue: fieldDiff ? fieldDiff.right : b,
    raw: fieldDiff
      ? { path: fieldDiff.path, node: fieldDiff.left, chromium: fieldDiff.right }
      : { node: a, chromium: b },
  };
}

/**
 * Classify a divergence for the report (profile/manifest/order/setup/input/entropy/
 * physics/observer/presentation/unsupported-exactness).
 */
export function classifyDivergence({ field, nodePoint, chromiumPoint } = {}) {
  const path = field || '';
  if (!path && nodePoint && chromiumPoint) {
    if (nodePoint.hash && chromiumPoint.hash && nodePoint.hash !== chromiumPoint.hash) {
      return 'unsupported-exactness';
    }
  }
  if (path.startsWith('runtime.profile') || path.startsWith('runtime.manifest')) return 'profile';
  if (path === 'scenarioDigest' || path === 'inputDigest') return 'setup';
  if (path.startsWith('input.')) return 'input';
  if (path.includes('entities') && (path.includes('.pos') || path.includes('.vel') || path.includes('.rot'))) {
    return 'physics';
  }
  if (path.includes('tether') || path.includes('hull') || path.includes('mass')) return 'physics';
  if (path.includes('presentation') || path.includes('vfx') || path.includes('audio')) return 'presentation';
  if (path.includes('rng') || path === 'seed') return 'entropy';
  if (path === 'tick' || path === 'simTime') return 'order';
  // Cross-runtime covered hash mismatch without a finer field → not exact-by-claim.
  return 'unsupported-exactness';
}

export function firstDifferingField(left, right, prefix = '') {
  if (Object.is(left, right)) return null;
  const lt = left === null ? 'null' : typeof left;
  const rt = right === null ? 'null' : typeof right;
  if (lt !== rt) {
    return { path: prefix || '(root)', left, right };
  }
  if (lt !== 'object') {
    // Number: record raw difference even when tiny (do not collapse to equal).
    if (lt === 'number' && Number.isFinite(left) && Number.isFinite(right)) {
      if (left === right) return null;
      return { path: prefix || '(root)', left, right, delta: right - left };
    }
    if (left === right) return null;
    return { path: prefix || '(root)', left, right };
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return { path: prefix || '(root)', left, right };
    }
    for (let i = 0; i < left.length; i++) {
      const d = firstDifferingField(left[i], right[i], `${prefix}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  const sorted = [...keys].sort();
  for (const key of sorted) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!(key in (left || {}))) return { path, left: undefined, right: right[key] };
    if (!(key in (right || {}))) return { path, left: left[key], right: undefined };
    const d = firstDifferingField(left[key], right[key], path);
    if (d) return d;
  }
  return null;
}

function surfacesEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return firstDifferingField(a, b, '') == null;
}

function guessCandidateWriters(fieldPath) {
  if (!fieldPath) return ['unknown'];
  if (fieldPath.startsWith('input.')) return ['input', 'inputTape', 'masslineInputGrammar'];
  if (fieldPath.includes('.pos') || fieldPath.includes('.vel') || fieldPath.includes('.rot')) {
    return ['physics', 'flightV3', 'physicsAuthority'];
  }
  if (fieldPath.includes('tether')) return ['tetherGameplay', 'actions', 'combat.attachments'];
  if (fieldPath.includes('hull')) return ['combat', 'weapons', 'damage'];
  if (fieldPath.startsWith('runtime.')) return ['createAuthoritativeRuntime', 'resolveRuntimeManifest'];
  if (fieldPath.startsWith('player.credits')) return ['economy'];
  return ['authoritative-systems'];
}
