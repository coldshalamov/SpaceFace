/**
 * VP-220 propulsion acceptance contract (shared by browser + Electron captures).
 * Schema: spaceface.vp220PropulsionAcceptance.v1
 *
 * Pure helpers — no Playwright, no GPU. Used by:
 *   - scripts/capture-vp220-propulsion-acceptance.mjs (runtime capture + --self-test)
 *   - test/vp220-p3-acceptance-lifecycle.test.mjs (adversarial report validator)
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveThrusterRecipes,
  listThrusterRecipePacks,
  familyStructuralSignature,
} from '../../src/render/thruster/recipes/registry.js';

export const SCHEMA_ID = 'spaceface.vp220PropulsionAcceptance.v1';

/** Shipped whole-ship URL proven by check:assets:live. */
export const KESTREL_SHIPPED_GLB_URL = 'assets/ships/release/parts/wholeships/kestrel.glb';

/** Accepted live authoredAssetState values (not arbitrary strings). */
export const ACCEPTED_AUTHORED_STATES = Object.freeze(['authored', 'live-authored']);

/** 64-char hex digest (case-insensitive). */
export const SHA256_HEX_RE = /^[0-9a-fA-F]{64}$/;

/** Live ENGINE_PROFILES ids that the acceptance matrix must cover. */
export const REQUIRED_PROFILE_IDS = Object.freeze([
  'engine_ion_small',
  'engine_ion_twin',
  'engine_industrial',
  'engine_resonator',
  'engine_vector',
  'engine_plasma_ring',
]);

/**
 * Scenario contract shared by browser + Electron.
 * Each id is required in a complete acceptance report unless marked optional.
 */
export const SCENARIO_CONTRACT = Object.freeze([
  Object.freeze({
    id: 'idle',
    title: 'normal idle',
    requires: Object.freeze(['core', 'inner']),
    engineTrails: true,
    reducedMotion: false,
  }),
  Object.freeze({
    id: 'onset',
    title: 'initial onset',
    requires: Object.freeze(['core', 'inner']),
    engineTrails: true,
    reducedMotion: false,
  }),
  Object.freeze({
    id: 'sustain',
    title: 'sustain',
    requires: Object.freeze(['core', 'inner', 'sheath']),
    engineTrails: true,
    reducedMotion: false,
  }),
  Object.freeze({
    id: 'cruise',
    title: 'cruise',
    requires: Object.freeze(['core', 'inner', 'sheath']),
    engineTrails: true,
    reducedMotion: false,
  }),
  Object.freeze({
    id: 'boost',
    title: 'boost transition',
    requires: Object.freeze(['core', 'inner', 'sheath']),
    engineTrails: true,
    reducedMotion: false,
  }),
  Object.freeze({
    id: 'hard-turn-rcs',
    title: 'hard-turn RCS',
    requires: Object.freeze(['core', 'inner']),
    requiresRcs: true,
    engineTrails: true,
    reducedMotion: false,
  }),
  Object.freeze({
    id: 'brake-reverse',
    title: 'brake/reverse',
    requires: Object.freeze(['core']),
    engineTrails: true,
    reducedMotion: false,
  }),
  Object.freeze({
    id: 'compact-trails-off',
    title: 'engineTrails=false compact',
    requires: Object.freeze(['core', 'inner']),
    /** Sheath/vapor may sleep; core+inner MUST stay active GPU batches. */
    forbidsSheathOnly: true,
    engineTrails: false,
    reducedMotion: false,
  }),
  Object.freeze({
    id: 'reduced-motion-flash',
    title: 'reduced-motion+flash',
    requires: Object.freeze(['core', 'inner']),
    engineTrails: true,
    reducedMotion: true,
  }),
  Object.freeze({
    id: 'dense-multi-family',
    title: 'dense multi-family',
    requires: Object.freeze(['core', 'inner']),
    requiresAllProfiles: true,
    engineTrails: true,
    reducedMotion: false,
  }),
  Object.freeze({
    id: 'release',
    title: 'release',
    requires: Object.freeze(['core']),
    engineTrails: true,
    reducedMotion: false,
  }),
  Object.freeze({
    id: 'cleanup',
    title: 'reset/cleanup',
    requiresCleanup: true,
    engineTrails: true,
    reducedMotion: false,
  }),
]);

/** Runtime files whose SHA-256 identity is required in the report. */
export const RUNTIME_HASH_PATHS = Object.freeze([
  'src/render/vfx.js',
  'src/render/vfxProfiles.js',
  'src/render/thruster/systems/continuousPlume.js',
  'src/render/thruster/systems/familyFleet.js',
  'src/render/thruster/systems/rcsImpulse.js',
  'src/render/thruster/systems/throttleResponse.js',
  'src/render/thruster/recipes/registry.js',
  'src/render/thruster/recipes/familyRecipes.js',
  'src/render/thruster/recipes/kestrelRecipes.js',
  'src/render/thruster/geometry/segmentedPlumeGeometry.js',
  'src/render/thruster/materials/flowFlipbookMaterial.js',
]);

export const MIN_CORE_INTENSITY = 2.5;
export const MIN_INNER_INTENSITY = 3.5;
export const MIN_CORE_OPACITY = 0.35;
export const MIN_INNER_OPACITY = 0.45;
export const MIN_RCS_DRAW = 1;

/** Required artifact metadata fields (nonempty; structural, not aesthetic). */
export const ARTIFACT_META_FIELDS = Object.freeze([
  'path',
  'runtime',
  'scenario',
  'width',
  'height',
  'bytes',
  'sha256',
  'candidateHash',
]);

/** Ordered lifecycle phase frame keys (must be distinct ascending frame indices). */
export const LIFECYCLE_PHASE_ORDER = Object.freeze([
  'onset',
  'growth',
  'sustain',
  'transition',
  'release',
  'cleanup',
]);

/** Runtimes that must publish a complete temporal still matrix on a full package. */
export const TEMPORAL_RUNTIMES = Object.freeze(['browser', 'electron']);

/** Required temporal still metadata fields. */
export const TEMPORAL_STILL_META_FIELDS = Object.freeze([
  'path',
  'runtime',
  'phase',
  'frame',
  'timestamp',
  'width',
  'height',
  'bytes',
  'sha256',
  'candidateHash',
]);

/**
 * Structural signature keys derived from registry recipes.
 * activeRoles (array) + geometryType (string) validated separately from scalars.
 */
export const STRUCTURAL_SIGNATURE_SCALAR_FIELDS = Object.freeze([
  'segments',
  'aspectRatio',
  'fork',
  'baseFlow',
  'driveRise',
  'driveFall',
  'swirl',
  'taper',
  'boostRise',
]);

/** @deprecated Use STRUCTURAL_SIGNATURE_SCALAR_FIELDS + activeRoles/geometryType. */
export const STRUCTURAL_SIGNATURE_FIELDS = STRUCTURAL_SIGNATURE_SCALAR_FIELDS;

/** Allocation sample array keys that must be real finite arrays with all zeros + matching maxima. */
export const ALLOCATION_SAMPLE_KEYS = Object.freeze([
  Object.freeze({ samples: 'plumeSamples', max: 'plumeMax', label: 'plume' }),
  Object.freeze({ samples: 'rcsSamples', max: 'rcsMax', label: 'rcs' }),
  Object.freeze({ samples: 'fleetSamples', max: 'fleetMax', label: 'fleet' }),
  Object.freeze({ samples: 'denseSamples', max: 'denseMax', label: 'dense' }),
]);

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isPositiveFinite(v) {
  return Number.isFinite(v) && Number(v) > 0;
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
export function isSha256Hex(v) {
  return typeof v === 'string' && SHA256_HEX_RE.test(v);
}

/**
 * Derive structural signature from a live registry recipe (no fabrication).
 * Missing fields are null so validators fail closed.
 * @param {string} profileId
 * @param {object} [mainRecipe]
 */
export function deriveStructuralSignature(profileId, mainRecipe = null) {
  const pack = mainRecipe
    ? { main: mainRecipe }
    : resolveThrusterRecipes(profileId);
  const main = pack?.main || null;
  if (!main) {
    return {
      activeRoles: null,
      geometryType: null,
      segments: null,
      aspectRatio: null,
      fork: null,
      baseFlow: null,
      driveRise: null,
      driveFall: null,
      swirl: null,
      taper: null,
      boostRise: null,
    };
  }
  const base = familyStructuralSignature(main);
  const geo = main.geometry || {};
  const layers = Array.isArray(main.layers) ? main.layers : [];
  const activeRoles = layers
    .filter((l) => l && l.enabled !== false && l.role)
    .map((l) => String(l.role));
  const segments = Number.isFinite(geo.segmentCount)
    ? geo.segmentCount
    : (main.quality?.high?.segments ?? null);
  return {
    activeRoles,
    geometryType: isNonEmptyString(geo.aspect) ? geo.aspect : (main.kind || null),
    segments: Number.isFinite(segments) ? segments : null,
    aspectRatio: Number.isFinite(base.aspectRatio) ? base.aspectRatio : null,
    fork: Number.isFinite(base.fork) ? base.fork : null,
    baseFlow: Number.isFinite(base.baseFlow) ? base.baseFlow : null,
    driveRise: Number.isFinite(base.driveRise) ? base.driveRise : null,
    driveFall: Number.isFinite(base.driveFall) ? base.driveFall : null,
    swirl: Number.isFinite(base.swirl) ? base.swirl : null,
    taper: Number.isFinite(base.taper) ? base.taper : null,
    boostRise: Number.isFinite(base.boostRise) ? base.boostRise : null,
  };
}

/**
 * Build family matrix entries from the live registry.
 */
export function buildRegistryFamilyMatrix() {
  return listThrusterRecipePacks().map((pack) => ({
    profileId: pack.profileId,
    mainRecipeId: pack.main?.id || null,
    rcsRecipeId: pack.rcs?.id || null,
    structuralSignature: deriveStructuralSignature(pack.profileId, pack.main),
    sockets: null, // filled by live capture; self-test supplies fixtures
    source: 'registry',
  }));
}

/**
 * Socket is a placeholder if flagged, named as such, or missing finite transforms.
 * @param {object} sock
 */
export function isPlaceholderSocket(sock) {
  if (!sock || typeof sock !== 'object') return true;
  if (sock.placeholder === true) return true;
  const label = String(sock.id || sock.name || sock.label || '').toLowerCase();
  if (label.includes('placeholder') || label === 'todo' || label === 'tbd') return true;
  const nums = [sock.x, sock.y, sock.z, sock.ax, sock.ay, sock.az];
  if (nums.some((n) => n === undefined || n === null || !Number.isFinite(Number(n)))) return true;
  // Direction must be a real unit-ish vector (non-zero axis); zero axis is placeholder.
  const ax = Number(sock.ax);
  const ay = Number(sock.ay);
  const az = Number(sock.az);
  if (ax === 0 && ay === 0 && az === 0) return true;
  return false;
}

/**
 * Validate a finite nonempty socket transform list (main or RCS).
 * @param {unknown} sockets
 * @param {string} label
 * @returns {string[]}
 */
export function validateSocketTransforms(sockets, label) {
  const failures = [];
  if (!Array.isArray(sockets) || sockets.length === 0) {
    failures.push(`${label} sockets must be a nonempty array`);
    return failures;
  }
  for (let i = 0; i < sockets.length; i++) {
    const s = sockets[i];
    if (isPlaceholderSocket(s)) {
      failures.push(`${label} socket[${i}] is placeholder or missing finite transforms`);
      continue;
    }
    for (const k of ['x', 'y', 'z', 'ax', 'ay', 'az']) {
      if (!Number.isFinite(Number(s[k]))) {
        failures.push(`${label} socket[${i}].${k} must be finite`);
      }
    }
  }
  return failures;
}

/**
 * Compute SHA-256 hex for a file relative to repo root.
 * @param {string} root
 * @param {string} relPath
 */
export function hashRuntimeFile(root, relPath) {
  const full = path.join(root, relPath);
  if (!existsSync(full)) {
    return { path: relPath, sha256: null, missing: true };
  }
  const buf = readFileSync(full);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  return { path: relPath, sha256, missing: false, bytes: buf.length };
}

/**
 * @param {string} root
 * @returns {{ path: string, sha256: string|null, missing: boolean, bytes?: number }[]}
 */
export function hashAllRuntimeFiles(root) {
  return RUNTIME_HASH_PATHS.map((p) => hashRuntimeFile(root, p));
}

/**
 * Allowed public lifecycle triggers for cleanup capture evidence.
 * Private underscore helpers are never accepted.
 */
export const ALLOWED_CLEANUP_TRIGGERS = Object.freeze([
  'sector:enter',
  'save:loaded',
]);

/**
 * Build deterministic current-tree candidate identity.
 * Inputs: git HEAD + sorted path/sha256/bytes for every RUNTIME_HASH_PATHS entry
 * (exact current file contents via hashAllRuntimeFiles — no git diff shell).
 *
 * @param {string} root repo root
 * @param {string|null} [gitHead]
 * @param {{ runtimeHashes?: ReturnType<typeof hashAllRuntimeFiles> }} [opts]
 * @returns {{
 *   candidateHash: string,
 *   gitHead: string,
 *   runtimeHashes: ReturnType<typeof hashAllRuntimeFiles>,
 *   identityInputs: {
 *     scheme: string,
 *     gitHead: string,
 *     runtimeFiles: { path: string, sha256: string|null, bytes: number, missing: boolean }[],
 *   },
 * }}
 */
export function buildCurrentTreeCandidateIdentity(root, gitHead = null, opts = {}) {
  const head = isNonEmptyString(gitHead) ? String(gitHead) : 'unknown';
  const runtimeHashes = Array.isArray(opts.runtimeHashes)
    ? opts.runtimeHashes.slice()
    : hashAllRuntimeFiles(root);

  // Stable order: sorted by path (not package-map order) so dirty-tree identity is deterministic.
  const runtimeFiles = runtimeHashes
    .map((h) => ({
      path: String(h?.path || ''),
      sha256: h?.missing ? null : (h?.sha256 ?? null),
      bytes: Number.isFinite(h?.bytes) ? Number(h.bytes) : 0,
      missing: !!h?.missing,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const identityInputs = {
    scheme: 'vp220-candidate:v2:head+runtime-tree',
    gitHead: head,
    runtimeFiles,
  };

  const hasher = createHash('sha256');
  hasher.update('vp220-candidate:v2\n');
  hasher.update(`gitHead:${head}\n`);
  for (const f of runtimeFiles) {
    hasher.update(
      `file:${f.path}\0sha256:${f.sha256 || 'missing'}\0bytes:${f.bytes}\0missing:${f.missing ? 1 : 0}\n`,
    );
  }

  return {
    candidateHash: hasher.digest('hex'),
    gitHead: head,
    runtimeHashes,
    identityInputs,
  };
}

/**
 * Fail-closed projection measurement gate.
 * Accepts only positive measured screen-space lengthPx/widthPx + strictly positive pixel signal.
 * World-only, fallback, invented, or ratio-derived widths cannot pass.
 *
 * @param {unknown} projection
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function validateMeasuredProjection(projection) {
  const failures = [];
  if (!projection || typeof projection !== 'object') {
    return { ok: false, failures: ['missing projection measurements'] };
  }
  const proj = /** @type {Record<string, unknown>} */ (projection);

  const lengthPx = proj.lengthPx ?? proj.projectedLength;
  if (!isPositiveFinite(lengthPx)) {
    failures.push('projection length must be positive finite measured screen pixels');
  }

  const widthPx = proj.widthPx;
  // widthPx only — do not accept worldWidth / projectedWidth as substitutes.
  if (!isPositiveFinite(widthPx)) {
    failures.push('projection widthPx must be positive finite measured screen pixels');
  }

  const source = String(proj.widthSource ?? proj.widthOrigin ?? proj.measurementSource ?? '');
  if (source) {
    const badSource = /world|fallback|invented|ratio|approximate|derived-from-length/i.test(source);
    if (badSource) {
      failures.push(
        `projection widthSource must be measured screen pixels (rejected: ${source})`,
      );
    } else if (!/measured|screen|project/i.test(source)) {
      failures.push(
        `projection widthSource must declare measured screen projection (got ${source})`,
      );
    }
  }

  // Explicit anti-masquerade flags / world-only claims.
  if (proj.widthInvented === true || proj.inventedWidth === true || proj.widthFallback === true) {
    failures.push('projection width must not be invented or fallback');
  }
  if (proj.widthMeasured === false || proj.measured === false) {
    failures.push('projection width must be measured (measured flag is false)');
  }
  // World-only: positive worldWidth with missing/non-positive measured widthPx already fails above;
  // also reject when report tries to pass world units as widthPx without measurement provenance
  // while declaring widthSource=world (handled) or widthPx === worldWidth with onlyWorld claim.
  if (proj.worldOnly === true || proj.widthIsWorld === true) {
    failures.push('world-only projection width cannot pass (screen-space widthPx required)');
  }
  if (
    isPositiveFinite(proj.worldWidth)
    && isPositiveFinite(widthPx)
    && Number(widthPx) === Number(proj.worldWidth)
    && proj.widthMeasured !== true
    && proj.measured !== true
    && !/measured|screen/i.test(source)
  ) {
    failures.push(
      'projection widthPx equals worldWidth without measured provenance (world-only rejected)',
    );
  }

  const signal = proj.pixelSignal ?? proj.nonzeroPixels ?? proj.signal;
  if (!Number.isFinite(signal) || !(Number(signal) > 0)) {
    failures.push('projection pixel signal must be finite and strictly positive');
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Hash an absolute file path (for capture artifact recording).
 * @param {string} absPath
 */
export function hashFileAbsolute(absPath) {
  if (!existsSync(absPath)) {
    return { path: absPath, sha256: null, missing: true, bytes: 0 };
  }
  const st = statSync(absPath);
  if (!st.isFile() || st.size <= 0) {
    return { path: absPath, sha256: null, missing: false, empty: true, bytes: st.size || 0 };
  }
  const buf = readFileSync(absPath);
  return {
    path: absPath,
    sha256: createHash('sha256').update(buf).digest('hex'),
    missing: false,
    empty: false,
    bytes: buf.length,
  };
}

/**
 * Resolve artifact path strictly under artifactRoot. Rejects traversal / outside-root.
 * @param {string} artifactRoot
 * @param {string} artifactPath
 * @returns {{ ok: true, resolved: string, relative: string } | { ok: false, reason: string }}
 */
export function resolveArtifactUnderRoot(artifactRoot, artifactPath) {
  if (!isNonEmptyString(artifactRoot)) {
    return { ok: false, reason: 'artifactRoot must be a nonempty string' };
  }
  if (!isNonEmptyString(artifactPath)) {
    return { ok: false, reason: 'artifact path must be nonempty' };
  }
  const root = path.resolve(artifactRoot);
  const raw = String(artifactPath);
  // Explicit traversal tokens (posix or windows) are always rejected.
  if (/(^|[\\/])\.\.([\\/]|$)/.test(raw)) {
    return { ok: false, reason: `path traversal rejected: ${raw}` };
  }
  const resolved = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(root, raw);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: `artifact outside root: ${raw}` };
  }
  return { ok: true, resolved, relative: rel.replace(/\\/g, '/') };
}

/**
 * Verify one artifact metadata entry against disk under artifactRoot.
 * @param {object} artifact
 * @param {string} artifactRoot
 * @param {string} label
 * @returns {string[]}
 */
export function verifyArtifactOnDisk(artifact, artifactRoot, label = 'artifact') {
  const failures = [];
  if (!artifact || typeof artifact !== 'object') {
    failures.push(`${label} is not an object`);
    return failures;
  }
  const loc = resolveArtifactUnderRoot(artifactRoot, artifact.path);
  if (!loc.ok) {
    failures.push(`${label}: ${loc.reason}`);
    return failures;
  }
  if (!existsSync(loc.resolved)) {
    failures.push(`${label}: missing file on disk (${loc.relative})`);
    return failures;
  }
  let st;
  try {
    st = statSync(loc.resolved);
  } catch (err) {
    failures.push(`${label}: cannot stat ${loc.relative}: ${err?.message || err}`);
    return failures;
  }
  if (!st.isFile()) {
    failures.push(`${label}: not a file (${loc.relative})`);
    return failures;
  }
  if (!(st.size > 0)) {
    failures.push(`${label}: zero-byte file (${loc.relative})`);
    return failures;
  }
  const buf = readFileSync(loc.resolved);
  const diskBytes = buf.length;
  const diskSha = createHash('sha256').update(buf).digest('hex');
  if (Number(artifact.bytes) !== diskBytes) {
    failures.push(
      `${label}: bytes mismatch report=${artifact.bytes} disk=${diskBytes} (${loc.relative})`,
    );
  }
  if (!isSha256Hex(artifact.sha256)
    || String(artifact.sha256).toLowerCase() !== diskSha.toLowerCase()) {
    failures.push(
      `${label}: sha256 mismatch report=${artifact.sha256} disk=${diskSha} (${loc.relative})`,
    );
  }
  return failures;
}

/**
 * Layer role snapshot used by validators and capture diagnostics.
 * Intensity/opacity preserve non-finite values so validators can reject them;
 * drawCount never legitimizes missing or non-positive brightness.
 * @param {{ role: string, drawCount?: number, intensity?: number, opacity?: number, meshCount?: number }} layer
 */
export function normalizeLayer(layer) {
  if (!layer || typeof layer !== 'object') return null;
  const role = String(layer.role || '');
  const rawDraw = Number(layer.drawCount ?? layer.meshCount ?? 0);
  const drawCount = Number.isFinite(rawDraw) ? rawDraw : 0;
  // Do not coerce NaN/Infinity via `|| 0` — assertReadableCoreInner must see them.
  const intensity = layer.intensity === undefined || layer.intensity === null
    ? 0
    : Number(layer.intensity);
  const opacity = layer.opacity === undefined || layer.opacity === null
    ? 0
    : Number(layer.opacity);
  return { role, drawCount, intensity, opacity };
}

/**
 * Reject faint sheath-only identity: core+inner must be active and bright enough.
 * Non-finite or <=0 intensity/opacity fail even when drawCount > 0 (drawCount
 * must not bypass readability).
 * @param {Array} layers
 * @param {{ requireSheath?: boolean, compact?: boolean }} [opts]
 */
export function assertReadableCoreInner(layers, opts = {}) {
  const failures = [];
  const list = (layers || []).map(normalizeLayer).filter(Boolean);
  const byRole = Object.create(null);
  for (const l of list) byRole[l.role] = l;

  const core = byRole.core;
  const inner = byRole.inner;
  if (!core || !(core.drawCount > 0)) {
    failures.push('missing active core GPU batch');
  } else {
    if (!Number.isFinite(core.intensity) || core.intensity <= 0) {
      failures.push(`core intensity non-finite or non-positive (${core.intensity})`);
    } else if (core.intensity < MIN_CORE_INTENSITY) {
      failures.push(`core intensity too faint (${core.intensity} < ${MIN_CORE_INTENSITY})`);
    }
    if (!Number.isFinite(core.opacity) || core.opacity <= 0) {
      failures.push(`core opacity non-finite or non-positive (${core.opacity})`);
    } else if (core.opacity < MIN_CORE_OPACITY) {
      failures.push(`core opacity too faint (${core.opacity} < ${MIN_CORE_OPACITY})`);
    }
  }
  if (!inner || !(inner.drawCount > 0)) {
    failures.push('missing active inner GPU batch');
  } else {
    if (!Number.isFinite(inner.intensity) || inner.intensity <= 0) {
      failures.push(`inner intensity non-finite or non-positive (${inner.intensity})`);
    } else if (inner.intensity < MIN_INNER_INTENSITY) {
      failures.push(`inner intensity too faint (${inner.intensity} < ${MIN_INNER_INTENSITY})`);
    }
    if (!Number.isFinite(inner.opacity) || inner.opacity <= 0) {
      failures.push(`inner opacity non-finite or non-positive (${inner.opacity})`);
    } else if (inner.opacity < MIN_INNER_OPACITY) {
      failures.push(`inner opacity too faint (${inner.opacity} < ${MIN_INNER_OPACITY})`);
    }
  }

  if (opts.compact) {
    // Compact must keep core+inner; sheath-only claims fail even if drawCount is high.
    const sheathOnly = (!core || core.drawCount === 0)
      && (!inner || inner.drawCount === 0)
      && byRole.sheath
      && byRole.sheath.drawCount > 0;
    if (sheathOnly) failures.push('compact mode produced sheath-only output');
  }

  if (opts.requireSheath) {
    const sheath = byRole.sheath;
    if (!sheath || !(sheath.drawCount > 0)) {
      failures.push('missing active sheath GPU batch');
    }
  }

  return { ok: failures.length === 0, failures, byRole };
}

/**
 * Build an empty report skeleton (runtime fill-in later).
 * @param {object} partial
 */
export function createReportSkeleton(partial = {}) {
  return {
    schema: SCHEMA_ID,
    ok: false,
    blocked: partial.blocked || null,
    prepareOnly: partial.prepareOnly || false,
    runtime: partial.runtime || null, // 'browser' | 'electron' | 'self-test' | 'prepare-only'
    gitHead: partial.gitHead || null,
    generatedAt: partial.generatedAt || new Date().toISOString(),
    baseUrl: partial.baseUrl || null,
    viewport: partial.viewport || { width: 1440, height: 900 },
    candidateHash: partial.candidateHash || null,
    runtimeHashes: partial.runtimeHashes || [],
    scenarioContract: SCENARIO_CONTRACT.map((s) => s.id),
    requiredProfiles: REQUIRED_PROFILE_IDS.slice(),
    scenarios: [],
    families: [],
    artifacts: partial.artifacts || [],
    temporalMatrices: partial.temporalMatrices || {
      browser: null,
      electron: null,
    },
    lifecycle: {
      release: null,
      cleanup: null,
      phaseFrames: null,
    },
    projection: partial.projection || null,
    kestrel: partial.kestrel || null,
    fixtureSource: partial.fixtureSource || null,
    video: partial.video || null,
    gpu: {
      vendor: null,
      renderer: null,
      software: null,
      calls: null,
      triangles: null,
      geometries: null,
      textures: null,
      programs: null,
    },
    allocations: {
      plumeFrameAllocations: null,
      rcsFrameAllocations: null,
      fleetFrameAllocations: null,
      denseSweepFrameAllocationsMax: null,
      plumeSamples: null,
      rcsSamples: null,
      fleetSamples: null,
      denseSamples: null,
      plumeMax: null,
      rcsMax: null,
      fleetMax: null,
      denseMax: null,
    },
    issues: [],
    visualStatus: partial.visualStatus || 'PENDING',
    ...partial,
  };
}

/**
 * Which temporal runtimes must be present for this report.
 * Self-test / combined packages require both; single-runtime captures require their own.
 * @param {object} report
 * @param {{ requiredTemporalRuntimes?: string[] }} [opts]
 */
export function requiredTemporalRuntimesFor(report, opts = {}) {
  if (Array.isArray(opts.requiredTemporalRuntimes) && opts.requiredTemporalRuntimes.length) {
    return opts.requiredTemporalRuntimes.slice();
  }
  const rt = report?.runtime;
  if (rt === 'browser' || rt === 'electron') return [rt];
  return TEMPORAL_RUNTIMES.slice();
}

/**
 * Validate temporal artifact matrices (metadata). Disk checks are separate when artifactRoot set.
 * @param {object} report
 * @param {string[]} requiredRuntimes
 * @returns {string[]}
 */
export function validateTemporalMatrices(report, requiredRuntimes) {
  const failures = [];
  const matrices = report?.temporalMatrices || report?.lifecycle?.temporalMatrices || null;
  if (!matrices || typeof matrices !== 'object') {
    failures.push('missing temporalMatrices (browser/electron ordered phase stills required)');
    return failures;
  }

  for (const runtime of requiredRuntimes) {
    const matrix = matrices[runtime];
    if (!matrix || typeof matrix !== 'object') {
      failures.push(`missing temporal matrix for runtime ${runtime}`);
      continue;
    }
    let prevFrame = -Infinity;
    let prevTs = -Infinity;
    const pathsSeen = new Set();
    for (const phase of LIFECYCLE_PHASE_ORDER) {
      const still = matrix[phase];
      if (!still || typeof still !== 'object') {
        failures.push(`temporal matrix ${runtime} missing phase ${phase}`);
        continue;
      }
      if (still.phase != null && still.phase !== phase) {
        failures.push(
          `temporal matrix ${runtime}.${phase} phase identity mismatch (got ${still.phase})`,
        );
      }
      if (still.runtime != null && still.runtime !== runtime) {
        failures.push(
          `temporal matrix ${runtime}.${phase} runtime mismatch (got ${still.runtime})`,
        );
      }
      if (!isNonEmptyString(still.path)) {
        failures.push(`temporal matrix ${runtime}.${phase} path must be nonempty`);
      } else {
        const norm = String(still.path).replace(/\\/g, '/');
        if (!norm.includes(`/${runtime}/`) && !norm.startsWith(`${runtime}/`)) {
          failures.push(
            `temporal matrix ${runtime}.${phase} path not runtime-scoped: ${still.path}`,
          );
        }
        if (pathsSeen.has(norm)) {
          failures.push(`temporal matrix ${runtime} path collides: ${still.path}`);
        }
        pathsSeen.add(norm);
      }
      if (!Number.isFinite(still.frame)) {
        failures.push(`temporal matrix ${runtime}.${phase} frame must be finite`);
      } else if (!(still.frame > prevFrame)) {
        failures.push(
          `temporal matrix ${runtime} frames must be strictly increasing; ${phase}=${still.frame}`,
        );
      } else {
        prevFrame = still.frame;
      }
      if (!Number.isFinite(still.timestamp)) {
        failures.push(`temporal matrix ${runtime}.${phase} timestamp must be finite`);
      } else if (!(still.timestamp > prevTs)) {
        failures.push(
          `temporal matrix ${runtime} timestamps must be strictly increasing; ${phase}=${still.timestamp}`,
        );
      } else {
        prevTs = still.timestamp;
      }
      if (!isPositiveFinite(still.width)) {
        failures.push(`temporal matrix ${runtime}.${phase} width must be positive finite`);
      }
      if (!isPositiveFinite(still.height)) {
        failures.push(`temporal matrix ${runtime}.${phase} height must be positive finite`);
      }
      if (!isPositiveFinite(still.bytes)) {
        failures.push(`temporal matrix ${runtime}.${phase} bytes must be positive finite`);
      }
      if (!isSha256Hex(still.sha256)) {
        failures.push(`temporal matrix ${runtime}.${phase} sha256 must be 64 hex chars`);
      }
      if (!isNonEmptyString(still.candidateHash) || String(still.candidateHash).length < 8) {
        failures.push(`temporal matrix ${runtime}.${phase} candidateHash must be nonempty`);
      } else if (
        isNonEmptyString(report.candidateHash)
        && still.candidateHash !== report.candidateHash
      ) {
        failures.push(`temporal matrix ${runtime}.${phase} candidateHash mismatch vs report`);
      }
    }
  }
  return failures;
}

/**
 * Fail-closed report validator for spaceface.vp220PropulsionAcceptance.v1
 * @param {object} report
 * @param {{
 *   allowBlockedVisual?: boolean,
 *   artifactRoot?: string|null,
 *   requiredTemporalRuntimes?: string[],
 * }} [opts]
 */
export function validateVp220PropulsionReport(report, opts = {}) {
  const failures = [];
  if (!report || typeof report !== 'object') {
    return { ok: false, failures: ['report is not an object'] };
  }

  if (report.schema !== SCHEMA_ID) {
    failures.push(`schema must be ${SCHEMA_ID}, got ${JSON.stringify(report.schema)}`);
  }

  if (!report.gitHead || typeof report.gitHead !== 'string' || report.gitHead.length < 7) {
    failures.push('missing gitHead identity');
  }

  // Prepare-only is a staged blocked package: never validates as complete evidence.
  const prepareOnlyBlocked = !!(
    report.prepareOnly
    || report.blocked
    || report.visualStatus === 'BLOCKED_BY_OCCUPIED_LARK_GPU_LEASE'
    || report.visualStatus === 'PREPARE_ONLY_BLOCKED'
    || report.runtime === 'prepare-only'
  );
  if (prepareOnlyBlocked || report.prepareOnly) {
    failures.push(
      'prepare-only/blocked report is staged incomplete evidence (validation remains ok:false)',
    );
  }

  const allowBlockedVisual = !!(opts.allowBlockedVisual || prepareOnlyBlocked);

  const hashes = Array.isArray(report.runtimeHashes) ? report.runtimeHashes : [];
  if (hashes.length < RUNTIME_HASH_PATHS.length) {
    failures.push(`runtimeHashes incomplete (${hashes.length} < ${RUNTIME_HASH_PATHS.length})`);
  }
  for (const required of RUNTIME_HASH_PATHS) {
    const entry = hashes.find((h) => h && h.path === required);
    if (!entry) {
      failures.push(`missing runtime hash for ${required}`);
      continue;
    }
    if (entry.missing || !isSha256Hex(entry.sha256)) {
      failures.push(`invalid/missing sha256 for ${required}`);
    }
  }

  // Candidate hash identity (report-level; artifacts must match when present)
  if (!isNonEmptyString(report.candidateHash) || String(report.candidateHash).length < 8) {
    failures.push('missing or empty candidateHash');
  }

  // ── Artifacts: required nonempty metadata, runtime-scoped non-colliding paths ──
  const artifacts = Array.isArray(report.artifacts) ? report.artifacts : [];
  if (artifacts.length === 0) {
    failures.push('missing artifacts metadata (required nonempty evidence)');
  }
  const pathsSeen = new Set();
  const runtimePathKeys = new Set();
  for (let i = 0; i < artifacts.length; i++) {
    const a = artifacts[i];
    if (!a || typeof a !== 'object') {
      failures.push(`artifact[${i}] is not an object`);
      continue;
    }
    for (const field of ARTIFACT_META_FIELDS) {
      const v = a[field];
      if (field === 'width' || field === 'height' || field === 'bytes') {
        if (!isPositiveFinite(v)) {
          failures.push(`artifact[${i}].${field} must be positive finite (got ${v})`);
        }
      } else if (field === 'sha256') {
        if (!isSha256Hex(v)) {
          failures.push(`artifact[${i}].sha256 must be 64 hex chars`);
        }
      } else if (!isNonEmptyString(v) && !(typeof v === 'number' && Number.isFinite(v))) {
        if (!isNonEmptyString(v)) {
          failures.push(`artifact[${i}].${field} must be nonempty`);
        }
      }
    }
    if (isNonEmptyString(a.path)) {
      if (pathsSeen.has(a.path)) {
        failures.push(`artifact path collides globally: ${a.path}`);
      }
      pathsSeen.add(a.path);
      if (isNonEmptyString(a.runtime)) {
        const rk = `${a.runtime}::${a.path}`;
        if (runtimePathKeys.has(rk)) {
          failures.push(`artifact path collides within runtime ${a.runtime}: ${a.path}`);
        }
        runtimePathKeys.add(rk);
        // Runtime-scoped: path should be namespaced under runtime segment
        const norm = String(a.path).replace(/\\/g, '/');
        if (!norm.includes(`/${a.runtime}/`) && !norm.startsWith(`${a.runtime}/`)) {
          failures.push(`artifact path not runtime-scoped for ${a.runtime}: ${a.path}`);
        }
      }
    }
    if (
      isNonEmptyString(report.candidateHash)
      && isNonEmptyString(a.candidateHash)
      && a.candidateHash !== report.candidateHash
    ) {
      failures.push(`artifact[${i}] candidateHash mismatch vs report`);
    }
  }

  // ── Temporal matrices (required motion evidence; phaseFrames alone insufficient) ──
  const requiredTemporal = requiredTemporalRuntimesFor(report, opts);
  for (const f of validateTemporalMatrices(report, requiredTemporal)) {
    failures.push(f);
  }

  // ── Ordered distinct lifecycle phase frames (summary; must agree with matrices when present) ──
  const phaseFrames = report.lifecycle?.phaseFrames || report.phaseFrames || null;
  if (!phaseFrames || typeof phaseFrames !== 'object') {
    failures.push('missing lifecycle phaseFrames (onset/growth/sustain/transition/release/cleanup)');
  } else {
    let prev = -Infinity;
    const seen = new Set();
    for (const phase of LIFECYCLE_PHASE_ORDER) {
      const frame = phaseFrames[phase];
      if (!Number.isFinite(frame)) {
        failures.push(`lifecycle phaseFrames.${phase} must be finite frame index`);
        continue;
      }
      if (seen.has(frame)) {
        failures.push(`lifecycle phaseFrames must be distinct; duplicate frame ${frame}`);
      }
      seen.add(frame);
      if (!(frame > prev)) {
        failures.push(
          `lifecycle phaseFrames must be strictly ordered; ${phase}=${frame} not after previous`,
        );
      }
      prev = frame;
    }
  }

  // ── Optional artifactRoot disk verification ──
  if (isNonEmptyString(opts.artifactRoot)) {
    const root = opts.artifactRoot;
    for (let i = 0; i < artifacts.length; i++) {
      for (const f of verifyArtifactOnDisk(artifacts[i], root, `artifact[${i}]`)) {
        failures.push(f);
      }
    }
    const matrices = report.temporalMatrices || {};
    for (const runtime of requiredTemporal) {
      const matrix = matrices[runtime];
      if (!matrix || typeof matrix !== 'object') continue;
      for (const phase of LIFECYCLE_PHASE_ORDER) {
        const still = matrix[phase];
        if (!still) continue;
        for (const f of verifyArtifactOnDisk(
          still,
          root,
          `temporalMatrices.${runtime}.${phase}`,
        )) {
          failures.push(f);
        }
      }
    }
  }

  // ── Projection: measured positive screen-space length/width + pixel signal ──
  // world-only / fallback / invented widthPx cannot pass (see validateMeasuredProjection).
  for (const f of validateMeasuredProjection(report.projection).failures) {
    failures.push(f);
  }

  // ── Family identity matrix + full structural signatures ──
  const families = Array.isArray(report.families) ? report.families : [];
  const familyIds = new Set(families.map((f) => f && f.profileId).filter(Boolean));
  for (const id of REQUIRED_PROFILE_IDS) {
    if (!familyIds.has(id)) failures.push(`missing family matrix entry for ${id}`);
  }
  for (const fam of families) {
    if (!fam) continue;
    const pid = fam.profileId || '?';
    if (!fam.mainRecipeId || !fam.rcsRecipeId) {
      failures.push(`family ${pid} missing recipe ids`);
    }
    const sig = fam.structuralSignature;
    if (!sig || typeof sig !== 'object') {
      failures.push(`family ${pid} missing structuralSignature (color-only identity forbidden)`);
    } else {
      if (!Array.isArray(sig.activeRoles) || sig.activeRoles.length === 0) {
        failures.push(`family ${pid} structuralSignature.activeRoles must be nonempty array`);
      }
      if (!isNonEmptyString(sig.geometryType)) {
        failures.push(`family ${pid} structuralSignature.geometryType must be nonempty`);
      }
      for (const field of STRUCTURAL_SIGNATURE_SCALAR_FIELDS) {
        const v = sig[field];
        if (!Number.isFinite(v)) {
          failures.push(`family ${pid} structuralSignature.${field} must be finite`);
        }
      }
    }
    if (fam.sockets && Array.isArray(fam.sockets)) {
      for (const f of validateSocketTransforms(fam.sockets, `family ${pid}`)) {
        failures.push(f);
      }
    }
  }

  // ── Kestrel authored state / URL / visual root + socket transforms ──
  const kestrel = report.kestrel || null;
  if (!kestrel || typeof kestrel !== 'object') {
    failures.push('missing kestrel authored identity block');
  } else {
    const authoredState = kestrel.authoredState ?? kestrel.authoredAssetState;
    if (!isNonEmptyString(authoredState)
      || !ACCEPTED_AUTHORED_STATES.includes(String(authoredState))) {
      failures.push(
        `kestrel.authoredState must be one of ${ACCEPTED_AUTHORED_STATES.join('|')} (got ${JSON.stringify(authoredState)})`,
      );
    }
    const url = kestrel.url ?? kestrel.assetUrl ?? kestrel.src;
    const normUrl = String(url || '').replace(/\\/g, '/').replace(/^\//, '');
    if (normUrl !== KESTREL_SHIPPED_GLB_URL) {
      failures.push(
        `kestrel url must be shipped GLB ${KESTREL_SHIPPED_GLB_URL} (got ${JSON.stringify(url)})`,
      );
    }
    const visualRoot = kestrel.visualRoot ?? kestrel.rootName ?? kestrel.meshRoot;
    if (!isNonEmptyString(visualRoot)) {
      failures.push('kestrel visualRoot must be nonempty');
    }
    for (const f of validateSocketTransforms(
      kestrel.mainSockets ?? kestrel.mainSocketTransforms,
      'kestrel main',
    )) {
      failures.push(f);
    }
    for (const f of validateSocketTransforms(
      kestrel.rcsSockets ?? kestrel.rcsSocketTransforms,
      'kestrel rcs',
    )) {
      failures.push(f);
    }
  }

  // ── Synthetic fixture must not be labeled authored ──
  const fixtureSource = report.fixtureSource ?? report.fixtureKind ?? null;
  const visualStatus = String(report.visualStatus || '');
  const isSynthetic = fixtureSource === 'synthetic'
    || visualStatus === 'SELF_TEST_SYNTHETIC'
    || report.runtime === 'self-test';
  if (isSynthetic) {
    if (fixtureSource === 'authored' || report.authored === true || report.labeledAuthored === true) {
      failures.push('synthetic fixture must not be labeled authored');
    }
    if (report.fixtureLabeledAuthored === true) {
      failures.push('synthetic fixture must not be labeled authored');
    }
    const kState = kestrel && (kestrel.authoredState ?? kestrel.authoredAssetState);
    if (kState && String(kState).toLowerCase() === 'fixture-authored-claim') {
      failures.push('synthetic fixture must not be labeled authored');
    }
  }

  // Scenarios
  const scenarios = Array.isArray(report.scenarios) ? report.scenarios : [];
  const byId = Object.create(null);
  for (const s of scenarios) {
    if (s && s.id) byId[s.id] = s;
  }

  for (const contract of SCENARIO_CONTRACT) {
    const s = byId[contract.id];
    if (!s) {
      failures.push(`missing required scenario ${contract.id}`);
      continue;
    }

    if (contract.requiresCleanup) {
      const cleanup = s.cleanup || report.lifecycle?.cleanup || null;
      if (!cleanup) {
        failures.push('cleanup scenario missing lifecycle cleanup snapshot');
      } else {
        const plumeCount = cleanup.plumeActiveCount ?? cleanup.meshCounts?.plume ?? null;
        const rcsCount = cleanup.rcsActiveCount ?? cleanup.meshCounts?.rcs ?? null;
        const ownership = cleanup.ownershipCount ?? cleanup.productionOwnedCount ?? null;
        const activeDraws = cleanup.activeDraws ?? cleanup.drawCount ?? cleanup.activeDrawCount ?? null;
        const activeInstances = cleanup.activeInstances
          ?? cleanup.instanceCount
          ?? cleanup.activeInstanceCount
          ?? null;
        if (plumeCount !== 0) failures.push(`cleanup plume active count must be 0, got ${plumeCount}`);
        if (rcsCount !== 0) failures.push(`cleanup rcs active count must be 0, got ${rcsCount}`);
        if (ownership !== 0) failures.push(`cleanup ownership must be 0, got ${ownership}`);
        if (activeDraws != null && activeDraws !== 0) {
          failures.push(`cleanup active draws must be 0, got ${activeDraws}`);
        }
        if (activeInstances != null && activeInstances !== 0) {
          failures.push(`cleanup active instances must be 0, got ${activeInstances}`);
        }
        // Fail-closed: require explicit zero active draws/instances fields when full report claims cleanup.
        if (activeDraws == null) {
          failures.push('cleanup missing activeDraws (must be 0)');
        }
        if (activeInstances == null) {
          failures.push('cleanup missing activeInstances (must be 0)');
        }
        for (const f of validateCleanupTrigger(
          cleanup.trigger ?? cleanup.lifecycleTrigger ?? report.lifecycle?.cleanup?.trigger,
        )) {
          failures.push(f);
        }
      }
      continue;
    }

    if (contract.requiresAllProfiles) {
      const live = s.liveProfiles || s.profilesActive || [];
      for (const id of REQUIRED_PROFILE_IDS) {
        if (!live.includes(id)) {
          failures.push(`dense scenario missing live profile ${id}`);
        }
      }
    }

    const layers = s.layers || s.plumeLayers || [];
    if (contract.requires && contract.requires.length) {
      const check = assertReadableCoreInner(layers, {
        compact: !!contract.forbidsSheathOnly || contract.engineTrails === false,
        requireSheath: contract.requires.includes('sheath'),
      });
      // For scenarios that only require core (brake/release), relax full core+inner if only core listed.
      if (contract.requires.includes('inner')) {
        for (const f of check.failures) {
          failures.push(`scenario ${contract.id}: ${f}`);
        }
      } else if (contract.requires.includes('core')) {
        const core = (layers || []).map(normalizeLayer).find((l) => l && l.role === 'core');
        if (!core || !(core.drawCount > 0)) {
          failures.push(`scenario ${contract.id}: missing active core GPU batch`);
        } else if (!Number.isFinite(core.intensity) || core.intensity <= 0
          || !Number.isFinite(core.opacity) || core.opacity <= 0) {
          // drawCount must not bypass intensity/opacity readability for core-only scenarios
          if (!Number.isFinite(core.intensity) || core.intensity <= 0) {
            failures.push(`scenario ${contract.id}: core intensity non-finite or non-positive`);
          }
          if (!Number.isFinite(core.opacity) || core.opacity <= 0) {
            failures.push(`scenario ${contract.id}: core opacity non-finite or non-positive`);
          }
        }
      }
    }

    if (contract.forbidsSheathOnly || contract.engineTrails === false) {
      const check = assertReadableCoreInner(layers, { compact: true });
      for (const f of check.failures) {
        failures.push(`scenario ${contract.id} (compact): ${f}`);
      }
    }

    if (contract.requiresRcs) {
      const rcs = s.rcs || s.rcsLayers || {};
      const rcsDraw = Number(rcs.drawCount ?? rcs.activeCount ?? 0) || 0;
      const rcsLayers = Array.isArray(rcs.layers) ? rcs.layers : [];
      const anyRcs = rcsDraw >= MIN_RCS_DRAW
        || rcsLayers.some((l) => (normalizeLayer(l)?.drawCount || 0) > 0)
        || (Array.isArray(rcs.instances) && rcs.instances.length > 0);
      if (!anyRcs) failures.push(`scenario ${contract.id}: missing readable RCS`);
    }

    if (s.frameAllocations != null && Number(s.frameAllocations) !== 0) {
      failures.push(`scenario ${contract.id}: frameAllocations must be 0, got ${s.frameAllocations}`);
    }
  }

  // GPU identity (required unless prepare-only / blocked visual)
  const gpu = report.gpu || {};
  if (!allowBlockedVisual) {
    if (gpu.vendor == null && gpu.renderer == null) {
      failures.push('missing GPU vendor/renderer identity');
    }
    if (gpu.calls == null && gpu.programs == null) {
      failures.push('missing GPU renderer calls/programs snapshot');
    }
  }

  // Allocation counters + real measured sample arrays/maxima (all zeros)
  const alloc = report.allocations || {};
  for (const key of ['plumeFrameAllocations', 'rcsFrameAllocations', 'fleetFrameAllocations']) {
    if (alloc[key] == null) {
      failures.push(`allocations.${key} must be recorded (null is fail-closed)`);
    } else if (Number(alloc[key]) !== 0) {
      failures.push(`allocations.${key} must be 0, got ${alloc[key]}`);
    }
  }
  if (alloc.denseSweepFrameAllocationsMax == null) {
    failures.push('allocations.denseSweepFrameAllocationsMax must be recorded (null is fail-closed)');
  } else if (Number(alloc.denseSweepFrameAllocationsMax) !== 0) {
    failures.push(
      `allocations.denseSweepFrameAllocationsMax must be 0, got ${alloc.denseSweepFrameAllocationsMax}`,
    );
  }
  for (const { samples: sampleKey, max: maxKey, label } of ALLOCATION_SAMPLE_KEYS) {
    const samples = alloc[sampleKey];
    const maxVal = alloc[maxKey];
    if (samples == null) {
      failures.push(`allocations.${sampleKey} missing (null is fail-closed)`);
      continue;
    }
    if (!Array.isArray(samples) || samples.length === 0) {
      failures.push(`allocations.${sampleKey} must be a nonempty real measured array`);
      continue;
    }
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      if (!Number.isFinite(v)) {
        failures.push(`allocations.${sampleKey}[${i}] must be finite`);
      } else if (v !== 0) {
        failures.push(`allocations.${sampleKey}[${i}] must be 0, got ${v}`);
      }
    }
    if (maxVal == null || !Number.isFinite(maxVal)) {
      failures.push(`allocations.${maxKey} must be finite (${label})`);
    } else if (maxVal !== 0) {
      failures.push(`allocations.${maxKey} must be 0, got ${maxVal}`);
    }
  }

  // Lifecycle cleanup at report root
  if (report.lifecycle?.cleanup) {
    const c = report.lifecycle.cleanup;
    if ((c.ownershipCount ?? c.productionOwnedCount ?? 0) !== 0) {
      failures.push('lifecycle.cleanup ownership not zero');
    }
    if ((c.activeDraws ?? 0) !== 0 && c.activeDraws != null) {
      failures.push('lifecycle.cleanup activeDraws not zero');
    }
    if ((c.activeInstances ?? 0) !== 0 && c.activeInstances != null) {
      failures.push('lifecycle.cleanup activeInstances not zero');
    }
    for (const f of validateCleanupTrigger(c.trigger ?? c.lifecycleTrigger)) {
      failures.push(f);
    }
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Require a public lifecycle bus trigger; reject private underscore helpers.
 * @param {unknown} trigger
 * @returns {string[]}
 */
export function validateCleanupTrigger(trigger) {
  const failures = [];
  if (!isNonEmptyString(trigger)) {
    failures.push(
      `cleanup trigger must be a public lifecycle event from allowed set (${ALLOWED_CLEANUP_TRIGGERS.join('|')})`,
    );
    return failures;
  }
  const text = String(trigger).trim();
  // Reject private helper text even if someone invents a creative label.
  if (
    text.startsWith('_')
    || /_resetEnergyForBoundary|_hideEnergyPlumes|private.?helper|underscore/i.test(text)
  ) {
    failures.push(
      `cleanup trigger must not be a private helper (got ${JSON.stringify(text)})`,
    );
  }
  if (!ALLOWED_CLEANUP_TRIGGERS.includes(text)) {
    failures.push(
      `cleanup trigger must be a public lifecycle event from allowed set (${ALLOWED_CLEANUP_TRIGGERS.join('|')}); got ${JSON.stringify(text)}`,
    );
  }
  return failures;
}

/**
 * Build metadata-only temporal matrices for self-test (no disk).
 * @param {string} candidateHash
 * @param {string} gitHead
 */
function buildSelfTestTemporalMatrices(candidateHash, gitHead) {
  const matrices = { browser: {}, electron: {} };
  for (const runtime of TEMPORAL_RUNTIMES) {
    let frame = runtime === 'browser' ? 10 : 1000;
    let timestamp = runtime === 'browser' ? 1.0 : 100.0;
    for (let i = 0; i < LIFECYCLE_PHASE_ORDER.length; i++) {
      const phase = LIFECYCLE_PHASE_ORDER[i];
      frame += 15 + i;
      timestamp += 0.25 + i * 0.01;
      matrices[runtime][phase] = {
        path: `${runtime}/temporal/${phase}.png`,
        runtime,
        phase,
        frame,
        timestamp,
        width: 1440,
        height: 900,
        bytes: 15000 + i * 200 + (runtime === 'electron' ? 50 : 0),
        sha256: createHash('sha256')
          .update(`temporal:${runtime}:${phase}:${gitHead}`)
          .digest('hex'),
        candidateHash,
      };
    }
  }
  return matrices;
}

/**
 * Synthetic good report for --self-test (no browser).
 * Intensities are realistic structural values, not aesthetic constants under test.
 * Metadata-only temporal matrices when artifactRoot is omitted at validate time.
 */
export function buildSelfTestGoodReport({ gitHead = '8f1c630fdeadbeef', root = null } = {}) {
  const runtimeHashes = root
    ? hashAllRuntimeFiles(root)
    : RUNTIME_HASH_PATHS.map((p) => ({
      path: p,
      sha256: createHash('sha256').update(p).digest('hex'),
      missing: false,
      bytes: 1,
    }));

  // Same current-tree identity helper as prepare/full capture (HEAD + runtime file digests).
  const identity = buildCurrentTreeCandidateIdentity(root || '.', gitHead, { runtimeHashes });
  const candidateHash = identity.candidateHash;

  const brightLayers = (roles) => roles.map((role) => ({
    role,
    drawCount: role === 'core' ? 2 : role === 'inner' ? 2 : 2,
    intensity: role === 'core' ? 8 : role === 'inner' ? 6 : 3.2,
    opacity: role === 'core' ? 0.85 : role === 'inner' ? 0.72 : 0.4,
  }));

  const families = buildRegistryFamilyMatrix().map((fam) => ({
    ...fam,
    sockets: [{ x: 0, y: -0.2, z: 1.4, ax: -1, ay: 0, az: 0 }],
    fixtureSource: 'synthetic',
  }));

  const runtime = 'self-test';
  const artifacts = SCENARIO_CONTRACT.filter((c) => !c.requiresCleanup).map((c, i) => ({
    path: `self-test/scenarios/${c.id}.png`,
    runtime: 'self-test',
    scenario: c.id,
    width: 1440,
    height: 900,
    bytes: 12000 + i * 100,
    sha256: createHash('sha256').update(`artifact:${c.id}:${gitHead}`).digest('hex'),
    candidateHash,
  }));

  const temporalMatrices = buildSelfTestTemporalMatrices(candidateHash, gitHead);
  // Also record temporal stills as artifacts for disk verification tests.
  for (const rt of TEMPORAL_RUNTIMES) {
    for (const phase of LIFECYCLE_PHASE_ORDER) {
      const still = temporalMatrices[rt][phase];
      artifacts.push({
        path: still.path,
        runtime: rt,
        scenario: phase,
        width: still.width,
        height: still.height,
        bytes: still.bytes,
        sha256: still.sha256,
        candidateHash,
        phase,
        frame: still.frame,
        timestamp: still.timestamp,
      });
    }
  }

  const zeroSamples = (n) => Array.from({ length: n }, () => 0);

  const scenarios = SCENARIO_CONTRACT.map((c) => {
    if (c.requiresCleanup) {
      return {
        id: c.id,
        title: c.title,
        layers: [],
        cleanup: {
          trigger: 'sector:enter',
          plumeActiveCount: 0,
          rcsActiveCount: 0,
          ownershipCount: 0,
          activeDraws: 0,
          activeInstances: 0,
          meshCounts: { plume: 0, rcs: 0 },
        },
        frameAllocations: 0,
      };
    }
    const layers = brightLayers(c.requires || ['core', 'inner']);
    const entry = {
      id: c.id,
      title: c.title,
      layers,
      frameAllocations: 0,
      settings: {
        engineTrails: c.engineTrails,
        motionReduce: c.reducedMotion,
      },
      screenshot: null,
    };
    if (c.requiresRcs) {
      entry.rcs = {
        drawCount: 2,
        activeCount: 2,
        layers: [{ role: 'core', drawCount: 2, intensity: 5, opacity: 0.7 }],
        instances: [{ lengthPx: 18 }, { lengthPx: 16 }],
      };
    }
    if (c.requiresAllProfiles) {
      entry.liveProfiles = REQUIRED_PROFILE_IDS.slice();
      entry.profilesActive = REQUIRED_PROFILE_IDS.slice();
    }
    return entry;
  });

  return createReportSkeleton({
    ok: true,
    runtime,
    gitHead,
    candidateHash,
    candidateIdentity: identity.identityInputs,
    fixtureSource: 'synthetic',
    runtimeHashes,
    families,
    artifacts,
    temporalMatrices,
    scenarios,
    projection: {
      lengthPx: 64,
      widthPx: 14,
      pixelSignal: 4200,
      measured: true,
      widthMeasured: true,
      widthSource: 'measured-screen-project',
    },
    kestrel: {
      authoredState: 'authored',
      authoredAssetState: 'authored',
      url: KESTREL_SHIPPED_GLB_URL,
      visualRoot: 'Kestrel_VisualRoot',
      mainSockets: [
        { x: 0, y: -0.15, z: 1.6, ax: 0, ay: 0, az: -1 },
      ],
      rcsSockets: [
        { x: 0.4, y: 0.1, z: 0.2, ax: 1, ay: 0, az: 0 },
        { x: -0.4, y: 0.1, z: 0.2, ax: -1, ay: 0, az: 0 },
      ],
    },
    lifecycle: {
      release: { plumeActiveCount: 1, ownershipCount: 1 },
      cleanup: {
        trigger: 'sector:enter',
        plumeActiveCount: 0,
        rcsActiveCount: 0,
        ownershipCount: 0,
        activeDraws: 0,
        activeInstances: 0,
      },
      phaseFrames: {
        onset: temporalMatrices.browser.onset.frame,
        growth: temporalMatrices.browser.growth.frame,
        sustain: temporalMatrices.browser.sustain.frame,
        transition: temporalMatrices.browser.transition.frame,
        release: temporalMatrices.browser.release.frame,
        cleanup: temporalMatrices.browser.cleanup.frame,
      },
    },
    gpu: {
      vendor: 'self-test',
      renderer: 'null',
      software: true,
      calls: 12,
      triangles: 100,
      geometries: 20,
      textures: 8,
      programs: 4,
    },
    allocations: {
      plumeFrameAllocations: 0,
      rcsFrameAllocations: 0,
      fleetFrameAllocations: 0,
      denseSweepFrameAllocationsMax: 0,
      plumeSamples: zeroSamples(8),
      rcsSamples: zeroSamples(8),
      fleetSamples: zeroSamples(8),
      denseSamples: zeroSamples(16),
      plumeMax: 0,
      rcsMax: 0,
      fleetMax: 0,
      denseMax: 0,
    },
    visualStatus: 'SELF_TEST_SYNTHETIC',
  });
}

/**
 * Mutators that must make validateVp220PropulsionReport fail.
 * One real mutant per fail-closed defect class.
 */
export function buildSelfTestBadReports(good) {
  const clone = (fn) => {
    const r = JSON.parse(JSON.stringify(good));
    fn(r);
    return r;
  };
  return [
    {
      name: 'missing-family',
      report: clone((r) => {
        r.families = r.families.filter((f) => f.profileId !== 'engine_vector');
      }),
    },
    {
      name: 'missing-compact-inner',
      report: clone((r) => {
        const s = r.scenarios.find((x) => x.id === 'compact-trails-off');
        s.layers = [
          { role: 'sheath', drawCount: 4, intensity: 1.2, opacity: 0.2 },
        ];
      }),
    },
    {
      name: 'missing-lifecycle-cleanup',
      report: clone((r) => {
        const s = r.scenarios.find((x) => x.id === 'cleanup');
        s.cleanup = {
          plumeActiveCount: 3,
          rcsActiveCount: 2,
          ownershipCount: 2,
          activeDraws: 4,
          activeInstances: 3,
        };
        r.lifecycle.cleanup = s.cleanup;
      }),
    },
    {
      name: 'missing-gpu',
      report: clone((r) => {
        r.gpu = {};
        r.prepareOnly = false;
        r.blocked = null;
        r.visualStatus = 'SELF_TEST_SYNTHETIC';
      }),
    },
    {
      name: 'missing-hash-identity',
      report: clone((r) => {
        r.runtimeHashes = r.runtimeHashes.slice(0, 2);
        r.gitHead = null;
      }),
    },
    {
      name: 'missing-artifact-metadata',
      report: clone((r) => {
        r.artifacts = [{
          path: '',
          runtime: '',
          scenario: '',
          width: 0,
          height: -1,
          bytes: 0,
          sha256: '',
          candidateHash: '',
        }];
      }),
    },
    {
      name: 'colliding-runtime-paths',
      report: clone((r) => {
        const a0 = r.artifacts[0];
        r.artifacts[1] = {
          ...a0,
          scenario: r.artifacts[1]?.scenario || 'onset',
          path: a0.path,
          sha256: createHash('sha256').update('collide').digest('hex'),
        };
      }),
    },
    {
      name: 'unordered-lifecycle-frames',
      report: clone((r) => {
        r.lifecycle.phaseFrames = {
          onset: 50,
          growth: 40,
          sustain: 80,
          transition: 120,
          release: 160,
          cleanup: 200,
        };
      }),
    },
    {
      name: 'nonpositive-projection',
      report: clone((r) => {
        r.projection = { lengthPx: 0, widthPx: -2, pixelSignal: 0 };
      }),
    },
    {
      name: 'negative-pixel-signal',
      report: clone((r) => {
        r.projection = { lengthPx: 64, widthPx: 14, pixelSignal: -5 };
      }),
    },
    {
      name: 'nonzero-allocation-samples',
      report: clone((r) => {
        r.allocations.plumeSamples = [0, 0, 1, 0];
        r.allocations.plumeMax = 1;
        r.allocations.denseSamples = [0, 2];
        r.allocations.denseMax = 2;
      }),
    },
    {
      name: 'missing-kestrel-identity',
      report: clone((r) => {
        r.kestrel = {
          authoredState: '',
          url: '',
          visualRoot: '',
          mainSockets: [],
          rcsSockets: [],
        };
      }),
    },
    {
      name: 'invalid-authored-state',
      report: clone((r) => {
        r.kestrel.authoredState = 'maybe-authored-claim';
        r.kestrel.authoredAssetState = 'maybe-authored-claim';
      }),
    },
    {
      name: 'wrong-kestrel-url',
      report: clone((r) => {
        r.kestrel.url = 'assets/ships/kestrel/kestrel.glb';
      }),
    },
    {
      name: 'non-hex-sha256',
      report: clone((r) => {
        r.artifacts[0].sha256 = 'z'.repeat(64);
      }),
    },
    {
      name: 'placeholder-sockets',
      report: clone((r) => {
        r.kestrel.mainSockets = [
          { id: 'placeholder', x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0 },
        ];
        r.kestrel.rcsSockets = [
          { placeholder: true, x: 1, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
        ];
      }),
    },
    {
      name: 'incomplete-structural-signature',
      report: clone((r) => {
        for (const fam of r.families) {
          delete fam.structuralSignature.segments;
          delete fam.structuralSignature.driveFall;
          fam.structuralSignature.activeRoles = [];
          fam.structuralSignature.geometryType = '';
          fam.structuralSignature.driveRise = NaN;
        }
      }),
    },
    {
      name: 'synthetic-labeled-authored',
      report: clone((r) => {
        r.fixtureSource = 'synthetic';
        r.fixtureLabeledAuthored = true;
        r.authored = true;
      }),
    },
    {
      name: 'candidate-hash-mismatch',
      report: clone((r) => {
        r.artifacts[0].candidateHash = createHash('sha256').update('wrong-candidate').digest('hex');
      }),
    },
    {
      name: 'cleanup-nonzero-draws',
      report: clone((r) => {
        const s = r.scenarios.find((x) => x.id === 'cleanup');
        s.cleanup.activeDraws = 5;
        s.cleanup.activeInstances = 2;
        s.cleanup.plumeActiveCount = 0;
        s.cleanup.rcsActiveCount = 0;
        s.cleanup.ownershipCount = 0;
        r.lifecycle.cleanup = { ...s.cleanup };
      }),
    },
    {
      name: 'missing-allocation-sample-arrays',
      report: clone((r) => {
        r.allocations.plumeSamples = null;
        r.allocations.rcsSamples = [];
        r.allocations.fleetMax = null;
        r.allocations.denseSamples = [0, NaN, 0];
      }),
    },
    {
      name: 'missing-temporal-runtime',
      report: clone((r) => {
        r.temporalMatrices.electron = null;
      }),
    },
    {
      name: 'missing-temporal-phase',
      report: clone((r) => {
        delete r.temporalMatrices.browser.growth;
      }),
    },
    {
      name: 'world-only-projection-width',
      report: clone((r) => {
        r.projection = {
          lengthPx: 64,
          // Masquerade world units as width without measured screen provenance.
          widthPx: 1.25,
          worldWidth: 1.25,
          worldOnly: true,
          widthSource: 'world',
          pixelSignal: 4200,
          measured: false,
          widthMeasured: false,
        };
      }),
    },
    {
      name: 'invented-fallback-projection-width',
      report: clone((r) => {
        r.projection = {
          lengthPx: 64,
          widthPx: Math.max(1, 64 * 0.18),
          widthSource: 'invented-ratio-fallback',
          widthInvented: true,
          widthFallback: true,
          pixelSignal: 4200,
        };
      }),
    },
    {
      name: 'private-helper-cleanup-trigger',
      report: clone((r) => {
        const s = r.scenarios.find((x) => x.id === 'cleanup');
        s.cleanup.trigger = '_resetEnergyForBoundary';
        r.lifecycle.cleanup = { ...s.cleanup };
      }),
    },
    {
      name: 'missing-cleanup-trigger',
      report: clone((r) => {
        const s = r.scenarios.find((x) => x.id === 'cleanup');
        delete s.cleanup.trigger;
        delete r.lifecycle.cleanup.trigger;
      }),
    },
  ];
}

/**
 * Run no-browser self-test of the report validator.
 * @param {{ root?: string, gitHead?: string }} [opts]
 */
export function runReportValidatorSelfTest(opts = {}) {
  const good = buildSelfTestGoodReport(opts);
  const goodResult = validateVp220PropulsionReport(good);
  const results = [{ name: 'good-report', expectOk: true, ...goodResult }];

  for (const bad of buildSelfTestBadReports(good)) {
    const r = validateVp220PropulsionReport(bad.report);
    results.push({
      name: bad.name,
      expectOk: false,
      ok: r.ok,
      failures: r.failures,
      passed: r.ok === false && r.failures.length > 0,
    });
  }

  const goodPassed = goodResult.ok === true;
  const badPassed = results.slice(1).every((r) => r.passed);
  return {
    ok: goodPassed && badPassed,
    goodPassed,
    badPassed,
    results,
    schema: SCHEMA_ID,
  };
}

/** Default repo root for diagnostics that need absolute paths. */
export function defaultRepoRoot() {
  return fileURLToPath(new URL('../../', import.meta.url));
}

/** Page-side diagnostics extractor (stringified into page.evaluate). */
export const PAGE_DIAGNOSTICS_SOURCE = `
(() => {
  const sf = window.SF;
  const state = sf && sf.state;
  if (!state) return { error: 'no SF.state' };
  const player = state.entities && state.entities.get(state.playerId);
  const vfx = sf.registry && sf.registry.get && sf.registry.get('vfx');
  const energy = vfx && vfx._energy;
  const fleet = energy && energy.fleet;
  const plume = energy && energy.plumeSystem;
  const rcs = energy && energy.rcsSystem;

  const layerSnap = (system) => {
    if (!system || !system.layerBatches) return [];
    return system.layerBatches.map((batch) => {
      const u = batch.material && batch.material.uniforms;
      return {
        role: batch.role,
        drawCount: batch.mesh ? (batch.mesh.count || 0) : 0,
        intensity: u && u.uIntensity ? u.uIntensity.value : (batch.baseIntensity || 0),
        opacity: u && u.uOpacity ? u.uOpacity.value : (batch.baseOpacity || 0),
        textureId: batch.material && batch.material.userData
          ? batch.material.userData.textureId : null,
      };
    });
  };

  const socketPose = (pose, name) => {
    if (!pose) return null;
    const x = Number(pose.x);
    const y = Number(pose.y);
    const z = Number(pose.z);
    const ax = Number(pose.forwardX != null ? pose.forwardX : pose.ax);
    const ay = Number(pose.forwardY != null ? pose.forwardY : pose.ay);
    const az = Number(pose.forwardZ != null ? pose.forwardZ : pose.az);
    return {
      id: name || pose.id || null,
      x: Number.isFinite(x) ? x : null,
      y: Number.isFinite(y) ? y : null,
      z: Number.isFinite(z) ? z : null,
      ax: Number.isFinite(ax) ? ax : null,
      ay: Number.isFinite(ay) ? ay : null,
      az: Number.isFinite(az) ? az : null,
    };
  };

  const mainSockets = [];
  const rcsSockets = [];
  if (vfx && player) {
    try {
      if (typeof vfx._trailSocketObjects === 'function') {
        const trailSocks = vfx._trailSocketObjects(player) || [];
        for (let i = 0; i < trailSocks.length; i++) {
          const pose = typeof vfx._trailSocketPoseFromObject === 'function'
            ? vfx._trailSocketPoseFromObject(trailSocks[i])
            : null;
          const snap = socketPose(pose, trailSocks[i] && trailSocks[i].name);
          if (snap) mainSockets.push(snap);
        }
      }
      if (typeof vfx._trailSocketWorldPose === 'function' && mainSockets.length === 0) {
        const pose = vfx._trailSocketWorldPose(player);
        const snap = socketPose(pose, 'SOCKET_Trail_Main');
        if (snap) mainSockets.push(snap);
      }
      if (player.view && player.view.__vfxRcsSockets) {
        const list = player.view.__vfxRcsSockets;
        for (let i = 0; i < list.length; i++) {
          const sock = list[i];
          if (!sock) continue;
          if (typeof vfx._writeRcsSocketPose === 'function') {
            const origin = { x: 0, y: 0, z: 0 };
            const axis = { x: 0, y: 0, z: 0 };
            // Fall through to matrix decompose when available.
          }
          if (sock.updateWorldMatrix) {
            sock.updateWorldMatrix(true, false);
            const e = sock.matrixWorld && sock.matrixWorld.elements;
            if (e) {
              const f = (sock.userData && sock.userData.forward) || [1, 0, 0];
              rcsSockets.push({
                id: sock.name || ('rcs_' + i),
                x: e[12], y: e[13], z: e[14],
                ax: Number(f[0]) || 0, ay: Number(f[1]) || 0, az: Number(f[2]) || 0,
              });
            }
          }
        }
      }
    } catch (err) {
      // leave sockets empty → validator fails closed
    }
  }

  const families = [];
  if (fleet && fleet.families) {
    for (let i = 0; i < fleet.families.length; i++) {
      const f = fleet.families[i];
      families.push({
        profileId: f.profileId,
        mainRecipeId: f.pack && f.pack.main ? f.pack.main.id : null,
        rcsRecipeId: f.pack && f.pack.rcs ? f.pack.rcs.id : null,
        plumeVisible: !!(f.plume && f.plume.group && f.plume.group.visible),
        plumeActive: f.plume && f.plume.pool ? f.plume.pool.activeCount : 0,
        rcsActive: f.rcs && f.rcs.pool ? f.rcs.pool.activeImpulseCount : 0,
        layers: layerSnap(f.plume),
      });
    }
  }

  const gl = state.render && state.render.renderer
    && state.render.renderer.getContext && state.render.renderer.getContext();
  let vendor = null;
  let rendererName = null;
  let software = null;
  if (gl) {
    try {
      const dbg = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
        rendererName = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      } else {
        vendor = gl.getParameter(gl.VENDOR);
        rendererName = gl.getParameter(gl.RENDERER);
      }
      software = /swiftshader|llvmpipe|softpipe|microsoft basic render/i.test(String(rendererName || ''));
    } catch (_) {}
  }

  const info = state.render && state.render.renderer && state.render.renderer.info;
  const mesh = player && player.mesh;
  const ud = mesh && mesh.userData;
  const authoredSlots = ud && ud.authoredSlots ? ud.authoredSlots : null;
  let assetUrl = null;
  if (authoredSlots) {
    const all = [];
    for (const key of Object.keys(authoredSlots)) {
      const list = authoredSlots[key];
      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) all.push(String(list[i]));
      }
    }
    const hit = all.find((u) => /wholeships\\/kestrel\\.glb/i.test(u));
    assetUrl = hit || all[0] || null;
  }
  if (assetUrl && assetUrl.startsWith('/')) assetUrl = assetUrl.slice(1);

  const activeDraws = (plume && plume.layerBatches
    ? plume.layerBatches.reduce((n, b) => n + (b.mesh && b.mesh.count ? b.mesh.count : 0), 0)
    : null);
  const activeInstances = plume && plume.pool ? plume.pool.activeCount : null;

  return {
    route: { mode: state.mode, sectorId: state.world && state.world.currentSectorId },
    settings: {
      engineTrails: state.settings && state.settings.video
        ? state.settings.video.engineTrails : null,
      motionReduce: state.settings && state.settings.video
        ? state.settings.video.motionReduce : null,
      flashReduce: state.settings && state.settings.accessibility
        ? state.settings.accessibility.flashReduce : null,
      particleQuality: state.settings && state.settings.video
        ? state.settings.video.particleQuality : null,
    },
    player: {
      id: player && player.id,
      defId: player && player.data && player.data.defId,
      authoredAssetState: ud ? ud.authoredAssetState : null,
      authoredVisualRoot: ud ? (ud.authoredVisualRoot || ud.visualRootName || null) : null,
      visualRootName: mesh ? (mesh.name || null) : null,
      visualRootId: mesh ? (mesh.uuid || null) : null,
      assetUrl: assetUrl,
    },
    engineProfileId: energy && energy.engineProfileId,
    plumeRecipeId: plume && plume.recipe && plume.recipe.id,
    rcsRecipeId: rcs && rcs.recipe && rcs.recipe.id,
    layers: layerSnap(plume),
    rcsLayers: layerSnap(rcs),
    rcsActive: rcs && rcs.pool ? rcs.pool.activeImpulseCount : null,
    plumeActive: plume && plume.pool ? plume.pool.activeCount : null,
    activeDraws: activeDraws,
    activeInstances: activeInstances,
    fleetDiag: energy && energy.fleetDiag,
    productionOwnedCount: vfx ? (vfx._productionOwnedCount != null ? vfx._productionOwnedCount : null) : null,
    mainSockets: mainSockets,
    rcsSockets: rcsSockets,
    families,
    allocations: {
      plumeFrameAllocations: plume && plume.pool ? plume.pool.frameAllocations : null,
      rcsFrameAllocations: rcs && rcs.pool ? rcs.pool.frameAllocations : null,
      fleetFrameAllocations: fleet ? fleet.frameAllocations : null,
    },
    simTime: state.simTime != null ? state.simTime : null,
    renderFrame: info && info.render ? info.render.frame : null,
    gpu: {
      vendor,
      renderer: rendererName,
      software,
      calls: info ? info.render.calls : null,
      triangles: info ? info.render.triangles : null,
      geometries: info ? info.memory.geometries : null,
      textures: info ? info.memory.textures : null,
      programs: info && info.programs ? info.programs.length : null,
    },
  };
})()
`;
