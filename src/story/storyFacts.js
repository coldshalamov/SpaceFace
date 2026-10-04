// Story memory the chronicle can cite. One clock: atS is state.simTime, never wall time.
// The story owner writes these rows. They do not choose beats, pay, or cargo.

const FACT_CAP = 64;

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function oneFact(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = clean(raw.id).slice(0, 96);
  const kind = clean(raw.kind).slice(0, 32);
  if (!id || !kind) return null;
  const atS = Number(raw.atS);
  const beat = Number(raw.beat);
  return {
    id,
    kind,
    atS: Number.isFinite(atS) && atS >= 0 ? atS : 0,
    beat: Number.isFinite(beat) ? Math.max(0, Math.floor(beat)) : 0,
    text: clean(raw.text).slice(0, 180),
    citation: clean(raw.citation).slice(0, 120),
  };
}

export function normalizeStoryFacts(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    const fact = oneFact(row);
    if (!fact || seen.has(fact.id)) continue;
    seen.add(fact.id);
    out.push(fact);
    if (out.length >= FACT_CAP) break;
  }
  return out;
}

/** Insert once. A second call with the same id returns the existing row and does not move atS. */
export function recordStoryFact(story, draft, simTime) {
  if (!story || typeof story !== 'object') return null;
  const facts = normalizeStoryFacts(story.facts);
  story.facts = facts;
  const id = clean(draft && draft.id).slice(0, 96);
  const kind = clean(draft && draft.kind).slice(0, 32);
  if (!id || !kind) return null;
  const existing = facts.find((row) => row.id === id);
  if (existing) return existing;
  const atS = Number(simTime);
  const fact = oneFact({
    id,
    kind,
    atS: Number.isFinite(atS) && atS >= 0 ? atS : 0,
    beat: draft.beat,
    text: draft.text,
    citation: draft.citation || `${kind}:${id}@${Math.floor(Number.isFinite(atS) ? atS : 0)}`,
  });
  if (!fact) return null;
  facts.push(fact);
  if (facts.length > FACT_CAP) facts.splice(0, facts.length - FACT_CAP);
  return fact;
}

export function recallStoryFact(story, id) {
  const fact = normalizeStoryFacts(story && story.facts).find((row) => row.id === id);
  if (!fact) return null;
  return fact.citation ? `${fact.text} (${fact.citation})` : fact.text;
}

/**
 * Career decisions share the story fact list.
 * Offered then declined is one row — the road not taken — not two.
 */
export function recordCareerDecision(story, kind, payload, simTime, beat) {
  const careerId = clean(payload && (payload.careerId || payload.career || payload.id)).slice(0, 48);
  if (!careerId) return null;
  const stepId = clean(payload && (payload.stepId || payload.step)).slice(0, 48);
  const atS = Number.isFinite(Number(simTime)) && Number(simTime) >= 0 ? Number(simTime) : 0;
  const beatN = Number.isFinite(Number(beat)) ? Math.floor(Number(beat)) : 0;
  if (kind === 'declined') {
    const facts = normalizeStoryFacts(story.facts);
    story.facts = facts;
    const id = `career:${careerId}:road`;
    const fact = {
      id,
      kind: 'career',
      atS,
      beat: beatN,
      text: `${careerId} was offered and declined`,
      citation: `career:${careerId}:declined@${Math.floor(atS)}`,
    };
    const idx = facts.findIndex((row) => row.id === id);
    if (idx >= 0) facts[idx] = fact;
    else facts.push(fact);
    return fact;
  }
  if (kind === 'offered') {
    return recordStoryFact(story, {
      id: `career:${careerId}:road`,
      kind: 'career',
      beat: beatN,
      text: `${careerId} was offered`,
      citation: `career:${careerId}:offered@${Math.floor(atS)}`,
    }, atS);
  }
  if (kind === 'chosen') {
    return recordStoryFact(story, {
      id: `career:${careerId}:chosen`,
      kind: 'career',
      beat: beatN,
      text: `${careerId} was chosen`,
      citation: `career:${careerId}:chosen@${Math.floor(atS)}`,
    }, atS);
  }
  if (kind === 'ladder') {
    if (!stepId) return null;
    return recordStoryFact(story, {
      id: `career:${careerId}:${stepId}`,
      kind: 'career',
      beat: beatN,
      text: `${careerId} finished ${stepId}`,
      citation: `career:${careerId}:${stepId}@${Math.floor(atS)}`,
    }, atS);
  }
  if (kind === 'abandoned') {
    // Taken up, then let go — the ledger keeps that too.
    return recordStoryFact(story, {
      id: `career:${careerId}:abandoned`,
      kind: 'career',
      beat: beatN,
      text: `${careerId} was taken up and later let go`,
      citation: `career:${careerId}:abandoned@${Math.floor(atS)}`,
    }, atS);
  }
  if (kind === 'completed') {
    return recordStoryFact(story, {
      id: `career:${careerId}:complete`,
      kind: 'career',
      beat: beatN,
      text: `${careerId} ladder was finished`,
      citation: `career:${careerId}:complete@${Math.floor(atS)}`,
    }, atS);
  }
  if (kind === 'recovered') {
    if (!stepId) return null;
    return recordStoryFact(story, {
      id: `career:${careerId}:${stepId}:recovered`,
      kind: 'career',
      beat: beatN,
      text: `${careerId} recovered ${stepId} after a failure`,
      citation: `career:${careerId}:${stepId}:recovered@${Math.floor(atS)}`,
    }, atS);
  }
  if (kind === 'choice') {
    const choiceId = clean(payload && (payload.choiceId || payload.choice)).slice(0, 48);
    if (!stepId && !choiceId) return null;
    return recordStoryFact(story, {
      id: `career:${careerId}:${stepId || 'run'}:${choiceId || 'choice'}`,
      kind: 'career',
      beat: beatN,
      text: `${careerId} chose ${choiceId || 'a path'}${stepId ? ` in ${stepId}` : ''}`,
      citation: `career:${careerId}:choice:${choiceId || stepId}@${Math.floor(atS)}`,
    }, atS);
  }
  return null;
}
