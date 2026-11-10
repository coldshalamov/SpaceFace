// Capture manifest contract for the combat-feel bench. The Python driver writes this shape; the
// same validator runs from Node (test + post-capture CLI) so a driver/schema drift fails the run
// instead of leaving a plausible-looking folder nobody can trust.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALL_EVIDENCE,
  CATALOG_VERSION,
  FIXED_ARENA,
  SCENARIOS,
  STEP_SECONDS,
  VIEWS,
  scenarioById,
} from './catalog.mjs';

export const CAPTURE_SCHEMA_VERSION = 1;
export const CAPTURE_KIND = 'spaceface-combat-feel-capture';
export const CAPTURE_FPS_CHOICES = Object.freeze([24, 30, 60]);
export const CAPTURE_STATUSES = Object.freeze(['complete', 'error']);
export const BEAT_NAMES = Object.freeze([...ALL_EVIDENCE, 'tumble']);

const KNOWN_SCENARIOS = new Set(SCENARIOS.map((scenario) => scenario.id));

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value) {
  return Number.isInteger(value);
}

function relativePathProblem(value) {
  if (!isNonEmptyString(value)) return 'must be a non-empty string';
  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return 'must be relative';
  if (/^[a-zA-Z]:/.test(normalized)) return 'must not be an absolute Windows path';
  if (normalized.split('/').includes('..')) return 'must not escape the output directory';
  return null;
}

function checkRelativePath(errors, label, value, { optional = false } = {}) {
  if (optional && (value == null || value === '')) return;
  const problem = relativePathProblem(value);
  if (problem) errors.push(`${label} ${problem}`);
}

function pushIssue(errors, label, message) {
  errors.push(`${label}: ${message}`);
}

/**
 * Provenance is part of the evidence. A structural schema cannot tell a capture made from the
 * committed bench from one made before a bench fix; this recomputes every recorded source hash.
 * The post-capture CLI calls it, so a stale folder cannot pass as current evidence.
 */
export function verifySourceFiles(manifest, root = process.cwd()) {
  const files = manifest && manifest.run && manifest.run.sourceFiles;
  if (!isPlainObject(files) || Object.keys(files).length === 0) {
    return ['run.sourceFiles: must record the hashed capture sources'];
  }
  const errors = [];
  for (const [relative, expected] of Object.entries(files)) {
    const problem = relativePathProblem(relative);
    if (problem) {
      pushIssue(errors, `run.sourceFiles.${relative}`, problem);
      continue;
    }
    let actual;
    try {
      actual = createHash('sha256').update(readFileSync(resolve(root, relative))).digest('hex');
    } catch (error) {
      pushIssue(errors, `run.sourceFiles.${relative}`,
        `unreadable (${error instanceof Error ? error.message : error})`);
      continue;
    }
    if (actual !== expected) {
      pushIssue(errors, `run.sourceFiles.${relative}`,
        `stale (recorded ${String(expected).slice(0, 12)}…, current ${actual.slice(0, 12)}…)`);
    }
  }
  return errors;
}

/**
 * Validate a capture manifest. Returns { ok, errors }. It is intentionally structural and
 * semantic (catalog membership, evidence completeness, chronological beats) rather than a JSON
 * Schema implementation so the check stays dependency-free and readable.
 */
export function validateCaptureManifest(manifest) {
  const errors = [];
  if (!isPlainObject(manifest)) return { ok: false, errors: ['manifest: must be an object'] };

  if (manifest.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    pushIssue(errors, 'schemaVersion', `expected ${CAPTURE_SCHEMA_VERSION}`);
  }
  if (manifest.kind !== CAPTURE_KIND) pushIssue(errors, 'kind', `expected ${CAPTURE_KIND}`);
  if (manifest.catalogVersion !== CATALOG_VERSION) {
    pushIssue(errors, 'catalogVersion', `expected ${CATALOG_VERSION}`);
  }
  if (!isNonEmptyString(manifest.createdAt)) pushIssue(errors, 'createdAt', 'must be a timestamp string');

  const run = manifest.run;
  if (!isPlainObject(run)) {
    errors.push('run: must be an object');
  } else {
    if (!isNonEmptyString(run.url)) pushIssue(errors, 'run.url', 'must be the served bench URL');
    if (!isInteger(run.seed) || run.seed < 0) pushIssue(errors, 'run.seed', 'must be a nonnegative integer');
    if (!isInteger(run.width) || run.width <= 0) pushIssue(errors, 'run.width', 'must be a positive integer');
    if (!isInteger(run.height) || run.height <= 0) pushIssue(errors, 'run.height', 'must be a positive integer');
    if (!CAPTURE_FPS_CHOICES.includes(run.fps)) {
      pushIssue(errors, 'run.fps', `must be one of ${CAPTURE_FPS_CHOICES.join(', ')}`);
    }
    if (!VIEWS.includes(run.view)) pushIssue(errors, 'run.view', `must be one of ${VIEWS.join(', ')}`);
    if (!isNonEmptyString(run.browserChannel)) pushIssue(errors, 'run.browserChannel', 'must name the Playwright channel');
    if (!isNonEmptyString(run.sourceFingerprint)) pushIssue(errors, 'run.sourceFingerprint', 'must be set');
    if (!isNonEmptyString(run.configFingerprint)) pushIssue(errors, 'run.configFingerprint', 'must be set');
    if (!Array.isArray(run.scenarios) || !run.scenarios.length) {
      pushIssue(errors, 'run.scenarios', 'must name the requested scenarios');
    } else {
      for (const id of run.scenarios) {
        if (!KNOWN_SCENARIOS.has(id)) pushIssue(errors, 'run.scenarios', `unknown scenario ${id}`);
      }
    }
    if (run.startedAt != null && !isNonEmptyString(run.startedAt)) pushIssue(errors, 'run.startedAt', 'must be a timestamp string');
    if (run.endedAt != null && !isNonEmptyString(run.endedAt)) pushIssue(errors, 'run.endedAt', 'must be a timestamp string');
    if (run.wallSeconds != null && !(isFiniteNumber(run.wallSeconds) && run.wallSeconds >= 0)) {
      pushIssue(errors, 'run.wallSeconds', 'must be nonnegative when present');
    }
  }

  if (isPlainObject(run) && Array.isArray(run.scenarios) && isPlainObject(manifest.scenarios)) {
    for (const id of run.scenarios) {
      if (KNOWN_SCENARIOS.has(id) && !Object.prototype.hasOwnProperty.call(manifest.scenarios, id)) {
        pushIssue(errors, 'run.scenarios', `requested scenario ${id} has no capture entry`);
      }
    }
  }

  const scenarios = manifest.scenarios;
  if (!isPlainObject(scenarios) || !Object.keys(scenarios).length) {
    errors.push('scenarios: must contain at least one captured scenario');
  } else {
    for (const [id, entry] of Object.entries(scenarios)) {
      const label = `scenarios.${id}`;
      const scenario = scenarioById(id);
      if (!scenario) {
        pushIssue(errors, label, 'not in the bench catalog');
        continue;
      }
      if (!isPlainObject(entry)) {
        pushIssue(errors, label, 'must be an object');
        continue;
      }
      if (entry.scenario !== id) pushIssue(errors, `${label}.scenario`, `must equal "${id}"`);
      if (!isInteger(entry.seed) || entry.seed < 0) pushIssue(errors, `${label}.seed`, 'must be a nonnegative integer');
      if (isPlainObject(run) && isInteger(run.seed) && entry.seed !== run.seed) {
        pushIssue(errors, `${label}.seed`, 'must equal run.seed');
      }
      if (!CAPTURE_STATUSES.includes(entry.status)) {
        pushIssue(errors, `${label}.status`, `must be one of ${CAPTURE_STATUSES.join(', ')}`);
      }
      if (!Array.isArray(entry.weaponIds) || !entry.weaponIds.length) {
        pushIssue(errors, `${label}.weaponIds`, 'must name at least one weapon');
      } else if (!entry.weaponIds.every((weaponId) => scenario.weaponIds.includes(weaponId))) {
        pushIssue(errors, `${label}.weaponIds`, 'contains a weapon the scenario does not author');
      }
      if (!(isFiniteNumber(entry.durationSeconds) && entry.durationSeconds > 0)) {
        pushIssue(errors, `${label}.durationSeconds`, 'must be positive');
      }
      if (entry.fps !== (run && run.fps)) pushIssue(errors, `${label}.fps`, 'must equal run.fps');

      if (!Array.isArray(entry.beats) || !entry.beats.length) {
        pushIssue(errors, `${label}.beats`, 'must contain at least one beat');
      } else {
        const seen = new Set();
        let previous = -1;
        for (const [index, beat] of entry.beats.entries()) {
          const beatLabel = `${label}.beats[${index}]`;
          if (!isPlainObject(beat)) {
            pushIssue(errors, beatLabel, 'must be an object');
            continue;
          }
          if (!BEAT_NAMES.includes(beat.beat)) pushIssue(errors, `${beatLabel}.beat`, `unknown beat ${beat.beat}`);
          if (seen.has(beat.beat)) pushIssue(errors, `${beatLabel}.beat`, `duplicate beat ${beat.beat}`);
          seen.add(beat.beat);
          if (!isFiniteNumber(beat.atS) || beat.atS < 0) pushIssue(errors, `${beatLabel}.atS`, 'must be nonnegative');
          else {
            if (beat.atS < previous - 1e-6) pushIssue(errors, `${beatLabel}.atS`, 'beats must be chronological');
            previous = beat.atS;
            if (isFiniteNumber(entry.durationSeconds) && beat.atS > entry.durationSeconds + 1e-3) {
              pushIssue(errors, `${beatLabel}.atS`, 'must not exceed the scenario duration');
            }
            const expectedFrame = Math.round(beat.atS / STEP_SECONDS);
            if (beat.frame !== expectedFrame) {
              pushIssue(errors, `${beatLabel}.frame`, `expected ${expectedFrame} for atS ${beat.atS}`);
            }
          }
        }
        const required = scenario.requiredEvidence;
        for (const evidence of required) {
          if (!seen.has(evidence)) {
            pushIssue(errors, `${label}.beats`, `missing required ${evidence} beat`);
          }
        }
      }

      const frames = entry.frames;
      if (!isPlainObject(frames)) pushIssue(errors, `${label}.frames`, 'must be an object');
      else {
        checkRelativePath(errors, `${label}.frames.directory`, frames.directory);
        if (!isNonEmptyString(frames.pattern)) pushIssue(errors, `${label}.frames.pattern`, 'must be set');
        if (!isInteger(frames.count) || frames.count <= 0) pushIssue(errors, `${label}.frames.count`, 'must be positive');
      }

      const sequence = entry.sequence;
      if (!isPlainObject(sequence)) pushIssue(errors, `${label}.sequence`, 'must be an object');
      else {
        checkRelativePath(errors, `${label}.sequence.directory`, sequence.directory);
        if (!isInteger(sequence.fps) || !CAPTURE_FPS_CHOICES.includes(sequence.fps)) {
          pushIssue(errors, `${label}.sequence.fps`, 'must be a supported capture fps');
        }
        if (!isInteger(sequence.frameCount) || sequence.frameCount < 0) {
          pushIssue(errors, `${label}.sequence.frameCount`, 'must be a nonnegative integer');
        }
        checkRelativePath(errors, `${label}.sequence.video`, sequence.video, { optional: true });
        if (sequence.video && !(sequence.frameCount > 0)) {
          pushIssue(errors, `${label}.sequence.video`, 'requires captured frames');
        }
      }

      if (!isPlainObject(entry.evidence)) {
        pushIssue(errors, `${label}.evidence`, 'must be an object');
      } else {
        for (const evidence of scenario.requiredEvidence) {
          if (!Object.prototype.hasOwnProperty.call(entry.evidence, evidence)) {
            pushIssue(errors, `${label}.evidence.${evidence}`, 'missing');
          } else if (entry.status === 'complete' && entry.evidence[evidence] !== true) {
            pushIssue(errors, `${label}.evidence.${evidence}`, 'required evidence was not observed');
          }
        }
        for (const [evidence, value] of Object.entries(entry.evidence)) {
          if (!ALL_EVIDENCE.includes(evidence)) pushIssue(errors, `${label}.evidence.${evidence}`, 'unknown evidence name');
          if (typeof value !== 'boolean') pushIssue(errors, `${label}.evidence.${evidence}`, 'must be boolean');
        }
      }

      if (!Array.isArray(entry.checks)) pushIssue(errors, `${label}.checks`, 'must be an array');
      else {
        for (const [index, check] of entry.checks.entries()) {
          const checkLabel = `${label}.checks[${index}]`;
          if (!isPlainObject(check)) {
            pushIssue(errors, checkLabel, 'must be an object');
            continue;
          }
          if (!isNonEmptyString(check.id)) pushIssue(errors, `${checkLabel}.id`, 'must be set');
          if (typeof check.ok !== 'boolean') pushIssue(errors, `${checkLabel}.ok`, 'must be boolean');
          if (!isNonEmptyString(check.detail)) pushIssue(errors, `${checkLabel}.detail`, 'must be set');
          if (entry.status === 'complete' && check.ok !== true) {
            pushIssue(errors, checkLabel, 'a complete scenario cannot carry a failed check');
          }
        }
        if (entry.status === 'complete' && entry.checks.length === 0) {
          pushIssue(errors, `${label}.checks`, 'a complete scenario needs at least one check');
        }
      }

      if (!Array.isArray(entry.errors)) {
        pushIssue(errors, `${label}.errors`, 'must be an array');
      } else {
        if (entry.status === 'complete' && entry.errors.length) {
          pushIssue(errors, `${label}.errors`, 'a complete scenario cannot carry errors');
        }
        for (const [index, error] of entry.errors.entries()) {
          if (!isPlainObject(error) || !isNonEmptyString(error.kind) || !isNonEmptyString(error.message)) {
            pushIssue(errors, `${label}.errors[${index}]`, 'must be { kind, message }');
          }
        }
      }
    }
  }

  const outputs = manifest.outputs;
  if (!isPlainObject(outputs)) {
    errors.push('outputs: must be an object');
  } else {
    for (const key of ['manifest', 'report', 'review', 'framesRoot', 'videoRoot']) {
      checkRelativePath(errors, `outputs.${key}`, outputs[key]);
    }
    checkRelativePath(errors, 'outputs.contactSheet', outputs.contactSheet, { optional: true });
  }

  if (!Array.isArray(manifest.errors)) {
    errors.push('errors: must be an array');
  } else if (manifest.errors.length) {
    for (const [index, error] of manifest.errors.entries()) {
      if (!isPlainObject(error) || !isNonEmptyString(error.kind) || !isNonEmptyString(error.message)) {
        pushIssue(errors, `errors[${index}]`, 'must be { kind, message }');
      }
    }
    pushIssue(errors, 'errors', 'capture recorded errors; a valid manifest must be clean');
  }
  if (!Array.isArray(manifest.warnings)) errors.push('warnings: must be an array');

  return { ok: errors.length === 0, errors };
}

/**
 * Small valid manifest used by the no-GPU test. Values mirror what the Python driver writes; the
 * test also mutates this fixture to prove the validator rejects broken contracts.
 */
export function sampleCaptureManifest({ seed = 17, scenarioId = 'pulse-hull' } = {}) {
  const scenario = scenarioById(scenarioId);
  if (!scenario) throw new Error(`Unknown sample scenario ${scenarioId}`);
  const frame = (time) => Math.round(time / STEP_SECONDS);
  const beats = scenario.requiredEvidence.map((beat, index) => {
    const atS = Math.round((0.2 + index * 0.15) * 60) / 60;
    return { beat, atS, frame: frame(atS) };
  });
  const evidence = Object.fromEntries(scenario.requiredEvidence.map((beat) => [beat, true]));
  const distance = FIXED_ARENA.targetX - FIXED_ARENA.targetHullHalfExtentWu
    - (FIXED_ARENA.ownerX + FIXED_ARENA.ownerNoseOffsetWu);
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    kind: CAPTURE_KIND,
    catalogVersion: CATALOG_VERSION,
    createdAt: '2026-10-25T00:00:00+0000',
    run: {
      url: 'http://127.0.0.1:8769/scripts/combat-feel/index.html',
      seed,
      width: 1600,
      height: 900,
      fps: 60,
      view: 'normal',
      browserChannel: 'chromium',
      browserVersion: 'test',
      sourceFingerprint: '0'.repeat(64),
      sourceFiles: { 'scripts/combat-feel/index.html': '0'.repeat(64) },
      configFingerprint: '1'.repeat(64),
      renderer: { vendor: 'test', renderer: 'test' },
      scenarios: [scenarioId],
      startedAt: '2026-10-25T00:00:00+0000',
      endedAt: '2026-10-25T00:00:01+0000',
      wallSeconds: 1,
    },
    scenarios: {
      [scenarioId]: {
        scenario: scenarioId,
        seed,
        status: 'complete',
        weaponIds: scenario.weaponIds.slice(),
        durationSeconds: scenario.durationSeconds,
        fps: 60,
        beats,
        frames: {
          directory: `frames/${scenarioId}`,
          pattern: 'beat-%02d-%s.png',
          count: beats.length,
        },
        sequence: {
          directory: `frames/${scenarioId}/sequence`,
          fps: 60,
          frameCount: 276,
          video: `video/${scenarioId}.mp4`,
        },
        evidence,
        checks: [{ id: 'assets-loaded', ok: true, detail: 'owner and target primitives > 0' }],
        inspect: {
          distanceWu: Math.round(distance * 1e6) / 1e6,
          shots: [],
        },
        errors: [],
      },
    },
    outputs: {
      manifest: 'manifest.json',
      report: 'report.json',
      review: 'timeline.html',
      contactSheet: 'contact-sheet.html',
      framesRoot: 'frames',
      videoRoot: 'video',
    },
    errors: [],
    warnings: [],
  };
}
