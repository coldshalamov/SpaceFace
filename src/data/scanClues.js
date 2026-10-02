// One investigation book for scanner clues (NXB-045).
// Observations only: a later reading can mark an earlier one stale or contradicted.
// Hidden sim truth is never stored, even when a caller passes it beside the claim.

export const CLUE_HISTORY_CAP = 4;
export const CLUE_SUBJECT_CAP = 32;
export const CLUE_STALE_MOVE_WU = 80;

const HIDDEN_KEYS = Object.freeze([
  'truth', 'hidden', 'hiddenCargo', 'hiddenState', 'trueCargo', 'actualCargo', 'omniscient',
]);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function pos2(pos) {
  return { x: finite(pos && pos.x), z: finite(pos && pos.z) };
}

function claimText(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 160);
}

function hiddenBlob(input) {
  if (!input || typeof input !== 'object') return '';
  const bits = [];
  for (let i = 0; i < HIDDEN_KEYS.length; i++) {
    const value = input[HIDDEN_KEYS[i]];
    if (value == null) continue;
    bits.push(typeof value === 'string' ? value : JSON.stringify(value));
  }
  return bits.join(' ').toLowerCase();
}

function leaksHidden(claim, input) {
  const text = claimText(claim).toLowerCase();
  const secret = hiddenBlob(input);
  if (!text || secret.length < 4) return false;
  return text.includes(secret) || secret.includes(text);
}

export function emptyClueBook() {
  return { subjects: {} };
}

function routeFor(obs, relation) {
  const pos = { x: obs.pos.x, z: obs.pos.z };
  if (obs.kind === 'access' || obs.kind === 'worksite') {
    if (relation === 'contradicted') {
      return {
        pos, action: 'hold', label: 'Hold off the worksite',
        reason: 'That reading is contradicted — hold off instead of using the old access',
      };
    }
    if (relation === 'stale') {
      return {
        pos, action: 'approach', label: 'Approach the new reading',
        reason: 'Earlier access reading is stale — approach the condition that reads now',
      };
    }
    return {
      pos, action: 'approach', label: 'Approach the worksite',
      reason: 'Approach on the access reading you have',
    };
  }
  if (relation === 'contradicted') {
    return {
      pos, action: 'inspect', label: 'Inspect the contact',
      reason: 'The earlier reading is contradicted — inspect the contact instead of hauling the old lane',
    };
  }
  if (relation === 'stale') {
    return {
      pos, action: 'intercept', label: 'Intercept the new bearing',
      reason: 'Earlier bearing is stale — intercept the shipment where it reads now',
    };
  }
  return {
    pos, action: 'intercept', label: 'Intercept the shipment',
    reason: 'Intercept the shipment on this bearing',
  };
}

function playerLine(subject, relation) {
  const prior = subject.history[subject.history.length - 1];
  const earlier = prior ? prior.claim : subject.claim;
  if (relation === 'stale') {
    return `Earlier fix is stale, not a lie: you saw "${earlier}" then. It reads "${subject.claim}" now.`.slice(0, 220);
  }
  return `You still have the earlier clue ("${earlier}"). The new pulse contradicts it: "${subject.claim}".`.slice(0, 220);
}

export function projectClue(subject) {
  if (!subject) return null;
  const route = subject.route || routeFor(subject, 'confirm');
  return {
    subjectId: subject.subjectId,
    kind: subject.kind,
    confidence: subject.confidence,
    claim: subject.claim,
    reading: subject.reading || null,
    status: 'current',
    observedAt: subject.observedAt,
    pos: pos2(subject.pos),
    revised: Array.isArray(subject.history) && subject.history.length > 0,
    route: {
      pos: pos2(route.pos),
      action: route.action,
      label: route.label,
      reason: route.reason,
    },
    history: (subject.history || []).map((row) => ({
      claim: row.claim,
      pos: pos2(row.pos),
      at: finite(row.at),
      status: row.status === 'stale' ? 'stale' : 'contradicted',
      confidence: finite(row.confidence),
    })),
  };
}

function publicObservation(input) {
  if (!input || typeof input !== 'object') return null;
  const claim = claimText(input.claim);
  if (!claim || leaksHidden(claim, input)) return null;
  const subjectId = String(input.subjectId || '').trim().slice(0, 96);
  if (!subjectId) return null;
  const kind = input.kind === 'access' || input.kind === 'worksite' ? input.kind : 'shipment';
  const reading = input.reading === 'declared' || input.reading === 'trusted' || input.reading === 'conflict'
    ? input.reading
    : null;
  const relation = input.relation === 'stale' || input.relation === 'contradicted' ? input.relation : null;
  return { subjectId, kind, claim, reading, relation, pos: pos2(input.pos), at: finite(input.at) };
}

function pruneSubjects(book) {
  const ids = Object.keys(book.subjects);
  if (ids.length <= CLUE_SUBJECT_CAP) return;
  ids.sort((a, b) => {
    const at = finite(book.subjects[a] && book.subjects[a].observedAt)
      - finite(book.subjects[b] && book.subjects[b].observedAt);
    return at || a.localeCompare(b);
  });
  for (let i = 0; i < ids.length - CLUE_SUBJECT_CAP; i++) delete book.subjects[ids[i]];
}

/**
 * File one observed reading. Same claim, reading, and place do not add a row and
 * do not refresh the original time. A move marks the old fix stale. A different
 * reading marks it contradicted. Neither path uses the word fabricated, and
 * neither copies hidden cargo or other sim truth.
 */
export function applyClueObservation(book, input) {
  if (!book || typeof book !== 'object') return { revised: false, hypothesis: null, rejected: true };
  if (!book.subjects || typeof book.subjects !== 'object' || Array.isArray(book.subjects)) book.subjects = {};
  const obs = publicObservation(input);
  if (!obs) return { revised: false, hypothesis: null, rejected: true };

  let subject = book.subjects[obs.subjectId];
  if (!subject) {
    subject = {
      subjectId: obs.subjectId,
      kind: obs.kind,
      confidence: 0.56,
      claim: obs.claim,
      reading: obs.reading,
      status: 'current',
      observedAt: obs.at,
      pos: obs.pos,
      route: routeFor(obs, 'confirm'),
      history: [],
    };
    book.subjects[obs.subjectId] = subject;
    pruneSubjects(book);
    return { revised: false, hypothesis: projectClue(subject), playerLine: null, duplicate: false };
  }

  const moved = Math.hypot(obs.pos.x - subject.pos.x, obs.pos.z - subject.pos.z) >= CLUE_STALE_MOVE_WU;
  const claimChanged = obs.claim !== subject.claim;
  const readingChanged = obs.reading != null && obs.reading !== subject.reading;
  if (!moved && !claimChanged && !readingChanged) {
    return { revised: false, hypothesis: projectClue(subject), playerLine: null, duplicate: true };
  }

  const relation = (claimChanged || readingChanged)
    ? (obs.relation === 'stale' ? 'stale' : 'contradicted')
    : 'stale';
  subject.history.push({
    claim: subject.claim,
    pos: { x: subject.pos.x, z: subject.pos.z },
    at: subject.observedAt,
    status: relation,
    confidence: subject.confidence,
  });
  if (subject.history.length > CLUE_HISTORY_CAP) {
    subject.history.splice(0, subject.history.length - CLUE_HISTORY_CAP);
  }
  subject.claim = obs.claim;
  subject.reading = obs.reading != null ? obs.reading : subject.reading;
  subject.pos = obs.pos;
  subject.observedAt = obs.at;
  subject.kind = obs.kind || subject.kind;
  subject.confidence = relation === 'contradicted'
    ? Math.max(0.2, Number((subject.confidence * 0.55).toFixed(3)))
    : Math.min(0.9, Number((subject.confidence + 0.08).toFixed(3)));
  subject.status = 'current';
  subject.route = routeFor(obs, relation);
  const hypothesis = projectClue(subject);
  return { revised: true, relation, hypothesis, playerLine: playerLine(subject, relation), duplicate: false };
}

export function cloneClueBook(book) {
  const out = emptyClueBook();
  const subjects = book && book.subjects;
  if (!subjects || typeof subjects !== 'object') return out;
  for (const id of Object.keys(subjects)) {
    const row = subjects[id];
    const projected = projectClue(row);
    if (!projected) continue;
    out.subjects[projected.subjectId] = {
      subjectId: projected.subjectId,
      kind: projected.kind,
      confidence: projected.confidence,
      claim: projected.claim,
      reading: projected.reading,
      status: 'current',
      observedAt: projected.observedAt,
      pos: projected.pos,
      route: projected.route,
      history: projected.history,
    };
  }
  return out;
}

export function normalizeClueBook(data) {
  const book = emptyClueBook();
  const subjects = data && data.subjects;
  if (!subjects || typeof subjects !== 'object' || Array.isArray(subjects)) return book;
  const ids = Object.keys(subjects).sort();
  for (let i = 0; i < ids.length; i++) {
    const row = subjects[ids[i]];
    if (!row || typeof row !== 'object') continue;
    if (leaksHidden(row.claim, row)) continue;
    const claim = claimText(row.claim);
    const subjectId = String(row.subjectId || ids[i]).trim().slice(0, 96);
    if (!claim || !subjectId) continue;
    const history = [];
    const sourceHistory = Array.isArray(row.history) ? row.history : [];
    for (let h = 0; h < sourceHistory.length && history.length < CLUE_HISTORY_CAP; h++) {
      const prior = sourceHistory[h];
      const priorClaim = claimText(prior && prior.claim);
      if (!priorClaim || leaksHidden(priorClaim, prior)) continue;
      history.push({
        claim: priorClaim,
        pos: pos2(prior && prior.pos),
        at: finite(prior && prior.at),
        status: prior && prior.status === 'stale' ? 'stale' : 'contradicted',
        confidence: finite(prior && prior.confidence),
      });
    }
    book.subjects[subjectId] = {
      subjectId,
      kind: row.kind === 'access' || row.kind === 'worksite' ? row.kind : 'shipment',
      confidence: finite(row.confidence, 0.56),
      claim,
      reading: row.reading === 'declared' || row.reading === 'trusted' || row.reading === 'conflict' ? row.reading : null,
      status: 'current',
      observedAt: finite(row.observedAt),
      pos: pos2(row.pos),
      route: routeFor({
        kind: row.kind, pos: pos2(row.route && row.route.pos || row.pos),
      }, history.length ? (history[history.length - 1].status) : 'confirm'),
      history,
    };
    if (row.route && row.route.reason) {
      book.subjects[subjectId].route = {
        pos: pos2(row.route.pos || row.pos),
        action: claimText(row.route.action).slice(0, 24) || 'intercept',
        label: claimText(row.route.label) || 'Clue',
        reason: claimText(row.route.reason),
      };
    }
  }
  pruneSubjects(book);
  return book;
}

/** Public hold line from a ship scan reveal. Null when the pulse did not name a hold. */
export function shipmentReadingFromReveal(reveal) {
  if (!reveal || typeof reveal !== 'object') return null;
  const trust = reveal.manifestTrust;
  if (trust !== 'false' && trust !== 'suspect' && trust !== 'trusted') return null;
  const hint = reveal.cargoHint != null ? claimText(reveal.cargoHint) : '';
  if (!hint && trust !== 'suspect') return null;
  const reading = trust === 'suspect' ? 'conflict' : trust === 'false' ? 'declared' : 'trusted';
  return {
    observedClaim: hint || 'manifest mismatch',
    observedReading: reading,
    observedRelation: reading === 'conflict' ? 'contradicted' : null,
    clueKind: 'shipment',
  };
}
