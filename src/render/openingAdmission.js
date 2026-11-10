// Finite identity-bound opening GPU admission.
//
// Continue / New Game / sector entry must compile and upload only the exact critical roots captured
// at the handoff watermark. Later traffic or combat roots use the ordinary per-root gate and cannot
// grow the blocking set. Timeouts and "wait for whatever is pending" are not a substitute.

export function normalizeAdmissionIdentity(value) {
  if (value == null) return '';
  return String(value);
}

/** Stable identity for a compile/upload subject on the opening cohort. */
export function openingSubjectIdentity(subject) {
  if (subject == null) return '';
  if (typeof subject === 'string' || typeof subject === 'number') return normalizeAdmissionIdentity(subject);
  const userData = subject.userData || {};
  const entityId = userData.entityId ?? userData.sfEntityId ?? userData.id;
  if (entityId != null && entityId !== '') return `entity:${entityId}`;
  if (subject.uuid) return `uuid:${subject.uuid}`;
  if (subject.id != null && subject.id !== '') return `id:${subject.id}`;
  if (subject.name) return `name:${subject.name}`;
  return '';
}

export function shouldAdmitOpeningSubject(cohort, subject) {
  if (!cohort) return true;
  if (cohort.frozen !== true) return true;
  const id = openingSubjectIdentity(subject);
  if (!id) return false;
  return cohort.admits(id);
}

export function createOpeningAdmissionCohort(options = {}) {
  const identities = new Set();
  let frozen = options.frozen === true;
  const createdAtMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : 0;

  function capture(list) {
    if (frozen) return snapshot();
    for (const item of list || []) {
      const id = normalizeAdmissionIdentity(item);
      if (id) identities.add(id);
    }
    frozen = true;
    return snapshot();
  }

  function snapshot() {
    return Object.freeze({
      frozen,
      size: identities.size,
      identities: Object.freeze([...identities].sort()),
      createdAtMs,
    });
  }

  return {
    capture,
    admits(identity) {
      const id = normalizeAdmissionIdentity(identity);
      if (!id) return false;
      if (!frozen) return true;
      return identities.has(id);
    },
    extendBlocked(identity) {
      // Late roots must never enlarge a frozen opening watermark.
      if (frozen) return false;
      const id = normalizeAdmissionIdentity(identity);
      if (!id) return false;
      identities.add(id);
      return true;
    },
    get frozen() { return frozen; },
    get size() { return identities.size; },
    snapshot,
  };
}

export function openingSliceWithinBudget(durationMs, limits = {}) {
  const duration = Number(durationMs);
  const target = Number.isFinite(Number(limits.targetMs)) ? Number(limits.targetMs) : 8;
  const hard = Number.isFinite(Number(limits.hardMs)) ? Number(limits.hardMs) : 12;
  if (!Number.isFinite(duration) || duration < 0) {
    return { ok: false, targetMet: false, hardMet: false, durationMs: 0 };
  }
  return {
    ok: duration <= hard,
    targetMet: duration <= target,
    hardMet: duration <= hard,
    durationMs: duration,
    targetMs: target,
    hardMs: hard,
  };
}
