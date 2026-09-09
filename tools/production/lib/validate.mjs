// SAFE-001 worker-submission validation (repair-1).
// Minimal structural validator for design/production/schemas/worker-submission.schema.json.
// Hand-rolled on purpose: the repo has no runtime JSON-schema dependency, and this
// validator is part of the trust boundary — it must be readable in one sitting.
//
// Repair-1 (SAFE-001-REPAIR defect 8): evidence paths must be unique AND
// contained (relative, no '..', no ':', no device names, no absolute forms);
// continuation heartbeats must be strict ISO-8601 UTC instants that Date.parse
// accepts. The JSON schema carries the same constraints; the fixture suite
// proves schema/validator parity on every good/bad fixture.

const DIGEST_RE = /^[a-f0-9]{64}$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const DEVICE_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
const STATUS_ENUM = ['submitted', 'needs_continuation', 'external_blocker_claimed'];
const CONTINUATION_REASONS = [
  'process_exit', 'turn_limit', 'timeout', 'context_limit',
  'invalid_output', 'controller_interrupt', 'tool_failure',
];
const PROCESS_STATUS = ['running', 'exited', 'terminated', 'unknown'];
const BLOCKER_CLASSES = [
  'ownership_conflict', 'external_dependency', 'tool_unavailable',
  'permission_required', 'corrupt_source',
];

function isNonEmptyString(v, min = 1) {
  return typeof v === 'string' && v.length >= min;
}

function isStringArray(v, { minItems = 0, minLength = 1 } = {}) {
  return Array.isArray(v) && v.length >= minItems && v.every((s) => isNonEmptyString(s, minLength));
}

export function containedRelativePathError(p) {
  if (typeof p !== 'string' || !p.length) return 'empty';
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\')) return 'absolute';
  if (p.includes(':')) return 'contains ":" (ADS syntax)';
  const segs = p.replace(/\\/g, '/').split('/');
  if (segs.some((s) => s === '..')) return "contains '..'";
  if (segs.some((s) => DEVICE_NAMES.test(s))) return 'reserved device name';
  return null;
}

export function isStrictIsoUtc(v) {
  return typeof v === 'string' && ISO_UTC_RE.test(v) && Number.isFinite(Date.parse(v));
}

// Returns { ok, errors: string[] }. Every error names the offending field so a
// rejected worker gets an exact defect list, not a boolean.
export function validateWorkerSubmission(sub) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  if (typeof sub !== 'object' || sub === null || Array.isArray(sub)) {
    return { ok: false, errors: ['submission must be a JSON object'] };
  }

  const required = [
    'packetId', 'status', 'sessionId', 'candidateId', 'sourceHash', 'candidateHash',
    'meaningfulCycles', 'evidencePaths', 'changes', 'unresolvedDefects',
    'continuation', 'blockerEvidence', 'nextAction',
  ];
  for (const key of required) {
    if (!(key in sub)) err(`missing required field: ${key}`);
  }
  const allowed = new Set(required);
  for (const key of Object.keys(sub)) {
    if (!allowed.has(key)) err(`unexpected field (additionalProperties=false): ${key}`);
  }
  if (errors.length) return { ok: false, errors };

  if (!isNonEmptyString(sub.packetId)) err('packetId must be a non-empty string');
  if (!STATUS_ENUM.includes(sub.status)) {
    err(`status must be one of ${STATUS_ENUM.join('|')} — workers can never claim accepted/done`);
  }
  if (!isNonEmptyString(sub.sessionId)) err('sessionId must be a non-empty string');
  if (!isNonEmptyString(sub.candidateId)) err('candidateId must be a non-empty string');
  if (!DIGEST_RE.test(String(sub.sourceHash))) err('sourceHash must be a sha256 hex digest');
  if (!DIGEST_RE.test(String(sub.candidateHash))) err('candidateHash must be a sha256 hex digest');
  if (!Number.isInteger(sub.meaningfulCycles) || sub.meaningfulCycles < 0) {
    err('meaningfulCycles must be a non-negative integer');
  }
  if (!isStringArray(sub.evidencePaths)) err('evidencePaths must be an array of non-empty strings');
  else {
    if (new Set(sub.evidencePaths).size !== sub.evidencePaths.length) {
      err('evidencePaths must be unique (uniqueItems)');
    }
    for (const p of sub.evidencePaths) {
      const reason = containedRelativePathError(p);
      if (reason) err(`evidencePaths entry not a contained relative path: "${p}" (${reason})`);
    }
  }
  if (!isStringArray(sub.changes)) err('changes must be an array of non-empty strings');
  if (!isStringArray(sub.unresolvedDefects)) err('unresolvedDefects must be an array of non-empty strings');
  if (!isNonEmptyString(sub.nextAction)) err('nextAction must be a non-empty string');
  if (!Array.isArray(sub.blockerEvidence)) err('blockerEvidence must be an array');

  const validateContinuation = (c) => {
    if (typeof c !== 'object' || c === null) return err('continuation must be an object');
    const req = ['reason', 'checkpointHash', 'checkpointPath', 'lastCompletedStep', 'processStatus', 'heartbeatAt'];
    for (const key of req) if (!(key in c)) err(`continuation.${key} missing`);
    if (!CONTINUATION_REASONS.includes(c.reason)) err('continuation.reason invalid');
    if (!DIGEST_RE.test(String(c.checkpointHash))) err('continuation.checkpointHash must be sha256');
    if (!isNonEmptyString(c.checkpointPath)) err('continuation.checkpointPath must be non-empty');
    else {
      const reason = containedRelativePathError(c.checkpointPath);
      if (reason) err(`continuation.checkpointPath not a contained relative path (${reason})`);
    }
    if (!isNonEmptyString(c.lastCompletedStep)) err('continuation.lastCompletedStep must be non-empty');
    if (!PROCESS_STATUS.includes(c.processStatus)) err('continuation.processStatus invalid');
    if (!isStrictIsoUtc(c.heartbeatAt)) err('continuation.heartbeatAt must be a strict ISO-8601 UTC instant (e.g. 2026-07-10T12:00:00Z)');
  };

  const validateBlocker = (b, i) => {
    if (typeof b !== 'object' || b === null) return err(`blockerEvidence[${i}] must be an object`);
    if (!BLOCKER_CLASSES.includes(b.class)) err(`blockerEvidence[${i}].class invalid`);
    if (!isNonEmptyString(b.observation, 20)) err(`blockerEvidence[${i}].observation must be >=20 chars`);
    if (!isNonEmptyString(b.evidencePath)) err(`blockerEvidence[${i}].evidencePath must be non-empty`);
    else {
      const reason = containedRelativePathError(b.evidencePath);
      if (reason) err(`blockerEvidence[${i}].evidencePath not a contained relative path (${reason})`);
    }
    if (!isStringArray(b.attemptedRemedies, { minItems: 3, minLength: 10 })) {
      err(`blockerEvidence[${i}].attemptedRemedies must list >=3 remedies of >=10 chars`);
    }
  };

  if (sub.status === 'submitted') {
    if (Array.isArray(sub.evidencePaths) && sub.evidencePaths.length < 1) err('submitted requires >=1 evidencePaths');
    if (Array.isArray(sub.changes) && sub.changes.length < 1) err('submitted requires >=1 changes');
    if (sub.continuation !== null) err('submitted requires continuation=null');
    if (Array.isArray(sub.blockerEvidence) && sub.blockerEvidence.length > 0) err('submitted forbids blockerEvidence');
  } else if (sub.status === 'needs_continuation') {
    if (Array.isArray(sub.evidencePaths) && sub.evidencePaths.length < 1) err('needs_continuation requires >=1 evidencePaths');
    if (sub.continuation === null || sub.continuation === undefined) err('needs_continuation requires a continuation record');
    else validateContinuation(sub.continuation);
    if (Array.isArray(sub.blockerEvidence) && sub.blockerEvidence.length > 0) err('needs_continuation forbids blockerEvidence');
  } else if (sub.status === 'external_blocker_claimed') {
    if (Array.isArray(sub.evidencePaths) && sub.evidencePaths.length < 1) err('external_blocker_claimed requires >=1 evidencePaths');
    if (sub.continuation !== null) err('external_blocker_claimed requires continuation=null');
    if (!Array.isArray(sub.blockerEvidence) || sub.blockerEvidence.length < 1) {
      err('external_blocker_claimed requires >=1 blockerEvidence records');
    } else {
      sub.blockerEvidence.forEach(validateBlocker);
    }
  }

  return { ok: errors.length === 0, errors };
}
