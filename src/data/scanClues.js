// NXB-045 — clue memory. A bounded book of scan observations that remembers what an earlier
// reading claimed, so a moved convoy reads "stale fix" instead of a silent retarget and a
// contradicted manifest reads "inspect the hold" instead of quietly becoming a new lie.
//
// Ownership: data-layer kernel only — pure functions over a plain serializable book. The scanner
// owns when observations are filed (`_noteClue`) and what the player is told (`record.detail`,
// `ui:setCourse`); this module owns the memory: duplicate suppression, stale/contradicted
// revision, the history tail, and the subject cap.
//
// Two hard rules:
//   1. Secrets never persist. `hiddenCargo`/`truth` on an observation describe the real hold —
//      they may steer the caller's wording but are never copied into the book, and an observation
//      whose persisted text contains them is rejected outright.
//   2. No verdict ever reads as fabrication. History statuses are 'stale' or 'contradicted' —
//      'fabricated' (or anything unknown) normalizes to 'contradicted', because a stale fix is a
//      fact about movement, not an accusation of lying.

export const CLUE_SUBJECT_CAP = 24;   // the board holds a bounded set of leads
export const CLUE_HISTORY_CAP = 4;    // each lead keeps its last few superseded readings

// A re-read within this distance of the filed fix is the same observation, not a move.
export const CLUE_STALE_DISTANCE_WU = 48;

const CLUE_HISTORY_STATUSES = new Set(['stale', 'contradicted']);

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cluePos(pos) {
  const x = Number(pos && pos.x);
  const z = Number(pos && pos.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function sameFix(a, b) {
  if (!a || !b) return false;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz <= CLUE_STALE_DISTANCE_WU * CLUE_STALE_DISTANCE_WU;
}

function secretStrings(obs) {
  const out = [];
  const hidden = obs && obs.hiddenCargo;
  if (typeof hidden === 'string') out.push(hidden);
  else if (hidden && typeof hidden === 'object' && typeof hidden.id === 'string') out.push(hidden.id);
  if (typeof obs.truth === 'string') out.push(obs.truth);
  return out.filter((s) => s.length > 0);
}

function leaksSecret(obs, persistedTexts) {
  for (const secret of secretStrings(obs)) {
    for (const text of persistedTexts) {
      if (text && text.includes(secret)) return true;
    }
  }
  return false;
}

function sanitizeHistoryStatus(status) {
  // 'fabricated' is the banned verdict — a superseded reading is stale or contradicted, never a lie.
  return CLUE_HISTORY_STATUSES.has(status) ? status : 'contradicted';
}

function routeFor(kind, relation, pos) {
  const route = { action: 'approach', pos: pos ? { ...pos } : null, reason: null };
  if (relation === 'contradicted') {
    if (kind === 'access') {
      route.action = 'hold';
      route.reason = 'Contradicted reading — hold until the access settles.';
    } else {
      route.action = 'inspect';
      route.reason = 'Contradicted reading — inspect the hold directly.';
    }
    return route;
  }
  if (relation === 'stale') {
    if (kind === 'shipment') {
      route.action = 'intercept';
      route.reason = 'Stale fix — intercept the last sighting on this bearing.';
    } else {
      route.action = 'approach';
      route.reason = 'Stale fix — approach the last sighting.';
    }
    return route;
  }
  if (kind === 'shipment') {
    route.action = 'intercept';
    route.reason = 'Intercept the shipment on this bearing';
  } else {
    route.reason = 'Approach and see for yourself';
  }
  return route;
}

function playerLineFor(relation) {
  if (relation === 'stale') return 'The earlier fix went stale — the reading moved.';
  if (relation === 'contradicted') return 'A later reading contradicts the first claim.';
  return null;
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const claim = cleanText(entry.claim);
  if (!claim) return null;
  const out = {
    claim,
    status: sanitizeHistoryStatus(entry.status),
    at: Number.isFinite(Number(entry.at)) ? Number(entry.at) : 0,
    pos: cluePos(entry.pos),
  };
  if (Number.isFinite(Number(entry.confidence))) out.confidence = Number(entry.confidence);
  return out;
}

/**
 * Result snapshots are copies, not live subject references — a caller that files a clue and then
 * revises it later must still hold the reading it was handed, not the mutated latest state.
 */
function snapshotSubject(subject) {
  if (!subject || typeof subject !== 'object') return null;
  const out = {
    ...subject,
    pos: subject.pos ? { ...subject.pos } : null,
    history: (Array.isArray(subject.history) ? subject.history : [])
      .map((h) => (h && typeof h === 'object' ? { ...h, pos: h.pos ? { ...h.pos } : null } : h)),
  };
  if (subject.route && typeof subject.route === 'object') {
    out.route = { ...subject.route, pos: subject.route.pos ? { ...subject.route.pos } : null };
  }
  return out;
}

function normalizeSubject(subjectId, subject) {
  if (!subject || typeof subject !== 'object') return null;
  const claim = cleanText(subject.claim);
  if (!claim) return null;
  const history = (Array.isArray(subject.history) ? subject.history : [])
    .map(normalizeHistoryEntry)
    .filter(Boolean)
    .slice(-CLUE_HISTORY_CAP);
  const out = {
    subjectId,
    kind: cleanText(subject.kind) || 'shipment',
    claim,
    observedAt: Number.isFinite(Number(subject.observedAt)) ? Number(subject.observedAt) : 0,
    pos: cluePos(subject.pos),
    history,
  };
  const reading = cleanText(subject.reading);
  if (reading) out.reading = reading;
  const route = subject.route;
  if (route && typeof route === 'object') {
    const action = cleanText(route.action);
    const reason = cleanText(route.reason);
    out.route = {
      action: action || 'approach',
      pos: cluePos(route.pos),
      reason,
    };
    const label = cleanText(route.label);
    if (label) out.route.label = label;
  } else {
    out.route = routeFor(out.kind, null, out.pos);
  }
  return out;
}

/** A fresh, empty memory: `{ subjects: {} }` keyed by the caller's stable subject id. */
export function emptyClueBook() {
  return { subjects: {} };
}

/** Deep-clone a book through the normalizer — safe for serialize/receipt copies. */
export function cloneClueBook(book) {
  return normalizeClueBook(book);
}

/**
 * Rebuild a book from serialized or foreign input. Repairs banned statuses, drops malformed
 * subjects, re-derives a missing route, and enforces the subject cap. Unknown/secret-side fields
 * (`hiddenCargo`, `truth`, author notes) are not carried — they were never book data.
 */
export function normalizeClueBook(source) {
  const out = { subjects: {} };
  const subjects = source && typeof source === 'object' ? source.subjects : null;
  if (!subjects || typeof subjects !== 'object' || Array.isArray(subjects)) return out;
  for (const key of Object.keys(subjects)) {
    const subject = normalizeSubject(String(key), subjects[key]);
    if (subject) out.subjects[subject.subjectId] = subject;
  }
  const ids = Object.keys(out.subjects);
  if (ids.length > CLUE_SUBJECT_CAP) {
    ids.sort((a, b) => out.subjects[a].observedAt - out.subjects[b].observedAt || (a < b ? -1 : a > b ? 1 : 0));
    for (const id of ids.slice(0, ids.length - CLUE_SUBJECT_CAP)) delete out.subjects[id];
  }
  return out;
}

/**
 * File one observation. Returns:
 *   `{ hypothesis }`                  — new subject filed (not `revised`; no history change).
 *   `{ duplicate: true, hypothesis }` — same claim at the same fix; observedAt does not move.
 *   `{ revised: true, relation, hypothesis, playerLine }` — the reading moved (stale) or the
 *       claim flipped (contradicted); the superseded reading lands on `history`.
 *   `{ rejected: true, reason }`      — malformed, secret-leaking, or over-cap observation.
 */
export function applyClueObservation(book, observation) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) return { rejected: true, reason: 'malformed' };
  if (!book.subjects || typeof book.subjects !== 'object' || Array.isArray(book.subjects)) book.subjects = {};
  const obs = observation || {};
  const subjectId = cleanText(obs.subjectId);
  const claim = cleanText(obs.claim);
  if (!subjectId || !claim) return { rejected: true, reason: 'malformed' };
  const reading = cleanText(obs.reading);
  if (leaksSecret(obs, [claim, reading])) return { rejected: true, reason: 'secret' };

  const at = Number.isFinite(Number(obs.at)) ? Number(obs.at) : 0;
  const pos = cluePos(obs.pos);
  const kind = cleanText(obs.kind) || 'shipment';
  const existing = book.subjects[subjectId];

  if (existing) {
    const sameClaim = existing.claim === claim;
    const samePos = sameFix(existing.pos, pos) || (existing.pos == null && pos == null);
    // A repeat of the standing claim at the standing fix is not a revision — a suspect manifest
    // re-scans as 'contradicted' on every pulse, and each repeat must not mint another history row.
    if (sameClaim && samePos) return { duplicate: true, hypothesis: snapshotSubject(existing) };
    const relation = cleanText(obs.relation)
      || (sameClaim ? 'stale' : 'contradicted');
    const historyStatus = sanitizeHistoryStatus(relation);
    const prior = {
      claim: existing.claim,
      status: historyStatus,
      at: existing.observedAt,
      pos: existing.pos ? { ...existing.pos } : null,
    };
    if (Number.isFinite(Number(existing.confidence))) prior.confidence = Number(existing.confidence);
    existing.history = (Array.isArray(existing.history) ? existing.history : []);
    existing.history.push(prior);
    if (existing.history.length > CLUE_HISTORY_CAP) {
      existing.history.splice(0, existing.history.length - CLUE_HISTORY_CAP);
    }
    existing.claim = claim;
    if (reading) existing.reading = reading;
    else delete existing.reading;
    existing.observedAt = at;
    existing.pos = pos;
    existing.route = routeFor(kind, relation, pos);
    existing.kind = kind;
    return {
      revised: true,
      relation: historyStatus,
      hypothesis: snapshotSubject(existing),
      playerLine: playerLineFor(historyStatus),
    };
  }

  if (Object.keys(book.subjects).length >= CLUE_SUBJECT_CAP) {
    return { rejected: true, reason: 'cap' };
  }

  const hypothesis = {
    subjectId,
    kind,
    claim,
    observedAt: at,
    pos,
    route: routeFor(kind, null, pos),
    history: [],
  };
  if (reading) hypothesis.reading = reading;
  book.subjects[subjectId] = hypothesis;
  return { hypothesis: snapshotSubject(hypothesis), playerLine: null };
}

/**
 * Translate a ship's scan reveal into a filed hold reading, or report a trusted manifest.
 * `manifestTrust:'false'` is the declared cover (a clue worth keeping — it is what a later scan
 * can contradict); `'suspect'` is the conflict reading itself; anything else is trusted traffic
 * and mints no memory.
 */
export function shipmentReadingFromReveal(reveal) {
  if (!reveal || typeof reveal !== 'object') return null;
  const trust = String(reveal.manifestTrust || '').toLowerCase();
  const hint = cleanText(reveal.cargoHint);
  if (trust === 'suspect') {
    return {
      clueKind: 'manifest',
      observedClaim: hint || 'manifest mismatch',
      observedReading: 'conflict',
      observedRelation: 'contradicted',
    };
  }
  if (trust === 'false') {
    return {
      clueKind: 'manifest',
      observedClaim: hint || 'declared cargo',
      observedReading: 'declared',
      observedRelation: null,
    };
  }
  return { clueKind: null, observedClaim: null, observedReading: 'trusted', observedRelation: null };
}
